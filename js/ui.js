// Shared UI: rendering helpers, the coach mascot and its voice, confetti, toasts, dialogs.

export const app = document.getElementById('app');
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function render(html) { stopSpeaking(); app.innerHTML = html; window.scrollTo(0, 0); }
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- mascot: "ריתמו", a snare drum with sticks ----------
export function mascotSVG() {
  return `<svg viewBox="0 0 120 134" aria-hidden="true">
  <ellipse cx="60" cy="128" rx="38" ry="5" fill="#000" opacity=".12"/>
  <g class="m-body">
    <g class="m-armL"><path d="M22 70 Q8 60 6 44" stroke="#F2C28B" stroke-width="7" stroke-linecap="round" fill="none"/><line x1="6" y1="44" x2="-6" y2="14" stroke="#B9824A" stroke-width="5" stroke-linecap="round"/><circle cx="-6" cy="14" r="4.5" fill="#E8D2B0"/></g>
    <g class="m-armR"><path d="M98 70 Q112 60 114 44" stroke="#F2C28B" stroke-width="7" stroke-linecap="round" fill="none"/><line x1="114" y1="44" x2="126" y2="14" stroke="#B9824A" stroke-width="5" stroke-linecap="round"/><circle cx="126" cy="14" r="4.5" fill="#E8D2B0"/></g>
    <rect x="20" y="44" width="80" height="70" rx="12" fill="#FF7324"/>
    <path d="M20 58 L100 58 M20 100 L100 100" stroke="#C4520F" stroke-width="3"/>
    <path d="M28 58 L44 100 L60 58 L76 100 L92 58" stroke="#FFD7BD" stroke-width="2.5" fill="none" stroke-linejoin="round"/>
    <ellipse cx="60" cy="44" rx="40" ry="11" fill="#FFF6EC" stroke="#C9B8A4" stroke-width="3"/>
    <rect x="20" y="108" width="80" height="8" rx="4" fill="#C4520F"/>
    <g class="m-eyes">
      <ellipse cx="46" cy="76" rx="8" ry="9.5" fill="#fff"/><ellipse cx="74" cy="76" rx="8" ry="9.5" fill="#fff"/>
      <circle cx="47.5" cy="78" r="4.6" fill="#182544"/><circle cx="75.5" cy="78" r="4.6" fill="#182544"/>
      <circle cx="49" cy="76" r="1.6" fill="#fff"/><circle cx="77" cy="76" r="1.6" fill="#fff"/>
    </g>
    <ellipse cx="36" cy="90" rx="5" ry="3" fill="#FF9E9E" opacity=".7"/><ellipse cx="84" cy="90" rx="5" ry="3" fill="#FF9E9E" opacity=".7"/>
    <ellipse class="m-mouth" cx="60" cy="93" rx="7" ry="5" fill="#7A1E1E"/>
  </g></svg>`;
}
export function coachHTML(text = '', big = false) {
  return `<div class="coach ${big ? 'big' : ''}" id="coach"><div class="mascot" id="mascot">${mascotSVG()}</div>
    <div class="bubble"><button class="again" id="sayAgain" aria-label="שמע שוב">🔊</button><span id="coachText">${esc(text)}</span></div></div>`;
}
export function mood(m) { const el = $('#mascot'); if (el) { el.classList.remove('cheer', 'think'); if (m) el.classList.add(m); } }

// ---------- voice ----------
let voiceCfg = { on: true, rate: 1 }, heVoice = null, lastLine = '';
export function setVoice(cfg) { voiceCfg = { ...voiceCfg, ...cfg }; }
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    const he = vs.filter(v => /^(he|iw)/i.test(v.lang));
    heVoice = he.find(v => /female|carmit|google/i.test(v.name)) || he[0] || null;
  } catch (e) { heVoice = null; }
}
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {}
export function hasHebrewVoice() { pickVoice(); return !!heVoice; }
// Browsers refuse speech until the first tap on the page. Until then the line is only shown, and that tap speaks it.
let speechLocked = !(navigator.userActivation?.hasBeenActive ?? true);
export function stopSpeaking() { try { speechSynthesis.cancel(); } catch (e) {} const m = $('#mascot'); if (m) m.classList.remove('talking'); }

