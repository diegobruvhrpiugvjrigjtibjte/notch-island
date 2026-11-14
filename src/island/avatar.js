// Avatar blu di Vault Semplice per la scheda Assistente: segue il cursore e reagisce agli stati dell'assistente.
const HTML = `<div class="va-position">
  <div class="va-aura" aria-hidden="true"></div>
  <div class="va-character" aria-hidden="true">
   <span class="va-bail"></span>
   <span class="va-body"><span class="va-edge"></span><span class="va-shine"></span><span class="va-face"><span class="va-eye va-left"></span><span class="va-eye va-right"></span><span class="va-cheek va-cheek-left"></span><span class="va-cheek va-cheek-right"></span><span class="va-mouth"></span></span><span class="va-emblem">V</span></span>
   <span class="va-hand va-hand-left"></span><span class="va-hand va-hand-right"></span>
   <span class="va-glint va-glint-a">&#10023;</span><span class="va-glint va-glint-b">&#10022;</span>
  </div>
  <div class="va-shadow" aria-hidden="true"></div>
 </div>`;
const all = [];
let timer = 0;

export function mountAvatar(el) {
  el.classList.add('vav'); el.innerHTML = HTML; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Vault, assistente');
  const a = { el, body: el.querySelector('.va-character') }; all.push(a); return a;
}
/** stato: idle | listening | thinking | talking | happy | protect */
export function setAvatarState(state) {
  const cls = { listening: 'va-listen', thinking: 'va-think', transcribing: 'va-think', talking: 'va-talk', happy: 'va-wave', protect: 'va-protect' }[state] || '';
  clearTimeout(timer);
  for (const a of all) { a.el.classList.remove('va-listen', 'va-think', 'va-talk', 'va-wave', 'va-protect'); void a.el.offsetWidth; if (cls) a.el.classList.add(cls); }
  if (state === 'happy' || state === 'protect') timer = setTimeout(() => { for (const a of all) a.el.classList.remove('va-wave', 'va-protect'); }, 2200);
}
/** il cursore (coordinate della finestra) sposta lo sguardo e inclina leggermente il lucchetto */
export function avatarLook(x, y) {
  for (const a of all) {
    const r = a.body.getBoundingClientRect(); if (!r.width) continue;
    const dx = (x - (r.x + r.width / 2)) / 25, dy = (y - (r.y + r.height / 2)) / 28;
    a.el.style.setProperty('--va-x', Math.max(-4, Math.min(4, dx)) + 'px'); a.el.style.setProperty('--va-y', Math.max(-3, Math.min(3, dy)) + 'px'); a.el.style.setProperty('--va-tilt', Math.max(-7, Math.min(7, dx * 1.5)) + 'deg');
  }
}
