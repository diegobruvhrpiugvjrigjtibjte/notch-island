// Prepara public/: copia l'interfaccia vera dell'isola (per la demo che gira nel sito), gli screenshot e i dati della release.
// Uso: node build.js [percorso-installer.exe]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = path.resolve(__dirname, '..'); const pub = path.join(__dirname, 'public'); const demo = path.join(pub, 'demo');
const cp = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
fs.rmSync(demo, { recursive: true, force: true });
for (const f of ['island.js', 'face.js', 'widgets.js', 'assistant.js', 'claudeui.js', 'settings.js', 'i18n.js', 'avatar.js', 'avatar.css', 'island.css']) cp(path.join(app, 'src', 'island', f), path.join(demo, 'island', f));
for (const f of ['base.css', 'icons.js']) cp(path.join(app, 'src', 'shared', f), path.join(demo, 'shared', f));
for (const f of ['core.js', 'en.js']) cp(path.join(app, 'src', 'i18n', f), path.join(demo, 'i18n', f));
// brain.js e calc.js sono CommonJS: li trasformo in moduli ES (niente eval, cosi' funzionano con la CSP)
for (const f of ['brain.js', 'calc.js']) { const code = fs.readFileSync(path.join(app, 'src', f), 'utf8'); fs.mkdirSync(demo, { recursive: true }); fs.writeFileSync(path.join(demo, f), `const module = { exports: {} }; (function (module, exports) {\n${code}\n})(module, module.exports);\nexport default module.exports;\n`); }
// pagina della demo: stessa pagina dell'app, con il finto sistema al posto del processo principale
let html = fs.readFileSync(path.join(app, 'src', 'island', 'index.html'), 'utf8').replace('<script type="module" src="island.js"></script>', '<script type="module" src="shim.js"></script>').replace("connect-src https:;", "connect-src https:; ").replace(/<title>.*?<\/title>/, '<title>NotchIsland demo</title>');
fs.writeFileSync(path.join(demo, 'island', 'index.html'), html); cp(path.join(__dirname, 'src', 'shim.js'), path.join(demo, 'island', 'shim.js'));
// il CSS delle faccine (per la sezione "la faccina" del sito)
const css = fs.readFileSync(path.join(app, 'src', 'island', 'island.css'), 'utf8'); const a = css.indexOf('/* --- faccina --- */'), b = css.indexOf('/* musica */');
fs.writeFileSync(path.join(pub, 'face.css'), css.slice(a, b));
// screenshot
fs.mkdirSync(path.join(pub, 'img'), { recursive: true });
for (const f of fs.readdirSync(path.join(app, 'docs', 'screenshots'))) if (f.endsWith('.png')) cp(path.join(app, 'docs', 'screenshots', f), path.join(pub, 'img', f));
cp(path.join(app, 'build', 'icon.png'), path.join(pub, 'img', 'icon.png'));
// release
const exe = process.argv[2]; if (exe && fs.existsSync(exe)) {
  const buf = fs.readFileSync(exe); const v = require(path.join(app, 'package.json')).version;
  const rel = { version: v, file: path.basename(exe), size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(path.join(pub, 'release.json'), JSON.stringify(rel, null, 2)); console.log('release', rel);
}
console.log('public/ pronto');
