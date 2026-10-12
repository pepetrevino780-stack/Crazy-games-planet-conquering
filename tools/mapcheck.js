// Validates generated pixel maps and writes PNG previews.
// Usage: node tools/mapcheck.js [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PLANETS } from '../js/campaign.js';
import { generateMap, LW, LH, laneBorderSize } from '../js/art/terrain.js';

export function checkMap(planet, map) {
  const problems = [];
  const n = map.ids.length;
  map.centers.forEach((c, i) => {
    if (map.cell[c.y * LW + c.x] !== i) problems.push(`${map.ids[i]}: centre pixel not in its territory`);
  });
  // Each territory is one connected region.
  for (let i = 0; i < n; i++) {
    const total = map.area[i];
    const start = map.centers[i].y * LW + map.centers[i].x;
    if (map.cell[start] !== i) continue;
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const p = q.pop();
      const x = p % LW;
      for (const r of [x > 0 ? p - 1 : -1, x < LW - 1 ? p + 1 : -1, p - LW, p + LW]) {
        if (r >= 0 && r < LW * LH && map.cell[r] === i && !seen.has(r)) { seen.add(r); q.push(r); }
      }
    }
    if (seen.size < total * 0.97) problems.push(`${map.ids[i]}: fragmented (${seen.size}/${total})`);
  }
  for (const [a, b] of planet.lanes) {
    const s = laneBorderSize(map, a, b);
    if (s < 3) problems.push(`lane ${a}-${b}: shared border ${s}px`);
  }
  const lanes = new Set(planet.lanes.flatMap(([a, b]) => [a + '|' + b, b + '|' + a]));
  for (const key of map.laneBorder.keys()) if (!lanes.has(key)) problems.push(`${key}: touch without a lane`);
  return problems;
}

function png(w, h, rgba) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (process.argv[1] && process.argv[1].endsWith('mapcheck.js')) {
  const out = process.argv[2];
  if (out) mkdirSync(out, { recursive: true });
  let bad = 0;
  for (const p of PLANETS) {
    const t0 = Date.now();
    const map = generateMap(p);
    const problems = checkMap(p, map);
    bad += problems.length;
    console.log(p.id.padEnd(9), `${Date.now() - t0}ms`, problems.length ? problems.join('; ') : 'ok');
    if (out) {
      const img = new Uint8ClampedArray(map.rgba);
      // mark territory borders in white for inspection
      map.borders.forEach(b => b.forEach(px => { img[px * 4] = img[px * 4] / 2 + 120; img[px * 4 + 1] = img[px * 4 + 1] / 2 + 120; img[px * 4 + 2] = img[px * 4 + 2] / 2 + 120; }));
      writeFileSync(`${out}/${p.id}.png`, png(LW, LH, img));
    }
  }
  process.exit(bad ? 1 : 0);
}
