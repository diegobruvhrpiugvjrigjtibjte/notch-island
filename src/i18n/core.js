// Traduzione a dizionario: i testi dell'interfaccia sono scritti in italiano e ogni lingua e' un file JSON { exact, patterns }.
// exact: "testo italiano" -> "traduzione". patterns: [["^Hai (\\d+) attivita$", "You have $1 tasks"]] per i testi con numeri o nomi.
export function makeTr(dict) {
  const ex = (dict && dict.exact) || {}, pats = ((dict && dict.patterns) || []).map(([r, t]) => [new RegExp(r), t]);
  const tr = (s) => {
    if (typeof s !== 'string') return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2]; if (!core) return s;
    let out = Object.prototype.hasOwnProperty.call(ex, core) ? ex[core] : undefined;
    if (out === undefined) for (const [re, t] of pats) if (re.test(core)) { out = core.replace(re, t); break; }
    return out === undefined ? s : m[1] + out + m[3];
  };
  tr.has = (s) => { const c = String(s).trim(); return Object.prototype.hasOwnProperty.call(ex, c) || pats.some(([re]) => re.test(c)); };
  return tr;
}
export const LANGS = [['it', 'Italiano'], ['en', 'English']];
/** "auto" -> lingua del sistema se disponibile, altrimenti inglese */
export function resolveLang(setting, systemLocale) {
  if (setting && setting !== 'auto' && LANGS.some((l) => l[0] === setting)) return setting;
  const code = String(systemLocale || '').slice(0, 2).toLowerCase(); return LANGS.some((l) => l[0] === code) ? code : 'en';
}
