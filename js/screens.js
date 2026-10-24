// Onboarding, profile picker, home (journey), parents' area.
import { audio } from './audio.js';
import { SKILLS, UNITS, BELTS, SKILL_BY_ID } from './curriculum.js';
import { planSession, targetOf, startOf } from './coach.js';
import { TIPS } from './grader.js';
import * as store from './store.js';
import { render, coachHTML, say, mood, $, $$, esc, toast, confirmBox, setVoice, hasHebrewVoice, stickHTML } from './ui.js';
import { calibrationFlow, ensureMic, micErrorHTML } from './calib.js';
import { runSession, STEP_ICON, STEP_NAME } from './session.js';

const AVATARS = ['🦊', '🐯', '🐼', '🦁', '🐸', '🐙', '🦖', '🐧'];

export function route() {
  const p = store.active();
  if (!store.all().length) return onboarding();
  if (!p) return picker();
  setVoice({ on: p.settings.voice, rate: p.settings.voiceRate });
  audio.setVolume(p.settings.volume ?? 0.9);
  if (!p.onboarded) return onboarding(p);
  home();
}

// ---------- profile picker ----------
function picker() {
  render(`${coachHTML('מי מתופף היום?', true)}
    <div class="choice">${store.all().map(p => `<button data-id="${p.id}"><span class="em">${p.avatar}</span>${esc(p.name)}<small>${esc(BELTS[store.beltIndex(p)].name)}</small></button>`).join('')}
      <button data-new="1"><span class="em">➕</span>מתופף חדש</button></div>`);
  $$('[data-id]').forEach(b => b.onclick = () => { store.setActive(b.dataset.id); route(); });
  $('[data-new]').onclick = () => onboarding();
}

