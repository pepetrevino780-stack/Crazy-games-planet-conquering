// Writes PNG previews of generated worlds. Usage: node tools/worldpreview.js <outDir> [seed]
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateWorld } from '../js/world/generate.js';
import { paintWorld } from '../js/world/paint.js';
import { THEME_IDS } from '../js/world/themes.js';

export function png(w, h, rgba) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1]?.endsWith('worldpreview.js')) {
  const out = process.argv[2] || 'preview';
  const seed = Number(process.argv[3] || 1234);
  mkdirSync(out, { recursive: true });
  for (const theme of THEME_IDS) {
    const t0 = Date.now();
    const world = generateWorld({ theme, seed });
    const ms = Date.now() - t0;
    const rgba = paintWorld(world);
    writeFileSync(`${out}/${theme}.png`, png(world.w, world.h, rgba));
    const big = world.compSize.slice().sort((a, b) => b - a);
    console.log(theme.padEnd(9), `${ms}ms land ${world.landCount} components ${big.length} largest ${big.slice(0, 4).join(',')}`);
  }
}
