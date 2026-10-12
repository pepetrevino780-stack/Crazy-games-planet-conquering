// Procedural pixel-art world maps.
//
// Each planet's 1000x600 map is rasterised to a 500x300 pixel grid. Every land
// pixel belongs to one territory (a noise-warped Voronoi cell). Territories
// joined by a lane share a passable border; territories that touch without a
// lane are split by impassable terrain (mountains, ice ridges, ruins), so the
// map itself shows where attacks can go. This module is pure data (no DOM),
// so the art can change without touching gameplay rules.

export const LW = 500;
export const LH = 300;
export const WS = LW / 1000; // map pixels per world unit

export const KIND = { SEA: 0, LAND: 1, BARRIER: 2 };

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pal = list => list.map(hex);

// Limited palettes per planet: sea deep→shallow, land dark→light,
// barrier dark→light, river accents, plus a decoration rule.
export const PLANET_ART = {
  vulkara: {
    sea: pal(['#2a0603', '#5c1104', '#a8300a', '#f2701a']), // lava sea
    coast: hex('#ffb02e'),
    land: pal(['#191212', '#271b18', '#38261f', '#4d3223', '#6a4129']),
    barrier: pal(['#0b0808', '#231816', '#3e2c27', '#6b5148']),
    river: pal(['#e04a12', '#ff9a24']),
    decor: 'craters',
    seaLevel: 0.92,
  },
  cryonis: {
    sea: pal(['#060f24', '#0c2147', '#173f6e', '#2f6a9a']),
    coast: hex('#cfeaff'),
    land: pal(['#5a7699', '#7d9cbe', '#a2bfdc', '#c6dbee', '#e6f2fb']),
    barrier: pal(['#1f2c48', '#3d5679', '#7393bb', '#e2efff']),
    river: pal(['#7fd3ff', '#b9ecff']),
    decor: 'snow',
    seaLevel: 0.9,
  },
  mycelion: {
    sea: pal(['#12051a', '#250a33', '#3d1650', '#5a2470']), // spore marsh
    coast: hex('#c4ff6a'),
    land: pal(['#2a1235', '#3b1c49', '#4d2759', '#365426', '#507a2c']),
    barrier: pal(['#160820', '#4a1658', '#93309a', '#ff6ad2']), // giant fungi
    river: pal(['#b8ff5a', '#ff6ad2']),
    decor: 'spores',
    seaLevel: 0.95,
  },
  xythera: {
    sea: pal(['#05050d', '#0d0d24', '#17173d', '#25255c']), // void sea
    coast: hex('#3ad8ff'),
    land: pal(['#1b1b24', '#2a2a36', '#4e2f1c', '#7a4824', '#a5693a']),
    barrier: pal(['#21150c', '#5a3c1a', '#9b6d32', '#e3b45e']), // bronze ruins
    river: pal(['#2fc6ff', '#a8f4ff']),
    decor: 'plates',
    seaLevel: 0.9,
  },
  noctyra: {
    sea: pal(['#080107', '#18030c', '#330514', '#5c0a20']), // crimson void
    coast: hex('#ff3a4a'),
    land: pal(['#120e1b', '#1d1628', '#2a1f38', '#3a2a4d', '#4d3763']),
    barrier: pal(['#040309', '#171223', '#36284d', '#7a5aa8']), // megastructures
    river: pal(['#b0102a', '#ff3a4a']),
    decor: 'pylons',
    seaLevel: 0.92,
  },
};

// ---------- Deterministic noise ----------

function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

// 4x4 ordered-dither threshold in [0,1).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const seedOf = id => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 17);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(ax + dx * k - px, ay + dy * k - py);
}

const LAND_RADIUS = { capital: 96, citadel: 100 };
const CORRIDOR = 26; // world units each side of a lane that is always land
const CORRIDOR_CORE = 12;

/**
 * Build the pixel map for a planet definition (from campaign.js).
 * Returns { cell, kind, rgba, ids, borders, centers, laneBorder, seed }.
 */
