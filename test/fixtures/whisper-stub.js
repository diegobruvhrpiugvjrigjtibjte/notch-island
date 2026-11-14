// Finto whisper-cli per i test: legge il WAV ricevuto e, se contiene davvero voce (energia sufficiente), risponde con una frase fissa.
const fs = require('fs'); const a = process.argv; const f = a[a.indexOf('-f') + 1]; const wav = fs.readFileSync(f);
const n = (wav.length - 44) >> 1; let s = 0; for (let i = 0; i < n; i++) { const v = wav.readInt16LE(44 + i * 2) / 32768; s += v * v; }
const rms = Math.sqrt(s / Math.max(1, n)), secs = n / 16000;
process.stderr.write(`stub: ${secs.toFixed(2)}s rms=${rms.toFixed(4)} lang=${a[a.indexOf('-l') + 1]}\n`);
process.stdout.write(wav.toString('ascii', 0, 4) === 'RIFF' && secs > 0.5 && rms > 0.003 ? ' che ore sono\n' : ' [BLANK_AUDIO]\n');