// ---------- onboarding ----------
async function onboarding(existing, backTo = null) {
  wizardCancel(store.all().some(x => x.onboarded && x.id !== existing?.id), backTo);
  const draft = existing ? null : { name: '', avatar: AVATARS[0], surface: 'pad', headphones: false };
  // 1. hello (first gesture unlocks audio and speech)
  if (!existing) {
    render(`${coachHTML('שלום! אני ריתמו, המאמן שלך לתיפוף.', true)}
      <div class="card col center"><h1>ריתמו</h1><p>מאמן תיפוף שמקשיב לך, בודק אותך ומלמד צעד אחר צעד עד הפרדידל.</p>
      <div class="row" style="justify-content:center"><button class="btn primary huge" id="hi">שלום ריתמו! 👋</button></div></div>`);
    await new Promise(r => $('#hi').onclick = r);
    await audio.init();
    say('שלום! אני ריתמו, המאמן שלך. נעים להכיר!', { mood: 'cheer' });
    // 2. name + avatar
    render(`${coachHTML('איך קוראים לך?')}
      <div class="card col"><label for="nm"><h3>השם שלך</h3></label><input id="nm" class="field" maxlength="14" autocomplete="off" placeholder="השם שלך">
      <h3>בחר דמות</h3><div class="avatars">${AVATARS.map((a, i) => `<button data-av="${a}" class="${i ? '' : 'sel'}" aria-label="דמות ${i + 1}">${a}</button>`).join('')}</div>
      <div><button class="btn primary" id="next" disabled>הלאה</button></div></div>`);
    say('איך קוראים לך? ותבחר דמות.');
    const nm = $('#nm'); nm.focus();
    nm.oninput = () => { $('#next').disabled = !nm.value.trim(); };
    $$('[data-av]').forEach(b => b.onclick = () => { $$('[data-av]').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); draft.avatar = b.dataset.av; });
    await new Promise(r => $('#next').onclick = r);
    draft.name = nm.value.trim();
    // 3. surface
    draft.surface = await choose(`על מה אתה מתופף, ${draft.name}?`, [
      ['pad', '🥁', 'פד אימון', 'המקל קופץ בחזרה'],
      ['pillow', '🛋️', 'כרית או ספר', 'המקל לא קופץ, מחזק ידיים'],
    ], 'על מה אתה מתופף?');
    // 4. headphones
    draft.headphones = (await choose('יש אוזניות?', [
      ['no', '🔈', 'בלי אוזניות', 'הטיק-טק מהרמקול'],
      ['yes', '🎧', 'עם אוזניות', 'מדויק יותר, מומלץ'],
    ], 'יש לך אוזניות? עם אוזניות אני שומע אותך יותר טוב.')) === 'yes';
    existing = store.create(draft.name, draft.avatar);
    existing.settings.surface = draft.surface; existing.settings.headphones = draft.headphones; store.save();
  }
  const p = existing;
  // 5. parents: microphone
  render(`${coachHTML('עכשיו צריך עזרה קטנה מאבא או אמא.')}
    <div class="card col"><h3>להורים: גישה למיקרופון</h3>
    <p>ריתמו מקשיב למכות דרך המיקרופון כדי לבדוק דיוק, יציבות ועוצמה. הצליל מעובד רק במכשיר הזה ולא נשמר או נשלח לשום מקום.</p>
    <p class="muted small">הדפדפן יבקש אישור. אחר כך נעשה כיול קצר של דקה.</p>
    <div id="micErr"></div><div><button class="btn primary" id="mic">אפשר מיקרופון</button></div></div>`);
  say('עכשיו צריך עזרה קטנה מאבא או אמא, כדי שאוכל לשמוע אותך.');
  for (;;) {
    await new Promise(r => $('#mic').onclick = r);
    const r = await ensureMic();
    if (r.ok) break;
    $('#micErr').innerHTML = micErrorHTML(r.reason);
  }
  await calibrationFlow(p);
  p.onboarded = true; store.save(); wizardCancel(false);
  render(`${coachHTML('', true)}<div class="card col center"><h2>מוכנים!</h2><p>כל יום אימון קצר. אני מחליט מה לתרגל, ואתה רק מתופף.</p>
    <div class="row" style="justify-content:center"><button class="btn primary huge" id="go">לאימון הראשון</button></div></div>`);
  say(`מוכנים, ${p.name}! כל יום אימון קצר. אני מחליט מה מתרגלים, ואתה רק מתופף.`, { mood: 'cheer' });
  await new Promise(r => $('#go').onclick = r);
  runSession(p, home);
}
// The wizard's ✕ button, shown only when there's another drummer to go back to. It sits outside #app so the
// calibration screens keep it too, and it reloads so the mic and any calibration step still running stop.
function wizardCancel(on, backTo) {
  const b = $('#wizCancel'); b.hidden = !on; document.body.classList.toggle('wiz', on);
  b.onclick = () => { const p = store.active(); if (p && !p.onboarded) store.remove(p.id); store.setActive(backTo); location.reload(); };
}
function choose(title, opts, line) {
  render(`${coachHTML(title)}<div class="choice">${opts.map(([v, em, t, s]) => `<button data-v="${v}"><span class="em">${em}</span>${t}<small>${s}</small></button>`).join('')}</div>`);
  say(line);
  return new Promise(res => $$('[data-v]').forEach(b => b.onclick = () => res(b.dataset.v)));
}

