// Prova reale dello skip: manda "next" alla sessione multimediale di Windows e controlla che il brano cambi. (Cambia davvero brano!)
const { Agent } = require('../src/agents');
(async () => {
  const info = new Agent('info.ps1'); const a = await info.send('now', '', 20000);
  if (!a.title) { console.log('SKIP: nessun brano in riproduzione'); info.stop(); return process.exit(0); }
  console.log('prima :', a.title, '| posizione', a.pos, '| canNext', a.canNext, '| app', a.app);
  const r = await info.send('media', 'next', 20000); await new Promise((x) => setTimeout(x, 1800));
  const b = await info.send('now', '', 20000);
  console.log('media next ->', JSON.stringify(r)); console.log('dopo  :', b.title, '| posizione', b.pos);
  const changed = b.title !== a.title || (b.pos < a.pos);
  console.log(changed ? 'SKIP: OK (il brano e\' cambiato)' : 'SKIP: nessun cambiamento visibile'); info.stop(); setTimeout(() => process.exit(changed ? 0 : 1), 600);
})();
