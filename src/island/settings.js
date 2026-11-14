// Scheda Impostazioni: tutto cio' che si puo' personalizzare.
import { icon } from '../shared/icons.js';
import { mountFace } from './face.js';
import { WIDGETS } from './widgets.js';
import { LANGS } from '../i18n/core.js';

const ACCENTS = ['#8ab4ff', '#7ee0b0', '#ffb86b', '#ff7a90', '#c39bff', '#6fd8e8', '#f2e06b', '#ffffff'];
const LANG_OPTS = [['auto', 'Automatica'], ...LANGS];
const THEMES = [['black', 'Nero'], ['graphite', 'Grafite'], ['midnight', 'Mezzanotte'], ['light', 'Chiaro'], ['auto', 'Automatico']];
export const TAB_LIST = [['media', 'Musica'], ['assistant', 'Assistente'], ['claude', 'Claude'], ['widgets', 'Widget'], ['clip', 'Appunti'], ['shelf', 'File'], ['ctrl', 'Controlli'], ['apps', 'App'], ['web', 'Web']];
const KEYS = [['toggle', 'Apri o chiudi l\'isola'], ['assistant', 'Parla con l\'assistente'], ['playpause', 'Play / pausa'], ['mic', 'Microfono'], ['shot', 'Screenshot'], ['color', 'Selettore colore'], ['hide', 'Nascondi tutto']];

function accel(e) {
  const k = e.key; if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean); if (!mods.length) return null;
  const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' };
  const key = map[k] || (k.length === 1 ? k.toUpperCase() : k); return [...mods, key].join('+');
}

