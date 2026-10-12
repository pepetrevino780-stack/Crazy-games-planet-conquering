// Procedural pixel-art skies: per-planet space backdrops, the title
// landscape, and planet orbs for the campaign screen. Everything is drawn
// into low-resolution ImageData and scaled up with nearest-neighbour.
import { fbm, bayer } from '../world/noise.js';
import { THEMES } from '../world/themes.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

class Pix {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = a;
  }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); }
  toCanvas() {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    cv.getContext('2d').putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return cv;
  }
}

const pickDither = (pal, v, x, y) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length + (bayer(x, y) - 0.5) * 0.9)))];

// Dithered nebula clouds.
function nebula(px, pal, seed, density, scale = 0.03) {
  for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
    const n = fbm(x * scale, y * scale * 1.4, seed, 5);
    const v = (n - (1 - density)) / density;
    if (v > 0 && bayer(x, y) < v * 1.6) px.set(x, y, pickDither(pal, Math.min(0.99, v * 1.2), x, y));
  }
}

function stars(px, seed, count, colors = ['#ffffff', '#cfd8ff', '#ffe2c4']) {
  const r = rng(seed);
  const cols = colors.map(hex);
  for (let i = 0; i < count; i++) {
    const x = r() * px.w, y = r() * px.h;
    const c = cols[Math.floor(r() * cols.length)];
    px.set(x, y, c);
    if (r() < 0.06) { px.set(x + 1, y, c, 140); px.set(x - 1, y, c, 140); px.set(x, y + 1, c, 140); px.set(x, y - 1, c, 140); }
  }
}

/**
 * Shaded, dithered sphere. pal: dark→light colours.
 * opts: { tex: noise strength, spots, ring: {pal, tilt}, corona: colour,
 *         eclipse: true (dark disc with lit rim), seed }
 */
function sphere(px, cx, cy, r, pal, opts = {}) {
  const seed = opts.seed || 3;
  const L = [-0.55, -0.6, 0.58];
  const ringBack = [], ringFront = [];
  const ringPal = opts.ring ? opts.ring.pal.map(c => (typeof c === 'string' ? hex(c) : c)) : null;
  if (opts.ring) {
    const rr = r * 1.9;
    for (let a = 0; a < Math.PI * 2; a += 0.6 / rr) {
      for (let k = 0.78; k <= 1; k += 0.6 / rr) {
        const x = cx + Math.cos(a) * rr * k, y = cy + Math.sin(a) * rr * k * opts.ring.tilt;
        (Math.sin(a) < 0 ? ringBack : ringFront).push([x, y, k]);
      }
    }
  }
  const drawRing = list => list.forEach(([x, y, k]) => {
    if (bayer(x | 0, y | 0) < 0.85) px.set(x, y, pickDither(ringPal, k > 0.9 ? 0.8 : 0.4, x | 0, y | 0));
  });
  if (opts.corona) {
    const c = hex(opts.corona);
    for (let y = -r * 1.6; y <= r * 1.6; y++) for (let x = -r * 1.6; x <= r * 1.6; x++) {
      const d = Math.hypot(x, y) / r;
      if (d <= 1 || d > 1.6) continue;
      const flare = fbm(Math.atan2(y, x) * 3 + 10, d * 2, seed + 9, 3);
      const v = (1.6 - d) / 0.6 * (0.5 + flare);
      if (bayer((cx + x) | 0, (cy + y) | 0) < v * 0.7) px.set(cx + x, cy + y, c);
    }
  }
  drawRing(ringBack);
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d2 = (x * x + y * y) / (r * r);
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2), nx = x / r, ny = y / r;
    const X = (cx + x) | 0, Y = (cy + y) | 0;
    if (opts.eclipse) {
      const rim = d2 > 0.88;
      px.set(X, Y, rim && bayer(X, Y) < (d2 - 0.88) * 9 ? hex(opts.corona) : hex('#030205'));
      continue;
    }
    let light = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const t = fbm(nx * 2.4 + 5, ny * 2.4 + 5, seed, 4);
    light = light * 0.85 + (t - 0.5) * (opts.tex ?? 0.5);
    if (opts.spots && fbm(nx * 4 + 1, ny * 4 + 1, seed + 3, 3) > 0.64) light *= 0.45;
    px.set(X, Y, pickDither(pal, Math.max(0, Math.min(0.999, light)), X, Y));
  }
  drawRing(ringFront);
}

