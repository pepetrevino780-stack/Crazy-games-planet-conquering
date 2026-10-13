// Core rules of the tile-conquest engine, shared by the simulation loop,
// the NPC commanders and the interface.
//
// The world is a grid of tiles. Every land tile has an owner (0 = unclaimed
// wilderness). Each civilization has one troop pool whose cap grows with its
// territory. An attack sends part of that pool against a neighbour, and its
// front advances tile by tile, paying troops for each tile, until it runs out.
import { TERRAIN, isLand } from '../world/themes.js';
import { generateWorld } from '../world/generate.js';
import { SITE_TYPES, BUILDINGS, getPlanet, skirmishConfig, tutorialConfig, UPGRADE_GROWTH } from '../campaign.js';

export const TICK = 0.1;
export const PLAYER = 1;

// ---------- Derived data that is never saved ----------

const cache = new WeakMap();
export function rt(state) {
  let c = cache.get(state);
  if (!c) {
    const world = generateWorld({ theme: state.theme, seed: state.seed, width: state.w, height: state.h });
    c = { world, dirty: [], allDirty: true, border: null, borderTime: -1 };
    cache.set(state, c);
  }
  return c;
}
export const world = state => rt(state).world;

export function config(state) {
  if (state.configId === 'skirmish') return skirmishConfig(state.theme, state.seed, state.mode);
  if (state.configId === 'tutorial') return tutorialConfig(state.lesson);
  return getPlanet(state.configId);
}

// ---------- Small helpers ----------

export const idx = (state, x, y) => y * state.w + x;
export const inMap = (state, x, y) => x >= 0 && y >= 0 && x < state.w && y < state.h;
export function neighbors4(state, i) {
  const W = state.w, x = i % W;
  const out = [];
  if (x > 0) out.push(i - 1);
  if (x < W - 1) out.push(i + 1);
  if (i >= W) out.push(i - W);
  if (i + W < W * state.h) out.push(i + W);
  return out;
}

export const faction = (state, id) => state.factions[id];
export const alive = f => f && f.alive;
export const siteOwner = (state, site) => state.owner[site.y * state.w + site.x];
export const empActive = (state, thing) => (thing.emp || 0) > state.time;

export function eventPhase(state) {
  const ev = config(state).events;
  if (!ev || state.status === 'spawn') return { type: ev?.type || null, active: false, warning: false, remaining: 0 };
  const pos = state.time % ev.period;
  const start = ev.period - ev.duration;
  const active = pos >= start;
  const warning = !active && pos >= start - ev.warn;
  return { type: ev.type, active, warning, remaining: active ? ev.period - pos : start - pos };
}

// ---------- Sites and buildings ----------

export function sitesOf(state, type, owner) {
  return state.sites.filter(s => s.type === type && (owner === undefined || siteOwner(state, s) === owner));
}

export function countSites(state, type, owner) {
  let n = 0;
  for (const s of state.sites) if (s.type === type && siteOwner(state, s) === owner && !empActive(state, s)) n++;
  return n;
}

export function isPowered(state, turret) {
  const o = siteOwner(state, turret);
  if (o === 0 || empActive(state, turret)) return false;
  return state.sites.some(s => s.type === 'relay' && siteOwner(state, s) === o && !empActive(state, s));
}

// The enemy capital is shielded while its civilization holds a shielding site.
export function isShielded(state, site) {
  if (!site.shieldedBy) return false;
  const o = siteOwner(state, site);
  return o !== 0 && countSites(state, site.shieldedBy, o) > 0;
}

export function buildingsOf(state, owner, type) {
  let n = 0;
  for (const b of state.buildings) if ((!type || b.type === type) && state.owner[b.y * state.w + b.x] === owner) n++;
  return n;
}

// Sum of building levels (an upgraded building counts once per level).
export function buildingLevels(state, owner, type) {
  let n = 0;
  for (const b of state.buildings) if (b.type === type && state.owner[b.y * state.w + b.x] === owner) n += b.level || 1;
  return n;
}

// Planets are drawn at `scale` tiles per base tile. Troop amounts and rates
// grow with the area (scale²) and distances with the length (scale), so a
// bigger map plays at the same pace as the base one.
export const mapScale = state => config(state).scale || 1;
export const areaScale = state => mapScale(state) ** 2;

