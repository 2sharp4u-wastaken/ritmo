// Runs today's session step by step. The coach leads; the child only confirms and plays.
import { audio } from './audio.js';
import { SKILL_BY_ID, SKILLS, BELTS, UNITS, parsePattern, isLastInUnit, unitOf } from './curriculum.js';
import { buildRound, Grader, testPassed, TIPS } from './grader.js';
import { planSession, afterLessonRound, afterTest, afterReview, targetOf, startOf, ROUND_BEATS, TEST_BEATS, COUNT_IN } from './coach.js';
import * as store from './store.js';
import { render, coachHTML, say, mood, $, esc, sleep, confetti, toast, confirmBox, keepAwake, starsHTML, stopSpeaking } from './ui.js';
import { Highway } from './highway.js';
import { calibrationFlow, ensureMic, applyCalib, micErrorHTML } from './calib.js';

const ICON = { greet: '👋', miccheck: '🎤', warmup: '🔥', review: '🔁', remedial: '🎯', lesson: '🥁', test: '🏅', challenge: '⚡', summary: '🏁' };
const NAME = { greet: 'שלום', miccheck: 'בדיקה', warmup: 'חימום', review: 'חזרה', remedial: 'תרגיל מיוחד', lesson: 'שיעור', test: 'מבחן', challenge: 'אתגר', summary: 'סיכום' };
export { ICON as STEP_ICON, NAME as STEP_NAME };

const PRAISE = {
  3: ['וואו! זה היה מושלם!', 'ידיים של מקצוען!', 'אלוף! בדיוק כמו שעון!'],
  2: ['יפה מאוד!', 'עבודה טובה!', 'כמעט מושלם!'],
  1: ['לא רע בכלל!', 'אתה בדרך הנכונה!', 'יש התקדמות!'],
  0: ['זה בסדר, ככה לומדים.', 'גם מתופפים גדולים מתבלבלים.', 'נשימה עמוקה, ומנסים שוב.'],
};
const pick = a => a[Math.floor(Math.random() * a.length)];

class Abort extends Error {}

export async function runSession(p, onExit) {
  const S = { p, plan: planSession(p), i: 0, aborted: false, log: { ts: Date.now(), rounds: 0, xp: 0, best: 0, seconds: 0, events: [] }, cleanup: [] };
  document.body.dataset.awake = '1'; keepAwake(true);
  const ok = await prepareMic(S);
  if (!ok) { document.body.dataset.awake = ''; keepAwake(false); return onExit(); }
  try {
    for (S.i = 0; S.i < S.plan.length; S.i++) {
      const step = S.plan[S.i];
      await runStep(S, step);
    }
  } catch (e) {
    if (!(e instanceof Abort)) { console.error(e); toast('אופס, משהו השתבש. נסו שוב.'); }
    else if (S.log.rounds > 0) { try { await summary(S, true); } catch (e2) {} }
  }
  audio.stopAll(); stopSpeaking();
  document.body.dataset.awake = ''; keepAwake(false);
  onExit();
}

async function prepareMic(S) {
  const r = await ensureMic();
  if (!r.ok) {
    render(`${coachHTML('')}<div class="card col">${micErrorHTML(r.reason)}<div class="row"><button class="btn primary" id="retry">נסו שוב</button><button class="btn" id="back">חזרה</button></div></div>`);
    say('אני צריך את המיקרופון כדי לשמוע אותך. בקש עזרה מאבא או אמא.');
    const a = await new Promise(res => { $('#retry').onclick = () => res('r'); $('#back').onclick = () => res('b'); });
    return a === 'r' ? prepareMic(S) : false;
  }
  if (!store.calib(S.p)) { const done = await calibrationFlow(S.p); if (!done) return false; }
  applyCalib(S.p);
  return true;
}

