// Piccolo client CDP per pilotare la finestra dell'isola nei test automatici.
const WebSocket = require('ws');
async function connect(port, urlPart = 'island/index.html', tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const t = list.find((x) => x.type === 'page' && x.url.includes(urlPart));
      if (t) return open(t.webSocketDebuggerUrl);
    } catch { /* non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('finestra non trovata');
}
function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); let id = 0; const pend = new Map(); const logs = [];
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
      else if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' ')); else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
    const call = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend.set(i, { res: r, rej: j }); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.on('open', async () => { await call('Runtime.enable'); await call('Page.enable'); res({ call, logs, close: () => ws.close(),
      eval: async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
      shot: async (file, clip) => { const r = await call('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); require('fs').writeFileSync(file, Buffer.from(r.data, 'base64')); } }); });
    ws.on('error', rej);
  });
}
module.exports = { connect };
