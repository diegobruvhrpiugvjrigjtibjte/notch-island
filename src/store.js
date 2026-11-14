// Impostazioni e dati dell'utente (attivita', note, promemoria, collegamenti), salvati in settings.json con scritture raggruppate.
const fs = require('fs');
const { EventEmitter } = require('events');

const WIDGET_IDS = ['clock', 'weather', 'timer', 'system', 'todo', 'notes', 'calendar', 'stopwatch', 'calc', 'reminders', 'links', 'world', 'convert', 'breathe', 'dice'];

const DEFAULTS = {
  lang: 'auto', autostart: true, theme: 'black', accent: '#8ab4ff', mode: 'floating', radius: 34, scale: 1, openOn: 'hover',
  face: { on: true, sleepy: true },
  compact: 'auto', clock24: true, seconds: false,
  tabsOff: [],
  widgets: { order: WIDGET_IDS.slice(), off: ['breathe', 'dice', 'convert', 'world', 'links'] },
  widgetCfg: { city: 'Roma', world: ['Europe/Rome', 'America/New_York', 'Asia/Tokyo', 'Europe/London'] },
  assistant: { tts: true, claude: true, agent: 'act', whisperLang: 'it', autoListenAfter: false },
  claude: { notify: true, sounds: true },
  shortcuts: { toggle: 'Control+Alt+N', playpause: 'Control+Alt+P', mic: 'Control+Alt+M', hide: 'Control+Alt+H', shot: 'Control+Alt+S', color: 'Control+Alt+C', assistant: 'Control+Alt+Space' },
};
const DATA_DEFAULTS = { todos: [], notes: [], reminders: [], links: [{ name: 'Gmail', url: 'https://mail.google.com' }, { name: 'YouTube', url: 'https://www.youtube.com' }, { name: 'GitHub', url: 'https://github.com' }, { name: 'Maps', url: 'https://www.google.com/maps' }], pins: [] };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(patch || {})) out[k] = isObj(patch[k]) && isObj(base[k]) ? merge(base[k], patch[k]) : patch[k];
  return out;
}

class Store extends EventEmitter {
  constructor(file) {
    super(); this.file = file; this.settings = JSON.parse(JSON.stringify(DEFAULTS)); this.data = JSON.parse(JSON.stringify(DATA_DEFAULTS)); this.t = null;
    this.load();
  }
  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      let s = j.settings || {};
      // migrazione dalla versione 2: il vetro non esiste piu'
      if (s.theme === 'glass' || s.theme === 'blue') s = { ...s, theme: 'black' }; delete s.glass;
      this.settings = merge(DEFAULTS, s);
      // eventuali widget nuovi compaiono in coda all'elenco
      const ord = this.settings.widgets.order.filter((id) => WIDGET_IDS.includes(id));
      for (const id of WIDGET_IDS) if (!ord.includes(id)) ord.push(id);
      this.settings.widgets.order = ord;
      this.data = merge(DATA_DEFAULTS, j.data || {});
      if (Array.isArray(j.pins) && !this.data.pins.length) this.data.pins = j.pins; // v2: appunti fissati
      if (Array.isArray(j.reminders) && !this.data.reminders.length) this.data.reminders = (j.reminders || []).filter((r) => r && r.at);
    } catch { /* primo avvio o file non valido: valori predefiniti */ }
  }
  save() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 250); }
  flush() {
    clearTimeout(this.t);
    try { fs.writeFileSync(this.file + '.tmp', JSON.stringify({ settings: this.settings, data: this.data })); fs.renameSync(this.file + '.tmp', this.file); } catch { /* disco non scrivibile */ }
  }
  patch(p) { this.settings = merge(this.settings, p); this.save(); this.emit('settings', this.settings); return this.settings; }
  reset() { this.settings = JSON.parse(JSON.stringify(DEFAULTS)); this.save(); this.emit('settings', this.settings); return this.settings; }

  // ---- dati
  mutate(fn) { fn(this.data); this.save(); this.emit('data', this.data); return this.data; }
  addTodo(text) { const t = { id: Date.now() + Math.random(), s: String(text).slice(0, 200), d: false }; this.mutate((d) => d.todos.push(t)); return t; }
  addNote(text) { const n = { id: Date.now() + Math.random(), t: String(text).slice(0, 2000), at: Date.now() }; this.mutate((d) => d.notes.unshift(n)); return n; }
  addReminder(text, at) { const r = { id: Date.now() + Math.random(), text: String(text).slice(0, 200), at: Number(at) }; this.mutate((d) => d.reminders.push(r)); return r; }
  /** promemoria scaduti (li rimuove) */
  dueReminders(now = Date.now()) {
    const due = this.data.reminders.filter((r) => r.at <= now); if (!due.length) return [];
    this.mutate((d) => { d.reminders = d.reminders.filter((r) => r.at > now); }); return due;
  }
}
module.exports = { Store, DEFAULTS, WIDGET_IDS, merge };
