'use strict';
// Verify the packaged payload, not just the build configuration.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const PE = require('pe-library');
const R = require('resedit');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const dist = path.join(root, 'dist');
const unpacked = path.join(dist, 'win-unpacked');
const archive = path.join(unpacked, 'resources', 'app.asar');
const installer = `Daymark-Setup-${pkg.version}-x64.exe`;
function verifyPE(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(64); fs.readSync(fd, header, 0, 64, 0);
    assert.equal(header.toString('ascii', 0, 2), 'MZ', `${file}: missing DOS header`);
    const pe = Buffer.alloc(26); fs.readSync(fd, pe, 0, pe.length, header.readUInt32LE(60));
    assert.equal(pe.readUInt32LE(0), 0x4550, `${file}: missing PE header`);
    return pe.readUInt16LE(4);
  } finally { fs.closeSync(fd); }
}
assert.equal(verifyPE(path.join(unpacked, 'Daymark.exe')), 0x8664, 'application must be Windows x64');
assert([0x14c, 0x8664].includes(verifyPE(path.join(dist, installer))), 'installer must be a Windows executable');
const built = JSON.parse(asar.extractFile(archive, 'package.json'));
assert.equal(built.version, pkg.version);
assert.equal(built.productName, 'Daymark');
assert.equal(built.name, 'daymark-desktop', 'preserve the established app/data identity');
const resources = PE.NtExecutableResource.from(PE.NtExecutable.from(fs.readFileSync(path.join(unpacked,'Daymark.exe'))));
const version = R.Resource.VersionInfo.fromEntries(resources.entries)[0];
assert.equal(version.getStringValues({lang:1033,codepage:1200}).ProductVersion, pkg.version);
assert.equal(version.getStringValues({lang:1033,codepage:1200}).ProductName, 'Daymark');
assert.equal(R.Resource.IconGroupEntry.fromEntries(resources.entries)[0].icons.length, 7);
assert(Buffer.from(resources.entries.find(e=>e.type===24&&e.id===1).bin).toString().includes('asInvoker'));
const integrity = JSON.parse(Buffer.from(resources.entries.find(e=>e.type==='INTEGRITY').bin).toString());
const headerHash = crypto.createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex');
assert.equal(integrity.find(e=>e.file==='resources\\app.asar').value, headerHash, 'Electron integrity hash must match the final payload');
for (const name of ['main.cjs','preload.cjs','model.cjs','domain.js','panel-bounds.cjs','windows-panel.cjs','ui.js','goals.js','renderer.js','panel.js','index.html','panel.html','style.css','panel.css','icon.png','icon.ico']) {
  assert.deepEqual(asar.extractFile(archive, `src/${name}`), fs.readFileSync(path.join(root, 'src', name)), `packaged ${name} differs from source`);
}
for (const name of ['desktop-panel.ps1', 'DesktopPanel.cs']) {
  assert.deepEqual(fs.readFileSync(path.join(unpacked,'resources','app.asar.unpacked','src','native',name)),fs.readFileSync(path.join(root,'src','native',name)),`${name} must be available outside asar`);
}
assert(fs.existsSync(path.join(unpacked,'LICENSE.electron.txt')), 'Electron license required');
assert(fs.existsSync(path.join(unpacked,'LICENSES.chromium.html')), 'Chromium third-party notices required');
const paths = asar.listPackage(archive);
assert(!paths.some(p => /[\\/](test|node_modules|dist)[\\/]/.test(p)), 'development files leaked into runtime');
for (const entry of ['resources/app.asar','resources/app.asar.unpacked/src/native/DesktopPanel.cs','resources/app.asar.unpacked/src/native/desktop-panel.ps1']) {
  const extracted = spawnSync(require('7zip-bin').path7za, ['e','-so',path.join(dist,installer),entry], {maxBuffer: 4 * 1024 * 1024});
  if (extracted.error) throw extracted.error;
  assert.equal(extracted.status,0,`cannot extract ${entry} from installer: ${extracted.stderr}`);
  assert.deepEqual(extracted.stdout,fs.readFileSync(path.join(unpacked,...entry.split('/'))),`installer contains a different ${entry}`);
}
const file = path.join(dist, installer);
const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(dist,'SHA256SUMS.txt'), `${hash}  ${installer}\n`);
console.log(JSON.stringify({ version: pkg.version, installer, bytes: fs.statSync(file).size, sha256: hash, payload: 'verified', nativeHelpers: 'unpacked and verified' }, null, 2));
