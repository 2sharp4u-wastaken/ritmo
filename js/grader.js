// Builds a round's expected notes, matches detected strokes live, and scores the round.
import { parsePattern } from './curriculum.js';

const med = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function buildRound(skill, bpm, beats, t0, countIn = 4) {
  const beat = 60 / bpm, iv = beat / skill.sub, cyc = parsePattern(skill.pattern);
  const notes = [], clicks = [];
  for (let b = -countIn; b < beats; b++) clicks.push({ t: t0 + b * beat, strong: ((b % 4) + 4) % 4 === 0, countIn: b < 0, n: b < 0 ? -b : 0 });
  const total = beats * skill.sub;
  for (let k = 0; k < total; k++) {
    const c = cyc[k % cyc.length];
    notes.push({ k, t: t0 + k * iv, hand: c.hand, acc: c.acc, pos: k % cyc.length, match: null });
  }
  return { notes, clicks, iv, beat, t0, end: t0 + total * iv, cycleLen: cyc.length, cyc };
}

export function windows(iv) {
  return {
    perfect: Math.min(Math.max(0.022, 0.07 * iv), 0.035),
    good: Math.min(Math.max(0.045, 0.15 * iv), 0.075),
    max: 0.5 * iv,
  };
}

export class Grader {
  constructor(round, { latency = 0, bleed = 0, hitLevel = 0 } = {}) {
    this.r = round; this.latency = latency; this.bleed = bleed;
    // ignore click echoes only below this level, never as loud as a real stroke
    this.gate = hitLevel ? Math.min(bleed * 1.7, hitLevel * 0.45) : bleed * 1.7;
    this.w = windows(round.iv); this.extra = 0; this.ignored = 0; this.raw = [];
  }
  // returns {note, judgement, offset} for a matched stroke, {extra:true} for a stray, or null if ignored
  onset(o) {
    if (this.bleed > 0) {
      for (const c of this.r.clicks) {
        if (Math.abs(o.time - (c.t + this.latency)) < 0.02 && o.peak < this.gate) { this.ignored++; return null; }
      }
    }
    const t = o.time - this.latency;
    this.raw.push({ t, peak: o.peak });
    if (t < this.r.t0 - this.w.max || t > this.r.end + this.w.max) return null; // count-in or after the end
    let best = null, bd = Infinity;
    for (const n of this.r.notes) {
      if (n.match) continue;
      const d = Math.abs(t - n.t);
      if (d < bd) { bd = d; best = n; }
      if (n.t > t + this.w.max) break;
    }
    if (!best || bd > this.w.max) { this.extra++; return { extra: true }; }
    const off = t - best.t, a = Math.abs(off);
    const j = a <= this.w.perfect ? 'perfect' : a <= this.w.good ? 'good' : off < 0 ? 'early' : 'late';
    best.match = { off, peak: o.peak, j };
    return { note: best, judgement: j, offset: off };
  }
  missesUntil(now) { return this.r.notes.filter(n => !n.match && !n.missFlag && n.t + this.w.max < now - this.latency).map(n => { n.missFlag = true; return n; }); }