// Seconds left in the no-attack grace period after landing.
export const graceLeft = state => Math.max(0, (config(state).grace ?? 75) - state.time);

export const bastionRadius = (state, b) => (BUILDINGS.bastion.radius + 2 * ((b.level || 1) - 1)) * mapScale(state);

export function upgradeCost(b, state = null) {
  return Math.round(BUILDINGS[b.type].cost * Math.pow(UPGRADE_GROWTH, b.level || 1) * (state ? config(state).costScale || 1 : 1));
}

export function buildCost(state, owner, type) {
  return Math.round(BUILDINGS[type].cost * Math.pow(1.4, buildingsOf(state, owner, type)) * (config(state).costScale || 1));
}

// ---------- Faction numbers ----------

export function maxTroops(state, f) {
  const hab = Math.min(5, buildingLevels(state, f.id, 'habitat'));
  const logistics = f.research.includes('logistics') ? 0.1 : 0;
  return Math.round((400 * areaScale(state) + f.tiles * 5) * (1 + 0.12 * hab + logistics) * (f.maxMult || 1));
}

export function growthMult(state, f) {
  let g = f.growth * (config(state).growthScale || 1);
  for (const s of state.sites) {
    const st = SITE_TYPES[s.type];
    if (st.growth && siteOwner(state, s) === f.id && !empActive(state, s)) g *= 1 + st.growth;
  }
  if (f.research.includes('logistics')) g *= 1.1;
  // Cut-off land grows at half rate.
  g *= 0.5 + 0.5 * connectedShare(state, f);
  return g;
}

// Troops per second. Regrowth scales with the army and slows near the cap.
export function regen(state, f) {
  const max = maxTroops(state, f);
  if (f.troops >= max) return 0;
  const k = areaScale(state);
  return k * (6 + Math.pow(Math.max(0, f.troops) / k, 0.7) * 0.5) * (1 - f.troops / max) * growthMult(state, f);
}

export function income(state, f) {
  let minerals = 2 + (f.tiles / areaScale(state)) * 0.01, energy = 0.3, exotic = 0;
  for (const s of state.sites) {
    if (siteOwner(state, s) !== f.id || empActive(state, s)) continue;
    const st = SITE_TYPES[s.type];
    minerals += st.minerals || 0;
    energy += st.energy || 0;
    exotic += st.exotic || 0;
  }
  minerals += 4 * buildingLevels(state, f.id, 'extractor');
  exotic += 0.5 * buildingLevels(state, f.id, 'spire');
  const scale = config(state).incomeScale || 1;
  return { minerals: minerals * (f.income || 1) * scale, energy: energy * scale, exotic: exotic * scale };
}

export function attackFronts(state, f) {
  return (f.profile ? f.profile.fronts : 3) + countSites(state, 'command', f.id);
}

export function atkMult(state, f) {
  let a = f.atk * (1 + 0.06 * countSites(state, 'command', f.id));
  if (f.research.includes('hardened')) a /= 0.88;
  return a;
}

// ---------- Tile defence ----------

// How much harder a tile is to take than open plains, for its current owner.
export function tileDefense(state, i) {
  const o = state.owner[i];
  const t = world(state).terrain[i];
  let d = TERRAIN[t].defense;
  if (o === 0) return d;
  const x = i % state.w, y = (i - x) / state.w;
  const ev = eventPhase(state);
  const eclipse = ev.type === 'eclipse' && ev.active;
  for (const s of state.sites) {
    const st = SITE_TYPES[s.type];
    if (!st.radius || empActive(state, s)) continue;
    if (siteOwner(state, s) !== o) continue;
    const r2 = (s.x - x) ** 2 + (s.y - y) ** 2;
    const rad = st.radius * mapScale(state);
    if (r2 > rad * rad) continue;
    if (st.nourish) d *= st.nourish;
    if (st.guard && isPowered(state, s)) d *= st.guard * (ev.type === 'surge' && ev.active ? 1.5 : 1);
    if (st.fortress) d *= eclipse && s.type === 'citadel' ? 1.2 : st.fortress;
  }
  for (const b of state.buildings) {
    if (b.type !== 'bastion' || empActive(state, b) || state.owner[b.y * state.w + b.x] !== o) continue;
    const r = bastionRadius(state, b);
    if ((b.x - x) ** 2 + (b.y - y) ** 2 <= r * r) d *= eclipse ? 1.3 : 1.8;
  }
  return d * (state.factions[o]?.def || 1);
}

