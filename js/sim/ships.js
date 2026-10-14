// Battleships: built at a Starport, they sail the seas on a coarse grid,
// bombard enemy coasts, fight enemy ships and cut down passing expeditions.
import { isLand } from '../world/themes.js';
import { world, rt, TileHeap, mapScale, notice, setOwner, tileLocked, siteOwner, PLAYER, alive } from './core.js';
import { isAllied } from './diplomacy.js';

export const SHIP_COST = { minerals: 400, energy: 60 };
export const SHIP_HP = 100;
const CELL = 4;            // tiles per coarse-grid cell side
const VOLLEY = 6;          // seconds between volleys
const SHIP_SPEED = 16;     // tiles/s x mapScale
const RANGE = 12;          // tiles x mapScale

// Coarse sea grid: a cell is sea when at least 12 of its 16 tiles are water.
// Only the largest connected body (the ocean) counts: ships never spawn in
// or sail to a landlocked lake.
export function seaGrid(state) {
  const c = rt(state);
  if (c.seaGrid) return c.seaGrid;
  const terrain = world(state).terrain, W = state.w, H = state.h;
  const cw = Math.ceil(W / CELL), ch = Math.ceil(H / CELL);
  const sea = new Uint8Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    let water = 0, n = 0;
    for (let dy = 0; dy < CELL; dy++) for (let dx = 0; dx < CELL; dx++) {
      const x = cx * CELL + dx, y = cy * CELL + dy;
      if (x >= W || y >= H) continue;
      n++;
      if (!isLand(terrain[y * W + x])) water++;
    }
    sea[cy * cw + cx] = n && water >= n * 0.75 ? 1 : 0;
  }
  // Keep the largest 4-connected body of sea cells.
  const comp = new Int32Array(cw * ch).fill(-1);
  let best = -1, bestN = 0;
  for (let k = 0, id = 0; k < sea.length; k++, id++) {
    if (!sea[k] || comp[k] >= 0) continue;
    let n = 0;
    const q = [k];
    comp[k] = id;
    while (q.length) {
      const c = q.pop(), x = c % cw, y = (c - x) / cw;
      n++;
      if (x > 0 && sea[c - 1] && comp[c - 1] < 0) { comp[c - 1] = id; q.push(c - 1); }
      if (x < cw - 1 && sea[c + 1] && comp[c + 1] < 0) { comp[c + 1] = id; q.push(c + 1); }
      if (y > 0 && sea[c - cw] && comp[c - cw] < 0) { comp[c - cw] = id; q.push(c - cw); }
      if (y < ch - 1 && sea[c + cw] && comp[c + cw] < 0) { comp[c + cw] = id; q.push(c + cw); }
    }
    if (n > bestN) { bestN = n; best = id; }
  }
  for (let k = 0; k < sea.length; k++) if (sea[k] && comp[k] !== best) sea[k] = 0;
  c.seaGrid = { cw, ch, sea };
  return c.seaGrid;
}

const cellOf = (x, y) => [Math.floor(x / CELL), Math.floor(y / CELL)];
const cellCenter = (g, k) => ({ x: (k % g.cw) * CELL + CELL / 2, y: Math.floor(k / g.cw) * CELL + CELL / 2 });