export function initSettings(root, ctx) {
  const { api } = ctx;
  let voice = null;
  const seg = (name, opts, cur) => `<div class="seg2" data-seg="${name}">${opts.map((o) => `<button data-v="${o[0]}" class="${String(o[0]) === String(cur) ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
  const sw = (name, label, on) => `<label class="switch"><input type="checkbox" data-sw="${name}"${on ? ' checked' : ''}><i></i><span>${label}</span></label>`;

  async function render() {
    const s = ctx.settings(); voice = await api.invoke('voice:status'); const dp = await api.invoke('displays');
    root.innerHTML = `<div class="sgrid">
      <div class="card"><h4>Lingua</h4>${seg('lang', LANG_OPTS, s.lang)}<p class="sub">Cambia la lingua dell'isola, dell'assistente e del riconoscimento vocale.</p>
        <h4 style="margin-top:12px">Aspetto</h4>${seg('theme', THEMES, s.theme)}
        <div class="sublabel">Colore</div><div class="swatches">${ACCENTS.map((a) => `<button class="swatch${s.accent === a ? ' on' : ''}" data-accent="${a}" style="background:${a}" aria-label="${a}"></button>`).join('')}</div>
        <div class="sublabel">Schermo</div>${dp.list.length > 1 ? seg('display', [['primary', 'Principale'], ...dp.list.map((d) => [d.id, 'Schermo ' + d.label])], dp.current) : '<p class="sub">Un solo schermo collegato.</p>'}
        <div class="sublabel">Posizione</div>${seg('mode', [['floating', 'Fluttuante'], ['notch', 'Notch']], s.mode)}
        <div class="sublabel">Dimensione della pillola</div>${seg('scale', [[0.9, 'Piccola'], [1, 'Media'], [1.12, 'Grande']], s.scale)}
        <label class="slider"><span>Arrotondamento</span><input type="range" class="range" data-radius min="14" max="38" value="${s.radius}"></label>
        <div class="sublabel">Apertura</div>${seg('openOn', [['hover', 'Al passaggio'], ['click', 'Al clic']], s.openOn)}</div>
      <div class="card"><h4>Faccina</h4><div class="facerow"><div id="face-s"></div><div>${sw('face.on', 'Mostra la faccina', s.face.on)}${sw('face.sleepy', 'Si addormenta se non la usi', s.face.sleepy)}</div></div>
        <p class="sub" style="margin-top:8px">Segue il mouse, sorride con la musica, ti avvisa quando Claude ti aspetta. Cliccala per farle una sorpresa.</p>
        <h4 style="margin-top:12px">Pillola chiusa</h4>${seg('compact', [['auto', 'Automatico'], ['clock', 'Orologio'], ['track', 'Musica'], ['none', 'Solo faccina']], s.compact)}
        ${sw('autostart', 'Avvia con Windows', s.autostart !== false)}${sw('clock24', 'Orologio a 24 ore', s.clock24)}${sw('seconds', 'Mostra i secondi', s.seconds)}</div>
      <div class="card"><h4>Schede visibili</h4><div class="checks">${TAB_LIST.map((t) => `<label class="chk"><input type="checkbox" data-tab="${t[0]}"${s.tabsOff.includes(t[0]) ? '' : ' checked'}><span>${t[1]}</span></label>`).join('')}</div>
        <p class="sub" style="margin-top:8px">I widget si scelgono e si riordinano dalla scheda Widget, con "Personalizza".</p></div>
      <div class="card"><h4>Assistente</h4>${sw('assistant.tts', 'Risponde a voce', s.assistant.tts)}${sw('assistant.claude', 'Passa a Claude Code quello che non capisce', s.assistant.claude)}
        <div class="sublabel">Cosa può fare Claude per te</div>${seg('agent', [['act', 'Agisce sul PC'], ['read', 'Solo legge'], ['off', 'Spento']], s.assistant.agent)}
        <div class="sublabel">Lingua del riconoscimento vocale</div>${seg('whisperLang', [['it', 'Italiano'], ['en', 'English'], ['auto', 'Automatica']], s.assistant.whisperLang)}
        <div class="vstat">${voice.ready ? `<span class="pill ok">voce installata</span>` : `<span class="pill">voce non installata</span> <button class="btn sm" data-vinst>Installa (${voice.sizeMB} MB)</button>`}</div></div>
      <div class="card"><h4>Claude Code</h4>${sw('claude.notify', 'Notifica di Windows quando Claude ti aspetta', s.claude.notify)}${sw('claude.sounds', 'Suoni delicati (ti aspetta / ha finito / timer)', s.claude.sounds)}</div>
      <div class="card keys"><h4>Scorciatoie (clic per cambiarle)</h4>${KEYS.map((k) => `<div><button class="kbtn" data-key="${k[0]}">${esc(s.shortcuts[k[0]] || '—')}</button><span>${k[1]}</span></div>`).join('')}</div>
      <div class="card"><h4>Informazioni</h4><p class="sub">NotchIsland parte con Windows e resta in alto. I dati (attività, note, promemoria) restano su questo PC. Il collegamento con Claude Code, VS Code e Chrome usa solo l'indirizzo locale 127.0.0.1.</p>
        <div class="row"><button class="btn sm ghost" data-reset>Ripristina le impostazioni</button></div></div>
    </div>`;
    mountFace(root.querySelector('#face-s'), { big: true });
    wire();
  }
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nest = (path, v) => path.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);

  function wire() {
    root.querySelectorAll('[data-seg]').forEach((g) => { g.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const n = g.dataset.seg; const raw = b.dataset.v; const v = n === 'scale' ? +raw : raw;
      if (n === 'lang') { ctx.setLang(v); return; }
      if (n === 'display') { ctx.patch({ display: raw }); setTimeout(render, 150); return; }
      ctx.patch(n === 'whisperLang' || n === 'agent' ? { assistant: { [n]: v } } : { [n]: v }); setTimeout(render, 60); }; });
    root.querySelectorAll('[data-accent]').forEach((b) => { b.onclick = () => { ctx.patch({ accent: b.dataset.accent }); setTimeout(render, 60); }; });
    root.querySelectorAll('[data-sw]').forEach((i) => { i.onchange = () => ctx.patch(nest(i.dataset.sw, i.checked)); });
    root.querySelectorAll('[data-tab]').forEach((i) => { i.onchange = () => { const off = new Set(ctx.settings().tabsOff); i.checked ? off.delete(i.dataset.tab) : off.add(i.dataset.tab); ctx.patch({ tabsOff: [...off] }); }; });
    const r = root.querySelector('[data-radius]'); r.oninput = () => ctx.preview({ radius: +r.value }); r.onchange = () => ctx.patch({ radius: +r.value });
    root.querySelectorAll('[data-key]').forEach((b) => { b.onclick = () => {
      b.textContent = 'Premi i tasti...'; b.classList.add('rec');
      const h = (e) => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape') { cleanup(); render(); return; } const a = accel(e); if (!a) return; cleanup(); ctx.patch({ shortcuts: { [b.dataset.key]: a } }); ctx.toast('Scorciatoia: ' + a); setTimeout(render, 80); };
      const cleanup = () => document.removeEventListener('keydown', h, true); document.addEventListener('keydown', h, true);
    }; });
    const vi = root.querySelector('[data-vinst]'); if (vi) vi.onclick = () => { ctx.goto('assistant'); ctx.installVoice(); };
    root.querySelector('[data-reset]').onclick = () => { if (confirm('Ripristinare tutte le impostazioni?')) { api.send('settings-reset'); setTimeout(render, 150); } };
  }
  return { render };
}