// ---------- frame ----------
function frame(S, inner, coachText = '') {
  const steps = S.plan.filter(s => s.type !== 'greet');
  const curIdx = steps.indexOf(S.plan[S.i]);
  render(`
    <div class="sbar">
      <div class="steps" aria-label="התקדמות באימון">${steps.map((s, k) => `<i class="${k < curIdx ? 'done' : k === curIdx ? 'now' : ''}" title="${NAME[s.type]}"></i>`).join('')}</div>
      <button class="iconbtn" id="pause" aria-label="הפסקה">⏸</button>
    </div>
    ${coachHTML(coachText)}
    <div id="stage" class="col">${inner}</div>`);
  $('#pause').onclick = () => pauseMenu(S);
}
async function pauseMenu(S) {
  S.paused = true; audio.stopAll(); stopSpeaking();
  if (S.round) S.round.cancel();
  const end = await confirmBox('הפסקה. רוצה לסיים את האימון של היום?', 'לסיים', 'להמשיך');
  S.paused = false;
  if (end) { S.aborted = true; if (S.waiter) S.waiter.reject(new Abort()); }
  else if (S.waiter && S.waiter.resume) S.waiter.resume();
}
// waits for a button; rejects if the session is ended from the pause menu
function waitClick(S, id, resumeFn) {
  return new Promise((res, rej) => {
    S.waiter = { reject: rej, resume: resumeFn };
    const el = $('#' + id);
    if (el && el.dataset.pressed === '1') { S.waiter = null; res(); return; }
    if (el) el.onclick = () => { S.waiter = null; res(); };
  });
}
function check(S) { if (S.aborted) throw new Abort(); }

// ---------- steps ----------
async function runStep(S, step) {
  check(S);
  const p = S.p, sk = step.skillId ? SKILL_BY_ID[step.skillId] : null;
  switch (step.type) {
    case 'greet': return greet(S);
    case 'miccheck': return micCheck(S);
    case 'warmup': {
      frame(S, readyCard(sk, step.bpm, 'חימום'));
      await say(`מתחממים! ${sk.title}, לאט ונעים.`);
      const m = await playRoundFlow(S, sk, step.bpm, { kind: 'warmup' });
      await feedback(S, m, sk, { kind: 'warmup' });
      return;
    }
    case 'review': {
      frame(S, readyCard(sk, step.bpm, 'חזרה'));
      await say(`עכשיו חזרה על משהו שכבר למדת: ${sk.title}. נראה שלא שכחת!`);
      const m = await playRoundFlow(S, sk, step.bpm, { kind: 'review' });
      afterReview(p, sk, m); store.save();
      await feedback(S, m, sk, { kind: 'review', extra: m.score < 65 ? 'נחזור על זה שוב בקרוב.' : 'זוכר מצוין!' });
      return;
    }
    case 'remedial': {
      frame(S, readyCard(sk, step.bpm, 'תרגיל מיוחד'));
      await say(`שמתי לב לדבר אחד: ${TIPS[step.weak].short}. הכנתי לך תרגיל מיוחד: ${sk.title}.`);
      const m = await playRoundFlow(S, sk, step.bpm, { kind: 'remedial' });
      await feedback(S, m, sk, { kind: 'remedial', focus: step.weak });
      return;
    }
    case 'lesson': return lesson(S, step, sk);
    case 'challenge': {
      for (let r = 0; r < step.rounds; r++) {
        frame(S, readyCard(sk, step.bpm + r * 2, 'אתגר'));
        await say(r === 0 ? `אתה כבר חגורה שחורה! אתגר: ${sk.title} מהר יותר מהיעד.` : 'עוד סיבוב אתגר!');
        const m = await playRoundFlow(S, sk, step.bpm + r * 2, { kind: 'challenge' });
        await feedback(S, m, sk, { kind: 'challenge' });
      }
      return;
    }
    case 'summary': return summary(S, false);
  }
}

