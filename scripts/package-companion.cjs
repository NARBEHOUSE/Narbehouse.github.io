// Prepare the production Companion ZIP locally using only Node built-ins.
// This is the extension-only equivalent of package-release.py, not a site build.
// --check validates sources and the generated ZIP in memory without writing.
// --revision=player-frame keeps the manifest version while producing separate,
// immutable revision artifacts; the original version's package stays untouched.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extension');
const args = process.argv.slice(2), checkOnly = args.includes('--check');
const revisionArgs = args.filter(arg => arg.startsWith('--revision='));
if (args.some(arg => arg !== '--check' && !arg.startsWith('--revision=')) || revisionArgs.length > 1) {
  throw Error('Usage: node scripts/package-companion.cjs [--check] [--revision=player-frame]');
}
const revision = revisionArgs[0]?.slice('--revision='.length) || '';
if (revisionArgs.length && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(revision) || revision.length > 48)) {
  throw Error('Revision must be a short lowercase label containing only letters, numbers and single hyphens');
}
const runtime = [
  'background.mjs', 'calendar.mjs', 'journal-store.mjs', 'app-data-store.mjs', 'hub-content.js', 'options.html', 'options.css', 'options.mjs',
  'player-adapters.js', 'player-platform.js', 'shared/data-backup.js', 'shared/choice-scan.js', 'shared/voice-manager.js',
  'shared/scan-status-badge.js', 'shared/scan-status-badge.css', 'shared/scan-status-badge-style.js',
  'player-content.js', 'player-loading.html', 'player-registration.mjs', 'player-view.js', 'policy.mjs'
];
function safePath(file) {
  const absolute = path.resolve(file), relative = path.relative(root, absolute);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error('Path outside package workspace');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let info;
    try { info = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (info.isSymbolicLink()) throw Error('Symlink in package path: ' + path.relative(root, current));
  }
  return absolute;
}
function read(file) {
  safePath(file);
  if (!fs.lstatSync(file).isFile()) throw Error('Expected a regular package file: ' + path.relative(root, file));
  return fs.readFileSync(file);
}
function walk(directory) {
  safePath(directory);
  if (!fs.existsSync(directory)) return [];
  if (!fs.lstatSync(directory).isDirectory()) throw Error('Expected a package directory: ' + path.relative(root, directory));
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = safePath(path.join(directory, entry.name));
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function replaceOne(files, name, expression, replacement) {
  let count = 0;
  const text = files.get(name).toString('utf8').replace(expression, () => { count++; return replacement; });
  assert.equal(count, 1, 'Production transform must match once: ' + name);
  files.set(name, Buffer.from(text));
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function archive(files) {
  const local = [], central = [];
  let offset = 0;
  assert.ok(files.size < 65535, 'ZIP64 is not needed for this extension');
  for (const name of [...files.keys()].sort()) {
    assert.match(name, /^[a-zA-Z0-9_./-]+$/, 'Package paths must be plain relative names');
    assert.ok(!name.startsWith('/') && !name.split('/').includes('..'));
    const bytes = files.get(name), packed = zlib.deflateRawSync(bytes, { level: 9 });
    assert.ok(bytes.length < 0xffffffff && packed.length < 0xffffffff && offset < 0xffffffff);
    const nameBytes = Buffer.from(name), crc = crc32(bytes), dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, packed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10); directory.writeUInt16LE(dosDate, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(nameBytes.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBytes);
    offset += header.length + nameBytes.length + packed.length;
  }
  const directoryBytes = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(directoryBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directoryBytes, end]);
}
function verifyArchive(zip, files) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), files.size);
  let directory = zip.readUInt32LE(end + 16);
  const seen = new Set();
  for (let index = 0; index < files.size; index++) {
    assert.equal(zip.readUInt32LE(directory), 0x02014b50);
    const packedLength = zip.readUInt32LE(directory + 20), size = zip.readUInt32LE(directory + 24);
    const nameLength = zip.readUInt16LE(directory + 28), extraLength = zip.readUInt16LE(directory + 30), commentLength = zip.readUInt16LE(directory + 32);
    const name = zip.subarray(directory + 46, directory + 46 + nameLength).toString('utf8');
    assert.ok(files.has(name) && !seen.has(name), 'Unexpected or duplicate ZIP member: ' + name);
    seen.add(name);
    const at = zip.readUInt32LE(directory + 42);
    assert.equal(zip.readUInt32LE(at), 0x04034b50);
    assert.equal(zip.readUInt16LE(at + 8), 8);
    const dataAt = at + 30 + zip.readUInt16LE(at + 26) + zip.readUInt16LE(at + 28);
    const data = zlib.inflateRawSync(zip.subarray(dataAt, dataAt + packedLength));
    assert.equal(data.length, size);
    assert.equal(crc32(data), zip.readUInt32LE(directory + 16));
    assert.ok(data.equals(files.get(name)), 'ZIP member differs from package: ' + name);
    directory += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(directory, end);
}
try {
  execFileSync(process.execPath, [path.join(root, 'scripts/sync-companion-shared.cjs'), '--check'], { cwd: root, windowsHide: true, stdio: 'inherit' });
  const manifest = JSON.parse(read(path.join(source, 'manifest.json')));
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/, 'Expected a Chrome-compatible version');
  assert.equal(manifest.content_scripts.length, 1, 'Review production matching if another content script is added');
  for (const entry of fs.readdirSync(safePath(path.join(source, 'vendor')), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Symlink in vendor assets');
    if (entry.isFile()) runtime.push('vendor/' + entry.name);
  }
  runtime.push(...[16, 32, 48, 128].map(size => 'icons/icon' + size + '.png'));
  const files = new Map(runtime.map(name => [name, read(path.join(source, name))]));
  files.set('LICENSE', read(path.join(root, 'LICENSE')));
  manifest.content_scripts[0].matches = ['https://narbehouse.github.io/bennyshub/*'];
  delete manifest.content_scripts[0].exclude_matches;
  manifest.optional_host_permissions = manifest.optional_host_permissions.filter(origin => origin.startsWith('https://'));
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  replaceOne(files, 'policy.mjs', /export const DEVELOPMENT = true;/g, 'export const DEVELOPMENT = false;');
  replaceOne(files, 'policy.mjs', /export const HUB_ORIGINS = \[[\s\S]*?\];/g, "export const HUB_ORIGINS = ['https://narbehouse.github.io'];");
  replaceOne(files, 'hub-content.js', /const origins=\[[\s\S]*?\];/g, "const origins=['https://narbehouse.github.io'];");
  replaceOne(files, 'options.html', /  <details class="advanced" data-development-only>[\s\S]*?<\/details>/g, '');
  replaceOne(files, 'options.mjs', /if\(\$\('fixture'\)\)[\s\S]*?Local video test enabled\.';\}\);/g, '');
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://narbehouse.github.io/bennyshub/*']);
  assert.ok(manifest.optional_host_permissions.every(origin => origin.startsWith('https://')));
  assert.ok(!JSON.stringify(manifest).match(/localhost|127\.0\.0\.1|http:\/\//));
  assert.match(files.get('policy.mjs').toString(), /export const DEVELOPMENT = false;/);
  assert.ok(!files.get('options.html').toString().includes('data-development-only'));
  assert.ok(!files.get('options.mjs').toString().includes('Local video test enabled.'));
  const artifactVersion = manifest.version + (revision ? '-' + revision : '');
  const out = safePath(path.join(root, 'releases', artifactVersion));
  const unpacked = safePath(path.join(out, 'extension'));
  for (const existing of walk(unpacked)) assert.ok(files.has(path.relative(unpacked, existing).split(path.sep).join('/')), 'Unexpected existing package file: ' + existing);
  const zip = archive(files); verifyArchive(zip, files);
  const name = 'bennys-hub-companion-' + artifactVersion + '.zip';
  const sha256 = crypto.createHash('sha256').update(zip).digest('hex');
  const destinations = new Map([...files].map(([name, bytes]) => [safePath(path.join(unpacked, name)), bytes]));
  const zipPath = safePath(path.join(out, name)), downloadPath = safePath(path.join(root, 'bennyshub', 'downloads', name));
  destinations.set(zipPath, zip); destinations.set(downloadPath, zip);
  destinations.set(safePath(path.join(out, 'SHA256SUMS.txt')), Buffer.from(sha256 + '  ' + name + '\n'));
  // Validate every destination before any write. Never replace a differing release.
  for (const [file, expected] of destinations) {
    if (fs.existsSync(file) && !read(file).equals(expected)) throw Error('Existing artifact differs; preserve it before preparing a new candidate: ' + path.relative(root, file));
  }
  if (!checkOnly) {
    for (const [file, bytes] of destinations) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
    for (const [file, expected] of destinations) assert.ok(read(file).equals(expected), 'Written artifact differs: ' + file);
    assert.ok(read(zipPath).equals(read(downloadPath)), 'ZIP and local website download must be identical');
    verifyArchive(read(zipPath), files);
  }
  console.log(JSON.stringify({ mode: checkOnly ? 'validated without writing' : 'local candidate prepared', version: manifest.version, revision: revision || null, files: files.size, bytes: zip.length, sha256, zip: zipPath, unpacked, published: false }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