// ---------- home ----------
export function home() {
  const p = store.active(); if (!p) return route();
  const plan = planSession(p), belt = BELTS[store.beltIndex(p)], cur = store.allDone(p) ? null : store.currentSkill(p);
  const today = p.lastSessionDay === store.dayKey();
  const items = plan.filter(s => !['greet', 'miccheck', 'summary'].includes(s.type));
  const est = Math.max(3, Math.round(p.settings.sessionMin));
  const st = cur ? store.skillState(p, cur.id) : null;
  const line = !cur ? `אתה חגורה שחורה, ${p.name}! עכשיו שומרים על הכושר.` :
    today ? `כבר התאמנת היום, ${p.name}. רוצה עוד אימון?` :
    st.rounds === 0 ? `היי ${p.name}! היום מתחילים משהו חדש: ${cur.title}.` :
    `היי ${p.name}! ממשיכים עם ${cur.title}. אתה ב-${st.bpm || startOf(p, cur)} מתוך ${targetOf(p, cur)}.`;
  render(`
    <div class="topbar">
      <button class="avatar" id="who" aria-label="החלפת מתופף">${p.avatar}</button>
      <div class="grow"><h3>${esc(p.name)}</h3><span class="belt" style="background:${belt.color};color:${belt.ink}"><i style="background:${belt.color}"></i>${esc(belt.name)}</span></div>
      <span class="chip" title="נקודות">⭐ ${p.xp}</span>
      <span class="chip" title="ימים ברצף">🔥 ${store.streakAlive(p)}</span>
    </div>
    ${coachHTML(line, true)}
    <div class="card col">
      <div class="row"><h2 class="grow">${today ? 'עוד אימון?' : 'האימון של היום'}</h2><span class="muted small">כ-${est} דקות</span></div>
      <div class="plan">${items.map((s, k) => `${k ? '<span class="dash"></span>' : ''}<div class="st"><span class="ic">${STEP_ICON[s.type]}</span>${STEP_NAME[s.type]}</div>`).join('')}</div>
      <div class="row" style="justify-content:center"><button class="btn primary huge" id="start">${today ? 'עוד אימון' : 'התחל אימון'} ▶</button></div>
    </div>
    <div class="journey">
      <h2>המסלול שלי</h2>
      ${UNITS.map(u => {
        const list = SKILLS.filter(s => s.unit === u.id), b = BELTS[u.belt];
        return `<div class="unit"><h3><span class="belt" style="background:${b.color};color:${b.ink};padding:2px 10px"><i style="background:${b.color};width:18px;height:8px"></i></span>${esc(u.title)}</h3>
          <div class="nodes">${list.map(s => {
            const ss = store.skillState(p, s.id), i = SKILLS.indexOf(s), state = ss.mastered ? 'done' : i === p.skillIdx ? 'now' : 'locked';
            return `<div class="node ${state}"><span class="dot">${ss.mastered ? '✓' : state === 'now' ? '▶' : '🔒'}</span><div class="grow"><div class="t">${esc(s.title)}</div><div class="s">${stickHTML(s.pattern)}</div></div></div>`;
          }).join('')}</div></div>`;
      }).join('')}
    </div>
    <div class="row" style="justify-content:center"><button class="btn quiet" id="parents">👪 אזור הורים</button></div>`);
  say(line);
  $('#start').onclick = async () => { await audio.init(); runSession(p, home); };
  $('#parents').onclick = () => parentGate();
  $('#who').onclick = () => { store.setActive(null); picker(); };
}

// ---------- parents ----------
function parentGate() {
  const a = 6 + Math.floor(Math.random() * 7), b = 12 + Math.floor(Math.random() * 8);
  render(`<div class="card col"><h2>אזור הורים</h2><p>כדי להיכנס: כמה זה ${a} × ${b}?</p>
    <input class="field tnum" id="ans" inputmode="numeric" autocomplete="off" aria-label="תשובה">
    <div class="row"><button class="btn primary" id="ok">כניסה</button><button class="btn" id="back">חזרה</button></div><p class="muted small" id="msg"></p></div>`);
  $('#ans').focus();
  const go = () => { if (+$('#ans').value === a * b) parents('overview'); else $('#msg').textContent = 'לא נכון, נסו שוב.'; };
  $('#ok').onclick = go; $('#ans').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#back').onclick = home;
}

const WEAK_TXT = {
  miss: 'מדלג על מכות', extra: 'מכות מיותרות (המקל קופץ)', rush: 'נוטה למהר לפני הטיק', drag: 'נוטה לאחר אחרי הטיק', unsteady: 'קצב לא יציב',
  double: 'המכה השנייה בדאבל חלשה', leftWeak: 'יד שמאל חלשה מימין', rightWeak: 'יד ימין חלשה משמאל', accent: 'אקצנט לא בולט', uneven: 'עוצמה לא אחידה',
};

