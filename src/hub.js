// Hub locale: riceve gli eventi di Claude Code (hook) e parla con le estensioni di VS Code e Chrome.
// Ascolta solo su 127.0.0.1 e richiede un token segreto (generato al primo avvio) per ogni richiesta.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 47820;
// ID fisso dell'estensione Chrome (deriva dalla chiave nel manifest): solo lei puo' ottenere il token dal hub
const CHROME_EXT_ID = 'coenfgoaciniombhfgldobkcmhmenbal';
const CHROME_ORIGIN = `chrome-extension://${CHROME_EXT_ID}`;

class Hub extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir; this.file = path.join(dir, 'hub.json');
    this.clients = new Map();            // kind -> Set<ws>
    this.pending = new Map(); this.seq = 0;
    this.sessions = new Map();           // sessionId -> stato di una sessione di Claude Code
    this.port = DEFAULT_PORT; this.token = ''; this.ignoreCwd = '';
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.token = j.token || ''; } catch { /* primo avvio */ }
    if (!this.token) this.token = crypto.randomBytes(24).toString('hex');
  }

  start() {
    return new Promise((resolve, reject) => {
      let port = DEFAULT_PORT, tries = 0;
      const attempt = () => {
        const server = http.createServer((req, res) => this.onHttp(req, res));
        const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
        server.on('upgrade', (req, socket, head) => {
          const u = new URL(req.url, 'http://x');
          if (u.pathname !== '/ws' || !this.authorized(req, u)) return socket.destroy();
          wss.handleUpgrade(req, socket, head, (ws) => this.onSocket(ws, u.searchParams.get('kind') || 'unknown'));
        });
        server.once('error', (e) => { if (e.code === 'EADDRINUSE' && tries++ < 12) { port++; attempt(); } else reject(e); });
        server.listen(port, '127.0.0.1', () => {
          this.server = server; this.wss = wss; this.port = port;
          try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ port, token: this.token, pid: process.pid })); } catch { /* sola lettura */ }
          resolve(port);
        });
      };
      attempt();
    });
  }

  stop() { try { this.wss && this.wss.clients.forEach((c) => c.terminate()); this.server && this.server.close(); } catch { /* chiuso */ } }

  authorized(req, u) {
    const t = u.searchParams.get('token') || req.headers['x-notch-token'];
    if (typeof t !== 'string' || t.length !== this.token.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(t), Buffer.from(this.token))) return false;
    // le pagine web non possono pilotare il hub: niente richieste con Origin del browser (le estensioni usano chrome-extension://)
    const o = req.headers.origin;
    return !o || o === CHROME_ORIGIN;
  }

  onHttp(req, res) {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && u.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"app":"NotchIsland"}'); }
    if (req.method === 'GET' && u.pathname === '/pair') {
      const o = req.headers.origin;
      // le richieste dell'estensione non portano Origin: serve l'intestazione personalizzata (le pagine web non possono inviarla senza preflight, che qui non e' mai accettato)
      if ((o && o !== CHROME_ORIGIN) || (!o && req.headers['x-notch-pair'] !== 'chrome')) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ token: this.token, port: this.port }));
    }
    if (!this.authorized(req, u)) { res.writeHead(403); return res.end(); }
    if (req.method === 'POST' && u.pathname === '/claude/hook') {
      let body = ''; req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
      req.on('end', () => { try { this.onClaudeHook(JSON.parse(body)); } catch { /* corpo non valido */ } res.writeHead(204); res.end(); });
      return;
    }
    res.writeHead(404); res.end();
  }

  // ------------------------------------------------------------ Claude Code
  onClaudeHook(h) {
    if (this.ignoreCwd && h.cwd && path.resolve(String(h.cwd)).toLowerCase() === this.ignoreCwd) return; // le domande dell'assistente non sono sessioni da mostrare
    const id = h.session_id || 'unknown', ev = h.hook_event_name || '';
    const now = Date.now();
    let s = this.sessions.get(id);
    if (!s) { s = { id, cwd: h.cwd || '', project: path.basename(h.cwd || '') || 'Claude', status: 'idle', since: now, tool: '', prompt: '', message: '', updated: now, tools: 0 }; this.sessions.set(id, s); }
    if (h.cwd) { s.cwd = h.cwd; s.project = path.basename(h.cwd) || s.project; }
    const set = (status) => { if (s.status !== status) { s.status = status; s.since = now; } };
    switch (ev) {
      case 'SessionStart': set('idle'); s.tool = ''; s.tools = 0; break;
      case 'UserPromptSubmit': set('working'); s.prompt = String(h.prompt || '').slice(0, 160); s.tool = ''; s.message = ''; s.tools = 0; break;
      case 'PreToolUse': set('working'); s.tool = h.tool_name || ''; s.detail = toolDetail(h); s.tools++; break;
      case 'PostToolUse': set('working'); s.tool = h.tool_name || s.tool; break;
      case 'Notification': {
        s.message = String(h.message || '').slice(0, 200);
        // ogni notifica di Claude Code chiede la tua attenzione (permesso o risposta); l'avviso "aspetto un tuo input" dopo la fine del lavoro resta "finito"
        if (!(s.status === 'done' && /waiting for your input|in attesa/i.test(s.message))) set('waiting'); break;
      }
      case 'Stop': case 'SubagentStop': if (ev === 'Stop') { set('done'); s.tool = ''; } break;
      case 'SessionEnd': this.sessions.delete(id); break;
      default: break;
    }
    s.updated = now;
    this.emit('claude', { event: ev, session: ev === 'SessionEnd' ? { id, project: s.project, status: 'ended' } : { ...s }, sessions: this.claudeSessions() });
  }

  claudeSessions() {
    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const [k, s] of this.sessions) if (s.updated < cutoff) this.sessions.delete(k);
    return [...this.sessions.values()].sort((a, b) => b.updated - a.updated).map((s) => ({ ...s }));
  }

  // ------------------------------------------------------------ estensioni (WebSocket)
  onSocket(ws, kind) {
    ws.kind = kind; ws.info = {};
    if (!this.clients.has(kind)) this.clients.set(kind, new Set());
    this.clients.get(kind).add(ws);
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(String(data)); } catch { return; }
      if (m.type === 'hello') { ws.info = m.info || {}; this.emit('client', { kind, connected: true, info: ws.info }); }
      else if (m.type === 'state') { ws.info = { ...ws.info, ...m.state }; this.emit('state', { kind, state: ws.info }); }
      else if (m.type === 'event') this.emit('event', { kind, name: m.name, data: m.data });
      else if (m.type === 'result' && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); clearTimeout(p.t); m.ok === false ? p.rej(new Error(m.error || 'errore')) : p.res(m.result); }
    });
    ws.on('close', () => { const set = this.clients.get(kind); set && set.delete(ws); if (!set || set.size === 0) this.emit('client', { kind, connected: false }); });
    ws.on('error', () => { /* chiusura gestita da 'close' */ });
    ws.send(JSON.stringify({ type: 'welcome', app: 'NotchIsland', version: 1 }));
  }

  connected(kind) { const s = this.clients.get(kind); return !!s && s.size > 0; }
  info(kind) { const s = this.clients.get(kind); if (!s || !s.size) return null; const all = [...s]; const withInfo = all.filter((w) => Object.keys(w.info).length); return (withInfo.length ? withInfo[withInfo.length - 1] : all[all.length - 1]).info; }

  /** Invia un comando a un'estensione e attende la risposta. */
  command(kind, cmd, args = {}, timeout = 8000) {
    const set = this.clients.get(kind);
    if (!set || !set.size) return Promise.reject(new Error(`${kind} non collegato`));
    const ws = [...set][set.size - 1];
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error('timeout')); }, timeout);
      this.pending.set(id, { res, rej, t });
      try { ws.send(JSON.stringify({ type: 'command', id, cmd, args })); } catch (e) { clearTimeout(t); this.pending.delete(id); rej(e); }
    });
  }
}

function toolDetail(h) {
  const i = h.tool_input || {};
  return String(i.file_path || i.path || i.command || i.pattern || i.url || i.description || '').slice(0, 120);
}

module.exports = { Hub, DEFAULT_PORT, CHROME_EXT_ID };
