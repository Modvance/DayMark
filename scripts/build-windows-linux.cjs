'use strict';
// Unsigned Linux cross-build. Uses electron-builder's own NSIS uninstaller
// extraction (also used by its macOS build), without executing Windows tools.
// For Authenticode signing, build on Windows with npm run dist:win instead.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const PE = require('pe-library');
const R = require('resedit');
const { build, Platform, Arch } = require('electron-builder');
const wine = require('app-builder-lib/out/wine');
const { UninstallerReader } = require('app-builder-lib/out/targets/nsis/nsisUtil');
const pkg = require('../package.json');
const root = path.resolve(__dirname, '..');
assert.equal(process.platform, 'linux', 'Linux-only cross-build; use dist:win on Windows');
assert.equal(require('app-builder-lib/package.json').version, '26.0.12', 'review the extraction adapter before upgrading electron-builder');
if (process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_NAME) throw Error('Use the native Windows build to sign a release.');
const installer = path.join(root, 'dist', `Daymark-Setup-${pkg.version}-x64.exe`);
const uninstaller = path.join(root, 'dist', '__uninstaller-nsis-daymark-desktop.exe');
wine.execWine = async (file, file64, args = []) => {
  assert.equal(path.resolve(file), installer, 'unexpected request to execute a Windows tool');
  assert.equal(file64, null);
  assert.equal(args.length, 0);
  await UninstallerReader.exec(file, uninstaller);
  console.log('  • extracted standard NSIS uninstaller without executing Windows code');
};
async function editResources(context) {
  const file = path.join(context.appOutDir, 'Daymark.exe');
  const exe = PE.NtExecutable.from(fs.readFileSync(file));
  const res = PE.NtExecutableResource.from(exe);
  const integrity = res.entries.filter(e => e.type === 'INTEGRITY').map(e => Buffer.from(e.bin).toString('hex'));
  assert(integrity.length, 'Electron asar integrity resource missing');
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(root, 'src', 'icon.ico')));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  for (const group of groups) R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, ico.icons.map(i => i.data));
  const numbers = pkg.version.split('.').map(Number);
  for (const vi of R.Resource.VersionInfo.fromEntries(res.entries)) {
    for (const language of vi.getAllLanguagesForStringValues()) {
      vi.setFileVersion(...numbers, 0, language.lang);
      vi.setProductVersion(...numbers, 0, language.lang);
      vi.setStringValues(language, { CompanyName: 'Daymark', FileDescription: pkg.description, InternalName: 'Daymark', OriginalFilename: 'Daymark.exe', ProductName: 'Daymark', ProductVersion: pkg.version, FileVersion: pkg.version, LegalCopyright: 'Copyright © 2026 Daymark' });
    }
    vi.outputToResourceEntries(res.entries);
  }
  // Keep Electron's execution-level/DPI/compatibility manifest intact.
  const manifest = res.entries.find(e => e.type === 24 && e.id === 1);
  assert(Buffer.from(manifest.bin).toString().includes('asInvoker'), 'application must run without elevation');
  res.outputResource(exe);
  const generated = Buffer.from(exe.generate());
  const check = PE.NtExecutableResource.from(PE.NtExecutable.from(generated));
  assert.deepEqual(check.entries.filter(e => e.type === 'INTEGRITY').map(e => Buffer.from(e.bin).toString('hex')), integrity);
  fs.writeFileSync(file + '.tmp', generated);
  fs.renameSync(file + '.tmp', file);
}
build({ projectDir: root, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never', config: { afterPack: editResources, win: { signAndEditExecutable: false } } }).catch(error => { console.error(error); process.exitCode = 1; });