// Nearest sea cell to a tile position (spiral search), or -1.
export function nearestSeaCell(state, x, y, maxR = 40) {
  const g = seaGrid(state);
  const [cx, cy] = cellOf(x, y);
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= g.cw || yy >= g.ch || !g.sea[yy * g.cw + xx]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = yy * g.cw + xx; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

// Sea-only A* between two cells (8 directions). Returns waypoints in tiles.
export function seaPath(state, from, to) {
  const g = seaGrid(state);
  if (from < 0 || to < 0) return null;
  const tx = to % g.cw, ty = Math.floor(to / g.cw);
  const h = k => Math.hypot(k % g.cw - tx, Math.floor(k / g.cw) - ty);
  const gs = new Map([[from, 0]]), prev = new Map();
  const heap = new TileHeap();
  heap.push(h(from), from);
  let n = 0;
  while (heap.size && n++ < 200000) {
    const k = heap.pop();
    if (k === to) {
      const out = [];
      for (let c = k; c !== undefined; c = prev.get(c)) out.push(cellCenter(g, c));
      return out.reverse();
    }
    const kx = k % g.cw, ky = Math.floor(k / g.cw);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = kx + dx, ny = ky + dy;
      if (nx < 0 || ny < 0 || nx >= g.cw || ny >= g.ch) continue;
      const j = ny * g.cw + nx;
      if (!g.sea[j]) continue;
      // No corner-cutting across land.
      if (dx && dy && (!g.sea[ky * g.cw + nx] || !g.sea[ny * g.cw + kx])) continue;
      const ng = gs.get(k) + (dx && dy ? 1.414 : 1);
      if (gs.has(j) && gs.get(j) <= ng) continue;
      gs.set(j, ng); prev.set(j, k);
      heap.push(ng + h(j), j);
    }
  }
  return null;
}

const ownedPorts = (state, owner) => state.buildings.filter(b => b.type === 'starport' && state.owner[b.y * state.w + b.x] === owner);

// Build a battleship at the owner's Starport nearest the target and send it
// toward tile `goal` (any tile: it sails to the nearest sea cell).
export function buildShip(state, owner, goal) {
  const f = state.factions[owner];
  const ports = ownedPorts(state, owner);
  if (!ports.length) return { ok: false, reason: 'noStarport' };
  if (f.minerals < SHIP_COST.minerals) return { ok: false, reason: 'minerals' };
  if (f.energy < SHIP_COST.energy) return { ok: false, reason: 'energy' };
  const gx = goal % state.w, gy = Math.floor(goal / state.w);
  const port = ports.reduce((a, b) => (Math.hypot(a.x - gx, a.y - gy) <= Math.hypot(b.x - gx, b.y - gy) ? a : b));
  const start = nearestSeaCell(state, port.x, port.y, 6);
  if (start < 0) return { ok: false, reason: 'noSea' };
  f.minerals -= SHIP_COST.minerals;
  f.energy -= SHIP_COST.energy;
  const p = cellCenter(seaGrid(state), start);
  const ship = { id: state.nextId++, owner, x: p.x, y: p.y, tx: p.x, ty: p.y, hp: SHIP_HP, cooldown: VOLLEY / 2, path: [] };
  state.ships.push(ship);
  orderShip(state, ship, goal);
  notice(state, 'shipBuilt', { owner, x: p.x, y: p.y });
  return { ok: true, ship };
}

// Send a ship toward tile `goal` along the sea grid.
export function orderShip(state, ship, goal) {
  const gx = goal % state.w, gy = Math.floor(goal / state.w);
  const to = nearestSeaCell(state, gx, gy);
  const from = nearestSeaCell(state, ship.x, ship.y, 4);
  const path = seaPath(state, from, to);
  if (!path) return false;
  ship.path = path.slice(1);
  const last = path[path.length - 1];
  ship.tx = last.x; ship.ty = last.y;
  return true;
}

export function orderFleet(state, owner, goal) {
  let n = 0;
  for (const s of state.ships) if (s.owner === owner && orderShip(state, s, goal)) n++;
  return n ? { ok: true, count: n } : { ok: false, reason: 'noShips' };
}

const enemies = (state, a, b) => a !== b && b && !isAllied(state, a, b) && alive(state.factions[b]);

// Nearest enemy-held land tile within range of (x, y).
function nearestEnemyLand(state, ship, R) {
  const W = state.w, x0 = Math.round(ship.x), y0 = Math.round(ship.y), r = Math.ceil(R);
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= W || y >= state.h) continue;
    const d = dx * dx + dy * dy;
    if (d > R * R || d >= bd) continue;
    const i = y * W + x;
    const o = state.owner[i];
    if (!enemies(state, ship.owner, o) || tileLocked(state, i)) continue;
    bd = d; best = i;
  }
  return best;
}

