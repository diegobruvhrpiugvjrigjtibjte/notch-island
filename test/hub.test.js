// Prove di hub.js e claude.js (senza Electron): hook reali via curl, sessioni, WebSocket, installazione/rimozione degli hook.
const assert = require('assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execSync, spawnSync } = require('child_process');
const WebSocket = require('ws');
const { Hub } = require('../src/hub');
const claude = require('../src/claude');

let failed = 0; const ok = (n, c) => { console.log((c ? 'OK   ' : 'FAIL ') + n); if (!c) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-hub-'));
  const hub = new Hub(tmp); const port = await hub.start();
  ok('hub in ascolto su 127.0.0.1', port >= 47820 && fs.existsSync(path.join(tmp, 'hub.json')));
  const events = []; hub.on('claude', (e) => events.push(e));

  // --- installazione degli hook in una "home" temporanea, preservando quelli dell'utente
  const home = path.join(tmp, 'home'); fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const userHook = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mio-hook' }] };
  fs.writeFileSync(claude.settingsPath(home), JSON.stringify({ model: 'opus', hooks: { PreToolUse: [userHook] } }, null, 2));
  let st = claude.install(port, hub.token, home);
  ok('hook installati (7 eventi)', st.installed && st.events.length === 7);
  let s = JSON.parse(fs.readFileSync(claude.settingsPath(home), 'utf8'));
  ok('hook dell\'utente e altre impostazioni intatti', s.model === 'opus' && s.hooks.PreToolUse.some((g) => g.hooks.some((h) => h.command === 'echo mio-hook')));
  ok('copia di sicurezza creata', fs.existsSync(claude.settingsPath(home) + '.notch-backup'));
  claude.install(port, hub.token, home); s = JSON.parse(fs.readFileSync(claude.settingsPath(home), 'utf8'));
  ok('installazione ripetuta senza duplicati', s.hooks.Stop.length === 1 && s.hooks.PreToolUse.length === 2);

  // --- il comando dell'hook, eseguito come lo eseguirebbe Claude Code (JSON su stdin)
  const cmd = s.hooks.UserPromptSubmit[0].hooks[0].command;
  const fire = (payload) => spawnSync(cmd, { input: JSON.stringify(payload), shell: true, encoding: 'utf8', timeout: 8000 });
  let r = fire({ hook_event_name: 'UserPromptSubmit', session_id: 's1', cwd: 'C:\\progetti\\sito', prompt: 'sistema il bug del login' });
  ok('hook eseguito (uscita 0, nessun output)', r.status === 0 && !r.stdout);
  await sleep(150);
  ok('sessione creata: in lavorazione', hub.claudeSessions()[0]?.status === 'working' && hub.claudeSessions()[0].project === 'sito' && hub.claudeSessions()[0].prompt.includes('login'));
  fire({ hook_event_name: 'PreToolUse', session_id: 's1', cwd: 'C:\\progetti\\sito', tool_name: 'Edit', tool_input: { file_path: 'C:\\progetti\\sito\\login.js' } }); await sleep(150);
  ok('strumento in uso mostrato', hub.claudeSessions()[0].tool === 'Edit' && hub.claudeSessions()[0].detail.endsWith('login.js'));
  fire({ hook_event_name: 'Notification', session_id: 's1', message: 'Claude needs your permission to use Bash' }); await sleep(150);
  ok('richiesta di permesso: stato "in attesa"', hub.claudeSessions()[0].status === 'waiting');
  fire({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash' }); await sleep(150);
  ok('dopo il permesso torna al lavoro', hub.claudeSessions()[0].status === 'working');
  fire({ hook_event_name: 'Stop', session_id: 's1' }); await sleep(150);
  ok('fine del turno: "completato"', hub.claudeSessions()[0].status === 'done');
  fire({ hook_event_name: 'UserPromptSubmit', session_id: 's2', cwd: 'C:\\altro', prompt: 'altro compito' }); await sleep(150);
  ok('due sessioni in parallelo', hub.claudeSessions().length === 2);
  fire({ hook_event_name: 'SessionEnd', session_id: 's2' }); await sleep(150);
  ok('sessione chiusa rimossa', hub.claudeSessions().length === 1);

  // --- sicurezza: token errato, origine del browser
  const bad = await fetch(`http://127.0.0.1:${port}/claude/hook?token=sbagliato`, { method: 'POST', body: '{}' });
  ok('token errato rifiutato (403)', bad.status === 403);
  const web = await fetch(`http://127.0.0.1:${port}/claude/hook?token=${hub.token}`, { method: 'POST', body: '{}', headers: { Origin: 'https://sito-malevolo.example' } });
  ok('richiesta da una pagina web rifiutata (403)', web.status === 403);
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  ok('health pubblico senza dati', health.ok === true);

  // --- WebSocket: estensione simulata
  await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${hub.token}&kind=vscode`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', info: { name: 'test' } })));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.type === 'command') ws.send(JSON.stringify({ type: 'result', id: m.id, ok: true, result: { eco: m.cmd, args: m.args } }));
    });
    hub.once('client', async (c) => {
      ok('estensione collegata', c.kind === 'vscode' && hub.connected('vscode'));
      const res = await hub.command('vscode', 'saveAll', { a: 1 });
      ok('comando inviato e risposta ricevuta', res.eco === 'saveAll' && res.args.a === 1);
      ws.close(); resolve();
    });
  });
  await sleep(200);
  ok('estensione scollegata', !hub.connected('vscode'));
  const rej = await hub.command('chrome', 'x').then(() => false, () => true);
  ok('comando senza estensione: errore chiaro', rej);
  const wsBad = new WebSocket(`ws://127.0.0.1:${port}/ws?token=no&kind=chrome`);
  ok('WebSocket con token errato rifiutato', await new Promise((r) => { wsBad.on('error', () => r(true)); wsBad.on('open', () => r(false)); }));

  // --- rimozione: ripristina lo stato originale degli hook dell'utente
  st = claude.uninstall(home); s = JSON.parse(fs.readFileSync(claude.settingsPath(home), 'utf8'));
  ok('hook rimossi, quelli dell\'utente restano', !st.installed && st.events.length === 0 && s.hooks.PreToolUse.length === 1 && s.model === 'opus' && !s.hooks.Stop);
  ok('Claude Code trovato sul PC', !!claude.findClaude());

  hub.stop();
  console.log(failed === 0 ? 'HUB: TUTTO OK' : `HUB: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('ERRORE', e); process.exit(1); });
