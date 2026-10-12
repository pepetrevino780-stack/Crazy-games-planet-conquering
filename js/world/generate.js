// Seeded procedural world generation.
//
// Produces a tile map with coherent geography: continents and islands from
// blended landmass blobs plus noise, mountain ranges along ridged noise with
// passes, rivers that flow downhill to the sea, clustered volcanoes, inland
// lakes, biomes and ruins. The same (theme, seed, size) always gives the
// same world, so only the seed needs saving.
import { fbm, ridged, rng } from './noise.js';
import { T, THEMES, isLand } from './themes.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function generateWorld(opts) {
  // Earth-like worlds need several real continents: retry a few derived
  // seeds (deterministically) when one comes out as a single blob.
  let world = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    world = buildWorld(opts, attempt);
    if (world.continents.length >= 3) break;
  }
  return world;
}

function buildWorld({ theme, seed, width = 420, height = 260, gen: overrides = {} }, attempt) {
  const th = THEMES[theme];
  if (!th) throw new Error(`Unknown theme ${theme}`);
  const g = { ...th.gen, ...overrides };
  const W = width, H = height, N = W * H;
  const R = rng(seed + attempt * 7919);
  const s = (seed + attempt * 7919) | 0;
  const scale = Math.min(W, H);
  const lin = scale / 220; // feature counts grow with the map

  // 1. Landmass blobs. Continent 0 is the big main continent, stretched west
  // to east across the middle; the others are smaller and spread out into the
  // remaining ocean. Islands are single small blobs. Each continent is a chain
  // of overlapping blobs, so it comes out long and irregular rather than round.
  const blobs = [];
  const centres = [];
  for (let c = 0; c < g.continents; c++) {
    const main = c === 0;
    let best = null, bestD = -1;
    if (main) best = { x: W * (0.2 + 0.06 * R()), y: H * (0.42 + 0.16 * R()) };
    else {
      for (let k = 0; k < 40; k++) {
        const p = { x: W * (0.12 + 0.76 * R()), y: H * (0.14 + 0.72 * R()) };
        // Stay clear of the main continent's spine and of other continents.
        const d = Math.min(...centres.map(b => Math.hypot(b.x - p.x, (b.y - p.y) * 1.4)), Math.abs(p.y - H / 2) * 1.6 + (p.x > W * 0.15 && p.x < W * 0.85 ? 0 : scale));
        if (d > bestD) { bestD = d; best = p; }
      }
    }
    let { x, y } = best;
    let ang = main ? (R() - 0.5) * 0.5 : R() * Math.PI * 2;
    const links = main ? 5 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
    const base = scale * (main ? 0.125 : 0.095 + 0.035 * R());
    for (let l = 0; l < links; l++) {
      blobs.push({ x, y, r: base * (0.6 + 0.45 * R()), w: 1, chain: c });
      centres.push({ x, y });
      ang += (R() - 0.5) * (main ? 0.7 : 1.6);
      if (main) ang = Math.max(-0.5, Math.min(0.5, ang));
      // The main continent spans the map from about 0.2W to 0.78W, so both
      // the player (west) and the main enemy (east) start on it.
      const stepX = main ? (W * 0.56) / (links - 1) : Math.cos(ang) * base * 0.75;
      x = Math.max(W * 0.1, Math.min(W * 0.9, x + stepX));
      y = Math.max(H * 0.12, Math.min(H * 0.88, y + Math.sin(ang) * base * (main ? 0.6 : 0.75)));
    }
  }
  for (let i = 0; i < g.islands; i++) {
    blobs.push({ x: W * (0.06 + 0.88 * R()), y: H * (0.08 + 0.84 * R()), r: scale * (0.018 + 0.03 * R()), w: 0.8, chain: g.continents + i });
  }

  for (const b of blobs) b.inv2 = 1 / (b.r * b.r);
  const h = new Float32Array(N);
  const chains = g.continents + g.islands;
  const mass = new Float32Array(chains);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Two layers of domain warp: a big low-frequency bend for the overall
      // shape of each continent and a finer one for bays and peninsulas.
      const lo = 2.2 / scale, hi = 6 / scale;
      const wx = x + (fbm(x * lo, y * lo, s + 21, 2) - 0.5) * scale * 0.5 + (fbm(x * hi, y * hi, s + 1, 3) - 0.5) * scale * 0.22;
      const wy = y + (fbm(x * lo, y * lo, s + 22, 2) - 0.5) * scale * 0.5 + (fbm(x * hi, y * hi, s + 2, 3) - 0.5) * scale * 0.22;
      mass.fill(0);
      for (const b of blobs) {
        const dx = wx - b.x, dy = wy - b.y;
        const d2 = (dx * dx + dy * dy) * b.inv2;
        if (d2 > 6) continue; // contributes almost nothing
        const m = b.w * Math.exp(-d2 * 1.6);
        if (m > mass[b.chain]) mass[b.chain] = m;
      }
      let m1 = 0, m2 = 0;
      for (let c = 0; c < chains; c++) { const m = mass[c]; if (m > m1) { m2 = m1; m1 = m; } else if (m > m2) m2 = m; }
      // Where two continents meet, carve a strait so they stay separate.
      const strait = m2 > 0.12 && m1 - m2 < 0.22 ? 0.6 * (1 - (m1 - m2) / 0.22) : 0;
      const detail = fbm(x * 0.028, y * 0.028, s + 3, 5);
      const ex = Math.min(x, W - 1 - x) / (W * 0.08), ey = Math.min(y, H - 1 - y) / (H * 0.08);
      const edge = Math.min(1, ex, ey);
      h[y * W + x] = (m1 * 0.75 + (detail - 0.5) * 0.45 - strait) * (0.2 + 0.8 * edge * edge * (3 - 2 * edge));
    }
  }
  // Sea level by quantile so each theme gets its intended land share.
  const sorted = Float32Array.from(h).sort();
  const sea = sorted[Math.floor(N * (1 - g.land))];
  const top = sorted[N - 1];

  const t = new Uint8Array(N);
  const elev = new Float32Array(N); // 0 at the coast, 1 at the highest point
  for (let i = 0; i < N; i++) {
    if (h[i] < sea) { t[i] = T.DEEP; continue; }
    elev[i] = (h[i] - sea) / (top - sea);
    t[i] = T.PLAINS;
  }

  // 2. Mountain ranges: thin warped ridge lines with foothills, broken by
  // passes where a second mask is low.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (t[i] === T.DEEP) continue;
      const wx = x + (fbm(x * 0.02, y * 0.02, s + 9, 2) - 0.5) * 40;
      const wy = y + (fbm(x * 0.02, y * 0.02, s + 10, 2) - 0.5) * 40;
      const r = ridged(wx * 0.011, wy * 0.011, s + 11, 3);
      const pass = fbm(x * 0.045, y * 0.045, s + 12, 2) < 0.34;
      const e = elev[i];
      const mThr = 0.95 - g.mountains * 0.05 - e * 0.05;
      if (r > mThr && e > 0.06 && !pass) t[i] = T.MOUNTAIN;
      else if (r > mThr - 0.07 && e > 0.04) t[i] = T.HIGHLAND;
      else if (e > 0.55 && fbm(x * 0.05, y * 0.05, s + 16, 2) > 0.5) t[i] = T.HIGHLAND;
    }
  }

  // 3. Inland lakes.
  for (let k = 0; k < Math.round(g.lakes * lin); k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.floor(W * 0.1 + R() * W * 0.8), y = Math.floor(H * 0.1 + R() * H * 0.8);
      if (t[y * W + x] !== T.PLAINS || coastDistance(t, W, H, x, y, 9) < 9) continue;
      const rad = 2 + R() * 4;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx / 1.3, dy) + (fbm(xx * 0.3, yy * 0.3, s + 13, 2) - 0.5) * 3;
        if (d < rad) t[yy * W + xx] = T.DEEP;
      }
      break;
    }
  }

  // 4. Rivers run from high ground to the nearest coast, meandering.
  const toSea = landDistance(t, W, H);
  for (let k = 0; k < Math.round(g.rivers * lin); k++) {
    let x = 0, y = 0, found = false;
    for (let tries = 0; tries < 80 && !found; tries++) {
      x = Math.floor(R() * W); y = Math.floor(R() * H);
      const i = y * W + x;
      found = (t[i] === T.HIGHLAND || t[i] === T.MOUNTAIN) && toSea[i] > 14;
    }
    if (!found) continue;
    const path = [];
    for (let step = 0; step < 800; step++) {
      const i = y * W + x;
      if (!isLand(t[i])) break;
      path.push(i);
      let best = -1, bv = Infinity;
      for (const [dx, dy] of N4) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const v = toSea[j] * 0.6 + fbm(xx * 0.06, yy * 0.06, s + 14 + k, 3) * 9;
        if (v < bv && !path.includes(j)) { bv = v; best = j; }
      }
      if (best < 0) break;
      x = best % W; y = Math.floor(best / W);
    }
    if (path.length > 10 && !isLand(t[y * W + x])) {
      for (const i of path) if (t[i] !== T.MOUNTAIN || R() < 0.5) t[i] = T.RIVER;
    }
  }

  // 5. Volcano clusters on high ground.
  for (let k = 0; k < Math.round(g.volcanoes * lin); k++) {
    for (let tries = 0; tries < 60; tries++) {
      const x = 3 + Math.floor(R() * (W - 6)), y = 3 + Math.floor(R() * (H - 6));
      const tt = t[y * W + x];
      if (tt !== T.MOUNTAIN && tt !== T.HIGHLAND) continue;
      const count = 1 + Math.floor(R() * 3);
      for (let c = 0; c < count; c++) {
        const cx = x + Math.round((R() - 0.5) * 14), cy = y + Math.round((R() - 0.5) * 10);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !isLand(t[yy * W + xx])) continue;
          const d = Math.hypot(dx, dy);
          if (d <= 1.2) t[yy * W + xx] = T.VOLCANO;
          else if (d <= 2.3 && t[yy * W + xx] !== T.VOLCANO) t[yy * W + xx] = T.MOUNTAIN;
        }
      }
      break;
    }
  }

  // 6. Biomes on lowland, and scattered ruins.
  const wildThr = 0.5 + (0.5 - g.wild) * 0.36;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (t[i] !== T.PLAINS) continue;
      if (fbm(x * 0.025, y * 0.025, s + 15, 4) > wildThr) t[i] = T.WILD;
    }
  }
  let landCount = 0;
  for (let i = 0; i < N; i++) if (isLand(t[i])) landCount++;
  const ruinCount = Math.round((landCount * g.ruins) / 120);
  for (let k = 0; k < ruinCount; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = 2 + Math.floor(R() * (W - 12)), y = 2 + Math.floor(R() * (H - 10));
      const rw = 4 + Math.floor(R() * 6), rh = 3 + Math.floor(R() * 4);
      let ok = true;
      for (let dy = 0; dy < rh && ok; dy++) for (let dx = 0; dx < rw; dx++) {
        const tt = t[(y + dy) * W + x + dx];
        if (tt !== T.PLAINS && tt !== T.WILD) { ok = false; break; }
      }
      if (!ok) continue;
      for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) t[(y + dy) * W + x + dx] = T.RUINS;
      break;
    }
  }

  // The map edge is always ocean.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) t[y * W + x] = T.DEEP;
  landCount = 0;
  for (let i = 0; i < N; i++) if (isLand(t[i])) landCount++;

  // 7. Shallow water along coasts.
  const dist = waterDistance(t, W, H, 3);
  for (let i = 0; i < N; i++) {
    if (t[i] !== T.DEEP || dist[i] > 3) continue;
    // A 2-3 tile shelf: the third ring only where the noise says so.
    if (dist[i] <= 2 || fbm((i % W) * 0.08, Math.floor(i / W) * 0.08, s + 17, 2) > 0.5) t[i] = T.SHALLOW;
  }

  const comp = components(t, W, H);
  return {
    theme, seed, w: W, h: H, terrain: t, elev, height: h, comp: comp.id, compSize: comp.size, landCount,
    continents: namedContinents(comp, t, W, H, landCount, theme, seed),
  };
}

