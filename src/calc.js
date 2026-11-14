// Calcoli sicuri per l'assistente e per i widget: nessun eval, solo un piccolo parser di espressioni + conversioni di unita'.

/** Valuta un'espressione tipo "12*(3+4)/2", "2^10", "15% di 80" (gia' normalizzata). Lancia un errore se non valida. */
function evaluate(input) {
  let s = String(input).toLowerCase()
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:%|percento|percent)\s*(?:di|of)\s*(\d+(?:[.,]\d+)?)/g, '($1/100*$2)')
    .replace(/\bpiu\b|\bplus\b/g, '+').replace(/\bmeno\b|\bminus\b/g, '-')
    .replace(/\bdiviso(?: per)?\b|\bdivided by\b|\bfratto\b|÷/g, '/')
    .replace(/\bper\b|\btimes\b|\bmultiplied by\b|\bx\b|×/g, '*')
    .replace(/\belevato a\b|\bto the power of\b|\bpower\b|\*\*/g, '^')
    .replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, '');
  if (!/^[0-9+\-*/^%().]+$/.test(s)) throw new Error('espressione non valida');
  let i = 0;
  const peek = () => s[i];
  function num() {
    if (peek() === '(') { i++; const v = add(); if (peek() !== ')') throw new Error('parentesi'); i++; return v; }
    const m = /^\d+(?:\.\d+)?|^\.\d+/.exec(s.slice(i)); if (!m) throw new Error('numero atteso'); i += m[0].length; return parseFloat(m[0]);
  }
  function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return pow(); }
  function pow() { let b = num(); while (peek() === '%' && !/[0-9(]/.test(s[i + 1] || '')) { i++; b /= 100; } if (peek() === '^') { i++; const e = unary(); return Math.pow(b, e); } return b; }
  function mul() { let v = unary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const o = s[i++]; const r = unary(); if (o === '*') v *= r; else if (o === '/') { if (r === 0) throw new Error('divisione per zero'); v /= r; } else v %= r; } return v; }
  function add() { let v = mul(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; }
  const v = add(); if (i !== s.length) throw new Error('espressione non valida');
  if (!Number.isFinite(v)) throw new Error('risultato non valido');
  return Math.round(v * 1e10) / 1e10;
}

// ---------------------------------------------------------------- conversioni
const U = {
  // lunghezza (m)
  m: ['len', 1], metro: ['len', 1], metri: ['len', 1], meter: ['len', 1], meters: ['len', 1], km: ['len', 1000], chilometro: ['len', 1000], chilometri: ['len', 1000], kilometer: ['len', 1000], kilometers: ['len', 1000],
  cm: ['len', 0.01], centimetro: ['len', 0.01], centimetri: ['len', 0.01], mm: ['len', 0.001], mi: ['len', 1609.344], miglio: ['len', 1609.344], miglia: ['len', 1609.344], mile: ['len', 1609.344], miles: ['len', 1609.344],
  ft: ['len', 0.3048], piede: ['len', 0.3048], piedi: ['len', 0.3048], foot: ['len', 0.3048], feet: ['len', 0.3048], in: ['len', 0.0254], pollice: ['len', 0.0254], pollici: ['len', 0.0254], inch: ['len', 0.0254], inches: ['len', 0.0254], yd: ['len', 0.9144], yard: ['len', 0.9144], yards: ['len', 0.9144],
  // massa (kg)
  kg: ['mass', 1], chilo: ['mass', 1], chili: ['mass', 1], chilogrammo: ['mass', 1], chilogrammi: ['mass', 1], kilogram: ['mass', 1], kilograms: ['mass', 1], g: ['mass', 0.001], grammo: ['mass', 0.001], grammi: ['mass', 0.001], gram: ['mass', 0.001], grams: ['mass', 0.001],
  lb: ['mass', 0.45359237], lbs: ['mass', 0.45359237], libbra: ['mass', 0.45359237], libbre: ['mass', 0.45359237], pound: ['mass', 0.45359237], pounds: ['mass', 0.45359237], oz: ['mass', 0.028349523], oncia: ['mass', 0.028349523], once: ['mass', 0.028349523], ounce: ['mass', 0.028349523], ounces: ['mass', 0.028349523],
  // volume (l)
  l: ['vol', 1], litro: ['vol', 1], litri: ['vol', 1], liter: ['vol', 1], liters: ['vol', 1], litre: ['vol', 1], litres: ['vol', 1], ml: ['vol', 0.001], millilitro: ['vol', 0.001], millilitri: ['vol', 0.001], gal: ['vol', 3.785411784], gallone: ['vol', 3.785411784], galloni: ['vol', 3.785411784], gallon: ['vol', 3.785411784], gallons: ['vol', 3.785411784],
  // velocita' (m/s)
  'km/h': ['spd', 1 / 3.6], kmh: ['spd', 1 / 3.6], 'mph': ['spd', 0.44704], 'm/s': ['spd', 1], nodi: ['spd', 0.514444], knots: ['spd', 0.514444],
  // dati (byte)
  b: ['dat', 1], kb: ['dat', 1024], mb: ['dat', 1048576], gb: ['dat', 1073741824], tb: ['dat', 1099511627776],
  // tempo (s)
  s: ['time', 1], sec: ['time', 1], secondi: ['time', 1], seconds: ['time', 1], min: ['time', 60], minuti: ['time', 60], minutes: ['time', 60], h: ['time', 3600], ora: ['time', 3600], ore: ['time', 3600], hours: ['time', 3600], giorni: ['time', 86400], giorno: ['time', 86400], days: ['time', 86400],
};
const TEMP = { c: 'c', celsius: 'c', centigradi: 'c', '°c': 'c', gradi: 'c', f: 'f', fahrenheit: 'f', '°f': 'f', k: 'k', kelvin: 'k' };

/** convert(10, 'km', 'miglia') -> { value, from, to } oppure lancia un errore */
function convert(value, from, to) {
  const f = String(from).toLowerCase().trim(), t = String(to).toLowerCase().trim();
  if (f in TEMP && t in TEMP) {
    const a = TEMP[f], b = TEMP[t]; let c = a === 'c' ? value : a === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    const r = b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15; return { value: Math.round(r * 100) / 100, from: f, to: t };
  }
  const uf = U[f], ut = U[t]; if (!uf || !ut) throw new Error('unita non riconosciuta'); if (uf[0] !== ut[0]) throw new Error('unita incompatibili');
  const r = value * uf[1] / ut[1]; return { value: Math.round(r * 1e4) / 1e4, from: f, to: t };
}

module.exports = { evaluate, convert };
