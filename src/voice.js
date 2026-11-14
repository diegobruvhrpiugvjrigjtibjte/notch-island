// Riconoscimento vocale locale con whisper.cpp: l'audio non lascia mai il PC.
// Il programma e il modello si scaricano una volta sola (con verifica SHA-256) nella cartella dati dell'app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ASSETS = {
  bin: { url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip', file: 'whisper.zip', size: 8194445, sha256: '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a' },
  model: { url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin', file: 'ggml-small-q5_1.bin', size: 190085487, sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb' },
};

// frasi inventate da whisper sul silenzio o sul rumore: vanno scartate
const HALLUCINATIONS = /^(?:\[?\(?(?:blank_audio|silence|silenzio|musica|music|applausi|applause|rumore|noise)\)?\]?\W*|sottotitoli.*|sottotitoli e revisione.*|grazie per la visione.*|thanks for watching.*|thank you for watching.*|iscriviti.*|subtitles by.*|amara\.org.*|grazie\.?)$/i;

function cleanText(raw) {
  let t = String(raw || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || HALLUCINATIONS.test(t) || t.length < 2) return '';
  return t;
}

const sha256 = (file) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });

function download(url, dest, onProgress, redirects = 6) {
  return new Promise((res, rej) => {
    const req = https.get(url, { headers: { 'User-Agent': 'NotchIsland-voice' } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects > 0) { r.resume(); return res(download(new URL(r.headers.location, url).toString(), dest, onProgress, redirects - 1)); }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('Download non riuscito (HTTP ' + r.statusCode + ')')); }
      const total = Number(r.headers['content-length'] || 0); let got = 0, last = 0;
      const out = fs.createWriteStream(dest);
      r.on('data', (c) => { got += c.length; const now = Date.now(); if (onProgress && now - last > 250) { last = now; onProgress(got, total); } });
      r.pipe(out); out.on('finish', () => out.close(() => res(got))); out.on('error', rej); r.on('error', rej);
    });
    req.on('error', rej); req.setTimeout(30000, () => req.destroy(new Error('Connessione scaduta')));
  });
}

class Voice {
  constructor(userData) {
    this.dir = path.join(userData, 'voice'); this.busy = false; this.queue = Promise.resolve();
    this.bin = process.env.NOTCH_WHISPER_BIN || path.join(this.dir, 'bin', 'whisper-cli.exe');
    this.model = process.env.NOTCH_WHISPER_MODEL || path.join(this.dir, ASSETS.model.file);
  }
  status() {
    const hasBin = fs.existsSync(this.bin), hasModel = fs.existsSync(this.model) && (!!process.env.NOTCH_WHISPER_SCRIPT || fs.statSync(this.model).size >= ASSETS.model.size - 1024);
    return { ready: hasBin && hasModel, hasBin, hasModel, installing: this.busy, sizeMB: Math.round((ASSETS.bin.size + ASSETS.model.size) / 1048576) };
  }

  /** Scarica e prepara programma + modello. progress({step, pct}) */
  async install(progress = () => {}) {
    if (this.busy) throw new Error('Installazione gia in corso');
    this.busy = true;
    try {
      fs.mkdirSync(path.join(this.dir, 'bin'), { recursive: true });
      const got = async (a, label, pct0, pct1) => {
        const dest = path.join(this.dir, a.file);
        if (fs.existsSync(dest) && fs.statSync(dest).size === a.size && (await sha256(dest)) === a.sha256) return dest;
        progress({ step: label, pct: pct0 });
        const part = dest + '.part';
        await download(a.url, part, (g, t) => progress({ step: label, pct: Math.round(pct0 + (pct1 - pct0) * (g / (t || a.size))) }));
        progress({ step: 'Verifica ' + label, pct: pct1 });
        if ((await sha256(part)) !== a.sha256) { fs.rmSync(part, { force: true }); throw new Error('Verifica di integrita fallita per ' + label); }
        fs.renameSync(part, dest); return dest;
      };
      if (!fs.existsSync(this.bin)) {
        const zip = await got(ASSETS.bin, 'programma di riconoscimento', 0, 8);
        progress({ step: 'Estrazione', pct: 9 });
        await extractWhisper(zip, path.join(this.dir, 'bin'));
      }
      if (!this.status().hasModel) await got(ASSETS.model, 'modello vocale', 10, 98);
      progress({ step: 'Pronto', pct: 100 });
      return this.status();
    } finally { this.busy = false; }
  }

  /** WAV 16 kHz mono (Buffer) -> testo. Le richieste vengono messe in coda. */
  transcribe(wav, { lang = 'it', prompt = '' } = {}) {
    const job = this.queue.then(() => this._run(wav, lang, prompt));
    this.queue = job.catch(() => {}); return job;
  }
  _run(wav, lang, prompt) {
    return new Promise((res, rej) => {
      if (!this.status().ready) return rej(new Error('Voce non installata'));
      const f = path.join(os.tmpdir(), 'notch-voice-' + process.pid + '-' + Date.now() + '.wav'); fs.writeFileSync(f, wav);
      const args = ['-m', this.model, '-f', f, '-l', /^(it|en|auto)$/.test(lang) ? lang : 'it', '-nt', '-np', '-t', String(Math.max(2, Math.min(8, os.cpus().length - 2))), '--no-fallback'];
      if (prompt) args.push('--prompt', prompt);
      if (process.env.NOTCH_WHISPER_SCRIPT) args.unshift(process.env.NOTCH_WHISPER_SCRIPT); // solo per i test automatici: al posto di whisper gira uno script
      const p = spawn(this.bin, args, { windowsHide: true, cwd: path.dirname(this.bin) });
      let out = '', err = ''; const to = setTimeout(() => { try { p.kill(); } catch { /* gia' chiuso */ } }, 90000);
      p.stdout.setEncoding('utf8'); p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
      const done = () => { clearTimeout(to); fs.rm(f, { force: true }, () => {}); };
      p.on('error', (e) => { done(); rej(e); });
      p.on('close', (code) => { done(); code === 0 ? res(cleanText(out)) : rej(new Error('Riconoscimento non riuscito (' + code + ') ' + err.slice(-200))); });
    });
  }
}

/** Estrae solo whisper-cli.exe e le librerie (.dll) dallo zip con .NET (nessun programma scaricato viene eseguito). */
function extractWhisper(zip, destDir) {
  return new Promise((res, rej) => {
    const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${zip.replace(/'/g, "''")}'); try{ foreach($e in $z.Entries){ if($e.Name -ne '' -and ($e.Name -eq 'whisper-cli.exe' -or $e.Name -like '*.dll')){ [IO.Compression.ZipFileExtensions]::ExtractToFile($e,(Join-Path '${destDir.replace(/'/g, "''")}' $e.Name),$true) } } } finally { $z.Dispose() }`;
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 && fs.existsSync(path.join(destDir, 'whisper-cli.exe')) ? res() : rej(new Error('Estrazione non riuscita ' + err.slice(0, 200)))));
    p.on('error', rej);
  });
}

/** Float32 (qualsiasi frequenza) -> WAV PCM16 mono 16 kHz (usato dai test; nel renderer c'e' la stessa logica) */
function floatToWav16k(samples, rate) {
  const ratio = rate / 16000, n = Math.floor(samples.length / ratio), pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)] || 0)); pcm.writeInt16LE(Math.round(s * 32767), i * 2); }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

module.exports = { Voice, cleanText, floatToWav16k, extractWhisper, ASSETS, sha256 };