// Shell a stretch of coast: like a small Orbital Strike. Land around the hit
// falls back to wilderness and its garrison loses troops.
function bombard(state, ship, i) {
  const W = state.w, x = i % W, y = Math.floor(i / W);
  const target = state.owner[i];
  const tf = state.factions[target];
  const rs = Math.max(1, Math.round(1.0 * mapScale(state)));
  const density = tf.troops / Math.max(1, tf.tiles);
  let n = 0;
  for (let dy = -rs; dy <= rs; dy++) for (let dx = -rs; dx <= rs; dx++) {
    const xx = x + dx, yy = y + dy;
    if (dx * dx + dy * dy > rs * rs || xx < 0 || yy < 0 || xx >= W || yy >= state.h) continue;
    const j = yy * W + xx;
    if (state.owner[j] !== target || tileLocked(state, j)) continue;
    if (state.sites.some(s => s.x === xx && s.y === yy && (s.type === 'capital' || s.type === 'citadel'))) continue;
    setOwner(state, j, 0); n++;
  }
  tf.troops = Math.max(0, tf.troops - density * n);
  tf.attackedBy[ship.owner] = state.time;
  notice(state, 'shell', { owner: ship.owner, x0: ship.x, y0: ship.y, x: x, y: y, target });
}

export function advanceShips(state, dt) {
  if (!state.ships || !state.ships.length) return;
  const lin = mapScale(state), R = RANGE * lin;
  for (const ship of state.ships) {
    if (ship.hp <= 0) continue;
    // Sail along the waypoints.
    let move = SHIP_SPEED * lin * dt;
    while (move > 0 && ship.path && ship.path.length) {
      const wp = ship.path[0];
      const d = Math.hypot(wp.x - ship.x, wp.y - ship.y);
      if (d <= move) { ship.x = wp.x; ship.y = wp.y; move -= d; ship.path.shift(); }
      else { ship.x += (wp.x - ship.x) / d * move; ship.y += (wp.y - ship.y) / d * move; move = 0; }
    }
    ship.cooldown -= dt;
    if (ship.cooldown > 0) continue;
    // Volley: enemy ships first, then passing expeditions, then the coast.
    const foe = state.ships.find(o => o !== ship && o.hp > 0 && enemies(state, ship.owner, o.owner) && Math.hypot(o.x - ship.x, o.y - ship.y) <= R);
    if (foe) {
      foe.hp -= 25;
      ship.cooldown = VOLLEY;
      notice(state, 'shell', { owner: ship.owner, x0: ship.x, y0: ship.y, x: foe.x, y: foe.y, ship: true });
      continue;
    }
    const exp = state.dropships.find(d => !d.returning && enemies(state, ship.owner, d.owner) && Math.hypot(d.x - ship.x, d.y - ship.y) <= R);
    if (exp) {
      exp.troops = Math.floor(exp.troops * 0.8);
      ship.cooldown = VOLLEY;
      notice(state, 'shell', { owner: ship.owner, x0: ship.x, y0: ship.y, x: exp.x, y: exp.y, expedition: true, target: exp.owner });
      continue;
    }
    const land = nearestEnemyLand(state, ship, R);
    if (land >= 0) { bombard(state, ship, land); ship.cooldown = VOLLEY; }
    else ship.cooldown = 0.5;
  }
  // Sunk ships go down with a notice.
  for (let k = state.ships.length - 1; k >= 0; k--) {
    const s = state.ships[k];
    if (s.hp > 0 && alive(state.factions[s.owner])) continue;
    state.ships.splice(k, 1);
    notice(state, 'sunk', { owner: s.owner, x: s.x, y: s.y });
  }
}

// AI: on worlds that allow it, commanders with a Starport build up to two
// ships and send them at the player's nearest coast.
export function aiShips(state, f, rand) {
  if ((state.ships || []).filter(s => s.owner === f.id).length >= 2) return false;
  if (!ownedPorts(state, f.id).length || f.minerals < SHIP_COST.minerals + 100 || f.energy < SHIP_COST.energy) return false;
  if (rand() > 0.5) return false;
  const me = state.sites.find(s => s.id === 'player-capital');
  if (!me || siteOwner(state, me) !== PLAYER) return false;
  return buildShip(state, f.id, me.y * state.w + me.x).ok;
}