// Tiles that cannot be attacked at all right now (a shielded capital).
export function tileLocked(state, i) {
  const x = i % state.w, y = (i - x) / state.w;
  for (const s of state.sites) {
    if ((s.type === 'capital' || s.type === 'citadel') && s.shieldedBy && isShielded(state, s)) {
      if ((s.x - x) ** 2 + (s.y - y) ** 2 <= 16 * mapScale(state) ** 2 && state.owner[i] === siteOwner(state, s)) return true;
    }
  }
  return false;
}

// Troops an attacker pays to take tile i.
export function tileCost(state, attacker, i) {
  const t = world(state).terrain[i];
  const base = TERRAIN[t].cost;
  const o = state.owner[i];
  let cost;
  if (o === 0) cost = base;
  else {
    const def = state.factions[o];
    const density = Math.max(1, def.troops / Math.max(1, def.tiles));
    cost = base * (1 + density * 0.45 * tileDefense(state, i));
  }
  return cost / atkMult(state, attacker);
}

// ---------- Ownership changes ----------

export function setOwner(state, i, o) {
  const prev = state.owner[i];
  if (prev === o) return;
  const x = i % state.w, y = (i - x) / state.w;
  if (prev) { const p = state.factions[prev]; p.tiles--; p.sx -= x; p.sy -= y; }
  if (o) { const f = state.factions[o]; f.tiles++; f.sx += x; f.sy += y; }
  state.owner[i] = o;
  const c = rt(state);
  c.dirty.push(i);
  c.ownerVersion = (c.ownerVersion || 0) + 1;
}

// ---------- Supply lines ----------
// Land a civilization can reach from its capital over its own land. Cut-off
// land (a beachhead, an enclave) grows troops at half rate. One flood fill
// from every capital at once; recomputed when territory has changed, at most
// once a second of game time.
export function connectedLand(state) {
  const c = rt(state);
  // Recomputed in whole-second buckets of game time (deterministic, so a
  // resumed battle plays out exactly like the original).
  const bucket = Math.floor(state.time);
  if (c.conn && (c.connVersion === c.ownerVersion || c.connTime === bucket)) return c.conn;
  const { owner, w: W } = state, N = owner.length;
  const mask = c.conn?.mask || new Uint8Array(N);
  mask.fill(0);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (const s of state.sites) {
    if ((s.type !== 'capital' && s.type !== 'citadel') || !s.faction) continue;
    const i = s.y * W + s.x;
    if (owner[i] !== s.faction || mask[i]) continue;
    mask[i] = 1; queue[tail++] = i;
  }
  const counts = new Map();
  while (head < tail) {
    const i = queue[head++];
    const o = owner[i];
    counts.set(o, (counts.get(o) || 0) + 1);
    const x = i % W;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
    for (const j of nb) {
      if (j < 0 || j >= N || mask[j] || owner[j] !== o) continue;
      mask[j] = 1; queue[tail++] = j;
    }
  }
  c.conn = { mask, counts };
  c.connVersion = c.ownerVersion; c.connTime = bucket;
  return c.conn;
}

// Fresh answer for player commands (recomputed whenever territory changed).
export function isConnected(state, i) {
  const c = rt(state);
  if (!c.connFresh || c.connFreshVersion !== c.ownerVersion) {
    const saved = { conn: c.conn, connTime: c.connTime, connVersion: c.connVersion };
    c.conn = null;
    c.connFresh = connectedLand(state);
    c.connFresh = { mask: c.connFresh.mask.slice(), counts: c.connFresh.counts };
    c.connFreshVersion = c.ownerVersion;
    Object.assign(c, saved); // leave the simulation's cached copy untouched
  }
  return !!c.connFresh.mask[i];
}

