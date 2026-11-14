// Costruisce l'installer personalizzato: 1) il pacchetto vero (electron-builder, NSIS silenzioso), 2) l'involucro con l'interfaccia su misura (C#).
// Uso: npm run build:installer      (richiede Windows: usa il compilatore C# di .NET Framework, gia' presente nel sistema)
const { execSync } = require('child_process'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); const pkg = require(path.join(root, 'package.json')); const v = pkg.version;
const run = (c) => execSync(c, { cwd: root, stdio: 'inherit', env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
const dirSize = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirSize(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);

if (!process.argv.includes('--skip-engine')) run('npx electron-builder --win');
const engine = path.join(root, 'dist', `NotchIsland-Engine-${v}.exe`); if (!fs.existsSync(engine)) throw new Error('manca ' + engine);
const expected = dirSize(path.join(root, 'dist', 'win-unpacked'));
const src = fs.readFileSync(path.join(__dirname, 'Setup.cs'), 'utf8').replace('EXPECTED_BYTES', String(expected) + 'L');
const tmp = path.join(root, 'dist', '_setup'); fs.mkdirSync(tmp, { recursive: true }); fs.writeFileSync(path.join(tmp, 'Setup.cs'), src);
const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const out = path.join(root, 'dist', `NotchIsland-Setup-${v}.exe`);
const cmd = `"${csc}" /nologo /target:winexe /optimize+ /out:"${out}" /win32icon:"${path.join(root, 'build', 'icon.ico')}" /win32manifest:"${path.join(__dirname, 'app.manifest')}" ` +
  `/r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /resource:"${engine}",engine /resource:"${path.join(root, 'build', 'icon.ico')}",icon "${path.join(tmp, 'Setup.cs')}"`;
execSync(cmd, { stdio: 'inherit' }); fs.rmSync(tmp, { recursive: true, force: true });
console.log('Creato', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB (dimensione installata ~' + (expected / 1048576).toFixed(0) + ' MB)');