export function generateMap(planet) {
  const seed = seedOf(planet.id);
  const art = PLANET_ART[planet.id];
  const nodes = planet.nodes.map(([id, x, y, type]) => ({ id, x, y, type }));
  const n = nodes.length;
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const laneSet = new Map();
  const lanes = planet.lanes.map(([a, b, k]) => {
    const ia = idx.get(a), ib = idx.get(b);
    laneSet.set(ia * 64 + ib, k || 'normal');
    laneSet.set(ib * 64 + ia, k || 'normal');
    return { a: ia, b: ib, ax: nodes[ia].x, ay: nodes[ia].y, bx: nodes[ib].x, by: nodes[ib].y };
  });
  const N = LW * LH;
  const cell = new Int16Array(N).fill(-1);
  const kind = new Uint8Array(N);
  const dist = new Float32Array(N);

  // 1. Assign pixels to territories.
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const p = y * LW + x;
      const wx0 = (x + 0.5) / WS, wy0 = (y + 0.5) / WS;
      const wx = wx0 + (fbm(x * 0.035, y * 0.035, seed) - 0.5) * 46;
      const wy = wy0 + (fbm(x * 0.035, y * 0.035, seed + 7) - 0.5) * 46;
      let best = -1, bd = Infinity;
      const ds = new Array(n);
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(nodes[i].x - wx, nodes[i].y - wy);
        ds[i] = d;
        if (d < bd) { bd = d; best = i; }
      }
      // Lanes keep their two ends connected by a corridor of land.
      let corridor = null, cd = Infinity;
      for (const l of lanes) {
        const d = segDist(wx0, wy0, l.ax, l.ay, l.bx, l.by);
        if (d < CORRIDOR && d < cd) { cd = d; corridor = l; }
      }
      if (corridor && best !== corridor.a && best !== corridor.b) {
        // The core of a lane always belongs to its two ends.
        const pairBest = ds[corridor.a] < ds[corridor.b] ? corridor.a : corridor.b;
        if (cd < CORRIDOR_CORE || ds[pairBest] * 0.8 < bd) best = pairBest;
      }
      const r = (LAND_RADIUS[nodes[best].type] || 82) * (0.78 + 0.4 * fbm(x * 0.05, y * 0.05, seed + 3));
      if (bd < r || corridor) {
        cell[p] = best;
        kind[p] = KIND.LAND;
        dist[p] = ds[best];
      }
    }
  }

  removeFragments(cell, kind, n);

  // 2. Territories that touch without a lane are split by impassable terrain.
  const ridge = new Uint8Array(N);
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const p = y * LW + x;
      const a = cell[p];
      if (a < 0) continue;
      for (const q of [x + 1 < LW ? p + 1 : -1, y + 1 < LH ? p + LW : -1]) {
        if (q < 0) continue;
        const b = cell[q];
        if (b < 0 || b === a) continue;
        if (!laneSet.has(a * 64 + b)) { ridge[p] = 1; ridge[q] = 1; }
      }
    }
  }
  // Thicken ridges into irregular ranges, without eating near a node.
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const p = y * LW + x;
      if (!ridge[p]) continue;
      const rad = 1 + Math.floor(fbm(x * 0.09, y * 0.09, seed + 11) * 3.2);
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= LW || yy >= LH || dx * dx + dy * dy > rad * rad) continue;
          const q = yy * LW + xx;
          if (kind[q] === KIND.LAND && dist[q] > 34) kind[q] = KIND.BARRIER;
        }
      }
    }
  }
  for (let p = 0; p < N; p++) if (ridge[p] && kind[p] === KIND.LAND) kind[p] = KIND.BARRIER;
  for (let p = 0; p < N; p++) if (kind[p] === KIND.BARRIER) cell[p] = -2;

  // 3. Border pixels per territory and passable border pixels per lane.
  const borders = Array.from({ length: n }, () => []);
  const laneBorder = new Map(); // "a|b" -> pixel indices on a's side
  const sums = Array.from({ length: n }, () => ({ x: 0, y: 0, c: 0 }));
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const p = y * LW + x;
      const a = cell[p];
      if (a < 0) continue;
      sums[a].x += x; sums[a].y += y; sums[a].c++;
      let edge = x === 0 || y === 0 || x === LW - 1 || y === LH - 1;
      for (const q of [x > 0 ? p - 1 : -1, x < LW - 1 ? p + 1 : -1, p - LW, p + LW]) {
        if (q < 0 || q >= N) continue;
        const b = cell[q];
        if (b === a) continue;
        edge = true;
        if (b >= 0) {
          const key = nodes[a].id + '|' + nodes[b].id;
          if (!laneBorder.has(key)) laneBorder.set(key, []);
          laneBorder.get(key).push(p);
        }
      }
      if (edge) borders[a].push(p);
    }
  }

  // 4. Sea depth (distance to land) for shading.
  const depth = new Uint8Array(N).fill(255);
  let queue = [];
  for (let p = 0; p < N; p++) if (kind[p] !== KIND.SEA) { depth[p] = 0; queue.push(p); }
  for (let d = 1; d < 40 && queue.length; d++) {
    const next = [];
    for (const p of queue) {
      const x = p % LW;
      for (const q of [x > 0 ? p - 1 : -1, x < LW - 1 ? p + 1 : -1, p - LW, p + LW]) {
        if (q < 0 || q >= N || depth[q] !== 255) continue;
        depth[q] = d;
        next.push(q);
      }
    }
    queue = next;
  }

  // 5. Colour.
  const rgba = new Uint8ClampedArray(N * 4);
  for (let y = 0; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const p = y * LW + x;
      const c = colorAt(art, kind[p], x, y, depth[p], seed);
      rgba[p * 4] = c[0]; rgba[p * 4 + 1] = c[1]; rgba[p * 4 + 2] = c[2];
      // Dithered fade at the map's edge, so the surface floats in space.
      const e = Math.min(x, y, LW - 1 - x, LH - 1 - y);
      rgba[p * 4 + 3] = e >= 10 || bayer(x, y) < e / 10 ? 255 : 0;
    }
  }

  return {
    seed, cell, kind, rgba, depth, borders: borders.map(b => Int32Array.from(b)), laneBorder,
    ids: nodes.map(nd => nd.id),
    centers: nodes.map(nd => ({ x: Math.round(nd.x * WS), y: Math.round(nd.y * WS) })),
    area: sums.map(s => s.c),
  };
}