// Continents are land masses with at least 3% of the land. Each gets a name
// (from the theme's syllables) and a label point near its middle.
function namedContinents(comp, t, W, H, landCount, theme, seed) {
  const min = landCount * 0.03;
  const out = [];
  const sx = new Float64Array(comp.size.length), sy = new Float64Array(comp.size.length);
  for (let i = 0; i < W * H; i++) {
    const c = comp.id[i];
    if (c < 0 || comp.size[c] < min) continue;
    sx[c] += i % W; sy[c] += Math.floor(i / W);
  }
  const R = rng(seed + 4242);
  const syl = THEMES[theme].lands || ['ar', 'en', 'os', 'ia'];
  const used = new Set();
  comp.size.forEach((n, c) => {
    if (n < min) return;
    let x = Math.round(sx[c] / n), y = Math.round(sy[c] / n);
    // Bent continents can have their centroid in the sea: use the nearest own tile.
    if (comp.id[y * W + x] !== c) {
      let best = Infinity;
      for (let i = 0; i < W * H; i++) {
        if (comp.id[i] !== c) continue;
        const d = Math.hypot(i % W - x, Math.floor(i / W) - y);
        if (d < best) { best = d; x = i % W; y = Math.floor(i / W); }
      }
    }
    let name = '';
    for (let tries = 0; tries < 10 && (!name || used.has(name)); tries++) {
      name = (syl[Math.floor(R() * syl.length)] + syl[Math.floor(R() * syl.length)] + (R() < 0.5 ? syl[Math.floor(R() * syl.length)] : '')).replace(/^./, ch => ch.toUpperCase());
    }
    used.add(name);
    out.push({ id: c, x, y, size: n, name });
  });
  return out.sort((a, b) => b.size - a.size);
}

