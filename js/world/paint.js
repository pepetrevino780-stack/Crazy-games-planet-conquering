// Paints a generated world into RGBA pixels (one pixel per tile) using the
// theme's limited palette, ordered dithering and simple top-left lighting.
// Pure function: used by the game renderer and by the Node preview tool.
import { fbm, bayer, hash2 } from './noise.js';
import { T, THEMES, isLand } from './themes.js';

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const KEYS = ['deep', 'shallow', 'plains', 'wild', 'highland', 'mountain', 'river', 'volcano', 'ruins'];

const palCache = new Map();
function palettes(theme) {
  if (palCache.has(theme)) return palCache.get(theme);
  const p = THEMES[theme].pal;
  const out = { coast: hex(p.coast) };
  KEYS.forEach(k => { out[k] = p[k].map(hex); });
  palCache.set(theme, out);
  return out;
}

const pick = (list, v, x, y) => list[Math.max(0, Math.min(list.length - 1, Math.floor(v * list.length + (bayer(x, y) - 0.5) * 0.9)))];

/** Returns Uint8ClampedArray RGBA (w*h*4). `simple` = flat strategic colours. */
export function paintWorld(world, simple = false) {
  const { w: W, h: H, terrain: t, elev, seed } = world;
  const P = palettes(world.theme);
  const out = new Uint8ClampedArray(W * H * 4);
  const s = seed | 0;
  const far = simple ? null : seaDistance(t, W, H, 24);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const tt = t[i];
      let c;
      if (simple) {
        c = isLand(tt) ? (tt === T.MOUNTAIN || tt === T.VOLCANO ? P.mountain[1] : P.plains[1]) : P.deep[0];
      } else {
        c = tileColor(t, elev, P, tt, x, y, W, H, s);
        if (tt === T.DEEP) {
          // Open ocean darkens with distance from the shore.
          const k = 1 - Math.min(1, far[i] / 24) * 0.45 * (0.85 + bayer(x, y) * 0.3);
          c = [c[0] * k, c[1] * k, c[2] * k];
        } else if (isLand(tt) && tt !== T.RIVER && touchesWater(t, W, H, x, y)) {
          // A dark outline along every coast.
          c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
        }
      }
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
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

function tileColor(t, elev, P, tt, x, y, W, H, s) {
  const n = fbm(x * 0.11, y * 0.11, s + 31, 3);
  switch (tt) {
    case T.DEEP: {
      const wave = fbm(x * 0.06 + y * 0.015, y * 0.12, s + 32, 3);
      return wave > 0.66 && (x + y) % 4 === 0 ? P.shallow[0] : pick(P.deep, wave, x, y);
    }
    case T.SHALLOW: {
      const nearLand = landAt(t, W, H, x + 1, y) || landAt(t, W, H, x - 1, y) || landAt(t, W, H, x, y + 1) || landAt(t, W, H, x, y - 1);
      if (nearLand && bayer(x, y) < 0.55) return P.coast;
      return pick(P.shallow, n * 0.9, x, y);
    }
    case T.MOUNTAIN: {
      // Light from the top-left: compare with the upper-left neighbour.
      const up = (x > 0 && y > 0) ? elev[(y - 1) * W + x - 1] : elev[y * W + x];
      const slope = elev[y * W + x] - up;
      const ridge = hash2(x, y, s + 33);
      let v = 0.35 + n * 0.3 + slope * 18;
      if (elev[y * W + x] > 0.7 && ridge < 0.5) v = 0.99; // snowy / glowing peaks
      return pick(P.mountain, Math.max(0, Math.min(0.99, v)), x, y);
    }
    case T.VOLCANO: {
      const core = !landAt(t, W, H, x, y) ? 0 : [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => t[(y + dy) * W + x + dx] === T.VOLCANO);
      return core ? P.volcano[bayer(x, y) < 0.5 ? 2 : 1] : P.volcano[bayer(x, y) < 0.3 ? 1 : 0];
    }
    case T.RIVER:
      return P.river[hash2(x, y, s + 34) < 0.3 ? 1 : 0];
    case T.RUINS: {
      // Walls on a grid, broken by decay.
      const wall = (x % 4 === 0 || y % 4 === 0) && hash2(x, y, s + 36) > 0.25;
      return wall ? P.ruins[1] : P.ruins[0];
    }
    case T.WILD: {
      const clump = hash2(x, y, s + 35);
      if (clump < 0.06) return P.wild[2];
      return pick(P.wild, n, x, y);
    }
    case T.HIGHLAND:
      return pick(P.highland, 0.2 + n * 0.8, x, y);
    default: {
      // Plains: subtle elevation shading and a darker rim along the coast.
      const coast = !landAt(t, W, H, x + 1, y) || !landAt(t, W, H, x - 1, y) || !landAt(t, W, H, x, y + 1) || !landAt(t, W, H, x, y - 1);
      if (coast) return P.plains[0];
      return pick(P.plains, 0.25 + n * 0.45 + elev[y * W + x] * 0.35, x, y);
    }
  }
}