// Keep each territory's largest connected piece; stray fragments merge into
// whichever neighbouring territory surrounds them.
function removeFragments(cell, kind, n) {
  const N = LW * LH;
  const comp = new Int32Array(N).fill(-1);
  const best = new Array(n).fill(-1), bestSize = new Array(n).fill(0);
  let id = 0;
  const sizes = [];
  for (let p = 0; p < N; p++) {
    if (cell[p] < 0 || comp[p] >= 0) continue;
    const c = cell[p];
    const stack = [p];
    comp[p] = id;
    let size = 0;
    while (stack.length) {
      const q = stack.pop();
      size++;
      const x = q % LW;
      for (const r of [x > 0 ? q - 1 : -1, x < LW - 1 ? q + 1 : -1, q - LW, q + LW]) {
        if (r >= 0 && r < N && comp[r] < 0 && cell[r] === c) { comp[r] = id; stack.push(r); }
      }
    }
    sizes.push(size);
    if (size > bestSize[c]) { bestSize[c] = size; best[c] = id; }
    id++;
  }
  const stray = new Uint8Array(N);
  let left = 0;
  for (let p = 0; p < N; p++) if (cell[p] >= 0 && comp[p] !== best[cell[p]]) { stray[p] = 1; left++; }
  for (let pass = 0; pass < 64 && left; pass++) {
    for (let p = 0; p < N; p++) {
      if (!stray[p]) continue;
      const x = p % LW;
      for (const r of [x > 0 ? p - 1 : -1, x < LW - 1 ? p + 1 : -1, p - LW, p + LW]) {
        if (r >= 0 && r < N && cell[r] >= 0 && !stray[r] && cell[r] !== cell[p]) {
          cell[p] = cell[r]; stray[p] = 0; left--; break;
        }
      }
    }
  }
  for (let p = 0; p < N; p++) if (stray[p]) { cell[p] = -1; kind[p] = KIND.SEA; }
}

function pick(list, v, x, y) {
  const t = Math.max(0, Math.min(list.length - 1, Math.floor(v * list.length + (bayer(x, y) - 0.5) * 0.9)));
  return list[t];
}

function colorAt(art, k, x, y, depth, seed) {
  if (k === KIND.SEA) {
    if (depth === 1) return bayer(x, y) < 0.5 ? art.coast : art.sea[3];
    const wave = fbm(x * 0.08 + y * 0.02, y * 0.16, seed + 21);
    const d = Math.min(1, depth / 22);
    let c = pick(art.sea, (1 - d) * art.seaLevel * 0.85 + wave * 0.18, x, y);
    if (wave > 0.72 && (x + y) % 3 === 0) c = art.sea[Math.min(3, art.sea.indexOf(c) + 1)];
    return c;
  }
  if (k === KIND.BARRIER) {
    const h = fbm(x * 0.12, y * 0.12, seed + 31);
    const lit = fbm((x - 1) * 0.12, (y - 1) * 0.12, seed + 31) - h;
    let v = 0.45 + h * 0.35 - lit * 9;
    if (h > 0.68 && bayer(x, y) < 0.6) v = 0.99; // peaks catch the light
    return pick(art.barrier, v, x, y);
  }
  const h = fbm(x * 0.045, y * 0.045, seed + 41);
  let c = pick(art.land, h, x, y);
  // Sparse, long rivers: a thin noise contour, only inside a second mask.
  const river = Math.abs(fbm(x * 0.014, y * 0.014, seed + 51, 3) - 0.5);
  if (river < 0.008 && fbm(x * 0.01, y * 0.01, seed + 57, 2) > 0.5) return river < 0.004 ? art.river[1] : art.river[0];
  const r = hash2(x, y, seed + 61);
  switch (art.decor) {
    case 'craters':
      if (fbm(x * 0.2, y * 0.2, seed + 71) > 0.78) c = art.land[0];
      if (r < 0.006) c = art.river[0];
      break;
    case 'snow':
      if (r < 0.05) c = art.land[4];
      if (fbm(x * 0.07, y * 0.07, seed + 71) > 0.74) c = hex('#a487e8'); // crystal fields
      break;
    case 'spores':
      if (r < 0.012) c = r < 0.006 ? art.river[0] : art.river[1];
      break;
    case 'plates':
      if (h < 0.45 && (x % 7 === 0 || y % 7 === 0)) c = art.land[0];
      if (h < 0.45 && r < 0.01) c = art.river[0];
      break;
    case 'pylons':
      if (r < 0.004) c = art.barrier[3];
      if (fbm(x * 0.06, y * 0.06, seed + 71) > 0.76 && bayer(x, y) < 0.5) c = hex('#4a2050');
      break;
    default:
  }
  return c;
}

// Pixel map → lane check used by tests: every lane is a shared passable border.
export function laneBorderSize(map, a, b) {
  return (map.laneBorder.get(a + '|' + b) || []).length;
}
