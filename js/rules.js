// Pure rule queries shared by the simulation, the NPC brains and the renderer.
import { TYPE_INFO, getPlanet } from './campaign.js';

export const FLEET_SPEED = 75;
export const ICE_SPEED = 0.55;
export const FROST_SPEED = 0.6;
export const FROST_LOSS = 0.25;
export const TURRET_RANGE = 120;
export const TURRET_DPS = 2.5;
export const EMP_DURATION = 20;
export const NOURISH_GROWTH = 1.5;
export const NOURISH_DEF = 1.25;
export const WITHER_RATE = 0.006; // fraction of troops lost per second when cut off
export const COMMAND_ATK = 0.06;

const indexCache = new WeakMap();

// Derived lookups (adjacency, id maps, networks). Cached per territory array,
// so a state restored from a save rebuilds its index automatically.
export function index(state) {
  let ix = indexCache.get(state.territories);
  if (ix) return ix;
  const byId = new Map();
  state.territories.forEach(t => byId.set(t.id, t));
  const adj = new Map(state.territories.map(t => [t.id, []]));
  const laneKind = new Map();
  for (const [a, b, kind] of state.lanes) {
    adj.get(a).push(b);
    adj.get(b).push(a);
    laneKind.set(a + '|' + b, kind || 'normal');
    laneKind.set(b + '|' + a, kind || 'normal');
  }
  const hubs = new Map(); // network name -> hub territory id
  const poweredBy = new Map(); // turret id -> [relay ids]
  for (const t of state.territories) {
    if (t.network) hubs.set(t.network, t.id);
    for (const p of t.powers || []) {
      if (!poweredBy.has(p)) poweredBy.set(p, []);
      poweredBy.get(p).push(t.id);
    }
  }
  ix = { byId, adj, laneKind, hubs, poweredBy };
  indexCache.set(state.territories, ix);
  return ix;
}

export const terr = (state, id) => index(state).byId.get(id);
export const neighbors = (state, id) => index(state).adj.get(id);
export const laneKind = (state, a, b) => index(state).laneKind.get(a + '|' + b);
export const isAdjacent = (state, a, b) => index(state).laneKind.has(a + '|' + b);

export function planetOf(state) {
  return getPlanet(state.planetId);
}

export function eventPhase(state) {
  const ev = planetOf(state).events;
  if (!ev) return { type: null, active: false, warning: false, remaining: 0 };
  const pos = state.time % ev.period;
  const start = ev.period - ev.duration;
  const active = pos >= start;
  const warning = !active && pos >= start - ev.warn;
  const remaining = active ? ev.period - pos : start - pos;
  return { type: ev.type, active, warning, remaining };
}

export const empActive = (state, t) => t.emp > state.time;

export function isPowered(state, t) {
  if (t.type !== 'turret' || t.owner === 0 || empActive(state, t)) return false;
  const relays = index(state).poweredBy.get(t.id) || [];
  return relays.some(rid => {
    const r = terr(state, rid);
    return r.owner === t.owner && !empActive(state, r);
  });
}

// Network status for a region linked to a hub: 'nourished', 'withered' or null.
export function networkStatus(state, t) {
  if (!t.net || t.owner === 0) return null;
  const hub = terr(state, index(state).hubs.get(t.net));
  if (!hub) return null;
  return hub.owner === t.owner && !empActive(state, hub) ? 'nourished' : 'withered';
}

export function isShielded(state, t) {
  if (!t.shieldedBy) return false;
  return t.shieldedBy.some(id => {
    const h = terr(state, id);
    return h.owner === t.owner && !empActive(state, h);
  });
}

export function faction(state, owner) {
  return state.factions[owner] || null;
}

export function countOwned(state, owner, type) {
  let n = 0;
  for (const t of state.territories) {
    if (t.owner === owner && (!type || t.type === type) && !(type && empActive(state, t))) n++;
  }
  return n;
}

export function atkMult(state, owner) {
  const f = faction(state, owner);
  if (!f) return 1;
  return f.atk * (1 + COMMAND_ATK * countOwned(state, owner, 'command'));
}

