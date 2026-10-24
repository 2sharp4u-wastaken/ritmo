// Microphone setup and calibration flow (first run, new surface, or from the parents' area).
import { audio, measureNoise, loopbackLatency, tapLatency, measureClickBleed } from './audio.js';
import { render, coachHTML, say, $, sleep, esc, mood, toast } from './ui.js';
import * as store from './store.js';

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function micErrorHTML(reason) {
  const msg = {
    denied: 'הגישה למיקרופון נחסמה. פתחו את הגדרות האתר בדפדפן (סמל המנעול ליד הכתובת), אפשרו "מיקרופון" ורעננו את הדף.',
    insecure: 'הדפדפן מאפשר מיקרופון רק באתר מאובטח (https) או ב-localhost. פתחו את האפליקציה מהכתובת המאובטחת שלה.',
    unsupported: 'הדפדפן הזה לא תומך בהקלטה. נסו Chrome, Safari או Edge מעודכנים.',
    nodevice: 'לא נמצא מיקרופון. בדקו שהמכשיר מחובר ושאף אפליקציה אחרת לא משתמשת בו.',
    worklet: 'הדפדפן לא הצליח לטעון את מנוע ההאזנה. נסו לעדכן את הדפדפן.',
  }[reason] || 'משהו השתבש עם המיקרופון.';
  return `<div class="notice err"><b>להורים:</b> ${esc(msg)}</div>`;
}

export async function ensureMic() {
  const r = await audio.startMic();
  return r;
}

export function applyCalib(p) {
  audio.setProfile(p.settings.surface);
  audio.setVolume(p.settings.volume ?? 0.9);
  const c = store.calib(p);
  audio.config({ filter: audio.profile.filter, threshold: c ? c.threshold : 0.02, enabled: true, meter: true });
}

function meterUI(thr) {
  return `<div class="meter" id="meter"><i id="meterFill"></i>${thr ? `<span class="thr" style="left:${Math.min(98, thr)}%"></span>` : ''}</div>`;
}
function bindMeter(scale) {
  const fill = $('#meterFill');
  return audio.onMeter(m => { if (fill) fill.style.width = Math.min(100, (m.level / scale) * 100) + '%'; });
}
const shell = (inner) => render(`
  <div class="row"><h2 class="grow">כיול המיקרופון</h2></div>
  ${coachHTML('')}
  <div class="card col" id="calBody">${inner}</div>`);

