// Esecutore dell'assistente: trasforma le intenzioni capite da brain.js in azioni vere sul PC, su VS Code, su Chrome e su Claude Code.
// Tutte le dipendenze sono iniettate (cosi' si puo' provare senza Electron).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { parse, norm, parseWhen, EXAMPLES, SITES } = require('./brain');
const { evaluate, convert } = require('./calc');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const WX = {
  it: { 0: 'sereno', 1: 'quasi sereno', 2: 'parzialmente nuvoloso', 3: 'nuvoloso', 45: 'nebbia', 48: 'nebbia', 51: 'pioggerella', 53: 'pioggerella', 55: 'pioggerella', 61: 'pioggia', 63: 'pioggia', 65: 'pioggia forte', 71: 'neve', 73: 'neve', 75: 'neve', 80: 'rovesci', 81: 'rovesci', 82: 'rovesci forti', 95: 'temporale' },
  en: { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorm' },
};
const JOKES = {
  it: ['Perché il computer va dal dottore? Perché ha preso un virus.', 'Qual è il colmo per un elettricista? Non avere corrente di pensiero.', 'Cosa dice un bit a un altro bit? Ci vediamo dopo il byte.', 'Perché i programmatori preferiscono il buio? Perché la luce attira i bug.', 'Sai perché il pomodoro non riesce a dormire? Perché ha il ketchup di pensieri.'],
  en: ['Why do programmers prefer dark mode? Because light attracts bugs.', 'There are 10 kinds of people: those who understand binary and those who do not.', 'Why did the developer go broke? Because he used up all his cache.', 'A SQL query walks into a bar, walks up to two tables and asks: can I join you?'],
};
const FOLDERS = { download: 'Downloads', downloads: 'Downloads', music: 'Music', videos: 'Videos', scaricati: 'Downloads', documenti: 'Documents', documents: 'Documents', desktop: 'Desktop', immagini: 'Pictures', pictures: 'Pictures', musica: 'Music', video: 'Videos', progetti: 'Documents' };
const DIRECT = { calcolatrice: 'calc.exe', calculator: 'calc.exe', 'blocco note': 'notepad.exe', notepad: 'notepad.exe', 'task manager': 'taskmgr.exe', 'esplora file': 'explorer.exe', 'file explorer': 'explorer.exe', paint: 'mspaint.exe', impostazioni: 'ms-settings:', settings: 'ms-settings:', terminale: 'wt.exe', terminal: 'wt.exe', cmd: 'cmd.exe', powershell: 'powershell.exe' };
const ENGINES = { google: (q) => 'https://www.google.com/search?q=' + encodeURIComponent(q), youtube: (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q), wikipedia: (q) => 'https://it.wikipedia.org/w/index.php?search=' + encodeURIComponent(q), amazon: (q) => 'https://www.amazon.it/s?k=' + encodeURIComponent(q), github: (q) => 'https://github.com/search?q=' + encodeURIComponent(q), maps: (q) => 'https://www.google.com/maps/search/' + encodeURIComponent(q) };
const TAB_NAMES = { media: ['la musica', 'music'], assistant: ['l\'assistente', 'the assistant'], widgets: ['i widget', 'the widgets'], ctrl: ['i controlli', 'the controls'], clip: ['gli appunti', 'the clipboard'], set: ['le impostazioni', 'the settings'], shelf: ['i file', 'the files'], apps: ['le app', 'the apps'] };

class Executor {
  constructor(d) { this.d = d; this.pending = null; this.history = []; this.session = null; this.current = null; }
  abort() { if (this.current) this.current.abort(); }
  reset() { this.session = null; }

  /** Punto d'ingresso: testo -> { ok, say, intent, lang, long? } */
  async handle(text, opts = {}) {
    const raw = String(text || '').trim(); if (!raw) return { ok: false, say: '', intent: 'empty', lang: 'it' };
    // risposta a una domanda precedente ("quando?")
    if (this.pending && this.pending.type === 'reminder') {
      const p = this.pending; this.pending = null;
      const w = parseWhen(norm(raw));
      if (w) return this.reminder(p.text, w.at.getTime(), p.lang);
    }
    const ul = this.d.uiLang ? this.d.uiLang() : 'it'; const parsed = parse(raw, ul);
    let r;
    if (!parsed) r = await this.fallback(raw);
    else {
      try { r = await this.run(parsed); } catch (e) { r = { ok: false, say: L(parsed.lang, 'Non ci sono riuscito: ' + e.message, 'That did not work: ' + e.message), intent: parsed.intent, lang: parsed.lang }; }
      r.intent = parsed.intent; r.lang = parsed.lang;
    }
    this.history.push({ text: raw, ...r }); if (this.history.length > 50) this.history.shift();
    return r;
  }

  async fallback(raw) {
    const lang = /\b(the|what|how|please|can you|could you|why|who)\b/i.test(raw) ? 'en' : (this.d.uiLang ? this.d.uiLang() : 'it');
    const l = (it, en) => L(lang, it, en), a = this.d.store.settings.assistant;
    if (a.claude && a.agent !== 'off' && this.d.claude.findClaude()) return { ...(await this.runAgent(raw, lang)), intent: 'claude.fallback', lang };
    return { ok: false, say: l('Non ho capito. Prova con "aiuto" per vedere cosa so fare.', 'I did not get that. Try "help" to see what I can do.'), intent: 'unknown', lang };
  }

  /** Affida il compito a una vera sessione di Claude Code (login dell'utente, niente API). La chat continua per 20 minuti. */
  async runAgent(prompt, lang) {
    const d = this.d, l = (it, en) => L(lang, it, en), mode = d.store.settings.assistant.agent === 'read' ? 'read' : 'act';
    const start = (resume) => { const run = d.claude.agent(prompt, { mode, lang, resume, onEvent: (e) => d.ui.emit('assistant:progress', e) }); this.current = run; return run.promise; };
    const fresh = this.session && Date.now() - this.session.at < 20 * 60000 ? this.session.id : '';
    try {
      let r; try { r = await start(fresh); } catch (e) { if (fresh && /no conversation|not found/i.test(e.message)) r = await start(''); else throw e; }
      this.session = { id: r.session, at: Date.now() };
      return { ok: true, say: r.text || l('Fatto.', 'Done.'), via: 'claude', agent: true, tools: r.tools, long: (r.text || '').length > 220 };
    } catch (e) {
      if (e.message === 'Interrotto') return { ok: false, say: l('Interrotto.', 'Stopped.'), agent: true };
      return { ok: false, say: l('Claude non è riuscito: ' + e.message, 'Claude could not do it: ' + e.message), agent: true };
    } finally { this.current = null; }
  }

  reminder(text, at, lang) {
    this.d.store.addReminder(text, at);
    const t = new Date(at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
    return { ok: true, say: L(lang, `Va bene, ti ricordo "${text}" alle ${t}.`, `Okay, I will remind you "${text}" at ${t}.`), intent: 'reminder', lang };
  }

  async run({ intent, args = {}, lang }) {
    const d = this.d, A = args, l = (it, en) => L(lang, it, en), ok = (say, extra) => ({ ok: true, say, ...extra }), ko = (say, extra) => ({ ok: false, say, ...extra });
    switch (intent) {
      // ---------------------------------------------------------------- musica
      case 'media': return this.media(A.action, lang);
      case 'media.now': {
        const n = await d.info.send('now', '', 8000);
        return n.title ? ok(l(`Stai ascoltando "${n.title}"${n.artist ? ' di ' + n.artist : ''}${n.playing ? '' : ' (in pausa)'}.`, `You are listening to "${n.title}"${n.artist ? ' by ' + n.artist : ''}${n.playing ? '' : ' (paused)'}.`)) : ok(l('Non c\'è nessun brano in riproduzione.', 'Nothing is playing.'));
      }
      // ---------------------------------------------------------------- audio, schermo, radio
      case 'volume.set': { const r = await d.ctl.send('volset', String(A.value)); return r.v >= 0 ? ok(l(`Volume al ${r.v}%.`, `Volume at ${r.v}%.`), { value: r.v }) : ko(l('Non riesco a cambiare il volume.', 'I cannot change the volume.')); }
      case 'volume.delta': { const c = await d.ctl.send('vol'); if (!(c.v >= 0)) return ko(l('Non riesco a leggere il volume.', 'I cannot read the volume.')); const v = Math.max(0, Math.min(100, c.v + A.delta)); const r = await d.ctl.send('volset', String(v)); return ok(l(`Volume al ${r.v}%.`, `Volume at ${r.v}%.`), { value: r.v }); }
      case 'volume.mute': { const c = await d.ctl.send('vol'); if (!!c.m !== !!A.value) await d.ctl.send('volmute'); return ok(A.value ? l('Audio disattivato.', 'Audio muted.') : l('Audio riattivato.', 'Audio unmuted.')); }
      case 'brightness.set': case 'brightness.delta': {
        const c = await d.ctl.send('br'); if (!(c.v >= 0)) return ko(l('Questo schermo non permette di cambiare la luminosità da software.', 'This display does not allow software brightness control.'));
        const v = intent === 'brightness.set' ? A.value : Math.max(0, Math.min(100, c.v + A.delta)); await d.ctl.send('brset', String(v)); return ok(l(`Luminosità al ${v}%.`, `Brightness at ${v}%.`), { value: v });
      }
      case 'mic': { const c = await d.ctl.send('mic'); if (!!c.m !== !!A.muted) await d.ctl.send('micmute'); d.ui.emit('mic', !!A.muted); return ok(A.muted ? l('Microfono disattivato.', 'Microphone muted.') : l('Microfono attivo.', 'Microphone on.')); }
      case 'radio': { const r = await d.ctl.send('radioset', A.kind + ' ' + (A.on ? 'on' : 'off')); return r.ok ? ok(`${A.kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth'} ${A.on ? l('acceso', 'on') : l('spento', 'off')}.`) : ko(l('Windows non mi permette di cambiarlo: lo apro nelle impostazioni.', 'Windows will not let me change it: opening settings.'), { open: A.kind === 'WiFi' ? 'ms-settings:network-wifi' : 'ms-settings:bluetooth' }); }
      case 'screenshot': { const f = await d.screenshot(); return f ? ok(l('Screenshot salvato nella cartella Immagini.', 'Screenshot saved in Pictures.'), { file: f }) : ko(l('Screenshot non riuscito.', 'Screenshot failed.')); }
      case 'lock': await d.lockPc(); return ok(l('Blocco il PC.', 'Locking the PC.'));
      // ---------------------------------------------------------------- timer, promemoria, note
      case 'timer.start': d.ui.emit('timer:start', { seconds: A.seconds, label: A.label || '' }); return ok(l(`Timer di ${fmtDur(A.seconds, 'it')} avviato.`, `${fmtDur(A.seconds, 'en')} timer started.`));
      case 'timer.stop': d.ui.emit('timer:stop'); return ok(l('Timer fermato.', 'Timer stopped.'));
      case 'stopwatch.start': d.ui.emit('stopwatch:start'); return ok(l('Cronometro avviato.', 'Stopwatch started.'));
      case 'reminder': return this.reminder(A.text, A.at, lang);
      case 'reminder.ask': this.pending = { type: 'reminder', text: A.text, lang }; return ok(l('Quando vuoi che te lo ricordi? Ad esempio "tra 10 minuti" o "alle 18".', 'When should I remind you? For example "in 10 minutes" or "at 6 pm".'), { ask: true });
      case 'note.add': d.store.addNote(A.text); return ok(l('Nota salvata.', 'Note saved.'));
      case 'note.list': { const n = d.store.data.notes.slice(0, 5); return n.length ? ok(l('Le tue note: ', 'Your notes: ') + n.map((x, i) => `${i + 1}. ${x.t}`).join(' '), { long: true }) : ok(l('Non hai note.', 'You have no notes.')); }
      case 'todo.add': d.store.addTodo(A.text); return ok(l(`Aggiunto alle attività: ${A.text}.`, `Added to your tasks: ${A.text}.`));
      case 'todo.list': { const t = d.store.data.todos.filter((x) => !x.d); return t.length ? ok(l(`Hai ${t.length} attività: `, `You have ${t.length} tasks: `) + t.slice(0, 6).map((x) => x.s).join(', ') + '.', { long: t.length > 3 }) : ok(l('Non hai attività da fare.', 'You have nothing to do.')); }
      case 'clipboard.read': { const t = d.clipboard.read(); return t ? ok(l('Negli appunti c\'è: ', 'On the clipboard: ') + t.slice(0, 300), { long: t.length > 150 }) : ok(l('Gli appunti sono vuoti.', 'The clipboard is empty.')); }
      case 'clipboard.write': d.clipboard.write(A.text); return ok(l('Copiato negli appunti.', 'Copied to the clipboard.'));
      // ---------------------------------------------------------------- calcoli e giochi
      case 'calc': { try { const v = evaluate(A.expr); return ok(l(`Fa ${fmtNum(v, 'it')}.`, `That is ${fmtNum(v, 'en')}.`), { value: v }); } catch { return ko(l('Non riesco a calcolarlo.', 'I cannot calculate that.')); } }
      case 'convert': { try { const r = convert(A.value, A.from, A.to); return ok(`${fmtNum(A.value, lang)} ${A.from} = ${fmtNum(r.value, lang)} ${A.to}.`, { value: r.value }); } catch (e) { return ko(l('Non conosco queste unità o non sono compatibili.', 'I do not know these units or they are not compatible.')); } }
      case 'dice': { const n = 1 + Math.floor(Math.random() * A.sides); return ok(l(`Ho lanciato un dado a ${A.sides} facce: è uscito ${n}.`, `I rolled a ${A.sides}-sided die: ${n}.`), { value: n }); }
      case 'coin': { const h = Math.random() < 0.5; return ok(h ? l('Testa.', 'Heads.') : l('Croce.', 'Tails.')); }
      case 'random': { const lo = Math.min(A.min, A.max), hi = Math.max(A.min, A.max); const n = lo + Math.floor(Math.random() * (hi - lo + 1)); return ok(l(`Numero a caso: ${n}.`, `Random number: ${n}.`), { value: n }); }
      case 'joke': return ok(pick(JOKES[lang] || JOKES.it));
      // ---------------------------------------------------------------- info
      case 'time': { const n = d.now(); return ok(lang === 'en' ? `It is ${n.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : `Sono le ${n.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`); }
      case 'date': { const n = d.now(); return ok(lang === 'en' ? `Today is ${n.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` : `Oggi è ${n.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`); }
      case 'weather': return this.weather(A.city, lang);
      case 'system': { const s = d.sysStats(); return ok(l(`CPU al ${s.cpu}%, RAM al ${s.ramPct}% (${s.ramUsedGB} di ${s.ramTotalGB} GB)${s.diskFreeGB != null ? ', disco con ' + s.diskFreeGB + ' GB liberi' : ''}.`, `CPU at ${s.cpu}%, RAM at ${s.ramPct}% (${s.ramUsedGB} of ${s.ramTotalGB} GB)${s.diskFreeGB != null ? ', disk with ' + s.diskFreeGB + ' GB free' : ''}.`)); }
      case 'battery': { const b = await d.battery(); return b ? ok(l(`Batteria al ${b.pct}%${b.charging ? ', in carica' : ''}.`, `Battery at ${b.pct}%${b.charging ? ', charging' : ''}.`)) : ok(l('Questo PC non ha una batteria.', 'This PC has no battery.')); }
      // ---------------------------------------------------------------- Claude
      case 'claude.status': return this.claudeStatus(lang);
      case 'claude.ask': {
        if (!d.claude.findClaude()) return ko(l('Non trovo Claude Code su questo PC.', 'I cannot find Claude Code on this PC.'));
        return this.runAgent(A.prompt, lang);
      }
      case 'agent.reset': this.reset(); return ok(l('Ricominciamo da capo: ho dimenticato la conversazione.', 'Fresh start: I forgot the conversation.'));
      // ---------------------------------------------------------------- VS Code
      case 'vscode.cmd': {
        if (!d.hub.connected('vscode')) return ko(l('VS Code non è collegato all\'isola. Installa l\'estensione dalla scheda Claude.', 'VS Code is not connected. Install the extension from the Claude tab.'), { hint: 'vscode' });
        await d.hub.command('vscode', 'exec', { command: A.cmd }); return ok(l('Fatto, in VS Code.', 'Done, in VS Code.'));
      }
      case 'vscode.find': { if (!d.hub.connected('vscode')) return ko(l('VS Code non è collegato.', 'VS Code is not connected.'), { hint: 'vscode' }); await d.hub.command('vscode', 'findInFiles', { query: A.query }); return ok(l(`Cerco "${A.query}" nei file di VS Code.`, `Searching "${A.query}" in VS Code.`)); }
      case 'vscode.run': { if (!d.hub.connected('vscode')) return ko(l('VS Code non è collegato.', 'VS Code is not connected.'), { hint: 'vscode' }); try { await d.hub.command('vscode', 'runInTerminal', { command: A.command }, 120000); return ok(l(`Eseguito nel terminale: ${A.command}.`, `Ran in the terminal: ${A.command}.`)); } catch (e) { return ko(l('Esecuzione annullata in VS Code.', 'Cancelled in VS Code.')); } }
      case 'vscode.folder': {
        const p = findFolder(A.path); if (!p) return ko(l(`Non trovo la cartella "${A.path}".`, `I cannot find the folder "${A.path}".`));
        if (d.hub.connected('vscode')) await d.hub.command('vscode', 'openFolder', { path: p, newWindow: true }); else await d.openWithCode(p);
        return ok(l(`Apro ${path.basename(p)} in VS Code.`, `Opening ${path.basename(p)} in VS Code.`), { path: p });
      }
      case 'vscode.status': {
        const i = d.hub.connected('vscode') ? d.hub.info('vscode') : null; if (!i) return ko(l('VS Code non è collegato.', 'VS Code is not connected.'), { hint: 'vscode' });
        return ok(i.file ? l(`In VS Code stai modificando ${i.file}${i.workspace ? ' nel progetto ' + i.workspace : ''}${i.branch ? ' (ramo ' + i.branch + ')' : ''}. ${i.errors ? i.errors + ' errori' : 'Nessun errore'}${i.dirty ? ', ' + i.dirty + ' file non salvati' : ''}.`, `In VS Code you are editing ${i.file}${i.workspace ? ' in ' + i.workspace : ''}${i.branch ? ' (branch ' + i.branch + ')' : ''}. ${i.errors ? i.errors + ' errors' : 'No errors'}${i.dirty ? ', ' + i.dirty + ' unsaved files' : ''}.`) : l(`VS Code è aperto${i.workspace ? ' sul progetto ' + i.workspace : ''}, nessun file attivo.`, `VS Code is open${i.workspace ? ' on ' + i.workspace : ''}, no active file.`));
      }
      // ---------------------------------------------------------------- Chrome
      case 'chrome.cmd': {
        if (!d.hub.connected('chrome')) { if (A.cmd === 'newTab') { d.openExternal('https://www.google.com'); return ok(l('Apro una nuova scheda nel browser.', 'Opening a new tab in the browser.')); } return ko(l('Chrome non è collegato all\'isola. Installa l\'estensione dalla scheda Claude.', 'Chrome is not connected. Install the extension from the Claude tab.'), { hint: 'chrome' }); }
        const r = await d.hub.command('chrome', A.cmd, A.cmd === 'newTab' ? {} : A.cmd === 'muteTabs' ? { mute: true, all: false } : {});
        const msg = { newTab: l('Nuova scheda aperta.', 'New tab opened.'), closeTab: l('Scheda chiusa.', 'Tab closed.'), reload: l('Pagina ricaricata.', 'Page reloaded.'), pauseMedia: r && r.affected ? l('Video in pausa.', 'Video paused.') : l('Non ho trovato video in riproduzione.', 'No playing video found.'), playMedia: r && r.affected ? l('Video riprodotto.', 'Video playing.') : l('Non ho trovato video da riprodurre.', 'No video to play.'), muteTabs: l('Scheda silenziata.', 'Tab muted.') };
        return ok(msg[A.cmd] || l('Fatto.', 'Done.'));
      }
      case 'chrome.tabs': {
        if (!d.hub.connected('chrome')) return ko(l('Chrome non è collegato.', 'Chrome is not connected.'), { hint: 'chrome' });
        const tabs = await d.hub.command('chrome', 'listTabs'); return ok(l(`Hai ${tabs.length} schede aperte: `, `You have ${tabs.length} tabs open: `) + tabs.slice(0, 6).map((t) => t.title).join(', ') + '.', { long: tabs.length > 3 });
      }
      case 'chrome.switch': {
        if (!d.hub.connected('chrome')) return ko(l('Chrome non è collegato.', 'Chrome is not connected.'), { hint: 'chrome' });
        try { const r = await d.hub.command('chrome', 'switchTab', { query: A.query }); return ok(l(`Passo alla scheda "${r.title}".`, `Switching to tab "${r.title}".`)); } catch { return ko(l(`Non trovo una scheda con "${A.query}".`, `No tab matches "${A.query}".`)); }
      }
      case 'chrome.page': {
        if (!d.hub.connected('chrome')) return ko(l('Chrome non è collegato.', 'Chrome is not connected.'), { hint: 'chrome' });
        const p = await d.hub.command('chrome', 'pageInfo'); const text = (p.text || '').slice(0, 6000);
        if (d.store.settings.assistant.claude && d.claude.findClaude() && text.length > 200) {
          const out = await d.claude.ask((lang === 'en' ? 'Summarize this web page in 3 short sentences. Title: ' : 'Riassumi questa pagina web in 3 frasi brevi. Titolo: ') + p.title + '\n\n' + text, { timeout: 120000 });
          return ok(out, { long: true, via: 'claude' });
        }
        return ok(`${p.title}: ${text.slice(0, 280)}`, { long: true });
      }
      // ---------------------------------------------------------------- web, app, cartelle
      case 'search': {
        const url = (ENGINES[A.engine] || ENGINES.google)(A.query); await this.openUrl(url, A.inChrome);
        return ok(l(`Cerco "${A.query}"${A.engine !== 'google' ? ' su ' + A.engine : ''}.`, `Searching "${A.query}"${A.engine !== 'google' ? ' on ' + A.engine : ''}.`));
      }
      case 'web.open': await this.openUrl(A.url, A.inChrome); return ok(l(`Apro ${A.url.replace(/^https?:\/\//, '')}.`, `Opening ${A.url.replace(/^https?:\/\//, '')}.`));
      case 'app.open': return this.openApp(A, lang);
      case 'folder.open': { const sub = FOLDERS[A.name]; const p = path.join(os.homedir(), sub); await d.openPath(p); return ok(l(`Apro la cartella ${A.name}.`, `Opening the ${A.name} folder.`)); }
      // ---------------------------------------------------------------- controllo dell'isola
      case 'ui.tab': d.ui.emit('ui:tab', A.tab); return ok(l(`Ecco ${(TAB_NAMES[A.tab] || [A.tab])[0]}.`, `Here is ${(TAB_NAMES[A.tab] || [null, A.tab])[1]}.`));
      case 'ui.theme': d.store.patch({ theme: A.theme }); return ok(l(`Tema cambiato in ${A.theme}.`, `Theme changed to ${A.theme}.`));
      case 'ui.face': d.store.patch({ face: { on: A.on } }); return ok(A.on ? l('Eccomi!', 'Here I am!') : l('Va bene, mi nascondo.', 'Okay, hiding.'));
      // ---------------------------------------------------------------- chiacchiere
      case 'chat.hello': { const h = d.now().getHours(); return ok(pick([l(h < 12 ? 'Buongiorno! Come posso aiutarti?' : h < 18 ? 'Ciao! Come posso aiutarti?' : 'Buonasera! Come posso aiutarti?', 'Hello! How can I help?'), l('Ehi, sono qui!', 'Hey, I am here!')])); }
      case 'chat.thanks': return ok(pick([l('Di niente!', 'You are welcome!'), l('Figurati, è un piacere.', 'My pleasure.')]));
      case 'chat.who': return ok(l('Sono la faccina di NotchIsland: controllo musica, volume, timer, VS Code, Chrome e Claude Code. Chiedimi "aiuto" per la lista.', 'I am the NotchIsland face: I control music, volume, timers, VS Code, Chrome and Claude Code. Ask me for "help" to see the list.'));
      case 'chat.how': return ok(pick([l('Benissimo, grazie! E tu?', 'Great, thanks! And you?'), l('Tutto a posto, qui sopra va tutto bene.', 'All good, everything is fine up here.')]));
      case 'chat.night': return ok(l('Buonanotte! Sogni d\'oro.', 'Good night! Sleep well.'));
      case 'help': return ok(l('Posso: gestire la musica (pausa, salta), volume, luminosità, microfono, Wi-Fi, timer e promemoria, note e attività, calcoli e conversioni, meteo, aprire app e siti, cercare sul web; controllare VS Code (salva, terminale, cerca nei file), Chrome (schede, pausa video, riassunto pagina) e Claude Code (stato, chiedi a Claude, accetta o rifiuta le modifiche). Esempi: ' + EXAMPLES.it.slice(0, 5).map((e) => '"' + e + '"').join(', ') + '.', 'I can: control music, volume, brightness, mic, Wi-Fi, timers and reminders, notes and tasks, math and conversions, weather, open apps and sites, search the web; control VS Code, Chrome and Claude Code. Examples: ' + EXAMPLES.en.slice(0, 5).map((e) => '"' + e + '"').join(', ') + '.'), { long: true });
      default: return ko(l('Questa funzione non c\'è ancora.', 'That is not available yet.'));
    }
  }

  async media(action, lang) {
    const d = this.d, l = (it, en) => L(lang, it, en);
    const now = await d.info.send('now', '', 8000);
    if (!now.title) { return { ok: false, say: l('Non c\'è nessun brano in riproduzione.', 'Nothing is playing.') }; }
    if (action === 'pause' && !now.playing) return { ok: true, say: l('Era già in pausa.', 'It was already paused.') };
    if (action === 'play' && now.playing) return { ok: true, say: l('Sta già suonando.', 'It is already playing.') };
    const r = await d.info.send('media', action, 8000);
    if (!r.ok) { const key = { pause: 'playpause', play: 'playpause', next: 'next', prev: 'prev' }[action]; await d.ctl.send('key', key); }
    if (action === 'next' || action === 'prev') {
      await d.sleep(900); const n = await d.info.send('now', '', 8000);
      return { ok: true, say: n.title && n.title !== now.title ? l(`Ora in riproduzione: "${n.title}"${n.artist ? ' di ' + n.artist : ''}.`, `Now playing: "${n.title}"${n.artist ? ' by ' + n.artist : ''}.`) : (action === 'next' ? l('Brano successivo.', 'Next track.') : l('Brano precedente.', 'Previous track.')) };
    }
    return { ok: true, say: action === 'pause' ? l('Musica in pausa.', 'Music paused.') : l('Musica in riproduzione.', 'Music playing.') };
  }

  async weather(city, lang) {
    const d = this.d, l = (it, en) => L(lang, it, en); city = (city || '').trim() || d.store.settings.widgetCfg.city || 'Roma'; if (/^roma$/i.test(city) && lang === 'en') city = 'Rome';
    try {
      const g = await d.fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=' + lang + '&name=' + encodeURIComponent(city));
      if (!g.results || !g.results[0]) return { ok: false, say: l(`Non trovo la città "${city}".`, `I cannot find the city "${city}".`) };
      const p = g.results[0];
      const w = await d.fetchJson(`https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&latitude=${p.latitude}&longitude=${p.longitude}`);
      const c = w.current, desc = (WX[lang] || WX.it)[c.weather_code] || '';
      return { ok: true, say: l(`A ${p.name} ci sono ${Math.round(c.temperature_2m)} gradi (percepiti ${Math.round(c.apparent_temperature)}), ${desc}, vento a ${Math.round(c.wind_speed_10m)} km/h.`, `In ${p.name} it is ${Math.round(c.temperature_2m)} degrees (feels like ${Math.round(c.apparent_temperature)}), ${desc}, wind ${Math.round(c.wind_speed_10m)} km/h.`) };
    } catch { return { ok: false, say: l('Il meteo non è disponibile (controlla la connessione).', 'Weather is not available (check your connection).') }; }
  }

  claudeStatus(lang) {
    const d = this.d, l = (it, en) => L(lang, it, en), sess = d.hub.claudeSessions();
    if (!sess.length) { const st = d.claude.status(); return { ok: true, say: st.installed ? l('Nessuna sessione di Claude Code attiva in questo momento.', 'No Claude Code session is active right now.') : l('Claude Code non è ancora collegato: premi "Collega" nella scheda Claude.', 'Claude Code is not connected yet: press "Connect" in the Claude tab.') }; }
    const parts = sess.slice(0, 3).map((s) => s.status === 'working' ? l(`Claude lavora su ${s.project}${s.tool ? ' (' + s.tool + (s.detail ? ': ' + s.detail : '') + ')' : ''}`, `Claude is working on ${s.project}${s.tool ? ' (' + s.tool + (s.detail ? ': ' + s.detail : '') + ')' : ''}`)
      : s.status === 'waiting' ? l(`Claude ti aspetta su ${s.project}${s.message ? ': ' + s.message : ''}`, `Claude is waiting for you on ${s.project}${s.message ? ': ' + s.message : ''}`)
        : s.status === 'done' ? l(`Claude ha finito su ${s.project}`, `Claude finished on ${s.project}`) : l(`${s.project}: sessione aperta`, `${s.project}: session open`));
    return { ok: true, say: parts.join('. ') + '.', long: parts.length > 1 };
  }

  async openUrl(url, preferChrome) {
    const d = this.d;
    if (preferChrome && d.hub.connected('chrome')) { try { await d.hub.command('chrome', 'openUrl', { url }); return; } catch { /* ripiega sul browser predefinito */ } }
    d.openExternal(url);
  }

  async openApp(A, lang) {
    const d = this.d, l = (it, en) => L(lang, it, en), name = norm(A.name);
    if (A.inChrome && A.fallbackUrl) { await this.openUrl(A.fallbackUrl, true); return { ok: true, say: l(`Apro ${A.name} in Chrome.`, `Opening ${A.name} in Chrome.`) }; }
    if (DIRECT[name]) { await d.launch({ exe: DIRECT[name] }); return { ok: true, say: l(`Apro ${A.name}.`, `Opening ${A.name}.`) }; }
    let apps = []; try { apps = await d.getApps(); } catch { /* elenco non disponibile */ }
    const scored = apps.map((a) => { const n = norm(a.name); return { a, s: n === name ? 3 : n.startsWith(name) ? 2 : n.includes(name) ? 1 : 0 }; }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s || x.a.name.length - y.a.name.length);
    if (scored.length) { await d.launch({ app: scored[0].a }); return { ok: true, say: l(`Apro ${scored[0].a.name}.`, `Opening ${scored[0].a.name}.`) }; }
    if (A.fallbackUrl) { await this.openUrl(A.fallbackUrl, false); return { ok: true, say: l(`Apro ${A.name} nel browser.`, `Opening ${A.name} in the browser.`) }; }
    return { ok: false, say: l(`Non trovo l'applicazione "${A.name}".`, `I cannot find the app "${A.name}".`) };
  }
}

const L = (lang, it, en) => (lang === 'en' ? en : it);
const fmtNum = (n, lang) => Number(n).toLocaleString(lang === 'en' ? 'en-US' : 'it-IT', { maximumFractionDigits: 4 });
function fmtDur(sec, lang) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, p = [];
  if (lang === 'en') { if (h) p.push(h + (h === 1 ? ' hour' : ' hours')); if (m) p.push(m + (m === 1 ? ' minute' : ' minutes')); if (s) p.push(s + ' seconds'); return p.join(' ') || '0 seconds'; }
  if (h) p.push(h + (h === 1 ? ' ora' : ' ore')); if (m) p.push(m + (m === 1 ? ' minuto' : ' minuti')); if (s) p.push(s + (s === 1 ? ' secondo' : ' secondi')); return p.join(' e ') || '0 secondi';
}
/** cerca una cartella per nome (o la usa se e' un percorso) in Documenti, Desktop e home, fino a 2 livelli */
function findFolder(q) {
  q = String(q || '').trim().replace(/^["']|["']$/g, ''); if (!q) return null;
  if (path.isAbsolute(q) && fs.existsSync(q)) return q;
  const home = os.homedir(), roots = [path.join(home, 'Documents'), path.join(home, 'Desktop'), home];
  const want = q.toLowerCase().replace(/\s+/g, '');
  for (const r of roots) {
    let first; try { first = fs.readdirSync(r, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { continue; }
    const hit = first.find((e) => e.name.toLowerCase().replace(/[\s\-_]+/g, '') === want.replace(/[\s\-_]+/g, '')); if (hit) return path.join(r, hit.name);
    for (const e of first) {
      if (e.name.startsWith('.') || e.name === 'AppData' || e.name === 'node_modules') continue;
      let sub; try { sub = fs.readdirSync(path.join(r, e.name), { withFileTypes: true }); } catch { continue; }
      const h2 = sub.find((x) => x.isDirectory() && x.name.toLowerCase().replace(/[\s\-_]+/g, '') === want.replace(/[\s\-_]+/g, '')); if (h2) return path.join(r, e.name, h2.name);
    }
  }
  return null;
}

module.exports = { Executor, findFolder, fmtDur };