const SKIES = {
  vulkara: { base: '#07030a', neb: ['#1c0607', '#3a0d0a', '#5a1a10'], density: 0.42, bodies: [
    { fx: 0.12, fy: 0.2, fr: 0.3, pal: ['#4a0505', '#9c1608', '#e23b12', '#ff7a2f', '#ffc06a'], spots: true, corona: '#ff5a1a', tex: 0.35 },
    { fx: 0.9, fy: 0.16, fr: 0.07, pal: ['#1a0a08', '#4a2014', '#8a4222', '#c06a36'], tex: 0.6 },
  ] },
  cryonis: { base: '#030612', neb: ['#071733', '#0e2a52', '#1d4a7a'], density: 0.38, bodies: [
    { fx: 0.88, fy: 0.22, fr: 0.2, pal: ['#0c1d3a', '#2a5585', '#5f97c6', '#a9d4f0', '#e6f6ff'], ring: { pal: ['#3a5f8a', '#9fc8ea'], tilt: 0.3 }, tex: 0.5 },
    { fx: 0.1, fy: 0.85, fr: 0.06, pal: ['#2a3550', '#7d8eb0', '#dfe8ff'], tex: 0.4 },
  ] },
  mycelion: { base: '#07030c', neb: ['#2a0a35', '#5a1660', '#a03aa8', '#3a6a2a'], density: 0.5, bodies: [
    { fx: 0.1, fy: 0.18, fr: 0.12, pal: ['#10260c', '#2f5a1c', '#5a9a2e', '#b8ff5a'], tex: 0.7 },
    { fx: 0.92, fy: 0.8, fr: 0.05, pal: ['#5a1660', '#ff6ad2', '#ffd6f4'], corona: '#ff6ad2', tex: 0.2 },
  ] },
  xythera: { base: '#04040b', neb: ['#120f2e', '#241c52', '#3a2a7a'], density: 0.4, bodies: [
    { fx: 0.1, fy: 0.22, fr: 0.16, pal: ['#2a1a0c', '#6a4520', '#a8783a', '#e3b45e', '#fff0c4'], ring: { pal: ['#5a3c1a', '#e3b45e'], tilt: 0.35 }, tex: 0.6 },
    { fx: 0.86, fy: 0.12, fr: 0.04, pal: ['#3ad8ff', '#a8f4ff', '#ffffff'], corona: '#3ad8ff', tex: 0.1 },
    { fx: 0.93, fy: 0.24, fr: 0.025, pal: ['#3ad8ff', '#ffffff'], corona: '#a8f4ff', tex: 0.1 },
  ] },
  noctyra: { base: '#030106', neb: ['#1a0a2e', '#341458', '#5a2a8a', '#2a0612'], density: 0.55, bodies: [
    { fx: 0.82, fy: 0.24, fr: 0.24, pal: ['#000000'], corona: '#ff2a3a', eclipse: true },
    { fx: 0.1, fy: 0.15, fr: 0.06, pal: ['#2a0a1a', '#6a1a3a', '#b03a5a', '#ff8aa0'], tex: 0.5 },
    { fx: 0.2, fy: 0.85, fr: 0.04, pal: ['#1a1426', '#4a3a6a', '#9a86c4'], tex: 0.5 },
    { fx: 0.62, fy: 0.9, fr: 0.03, pal: ['#2a0612', '#8a1a2a', '#ff5a6a'], tex: 0.4 },
  ] },
};