// Full calibration. Returns true when saved.
export async function calibrationFlow(p, { fromParents = false } = {}) {
  const surf = p.settings.surface, isPad = surf === 'pad';
  shell(`<p>הניחו את הטלפון או המחשב על השולחן, בערך מטר מה${isPad ? 'פד' : 'כרית'}, במקום שקט.</p>
    <p class="muted small">${p.settings.headphones ? 'אוזניות מחוברות: נכייל עם תיפוף יחד עם הטיק.' : 'בלי אוזניות: הרמקול צריך להיות פתוח בעוצמה בינונית.'}</p>
    <button class="btn primary" id="go">מתחילים</button>`);
  say(`עכשיו אני לומד איך נשמע ה${isPad ? 'פד' : 'כרית'} שלך. זה לוקח דקה.`);
  await new Promise(r => $('#go').onclick = r);
  const mic = await ensureMic();
  if (!mic.ok) { $('#calBody').innerHTML = micErrorHTML(mic.reason) + `<button class="btn" id="retry">נסו שוב</button>`; say('אני לא שומע את המיקרופון. בקש עזרה מאבא או אמא.'); await new Promise(r => $('#retry').onclick = r); return calibrationFlow(p, { fromParents }); }
  audio.setProfile(surf);

  // 1. silence
  $('#calBody').innerHTML = `<h3>שלב 1: שקט</h3><p>לא מתופפים. רק מקשיבים לשקט.</p>${meterUI()}`;
  await say('שלב ראשון: שקט לגמרי, אני מקשיב לחדר.');
  const offM = bindMeter(0.05);
  const noise = await measureNoise(2200);

  // 2. strokes
  let thr0 = Math.max(noise.p90 * 3, 0.003), peaks = [];
  for (let attempt = 0; attempt < 3 && peaks.length < 5; attempt++) {
    $('#calBody').innerHTML = `<h3>שלב 2: שמונה מכות</h3><p>תכה 8 מכות רגילות, לאט, אחת אחרי השנייה. כמו שאתה מתופף בדרך כלל.</p>
      <div class="hitdots" id="dots">${'<span></span>'.repeat(8)}</div>${meterUI()}`;
    const offA = bindMeter(0.25);
    await say(attempt ? 'בוא ננסה שוב. שמונה מכות, קצת יותר חזק.' : 'שלב שני: תכה שמונה מכות רגילות, לאט.');
    audio.config({ filter: audio.profile.filter, threshold: thr0, refractory: 0.15, enabled: true });
    peaks = [];
    await new Promise(res => {
      const off = audio.onOnset(o => { peaks.push(o.peak); const d = $('#dots'); if (d && d.children[peaks.length - 1]) d.children[peaks.length - 1].classList.add('on'); if (peaks.length >= 8) { off(); clearTimeout(to); setTimeout(res, 300); } });
      const to = setTimeout(() => { off(); res(); }, 14000);
    });
    offA();
    if (peaks.length < 5) thr0 *= 0.5;
  }
  offM();
  if (peaks.length < 5) {
    $('#calBody').innerHTML = `<div class="notice err">לא הצלחתי לשמוע מספיק מכות. נסו לקרב את המכשיר, לבדוק שהמיקרופון לא מכוסה, או לעבור ל${isPad ? 'פד' : 'משטח'} אחר.</div><button class="btn" id="retry">נסו שוב</button>`;
    await say('לא שמעתי מספיק מכות. בוא ננסה שוב.');
    await new Promise(r => $('#retry').onclick = r); return calibrationFlow(p, { fromParents });
  }
  const mp = med(peaks);
  const threshold = Math.max(noise.p90 * 2.5, mp * 0.22, 0.002);
  const quiet = mp < noise.p90 * 4;

  // 3. latency
  let latency = null, method = 'loopback';
  if (!p.settings.headphones) {
    $('#calBody').innerHTML = `<h3>שלב 3: כיוון זמנים</h3><p>שקט רגע. אני משמיע כמה צלילים ומקשיב לעצמי.</p>`;
    await say('שלב שלישי: שקט רגע, אני מקשיב לעצמי.');
    latency = await loopbackLatency(noise.p90);
  }
  if (latency == null) {
    method = 'tap';
    $('#calBody').innerHTML = `<h3>שלב 3: מתופפים עם הטיק</h3><p>תכה בדיוק יחד עם הטיק-טק. 16 טיקים.</p><div class="hitdots" id="dots">${'<span></span>'.repeat(16)}</div>`;
    await say('עכשיו תכה בדיוק יחד עם הטיק-טק, ששה עשר פעמים.');
    let i = 0;
    latency = await tapLatency(threshold, () => { const d = $('#dots'); if (d && d.children[i]) d.children[i++].classList.add('on'); });
    if (latency == null) { latency = 0.08; method = 'default'; toast('לא הצלחתי למדוד, השתמשתי בערך רגיל'); }
  }

  // 4. click bleed (only matters without headphones)
  let bleed = 0;
  if (!p.settings.headphones) { bleed = await measureClickBleed(threshold, latency); }

  p.calib[surf] = { threshold, noise: noise.p90, hitLevel: mp, latency, bleed, method, ts: Date.now() };
  store.save();
  applyCalib(p);

  mood('cheer');
  $('#calBody').innerHTML = `<h3>הכיול הושלם ✓</h3>
    ${quiet ? '<div class="notice">המכות נשמעות חלש יחסית לרעש בחדר. מקום שקט יותר או מכשיר קרוב יותר ישפרו את הבדיקה.</div>' : ''}
    ${bleed > threshold * 2.5 ? '<div class="notice">המיקרופון שומע את הטיק-טק חזק. מומלץ אוזניות, או להנמיך את עוצמת הרמקול.</div>' : ''}
    <p class="muted small tnum">עיכוב נמדד: ${Math.round(latency * 1000)} מ"ש (${method === 'loopback' ? 'אוטומטי' : method === 'tap' ? 'לפי תיפוף' : 'ערך ברירת מחדל'})</p>
    <button class="btn primary" id="done">${fromParents ? 'חזרה' : 'המשך'}</button>`;
  say('מעולה! עכשיו אני יודע בדיוק איך אתה נשמע.', { mood: 'cheer' });
  await new Promise(r => $('#done').onclick = r);
  return true;
}
