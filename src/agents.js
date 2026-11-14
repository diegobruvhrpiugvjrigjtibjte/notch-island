// Gestione degli agenti PowerShell persistenti (compilati una volta, risposte in pochi millisecondi).
const { spawn } = require('child_process');
const path = require('path');

class Agent {
  constructor(file, onEvent, defer) {
    this.file = path.join(__dirname, 'agents', file); this.onEvent = onEvent || (() => {});
    this.seq = 0; this.pending = new Map(); this.buf = ''; this.proc = null; this.dead = false;
    if (!defer) this.start();
  }
  start() {
    if (this.dead || this.proc) return;
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.file], { windowsHide: true });
    this.proc = p; p.stdout.setEncoding('utf8');
    p.stdout.on('data', c => {
      this.buf += c; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (!line || line[0] !== '{') continue;
        let m; try { m = JSON.parse(line); } catch (e) { continue; }
        if (m.id && this.pending.has(m.id)) { const r = this.pending.get(m.id); this.pending.delete(m.id); clearTimeout(r.t); r.res(m); }
        else if (m.ev) this.onEvent(m);
      }
    });
    p.stdin.on('error', () => {});
    p.on('exit', () => {
      this.proc = null;
      for (const r of this.pending.values()) { clearTimeout(r.t); r.res({ error: 'exit' }); }
      this.pending.clear();
      if (!this.dead) setTimeout(() => this.start(), 1500);
    });
  }
  // invia un comando e attende la risposta
  send(cmd, arg = '', timeout = 15000) {
    return new Promise(res => {
      if (!this.proc) return res({ error: 'offline' });
      const id = ++this.seq;
      const t = setTimeout(() => { this.pending.delete(id); res({ error: 'timeout' }); }, timeout);
      this.pending.set(id, { res, t });
      try { this.proc.stdin.write(id + ' ' + cmd + (arg !== '' ? ' ' + arg : '') + '\n'); } catch (e) { clearTimeout(t); this.pending.delete(id); res({ error: 'write' }); }
    });
  }
  stop() { this.dead = true; try { this.proc && this.proc.stdin.write('0 quit\n'); this.proc && this.proc.stdin.end(); } catch (e) {} setTimeout(() => { try { this.proc && this.proc.kill(); } catch (e) {} }, 500); }
}
module.exports = { Agent };