// Share of a civilization's land that is connected to its capital.
export function connectedShare(state, f) {
  if (!f.tiles) return 1;
  return Math.min(1, (connectedLand(state).counts.get(f.id) || 0) / f.tiles);
}

// Does `a` have any land tile next to land owned by `b`?
export function frontierBetween(state, a, b) {
  const { owner, w: W, h: H } = state;
  const terrain = world(state).terrain;
  const out = [];
  for (let i = 0; i < W * H; i++) {
    if (owner[i] !== b || !isLand(terrain[i])) continue;
    const x = i % W;
    if ((x > 0 && owner[i - 1] === a) || (x < W - 1 && owner[i + 1] === a) || (i >= W && owner[i - W] === a) || (i + W < W * H && owner[i + W] === a)) out.push(i);
  }
  return out;
}

// For every faction: which owners it borders and over how many tiles.
// Cached for half a second of game time.
export function borderMap(state) {
  const c = rt(state);
  // Half-second buckets of game time, so resumed battles stay deterministic.
  const bucket = Math.floor(state.time * 2);
  if (c.border && c.borderTime === bucket) return c.border;
  const { owner, w: W, h: H } = state;
  const terrain = world(state).terrain;
  const map = new Map();
  for (let i = 0; i < W * H; i++) {
    const a = owner[i];
    if (!a) continue;
    const x = i % W;
    for (const j of [x < W - 1 ? i + 1 : -1, i + W < W * H ? i + W : -1]) {
      if (j < 0 || !isLand(terrain[j])) continue;
      const b = owner[j];
      if (b === a) continue;
      if (!map.has(a)) map.set(a, new Map());
      map.get(a).set(b, (map.get(a).get(b) || 0) + 1);
      if (b) {
        if (!map.has(b)) map.set(b, new Map());
        map.get(b).set(a, (map.get(b).get(a) || 0) + 1);
      }
    }
  }
  c.border = map;
  c.borderTime = bucket;
  return map;
}

export const borders = (state, a, b) => (borderMap(state).get(a)?.get(b) || 0) > 0;

// ---------- Attack fronts ----------

// Min-heap of tiles keyed by distance from the attack's origin, so fronts
// grow outward roughly in circles instead of breadth-first diamonds.
export class TileHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.v.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = v.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (v.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < v.length && k[l] < k[m]) m = l;
        if (r < v.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- Commands shared by players and NPCs ----------

export function notice(state, kind, data = {}) {
  state.notices.push({ kind, time: state.time, ...data });
  if (state.notices.length > 60) state.notices.shift();
}

/**
 * Launch an attack from `attacker` against `target` (owner id, 0 = wilderness)
 * with `troops`. Merges into an existing attack on the same target.
 */
export function launchAttack(state, attacker, target, troops, focus = null) {
  const f = state.factions[attacker];
  if (!alive(f) || target === attacker) return { ok: false, reason: 'invalid' };
  if (target && !alive(state.factions[target])) return { ok: false, reason: 'invalid' };
  troops = Math.min(Math.floor(troops), Math.floor(f.troops));
  if (troops < 1) return { ok: false, reason: 'noTroops' };
  if (!borders(state, attacker, target)) return { ok: false, reason: 'notBordering' };
  const live = state.attacks.filter(a => a.attacker === attacker && a.target !== target);
  if (live.length >= attackFronts(state, f) + (attacker === PLAYER ? 2 : 0)) return { ok: false, reason: 'fronts' };
  f.troops -= troops;
  const ev = eventPhase(state);
  let sent = troops;
  if (ev.type === 'storm' && ev.active) {
    sent = troops * 0.75;
    if (attacker === PLAYER) state.stats.stormLoss += troops - sent;
  }
  const existing = state.attacks.find(a => a.attacker === attacker && a.target === target);
  if (existing) {
    existing.troops += sent;
    // A new click on the same front re-aims the push toward it.
    if (focus !== null) { existing.focus = focus; existing.frontier = null; }
  } else {
    state.attacks.push({ id: state.nextId++, attacker, target, troops: sent, initial: sent, conquered: 0, focus, frontier: null, progress: 0 });
  }
  if (target) state.factions[target].attackedBy[attacker] = state.time;
  return { ok: true, sent: Math.round(sent) };
}
