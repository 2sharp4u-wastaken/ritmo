// The coach's brain: builds today's session and decides tempo and progression after every round.
import { SKILLS, SKILL_BY_ID } from './curriculum.js';
import { skillState, currentSkill, allDone } from './store.js';

export const ROUND_BEATS = 16, TEST_BEATS = 24, COUNT_IN = 4, STEP = 4;
const DAY = 86400000;

export function surfaceAdj(p, bpm) { return p.settings.surface === 'pillow' ? Math.round(bpm * 0.9 / 2) * 2 : bpm; }
export function targetOf(p, skill) { return surfaceAdj(p, skill.target); }
export function startOf(p, skill) { return surfaceAdj(p, skill.start); }
export function roundSeconds(bpm, beats = ROUND_BEATS) { return (beats + COUNT_IN) * 60 / bpm + 9; }

function decayedStrength(st, now) { const days = (now - (st.lastTs || st.masteredTs || now)) / DAY; return (st.strength || 0) * Math.pow(0.85, days); }

const REMEDY = { leftWeak: 'l4', rightWeak: 'r4', double: 'dbl2', rush: 'rl', drag: 'rl', unsteady: 'rl', accent: 'acc1', uneven: 'rl', miss: null, extra: null };

export function planSession(p, now = Date.now()) {
  const budget = p.settings.sessionMin * 60;
  const steps = [{ type: 'greet' }, { type: 'miccheck' }];
  let used = 25;
  const mastered = SKILLS.filter(s => skillState(p, s.id).mastered);
  const masteredIds = new Set(mastered.map(s => s.id));

  // warm-up: easiest relevant mastered pattern, at a comfortable tempo
  const warm = masteredIds.has('rl') ? SKILL_BY_ID.rl : masteredIds.has('r4') ? SKILL_BY_ID.r4 : null;
  if (warm) { const bpm = startOf(p, warm); steps.push({ type: 'warmup', skillId: warm.id, bpm }); used += roundSeconds(bpm); }

  // review: weakest remembered skill (spaced repetition)
  const reviewPool = mastered.filter(s => !warm || s.id !== warm.id);
  if (reviewPool.length && budget >= 360) {
    reviewPool.sort((a, b) => decayedStrength(skillState(p, a.id), now) - decayedStrength(skillState(p, b.id), now));
    const s = reviewPool[0], bpm = Math.round(targetOf(p, s) * 0.92 / 2) * 2;
    steps.push({ type: 'review', skillId: s.id, bpm }); used += roundSeconds(bpm);
  }

  // remedial: a persistent weakness gets a targeted drill, using a skill already mastered
  const top = Object.entries(p.weakTally || {}).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2.2 && budget >= 480) {
    const sid = REMEDY[top[0]];
    if (sid && masteredIds.has(sid) && !steps.some(st => st.skillId === sid)) {
      const s = SKILL_BY_ID[sid], bpm = Math.round(targetOf(p, s) * 0.85 / 2) * 2;
      steps.push({ type: 'remedial', skillId: sid, bpm, weak: top[0] }); used += roundSeconds(bpm);
    }
  }

  if (allDone(p)) {
    // graduated: challenge rounds on the weakest skills above target
    const s = reviewPool.length ? reviewPool[reviewPool.length > 1 ? 1 : 0] : SKILLS[SKILLS.length - 1];
    steps.push({ type: 'challenge', skillId: s.id, bpm: targetOf(p, s) + 8, rounds: Math.max(2, Math.floor((budget - used) / roundSeconds(targetOf(p, s)))) });
  } else {
    const s = currentSkill(p), st = skillState(p, s.id);
    const isNew = st.rounds === 0;
    const stale = st.lastTs && now - st.lastTs > 4 * DAY;
    const avg = roundSeconds(st.bpm || startOf(p, s));
    const rounds = Math.max(3, Math.min(10, Math.floor((budget - used - (isNew ? 40 : 0)) / avg)));
    steps.push({ type: 'lesson', skillId: s.id, isNew, demo: isNew || stale, rounds });
  }
  steps.push({ type: 'summary' });
  return steps;
}

// Called after each graded lesson round. Mutates skill state and returns what the coach decided.
export function afterLessonRound(p, skill, bpm, m) {
  const st = skillState(p, skill.id), target = targetOf(p, skill), floor = Math.max(36, startOf(p, skill) - 8);
  st.rounds++; st.lastTs = Date.now(); st.best = Math.max(st.best, m.score >= 75 ? bpm : 0);
  st.recent = [...(st.recent || []), { bpm, score: m.score }].slice(-6);
  st.fails = st.fails || 0;
  let change = 0, decision = 'same';
  if (m.score >= 80) {
    st.fails = 0;
    if (bpm < target) { change = Math.min(STEP, target - bpm); decision = 'faster'; }
  } else if (m.score < 55) {
    st.fails++;
    if (st.fails >= 2 && bpm > floor) { change = -STEP; st.fails = 0; decision = 'slower'; }
  } else st.fails = 0;
  st.bpm = Math.max(floor, Math.min(target, bpm + change));
  const lastTwo = st.recent.slice(-2);
  const testReady = lastTwo.length === 2 && lastTwo.every(r => r.bpm >= target && r.score >= 80);
  return { decision, nextBpm: st.bpm, testReady };
}

export function afterTest(p, skill, bpm, m, passed) {
  const st = skillState(p, skill.id);
  st.tests.push({ ts: Date.now(), bpm, score: m.score, pass: passed });
  if (passed) {
    st.mastered = true; st.masteredTs = Date.now(); st.strength = 1; st.lastTs = Date.now();
    const idx = SKILLS.findIndex(s => s.id === skill.id);
    if (idx === p.skillIdx) p.skillIdx = idx + 1;
  } else {
    st.recent = []; // must earn readiness again
    st.bpm = Math.max(startOf(p, skill), targetOf(p, skill) - STEP);
  }
}

export function afterReview(p, skill, m) {
  const st = skillState(p, skill.id);
  st.strength = Math.max(0.2, Math.min(1, m.score / 100)); st.lastTs = Date.now();
}