function parents(tab) {
  const p = store.active();
  render(`
    <div class="row"><button class="iconbtn" id="back" aria-label="חזרה">→</button><h2 class="grow">אזור הורים · ${esc(p.name)}</h2></div>
    <div class="ptabs" role="tablist">${[['overview', 'סקירה'], ['skills', 'מיומנויות'], ['history', 'היסטוריה'], ['settings', 'הגדרות'], ['about', 'איך זה עובד']].map(([k, t]) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}" role="tab" aria-selected="${k === tab}">${t}</button>`).join('')}</div>
    <div id="pbody" class="col"></div>`);
  $('#back').onclick = home;
  $$('[data-tab]').forEach(b => b.onclick = () => parents(b.dataset.tab));
  ({ overview, skills, history, settings, about }[tab])(p, $('#pbody'));
}

function overview(p, el) {
  const cur = store.allDone(p) ? null : store.currentSkill(p), st = cur && store.skillState(p, cur.id);
  const totalSec = Object.values(p.days).reduce((a, b) => a + b, 0);
  const last = p.rounds.slice(-20), avg = last.length ? Math.round(last.reduce((a, r) => a + r.score, 0) / last.length) : 0;
  const weak = Object.entries(p.weakTally).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  el.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>שלב נוכחי</span><b style="font-size:20px">${cur ? esc(cur.title) : 'סיים את המסלול'}</b><span>${cur ? `מהירות ${st.bpm || startOf(p, cur)} מתוך ${targetOf(p, cur)}` : ''}</span></div>
      <div class="kpi"><span>חגורה</span><b style="font-size:20px">${esc(BELTS[store.beltIndex(p)].name)}</b><span>${SKILLS.filter(s => store.skillState(p, s.id).mastered).length} מתוך ${SKILLS.length} שלבים</span></div>
      <div class="kpi"><span>זמן תרגול כולל</span><b>${Math.round(totalSec / 60)} דק׳</b><span>${p.sessions.length} אימונים · רצף ${store.streakAlive(p)}</span></div>
      <div class="kpi"><span>ציון ממוצע (20 אחרונים)</span><b>${avg || '—'}</b><span>${p.rounds.length} סיבובים</span></div>
    </div>
    <div class="card col"><h3>ציון לכל סיבוב</h3><canvas class="chart" id="c1"></canvas><p class="muted small">קו מקווקו: ציון 80, הסף להעלאת מהירות. נקודות כתומות הן מבחנים.</p></div>
    <div class="card col"><h3>דקות תרגול ב-14 הימים האחרונים</h3><canvas class="chart" id="c2" style="height:150px"></canvas></div>
    <div class="card col"><h3>על מה כדאי לשים לב</h3>
      ${weak.length ? weak.map(([k]) => `<div class="setrow"><span class="lbl"><b>${WEAK_TXT[k]}</b><br><span class="muted small">${esc(TIPS[k].say)}</span></span></div>`).join('') : '<p class="muted">עוד אין מספיק נתונים. אחרי כמה אימונים יופיעו כאן הדפוסים שחוזרים.</p>'}
      <p class="muted small">המאמן מכניס תרגיל ממוקד לאימון כשחולשה חוזרת על עצמה.</p></div>`;
  scoreChart($('#c1'), p.rounds.slice(-50));
  daysChart($('#c2'), p);
}

