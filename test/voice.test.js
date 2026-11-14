const fs = require('fs'), os = require('os'), path = require('path'); const { execSync } = require('child_process');
const { Voice, cleanText, floatToWav16k, extractWhisper } = require('../src/voice');
let failed = 0; const ok = (n, c) => { console.log((c ? 'OK   ' : 'FAIL ') + n); if (!c) failed++; };
(async () => {
  ok('testo pulito', cleanText(' Metti in pausa la musica. ') === 'Metti in pausa la musica.');
  ok('[BLANK_AUDIO] scartato', cleanText('[BLANK_AUDIO]') === ''); ok('allucinazione "Sottotitoli" scartata', cleanText('Sottotitoli creati dalla comunità di Amara.org') === ''); ok('"(musica)" scartato', cleanText('(musica)') === '');
  ok('parte tra parentesi rimossa', cleanText('Volume al 40 [rumore]') === 'Volume al 40');
  const tone = new Float32Array(48000); for (let i = 0; i < tone.length; i++) tone[i] = Math.sin(i / 20);
  const wav = floatToWav16k(tone, 48000);
  ok('WAV: intestazione RIFF/WAVE', wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE');
  ok('WAV: 16 kHz mono 16 bit', wav.readUInt32LE(24) === 16000 && wav.readUInt16LE(22) === 1 && wav.readUInt16LE(34) === 16);
  ok('WAV: 1 s di audio = 32000 byte di dati', wav.readUInt32LE(40) === 32000 && wav.length === 44 + 32000);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notch-voice-test-'));
  const v = new Voice(tmp); ok('stato: voce non installata in una cartella vuota', v.status().ready === false);
  const rej = await v.transcribe(wav).then(() => false, (e) => /non installata/.test(e.message)); ok('trascrizione senza installazione: errore chiaro', rej);
  // estrazione: zip finto con la stessa struttura di quello vero (nessun programma viene eseguito)
  const src = path.join(tmp, 'src', 'Release'); fs.mkdirSync(src, { recursive: true });
  for (const f of ['whisper-cli.exe', 'whisper.dll', 'ggml.dll', 'altro.exe', 'bench.exe']) fs.writeFileSync(path.join(src, f), 'x');
  const zip = path.join(tmp, 'w.zip'); execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${path.join(tmp, 'src', 'Release')}' -DestinationPath '${zip}'"`);
  const dest = path.join(tmp, 'bin'); fs.mkdirSync(dest); await extractWhisper(zip, dest);
  const got = fs.readdirSync(dest).sort(); ok('estrazione: solo whisper-cli.exe e le .dll', JSON.stringify(got) === JSON.stringify(['ggml.dll', 'whisper-cli.exe', 'whisper.dll']));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed === 0 ? 'VOICE: TUTTO OK' : `VOICE: ${failed} PROVE FALLITE`); process.exit(failed ? 1 : 0);
})();
