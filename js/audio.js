// Audio engine: AudioContext, microphone + onset worklet, metronome and sound effects, calibration.

export const PROFILES = {
  // Rubber pad: sharp, bright stick transient -> listen above 1.8 kHz, click is a soft low "wood" tone.
  pad:    { filter: { type: 'highpass', freq: 1800 }, clickFreq: 520,  clickType: 'sine',     clickAttack: 0.006 },
  // Pillow/book: dull thud -> listen below 350 Hz, click is a high short tick.
  pillow: { filter: { type: 'lowpass',  freq: 350 },  clickFreq: 2600, clickType: 'sine',     clickAttack: 0.001 },
};

class Engine {
  constructor() {
    this.ctx = null; this.node = null; this.stream = null; this.micOk = false;
    this.onsetHandlers = new Set(); this.meterHandlers = new Set();
    this.scheduled = []; this.master = null; this.volume = 0.9;
    this.profile = PROFILES.pad;
  }
  async init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  setProfile(name) { this.profile = PROFILES[name] || PROFILES.pad; }

  async startMic() {
    await this.init();
    if (this.micOk) return { ok: true };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { ok: false, reason: 'unsupported' };
    if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
      });
    } catch (e) {
      return { ok: false, reason: e && e.name === 'NotAllowedError' ? 'denied' : 'nodevice' };
    }
    const dispatch = (m) => {
      if (m.type === 'onset') this.onsetHandlers.forEach(h => h(m));
      else if (m.type === 'meter') this.meterHandlers.forEach(h => h(m));
    };
    const mic = this.ctx.createMediaStreamSource(this.stream);
    // 1) audio-thread detector (precise, normal case)
    try {
      const url = window.__WORKLET_SRC
        ? URL.createObjectURL(new Blob([window.__WORKLET_SRC], { type: 'application/javascript' }))
        : new URL('../onset-worklet.js', import.meta.url);
      await this.ctx.audioWorklet.addModule(url);
      this.node = new AudioWorkletNode(this.ctx, 'onset-detector', { numberOfInputs: 1, numberOfOutputs: 0 });
      this.node.port.onmessage = e => dispatch(e.data);
      mic.connect(this.node);
      this.mode = 'worklet';
    } catch (e) {
      // 2) fallback: same detector on the main thread (worklets are blocked when opened from disk)
      try {
        const code = window.__WORKLET_SRC || await (await fetch(new URL('../onset-worklet.js', import.meta.url))).text();
        const Core = new Function(code + '\n;return DetectorCore;')();
        const size = 512, core = new Core(this.ctx.sampleRate, dispatch);
        const sp = this.ctx.createScriptProcessor(size, 1, 1), mute = this.ctx.createGain(); mute.gain.value = 0;
        sp.onaudioprocess = ev => core.process(ev.inputBuffer.getChannelData(0), ev.playbackTime - size / this.ctx.sampleRate);
        mic.connect(sp); sp.connect(mute); mute.connect(this.ctx.destination);
        this.core = core; this.sp = sp; this.mode = 'main';
      } catch (e2) { return { ok: false, reason: 'worklet' }; }
    }
    this.micOk = true;
    return { ok: true };
  }
  config(c) { if (this.node) this.node.port.postMessage({ type: 'config', ...c }); else if (this.core) this.core.config(c); }
  onOnset(fn) { this.onsetHandlers.add(fn); return () => this.onsetHandlers.delete(fn); }
  onMeter(fn) { this.meterHandlers.add(fn); return () => this.meterHandlers.delete(fn); }

  // ---------- sounds ----------
  _tone(t, freq, vol, dur, type = 'sine', attack = 0.003) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.03);
    this.scheduled.push(o);
    return o;
  }
  click(t, strong) {
    const p = this.profile;
    this._tone(t, strong ? p.clickFreq * 1.5 : p.clickFreq, strong ? 0.55 : 0.38, 0.06, p.clickType, p.clickAttack);
  }
  guide(t, hand, accent) { this._tone(t, hand === 'R' ? 880 : 587, accent ? 0.32 : 0.15, 0.08, 'triangle'); }
  burst(t, vol = 0.8) { // broadband click for latency loopback
    const c = this.ctx, len = Math.floor(c.sampleRate * 0.004), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), g = c.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(this.master); s.start(t);
    this.scheduled.push(s);
  }
  sfx(name) {
    if (!this.ctx) return; const t = this.ctx.currentTime + 0.02;
    const seq = {
      win:   [[523, 0], [659, .09], [784, .18], [1047, .27]],
      big:   [[523, 0], [659, .1], [784, .2], [1047, .3], [784, .42], [1047, .52], [1319, .64]],
      soft:  [[660, 0], [880, .1]],
      oops:  [[392, 0], [330, .16]],
      pop:   [[990, 0]],
      count: [[700, 0]],
    }[name] || [];
    seq.forEach(([f, d]) => this._tone(t + d, f, name === 'pop' ? 0.12 : 0.22, 0.2, 'triangle', 0.004));
  }
  stopAll() { this.scheduled.forEach(n => { try { n.stop(); } catch (e) {} }); this.scheduled = []; }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
}
export const audio = new Engine();

