// NotchIsland per VS Code: invia lo stato dell'editor all'isola ed esegue i suoi comandi (solo su 127.0.0.1).
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

let ws = null, timer = null, backoff = 1500, status = 'disconnesso', out;

function hubFile() {
  const home = os.homedir();
  const base = process.platform === 'win32' ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'NotchIsland')
    : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'NotchIsland') : path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'NotchIsland');
  return process.env.NOTCH_HUB_FILE || path.join(base, 'hub.json');
}

function connect() {
  clearTimeout(timer);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  let hub; try { hub = JSON.parse(fs.readFileSync(hubFile(), 'utf8')); } catch { status = 'NotchIsland non in esecuzione'; return retry(); }
  try { ws = new WebSocket(`ws://127.0.0.1:${hub.port}/ws?kind=vscode&token=${hub.token}`); } catch { return retry(); }
  ws.on('open', () => { backoff = 1500; status = 'collegato'; send({ type: 'hello', info: { name: 'VS Code', version: vscode.version, workspace: workspaceName() } }); pushState(); });
  ws.on('message', async (data) => {
    let m; try { m = JSON.parse(String(data)); } catch { return; }
    if (m.type !== 'command') return;
    try { send({ type: 'result', id: m.id, ok: true, result: await run(m.cmd, m.args || {}) }); }
    catch (e) { send({ type: 'result', id: m.id, ok: false, error: String(e && e.message || e) }); }
  });
  ws.on('close', () => { status = 'disconnesso'; ws = null; retry(); });
  ws.on('error', () => { try { ws && ws.close(); } catch { /* già chiuso */ } });
}
function retry() { timer = setTimeout(connect, backoff); backoff = Math.min(backoff * 1.6, 15000); }
const send = (o) => { try { ws && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o)); } catch { /* socket chiuso */ } };

const workspaceName = () => (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] ? vscode.workspace.workspaceFolders[0].name : '');

let stT = null;
function pushState() {
  clearTimeout(stT);
  stT = setTimeout(() => {
    const ed = vscode.window.activeTextEditor;
    let errors = 0, warnings = 0;
    for (const [, ds] of vscode.languages.getDiagnostics()) for (const d of ds) { if (d.severity === 0) errors++; else if (d.severity === 1) warnings++; }
    let branch = '';
    try { const git = vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1); branch = git?.repositories?.[0]?.state?.HEAD?.name || ''; } catch { /* git non disponibile */ }
    send({ type: 'state', state: {
      workspace: workspaceName(), file: ed ? path.basename(ed.document.fileName) : '', language: ed ? ed.document.languageId : '', filePath: ed ? ed.document.fileName : '',
      dirty: vscode.workspace.textDocuments.filter((d) => d.isDirty).length, errors, warnings, terminals: vscode.window.terminals.length,
      debugging: !!vscode.debug.activeDebugSession, branch,
    } });
  }, 400);
}

// comandi di VS Code consentiti: nessun comando arbitrario
const ALLOWED = /^(workbench\.|editor\.|claude-vscode\.|git\.|vscode\.open|vscode\.openFolder|notchIsland\.|search\.|explorer\.|terminal\.|breadcrumbs\.|testing\.)/;

async function run(cmd, a) {
  switch (cmd) {
    case 'ping': return { pong: true, version: vscode.version };
    case 'getState': return { workspace: workspaceName(), file: vscode.window.activeTextEditor?.document.fileName || '' };
    case 'exec': {
      if (typeof a.command !== 'string' || !ALLOWED.test(a.command)) throw new Error('Comando non consentito: ' + a.command);
      const r = await vscode.commands.executeCommand(a.command, ...(Array.isArray(a.args) ? a.args : []));
      return { done: a.command, result: typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean' ? r : null };
    }
    case 'openFile': {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(a.path));
      const ed = await vscode.window.showTextDocument(doc, { preview: false });
      if (Number.isInteger(a.line)) { const p = new vscode.Position(Math.max(0, a.line - 1), 0); ed.selection = new vscode.Selection(p, p); ed.revealRange(new vscode.Range(p, p)); }
      return { opened: path.basename(a.path) };
    }
    case 'openFolder': {
      if (!fs.existsSync(a.path)) throw new Error('Cartella inesistente: ' + a.path);
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(a.path), { forceNewWindow: !!a.newWindow });
      return { folder: a.path };
    }
    case 'findInFiles': await vscode.commands.executeCommand('workbench.action.findInFiles', { query: String(a.query || ''), triggerSearch: true }); return { searched: a.query };
    case 'runInTerminal': {
      // per sicurezza il comando va confermato da te, dentro VS Code
      const ok = await vscode.window.showWarningMessage(`NotchIsland vuole eseguire nel terminale:\n${a.command}`, { modal: true }, 'Esegui');
      if (ok !== 'Esegui') throw new Error('Esecuzione annullata');
      const t = vscode.window.createTerminal(a.name || 'NotchIsland'); t.show(); t.sendText(String(a.command)); return { started: true };
    }
    case 'message': vscode.window.showInformationMessage(String(a.text || '')); return { shown: true };
    default: throw new Error('Comando sconosciuto: ' + cmd);
  }
}

function activate(ctx) {
  out = vscode.window.createOutputChannel('NotchIsland');
  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(pushState), vscode.workspace.onDidChangeTextDocument(pushState), vscode.workspace.onDidSaveTextDocument(pushState),
    vscode.languages.onDidChangeDiagnostics(pushState), vscode.window.onDidOpenTerminal(pushState), vscode.window.onDidCloseTerminal(pushState),
    vscode.debug.onDidStartDebugSession(pushState), vscode.debug.onDidTerminateDebugSession(pushState), vscode.workspace.onDidChangeWorkspaceFolders(pushState),
    vscode.commands.registerCommand('notchIsland.reconnect', () => { backoff = 500; connect(); }),
    vscode.commands.registerCommand('notchIsland.status', () => vscode.window.showInformationMessage('NotchIsland: ' + status)),
    { dispose: () => { clearTimeout(timer); try { ws && ws.close(); } catch { /* già chiuso */ } } },
  );
  connect();
}
function deactivate() { clearTimeout(timer); try { ws && ws.close(); } catch { /* già chiuso */ } }
module.exports = { activate, deactivate };
