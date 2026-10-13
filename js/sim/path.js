// Route finding for attacks and expeditions.
//
// Land routes: A* over land tiles of one continent, weighted by roughly what
// each tile costs to take (terrain x defender density). The player's own land
// is nearly free to cross; allied land and shielded tiles are impassable.
import { TERRAIN, isLand } from '../world/themes.js';
import { world, TileHeap, tileLocked } from './core.js';
import { isAllied } from './diplomacy.js';

// A cheap estimate of what taking tile i costs (no site or building bonuses:
// good enough to steer a route).
function stepCost(state, attacker, i) {
  const o = state.owner[i];
  if (o === attacker) return 0.05;
  const base = TERRAIN[world(state).terrain[i]].cost;
  if (!o) return base;
  const def = state.factions[o];
  const density = def ? def.troops / Math.max(1, def.tiles) : 0;
  return base * (1 + density * 0.45);
}

const N4 = (W, H, i) => {
  const x = i % W, out = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (i >= W) out.push(i - W);
  if (i + W < W * H) out.push(i + W);
  return out;
};

/**
 * A* from any of `starts` to `goal` over land of one continent.
 * Returns the tile list from the first step after a start to the goal, or null.
 */
export function landPath(state, attacker, starts, goal, maxNodes = 400000) {
  const { w: W, h: H } = state;
  const w = world(state);
  const comp = w.comp[goal];
  const gx = goal % W, gy = Math.floor(goal / W);
  const g = new Map(), from = new Map();
  const heap = new TileHeap();
  const hcost = i => Math.hypot(i % W - gx, Math.floor(i / W) - gy) * 0.6;
  for (const s of starts) { g.set(s, 0); heap.push(hcost(s), s); }
  let n = 0;
  while (heap.size && n++ < maxNodes) {
    const i = heap.pop();
    if (i === goal) {
      const path = [];
      for (let c = i; !starts.includes(c); c = from.get(c)) path.push(c);
      return path.reverse();
    }
    const gi = g.get(i);
    for (const j of N4(W, H, i)) {
      if (!isLand(w.terrain[j]) || w.comp[j] !== comp) continue;
      const o = state.owner[j];
      if (o && o !== attacker && isAllied(state, attacker, o)) continue;
      if (o !== attacker && tileLocked(state, j)) continue;
      const ng = gi + stepCost(state, attacker, j);
      if (g.has(j) && g.get(j) <= ng) continue;
      g.set(j, ng); from.set(j, i);
      heap.push(ng + hcost(j), j);
    }
  }
  return null;
}

/**
 * How the player (or any attacker) would reach tile `goal`:
 *   { kind: 'land', path, start }  - march across the continent
 *   { kind: 'sea', from }          - no land of ours on that continent
 *   null                           - no route (blocked, or not land)
 */
export function planRoute(state, attacker, goal) {
  const w = world(state);
  if (!isLand(w.terrain[goal])) return null;
  const comp = w.comp[goal];
  const W = state.w, gx = goal % W, gy = Math.floor(goal / W);
  // Our land on that continent, nearest first (a few candidates as A* starts).
  const mine = [];
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === attacker && w.comp[i] === comp) mine.push(i);
  if (!mine.length) return { kind: 'sea' };
  mine.sort((a, b) => Math.hypot(a % W - gx, Math.floor(a / W) - gy) - Math.hypot(b % W - gx, Math.floor(b / W) - gy));
  const starts = mine.slice(0, 24);
  const path = landPath(state, attacker, starts, goal);
  if (!path || !path.length) return null;
  // The march begins where our land ends.
  const start = path.find(t => state.owner[t] !== attacker) ?? path[0];
  return { kind: 'land', path, start };
}