  finalize({ surface = 'pad' } = {}) {
    const N = this.r.notes, total = N.length, hit = N.filter(n => n.match);
    const cnt = { perfect: 0, good: 0, early: 0, late: 0, miss: total - hit.length, extra: this.extra };
    hit.forEach(n => cnt[n.match.j]++);
    const timingAcc = (cnt.perfect + 0.85 * cnt.good + 0.35 * (cnt.early + cnt.late)) / total;
    const offs = hit.map(n => n.match.off);
    const meanOff = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
    const sd = offs.length > 2 ? Math.sqrt(offs.reduce((a, b) => a + (b - meanOff) ** 2, 0) / offs.length) : 0;
    const consistency = clamp(1 - (sd - this.w.perfect * 0.6) / (this.w.good * 1.4));

    // dynamics (only meaningful with enough strokes)
    const cyc = this.r.cyc, lenient = surface === 'pillow';
    const pairsStart = [], second = new Set();
    for (let i = 0; i < cyc.length && cyc.length > 1; i++) {
      if (second.has(i)) continue;
      const j = (i + 1) % cyc.length;
      if (cyc[i].hand === cyc[j].hand) { pairsStart.push(i); second.add(j); }
    }
    // keep only true doubles (not runs of a single-hand pattern like R or L alone)
    const singleHand = cyc.every(c => c.hand === cyc[0].hand);
    const dyn = {}, sub = [];
    if (hit.length >= 8) {
      if (!singleHand && pairsStart.length) {
        const ratios = [];
        N.forEach((n, i) => { if (pairsStart.includes(n.pos) && n.match && N[i + 1] && N[i + 1].match && !n.acc) ratios.push(N[i + 1].match.peak / n.match.peak); });
        if (ratios.length >= 3) { dyn.double = med(ratios); sub.push(clamp((dyn.double - 0.5) / (lenient ? 0.3 : 0.4))); }
      }
      const hasR = cyc.some(c => c.hand === 'R'), hasL = cyc.some(c => c.hand === 'L');
      if (hasR && hasL) {
        const r = hit.filter(n => n.hand === 'R' && !n.acc).map(n => n.match.peak), l = hit.filter(n => n.hand === 'L' && !n.acc).map(n => n.match.peak);
        if (r.length >= 3 && l.length >= 3) { dyn.balance = med(l) / med(r); sub.push(clamp(1 - Math.abs(Math.log(dyn.balance)) / Math.log(lenient ? 1.9 : 1.6))); }
      }
      if (cyc.some(c => c.acc)) {
        const a = hit.filter(n => n.acc).map(n => n.match.peak), b = hit.filter(n => !n.acc).map(n => n.match.peak);
        if (a.length >= 2 && b.length >= 3) { dyn.accent = med(a) / med(b); sub.push(clamp((dyn.accent - 1) / 0.5)); }
      } else {
        const p = hit.map(n => n.match.peak), m = p.reduce((x, y) => x + y, 0) / p.length;
        const cv = Math.sqrt(p.reduce((x, y) => x + (y - m) ** 2, 0) / p.length) / m;
        dyn.evenCv = cv; sub.push(clamp(1 - (cv - 0.15) / (lenient ? 0.5 : 0.35)));
      }
    }
    const dynScore = sub.length ? sub.reduce((a, b) => a + b, 0) / sub.length : null;
    const extraPenalty = Math.min(0.15, this.extra / total * 0.5);
    // consistency and dynamics are measured on the strokes that were played, so scale them by how much was played
    const hr2 = (hit.length / total) ** 2;
    let score = dynScore == null ? (0.72 * timingAcc + hr2 * 0.28 * consistency) : (0.5 * timingAcc + hr2 * (0.2 * consistency + 0.3 * dynScore));
    score = Math.round(clamp(score - extraPenalty) * 100);

    // weaknesses, most important first
    const wk = [];
    if (cnt.miss / total > 0.2) wk.push('miss');
    if (cnt.extra / total > 0.15) wk.push('extra');
    if (meanOff < -Math.max(0.018, this.w.perfect * 0.8)) wk.push('rush');
    if (meanOff > Math.max(0.018, this.w.perfect * 0.8)) wk.push('drag');
    if (consistency < 0.55) wk.push('unsteady');
    if (dyn.double != null && dyn.double < (lenient ? 0.65 : 0.75)) wk.push('double');
    if (dyn.balance != null && dyn.balance < (lenient ? 0.65 : 0.75)) wk.push('leftWeak');
    if (dyn.balance != null && dyn.balance > (lenient ? 1.55 : 1.33)) wk.push('rightWeak');
    if (dyn.accent != null && dyn.accent < 1.25) wk.push('accent');
    if (dyn.evenCv != null && dyn.evenCv > (lenient ? 0.55 : 0.4)) wk.push('uneven');
    // a weak round always names its biggest problem, even below the individual thresholds
    if (!wk.length && score < 78) wk.push(cnt.miss > 0 ? 'miss' : consistency < 0.8 ? 'unsteady' : Math.abs(meanOff) > 0.012 ? (meanOff < 0 ? 'rush' : 'drag') : 'uneven');

    return {
      score, cnt, total, timingAcc: +timingAcc.toFixed(3), meanOff: +meanOff.toFixed(4), sd: +sd.toFixed(4),
      consistency: +consistency.toFixed(3), dyn, dynScore: dynScore == null ? null : +dynScore.toFixed(3), weak: wk,
      stars: score >= 90 ? 3 : score >= 75 ? 2 : score >= 60 ? 1 : 0,
    };
  }
}

// What a test must show to pass.
export function testPassed(m) {
  return m.score >= 78 && m.cnt.miss / m.total <= 0.12 && !m.weak.includes('double') && !m.weak.includes('accent')
    && !m.weak.includes('leftWeak') && !m.weak.includes('rightWeak') && !m.weak.includes('unsteady');
}

export const TIPS = {
  miss:     { say: 'היו מכות שלא שמעתי. נסה לא לדלג על אף מכה, גם אם זה יוצא לא מושלם.', short: 'פספוסים' },
  extra:    { say: 'שמעתי מכות מיותרות. אולי המקל קפץ לבד? תחזיק אותו קצת יותר חזק.', short: 'מכות מיותרות' },
  rush:     { say: 'אתה ממהר! המכות מגיעות לפני הטיק. תקשיב למטרונום ותחכה לו.', short: 'ממהר' },
  drag:     { say: 'אתה קצת מאחר. נסה להכות בדיוק ביחד עם הטיק.', short: 'מאחר' },
  unsteady: { say: 'הקצב קופץ קצת. תנשום, תספור בראש, וניגן אחיד כמו שעון.', short: 'קצב לא יציב' },
  double:   { say: 'המכה השנייה בתאומים חלשה. תן לה להישמע חזק כמו הראשונה!', short: 'מכה שנייה חלשה' },
  leftWeak: { say: 'יד שמאל חלשה יותר מימין. תן לה להכות קצת יותר חזק.', short: 'שמאל חלשה' },
  rightWeak:{ say: 'יד ימין חלשה יותר משמאל. תן לה להכות קצת יותר חזק.', short: 'ימין חלשה' },
  accent:   { say: 'המכה החזקה לא מספיק חזקה. תרים גבוה רק את המקל שלה, ואת השאר תשאיר נמוך.', short: 'אקצנט חלש' },
  uneven:   { say: 'המכות לא באותה עוצמה. נסה שכולן יישמעו אותו דבר.', short: 'עוצמה לא אחידה' },
};
