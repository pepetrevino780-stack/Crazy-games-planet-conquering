// Builds the upload package for CrazyGames (or any HTML5 portal):
//   dist/game/                 the playable files, index.html at the root
//   dist/planetfall-conquest.zip      the same files zipped for upload
// Only modules reachable from js/main.js are shipped.
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist', 'game');
const ZIP = join(ROOT, 'dist', 'planetfall-conquest.zip');

function moduleGraph(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(join(ROOT, file), 'utf8');
    for (const m of src.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]/g)) {
      visit(posix.normalize(posix.join(posix.dirname(file), m[1])));
    }
  };
  visit(entry);
  return [...seen];
}

const files = [
  'index.html', 'css/style.css', ...moduleGraph('js/main.js'),
  'assets/fonts/PixelifySans.woff2', 'assets/fonts/Silkscreen-400.woff2', 'assets/fonts/Silkscreen-700.woff2', 'assets/fonts/README.md',
];
rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
for (const f of files) {
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  writeFileSync(join(OUT, f), readFileSync(join(ROOT, f)));
}

// Minimal ZIP writer (deflate), so the build needs no dependencies.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (~c) >>> 0; };
const local = [], central = [];
let offset = 0;
for (const f of files) {
  const data = readFileSync(join(OUT, f));
  const comp = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(f);
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  local.push(head, name, comp);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += head.length + name.length + comp.length;
}
const cenSize = central.reduce((s, b) => s + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
writeFileSync(ZIP, Buffer.concat([...local, ...central, end]));

const total = files.reduce((s, f) => s + statSync(join(OUT, f)).size, 0);
console.log(`${files.length} files, ${(total / 1024).toFixed(0)} KB unpacked, zip ${(statSync(ZIP).size / 1024).toFixed(0)} KB`);
console.log(files.map(f => '  ' + f).join('\n'));
