// Cervello dell'assistente: capisce frasi in italiano e inglese e le trasforma in azioni.
// E' un modulo puro (nessun accesso a Electron): parse(testo) -> { intent, args, lang }.
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => strip(String(s).toLowerCase()).replace(/wi-fi/g, 'wifi').replace(/[,;!?"“”]/g, ' ').replace(/\.(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

const NUM_IT = { zero: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90, cento: 100 };
const NUM_EN = { zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
function wordsToNumbers(t) {
  return t.replace(/\b[a-z']+\b/g, (w) => ((w in NUM_IT && !['un', 'uno', 'una'].includes(w)) ? String(NUM_IT[w]) : (w in NUM_EN && !['a', 'an'].includes(w)) ? String(NUM_EN[w]) : w))
    .replace(/\b(\d+) (\d)\b/g, (m, a, b) => (Number(a) % 10 === 0 && Number(a) >= 20 && Number(b) < 10 ? String(Number(a) + Number(b)) : m));
}

/** "10 minuti", "un'ora", "mezz'ora", "1 hour 30 minutes", "45 secondi" -> secondi (o null) */
function parseDuration(t) {
  t = wordsToNumbers(t.replace(/\b(?:un|uno|una|a|an)\s+(minut[oi]|minutes?|ora|ore|hours?|second[oi]|seconds?)\b/g, '1 $1').replace(/mezz'?ora|mezza ora|half an hour|half hour/g, '30 minuti').replace(/un'ora|un ora|an hour/g, '1 ora').replace(/un quarto d'?ora|quarter of an hour/g, '15 minuti'));
  let total = 0, found = false;
  const re = /(\d+(?:[.,]\d+)?)\s*(ore|ora|h|hours?|hrs?|minut[oi]|min|minutes?|m|second[oi]|sec|seconds?|s)\b/g; let m;
  while ((m = re.exec(t))) {
    const n = parseFloat(m[1].replace(',', '.')); const u = m[2]; found = true;
    total += /^(ore|ora|h|hours?|hrs?)$/.test(u) ? n * 3600 : /^(second|sec|s$)/.test(u) ? n : n * 60;
  }
  return found ? Math.round(total) : null;
}

/** Orario assoluto o relativo -> { at: Date, text } */
function parseWhen(t, now = new Date()) {
  const rel = /\b(?:tra|fra|in)\s+(.+?)(?=$|\s+(?:di|to|che|per)\b)/.exec(t);
  if (rel) { const d = parseDuration(rel[1]); if (d) return { at: new Date(now.getTime() + d * 1000), cut: rel[0] }; }
  let m = /\b(?:alle|alle ore|at|@)\s*(\d{1,2})(?::|\.|\s*e\s*)?(\d{2})?\s*(am|pm|di sera|di mattina|del pomeriggio|di notte|di pomeriggio)?\b/.exec(t);
  if (m) {
    let h = Number(m[1]); const min = Number(m[2] || 0); const suf = m[3] || '';
    if (/pm|sera|pomeriggio/.test(suf) && h < 12) h += 12; if (/am|mattina|notte/.test(suf) && h === 12) h = 0;
    const at = new Date(now); at.setHours(h, min, 0, 0);
    if (/\b(domani|tomorrow)\b/.test(t)) at.setDate(at.getDate() + 1); else if (at <= now) at.setDate(at.getDate() + 1);
    return { at, cut: m[0] };
  }
  return null;
}

const APP_ALIASES = { 'vs code': 'visual studio code', vscode: 'visual studio code', code: 'visual studio code', calcolatrice: 'calcolatrice', calculator: 'calculator', 'blocco note': 'blocco note', notepad: 'notepad', explorer: 'esplora file', 'esplora risorse': 'esplora file', 'file explorer': 'file explorer', impostazioni: 'impostazioni', settings: 'settings', 'task manager': 'task manager', 'gestione attivita': 'task manager' };
const SITES = { youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com', github: 'https://github.com', wikipedia: 'https://it.wikipedia.org', netflix: 'https://www.netflix.com', spotify: 'https://open.spotify.com', maps: 'https://www.google.com/maps', chatgpt: 'https://chatgpt.com', twitch: 'https://www.twitch.tv', reddit: 'https://www.reddit.com', amazon: 'https://www.amazon.it' };

const rules = [];
const R = (re, fn) => rules.push([re, fn]);
const lastWord = (m, i = 1) => (m[i] || '').trim();

// ------------------------------------------------------------ aiuto e chiacchiere
R(/^(aiuto|help|cosa sai fare|che cosa sai fare|what can you do|comandi|commands)$/, () => ({ intent: 'help' }));
R(/^(ciao|salve|hey|hei|ehi|hello|hi|buongiorno|buonasera|good morning|good evening)( .*)?$/, () => ({ intent: 'chat.hello' }));
R(/^(grazie|grazie mille|thanks|thank you|thx)( .*)?$/, () => ({ intent: 'chat.thanks' }));
R(/^(chi sei|who are you|come ti chiami|what is your name)$/, () => ({ intent: 'chat.who' }));
R(/^(come stai|how are you)$/, () => ({ intent: 'chat.how' }));
R(/^(buonanotte|good night)$/, () => ({ intent: 'chat.night' }));

// ------------------------------------------------------------ musica
R(/^(?:metti in pausa|pausa|ferma|stoppa|stop|pause|metti in pausa la musica|ferma la musica|pause (?:the )?(?:music|song|track))(?: la musica| il brano| la canzone)?$/, () => ({ intent: 'media', args: { action: 'pause' } }));
R(/^(?:riprendi|riproduci|play|resume|fai partire|avvia la musica|play (?:the )?music|metti la musica|riprendi la musica|continua)(?: la musica| il brano)?$/, () => ({ intent: 'media', args: { action: 'play' } }));
R(/^(?:salta|skip|prossim[ao]|next|avanti|cambia (?:canzone|brano|traccia)|passa (?:alla|al) prossim[ao]|salta (?:la |questa |quella |this |that )?(?:canzone|brano|traccia|song|track)|skip (?:the )?(?:song|track)|next (?:song|track)|skip to the next(?: song| track)?)$/, () => ({ intent: 'media', args: { action: 'next' } }));
R(/^(?:precedente|previous|indietro|torna indietro|canzone precedente|brano precedente|previous (?:song|track)|vai alla precedente|riparti dall'?inizio)$/, () => ({ intent: 'media', args: { action: 'prev' } }));
R(/^(?:che canzone (?:e|sta suonando)|cosa sto ascoltando|what(?:'s| is) (?:this song|playing)|che musica (?:e|c e))$/, () => ({ intent: 'media.now' }));

// ------------------------------------------------------------ volume / luminosita / microfono
R(/^(?:volume (?:al )?(?:massimo|max)|alza il volume al massimo|max(?:imum)? volume)$/, () => ({ intent: 'volume.set', args: { value: 100 } }));
R(/^(?:volume (?:a |al |at |to )?(\d{1,3})(?: ?%| percento| percent)?|(?:imposta|metti|set) (?:il )?volume (?:a |al |at |to )?(\d{1,3})(?: ?%)?)$/, (m) => ({ intent: 'volume.set', args: { value: Math.min(100, +(m[1] || m[2])) } }));
R(/^(?:alza|aumenta|su con|turn up|raise|increase|volume su|piu volume)(?: il| the)?(?: volume)?(?: up)?(?: di (\d+))?$/, (m) => ({ intent: 'volume.delta', args: { delta: +(m[1] || 10) } }));
R(/^(?:abbassa|diminuisci|riduci|turn down|lower|decrease|volume giu|meno volume)(?: il| the)?(?: volume)?(?: down)?(?: di (\d+))?$/, (m) => ({ intent: 'volume.delta', args: { delta: -(m[1] || 10) } }));
R(/^(?:muta|silenzia|zittisci|mute)(?: il| l| the)?(?: audio| volume| suono| sound)?$/, () => ({ intent: 'volume.mute', args: { value: true } }));
R(/^(?:riattiva|togli il muto|attiva)(?: l)? ?(?:audio|volume|suono)$|^unmute(?: the)?(?: audio| volume| sound)?$/, () => ({ intent: 'volume.mute', args: { value: false } }));
R(/^(?:luminosita (?:a |al |at |to )?(\d{1,3})(?: ?%)?|(?:imposta|metti|set) (?:la )?(?:luminosita|brightness) (?:a |al |at |to )?(\d{1,3})(?: ?%)?|brightness (?:at |to )?(\d{1,3})(?: ?%)?)$/, (m) => ({ intent: 'brightness.set', args: { value: Math.min(100, +(m[1] || m[2] || m[3])) } }));
R(/^(?:aumenta|alza|piu|increase|raise|turn up)(?: la| the)? (?:luminosita|brightness)$/, () => ({ intent: 'brightness.delta', args: { delta: 15 } }));
R(/^(?:diminuisci|abbassa|riduci|meno|decrease|lower|turn down)(?: la| the)? (?:luminosita|brightness)$/, () => ({ intent: 'brightness.delta', args: { delta: -15 } }));
R(/^(?:muta|silenzia|spegni|disattiva|mute|turn off)(?: il| the)? (?:microfono|mic|microphone)$/, () => ({ intent: 'mic', args: { muted: true } }));
R(/^(?:attiva|riattiva|accendi|unmute|turn on)(?: il| the)? (?:microfono|mic|microphone)$/, () => ({ intent: 'mic', args: { muted: false } }));
R(/^(?:accendi|attiva|turn on|enable) (?:il )?(wifi|wi fi|bluetooth)$/, (m) => ({ intent: 'radio', args: { kind: /blue/.test(m[1]) ? 'Bluetooth' : 'WiFi', on: true } }));
R(/^(?:spegni|disattiva|turn off|disable) (?:il )?(wifi|wi fi|bluetooth)$/, (m) => ({ intent: 'radio', args: { kind: /blue/.test(m[1]) ? 'Bluetooth' : 'WiFi', on: false } }));
R(/^(?:fai|scatta|prendi|take|capture)(?: uno| a| an)? (?:screenshot|schermata|istantanea)(?: dello schermo)?$|^screenshot$/, () => ({ intent: 'screenshot' }));
R(/^(?:blocca|lock)(?: il)?(?: pc| computer| schermo| screen| the computer| the pc)?$/, () => ({ intent: 'lock' }));

// ------------------------------------------------------------ timer, promemoria, note
R(/^(?:ferma|annulla|stop|cancel|cancella)(?: il| the)? (?:timer|cronometro|pomodoro)$/, () => ({ intent: 'timer.stop' }));
R(/^(?:pomodoro|avvia(?: un)? pomodoro|start(?: a)? pomodoro)$/, () => ({ intent: 'timer.start', args: { seconds: 25 * 60, label: 'Pomodoro' } }));
R(/^(?:(?:imposta|metti|avvia|fai partire|crea|set|start)(?: un| a| il)? )?(?:timer|countdown|conto alla rovescia)(?: (?:di|da|for))? (.+)$/, (m) => { const s = parseDuration(m[1]); return s ? { intent: 'timer.start', args: { seconds: s } } : null; });
R(/^(?:ricordami|promemoria|remind me|reminder|ricorda)(?: di| to| che)? (.+)$/, (m) => {
  const w = parseWhen(m[1]); if (!w) return { intent: 'reminder.ask', args: { text: m[1] } };
  const text = m[1].replace(w.cut, ' ').replace(/\s+(tra|fra|in|alle|at|domani|tomorrow)\s*$/, '').replace(/\s+/g, ' ').trim() || 'Promemoria';
  return { intent: 'reminder', args: { text, at: w.at.getTime() } };
});
R(/^(?:prendi nota|annota|nota|segna|note|take a note|write down|save note|scrivi una nota)(?: che| di| that| to)?[: ]\s*(.+)$/, (m) => ({ intent: 'note.add', args: { text: m[1] } }));
R(/^(?:aggiungi|add|nuova|new|crea)(?: (?:un|una|a|an))? (?:attivita|task|todo|cosa da fare|to do|to-do)(?: (?:alla lista|to (?:the )?list))?[: ]\s*(.+)$/, (m) => ({ intent: 'todo.add', args: { text: m[1] } }));
R(/^(?:cosa devo fare|le mie attivita|mostra le attivita|my tasks|show (?:my )?tasks|what do i have to do)$/, () => ({ intent: 'todo.list' }));
R(/^(?:leggi|mostra|read|show)(?: i| le| my| gli)? (?:appunti|clipboard|negli appunti)$/, () => ({ intent: 'clipboard.read' }));
R(/^(?:copia|copy)(?: negli appunti| to clipboard)?[: ]\s*(.+)$/, (m) => ({ intent: 'clipboard.write', args: { text: m[1] } }));

// ------------------------------------------------------------ info
R(/^(?:che ore sono|che ora e|what time is it|what(?:'s| is) the time|ora attuale|dimmi l ora)$/, () => ({ intent: 'time' }));
R(/^(?:che giorno e|che data e|data di oggi|what(?:'s| is)? (?:the )?(?:date|day)(?: today)?|what day is it)$/, () => ({ intent: 'date' }));
R(/^(?:che tempo fa|com e il tempo|meteo|weather|what(?:'s| is) the weather|how(?:'s| is) the weather)(?: (?:a|ad|in|di|a|for|at|like in|in))?\s*(.*)$/, (m) => ({ intent: 'weather', args: { city: lastWord(m).replace(/^(a|in|at|di)\s+/, '') } }));
R(/^(?:come sta il pc|stato del pc|stato del sistema|system status|how(?:'s| is) (?:my|the) pc|quanta ram uso|cpu e ram|uso cpu|pc status)$/, () => ({ intent: 'system' }));
R(/^(?:quanta batteria|stato batteria|battery|battery level|livello batteria)$/, () => ({ intent: 'battery' }));

// ------------------------------------------------------------ calcoli, giochi, conversioni
R(/^(?:quanto fa|calcola|calculate|compute|what is|what s|quanto e|risolvi)\s+(.+)$/, (m) => (/[0-9]/.test(m[1]) && /^[0-9a-z+\-*/^%().,\s]+$/.test(m[1]) ? { intent: 'calc', args: { expr: m[1] } } : null));
R(/^(?:converti|convert|quanti|quante|how many)\s+(\d+(?:[.,]\d+)?)\s*([a-z/°]+)\s+(?:in|to|sono in|are in|in quanti|into)\s+([a-z/°]+)$/, (m) => ({ intent: 'convert', args: { value: parseFloat(m[1].replace(',', '.')), from: m[2], to: m[3] } }));
R(/^(\d+(?:[.,]\d+)?)\s*([a-z/°]+)\s+(?:in|to)\s+([a-z/°]+)$/, (m) => ({ intent: 'convert', args: { value: parseFloat(m[1].replace(',', '.')), from: m[2], to: m[3] } }));
R(/^(?:tira|lancia|roll)(?: un| a| the)? (?:dado|die|dice)(?: a)?(?: (?:d)?(\d+))?(?: facce)?$/, (m) => ({ intent: 'dice', args: { sides: Math.min(1000, Math.max(2, +(m[1] || 6))) } }));
R(/^(?:testa o croce|lancia una moneta|flip a coin|heads or tails|tira una moneta)$/, () => ({ intent: 'coin' }));
R(/^(?:numero (?:a caso|casuale)|random number|dammi un numero a caso)(?: (?:da|tra|between|from) (\d+) (?:a|e|and|to) (\d+))?$/, (m) => ({ intent: 'random', args: { min: m[1] ? +m[1] : 1, max: m[2] ? +m[2] : 100 } }));
R(/^(?:dimmi|raccontami|tell me|dammi)(?: una| a)? (?:barzelletta|battuta|joke)$|^(?:barzelletta|battuta|joke)$/, () => ({ intent: 'joke' }));
R(/^(?:traduci|translate)\s+(.+?)\s+(?:in|to|into)\s+(inglese|italiano|francese|spagnolo|tedesco|english|italian|french|spanish|german|portoghese|giapponese|cinese)$/, (m) => ({ intent: 'claude.ask', args: { prompt: 'Traduci in ' + m[2] + ' questo testo e rispondi solo con la traduzione: ' + m[1] } }));
R(/^(?:dimentica(?: la)? (?:conversazione|chat)|ricomincia da capo|nuova chat con l assistente|forget (?:this|the) (?:conversation|chat)|start over|reset (?:the )?assistant)$/, () => ({ intent: 'agent.reset' }));
R(/^(?:avvia|start|fai partire)(?: il| the)? (?:cronometro|stopwatch)$/, () => ({ intent: 'stopwatch.start' }));

// ------------------------------------------------------------ controllo dell'isola
R(/^(?:mostra|apri|vai a|vai alla|vai al|show|open|go to)(?: la| il| i| le| the)?(?: scheda| tab| pannello)? (musica|music|appunti|clipboard|widget|widgets|controlli|controls|assistente|assistant|impostazioni dell isola|island settings|file shelf|app)(?: dell isola)?$/, (m) => {
  const map = { musica: 'media', music: 'media', appunti: 'clip', clipboard: 'clip', widget: 'widgets', widgets: 'widgets', controlli: 'ctrl', controls: 'ctrl', assistente: 'assistant', assistant: 'assistant', 'impostazioni dell isola': 'set', 'island settings': 'set', 'file shelf': 'shelf', app: 'apps' };
  return { intent: 'ui.tab', args: { tab: map[m[1]] } };
});
R(/^(?:cambia |metti |imposta |set |switch |change )?(?:il )?(?:tema|theme)(?: (?:in|a|to))? ?(nero|black|grafite|graphite|mezzanotte|midnight|chiaro|light|automatico|auto)$/, (m) => ({ intent: 'ui.theme', args: { theme: { nero: 'black', black: 'black', grafite: 'graphite', graphite: 'graphite', mezzanotte: 'midnight', midnight: 'midnight', chiaro: 'light', light: 'light', automatico: 'auto', auto: 'auto' }[m[1]] } }));
R(/^(?:nascondi|disattiva|hide|disable|togli)(?: la| the)? (?:faccina|faccia|mascotte|face|mascot)$/, () => ({ intent: 'ui.face', args: { on: false } }));
R(/^(?:mostra|attiva|show|enable|metti)(?: la| the)? (?:faccina|faccia|mascotte|face|mascot)$/, () => ({ intent: 'ui.face', args: { on: true } }));

// ------------------------------------------------------------ cartelle e VS Code
R(/^(?:apri|open)(?: la| il| the)?(?: cartella| folder)? (download|downloads|scaricati|documenti|documents|desktop|immagini|pictures|musica|music|video|videos|progetti)(?: folder)?$/, (m) => ({ intent: 'folder.open', args: { name: m[1] } }));
R(/^(?:cerca|find|search)\s+(.+?)\s+(?:nei file|in files|nel progetto|in the project|in vs ?code)$/, (m) => ({ intent: 'vscode.find', args: { query: m[1] } }));
R(/^(?:esegui|run)\s+(.+?)\s+(?:nel terminale|in the terminal|in terminal)$/, (m) => ({ intent: 'vscode.run', args: { command: m[1] } }));
R(/^(?:leggi|mostra|read|show)(?: le| my| tutte le)? (?:note|notes)$/, () => ({ intent: 'note.list' }));

// ------------------------------------------------------------ Claude / VS Code / Chrome
R(/^(?:stato di claude|come va claude|claude status|status of claude|cosa sta facendo claude|what is claude doing|stato claude code|claude code status)$/, () => ({ intent: 'claude.status' }));
R(/^(?:apri|open|focus|mostra|show)(?: la| il| the)? claude(?: code)?(?: in vs ?code| in visual studio code| in vscode)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'claude-vscode.sidebar.open', say: 'claude' } }));
R(/^(?:nuova conversazione|new conversation|nuova chat|new chat)(?: (?:con|in|with) claude)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'claude-vscode.newConversation', say: 'newconv' } }));
R(/^(?:accetta|accept|approva|approve)(?: le| the| tutte le)? (?:modifiche|modifica|changes|diff|edit|edits)$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'claude-vscode.acceptProposedDiff', say: 'accept' } }));
R(/^(?:rifiuta|reject|respingi|decline)(?: le| the)? (?:modifiche|modifica|changes|diff|edit|edits)$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'claude-vscode.rejectProposedDiff', say: 'reject' } }));
R(/^(?:chiedi a claude|ask claude|domanda a claude|claude)[: ,]\s*(.+)$/, (m) => ({ intent: 'claude.ask', args: { prompt: m[1] } }));
R(/^(?:salva tutto|save all)(?: i file| files)?(?: in vs ?code)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'workbench.action.files.saveAll', say: 'saveall' } }));
R(/^(?:nuovo terminale|new terminal|apri(?: il)? terminale|open(?: the)? terminal)(?: in vs ?code)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'workbench.action.terminal.new', say: 'terminal' } }));
R(/^(?:formatta|format)(?: il| the)?(?: file| documento| document| codice| code)?(?: in vs ?code)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'editor.action.formatDocument', say: 'format' } }));
R(/^(?:mostra|apri|show|open)(?: i| gli| the)? (?:problemi|errori|problems|errors)(?: in vs ?code)?$/, () => ({ intent: 'vscode.cmd', args: { cmd: 'workbench.actions.view.problems', say: 'problems' } }));
R(/^(?:apri|open)(?: la| il| the)? (?:cartella|progetto|folder|project|workspace) (.+?)(?: in vs ?code| in visual studio code)?$/, (m) => ({ intent: 'vscode.folder', args: { path: m[1] } }));
R(/^(?:stato di vs ?code|vs ?code status|cosa sto modificando|what am i editing|che file ho aperto)$/, () => ({ intent: 'vscode.status' }));
R(/^(?:nuova scheda|new tab|apri una nuova scheda|open a new tab)(?: in chrome)?$/, () => ({ intent: 'chrome.cmd', args: { cmd: 'newTab', say: 'newtab' } }));
R(/^(?:chiudi|close)(?: la| questa| this| the| current)? (?:scheda|tab)(?: corrente| attiva| current)?(?: in chrome)?$/, () => ({ intent: 'chrome.cmd', args: { cmd: 'closeTab', say: 'closetab' } }));
R(/^(?:ricarica|reload|refresh)(?: la| questa| the)?(?: scheda| pagina| tab| page)?(?: in chrome)?$/, () => ({ intent: 'chrome.cmd', args: { cmd: 'reload', say: 'reload' } }));
R(/^(?:schede aperte|quante schede|elenca le schede|list tabs|open tabs|show tabs|what tabs)(?: (?:ho|are open|open))?(?: in chrome)?$/, () => ({ intent: 'chrome.tabs' }));
R(/^(?:vai alla scheda|passa alla scheda|switch to tab|go to tab|apri la scheda)(?: di| con| of)? (.+)$/, (m) => ({ intent: 'chrome.switch', args: { query: m[1] } }));
R(/^(?:metti in pausa|pausa|pause|ferma)(?: il| the)? (?:video|film|youtube)(?: in chrome| nel browser)?$/, () => ({ intent: 'chrome.cmd', args: { cmd: 'pauseMedia', say: 'pausevideo' } }));
R(/^(?:riproduci|play|riprendi|resume)(?: il| the)? (?:video|film)(?: in chrome| nel browser)?$/, () => ({ intent: 'chrome.cmd', args: { cmd: 'playMedia', say: 'playvideo' } }));
R(/^(?:silenzia|muta|mute)(?: la| le| questa| tutte le| the| all)? (?:scheda|schede|tab|tabs)$/, (m) => ({ intent: 'chrome.cmd', args: { cmd: 'muteTabs', say: 'mutetabs' } }));
R(/^(?:cosa c e|cosa dice|leggi|read|summarize|riassumi) (?:questa pagina|la pagina|this page|the page)$/, () => ({ intent: 'chrome.page' }));

// ------------------------------------------------------------ web e app
R(/^(?:cerca|search|google|trova|find|look up|cercami)(?: su| on| in| per| for)? ?(youtube|google|wikipedia|amazon|github|maps)? ?(?:su |on |for |per )?(.+?)(?: (?:su|on|in) (youtube|google|wikipedia|amazon|github|maps))?(?: in chrome| nel browser)?$/, (m) => {
  const q = (m[2] || '').trim(); const engine = m[1] || m[3] || 'google'; return q ? { intent: 'search', args: { query: q, engine, inChrome: /chrome/.test(m[0]) } } : null;
});
R(/^(?:apri|open|vai su|vai a|go to|visit|visita|lancia|launch|avvia|start)(?: il)?(?: sito)?(?: web)?(?: di)? (.+?)(?: in chrome| nel browser| on chrome)?$/, (m) => {
  const name = m[1].trim().replace(/^(?:la|il|lo|l|i|gli|le|the|my|un|una)\s+/, ''); const site = SITES[name]; const isDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(name);
  if (isDomain) return { intent: 'web.open', args: { url: 'https://' + name, inChrome: /chrome/.test(m[0]) } };
  const alias = APP_ALIASES[name] || name;
  return { intent: 'app.open', args: { name: alias, fallbackUrl: site || null, inChrome: /chrome/.test(m[0]) } };
});


/** Il testo viene capito in forma normalizzata (minuscolo, senza accenti): per note, promemoria e ricerche riprende le maiuscole originali. */
function recoverCase(raw, t, args) {
  if (!args) return args;
  const pieces = raw.split(/[\s,;!?"“”]+/).filter((p) => norm(p)); const words = pieces.map(norm);
  if (words.join(' ') !== t) return args;
  const out = { ...args };
  for (const k of ['text', 'prompt', 'query', 'path', 'command']) {
    const v = out[k]; if (typeof v !== 'string' || !v) continue;
    const vw = v.split(' ');
    for (let i = 0; i + vw.length <= words.length; i++) {
      if (words.slice(i, i + vw.length).join(' ') === v) { out[k] = pieces.slice(i, i + vw.length).join(' ').replace(/[.,;:!?]+$/, ''); break; }
    }
  }
  return out;
}

/** Toglie i riempitivi del parlato ("per favore", "puoi aprire l'app di ...", "... sul pc") e porta gli infiniti all'imperativo. */
function tidy(t) {
  let s = t;
  s = s.replace(/^(?:ehi |hey |ok |ciao |dai |allora |senti )+/, '').replace(/^(?:per favore |per piacere |please |ti prego )/, '');
  s = s.replace(/^(?:puoi|potresti|riesci a|mi puoi|mi potresti|vorrei che|voglio che|can you|could you|would you|i want you to|i would like you to)\s+/, '');
  s = s.replace(/^(?:mi |ti chiedo di |devi |dovresti )/, '');
  s = s.replace(/^(aprire|aprirmi|aprimi|apri mi)\b/, 'apri').replace(/^(avviare|avviarmi|avviami)\b/, 'avvia').replace(/^(lanciare|lanciami)\b/, 'lancia').replace(/^(spegnere)\b/, 'spegni').replace(/^(accendere)\b/, 'accendi').replace(/^(disattivare)\b/, 'disattiva').replace(/^(attivare)\b/, 'attiva').replace(/^(mettere)\b/, 'metti').replace(/^(abbassare)\b/, 'abbassa').replace(/^(alzare)\b/, 'alza').replace(/^(cercare)\b/, 'cerca');
  s = s.replace(/^(apri|avvia|lancia|open|launch|start|run)\s+(?:(?:l'|l |un |una |il |lo |la |the |my ))?(?:app(?:licazione)?|programma|program|application)(?: di| del| della| dello| per)? /, '$1 ');
  s = s.replace(/\s+(?:per favore|per piacere|please|grazie|thanks|sul pc|sul computer|su windows|on my pc|on the pc|adesso|ora|subito|now|se puoi)$/, '');
  return s.trim();
}

/** @returns {{intent:string,args?:object,lang:string,raw:string}|null} */
function parse(text, defaultLang = 'it') {
  const raw = String(text || '').trim(); if (!raw) return null;
  const t0 = norm(raw), t = tidy(t0);
  const enW = /\b(the|please|open|set|what|how|next|skip|volume up|remind|search|play|turn|my)\b/.test(t), itW = /\b(il|la|di|per|che|apri|metti|imposta|cerca|salta)\b/.test(t);
  const lang = enW && !itW ? 'en' : itW && !enW ? 'it' : defaultLang;
  for (const [re, fn] of rules) {
    const m = re.exec(t);
    if (!m) continue;
    const r = fn(m); if (r) return { ...r, args: recoverCase(raw, t0, r.args), lang, raw };
  }
  return null;
}

const EXAMPLES = {
  it: ['Metti in pausa la musica', 'Salta questa canzone', 'Volume al 40', 'Timer 10 minuti', 'Ricordami di chiamare Marco tra 20 minuti', 'Che tempo fa a Roma', 'Apri Spotify', 'Cerca ricette di pasta su YouTube', 'Stato di Claude', 'Salva tutto', 'Nuova scheda', 'Chiedi a Claude: spiegami cos è un hash', 'Quanto fa 15 per 7', 'Converti 10 km in miglia', 'Tira un dado', 'Cambia tema in chiaro', 'Dimmi una barzelletta'],
  en: ['Pause the music', 'Skip this song', 'Volume 40', 'Timer 10 minutes', 'Remind me to call Mark in 20 minutes', 'What is the weather in London', 'Open Spotify', 'Search pasta recipes on YouTube', 'Claude status', 'Save all', 'New tab', 'Ask Claude: what is a hash', 'What is 15 times 7', 'Convert 10 km to miles', 'Roll a die', 'Switch theme to light', 'Tell me a joke'],
};

module.exports = { parse, parseDuration, parseWhen, norm, wordsToNumbers, EXAMPLES, SITES };