// ---------- calibration helpers ----------
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const wait = ms => new Promise(r => setTimeout(r, ms));

export async function measureNoise(ms = 1800) {
  audio.config({ filter: audio.profile.filter, meter: true });
  const levels = []; const off = audio.onMeter(m => levels.push(m.level));
  await wait(ms); off();
  levels.sort((a, b) => a - b);
  return { median: levels[Math.floor(levels.length * 0.5)] || 0, p90: levels[Math.floor(levels.length * 0.9)] || 0 };
}

// Collect strokes for N seconds with a provisional threshold. Returns peaks.
export async function collectStrokes(threshold, ms, onStroke) {
  audio.config({ filter: audio.profile.filter, threshold, refractory: 0.12, enabled: true });
  const hits = []; const off = audio.onOnset(o => { hits.push(o); onStroke && onStroke(o, hits.length); });
  await wait(ms); off(); return hits;
}

// Speaker -> mic round trip using broadband bursts (works only without headphones).
export async function loopbackLatency(noiseLevel) {
  await audio.init();
  audio.config({ filter: { type: 'none', freq: 0 }, threshold: Math.max(0.01, noiseLevel * 8), refractory: 0.2, enabled: true });
  const t0 = audio.now() + 0.4, times = [];
  for (let i = 0; i < 8; i++) { const t = t0 + i * 0.45; times.push(t); audio.burst(t, 0.9); }
  const hits = []; const off = audio.onOnset(o => hits.push(o));
  await wait((0.4 + 8 * 0.45 + 0.6) * 1000); off();
  const lags = [];
  times.forEach(t => { const h = hits.find(x => x.time >= t && x.time < t + 0.4); if (h) lags.push(h.time - t); });
  audio.config({ filter: audio.profile.filter });
  if (lags.length < 5) return null;
  const m = median(lags), mad = median(lags.map(x => Math.abs(x - m)));
  if (mad > 0.012) return null;
  return m;
}

// Fallback: child plays along with clicks; median offset becomes the latency.
export async function tapLatency(threshold, onStroke) {
  await audio.init();
  audio.config({ filter: audio.profile.filter, threshold, refractory: 0.25, enabled: true });
  const bpm = 80, iv = 60 / bpm, t0 = audio.now() + 0.6, n = 16, times = [];
  for (let i = 0; i < n; i++) { const t = t0 + i * iv; times.push(t); audio.click(t, i % 4 === 0); }
  const hits = []; const off = audio.onOnset(o => { hits.push(o); onStroke && onStroke(o); });
  await wait((0.6 + n * iv + 0.5) * 1000); off();
  const offs = [];
  times.slice(4).forEach(t => { let best = null, bd = 1; hits.forEach(h => { const d = h.time - t; if (Math.abs(d) < bd) { bd = Math.abs(d); best = d; } }); if (best != null && Math.abs(best) < iv * 0.45) offs.push(best); });
  if (offs.length < 6) return null;
  return Math.max(0, median(offs));
}

// How loud our own metronome click looks to the detector (for gating when no headphones).
export async function measureClickBleed(threshold, latency) {
  await audio.init();
  audio.config({ filter: audio.profile.filter, threshold: threshold * 0.5, refractory: 0.1, enabled: true });
  const t0 = audio.now() + 0.4, times = [];
  for (let i = 0; i < 6; i++) { const t = t0 + i * 0.5; times.push(t); audio.click(t, i % 2 === 0); }
  const hits = []; const off = audio.onOnset(o => hits.push(o));
  await wait((0.4 + 6 * 0.5 + 0.4) * 1000); off();
  let mx = 0;
  times.forEach(t => hits.forEach(h => { if (Math.abs(h.time - (t + latency)) < 0.03) mx = Math.max(mx, h.peak); }));
  audio.config({ threshold });
  return mx;
}