function skills(p, el) {
  el.innerHTML = `<div class="card scroll"><table class="tbl"><thead><tr><th>שלב</th><th>מצב</th><th>מהירות</th><th>יעד</th><th>סיבובים</th><th>מבחנים</th></tr></thead><tbody>
    ${SKILLS.map((s, i) => { const ss = store.skillState(p, s.id), state = ss.mastered ? '<span class="pill ok">הושלם</span>' : i === p.skillIdx ? '<span class="pill now">עכשיו</span>' : '<span class="pill lock">נעול</span>';
      return `<tr><td><b>${esc(s.title)}</b><br><span class="muted small" style="direction:ltr;display:inline-block">${stickHTML(s.pattern)}</span></td><td>${state}</td><td class="tnum">${ss.bpm || (ss.mastered ? targetOf(p, s) : '—')}</td><td class="tnum">${targetOf(p, s)}</td><td class="tnum">${ss.rounds}</td><td class="tnum">${ss.tests.length ? ss.tests.map(t => t.pass ? '✓' : '✗').join(' ') : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="card col"><h3>שינוי שלב ידני</h3><p class="muted small">המאמן מתקדם לבד לפי מבחנים. השתמשו בזה רק אם המורה כבר לימד שלב, או אם הילד צריך לחזור אחורה.</p>
      <div class="row"><button class="btn" id="prev">שלב אחורה</button><button class="btn" id="skip">דלג לשלב הבא</button></div></div>`;
  $('#skip').onclick = async () => {
    if (store.allDone(p)) return;
    const s = store.currentSkill(p);
    if (!await confirmBox(`לסמן את "${s.title}" כהושלם ולעבור לשלב הבא?`, 'כן, לדלג')) return;
    const ss = store.skillState(p, s.id); ss.mastered = true; ss.masteredTs = Date.now(); ss.strength = 0.7; ss.lastTs = Date.now(); p.skillIdx++; store.save(); parents('skills');
  };
  $('#prev').onclick = async () => {
    if (p.skillIdx === 0) return;
    const s = SKILLS[p.skillIdx - 1];
    if (!await confirmBox(`לחזור לשלב "${s.title}"? הוא יסומן כלא הושלם.`, 'כן, לחזור')) return;
    p.skillIdx--; const ss = store.skillState(p, s.id); ss.mastered = false; ss.recent = []; store.save(); parents('skills');
  };
}

function history(p, el) {
  const ss = [...p.sessions].reverse().slice(0, 40);
  el.innerHTML = `<div class="card scroll"><table class="tbl"><thead><tr><th>תאריך</th><th>דקות</th><th>סיבובים</th><th>הכי טוב</th><th>נקודות</th><th>אירועים</th></tr></thead><tbody>
    ${ss.length ? ss.map(s => `<tr><td>${new Date(s.ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} ${new Date(s.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</td><td class="tnum">${Math.round(s.dur / 60)}</td><td class="tnum">${s.rounds}</td><td class="tnum">${s.best}</td><td class="tnum">${s.xp}</td><td>${(s.events || []).map(e => `${e.pass ? '🏅' : '✗'} ${esc(SKILL_BY_ID[e.skill]?.title || '')}`).join(', ')}${s.early ? ' (הופסק)' : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">עוד אין אימונים.</td></tr>'}
    </tbody></table></div>
    <div class="card scroll"><h3 style="margin-bottom:8px">סיבובים אחרונים</h3><table class="tbl"><thead><tr><th>שלב</th><th>סוג</th><th>מהירות</th><th>ציון</th><th>סטייה ממוצעת</th><th>הערות</th></tr></thead><tbody>
    ${[...p.rounds].reverse().slice(0, 40).map(r => `<tr><td>${esc(SKILL_BY_ID[r.skill]?.title || r.skill)}</td><td>${{ lesson: 'שיעור', test: 'מבחן', review: 'חזרה', warmup: 'חימום', remedial: 'ממוקד', challenge: 'אתגר' }[r.kind] || ''}</td><td class="tnum">${r.bpm ?? ''}</td><td class="tnum"><b>${r.score}</b></td><td class="tnum" dir="ltr">${r.meanOff != null ? (r.meanOff > 0 ? '+' : '') + Math.round(r.meanOff * 1000) + 'ms' : ''}</td><td class="small">${(r.weak || []).map(w => WEAK_TXT[w]).join(' · ')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function settings(p, el) {
  const S = p.settings, c = p.calib;
  const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(S[key]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  el.innerHTML = `
    <div class="card">
      <div class="setrow"><span class="lbl"><b>אורך אימון</b><br><span class="muted small">המאמן מתאים כמה סיבובים יהיו</span></span>${seg('sessionMin', [[5, '5 דק׳'], [10, '10'], [15, '15'], [20, '20']])}</div>
      <div class="setrow"><span class="lbl"><b>משטח</b><br><span class="muted small">משנה מסנן, טיק-טק, יעדי מהירות (כרית: 10% לאט יותר)</span></span>${seg('surface', [['pad', 'פד'], ['pillow', 'כרית / ספר']])}</div>
      <div class="setrow"><span class="lbl"><b>אוזניות</b><br><span class="muted small">עם אוזניות: צלילי עזרה בתחילת שלב, אין סינון טיק-טק</span></span>${seg('headphones', [[false, 'בלי'], [true, 'עם']])}</div>
      <div class="setrow"><span class="lbl"><b>קול המאמן</b>${hasHebrewVoice() ? '' : '<br><span class="small" style="color:var(--berry)">לא נמצא קול עברי במכשיר. הטקסט מוצג על המסך. באנדרואיד: התקינו "Google דיבור" עם עברית. באייפון זה מובנה.</span>'}</span>${seg('voice', [[true, 'פועל'], [false, 'כבוי']])}</div>
      <div class="setrow"><span class="lbl"><b>מהירות דיבור</b></span>${seg('voiceRate', [[0.85, 'איטי'], [1, 'רגיל'], [1.15, 'מהיר']])}</div>
      <div class="setrow"><span class="lbl"><b>עוצמת טיק-טק</b></span><input type="range" id="vol" min="0.2" max="1" step="0.05" value="${S.volume}" style="flex:1;min-width:150px"></div>
    </div>
    <div class="card col"><h3>כיול</h3>
      ${['pad', 'pillow'].map(k => `<p class="small">${k === 'pad' ? 'פד' : 'כרית'}: ${c[k] ? `כויל ${new Date(c[k].ts).toLocaleDateString('he-IL')} · עיכוב ${Math.round(c[k].latency * 1000)}ms` : 'לא כויל'}</p>`).join('')}
      <p class="muted small">כיילו מחדש כשמחליפים מכשיר, מקום, אוזניות (במיוחד בלוטות׳) או כשהבדיקה נראית לא מדויקת.</p>
      <div><button class="btn" id="recal">כיול מחדש (${S.surface === 'pad' ? 'פד' : 'כרית'})</button></div></div>
    <div class="card col"><h3>מתופפים</h3>
      <div class="row"><label for="rn" class="small">שם:</label><input id="rn" class="field" style="font-size:18px;max-width:220px;padding:8px 12px" value="${esc(p.name)}"><button class="btn" id="saveName">שמירה</button></div>
      <div class="row"><button class="btn" id="addKid">➕ הוספת מתופף</button><button class="btn" id="switch">החלפת מתופף</button></div></div>
    <div class="card col"><h3>גיבוי</h3><p class="muted small">ההתקדמות נשמרת בדפדפן של המכשיר הזה. לגיבוי או להעברה למכשיר אחר:</p>
      <div class="row"><button class="btn" id="exp">ייצוא קובץ</button><label class="btn" for="imp">ייבוא קובץ</label><input type="file" id="imp" accept="application/json,.json" hidden></div></div>
    <div class="card col"><h3>איפוס</h3><div class="row"><button class="btn danger" id="reset">איפוס ההתקדמות של ${esc(p.name)}</button><button class="btn quiet" id="del">מחיקת המתופף</button></div></div>`;
  $$('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
    let v = b.dataset.v; v = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
    S[sg.dataset.key] = v; store.save(); setVoice({ on: S.voice, rate: S.voiceRate }); audio.setProfile(S.surface); parents('settings');
  }));
  $('#vol').oninput = e => { S.volume = +e.target.value; audio.setVolume(S.volume); store.save(); };
  $('#recal').onclick = async () => { await audio.init(); await calibrationFlow(p, { fromParents: true }); parents('settings'); };
  $('#saveName').onclick = () => { const v = $('#rn').value.trim(); if (v) { p.name = v; store.save(); toast('נשמר'); } };
  $('#addKid').onclick = () => { store.setActive(null); onboarding(undefined, p.id); };
  $('#switch').onclick = () => { store.setActive(null); picker(); };
  $('#exp').onclick = () => { const blob = new Blob([store.exportAll()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ritmo-backup-${store.dayKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#imp').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { store.importAll(await f.text()); toast('הגיבוי נטען'); route(); } catch (err) { toast('הקובץ לא תקין'); } };
  $('#reset').onclick = async () => { if (await confirmBox(`לאפס את כל ההתקדמות של ${p.name}? הכיול וההגדרות יישמרו.`, 'לאפס')) { store.resetProgress(p); toast('אופס'); parents('overview'); } };
  $('#del').onclick = async () => { if (await confirmBox(`למחוק את ${p.name} לגמרי?`, 'למחוק')) { store.remove(p.id); route(); } };
}

function about(p, el) {
  el.innerHTML = `<div class="card col">
    <h3>מה המאמן בודק</h3>
    <p><b>דיוק בזמן:</b> כל מכה נמדדת מול הטיק. "מושלם" זה בערך עד 25–35 אלפיות שנייה, "יופי" עד 45–75, תלוי במהירות.</p>
    <p><b>יציבות:</b> כמה הסטיות מהטיק קבועות. ילד שתמיד מקדים קצת יציב יותר מילד שקופץ.</p>
    <p><b>עוצמה:</b> המכה השנייה בדאבל לעומת הראשונה, ימין מול שמאל, ואקצנט מול מכות רכות.</p>
    <h3>איך מתקדמים</h3>
    <p>ציון 80 ומעלה מעלה את המהירות ב-4. שני סיבובים מתחת ל-55 מורידים ב-4. בשני סיבובים טובים במהירות היעד מתקיים מבחן של 24 פעימות. מעבר במבחן פותח את השלב הבא. בכל אימון יש חזרה על שלב ישן (חזרה מרווחת), ותרגיל ממוקד כשחולשה חוזרת.</p>
    <h3>מה המיקרופון לא יכול לדעת</h3>
    <p>המיקרופון שומע מתי ובאיזו עוצמה הייתה מכה, אבל לא <b>באיזו יד</b>. הבדיקה מניחה שהילד מנגן את התבנית שעל המסך. מדי פעם המאמן מבקש מהילד להסתכל על הידיים, ושווה להציץ ולוודא את הסדר ימין-שמאל, במיוחד בפרדידל.</p>
    <h3>טיפים לבדיקה מדויקת</h3>
    <p>מקום שקט, המכשיר על השולחן במרחק של כמטר, ואם אפשר אוזניות חוטיות. אחרי החלפת מכשיר או אוזניות כדאי לכייל מחדש.</p>
    <p class="muted small">הצליל מעובד במכשיר בלבד ולא נשמר. ההתקדמות נשמרת בדפדפן הזה.</p></div>`;
}

// ---------- charts ----------
function setupCanvas(cv) { const w = cv.clientWidth, h = cv.clientHeight; cv.width = w * devicePixelRatio; cv.height = h * devicePixelRatio; const g = cv.getContext('2d'); g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); return { g, w, h }; }
function scoreChart(cv, rounds) {
  const { g, w, h } = setupCanvas(cv), padL = 30, padB = 18, padT = 8;
  const y = v => padT + (1 - v / 100) * (h - padT - padB);
  g.font = '12px "Varela Round", sans-serif'; g.fillStyle = '#5C6A8A'; g.strokeStyle = '#C8D7EF'; g.lineWidth = 1;
  [0, 50, 100].forEach(v => { g.beginPath(); g.moveTo(padL, y(v)); g.lineTo(w - 6, y(v)); g.stroke(); g.textAlign = 'right'; g.fillText(v, padL - 6, y(v) + 4); });
  g.setLineDash([5, 4]); g.strokeStyle = '#1FB57A'; g.beginPath(); g.moveTo(padL, y(80)); g.lineTo(w - 6, y(80)); g.stroke(); g.setLineDash([]);
  if (rounds.length < 2) { g.textAlign = 'center'; g.fillText('אחרי כמה סיבובים יופיע כאן גרף', w / 2, h / 2); return; }
  const x = i => padL + 8 + i * (w - padL - 22) / (rounds.length - 1);
  g.strokeStyle = '#2E66F5'; g.lineWidth = 2.5; g.beginPath(); rounds.forEach((r, i) => i ? g.lineTo(x(i), y(r.score)) : g.moveTo(x(i), y(r.score))); g.stroke();
  rounds.forEach((r, i) => { g.fillStyle = r.kind === 'test' ? '#FF7324' : '#2E66F5'; g.beginPath(); g.arc(x(i), y(r.score), r.kind === 'test' ? 5 : (i === rounds.length - 1 ? 4.5 : 2.5), 0, 7); g.fill(); });
}
function daysChart(cv, p) {
  const { g, w, h } = setupCanvas(cv), padB = 20, padT = 14;
  const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ d, v: (p.days[store.dayKey(d)] || 0) / 60 }); }
  const mx = Math.max(5, ...days.map(d => d.v)), bw = w / 14;
  g.font = '11px "Varela Round", sans-serif'; g.textAlign = 'center';
  days.forEach((d, i) => {
    const bh = (d.v / mx) * (h - padT - padB), xx = i * bw + bw * 0.18;
    g.fillStyle = d.v >= p.settings.sessionMin * 0.6 ? '#1FB57A' : d.v > 0 ? '#9FD9BF' : '#E1EAF7';
    g.fillRect(xx, h - padB - Math.max(2, bh), bw * 0.64, Math.max(2, bh));
    g.fillStyle = '#5C6A8A'; g.fillText(d.d.getDate(), xx + bw * 0.32, h - 5);
    if (d.v >= 1) g.fillText(Math.round(d.v), xx + bw * 0.32, h - padB - bh - 3);
  });
}
