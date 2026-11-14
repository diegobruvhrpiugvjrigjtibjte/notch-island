// Scheda Claude: sessioni di Claude Code, collegamento a VS Code e Chrome, domande rapide.
import { icon } from '../shared/icons.js';
import { tr } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ago = (t) => { const s = Math.max(0, Math.floor((Date.now() - t) / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h'; };
const LABEL = { working: 'Sta lavorando', waiting: 'Ti aspetta', done: 'Ha finito', idle: 'In attesa' };

export function initClaude(root, ctx) {
  const { api } = ctx;
  let st = null, sessions = [], tabs = null, busy = false, answer = '';
  root.innerHTML = '<div class="cl" data-root></div>';
  const box = root.querySelector('[data-root]');

  const dot = (s) => `<span class="sd ${s}"></span>`;
  let dirty = false;
  function render(force) {
    if (!st) return;
    if (!force && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { dirty = true; return; } // non interrompere chi sta scrivendo
    dirty = false;
    const c = st.claude, v = st.vscode, ch = st.chrome, hooks = c.hooks || {};
    const card = (ic, title, on, sub, actions) => `<div class="conn ${on ? 'on' : ''}"><div class="ch">${icon(ic, 17)}<b>${title}</b><span class="pill ${on ? 'ok' : ''}">${on ? 'collegato' : 'non collegato'}</span></div><div class="sub">${sub}</div><div class="row">${actions}</div></div>`;
    const claudeCard = card('sparkle', 'Claude Code', hooks.installed, !c.found ? 'Claude Code non è stato trovato su questo PC.' : hooks.installed ? 'Vedo le tue sessioni in tempo reale (anche quelle nell\'estensione di VS Code).' : hooks.partial ? 'Collegamento incompleto: premi Collega per sistemarlo.' : 'Premi Collega per vedere cosa sta facendo Claude e ricevere un avviso quando ti aspetta.', c.found ? (hooks.installed ? '<button class="btn sm ghost" data-act="unhook">Scollega</button>' : '<button class="btn sm" data-act="hook">Collega</button>') : '');
    const vsInfo = v.connected && v.info ? [v.info.workspace, v.info.file, v.info.branch && ('ramo ' + v.info.branch), v.info.errors ? v.info.errors + ' errori' : ''].filter(Boolean).join(' · ') : '';
    const vsCard = card('code', 'VS Code', v.connected, v.connected ? esc(vsInfo || 'Pronto.') : v.codeFound ? 'Installa l\'estensione NotchIsland: poi VS Code si collega da solo (dopo averlo riavviato o con "Reload Window").' : 'VS Code non è stato trovato.', v.connected ? '' : (v.codeFound ? '<button class="btn sm" data-act="vsix">Installa estensione</button>' : ''));
    const chCard = card('globe', 'Chrome', ch.connected, ch.connected ? (ch.info && ch.info.tabCount ? ch.info.tabCount + ' schede aperte' + (ch.info.active ? ' · ' + esc(ch.info.active.title || '') : '') : 'Pronto.') : 'Carica l\'estensione in Chrome (Modalità sviluppatore → Carica estensione non pacchettizzata). Preparo la cartella e apro la pagina per te.', ch.connected ? '' : '<button class="btn sm" data-act="chrome">Prepara estensione</button>');
    const sess = sessions.length ? sessions.map((s) => `<div class="sess ${s.status}" data-id="${esc(s.id)}"><div class="sh">${dot(s.status)}<b>${esc(s.project)}</b><span class="sub">${LABEL[s.status] || ''} · <span data-since="${s.since}">${ago(s.since)}</span></span></div>
        <div class="sb">${s.status === 'waiting' ? esc(s.message || tr('Serve il tuo ok')) : s.status === 'working' ? esc((s.tool ? s.tool + (s.detail ? ': ' + s.detail : '') : s.prompt) || tr('Al lavoro...')) : s.status === 'done' ? esc(s.prompt || tr('Completato')) : esc(s.prompt || tr('Sessione aperta'))}</div>
        <div class="row">${v.connected ? '<button class="btn sm ghost" data-vs="claude-vscode.sidebar.open">Apri in VS Code</button>' : ''}${s.status === 'waiting' && v.connected ? '<button class="btn sm" data-vs="claude-vscode.acceptProposedDiff">Accetta modifica</button><button class="btn sm ghost" data-vs="claude-vscode.rejectProposedDiff">Rifiuta</button>' : ''}</div></div>`).join('')
      : `<div class="empty small">${hooks.installed ? 'Nessuna sessione attiva. Avvia Claude Code (nel terminale o in VS Code) e comparirà qui.' : 'Collega Claude Code per vedere qui le sessioni.'}</div>`;
    const vsQuick = v.connected ? `<div class="quick"><h4>VS Code</h4><div class="row wrapr">${[['claude-vscode.newConversation', 'Nuova conversazione'], ['claude-vscode.sidebar.open', 'Apri Claude'], ['workbench.action.files.saveAll', 'Salva tutto'], ['workbench.action.terminal.new', 'Terminale'], ['workbench.actions.view.problems', 'Problemi'], ['editor.action.formatDocument', 'Formatta']].map((x) => `<button class="chip" data-vs="${x[0]}">${x[1]}</button>`).join('')}</div></div>` : '';
    const chQuick = ch.connected ? `<div class="quick"><h4>Chrome</h4><div class="row wrapr">${[['newTab', 'Nuova scheda'], ['closeTab', 'Chiudi scheda'], ['pauseMedia', 'Pausa video'], ['playMedia', 'Riproduci video'], ['muteTabs', 'Silenzia scheda'], ['reload', 'Ricarica'], ['listTabs', 'Elenco schede']].map((x) => `<button class="chip" data-ch="${x[0]}">${x[1]}</button>`).join('')}</div>${tabs ? '<div class="tabl">' + tabs.map((t) => `<button class="tabi" data-tab="${t.id}">${esc((t.title || t.url || '').slice(0, 70))}</button>`).join('') + '</div>' : ''}</div>` : '';
    box.innerHTML = `<div class="conns">${claudeCard}${vsCard}${chCard}</div>
      <div class="cl-cols"><div class="cl-main"><h4>Sessioni di Claude Code</h4><div class="stack">${sess}</div></div>
      <div class="cl-side"><h4>Chiedi a Claude</h4><form data-ask class="asknow"><input class="inp" data-q placeholder="Una domanda veloce..." spellcheck="false" autocomplete="off"${c.found ? '' : ' disabled'}><button class="btn sm" type="submit"${c.found ? '' : ' disabled'}>${busy ? '...' : 'Chiedi'}</button></form>${answer ? `<div class="ans">${esc(answer)}</div>` : ''}${vsQuick}${chQuick}</div></div>`;
  }

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'hook') { const r = await api.invoke('claude:install'); ctx.toast(r.ok ? 'Claude Code collegato' : 'Errore: ' + r.error); refresh(); }
    else if (a === 'unhook') { const r = await api.invoke('claude:uninstall'); ctx.toast(r.ok ? 'Claude Code scollegato' : 'Errore: ' + r.error); refresh(); }
    else if (a === 'vsix') { b.textContent = 'Installo...'; const r = await api.invoke('vscode:install'); ctx.toast(r.ok ? 'Estensione installata: ricarica la finestra di VS Code' : 'Errore: ' + r.error); refresh(); }
    else if (a === 'chrome') { const r = await api.invoke('chrome:prepare'); ctx.toast(r.ok ? 'Cartella copiata negli appunti: in Chrome scegli "Carica estensione non pacchettizzata"' : 'Errore: ' + r.error); }
    else if (b.dataset.vs) { const r = await api.invoke('vscode:exec', b.dataset.vs); ctx.toast(r.ok ? 'Fatto' : 'VS Code: ' + r.error); }
    else if (b.dataset.ch) {
      const r = await api.invoke('chrome:cmd', b.dataset.ch, b.dataset.ch === 'muteTabs' ? { mute: true, all: false } : {});
      if (!r.ok) ctx.toast('Chrome: ' + r.error); else if (b.dataset.ch === 'listTabs') { tabs = r.r; render(true); } else ctx.toast('Fatto');
    } else if (b.dataset.tab) { const r = await api.invoke('chrome:cmd', 'activateTab', { id: +b.dataset.tab }); ctx.toast(r.ok ? 'Scheda attivata' : 'Chrome: ' + r.error); }
  });
  box.addEventListener('submit', async (e) => {
    e.preventDefault(); if (!e.target.matches('[data-ask]') || busy) return;
    const input = box.querySelector('[data-q]'), t = input.value.trim(); if (!t) return;
    busy = true; answer = tr('Claude sta pensando...'); render(true); const r = await api.invoke('claude:ask', t); busy = false; answer = r.ok ? r.text : tr('Errore: ') + r.error; render(true);
  });

  box.addEventListener('focusout', () => { setTimeout(() => { if (dirty) render(); }, 50); });
  async function refresh() { st = await api.invoke('integration'); sessions = (st.claude.sessions || []); render(); }
  return {
    refresh,
    setState(s) { st = s; sessions = s.claude.sessions || sessions; render(); },
    onClaude(ev) { sessions = ev.sessions; if (st) { st.claude.sessions = sessions; render(); } },
    tick() { box.querySelectorAll('[data-since]').forEach((el) => { el.textContent = ago(+el.dataset.since); }); },
  };
}