async function greet(S) {
  const p = S.p, lessonStep = S.plan.find(s => s.type === 'lesson' || s.type === 'challenge'), sk = lessonStep && SKILL_BY_ID[lessonStep.skillId];
  const items = S.plan.filter(s => !['greet', 'miccheck', 'summary'].includes(s.type));
  render(`
    ${coachHTML('', true)}
    <div class="card col">
      <h2>האימון של היום</h2>
      <div class="plan">${items.map((s, k) => `${k ? '<span class="dash"></span>' : ''}<div class="st"><span class="ic">${ICON[s.type]}</span>${NAME[s.type]}</div>`).join('')}</div>
      ${sk ? `<p class="center">השיעור: <b>${esc(sk.title)}</b>${lessonStep.isNew ? ' (חדש!)' : ''}</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn primary huge" id="go">יאללה, מתחילים!</button></div>
    </div>`);
  const parts = [];
  if (items.some(s => s.type === 'warmup')) parts.push('קודם נתחמם');
  if (items.some(s => s.type === 'review')) parts.push(parts.length ? 'אחר כך נעשה חזרה קצרה' : 'קודם נעשה חזרה קצרה');
  if (items.some(s => s.type === 'remedial')) parts.push('תרגיל מיוחד שהכנתי לך');
  if (sk && lessonStep.type === 'lesson') parts.push((parts.length ? 'ואז ' : 'היום ') + (lessonStep.isNew ? `שיעור חדש: ${sk.title}` : `ממשיכים לתרגל ${sk.title}`));
  if (sk && lessonStep.type === 'challenge') parts.push('ואז אתגר מהירות');
  say(`היי ${p.name}! ${parts.join(', ')}.`);
  await waitClick(S, 'go');
}

async function micCheck(S) {
  frame(S, `<div class="card col center"><h3>בדיקת שמיעה</h3><p>תכה מכה אחת חזקה על ה${S.p.settings.surface === 'pad' ? 'פד' : 'כרית'}.</p>
    <div class="meter"><i id="meterFill"></i></div><p class="muted small" id="mcStatus">מקשיב...</p>
    <div class="row" style="justify-content:center" hidden id="mcBtns"><button class="btn" id="mcRetry">נסה שוב</button><button class="btn" id="mcRecal">כיול מחדש</button><button class="btn quiet" id="mcSkip">להמשיך בכל זאת</button></div></div>`);
  const fill = $('#meterFill'), c = store.calib(S.p);
  const offM = audio.onMeter(m => { if (fill) fill.style.width = Math.min(100, m.level / (c.hitLevel || 0.2) * 70) + '%'; });
  applyCalib(S.p); audio.config({ refractory: 0.2 });
  say('בדיקת שמיעה: תכה מכה אחת חזקה, שאני אדע שאני שומע אותך.');
  const heard = await new Promise(res => { const off = audio.onOnset(() => { off(); clearTimeout(t); res(true); }); const t = setTimeout(() => { off(); res(false); }, 9000); });
  offM(); check(S);
  if (heard) { audio.sfx('soft'); mood('cheer'); $('#mcStatus').textContent = 'שומע אותך! ✓'; await say('שומע אותך מצוין!'); mood(null); return; }
  $('#mcStatus').textContent = 'לא שמעתי מכה.'; $('#mcBtns').hidden = false;
  await say('לא שמעתי. אולי המיקרופון מכוסה? נסה שוב.');
  const a = await new Promise((res, rej) => { S.waiter = { reject: rej }; $('#mcRetry').onclick = () => res('retry'); $('#mcRecal').onclick = () => res('recal'); $('#mcSkip').onclick = () => res('skip'); });
  if (a === 'retry') return micCheck(S);
  if (a === 'recal') { await calibrationFlow(S.p); applyCalib(S.p); return micCheck(S); }
}

function readyCard(sk, bpm, label) {
  return `<div class="stagecard">
      <div class="hwinfo"><span>${label} · ${esc(sk.title)}</span><span class="tnum">🥁 ${bpm}</span></div>
      <div class="sticking" id="sticking">${stickingHTML(sk)}</div>
      <canvas class="hw" id="hw"></canvas>
      <p class="lookhint">${esc(sk.look)}</p>
    </div>
    <div class="row" style="justify-content:center" id="ctl"><button class="btn primary huge" id="play">מוכן? יאללה!</button></div>`;
}
function stickingHTML(sk) {
  const cyc = parsePattern(sk.pattern);
  const reps = cyc.length === 1 ? 4 : cyc.length === 2 ? 4 : cyc.length === 4 ? 2 : 1;
  let html = '', k = 0;
  for (let r = 0; r < reps; r++) cyc.forEach((c, i) => { if ((k % 4 === 0) && k) html += '<span class="sp"></span>'; html += `<b class="${c.hand} ${c.acc ? 'acc' : ''}" data-k="${k}">${c.hand}</b>`; k++; });
  return html;
}

// Plays one round with live grading. Handles stop/pause by letting the child retry the same round.
async function playRoundFlow(S, sk, bpm, { kind, demo = false, beats = ROUND_BEATS, guides = false, preSay } = {}) {
  S.lastBpm = bpm;
  for (;;) {
    check(S);
    if (!$('#hw')) frame(S, readyCard(sk, bpm, kind === 'test' ? 'מבחן' : NAME[kind] || ''));
    const hw = new Highway($('#hw'), { onPos: pos => highlight(sk, pos) });
    hw.setRound(buildRound(sk, bpm, beats, audio.now() + 99, COUNT_IN), { demo }); hw.start();
    if (preSay) await say(preSay);
    if (!demo) await waitClick(S, 'play'); else await sleep(200);
    check(S);
    $('#ctl').innerHTML = `<button class="btn" id="stop">⏹ עצור</button>`;
    const res = await playRound(S, sk, bpm, { demo, beats, guides, hw });
    hw.destroy();
    if (res) return res;
    // stopped: offer to retry
    check(S);
    frame(S, readyCard(sk, bpm, NAME[kind] || ''));
    say('עצרנו. מוכן לנסות שוב?');
  }
}
function highlight(sk, pos) {
  const st = $('#sticking'); if (!st) return;
  const bs = st.querySelectorAll('b'); if (!bs.length) return;
  bs.forEach(b => b.classList.remove('on'));
  if (pos < 0) return;
  // the strip shows several cycles for short patterns; light the matching slot in sequence
  S_hl.count = (S_hl.count + 1) % bs.length;
  const cycLen = parsePattern(sk.pattern).length;
  let idx = S_hl.count; if (bs[idx] && +bs[idx].dataset.k % cycLen !== pos) { idx = [...bs].findIndex(b => +b.dataset.k % cycLen === pos); S_hl.count = idx; }
  if (bs[idx]) bs[idx].classList.add('on');
}
const S_hl = { count: -1 };

function playRound(S, sk, bpm, { demo, beats, guides, hw }) {
  return new Promise(resolve => {
    const p = S.p, c = store.calib(p) || { latency: 0.08, bleed: 0, threshold: 0.02 };
    applyCalib(p);
    const startT = audio.now() + 0.5 + COUNT_IN * 60 / bpm;
    const round = buildRound(sk, bpm, beats, startT, COUNT_IN);
    audio.config({ refractory: Math.max(0.035, round.iv * 0.45), enabled: !demo });
    round.clicks.forEach(k => audio.click(k.t, k.strong));
    if (demo || guides) round.notes.forEach(n => audio.guide(n.t, n.hand, n.acc));
    S_hl.count = -1;
    hw.setRound(round, { demo });
    if (window.__ritmo && window.__ritmo.onRound && !demo) window.__ritmo.onRound(round);
    const g = new Grader(round, { latency: c.latency, bleed: p.settings.headphones ? 0 : c.bleed, hitLevel: c.hitLevel || 0 });
    const offOn = demo ? () => {} : audio.onOnset(o => { const r = g.onset(o); if (!r) return; if (r.extra) hw.judge(null, 'extra'); else hw.judge(r.note, r.judgement); });
    const missT = demo ? 0 : setInterval(() => g.missesUntil(audio.now()).forEach(n => hw.judge(n, 'miss')), 80);
    let finished = false;
    const done = (val) => { if (finished) return; finished = true; offOn(); clearInterval(missT); clearTimeout(endT); S.round = null; audio.config({ enabled: true }); resolve(val); };
    const cancel = () => { audio.stopAll(); done(null); };
    S.round = { cancel };
    const stop = $('#stop'); if (stop) stop.onclick = cancel;
    const wall = (round.end - audio.now() + 0.6) * 1000;
    const endT = setTimeout(() => {
      const secs = round.end - (startT - COUNT_IN * 60 / bpm);
      store.addPracticeTime(p, secs); S.log.seconds += secs;
      if (demo) return done({ demo: true });
      done(g.finalize({ surface: p.settings.surface }));
    }, wall);
  });
}

// ---------- feedback ----------
const DEC = { faster: b => `🐇 מעולה! הסיבוב הבא קצת יותר מהר: ${b}`, slower: b => `🐢 נוריד קצת מהירות: ${b}. ככה לומדים.`, same: b => `נשארים באותה מהירות: ${b}` };
async function feedback(S, m, sk, { kind, decision, nextBpm, extra, focus } = {}) {
  check(S);
  const p = S.p;
  S.log.rounds++; S.log.best = Math.max(S.log.best, m.score);
  const xp = Math.round(m.score / 10) + m.stars * 2; S.log.xp += xp; p.xp += xp;
  store.addRound(p, { ts: Date.now(), skill: sk.id, bpm: S.lastBpm, score: m.score, weak: m.weak, kind, cnt: m.cnt, meanOff: m.meanOff, sd: m.sd, dyn: m.dyn });
  store.tallyWeak(p, m.weak);
  store.save();
  const C = 2 * Math.PI * 52, col = m.score >= 75 ? 'var(--mint)' : m.score >= 60 ? 'var(--sun)' : 'var(--berry)';
  const offMs = Math.round(m.meanOff * 1000), pos = 50 + Math.max(-45, Math.min(45, offMs / 60 * 45));
  const tipKey = focus && m.weak.includes(focus) ? focus : m.weak[0];
  frame(S, `
    <div class="card col">
      <div class="fb">
        <svg class="ring" viewBox="0 0 130 130" aria-label="ציון ${m.score}">
          <circle class="bg" cx="65" cy="65" r="52"/>
          <circle class="fg" id="ringFg" cx="65" cy="65" r="52" stroke="${col}" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 65 65)"/>
          <text x="65" y="74" text-anchor="middle" font-size="34">${m.score}</text>
        </svg>
        <div class="col" style="gap:8px">
          <div>${starsHTML(m.stars)} <span class="chip" style="margin-inline-start:8px">+${xp} נק׳</span></div>
          <div class="jcounts">
            <div><b>${m.cnt.perfect}</b><span>מושלם</span></div><div><b>${m.cnt.good}</b><span>יופי</span></div>
            <div><b>${m.cnt.early}</b><span>מוקדם</span></div><div><b>${m.cnt.late}</b><span>מאוחר</span></div>
            <div><b>${m.cnt.miss}</b><span>פספוס</span></div>
          </div>
        </div>
      </div>
      <div><div class="tend"><div class="bar"></div><div class="mid"></div><div class="dot" style="left:50%" id="tendDot"></div></div>
        <div class="tendlbl"><span>מוקדם</span><span>בדיוק</span><span>מאוחר</span></div></div>
      ${decision ? `<div class="decision">${DEC[decision](nextBpm)}</div>` : ''}
      ${extra ? `<p class="center">${esc(extra)}</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn primary huge" id="next">המשך</button></div>
    </div>`);
  requestAnimationFrame(() => { const f = $('#ringFg'); if (f) f.style.strokeDashoffset = C * (1 - m.score / 100); const d = $('#tendDot'); if (d) d.style.left = pos + '%'; });
  if (m.stars >= 2) { audio.sfx('win'); if (m.stars === 3) confetti(70); } else if (m.stars === 0) audio.sfx('oops'); else audio.sfx('soft');
  const praise = pick(PRAISE[m.stars]);
  const line = tipKey ? `${praise} ${TIPS[tipKey].say}` : `${praise} ${m.stars === 3 ? '' : 'תמשיך בדיוק ככה.'}`;
  say(line, { mood: m.stars >= 2 ? 'cheer' : null });
  await waitClick(S, 'next');
  mood(null);
}