// Distance from each land tile to the nearest water (BFS, uncapped).
function landDistance(t, W, H) {
  const N = W * H;
  const d = new Uint16Array(N).fill(65535);
  let q = [];
  for (let i = 0; i < N; i++) if (!isLand(t[i])) { d[i] = 0; q.push(i); }
  for (let k = 1; q.length; k++) {
    const next = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || d[j] !== 65535) continue;
        d[j] = k;
        next.push(j);
      }
    }
    q = next;
  }
  return d;
}

// Manhattan distance (capped) from water tiles to the nearest land.
function waterDistance(t, W, H, cap) {
  const N = W * H;
  const d = new Uint8Array(N).fill(255);
  let q = [];
  for (let i = 0; i < N; i++) if (isLand(t[i])) { d[i] = 0; q.push(i); }
  for (let k = 1; k <= cap && q.length; k++) {
    const next = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || d[j] !== 255) continue;
        d[j] = k;
        next.push(j);
      }
    }
    q = next;
  }
  return d;
}

function coastDistance(t, W, H, x, y, cap) {
  for (let r = 1; r <= cap; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !isLand(t[yy * W + xx])) return r;
    }
  }
  return cap;
}

// Connected land masses (4-neighbour).
export function components(t, W, H) {
  const N = W * H;
  const id = new Int32Array(N).fill(-1);
  const size = [];
  for (let i = 0; i < N; i++) {
    if (id[i] >= 0 || !isLand(t[i])) continue;
    const c = size.length;
    let n = 0;
    const stack = [i];
    id[i] = c;
    while (stack.length) {
      const k = stack.pop();
      n++;
      const x = k % W;
      for (const j of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (j >= 0 && j < N && id[j] < 0 && isLand(t[j])) { id[j] = c; stack.push(j); }
      }
    }
    size.push(n);
  }
  return { id, size };
}

