// Falling-notes highway on canvas. Left lane = left hand, right lane = right hand.
import { audio } from './audio.js';

const JTEXT = { perfect: 'מושלם!', good: 'יופי', early: 'מוקדם', late: 'מאוחר', miss: 'פספוס', extra: 'מכה נוספת' };
const JCOL = { perfect: '#3BE39C', good: '#7FD6FF', early: '#FFC433', late: '#FFC433', miss: '#FF6B8B', extra: '#B9C3E0' };

export class Highway {
  constructor(canvas, { onPos } = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.onPos = onPos;
    this.round = null; this.demo = false; this.pops = []; this.flashes = { L: 0, R: 0 }; this.raf = 0; this.lastPos = -1; this.combo = 0;
    this.resize = this.resize.bind(this); window.addEventListener('resize', this.resize); this.resize();
  }
  resize() {
    const w = this.cv.clientWidth || 340, h = Math.round(Math.min(380, Math.max(280, w * 0.78)));
    this.W = w; this.H = h; this.cv.style.height = h + 'px';
    this.cv.width = w * devicePixelRatio; this.cv.height = h * devicePixelRatio; this.g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  setRound(round, { demo = false } = {}) { this.round = round; this.demo = demo; this.pops = []; this.lastPos = -1; this.combo = 0; }
  judge(note, j) {
    const lane = note ? note.hand : null;
    if (lane) this.flashes[lane] = performance.now();
    if (j === 'perfect' || j === 'good') this.combo++; else if (j !== 'extra') this.combo = 0;
    this.pops.push({ lane, text: JTEXT[j], col: JCOL[j], t: performance.now() });
    if (this.pops.length > 8) this.pops.shift();
  }
  start() { cancelAnimationFrame(this.raf); const f = () => { this.draw(); this.raf = requestAnimationFrame(f); }; f(); }
  stop() { cancelAnimationFrame(this.raf); }
  destroy() { this.stop(); window.removeEventListener('resize', this.resize); }

  draw() {
    const g = this.g, W = this.W, H = this.H, r = this.round;
    const outLat = (audio.ctx && (audio.ctx.outputLatency || audio.ctx.baseLatency)) || 0;
    const now = audio.now() - outLat;
    g.clearRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#15203D'); bg.addColorStop(1, '#22305A'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const hitY = H - 64, laneW = Math.min(150, W * 0.36), gap = Math.min(40, W * 0.08);
    const xL = W / 2 - gap / 2 - laneW / 2, xR = W / 2 + gap / 2 + laneW / 2;
    const look = r ? Math.min(2.6, Math.max(1.5, r.beat * 2.4)) : 2, pps = (hitY - 10) / look;
    const yOf = t => hitY - (t - now) * pps;

    // lanes
    [[xL, '46,102,245'], [xR, '255,115,36']].forEach(([x, c]) => {
      const lg = g.createLinearGradient(0, 0, 0, hitY); lg.addColorStop(0, `rgba(${c},0)`); lg.addColorStop(1, `rgba(${c},.16)`);
      g.fillStyle = lg; roundRect(g, x - laneW / 2, 0, laneW, hitY + 30, 14); g.fill();
    });
    if (r) {
      // beat lines
      r.clicks.forEach(c => { const y = yOf(c.t); if (y < -4 || y > hitY + 2) return; g.strokeStyle = c.strong ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.13)'; g.lineWidth = c.strong ? 2 : 1; g.beginPath(); g.moveTo(xL - laneW / 2, y); g.lineTo(xR + laneW / 2, y); g.stroke(); });
    }
    // pads
    const nowMs = performance.now();
    [['L', xL, '#2E66F5', 'שמאל'], ['R', xR, '#FF7324', 'ימין']].forEach(([h, x, col, name]) => {
      const f = Math.max(0, 1 - (nowMs - this.flashes[h]) / 180);
      g.fillStyle = col; g.globalAlpha = 0.35 + 0.65 * f;
      g.beginPath(); g.ellipse(x, hitY, laneW / 2 - 6 + f * 6, 22 + f * 4, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = '#fff'; g.globalAlpha = .55; g.lineWidth = 3; g.beginPath(); g.ellipse(x, hitY, laneW / 2 - 6, 22, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.font = '600 15px Fredoka, "Varela Round", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${h} · ${name}`, x, hitY + 42);
    });
    if (!r) return;
    // notes
    let curPos = -1;
    for (const n of r.notes) {
      const y = yOf(n.t);
      if (n.t <= now + 0.03) curPos = n.pos;
      if (y < -40) break;
      if (this.demo && n.t <= now && !n._demoHit) { n._demoHit = true; this.flashes[n.hand] = nowMs; }
      if (n.match && n.t < now) continue;
      if (y > H + 30) continue;
      const x = n.hand === 'L' ? xL : xR, rad = n.acc ? 25 : 19, missed = !n.match && n.t < now - r.iv * 0.5 && !this.demo;
      if (this.demo && n.t < now) continue;
      g.globalAlpha = missed ? 0.35 : 1;
      g.fillStyle = n.hand === 'L' ? '#2E66F5' : '#FF7324';
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.lineWidth = n.acc ? 5 : 3; g.strokeStyle = n.acc ? '#FFC433' : 'rgba(255,255,255,.85)'; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 ${n.acc ? 22 : 18}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.hand, x, y + 1);
      g.globalAlpha = 1;
    }
    if (curPos !== this.lastPos && now >= r.t0 - 0.02) { this.lastPos = curPos; this.onPos && this.onPos(curPos); }
    // judgement pops
    this.pops.forEach(p => {
      const age = (nowMs - p.t) / 700; if (age > 1) return;
      const x = p.lane === 'L' ? xL : p.lane === 'R' ? xR : W / 2;
      g.globalAlpha = 1 - age; g.fillStyle = p.col; g.font = '700 22px Fredoka, "Varela Round", sans-serif'; g.textAlign = 'center';
      g.fillText(p.text, x, hitY - 46 - age * 30); g.globalAlpha = 1;
    });
    // combo
    if (this.combo >= 8) { g.fillStyle = '#FFC433'; g.font = '700 18px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillText(`רצף ${this.combo}!`, W / 2, 22); }
    // count-in
    if (now < r.t0) {
      const c = [...r.clicks].reverse().find(c => c.countIn && c.t <= now);
      if (c) { const age = (now - c.t) / r.beat; g.globalAlpha = Math.max(0, 1 - age * 0.8); g.fillStyle = '#fff'; g.font = `700 ${92 - age * 20}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.n), W / 2, hitY * 0.45); g.globalAlpha = 1; }
    }
    // progress
    const prog = Math.max(0, Math.min(1, (now - r.t0) / (r.end - r.t0)));
    g.fillStyle = 'rgba(255,255,255,.15)'; roundRect(g, 12, H - 10, W - 24, 5, 3); g.fill();
    g.fillStyle = '#3BE39C'; roundRect(g, 12, H - 10, (W - 24) * prog, 5, 3); g.fill();
  }
}
function roundRect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