// ---------- lesson ----------
async function lesson(S, step, sk) {
  const p = S.p, st = store.skillState(p, sk.id), target = targetOf(p, sk);
  if (step.demo) {
    frame(S, `<div class="stagecard"><div class="hwinfo"><span>${step.isNew ? 'שיעור חדש' : 'תזכורת'}</span><span>${esc(sk.title)}</span></div>
      <div class="sticking" id="teachStrip">${stickingHTML(sk)}</div><p class="lookhint">${esc(sk.look)}</p></div>`);
    const strip = $('#teachStrip'); if (strip) strip.querySelectorAll('b').forEach(b => b.classList.add('on'));
    for (const line of sk.teach) { check(S); await say(line); await sleep(250); }
    check(S);
    frame(S, readyCard(sk, startOf(p, sk), 'הדגמה'));
    $('#ctl').innerHTML = '';
    await say('עכשיו תסתכל ותקשיב. אני מנגן, אתה רק מסתכל.');
    await playRoundFlow(S, sk, Math.max(40, startOf(p, sk) - 4), { kind: 'lesson', demo: true, beats: 8 });
    check(S);
  }
  for (let r = 0; r < step.rounds; r++) {
    check(S);
    const bpm = st.bpm || startOf(p, sk); S.lastBpm = bpm;
    const guides = p.settings.headphones && st.rounds < 2;
    frame(S, readyCard(sk, bpm, 'שיעור'));
    let intro;
    if (r === 0) intro = step.isNew ? 'עכשיו תורך! מכה על כל עיגול שמגיע לקו.' : `ממשיכים עם ${sk.title}. מהירות ${bpm}.`;
    else if (r % 3 === 2) intro = `הפעם תסתכל על הידיים: ${sk.look}`;
    else intro = pick(['עוד סיבוב!', 'מוכן? יאללה!', 'עוד פעם, אתה משתפר!']);
    if (guides) intro += ' שומעים צליל לכל מכה כדי לעזור.';
    await say(intro);
    const m = await playRoundFlow(S, sk, bpm, { kind: 'lesson', guides });
    const d = afterLessonRound(p, sk, bpm, m); store.save();
    await feedback(S, m, sk, { kind: 'lesson', decision: d.decision === 'same' && bpm >= target ? null : d.decision, nextBpm: d.nextBpm, extra: bpm >= target && m.score >= 80 && !d.testReady ? 'הגעת למהירות היעד! עוד סיבוב טוב אחד ויש מבחן.' : '' });
    if (d.testReady) { await test(S, sk); return; }
  }
  frame(S, `<div class="card col center"><h3>עבודה טובה!</h3><p>היום הגעת למהירות ${st.bpm} מתוך ${target}. מחר נמשיך מכאן.</p><div class="row" style="justify-content:center"><button class="btn primary" id="next">המשך</button></div></div>`);
  say(`עבודה טובה! הגעת למהירות ${st.bpm}. היעד הוא ${target}. מחר נמשיך מכאן.`);
  await waitClick(S, 'next');
}