// Space backdrop for a planet at a low-res size (cached per size).
const skyCache = new Map();
export function backdropCanvas(planetId, w, h) {
  const key = `${planetId}:${w}x${h}`;
  if (skyCache.has(key)) return skyCache.get(key);
  const sky = SKIES[planetId];
  const px = new Pix(w, h);
  px.fill(hex(sky.base));
  nebula(px, sky.neb.map(hex), planetId.length * 13, sky.density);
  stars(px, planetId.charCodeAt(0) * 7, Math.round(w * h / 90));
  const m = Math.min(w, h);
  sky.bodies.forEach((b, i) => sphere(px, b.fx * w, b.fy * h, Math.max(3, b.fr * m), b.pal.map(hex), { ...b, seed: i * 17 + 5 }));
  const cv = px.toCanvas();
  if (skyCache.size > 12) skyCache.clear();
  skyCache.set(key, cv);
  return cv;
}

// Rotating-free planet orb for menus.
export function planetOrb(planetId, size = 48) {
  const p = THEMES[planetId].pal;
  const px = new Pix(size, size);
  const r = size / 2 - 3;
  const pal = [p.deep[1], p.shallow[1], p.plains[1], p.wild[1], p.highland[2], p.coast].map(hex);
  sphere(px, size / 2, size / 2, r, pal, { tex: 0.9, seed: planetId.length * 31 });
  // Thin atmosphere rim.
  const rimC = hex(p.coast);
  for (let a = 0; a < Math.PI * 2; a += 0.02) {
    const x = size / 2 + Math.cos(a) * (r + 1), y = size / 2 + Math.sin(a) * (r + 1);
    if (Math.cos(a) * -0.6 + Math.sin(a) * -0.6 > 0.1 || bayer(x | 0, y | 0) < 0.3) px.set(x, y, rimC);
  }
  return px.toCanvas();
}