export function defMult(state, t) {
  const info = TYPE_INFO[t.type];
  let d = info.def;
  const ev = eventPhase(state);
  if ((t.type === 'fortress' || t.type === 'citadel') && (ev.type === 'eclipse' && ev.active)) {
    d = t.type === 'citadel' ? 1.1 : 1.0;
  }
  if (t.type === 'fortress' && empActive(state, t)) d = 1.0;
  if (t.type === 'turret' && !isPowered(state, t)) d = 1.0;
  if (networkStatus(state, t) === 'nourished') d *= NOURISH_DEF;
  const f = faction(state, t.owner);
  if (f) d *= f.def;
  return d;
}

export function resourceBonus(state, owner) {
  const f = faction(state, owner);
  if (!f) return 1;
  const crystals = countOwned(state, owner, 'crystal');
  const factories = countOwned(state, owner, 'factory');
  return 1 + f.income * (0.12 * crystals + 0.2 * factories);
}

export function supplyCap(state, owner) {
  const sc = planetOf(state).supplyCap;
  if (!sc) return Infinity;
  return sc.base + sc.perTerritory * countOwned(state, owner);
}

export function totalTroops(state, owner) {
  let n = 0;
  for (const t of state.territories) if (t.owner === owner) n += t.troops;
  for (const f of state.fleets) if (f.owner === owner) n += f.troops;
  return n;
}

// Troops per second for a territory, before cap and supply checks.
export function growthRate(state, t, bonusCache) {
  if (t.owner === 0) return 0;
  const info = TYPE_INFO[t.type];
  const f = faction(state, t.owner);
  const planet = planetOf(state);
  let g = info.growth * (planet.growthScale || 1) * f.growth;
  g *= bonusCache ? bonusCache[t.owner] : resourceBonus(state, t.owner);
  const net = networkStatus(state, t);
  if (net === 'nourished') g *= NOURISH_GROWTH;
  else if (net === 'withered') g = 0;
  const ev = eventPhase(state);
  if (ev.type === 'eruption' && ev.active && t.type === 'vent') g *= 2.5;
  if (ev.type === 'eclipse' && ev.active) g *= 0.6;
  return g;
}

export function enemyFronts(state, owner) {
  const f = faction(state, owner);
  if (!f || !f.profile) return 0;
  return f.profile.fronts + countOwned(state, owner, 'command');
}

// Territories the player can currently see troop counts for. Neutral
// garrisons are surveyed from orbit; enemy garrisons need scouting range.
export function playerVision(state) {
  const scouting = state.factions[1].scouting;
  const vis = new Set();
  if (scouting >= 2) {
    state.territories.forEach(t => vis.add(t.id));
    return vis;
  }
  const hops = scouting >= 1 ? 3 : 2;
  let frontier = state.territories.filter(t => t.owner === 1).map(t => t.id);
  frontier.forEach(id => vis.add(id));
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const id of frontier) {
      for (const n of neighbors(state, id)) {
        if (!vis.has(n)) { vis.add(n); next.push(n); }
      }
    }
    frontier = next;
  }
  state.territories.forEach(t => { if (t.owner === 0) vis.add(t.id); });
  return vis;
}

// Estimated hostile pressure on a territory: adjacent hostile garrisons plus
// hostile fleets already en route.
export function threatOn(state, t) {
  let threat = 0;
  for (const nid of neighbors(state, t.id)) {
    const n = terr(state, nid);
    if (n.owner !== 0 && n.owner !== t.owner) threat += n.troops * 0.6 * atkMult(state, n.owner);
  }
  for (const fl of state.fleets) {
    if (fl.to === t.id && fl.owner !== t.owner) threat += fl.troops * atkMult(state, fl.owner);
  }
  return threat;
}

export function incomingFriendly(state, t) {
  let n = 0;
  for (const fl of state.fleets) if (fl.to === t.id && fl.owner === t.owner) n += fl.troops;
  return n;
}

export function fleetPos(fl) {
  const k = fl.dist > 0 ? Math.min(1, fl.pos / fl.dist) : 1;
  return { x: fl.x0 + (fl.x1 - fl.x0) * k, y: fl.y0 + (fl.y1 - fl.y0) * k };
}
