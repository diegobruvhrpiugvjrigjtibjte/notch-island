// Integrazione con Claude Code: installazione degli hook, ricerca dell'eseguibile e domande con "claude -p".
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MARK = 'notch-island-hub';
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd'];

const settingsPath = (home = os.homedir()) => path.join(home, '.claude', 'settings.json');

function hookCommand(port, token) {
  // curl e' presente su Windows 10/11, macOS e Linux. "|| exit 0" funziona sia in bash sia in cmd: se l'app e' chiusa Claude Code non viene disturbato.
  return `curl -s -m 2 --connect-timeout 1 -H "Content-Type: application/json" --data-binary @- "http://127.0.0.1:${port}/claude/hook?token=${token}&via=${MARK}" || exit 0`;
}

function readSettings(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('settings.json non valido: ' + e.message); }
}

const isOurs = (h) => h && typeof h.command === 'string' && h.command.includes(MARK);

function status(home) {
  try {
    const s = readSettings(settingsPath(home)); const hooks = s.hooks || {};
    const present = EVENTS.filter((e) => (hooks[e] || []).some((g) => (g.hooks || []).some(isOurs)));
    return { installed: present.length === EVENTS.length, partial: present.length > 0 && present.length < EVENTS.length, events: present, file: settingsPath(home) };
  } catch (e) { return { installed: false, error: e.message, file: settingsPath(home) }; }
}

/** Porta scritta negli hook gia' installati (null se non ci sono): serve a riallinearli se il hub parte su un'altra porta. */
function installedPort(home) {
  try {
    const s = readSettings(settingsPath(home));
    for (const ev of EVENTS) for (const g of (s.hooks || {})[ev] || []) for (const h of g.hooks || []) if (isOurs(h)) { const m = /127\.0\.0\.1:(\d+)\//.exec(h.command); if (m) return Number(m[1]); }
  } catch { /* file non leggibile */ }
  return null;
}

/** Aggiunge i nostri hook senza toccare quelli esistenti. Crea una copia di sicurezza la prima volta. */
function install(port, token, home) {
  const file = settingsPath(home);
  const s = readSettings(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backup = file + '.notch-backup';
  if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  s.hooks = s.hooks || {};
  const cmd = hookCommand(port, token);
  for (const ev of EVENTS) {
    const groups = (s.hooks[ev] = s.hooks[ev] || []);
    // rimuove una nostra versione precedente (porta/token cambiati) e inserisce quella nuova
    for (const g of groups) g.hooks = (g.hooks || []).filter((h) => !isOurs(h));
    s.hooks[ev] = groups.filter((g) => (g.hooks || []).length > 0);
    s.hooks[ev].push({ matcher: ev === 'PreToolUse' || ev === 'PostToolUse' ? '*' : '', hooks: [{ type: 'command', command: cmd, timeout: 5 }] });
  }
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  return status(home);
}

function uninstall(home) {
  const file = settingsPath(home);
  if (!fs.existsSync(file)) return status(home);
  const s = readSettings(file);
  for (const ev of Object.keys(s.hooks || {})) {
    s.hooks[ev] = (s.hooks[ev] || []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) })).filter((g) => g.hooks.length > 0);
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  return status(home);
}

/** Cerca l'eseguibile di Claude Code: PATH, installazione locale e binario incluso nell'estensione di VS Code. */
function findClaude(home = os.homedir()) {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const cands = [];
  for (const d of (process.env.PATH || '').split(path.delimiter)) if (d) { cands.push(path.join(d, exe)); if (process.platform === 'win32') cands.push(path.join(d, 'claude.cmd')); }
  cands.push(path.join(home, '.local', 'bin', exe), path.join(home, '.claude', 'local', exe));
  try {
    const ext = path.join(home, '.vscode', 'extensions');
    const dirs = fs.readdirSync(ext).filter((n) => n.startsWith('anthropic.claude-code')).sort().reverse();
    for (const d of dirs) cands.push(path.join(ext, d, 'resources', 'native-binary', exe));
  } catch { /* VS Code non installato */ }
  return cands.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}

/** Fa una domanda a Claude Code in modalita' non interattiva (usa l'accesso gia' effettuato dall'utente). */
function ask(prompt, { cwd = os.homedir(), model = '', timeout = 120000, system = '' } = {}) {
  return new Promise((resolve, reject) => {
    const bin = findClaude();
    if (!bin) return reject(new Error('Claude Code non trovato. Installalo o apri VS Code con l\'estensione Claude Code.'));
    const args = ['-p', prompt, '--output-format', 'text'];
    if (model) args.push('--model', model);
    if (system) args.push('--append-system-prompt', system);
    args.push('--permission-mode', 'plan'); // sola lettura: l'assistente non modifica file
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const t = setTimeout(() => { child.kill(); reject(new Error('Claude non ha risposto in tempo')); }, timeout);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => { clearTimeout(t); code === 0 && out.trim() ? resolve(out.trim()) : reject(new Error((err || out || `uscita ${code}`).trim().slice(0, 300))); });
  });
}


