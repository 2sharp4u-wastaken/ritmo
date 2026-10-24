// Onset detector. DetectorCore has no audio-thread dependencies, so the same logic runs
// inside an AudioWorklet (normal case) or on the main thread (fallback when worklets are blocked,
// e.g. when the single-file build is opened from disk).
class DetectorCore {
  constructor(sampleRate, post) {
    this.sr = sampleRate; this.post = post;
    this.hop = 64; this.hopPos = 0; this.hopPeak = 0;
    this.threshold = 0.02; this.floor = 0.001; this.floorMult = 4;
    this.refractory = 0.06; this.lastOnset = -1;
    this.capturing = false; this.capEnd = 0; this.capPeak = 0; this.capTime = 0;
    this.meterAcc = 0; this.meterN = 0; this.meterEvery = Math.round(sampleRate * 0.05);
    this.meterOn = true; this.enabled = true;
    this.setFilter('none', 0);
  }
  config(m) {
    if (m.threshold != null) this.threshold = m.threshold;
    if (m.refractory != null) this.refractory = m.refractory;
    if (m.floorMult != null) this.floorMult = m.floorMult;
    if (m.filter) this.setFilter(m.filter.type, m.filter.freq);
    if (m.meter != null) this.meterOn = m.meter;
    if (m.enabled != null) this.enabled = m.enabled;
  }
  // RBJ biquad, transposed direct form II
  setFilter(type, freq) {
    this.z1 = 0; this.z2 = 0;
    if (type === 'none') { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0; return; }
    const w0 = 2 * Math.PI * freq / this.sr, cs = Math.cos(w0), sn = Math.sin(w0), alpha = sn / (2 * 0.707);
    let b0, b1, b2;
    if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * cs / a0; this.a2 = (1 - alpha) / a0;
  }
  // ch: Float32Array block, t0: context time of its first sample
  process(ch, t0) {
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      const a = y < 0 ? -y : y;
      if (a > this.hopPeak) this.hopPeak = a;
      if (this.meterOn) { if (a > this.meterAcc) this.meterAcc = a; if (++this.meterN >= this.meterEvery) { this.post({ type: 'meter', level: this.meterAcc, floor: this.floor }); this.meterAcc = 0; this.meterN = 0; } }
      if (++this.hopPos >= this.hop) { this.onHop(this.hopPeak, t0 + (i - this.hop + 1) / this.sr); this.hopPos = 0; this.hopPeak = 0; }
    }
  }
  onHop(p, t) {
    if (this.capturing) {
      if (p > this.capPeak) this.capPeak = p;
      if (t >= this.capEnd) { this.capturing = false; if (this.enabled) this.post({ type: 'onset', time: this.capTime, peak: this.capPeak }); }
      return;
    }
    const thr = Math.max(this.threshold, this.floor * this.floorMult);
    if (p > thr && t - this.lastOnset >= this.refractory) {
      this.capturing = true; this.capTime = t; this.capPeak = p; this.capEnd = t + 0.012; this.lastOnset = t;
    } else if (p < thr) {
      this.floor = this.floor * 0.995 + p * 0.005; // slow floor tracking from quiet hops only
    }
  }
}

if (typeof registerProcessor === 'function') {
  class OnsetDetector extends AudioWorkletProcessor {
    constructor() {
      super();
      this.core = new DetectorCore(sampleRate, m => this.port.postMessage(m));
      this.port.onmessage = e => { if (e.data.type === 'config') this.core.config(e.data); };
    }
    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (ch) this.core.process(ch, currentFrame / sampleRate);
      return true;
    }
  }
  registerProcessor('onset-detector', OnsetDetector);
}