// Title landscape: red giant, ringed moons, nebula, pyramids, obelisks,
// lava pools and a smoking volcano on a surreal alien plain.
export function titleScene(w = 320, h = 180) {
  const px = new Pix(w, h);
  const skyPal = ['#05030c', '#0c0620', '#170a30', '#22103e'].map(hex);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(x, y, pickDither(skyPal, y / (h * 0.7), x, y));
  nebula(px, ['#2a0f4a', '#4a1a7a', '#7a3aa8', '#b98bff'].map(hex), 77, 0.45, 0.022);
  stars(px, 99, Math.round(w * h / 40));
  sphere(px, w * 0.2, h * 0.27, h * 0.2, ['#3a0404', '#8a1206', '#d8320e', '#ff6a24', '#ffb85a'].map(hex), { spots: true, corona: '#ff4a14', tex: 0.35, seed: 4 });
  sphere(px, w * 0.58, h * 0.14, h * 0.07, ['#1a0806', '#5a2010', '#a84a1e', '#e88a3a'].map(hex), { tex: 0.6, seed: 8 });
  sphere(px, w * 0.88, h * 0.4, h * 0.06, ['#2a0806', '#7a1a10', '#d0442a'].map(hex), { tex: 0.5, seed: 12, ring: { pal: ['#5a2a1a', '#c08060'].map(hex), tilt: 0.25 } });

  const horizon = Math.round(h * 0.62);
  // Distant snowy mountains.
  const mPal = ['#1a1428', '#2e2442', '#4a3a66', '#c8c0e0'].map(hex);
  for (let x = 0; x < w; x++) {
    const top = horizon - 4 - fbm(x * 0.04, 1, 5, 4) * h * 0.18;
    for (let y = Math.floor(top); y < horizon + 2; y++) {
      const snow = y < top + 3 && fbm(x * 0.2, y * 0.2, 6) > 0.4;
      px.set(x, y, snow ? mPal[3] : pickDither(mPal, 0.15 + (y - top) / 40, x, y));
    }
  }
  // Ground plain with lava cracks and frost patches.
  const gPal = ['#2a0a06', '#4a160a', '#6e2a10', '#9a4a1e', '#c2702e'].map(hex);
  for (let y = horizon; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x * 0.05, y * 0.12, 21, 4);
    const depth = (y - horizon) / (h - horizon);
    let c = pickDither(gPal, n * 0.7 + depth * 0.25, x, y);
    const crack = Math.abs(fbm(x * 0.03, y * 0.09, 33, 3) - 0.5);
    if (crack < 0.012 + depth * 0.01) c = hex(crack < 0.006 ? '#ffd25e' : '#ff5a1a');
    if (fbm(x * 0.04, y * 0.1, 41, 3) > 0.68 && bayer(x, y) < 0.7) c = hex(bayer(x, y) < 0.35 ? '#c8c0e0' : '#7a7090');
    px.set(x, y, c);
  }
  // Lava pools.
  for (const [cx, cy, rx] of [[w * 0.22, h * 0.86, 20], [w * 0.5, h * 0.95, 26], [w * 0.38, h * 0.74, 10]]) {
    for (let y = -rx * 0.3; y <= rx * 0.3; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (rx * rx * 0.09);
      if (d > 1) continue;
      px.set(cx + x, cy + y, hex(d > 0.75 ? '#1a0604' : d > 0.5 ? '#c2300c' : bayer((cx + x) | 0, (cy + y) | 0) < 0.4 ? '#ffd25e' : '#ff7a1f'));
    }
  }
  // Pyramids with brick courses.
  const pyramid = (cx, base, half, height) => {
    for (let y = 0; y < height; y++) {
      const span = Math.round(half * (y / height));
      for (let x = -span; x <= span; x++) {
        const X = cx + x, Y = base - height + y;
        const lit = x < 0;
        let c = hex(lit ? '#d8582a' : '#8a2a14');
        if (y % 4 === 0 || ((x + (Math.floor(y / 4) % 2) * 3) % 6 === 0 && y % 4 !== 0)) c = hex(lit ? '#9a3a1a' : '#5a1a0c');
        if (x === -span || x === span) c = hex('#2a0806');
        px.set(X, Y, c);
      }
    }
  };
  pyramid(Math.round(w * 0.78), horizon + 22, 30, 46);
  pyramid(Math.round(w * 0.64), horizon + 12, 16, 26);
  // Obelisks with long shadows.
  for (const [ox, oh] of [[w * 0.1, 44], [w * 0.17, 52], [w * 0.25, 40]]) {
    const base = horizon + 14, x0 = Math.round(ox);
    for (let y = 0; y < oh; y++) {
      const half = y < 4 ? Math.floor(y / 2) : 2;
      for (let x = -half; x <= half; x++) px.set(x0 + x, base - oh + y, hex(x < 0 ? '#e0b88a' : x === 0 ? '#b08060' : '#6a4030'));
    }
    for (let s = 0; s < oh * 0.7; s++) px.set(x0 + 3 + s, base + Math.floor(s / 6), hex('#1a0604'));
  }
  // Volcano with smoke.
  const vx = Math.round(w * 0.46), vb = h - 4;
  for (let y = 0; y < 22; y++) {
    const span = 4 + y;
    for (let x = -span; x <= span; x++) px.set(vx + x, vb - 22 + y, hex(x < -span + 2 || x > span - 2 ? '#1a0806' : x < 0 ? '#5a2a1a' : '#3a160c'));
  }
  for (let x = -3; x <= 3; x++) px.set(vx + x, vb - 22, hex('#ffd25e'));
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const sx = vx + Math.sin(t * 9) * 4 + t * 26, sy = vb - 24 - t * 40;
    for (let k = 0; k < 3 + t * 4; k++) if (bayer((sx + k) | 0, sy | 0) < 0.6) px.set(sx + k - t * 2, sy, hex(t < 0.3 ? '#8a8090' : '#4a4058'));
  }
  return px.toCanvas();
}