/**
 * Spread `count` points over good land (farthest-point sampling).
 * opts: { rand, minDist, avoid: [{x,y,r}], accept(x,y,i) -> bool, score(x,y) -> number }
 */
export function placePoints(world, count, opts = {}) {
  const { w: W, h: H, terrain: t } = world;
  const rand = opts.rand || rng(world.seed + 99);
  const minComp = Math.max(60, world.landCount * 0.02);
  const good = i => {
    const tt = t[i];
    return (tt === T.PLAINS || tt === T.WILD || tt === T.HIGHLAND) && world.compSize[world.comp[i]] >= minComp;
  };
  const points = [];
  const avoid = opts.avoid || [];
  for (let k = 0; k < count; k++) {
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 220; tries++) {
      const x = 4 + Math.floor(rand() * (W - 8)), y = 4 + Math.floor(rand() * (H - 8));
      const i = y * W + x;
      if (!good(i) || (opts.accept && !opts.accept(x, y, i))) continue;
      if (avoid.some(a => Math.hypot(a.x - x, a.y - y) < a.r)) continue;
      const d = Math.min(Infinity, ...points.map(p => Math.hypot(p.x - x, p.y - y)), ...avoid.map(a => Math.hypot(a.x - x, a.y - y) - a.r));
      if (opts.minDist && d < opts.minDist) continue;
      const sc = Math.min(d, scale(W, H)) + (opts.score ? opts.score(x, y) : 0) + rand() * 4;
      if (sc > bestScore) { bestScore = sc; best = { x, y }; }
    }
    if (best) points.push(best);
  }
  return points;
}

const scale = (W, H) => Math.max(W, H);

export { N4, N8 };