async function test(S, sk) {
  const p = S.p, target = targetOf(p, sk);
  S.plan.splice(S.i + 1, 0, { type: 'test', skillId: sk.id, _inline: true }); S.i++;
  frame(S, `<div class="card col center"><span style="font-size:56px" class="pop">🏅</span><h2>מבחן: ${esc(sk.title)}</h2>
    <p>${TEST_BEATS} פעימות במהירות ${target}${p.settings.headphones ? ', בלי צלילי עזרה' : ''}. אני בודק דיוק, יציבות ועוצמה.</p>
    <div class="row" style="justify-content:center"><button class="btn primary huge" id="next">אני מוכן למבחן</button></div></div>`);
  await say(`אתה מוכן למבחן! ${TEST_BEATS} פעימות במהירות ${target}. תתרכז, תנשום, ותנגן כמו שתרגלת.`);
  await waitClick(S, 'next');
  S.lastBpm = target;
  const m = await playRoundFlow(S, sk, target, { kind: 'test', beats: TEST_BEATS });
  const passed = testPassed(m);
  const beltBefore = store.beltIndex(p);
  afterTest(p, sk, target, m, passed); store.save();
  S.log.events.push({ type: 'test', skill: sk.id, pass: passed, score: m.score });
  await feedback(S, m, sk, { kind: 'test', extra: passed ? 'עברת את המבחן! 🎉' : 'כמעט! מחר ננסה שוב.' });
  if (passed) {
    p.xp += 50; S.log.xp += 50;
    const beltAfter = store.beltIndex(p);
    const next = SKILLS[p.skillIdx];
    if (beltAfter > beltBefore) {
      const b = BELTS[beltAfter]; p.xp += 100; S.log.xp += 100; store.save();
      audio.sfx('big'); confetti(220);
      frame(S, `<div class="card celebrate"><h1 class="pop">${esc(b.name)}!</h1><div class="bigbelt pop" style="background:${b.color}"></div>
        <p>סיימת את "${esc(unitOf(sk).title)}". +100 נקודות!</p>${next ? `<p class="muted">הבא בתור: ${esc(next.title)}</p>` : '<p><b>סיימת את כל המסלול!</b></p>'}
        <button class="btn primary huge" id="next">יש!!!</button></div>`);
      say(`וואו! קיבלת ${b.name}! אני כל כך גאה בך, ${p.name}!`, { mood: 'cheer' });
    } else {
      audio.sfx('win'); confetti(140); store.save();
      frame(S, `<div class="card celebrate"><span style="font-size:64px" class="pop">🔓</span><h2>שלב חדש נפתח!</h2>${next ? `<p>מהאימון הבא: <b>${esc(next.title)}</b></p>` : ''}<button class="btn primary huge" id="next">יש!</button></div>`);
      say(next ? `עברת! בפעם הבאה נלמד ${next.title}.` : 'עברת!', { mood: 'cheer' });
    }
    await waitClick(S, 'next');
  } else {
    const tipKey = m.weak[0];
    frame(S, `<div class="card col center"><span style="font-size:52px">💪</span><h3>עוד לא, אבל כמעט</h3><p>${tipKey ? esc(TIPS[tipKey].say) : 'צריך עוד קצת תרגול.'}</p><p class="muted">באימון הבא נתרגל ונעשה מבחן שוב.</p><div class="row" style="justify-content:center"><button class="btn primary" id="next">המשך</button></div></div>`);
    say('עוד לא, אבל אתה ממש קרוב. באימון הבא ננסה שוב.');
    await waitClick(S, 'next');
  }
}