// ------------------------------------------------------------------ agente: una vera sessione di Claude Code che esegue compiti sul PC
// Usa il login dell'utente (abbonamento): la chiave API viene tolta dall'ambiente, quindi nessun costo a consumo.
const AGENT_SYSTEM = {
  it: "Sei l'assistente di NotchIsland sul PC Windows dell'utente: esegui le richieste usando gli strumenti (terminale, file, web). Rispondi alla fine con 1-3 frasi brevi e parlabili, senza markdown, nella lingua dell'utente. Prima di azioni distruttive o irreversibili (cancellare file, spegnere o riavviare il PC, installare o disinstallare programmi, inviare dati all'esterno) NON eseguirle: fai una domanda di conferma e aspetta la risposta. Suggerimenti per Windows: per aprire un'app trova il nome con `powershell -c \"Get-StartApps | Where Name -like '*nome*'\"` e avviala con `powershell -c \"Start-Process 'shell:AppsFolder\\<AppID>'\"` (oppure `start \"\" \"percorso.exe\"`); per le impostazioni di Windows usa `start ms-settings:...` (es. ms-settings:nightlight, ms-settings:bluetooth); per attivare o disattivare funzioni prova prima i comandi PowerShell o il registro di sistema dell'utente (HKCU) e verifica il risultato; i siti si aprono con `start https://...`.",
  en: "You are the NotchIsland assistant on the user's Windows PC: carry out requests using your tools (terminal, files, web). Finish with 1-3 short, speakable sentences, no markdown, in the user's language. Before destructive or irreversible actions (deleting files, shutting down or rebooting, installing or uninstalling software, sending data out) do NOT run them: ask for confirmation and wait for the answer. Windows hints: to open an app find its name with `powershell -c \"Get-StartApps | Where Name -like '*name*'\"` and launch it with `powershell -c \"Start-Process 'shell:AppsFolder\\<AppID>'\"` (or `start \"\" \"path.exe\"`); for Windows settings use `start ms-settings:...` (e.g. ms-settings:nightlight, ms-settings:bluetooth); to toggle features try PowerShell or the user registry (HKCU) first and verify the result; open websites with `start https://...`.",
};
// comandi che l'agente non puo' mai lanciare, nemmeno in modalita' "agisci"
const DENY = ['Bash(rm -rf:*)', 'Bash(rm -r:*)', 'Bash(rmdir /s:*)', 'Bash(del /s:*)', 'Bash(del /q:*)', 'Bash(format:*)', 'Bash(diskpart:*)', 'Bash(shutdown:*)', 'Bash(reg delete:*)', 'Bash(Remove-Item -Recurse:*)', 'Bash(Format-Volume:*)', 'Bash(git push --force:*)', 'Bash(git reset --hard:*)'];
const TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

/**
 * Avvia (o riprende con resume) una sessione di Claude Code in modalita' non interattiva.
 * mode: 'act' = puo' eseguire comandi e modificare file; 'read' = sola lettura (piano).
 * onEvent({kind:'tool'|'text'|'init', ...}) segue l'avanzamento. Restituisce { promise, abort }.
 */
function agent(prompt, { cwd = os.homedir(), resume = '', mode = 'act', lang = 'it', timeout = 600000, onEvent = () => {}, addDirs = [os.homedir()] } = {}) {
  const bin = findClaude();
  if (!bin) return { promise: Promise.reject(new Error('Claude Code non trovato. Installalo o apri VS Code con l\'estensione Claude Code.')), abort() {} };
  const args = ['-p', String(prompt), '--output-format', 'stream-json', '--verbose', '--append-system-prompt', AGENT_SYSTEM[lang] || AGENT_SYSTEM.it];
  if (resume) args.push('--resume', resume);
  for (const d of addDirs) args.push('--add-dir', d);
  if (mode === 'read') args.push('--permission-mode', 'plan');
  else args.push('--permission-mode', 'acceptEdits', '--allowedTools', TOOLS.join(','), '--disallowedTools', DENY.join(','));
  const env = { ...process.env }; delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(bin, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let aborted = false, buf = '', err = '', final = null, sid = resume || '', tools = 0, text = '';
  const detail = (i) => String(i.command || i.file_path || i.path || i.pattern || i.url || i.query || i.description || '').replace(/\s+/g, ' ').slice(0, 140);
  const line = (l) => {
    let m; try { m = JSON.parse(l); } catch { return; }
    if (m.session_id) sid = m.session_id;
    if (m.type === 'system' && m.subtype === 'init') onEvent({ kind: 'init', session: sid, apiKeySource: m.apiKeySource || '', model: m.model || '' });
    else if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const c of m.message.content) {
        if (c.type === 'tool_use') { tools++; onEvent({ kind: 'tool', name: c.name, detail: detail(c.input || {}) }); }
        else if (c.type === 'text' && c.text && c.text.trim()) { text = c.text.trim(); onEvent({ kind: 'text', text }); }
      }
    } else if (m.type === 'result') final = m;
  };
  const promise = new Promise((resolve, reject) => {
    const t = setTimeout(() => { aborted = true; child.kill(); reject(new Error('Claude non ha finito in tempo')); }, timeout);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(t); reject(e); });
    child.on('close', (code) => {
      clearTimeout(t); if (buf.trim()) line(buf);
      if (aborted) return reject(new Error('Interrotto'));
      if (final && !final.is_error) return resolve({ text: String(final.result || text || '').trim(), session: sid, tools, cost: final.total_cost_usd, turns: final.num_turns });
      reject(new Error(((final && final.result) || err || ('uscita ' + code)).toString().trim().slice(0, 300)));
    });
  });
  return { promise, abort() { aborted = true; try { child.kill(); } catch { /* gia' chiuso */ } } };
}

module.exports = { agent, DENY, TOOLS, MARK, EVENTS, hookCommand, status, installedPort, install, uninstall, findClaude, ask, settingsPath };
