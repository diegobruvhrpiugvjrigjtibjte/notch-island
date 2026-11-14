// La faccina di NotchIsland: occhi che seguono il mouse, sbatte le palpebre e cambia espressione secondo cio' che succede.
// Umori: idle, happy, sleepy, thinking, alert, listening, talking, surprised, love
const SVG = `<svg class="fsvg" viewBox="0 0 48 48" aria-hidden="true">
  <g class="rings"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="19"/></g>
  <g class="head">
    <ellipse class="cheek" cx="10.5" cy="30" rx="4" ry="2.6"/><ellipse class="cheek" cx="37.5" cy="30" rx="4" ry="2.6"/>
    <g class="eyes"><g class="look">
      <g class="eye l"><rect x="12.5" y="13" width="7" height="12" rx="3.5"/></g>
      <g class="eye r"><rect x="28.5" y="13" width="7" height="12" rx="3.5"/></g>
      <path class="arc" d="M11.5 23 Q16 15 20.5 23"/><path class="arc" d="M27.5 23 Q32 15 36.5 23"/>
      <path class="heart" d="M16 26 C10 21 11 16 14.2 16 C15.4 16 16 17 16 17 C16 17 16.6 16 17.8 16 C21 16 22 21 16 26Z"/><path class="heart" d="M32 26 C26 21 27 16 30.2 16 C31.4 16 32 17 32 17 C32 17 32.6 16 33.8 16 C37 16 38 21 32 26Z"/>
    </g></g>
    <path class="mouth" d="M19 33 Q24 36 29 33"/>
    <ellipse class="mouth-o" cx="24" cy="34" rx="3" ry="3.6"/>
  </g>
  <g class="zzz"><text x="34" y="12">z</text><text x="39" y="7" class="z2">z</text></g>
  <g class="dots"><circle cx="34" cy="8" r="1.8"/><circle cx="39" cy="8" r="1.8"/><circle cx="44" cy="8" r="1.8"/></g>
  <g class="bang"><rect x="40" y="2" width="3.4" height="8" rx="1.7"/><circle cx="41.7" cy="13.5" r="1.9"/></g>
</svg>`;

const faces = []; let mood = 'idle', override = '', overrideT = 0, cursor = { x: -999, y: -999 }, blinkT = 0;
let enabled = true;

export function mountFace(el, opts = {}) {
  el.classList.add('face'); el.innerHTML = SVG;
  const f = { el, svg: el.firstElementChild, big: !!opts.big };
  faces.push(f); el.dataset.mood = mood; look(f);
  el.addEventListener('click', (e) => { e.stopPropagation(); poke(); });
  return f;
}

function look(f) {
  const r = f.el.getBoundingClientRect(); if (!r.width) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = cursor.x - cx, dy = cursor.y - cy, dist = Math.hypot(dx, dy) || 1;
  const mag = Math.min(1, dist / (f.big ? 140 : 90));
  f.svg.style.setProperty('--lx', (dx / dist * mag).toFixed(3)); f.svg.style.setProperty('--ly', (dy / dist * mag).toFixed(3));
}

export function setCursor(x, y) { cursor = { x, y }; for (const f of faces) look(f); }
export function relook() { for (const f of faces) look(f); }

// le reazioni brevi (sorpresa, cuore, gioia) non coprono gli stati "veri" (ascolto, pensiero, allerta, parlato)
const STRONG = ['listening', 'talking', 'thinking', 'alert'];
const shown = () => (override && (!STRONG.includes(mood) || override === 'surprised' || override === 'love') ? override : mood);
function paint() { const m = shown(); for (const f of faces) f.el.dataset.mood = m; }
export function setMood(m) { if (m !== mood) { mood = m; paint(); } }
export function getMood() { return shown(); }
export function flash(m, ms = 1200) { override = m; clearTimeout(overrideT); overrideT = setTimeout(() => { override = ''; paint(); }, ms); paint(); }
export function setEnabled(v) { enabled = v; for (const f of faces) f.el.classList.toggle('off', !v); }
export function isEnabled() { return enabled; }

let pokes = [];
function poke() {
  const now = Date.now(); pokes = pokes.filter((t) => now - t < 4000); pokes.push(now);
  if (pokes.length >= 5) { pokes = []; flash('love', 3800); } else flash('surprised', 900);
}

// palpebre: ogni 2.5-6 secondi
function blink() {
  const m = shown();
  if (m !== 'sleepy' && m !== 'happy' && m !== 'love') { for (const f of faces) f.el.classList.add('blink'); setTimeout(() => { for (const f of faces) f.el.classList.remove('blink'); }, 130); }
  blinkT = setTimeout(blink, 2500 + Math.random() * 3500);
}
blink();