// ---------- summary ----------
async function summary(S, early) {
  const p = S.p;
  store.finishSession(p, { ts: S.log.ts, dur: Math.round(S.log.seconds), rounds: S.log.rounds, xp: S.log.xp, best: S.log.best, events: S.log.events, early });
  const mins = Math.max(1, Math.round(S.log.seconds / 60)), next = SKILLS[p.skillIdx];
  S.aborted = false; S.i = S.plan.length - 1;
  frame(S, `<div class="card col center">
      <h2>${early ? 'סיימנו להיום' : 'האימון הושלם! 🏁'}</h2>
      <div class="kpis">
        <div class="kpi"><b>${S.log.rounds}</b><span>סיבובים</span></div>
        <div class="kpi"><b>+${S.log.xp}</b><span>נקודות</span></div>
        <div class="kpi"><b>${S.log.best}</b><span>הציון הכי גבוה</span></div>
        <div class="kpi"><b>🔥 ${p.streak}</b><span>ימים ברצף</span></div>
      </div>
      <p>תרגלת בערך ${mins} דקות.${next ? ` בפעם הבאה: <b>${esc(next.title)}</b>.` : ''}</p>
      <div class="row" style="justify-content:center"><button class="btn primary huge" id="fin">סיום</button></div></div>`);
  $('#pause').hidden = true;
  say(`${early ? 'סיימנו להיום.' : 'כל הכבוד, סיימת את האימון!'} ${p.streak > 1 ? `${p.streak} ימים ברצף!` : ''} נתראה מחר!`, { mood: 'cheer' });
  await new Promise(r => $('#fin').onclick = r);
}