// Shows the line in the bubble and speaks it. Resolves when finished (or a reading-time fallback).
export function say(text, opts = {}) {
  lastLine = text;
  const t = $('#coachText'); if (t) t.textContent = text;
  const again = $('#sayAgain'); if (again) again.onclick = () => say(lastLine);
  if (opts.mood !== undefined) mood(opts.mood);
  const fallback = Math.min(9000, 900 + text.length * 55);
  if (!voiceCfg.on || speechLocked || !('speechSynthesis' in window)) return sleep(opts.wait === false ? 0 : Math.min(fallback, 2500));
  pickVoice();
  return new Promise(res => {
    let done = false; const finish = () => { if (done) return; done = true; const m = $('#mascot'); if (m) m.classList.remove('talking'); res(); };
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[>›]/g, ''));
      u.lang = 'he-IL'; if (heVoice) u.voice = heVoice; u.rate = voiceCfg.rate; u.pitch = 1.12;
      u.onend = finish; u.onerror = finish;
      const m = $('#mascot'); if (m) m.classList.add('talking');
      speechSynthesis.speak(u);
      setTimeout(finish, fallback * 1.6 / voiceCfg.rate + 1500);
    } catch (e) { finish(); }
  });
}

// ---------- feedback ----------
let toastT;
export function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, ms); }

const cvs = $('#confetti'), cg = cvs.getContext('2d'); let parts = [], craf = 0;
export function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cvs.width = innerWidth * devicePixelRatio; cvs.height = innerHeight * devicePixelRatio; cg.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  const cols = ['#FF7324', '#2E66F5', '#FFC433', '#1FB57A', '#E5466B', '#9B6BFF'];
  for (let i = 0; i < n; i++) parts.push({ x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .5, y: innerHeight * .3, vx: (Math.random() - .5) * 13, vy: -Math.random() * 13 - 4, r: Math.random() * 7 + 5, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .3, life: 150 });
  if (!craf) loop();
}
function loop() {
  cg.clearRect(0, 0, innerWidth, innerHeight);
  parts.forEach(p => { p.vy += .33; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a += p.va; p.life--; cg.save(); cg.translate(p.x, p.y); cg.rotate(p.a); cg.fillStyle = p.c; cg.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); cg.restore(); });
  parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 30);
  craf = parts.length ? requestAnimationFrame(loop) : 0;
  if (!craf) cg.clearRect(0, 0, innerWidth, innerHeight);
}

export function confirmBox(text, yes = 'כן', no = 'ביטול') {
  return new Promise(res => {
    const o = document.createElement('div'); o.className = 'overlay';
    o.innerHTML = `<div class="card" role="dialog" aria-modal="true"><p style="font-size:18px">${esc(text)}</p><div class="row" style="justify-content:flex-start"><button class="btn danger" data-a="1">${esc(yes)}</button><button class="btn" data-a="0">${esc(no)}</button></div></div>`;
    o.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) { o.remove(); res(b.dataset.a === '1'); } });
    document.body.appendChild(o); o.querySelector('[data-a="0"]').focus();
  });
}

// A tap that lands while the coach is still talking is remembered, and cuts the speech.
document.addEventListener('click', e => {
  if (speechLocked) { speechLocked = false; if (lastLine) say(lastLine); else try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch (err) {} }
  const b = e.target.closest('button'); if (b) { b.dataset.pressed = '1'; if (b.id === 'play' || b.id === 'next' || b.id === 'go') stopSpeaking(); } }, true);

// ---------- wake lock ----------
let wake = null;
export async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } else if (!on && wake) { await wake.release(); wake = null; } } catch (e) { wake = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && wake === null && document.body.dataset.awake === '1') keepAwake(true); });

export function starsHTML(n, max = 3) { return `<span class="stars">${Array.from({ length: max }, (_, i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('')}</span>`; }
export function stickHTML(p) { let out = '', acc = false; for (const c of p) { if (c === '>') { acc = true; continue; } out += acc ? `<u style="text-decoration:none;font-weight:700">›${c}</u>` : c; acc = false; } return out; }
