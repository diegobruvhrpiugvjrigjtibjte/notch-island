const { parse, parseDuration } = require('../src/brain');
let failed = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t = (phrase, intent, args) => {
  const r = parse(phrase); const ok = r && r.intent === intent && (!args || Object.entries(args).every(([k, v]) => eq(r.args?.[k], v)));
  console.log((ok ? 'OK   ' : 'FAIL ') + JSON.stringify(phrase) + ' -> ' + (r ? r.intent + ' ' + JSON.stringify(r.args || {}) : 'null')); if (!ok) failed++;
};
// musica
t('Metti in pausa la musica', 'media', { action: 'pause' }); t('pausa', 'media', { action: 'pause' }); t('Riprendi', 'media', { action: 'play' }); t('play', 'media', { action: 'play' });
t('Salta questa canzone', 'media', { action: 'next' }); t('prossima', 'media', { action: 'next' }); t('skip the song', 'media', { action: 'next' }); t('next track', 'media', { action: 'next' }); t('skip to the next song', 'media', { action: 'next' });
t('canzone precedente', 'media', { action: 'prev' }); t('previous song', 'media', { action: 'prev' }); t('Che canzone sta suonando?', 'media.now');
// volume, luminosita, mic
t('Volume al 40', 'volume.set', { value: 40 }); t('imposta il volume a 70', 'volume.set', { value: 70 }); t('volume al massimo', 'volume.set', { value: 100 }); t('set volume to 25', 'volume.set', { value: 25 });
t('alza il volume', 'volume.delta', { delta: 10 }); t('abbassa il volume', 'volume.delta', { delta: -10 }); t('turn up the volume', 'volume.delta', { delta: 10 });
t('muta', 'volume.mute', { value: true }); t('silenzia il microfono', 'mic', { muted: true }); t('attiva il microfono', 'mic', { muted: false });
t('luminosità al 60', 'brightness.set', { value: 60 }); t('set brightness to 30', 'brightness.set', { value: 30 }); t('aumenta la luminosità', 'brightness.delta', { delta: 15 });
t('accendi il bluetooth', 'radio', { kind: 'Bluetooth', on: true }); t('spegni il wifi', 'radio', { kind: 'WiFi', on: false }); t('fai uno screenshot', 'screenshot'); t('blocca il pc', 'lock');
// timer, promemoria, note
t('timer 10 minuti', 'timer.start', { seconds: 600 }); t('imposta un timer di cinque minuti', 'timer.start', { seconds: 300 }); t('timer mezz\'ora', 'timer.start', { seconds: 1800 }); t('set a timer for 2 hours', 'timer.start', { seconds: 7200 }); t('pomodoro', 'timer.start', { seconds: 1500 }); t('ferma il timer', 'timer.stop');
t('ricordami di chiamare Marco tra 20 minuti', 'reminder'); t('remind me to take out the trash in 10 minutes', 'reminder'); t('ricordami di comprare il latte alle 18:30', 'reminder');
t('prendi nota: comprare il pane', 'note.add', { text: 'comprare il pane' }); t('aggiungi attività: pagare la bolletta', 'todo.add', { text: 'pagare la bolletta' }); t('add task: send the report', 'todo.add', { text: 'send the report' });
// info
t('che ore sono', 'time'); t('what time is it', 'time'); t('che giorno è', 'date'); t('che tempo fa a Roma', 'weather', { city: 'roma' }); t('weather in London', 'weather', { city: 'london' }); t('meteo', 'weather');
t('come sta il pc', 'system'); t('quanta batteria', 'battery');
// claude / vscode / chrome
t('stato di Claude', 'claude.status'); t('claude status', 'claude.status'); t('chiedi a Claude: spiegami cos è un hash', 'claude.ask', { prompt: 'spiegami cos è un hash' }); t('ask claude what is a mutex', 'claude.ask');
t('apri Claude in VS Code', 'vscode.cmd', { cmd: 'claude-vscode.sidebar.open' }); t('nuova conversazione', 'vscode.cmd', { cmd: 'claude-vscode.newConversation' });
t('accetta le modifiche', 'vscode.cmd', { cmd: 'claude-vscode.acceptProposedDiff' }); t('reject the changes', 'vscode.cmd', { cmd: 'claude-vscode.rejectProposedDiff' });
t('salva tutto', 'vscode.cmd', { cmd: 'workbench.action.files.saveAll' }); t('nuovo terminale', 'vscode.cmd', { cmd: 'workbench.action.terminal.new' }); t('formatta il file', 'vscode.cmd'); t('mostra i problemi', 'vscode.cmd');
t('nuova scheda', 'chrome.cmd', { cmd: 'newTab' }); t('chiudi la scheda', 'chrome.cmd', { cmd: 'closeTab' }); t('schede aperte', 'chrome.tabs'); t('vai alla scheda youtube', 'chrome.switch', { query: 'youtube' });
t('metti in pausa il video', 'chrome.cmd', { cmd: 'pauseMedia' }); t('silenzia le schede', 'chrome.cmd', { cmd: 'muteTabs' }); t('riassumi questa pagina', 'chrome.page');
// web e app
t('cerca ricette di pasta su youtube', 'search', { query: 'ricette di pasta', engine: 'youtube' }); t('search cats on google', 'search', { query: 'cats', engine: 'google' }); t('cerca meteo domani', 'search');
t('apri youtube', 'app.open', { name: 'youtube', fallbackUrl: 'https://www.youtube.com' }); t('vai su github.com', 'web.open', { url: 'https://github.com' }); t('apri Spotify', 'app.open', { name: 'spotify', fallbackUrl: 'https://open.spotify.com' }); t('open notepad', 'app.open'); t('apri vs code', 'app.open', { name: 'visual studio code' });
// calcoli, giochi, controllo dell'isola, cartelle
t('quanto fa 15 per 7', 'calc', { expr: '15 per 7' }); t('calcola 12 + 30', 'calc'); t('what is 2 plus 2', 'calc'); t('quanto fa il 20% di 150', 'calc'); t('what is the weather', 'weather');
t('converti 10 km in miglia', 'convert', { value: 10, from: 'km', to: 'miglia' }); t('convert 5 miles to km', 'convert', { value: 5, from: 'miles', to: 'km' }); t('100 f in c', 'convert', { value: 100, from: 'f', to: 'c' });
t('tira un dado', 'dice', { sides: 6 }); t('roll a die', 'dice'); t('lancia un dado a 20', 'dice', { sides: 20 }); t('testa o croce', 'coin'); t('numero a caso da 1 a 10', 'random', { min: 1, max: 10 }); t('dimmi una barzelletta', 'joke'); t('tell me a joke', 'joke');
t('traduci buongiorno in inglese', 'claude.ask'); t('avvia il cronometro', 'stopwatch.start');
t('mostra la scheda musica', 'ui.tab', { tab: 'media' }); t('apri i widget', 'ui.tab', { tab: 'widgets' }); t('vai alla scheda assistente', 'ui.tab', { tab: 'assistant' });
t('cambia tema in chiaro', 'ui.theme', { theme: 'light' }); t('imposta il tema nero', 'ui.theme', { theme: 'black' }); t('switch theme to midnight', 'ui.theme', { theme: 'midnight' });
t('nascondi la faccina', 'ui.face', { on: false }); t('mostra la faccina', 'ui.face', { on: true });
t('apri la cartella download', 'folder.open', { name: 'download' }); t('open documents', 'folder.open'); t('cerca useState nei file', 'vscode.find', { query: 'useState' }); t('esegui npm test nel terminale', 'vscode.run', { command: 'npm test' }); t('leggi le note', 'note.list');
// esempi del README (inglese)
t('turn off Wi-Fi', 'radio', { kind: 'WiFi', on: false }); t('open the downloads folder', 'folder.open'); t('open the download folder', 'folder.open'); t('what is 20% of 150', 'calc'); t('battery level', 'battery'); t('switch to tab YouTube', 'chrome.switch', { query: 'YouTube' }); t('read my clipboard', 'clipboard.read'); t('summarize this page', 'chrome.page'); t('lock the PC', 'lock'); t('what is the weather in London', 'weather', { city: 'london' }); t('translate good morning to Spanish', 'claude.ask'); t('open the calculator', 'app.open'); t('what is this song', 'media.now'); t('mute the tabs', 'chrome.cmd', { cmd: 'muteTabs' }); t('run npm test in the terminal', 'vscode.run', { command: 'npm test' }); t('open the folder my-project', 'vscode.folder'); t('take a note: ideas for the demo', 'note.add'); t('add task: pay the invoice', 'todo.add'); t('remind me to drink water in 30 minutes', 'reminder'); t('show the widgets', 'ui.tab', { tab: 'widgets' }); t('hide the face', 'ui.face', { on: false }); t('start the stopwatch', 'stopwatch.start'); t('ask Claude: how do I revert a commit', 'claude.ask');
// chiacchiere e sconosciuti
t('ciao', 'chat.hello'); t('grazie', 'chat.thanks'); t('aiuto', 'help');
const unk = parse('scrivimi una poesia sul mare'); console.log((unk === null ? 'OK   ' : 'FAIL ') + 'frase libera -> null (va a Claude)'); if (unk !== null) failed++;
console.log(eq(parseDuration('1 ora 30 minuti'), 5400) ? 'OK   durata composta' : 'FAIL durata composta'); if (!eq(parseDuration('1 ora 30 minuti'), 5400)) failed++;
console.log(failed === 0 ? 'BRAIN: TUTTO OK' : `BRAIN: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
