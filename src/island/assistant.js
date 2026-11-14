// Scheda Assistente: chat testuale, voce (microfono -> whisper locale) e risposta parlata.
import { icon } from '../shared/icons.js';
import { mountAvatar, setAvatarState } from './avatar.js';
import { tr } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Float32 -> WAV PCM16 mono 16 kHz */
export function encodeWav(chunks, rate) {
  let n = 0; for (const c of chunks) n += c.length;
  const all = new Float32Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = rate / 16000, len = Math.floor(n / ratio), buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
  const w = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i++) { const p = i * ratio, i0 = Math.floor(p), f = p - i0, s = all[i0] * (1 - f) + (all[i0 + 1] ?? all[i0]) * f; v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true); }
  return buf;
}

export function initAssistant(root, ctx) {
  const { api } = ctx;
  root.innerHTML = `<div class="as">
    <div class="as-top"><div id="face-a"></div><div class="as-info"><div class="as-status" data-status>Scrivi o parla con me</div><div class="sub" data-sub></div></div>
      <button class="btn sm ghost" type="button" data-newchat title="Dimentica la conversazione con Claude">Nuova chat</button><label class="switch tiny"><input type="checkbox" data-tts><i></i><span>Voce</span></label></div>
    <div class="as-log" data-log></div>
    <div class="as-banner" data-banner hidden></div>
    <div class="as-chips" data-chips></div>
    <form class="as-in" data-form><button type="button" class="micbtn" data-mic aria-label="Parla">${icon('mic', 20)}</button><input data-text placeholder="Scrivi un comando o una domanda..." spellcheck="false" autocomplete="off"><button class="sendbtn" type="submit" data-send aria-label="Invia">${icon('send', 17)}</button><button class="sendbtn stop" type="button" data-stop aria-label="Interrompi" hidden>${icon('stop', 16)}</button></form>
  </div>`;
  const q = (s) => root.querySelector(s);
  mountAvatar(q('#face-a'));
  let state = 'idle', rec = null, voiceStatus = null, busy = false;
  const setState = (s, text) => { state = s; ctx.onState(s); setAvatarState(s); q('[data-mic]').classList.toggle('on', s === 'listening'); root.classList.toggle('listening', s === 'listening'); q('[data-status]').textContent = text || ({ idle: 'Scrivi o parla con me', listening: 'Ti ascolto...', transcribing: 'Sto capendo cosa hai detto...', thinking: 'Ci penso...', talking: 'Ti rispondo...' }[s]); };

  // ---------------------------------------------------------------- chat
  const log = q('[data-log]');
  function add(who, text, r) {
    const d = document.createElement('div'); d.className = 'msg ' + who + (r && r.ok === false ? ' bad' : '');
    d.innerHTML = `<div class="bub">${esc(text)}</div>` + (r && r.via === 'claude' ? '<div class="via">risposta di Claude</div>' : ''); log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  q('[data-tts]').checked = ctx.settings().assistant.tts; q('[data-tts]').onchange = (e) => { ctx.patch({ assistant: { tts: e.target.checked } }); if (!e.target.checked) speechSynthesis.cancel(); };

  function speak(text, lang) {
    if (!ctx.settings().assistant.tts || !('speechSynthesis' in window)) return Promise.resolve();
    speechSynthesis.cancel();
    let t = String(text).replace(/\s+/g, ' ').trim(); if (t.length > 320) { const cut = t.slice(0, 320), i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? ')); t = i > 80 ? cut.slice(0, i + 1) : cut; }
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(t), want = lang === 'en' ? 'en' : 'it'; u.lang = want === 'en' ? 'en-US' : 'it-IT';
      const v = speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().startsWith(want)); if (v.length) u.voice = v.find((x) => /natural|online/i.test(x.name)) || v[0];
      u.rate = 1.02; const done = () => { if (state === 'talking') setState('idle'); res(); };
      u.onstart = () => setState('talking'); u.onend = done; u.onerror = done; setTimeout(done, 25000);
      speechSynthesis.speak(u);
    });
  }

  async function ask(text, source) {
    text = String(text || '').trim(); if (!text || busy) return null;
    busy = true; add('me', text); setState('thinking'); showStop(true); live = null; const t0 = Date.now();
    let r; try { r = await api.invoke('assistant', text); } catch (e) { r = { ok: false, say: 'Errore: ' + e.message, lang: 'it' }; }
    busy = false; showStop(false); if (live) { live.remove(); live = null; } if (r.say) add('bot', r.say, r); q('[data-sub]').textContent = (Date.now() - t0) + ' ms';
    ctx.onResult(r); setState('idle'); setAvatarState(r.ok ? 'happy' : 'protect');
    if (r.hint) ctx.hint(r.hint);
    if (r.say) await speak(r.say, r.lang);
    if (r.ask && source === 'voice') listen(); // domanda di chiarimento: continua a parlare senza toccare nulla
    return r;
  }

  // avanzamento in diretta quando lavora l'agente (una vera sessione di Claude Code)
  let live = null; const showStop = (v) => { q('[data-stop]').hidden = !v; q('[data-send]').hidden = v; };
  api.on('assistant:progress', (e) => {
    if (!busy || e.kind === 'init') return;
    if (!live) { live = document.createElement('div'); live.className = 'msg bot live'; live.innerHTML = '<div class="bub"><div class="liveh">Claude sta lavorando...</div><div class="livel"></div></div>'; log.appendChild(live); }
    if (e.kind === 'tool') { const d = document.createElement('div'); d.textContent = e.name + (e.detail ? ': ' + e.detail : ''); live.querySelector('.livel').appendChild(d); }
    log.scrollTop = log.scrollHeight; q('[data-sub]').textContent = 'Claude Code · ' + live.querySelectorAll('.livel div').length + ' passaggi';
  });
  q('[data-stop]').onclick = () => api.send('assistant:stop');
  q('[data-newchat]').onclick = () => { api.send('assistant:reset'); add('bot', tr('Ho dimenticato la conversazione: ripartiamo da zero.')); };
  q('[data-form]').onsubmit = (e) => { e.preventDefault(); const i = q('[data-text]'); const t = i.value; i.value = ''; ask(t, 'text'); };
  const ex = (ctx.examples[ctx.lang] || ctx.examples.it || []).slice(); ex.sort(() => Math.random() - 0.5);
  q('[data-chips]').innerHTML = ex.slice(0, 7).map((e) => `<button class="chip" type="button">${esc(e)}</button>`).join('') + '<button class="chip" type="button">Aiuto</button>';
  q('[data-chips]').onclick = (e) => { const b = e.target.closest('.chip'); if (b) ask(b.textContent, 'text'); };
  add('bot', tr('Ciao! Scrivimi un comando oppure premi il microfono e parlami: musica, volume, timer, promemoria, VS Code, Chrome, Claude Code e molto altro.'));

  // ---------------------------------------------------------------- voce
  const banner = q('[data-banner]');
  function showBanner(html) { banner.hidden = false; banner.innerHTML = html; }
  async function ensureVoice() {
    voiceStatus = await api.invoke('voice:status'); if (voiceStatus.ready) { banner.hidden = true; return true; }
    showBanner(`<div><b>Per parlare serve il riconoscimento vocale</b><div class="sub">Funziona sul tuo PC, l'audio non viene mai inviato a nessuno. Scarico una volta sola circa ${voiceStatus.sizeMB} MB.</div></div><button class="btn sm" data-inst>Installa la voce</button>`);
    banner.querySelector('[data-inst]').onclick = install; return false;
  }
  async function install() {
    showBanner('<div style="flex:1"><b data-step>Scarico...</b><div class="bar"><i data-pct></i></div></div>');
    const r = await api.invoke('voice:install');
    if (r.ok) { banner.hidden = true; ctx.toast('Voce installata'); voiceStatus = r.status; } else showBanner(`<div><b>Installazione non riuscita</b><div class="sub">${esc(r.error)}</div></div><button class="btn sm" data-inst>Riprova</button>`), banner.querySelector('[data-inst]').onclick = install;
  }
  api.on('voice:progress', (p) => { const s = banner.querySelector('[data-step]'), b = banner.querySelector('[data-pct]'); if (s) s.textContent = p.step + ' ' + p.pct + '%'; if (b) b.style.width = p.pct + '%'; });

  async function capture() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ac = new AudioContext(), src = ac.createMediaStreamSource(stream), proc = ac.createScriptProcessor(4096, 1, 1), chunks = [];
    let floor = 0, nFloor = 0, spoke = false, lastVoice = 0, t0 = performance.now(), stopped = false, resolveFn;
    const mic = q('[data-mic]');
    const finish = (why) => { if (stopped) return; stopped = true; try { proc.disconnect(); src.disconnect(); } catch { /* gia' scollegato */ } stream.getTracks().forEach((t) => t.stop()); ac.close(); mic.style.setProperty('--lvl', 0); resolveFn({ chunks, rate: ac.sampleRate, spoke, why }); };
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; const rms = Math.sqrt(s / d.length), now = performance.now();
      mic.style.setProperty('--lvl', Math.min(1, rms * 12).toFixed(2));
      if (nFloor < 4) { floor = (floor * nFloor + rms) / (nFloor + 1); nFloor++; return; }
      const thr = Math.max(0.014, floor * 3);
      if (rms > thr) { spoke = true; lastVoice = now; }
      if (spoke && now - lastVoice > 1100 && now - t0 > 1500) finish('silence');
      else if (!spoke && now - t0 > 8000) finish('nobody');
      else if (now - t0 > 20000) finish('max');
    };
    src.connect(proc); proc.connect(ac.destination);
    return { done: new Promise((r) => { resolveFn = r; }), stop: () => finish('manual') };
  }

  async function listen() {
    if (rec) { rec.stop(); return; } // secondo clic: termina e invia
    if (state === 'thinking' || state === 'transcribing') return;
    ctx.open(); speechSynthesis.cancel();
    if (!(await ensureVoice())) return;
    try { rec = await capture(); } catch (e) {
      showBanner(`<div><b>Non riesco a usare il microfono</b><div class="sub">Controlla che Windows consenta l'accesso al microfono alle app desktop.</div></div><button class="btn sm" data-set>Apri impostazioni</button>`);
      banner.querySelector('[data-set]').onclick = () => api.send('open-settings', 'ms-settings:privacy-microphone'); return;
    }
    setState('listening'); ctx.sound('listen');
    const res = await rec.done; rec = null;
    if (!res.spoke) { setState('idle', res.why === 'nobody' ? 'Non ti ho sentito: riprova' : 'Niente da riconoscere'); return; }
    setState('transcribing');
    const wav = encodeWav(res.chunks, res.rate), lang = ctx.settings().assistant.whisperLang;
    const r = await api.invoke('voice:transcribe', wav, lang);
    if (!r.ok) { setState('idle', 'Riconoscimento non riuscito'); add('bot', tr('Non ho capito la registrazione: ') + r.error, { ok: false }); return; }
    if (!r.text) { setState('idle', 'Non ho capito, ripeti?'); return; }
    ask(r.text, 'voice');
  }
  q('[data-mic]').onclick = listen;
  return { listen, ask, speak, focus: () => q('[data-text]').focus(), stopSpeaking: () => speechSynthesis.cancel() };
}
