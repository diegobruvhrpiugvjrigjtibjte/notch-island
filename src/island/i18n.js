// Traduzione dell'interfaccia: un osservatore del DOM traduce testi, segnaposto e suggerimenti man mano che compaiono.
import { makeTr, LANGS, resolveLang } from '../i18n/core.js';
import en from '../i18n/en.js';

export { LANGS };
const DICTS = { en };
export let lang = 'it';
export let tr = (s) => s;
export let locale = 'it-IT';
const NOTR = '.bub,.tx,#m-title,#m-artist,#m-lyr,.lyrics,.sb,.ans,.tabi,.an,.sh b,.cdisp b,.livel,#c-text,.nm'; // contenuti dell'utente: non si traducono
const ATTRS = ['placeholder', 'title', 'aria-label'];
export const missing = new Set();

export function initI18n(setting, systemLocale) {
  lang = resolveLang(setting, systemLocale); document.documentElement.lang = lang; locale = lang === 'it' ? 'it-IT' : 'en-GB';
  tr = lang === 'it' ? (s) => s : makeTr(DICTS[lang]);
  if (lang === 'it') return lang;
  const skip = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; return !e || ['SCRIPT', 'STYLE', 'WEBVIEW', 'TEXTAREA'].includes(e.tagName) || !!e.closest(NOTR); };
  const attrs = (e) => { for (const a of ATTRS) { const v = e.getAttribute(a); if (v) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } } };
  const walk = (n) => {
    if (n.nodeType === 3) { if (skip(n)) return; const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t; else if (/[a-zàèéìòù]{3}/i.test(v) && !tr.has(v)) missing.add(v.trim()); return; }
    if (n.nodeType !== 1 || skip(n)) return; attrs(n); n.childNodes.forEach(walk);
  };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'characterData') walk(m.target); else if (m.type === 'attributes') { if (!skip(m.target)) attrs(m.target); } else m.addedNodes.forEach(walk); } })
    .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body); return lang;
}
