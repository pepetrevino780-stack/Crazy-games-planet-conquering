// Paints a generated world into RGBA pixels with the theme's palette.
// Pure function: used by the game renderer and by the Node preview tool.
//
// Look rules (quality spec V1/V2):
// - Land uses a few flat tones per biome in broad noise bands: no dithering.
// - Water is clearly darker than land (at least 40% darker) and desaturated,
//   so land and sea read apart even in grayscale.
// - Land along the shore gets a soft highlight, never a dark rim.
// - `scale` 2 paints 2x2 sub-pixels per tile (a detail pass): tone bands and
//   the shoreline follow the sub-pixel position, so the ground has the same
//   texel size as the building sprites.
import { fbm, hash2 } from './noise.js';
import { T, THEMES, isLand } from './themes.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const LAND = ['plains', 'wild', 'highland', 'mountain', 'river', 'volcano', 'ruins'];
const WATER = ['deep', 'shallow'];

// Relative luminance (0..1) of an [r, g, b] colour.
export const luma = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const scale = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const desaturate = (c, k) => { const l = luma(c) * 255; return mix(c, [l, l, l], k); };

// Minimum brightness of ordinary ground, and how much darker the sea is.
export const LAND_MIN_LUMA = 0.24;
export const SEA_MAX_RATIO = 0.55; // sea luminance <= 55% of ground (>= 40% darker)

const palCache = new Map();
export function palettes(theme) {
  if (palCache.has(theme)) return palCache.get(theme);
  const p = THEMES[theme].pal;
  const out = {};
  for (const k of [...LAND, ...WATER]) out[k] = p[k].map(hex);
  out.coast = hex(p.coast);
  // Lift dark ground so the map is readable at a glance.
  const ground = luma(out.plains[1]);
  if (ground < LAND_MIN_LUMA) {
    const k = LAND_MIN_LUMA / Math.max(0.01, ground);
    for (const key of ['plains', 'wild', 'highland', 'ruins']) out[key] = out[key].map(c => scale(c, k));
    out.mountain = out.mountain.map((c, i) => (i < out.mountain.length - 1 ? scale(c, Math.min(k, 1.8)) : c));
  }
  // Seas: desaturated, and never brighter than SEA_MAX_RATIO of the darkest ground tone.
  const darkGround = Math.min(...['plains', 'wild', 'highland'].map(key => Math.min(...out[key].map(luma))));
  const cap = darkGround * SEA_MAX_RATIO;
  for (const key of WATER) {
    out[key] = out[key].map(c => {
      const d = desaturate(c, 0.45);
      const l = luma(d);
      return l > cap ? scale(d, cap / Math.max(0.001, l)) : d;
    });
  }
  out.shore = mix(out.plains[2], out.coast, 0.35); // the soft shoreline highlight
  palCache.set(theme, out);
  return out;
}

// A flat tone from a list for v in 0..1 (no dithering).
const band = (list, v) => list[Math.max(0, Math.min(list.length - 1, Math.floor(v * list.length)))];

/**
 * Returns Uint8ClampedArray RGBA of (w*scale) x (h*scale) pixels.
 * `simple` = flat strategic colours.
 */
export function paintWorld(world, simple = false, s = 1) {
  const { w: W, h: H, terrain: t, seed } = world;
  const P = palettes(world.theme);
  const OW = W * s, OH = H * s;
  const out = new Uint8ClampedArray(OW * OH * 4);
  const far = simple ? null : seaDistance(t, W, H, 12);
  for (let oy = 0; oy < OH; oy++) {
    for (let ox = 0; ox < OW; ox++) {
      const x = Math.floor(ox / s), y = Math.floor(oy / s);
      const fx = (ox + 0.5) / s, fy = (oy + 0.5) / s; // sub-pixel position in tiles
      const i = y * W + x, tt = t[i];
      let c;
      if (simple) c = isLand(tt) ? (tt === T.MOUNTAIN || tt === T.VOLCANO ? P.mountain[1] : P.plains[1]) : P.deep[0];
      else {
        c = tileColor(world, P, tt, x, y, fx, fy, seed | 0);
        if (tt === T.DEEP) c = far[i] > 6 ? P.deep[0] : P.deep[1];
        else if (isLand(tt) && tt !== T.RIVER) {
          // Shoreline: the whole tile softly, the sub-pixel facing the water more.
          const wx = fx - x < 0.5 ? x - 1 : x + 1, wy = fy - y < 0.5 ? y - 1 : y + 1;
          const facing = !landAt(t, W, H, wx, y) || !landAt(t, W, H, x, wy);
          if (facing) c = mix(c, P.shore, s > 1 ? 0.55 : 0.4);
          else if (touchesWater(t, W, H, x, y)) c = mix(c, P.shore, 0.2);
        }
      }
      const p = (oy * OW + ox) * 4;
      out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255;
    }
  }
  return out;
}

function touchesWater(t, W, H, x, y) {
  return !landAt(t, W, H, x + 1, y) || !landAt(t, W, H, x - 1, y) || !landAt(t, W, H, x, y + 1) || !landAt(t, W, H, x, y - 1);
}

// Distance (capped) from each water tile to the nearest land.
function seaDistance(t, W, H, cap) {
  const N = W * H;
  const d = new Uint8Array(N).fill(cap);
  let q = [];
  for (let i = 0; i < N; i++) if (isLand(t[i])) { d[i] = 0; q.push(i); }
  for (let k = 1; k < cap && q.length; k++) {
    const next = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || d[j] !== cap) continue;
        d[j] = k;
        next.push(j);
      }
    }
    q = next;
  }
  return d;
}

function landAt(t, W, H, x, y) {
  return x >= 0 && y >= 0 && x < W && y < H && isLand(t[y * W + x]);
}

function tileColor(world, P, tt, x, y, fx, fy, s) {
  const { w: W, terrain: t, elev } = world;
  // Broad, smooth noise: a tile reads as one flat tone, bands are wide.
  const n = fbm(fx * 0.07, fy * 0.07, s + 31, 3);
  switch (tt) {
    case T.DEEP: return P.deep[0];
    case T.SHALLOW: return band(P.shallow, 0.2 + n * 0.6);
    case T.MOUNTAIN: {
      // Light from the top-left: lit, mid and shadow faces, snowy peaks.
      const up = (x > 0 && y > 0) ? elev[(y - 1) * W + x - 1] : elev[y * W + x];
      const slope = elev[y * W + x] - up;
      if (elev[y * W + x] > 0.72 && hash2(x, y, s + 33) < 0.5) return P.mountain[3];
      return P.mountain[slope > 0.004 ? 2 : slope < -0.004 ? 0 : 1];
    }
    case T.VOLCANO: {
      const core = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => t[(y + dy) * W + x + dx] === T.VOLCANO);
      return core ? P.volcano[2] : P.volcano[1];
    }
    case T.RIVER: return P.river[0];
    case T.RUINS: {
      // Walls on a grid, broken by decay.
      const wall = (x % 4 === 0 || y % 4 === 0) && hash2(x, y, s + 36) > 0.25;
      return wall ? P.ruins[1] : P.ruins[0];
    }
    case T.WILD: return band(P.wild, n);
    case T.HIGHLAND: return band(P.highland, 0.15 + n * 0.85);
    default: return band(P.plains, 0.15 + n * 0.5 + elev[y * W + x] * 0.3);
  }
}
