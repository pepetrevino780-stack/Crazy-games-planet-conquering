// Battle setup, simulation loop, player commands, victory and saving.
import { isLand, T } from '../world/themes.js';
import { placePoints } from '../world/generate.js';
import { rng } from '../world/noise.js';
import { AI_PROFILES, SITE_TYPES, BUILDINGS, RESEARCH, nationName, NATION_COLORS } from '../campaign.js';
import { DIFFICULTIES, ABILITIES } from '../progression.js';
import {
  TICK, PLAYER, world, config, setOwner, launchAttack, notice, siteOwner, isShielded, isPowered,
  maxTroops, regen, income, tileCost, tileLocked, neighbors4, TileHeap, eventPhase, sitesOf, countSites, buildCost,
  alive, borders,
} from './core.js';
import { think } from './ai.js';

export const STATE_VERSION = 3;
export { TICK, PLAYER };

function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeFaction(id, props) {
  return {
    id, alive: true, troops: 0, minerals: 0, energy: 0, exotic: 0, tiles: 0, sx: 0, sy: 0,
    growth: 1, atk: 1, def: 1, speed: 1, income: 1, maxMult: 1, research: [], attackedBy: {},
    profile: null, ...props,
  };
}

// Claim the `radius`-equivalent area of unclaimed land nearest to a point.
// Counting tiles (not a fixed radius) keeps starts fair on narrow coasts.
function claimBlob(state, x0, y0, radius, owner) {
  const terrain = world(state).terrain;
  const target = Math.round(Math.PI * radius * radius * 0.92);
  const start = y0 * state.w + x0;
  const seen = new Set([start]);
  const heap = new TileHeap();
  heap.push(0, start);
  let n = 0;
  while (heap.size && n < target) {
    const i = heap.pop();
    const x = i % state.w, y = (i - x) / state.w;
    if (Math.hypot(x - x0, y - y0) > radius * 2.2) continue;
    if (!isLand(terrain[i]) || (state.owner[i] && state.owner[i] !== owner)) continue;
    if (state.owner[i] !== owner) setOwner(state, i, owner);
    n++;
    for (const j of neighbors4(state, i)) if (!seen.has(j)) { seen.add(j); const jx = j % state.w; heap.push(Math.hypot(jx - x0, (j - jx) / state.w - y0), j); }
  }
}

// Nearest good land tile to (x, y) on the given component.
function nearestLand(state, x, y, comp) {
  const w = world(state);
  for (let r = 0; r < 30; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = Math.round(x + dx), yy = Math.round(y + dy);
      if (xx < 2 || yy < 2 || xx >= state.w - 2 || yy >= state.h - 2) continue;
      const i = yy * state.w + xx;
      const t = w.terrain[i];
      if ((t === T.PLAINS || t === T.WILD || t === T.HIGHLAND || t === T.RUINS) && (comp === undefined || w.comp[i] === comp)) return { x: xx, y: yy };
    }
  }
  return null;
}

/**
 * Create a battle. cfg: a planet config (campaign.js). loadout: player
 * modifiers from progression.playerLoadout(). opts: { difficulty, assist,
 * seed (rng seed), playerProfile, spawnTime }.
 */
export function createBattle(configId, loadout, opts = {}) {
  const base = configId === 'skirmish' ? null : configId;
  const state = {
    v: STATE_VERSION,
    configId: base ? configId : 'skirmish',
    theme: null, seed: 0, w: 0, h: 0,
  };
  const cfgSeed = opts.worldSeed;
  // Resolve the config (skirmish worlds are defined by theme + seed).
  if (!base) { state.theme = opts.theme || 'noctyra'; state.seed = cfgSeed ?? 1; }
  const cfg0 = base ? configFor(configId) : null;
  if (cfg0) { state.theme = cfg0.theme; state.seed = cfgSeed ?? cfg0.seed; }
  const cfg = config(state);
  [state.w, state.h] = cfg.size;

  const diff = DIFFICULTIES[opts.difficulty || 'commander'];
  const assist = opts.assist || 0;
  const R = rng((opts.seed ?? 12345) ^ state.seed);

  Object.assign(state, {
    time: 0, rng: (opts.seed ?? 12345) | 0, status: 'spawn', spawnLeft: opts.spawnTime ?? 10,
    difficulty: opts.difficulty || 'commander', assist,
    owner: new Uint8Array(state.w * state.h),
    factions: [null], sites: [], buildings: [], attacks: [], dropships: [], nextId: 1,
    cooldowns: { strike: 0, rally: 0, emp: 0 }, hold: cfg.victory.conds.map(() => 0),
    objectivesDone: [], flags: {}, notices: [], ai: {}, eventWasActive: false,
    tutorial: cfg.tutorial && opts.tutorial !== false ? 0 : -1,
    stats: {
      attacks: 0, conquered: 0, spent: 0, failedAttacks: 0, repelled: 0, lost: 0, peakTiles: 0,
      stormLoss: 0, guardedTiles: 0, shieldBlocked: 0, cappedSeconds: 0, enemyFrontsPeak: 0, lostTo: null,
      battlesWon: 0, defeated: 0,
    },
    // Land per faction, sampled every 5 seconds, for the results chart.
    history: [], historyAt: 0,
  });
  const w = world(state);
  const main = w.compSize.indexOf(Math.max(...w.compSize));

  // Player faction (spawns later, during the spawn phase).
  state.factions.push(makeFaction(PLAYER, {
    name: 'You', color: loadout.color, kind: 'player', civ: loadout.civ,
    troops: 600 + 150 * loadout.reserves, growth: loadout.growth, atk: loadout.atk, def: loadout.def,
    speed: loadout.speed, income: loadout.income, cooldown: loadout.cooldown, scouting: loadout.scouting,
    abilities: loadout.abilities, minerals: 150, energy: 30,
    profile: opts.playerProfile ? { ...AI_PROFILES[opts.playerProfile] } : null,
  }));

  // Main enemy civilization and its capital, far from the west coast.
  const e = cfg.enemy;
  const prof = AI_PROFILES[e.profile];
  const enemyProfile = {
    ...prof,
    interval: prof.interval * diff.aiInterval * (1 + 0.12 * assist),
    attackAt: Math.min(0.9, prof.attackAt + diff.aiMargin * 0.5 + 0.04 * assist),
  };
  const enemyId = state.factions.length;
  state.factions.push(makeFaction(enemyId, {
    name: e.name, color: e.color, kind: 'enemy', troops: e.troops, minerals: 200, profile: enemyProfile, persona: e.profile,
  }));
  const capPt = placePoints(w, 1, { rand: R, accept: (x, y, i) => w.comp[i] === main && x > state.w * 0.62, score: x => x * 0.5 })[0]
    || nearestLand(state, state.w * 0.75, state.h / 2, main);
  const capType = e.capitalType || 'capital';
  const enemyCapital = { id: 'enemy-capital', type: capType, x: capPt.x, y: capPt.y, name: e.capitalName, faction: enemyId };
  if (e.shieldedBy) enemyCapital.shieldedBy = e.shieldedBy;
  state.sites.push(enemyCapital);
  claimBlob(state, capPt.x, capPt.y, e.radius, enemyId);

  // Enemy infrastructure in rings around the capital, each with an outpost.
  for (const spec of e.sites || []) {
    for (let k = 0; k < spec.count; k++) {
      const ang = (k / spec.count) * Math.PI * 2 + R() * 0.8 + Math.PI * 0.6;
      const dist = spec.ring[0] + R() * (spec.ring[1] - spec.ring[0]);
      const p = nearestLand(state, capPt.x + Math.cos(ang) * dist, capPt.y + Math.sin(ang) * dist * 0.8, main);
      if (!p || state.sites.some(s => Math.hypot(s.x - p.x, s.y - p.y) < 5)) continue;
      state.sites.push({ id: `${spec.type}${k + 1}`, type: spec.type, x: p.x, y: p.y, name: `${spec.name} ${'ABCDEFG'[k]}`, faction: enemyId });
      claimBlob(state, p.x, p.y, 3, enemyId);
    }
  }
  state.factions[enemyId].troops = Math.max(state.factions[enemyId].troops, 1);

  // Independent nations spread over the land.
  const avoid = [{ x: capPt.x, y: capPt.y, r: e.radius + 22 }];
  const natPts = placePoints(w, cfg.nations.count, { rand: R, minDist: 22, avoid });
  natPts.forEach((p, k) => {
    const id = state.factions.length;
    state.factions.push(makeFaction(id, {
      name: nationName(state.theme, R), color: NATION_COLORS[k % NATION_COLORS.length], kind: 'nation',
      troops: cfg.nations.troops, minerals: 100, persona: cfg.nations.profile,
      profile: { ...AI_PROFILES[cfg.nations.profile], interval: AI_PROFILES[cfg.nations.profile].interval * (0.85 + R() * 0.3) },
    }));
    state.sites.push({ id: `nation${id}`, type: 'capital', x: p.x, y: p.y, name: state.factions[id].name, faction: id });
    claimBlob(state, p.x, p.y, cfg.nations.radius, id);
  });

  // Contested resource and objective sites.
  for (const spec of cfg.sites || []) {
    const pts = placePoints(w, spec.count, {
      rand: R, minDist: 14,
      avoid: state.sites.map(s => ({ x: s.x, y: s.y, r: 10 })),
      accept: (x, y, i) => state.owner[i] === 0 && (spec.where !== 'middle' || (x > state.w * 0.3 && x < state.w * 0.68 && w.comp[i] === main)),
    });
    pts.forEach((p, k) => state.sites.push({ id: `${spec.type}${k + 1}`, type: spec.type, x: p.x, y: p.y, name: `${SITE_TYPES[spec.type].label} ${'ABCDEFG'[k]}` }));
  }

  for (const f of state.factions) if (f && f.profile) state.ai[f.id] = { next: (f.kind === 'enemy' ? e.startDelay : 2) + f.profile.interval * R(), lastTarget: null };
  if (state.factions[PLAYER].profile) state.ai[PLAYER] = { next: 0.5, lastTarget: null };
  if (opts.autoSpawn) autoSpawn(state);
  return state;
}

function configFor(id) {
  return config({ configId: id });
}

// ---------- Spawn phase ----------

export function canSpawnAt(state, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 3 || y < 3 || x >= state.w - 3 || y >= state.h - 3) return false;
  const w = world(state);
  const i = y * state.w + x;
  const main = w.compSize.indexOf(Math.max(...w.compSize));
  if (!isLand(w.terrain[i]) || w.terrain[i] === T.MOUNTAIN || w.terrain[i] === T.VOLCANO) return false;
  if (!config(state).skirmish && w.comp[i] !== main) return false;
  if (state.owner[i] && state.owner[i] !== PLAYER) return false;
  return state.sites.every(s => s.faction === PLAYER || Math.hypot(s.x - x, s.y - y) >= (s.id === 'enemy-capital' ? 45 : 14));
}

export function spawnPlayer(state, x, y) {
  if (state.status !== 'spawn' || !canSpawnAt(state, x, y)) return false;
  // Re-picking during the spawn phase moves the landing site.
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === PLAYER) setOwner(state, i, 0);
  state.sites = state.sites.filter(s => s.id !== 'player-capital');
  state.sites.push({ id: 'player-capital', type: 'capital', x, y, name: 'Landing Zone', faction: PLAYER });
  claimBlob(state, x, y, 7, PLAYER);
  return true;
}

export function autoSpawn(state) {
  if (!state.sites.some(s => s.id === 'player-capital')) {
    const w = world(state);
    const pts = placePoints(w, 1, { rand: rng(state.seed + 7), accept: (x, y) => x < state.w * 0.4 && canSpawnAt(state, x, y), score: x => -Math.abs(x - state.w * 0.2) * 0.4 });
    const p = pts[0] || placePoints(w, 1, { rand: rng(state.seed + 8), accept: (x, y) => canSpawnAt(state, x, y) })[0];
    spawnPlayer(state, p.x, p.y);
  }
  state.status = 'playing';
  state.spawnLeft = 0;
  notice(state, 'start');
}

// ---------- Player commands ----------

export function playerAttack(state, tileIndex, ratio) {
  if (state.status !== 'playing') return { ok: false, reason: 'notStarted' };
  const target = state.owner[tileIndex];
  if (!isLand(world(state).terrain[tileIndex])) return { ok: false, reason: 'water' };
  if (target === PLAYER) return { ok: false, reason: 'own' };
  if (tileLocked(state, tileIndex)) { state.stats.shieldBlocked++; return { ok: false, reason: 'shielded' }; }
  const f = state.factions[PLAYER];
  const res = launchAttack(state, PLAYER, target, f.troops * ratio, tileIndex);
  if (res.ok) {
    state.stats.attacks++;
    state.flags.attacked = true;
    if (ratio >= 0.5) state.flags.ratioAttack = true;
  }
  return res;
}

export function canDropship(state) {
  return state.buildings.some(b => b.type === 'starport' && state.owner[b.y * state.w + b.x] === PLAYER);
}

export const DROPSHIP_COST = 100;

export function playerDropship(state, tileIndex, ratio) {
  if (state.status !== 'playing') return { ok: false, reason: 'notStarted' };
  const f = state.factions[PLAYER];
  if (!isLand(world(state).terrain[tileIndex]) || state.owner[tileIndex] === PLAYER) return { ok: false, reason: 'invalid' };
  if (tileLocked(state, tileIndex)) return { ok: false, reason: 'shielded' };
  const ports = state.buildings.filter(b => b.type === 'starport' && state.owner[b.y * state.w + b.x] === PLAYER);
  if (!ports.length) return { ok: false, reason: 'noStarport' };
  if (f.minerals < DROPSHIP_COST) return { ok: false, reason: 'minerals' };
  const troops = Math.floor(f.troops * ratio);
  if (troops < 5) return { ok: false, reason: 'noTroops' };
  const tx = tileIndex % state.w, ty = (tileIndex - tx) / state.w;
  const port = ports.reduce((a, b) => (Math.hypot(a.x - tx, a.y - ty) < Math.hypot(b.x - tx, b.y - ty) ? a : b));
  f.minerals -= DROPSHIP_COST;
  f.troops -= troops;
  state.dropships.push({ id: state.nextId++, owner: PLAYER, troops, x: port.x, y: port.y, tx, ty });
  state.stats.attacks++;
  return { ok: true, sent: troops };
}

export function canBuildAt(state, type, i) {
  const x = i % state.w, y = (i - x) / state.w;
  const t = world(state).terrain[i];
  if (state.owner[i] !== PLAYER || !isLand(t) || t === T.MOUNTAIN || t === T.VOLCANO || t === T.RIVER) return 'terrain';
  if (state.buildings.some(b => Math.abs(b.x - x) < 4 && Math.abs(b.y - y) < 4)) return 'crowded';
  if (state.sites.some(s => Math.abs(s.x - x) < 3 && Math.abs(s.y - y) < 3)) return 'crowded';
  if (BUILDINGS[type].coastal) {
    let coast = false;
    for (let dy = -3; dy <= 3 && !coast; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < state.w && yy < state.h && !isLand(world(state).terrain[yy * state.w + xx])) { coast = true; break; }
    }
    if (!coast) return 'coast';
  }
  return null;
}

export function playerBuild(state, type, i) {
  if (state.status !== 'playing' || !BUILDINGS[type]) return { ok: false, reason: 'invalid' };
  const f = state.factions[PLAYER];
  const why = canBuildAt(state, type, i);
  if (why) return { ok: false, reason: why };
  const cost = buildCost(state, PLAYER, type);
  if (f.minerals < cost) return { ok: false, reason: 'minerals' };
  f.minerals -= cost;
  const x = i % state.w, y = (i - x) / state.w;
  state.buildings.push({ id: state.nextId++, type, x, y });
  state.flags['built_' + type] = true;
  notice(state, 'built', { building: type, x, y, owner: PLAYER, cost });
  return { ok: true };
}

export function npcBuild(state, fid, type, i) {
  const f = state.factions[fid];
  const cost = buildCost(state, fid, type);
  if (f.minerals < cost) return false;
  const x = i % state.w, y = (i - x) / state.w;
  if (state.buildings.some(b => Math.abs(b.x - x) < 4 && Math.abs(b.y - y) < 4)) return false;
  f.minerals -= cost;
  state.buildings.push({ id: state.nextId++, type, x, y });
  return true;
}

export function playerResearch(state, id) {
  const f = state.factions[PLAYER];
  const r = RESEARCH[id];
  if (!r || f.research.includes(id)) return { ok: false, reason: 'done' };
  if (f.exotic < r.cost) return { ok: false, reason: 'exotic' };
  f.exotic -= r.cost;
  f.research.push(id);
  notice(state, 'research', { id });
  return { ok: true };
}

export const ABILITY_ENERGY = { strike: 40, rally: 30, emp: 35 };

export function abilityReady(state, id) {
  const f = state.factions[PLAYER];
  return f.abilities.includes(id) && state.cooldowns[id] <= state.time && f.energy >= ABILITY_ENERGY[id];
}

export function useAbility(state, id, i) {
  const f = state.factions[PLAYER];
  if (state.status !== 'playing' || !f.abilities.includes(id)) return { ok: false, reason: 'locked' };
  if (state.cooldowns[id] > state.time) return { ok: false, reason: 'cooldown' };
  if (f.energy < ABILITY_ENERGY[id]) return { ok: false, reason: 'energy' };
  const x = i % state.w, y = (i - x) / state.w;
  if (id === 'strike') {
    const target = state.owner[i];
    if (!target || target === PLAYER) return { ok: false, reason: 'target' };
    if (tileLocked(state, i)) return { ok: false, reason: 'shielded' };
    const tf = state.factions[target];
    const density = tf.troops / Math.max(1, tf.tiles);
    let n = 0;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      const xx = x + dx, yy = y + dy;
      if (dx * dx + dy * dy > 49 || xx < 0 || yy < 0 || xx >= state.w || yy >= state.h) continue;
      const j = yy * state.w + xx;
      if (state.owner[j] === target && !tileLocked(state, j) && !state.sites.some(s => s.x === xx && s.y === yy && (s.type === 'capital' || s.type === 'citadel'))) { setOwner(state, j, 0); n++; }
    }
    tf.troops = Math.max(0, tf.troops - density * n * 1.5);
    notice(state, 'strike', { x, y });
  } else if (id === 'rally') {
    f.troops = Math.min(maxTroops(state, f) * 1.1, f.troops + maxTroops(state, f) * 0.15);
  } else if (id === 'emp') {
    for (const s of [...state.sites, ...state.buildings]) {
      if (Math.hypot(s.x - x, s.y - y) <= 10 && s.type !== 'capital' && s.type !== 'citadel') s.emp = state.time + 20;
    }
    notice(state, 'emp', { x, y });
  }
  f.energy -= ABILITY_ENERGY[id];
  state.cooldowns[id] = state.time + ABILITIES[id].cooldown * (f.cooldown || 1);
  return { ok: true };
}

// ---------- Simulation ----------

function endAttack(state, a, i) {
  state.attacks.splice(i, 1);
  const f = state.factions[a.attacker];
  if (alive(f)) f.troops += a.troops;
  if (a.target === PLAYER && a.conquered < 12 && a.initial >= 20) {
    state.stats.repelled++;
    notice(state, 'repelled', { attacker: a.attacker });
  }
  if (a.attacker === PLAYER && a.target && a.conquered < 5) state.stats.failedAttacks++;
  if (a.attacker === PLAYER && a.target && a.conquered >= 5) state.stats.battlesWon = (state.stats.battlesWon || 0) + 1;
}

// Where an attack radiates from: the clicked tile, else the attacker's capital.
function attackOrigin(state, a) {
  const W = state.w;
  if (a.focus !== null && a.focus !== undefined) return { x: a.focus % W, y: Math.floor(a.focus / W) };
  const cap = state.sites.find(s => s.faction === a.attacker && (s.type === 'capital' || s.type === 'citadel'));
  if (cap) return { x: cap.x, y: cap.y };
  const f = state.factions[a.attacker];
  return { x: f.sx / Math.max(1, f.tiles), y: f.sy / Math.max(1, f.tiles) };
}

function frontKey(state, a, i) {
  const x = i % state.w, y = (i - x) / state.w;
  const jitter = (((i * 2654435761) >>> 0) % 1000) / 1000;
  return Math.hypot(x - a.ox, y - a.oy) + jitter * 2.5;
}

function buildFrontier(state, a) {
  const { owner, w: W } = state;
  const terrain = world(state).terrain;
  const o = attackOrigin(state, a);
  a.ox = o.x; a.oy = o.y;
  a.frontier = new TileHeap();
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== a.target || !isLand(terrain[i])) continue;
    const x = i % W;
    if ((x > 0 && owner[i - 1] === a.attacker) || (x < W - 1 && owner[i + 1] === a.attacker) || (i >= W && owner[i - W] === a.attacker) || (i + W < owner.length && owner[i + W] === a.attacker)) a.frontier.push(frontKey(state, a, i), i);
  }
}

function adjacentTo(state, i, owner) {
  return neighbors4(state, i).some(j => state.owner[j] === owner);
}

function advanceAttacks(state, dt) {
  const terrain = world(state).terrain;
  for (let k = state.attacks.length - 1; k >= 0; k--) {
    const a = state.attacks[k];
    const att = state.factions[a.attacker];
    const def = a.target ? state.factions[a.target] : null;
    if (!alive(att) || (def && !alive(def))) { endAttack(state, a, k); continue; }
    if (!a.frontier) buildFrontier(state, a);
    let speed = (7 + Math.sqrt(a.troops) * 0.55) * (a.target ? 1 : 1.6) * (att.speed || 1);
    if (att.research.includes('swift')) speed *= 1.3;
    a.progress += speed * dt;
    let ended = false;
    while (a.progress >= 1) {
      if (!a.frontier.size) { ended = true; break; }
      const i = a.frontier.pop();
      if (state.owner[i] !== a.target || !adjacentTo(state, i, a.attacker)) continue;
      if (tileLocked(state, i)) { if (a.attacker === PLAYER) state.stats.shieldBlocked++; continue; }
      const cost = tileCost(state, att, i);
      if (a.troops < cost) { ended = true; break; }
      a.progress -= 1;
      a.troops -= cost;
      if (def) {
        const density = def.troops / Math.max(1, def.tiles);
        def.troops = Math.max(0, def.troops - Math.min(def.troops, density * 0.9));
      }
      setOwner(state, i, a.attacker);
      a.conquered++;
      if (a.attacker === PLAYER) {
        state.stats.conquered++;
        state.stats.spent += cost;
        const ev = eventPhase(state);
        const cit = state.sites.find(s => s.type === 'citadel');
        if (cit && ev.type === 'eclipse' && ev.active && Math.hypot(cit.x - i % state.w, cit.y - Math.floor(i / state.w)) < 12) state.flags.eclipseStrike = true;
      }
      if (a.target === PLAYER) state.stats.lost++;
      const site = state.sites.find(s => s.y * state.w + s.x === i);
      if (site) notice(state, 'site', { site: site.id, owner: a.attacker, prev: a.target });
      for (const j of neighbors4(state, i)) if (state.owner[j] === a.target && isLand(terrain[j])) a.frontier.push(frontKey(state, a, j), j);
    }
    if (ended) endAttack(state, a, k);
  }
}

function advanceDropships(state, dt) {
  for (let k = state.dropships.length - 1; k >= 0; k--) {
    const d = state.dropships[k];
    const dist = Math.hypot(d.tx - d.x, d.ty - d.y);
    const step = 28 * dt;
    if (dist > step) { d.x += (d.tx - d.x) / dist * step; d.y += (d.ty - d.y) / dist * step; continue; }
    state.dropships.splice(k, 1);
    const i = d.ty * state.w + d.tx;
    const f = state.factions[d.owner];
    const target = state.owner[i];
    if (target === d.owner) { f.troops += d.troops; continue; }
    const cost = tileCost(state, f, i) * 2; // landing under fire
    if (d.troops <= cost || tileLocked(state, i)) { notice(state, 'dropFailed', { owner: d.owner }); continue; }
    setOwner(state, i, d.owner);
    const a = { id: state.nextId++, attacker: d.owner, target, troops: d.troops - cost, initial: d.troops, conquered: 1, focus: i, frontier: new TileHeap(), progress: 0, ox: d.tx, oy: d.ty };
    for (const j of neighbors4(state, i)) if (state.owner[j] === target && isLand(world(state).terrain[j])) a.frontier.push(frontKey(state, a, j), j);
    state.attacks.push(a);
    notice(state, 'landed', { owner: d.owner, x: d.tx, y: d.ty });
  }
}

function collapse(state, fid, by) {
  const f = state.factions[fid];
  if (!alive(f)) return;
  f.alive = false;
  for (let i = 0; i < state.owner.length; i++) if (state.owner[i] === fid) setOwner(state, i, 0);
  f.troops = 0;
  for (let k = state.attacks.length - 1; k >= 0; k--) {
    const a = state.attacks[k];
    if (a.attacker === fid) state.attacks.splice(k, 1);
    else if (a.target === fid) endAttack(state, a, k);
  }
  state.dropships = state.dropships.filter(d => d.owner !== fid);
  if (fid === PLAYER) state.stats.lostTo = by;
  else if (by === PLAYER) state.stats.defeated = (state.stats.defeated || 0) + 1;
  notice(state, 'collapse', { faction: fid, by });
}

function checkCapitals(state) {
  for (const s of state.sites) {
    if (!s.faction || (s.type !== 'capital' && s.type !== 'citadel')) continue;
    const f = state.factions[s.faction];
    if (!alive(f)) continue;
    const o = siteOwner(state, s);
    if (o !== s.faction) collapse(state, s.faction, o);
  }
  for (const f of state.factions) if (f && alive(f) && f.tiles === 0 && state.status === 'playing') collapse(state, f.id, 0);
}

function checkObjective(state, obj) {
  const p = state.factions[PLAYER];
  switch (obj.type) {
    case 'tiles': return p.tiles >= obj.n;
    case 'attack': return !!state.flags.attacked;
    case 'ratioAttack': return !!state.flags.ratioAttack;
    case 'ownType': return countSites(state, obj.site, PLAYER) >= obj.n;
    case 'build': return !!state.flags['built_' + obj.building];
    case 'repel': return state.stats.repelled >= obj.n;
    case 'unshield': { const c = state.sites.find(s => s.id === 'enemy-capital'); return !!c && !isShielded(state, c); }
    case 'unpowered': return sitesOf(state, 'turret').filter(t => !isPowered(state, t) || siteOwner(state, t) === PLAYER).length >= obj.n;
    case 'eclipseStrike': return !!state.flags.eclipseStrike;
    default: return false;
  }
}

export function condProgress(state, c, i, dt = 0) {
  const cap = state.sites.find(s => s.id === c.site);
  switch (c.type) {
    case 'capture': return { done: !!cap && siteOwner(state, cap) === PLAYER };
    case 'ownType': { const n = countSites(state, c.site, PLAYER); return { done: n >= c.n, text: ` (${Math.min(n, c.n)}/${c.n})` }; }
    case 'holdType': {
      const n = countSites(state, c.site, PLAYER);
      if (n >= c.n) state.hold[i] += dt;
      return { done: state.hold[i] >= c.duration, frac: state.hold[i] / c.duration, holding: n >= c.n, text: ` (${n}/${c.n})` };
    }
    case 'landShare': {
      const share = state.factions[PLAYER].tiles / world(state).landCount;
      return { done: share >= c.share, frac: share / c.share, text: ` (${Math.round(share * 100)}%)` };
    }
    default: return { done: false };
  }
}

function updateVictory(state, dt) {
  const cfg = config(state);
  const res = cfg.victory.conds.map((c, i) => condProgress(state, c, i, dt).done);
  const won = cfg.victory.mode === 'any' ? res.some(Boolean) : res.every(Boolean);
  if (won) { state.status = 'won'; notice(state, 'victory'); return; }
  if (!alive(state.factions[PLAYER])) { state.status = 'lost'; notice(state, 'defeat'); }
}

export function step(state, dt = TICK) {
  if (state.status === 'spawn') {
    state.spawnLeft -= dt;
    if (state.spawnLeft <= 0) autoSpawn(state);
    return;
  }
  if (state.status !== 'playing') return;
  state.time += dt;
  const cfg = config(state);
  const ev = eventPhase(state);

  if (ev.active && !state.eventWasActive) {
    notice(state, 'eventStart', { type: ev.type });
    for (const f of state.factions) {
      if (!alive(f)) continue;
      if (ev.type === 'bloom') f.troops += maxTroops(state, f) * 0.03 * countSites(state, 'hub', f.id);
      if (ev.type === 'eruption') f.minerals += 120 * countSites(state, 'vent', f.id);
    }
  } else if (!ev.active && state.eventWasActive) notice(state, 'eventEnd', { type: ev.type });
  state.eventWasActive = ev.active;

  for (const f of state.factions) {
    if (!alive(f)) continue;
    f.troops = Math.min(maxTroops(state, f) * 1.1, f.troops + regen(state, f) * dt);
    const inc = income(state, f);
    f.minerals += inc.minerals * dt;
    f.energy = Math.min(200, f.energy + inc.energy * dt);
    f.exotic += inc.exotic * dt;
  }
  advanceAttacks(state, dt);
  advanceDropships(state, dt);

  for (const f of state.factions) {
    if (!alive(f) || !f.profile) continue;
    const ai = state.ai[f.id];
    if (state.time < ai.next) continue;
    ai.next = state.time + f.profile.interval * (0.85 + 0.3 * rand(state));
    think(state, f.id, () => rand(state));
  }

  // Periodic checks.
  state.tickCount = (state.tickCount || 0) + 1;
  const p = state.factions[PLAYER];
  state.stats.peakTiles = Math.max(state.stats.peakTiles, p.tiles);
  if (p.troops >= maxTroops(state, p) * 0.97) state.stats.cappedSeconds += dt;
  const enemy = state.factions.find(f => f && f.kind === 'enemy');
  if (enemy && alive(enemy)) state.stats.enemyFrontsPeak = Math.max(state.stats.enemyFrontsPeak, (enemy.profile?.fronts || 1) + countSites(state, 'command', enemy.id));
  if (state.history && state.time >= state.historyAt) {
    state.history.push(state.factions.map(f => (f ? f.tiles : 0)));
    state.historyAt += 5;
  }
  if (state.tickCount % 3 === 0) {
    checkCapitals(state);
    for (const obj of cfg.objectives) {
      if (!state.objectivesDone.includes(obj.id) && checkObjective(state, obj)) {
        state.objectivesDone.push(obj.id);
        notice(state, 'objective', { id: obj.id });
      }
    }
    advanceTutorial(state);
    updateVictory(state, dt * 3);
  }
}

// ---------- Tutorial ----------
// A planet can carry a step-by-step tutorial. Each step waits for an action
// (checked like an objective) and can unlock toolbar tools and resources.

export function tutorialSteps(state) {
  return state.tutorial >= 0 ? config(state).tutorial || [] : [];
}

export function tutorialStep(state) {
  return tutorialSteps(state)[state.tutorial] || null;
}

function advanceTutorial(state) {
  let step = tutorialStep(state);
  while (step && step.waitFor && checkObjective(state, step.waitFor)) {
    state.tutorial++;
    notice(state, 'tutorial', { index: state.tutorial });
    step = tutorialStep(state);
  }
}

export function skipTutorial(state) {
  if (state.tutorial >= 0) state.tutorial = tutorialSteps(state).length;
}

// Features the player may use right now; null means everything.
export function tutorialUnlocked(state) {
  const steps = tutorialSteps(state);
  if (!(state.tutorial >= 0) || state.tutorial >= steps.length) return null;
  const set = new Set();
  for (let k = 0; k <= state.tutorial; k++) for (const u of steps[k].unlock || []) set.add(u);
  return set;
}

export function advance(state, seconds) {
  const n = Math.round(seconds / TICK);
  for (let k = 0; k < n && (state.status === 'playing' || state.status === 'spawn'); k++) step(state, TICK);
}

export function currentObjective(state) {
  return config(state).objectives.find(o => !state.objectivesDone.includes(o.id)) || null;
}

export function battleResult(state) {
  return {
    time: Math.round(state.time),
    objectivesDone: [...state.objectivesDone],
    capitalThreatened: state.stats.lost > state.stats.peakTiles * 0.33,
    peakTiles: state.stats.peakTiles,
    battlesWon: state.stats.battlesWon || 0,
    defeated: state.stats.defeated || 0,
    repelled: state.stats.repelled,
  };
}

// ---------- Saving ----------

function toB64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function serialize(state) {
  const { owner, notices: _notices, ...rest } = state;
  const copy = JSON.parse(JSON.stringify({ ...rest, attacks: state.attacks.map(a => ({ ...a, frontier: null })) }));
  copy.owner = toB64(owner);
  return copy;
}

export function deserialize(data) {
  if (!data || data.v !== STATE_VERSION || typeof data.owner !== 'string') return null;
  try {
    const state = { ...data, owner: fromB64(data.owner), notices: [] };
    if (!Array.isArray(state.history)) { state.history = []; state.historyAt = state.time; }
    if (state.owner.length !== state.w * state.h) return null;
    config(state);
    world(state);
    return state;
  } catch {
    return null;
  }
}

// ---------- Debrief ----------

export function analyzeDefeat(state) {
  const s = state.stats;
  const cfg = config(state);
  const tips = [];
  const by = s.lostTo ? state.factions[s.lostTo] : null;
  if (by) tips.push(`${by.name} captured your capital. Keep a strong border around your landing zone and don't send your whole army away when an enemy is next to it.`);
  if (s.failedAttacks >= 3) tips.push(`${s.failedAttacks} of your attacks stalled almost at once. Attack where the enemy is thin, use a higher ratio, or wait until your army has regrown.`);
  if (s.cappedSeconds > state.time * 0.25) tips.push('Your army sat at its cap for a long time. Troops at the cap stop growing — keep attacking to stay below it.');
  if (s.stormLoss > 50) tips.push(`Storms froze ${Math.round(s.stormLoss)} of your troops. Launch attacks between whiteouts.`);
  if (s.shieldBlocked > 0) tips.push('The Brood Heart was shielded. Capture the network hubs first; the shield falls when the Swarm holds none.');
  if (cfg.id === 'xythera' && sitesOf(state, 'turret').some(t => isPowered(state, t))) tips.push('Powered defenses made the Axiom core very costly. Capture an energy relay to switch them off.');
  if (cfg.id === 'noctyra' && s.enemyFrontsPeak >= 4) tips.push('The Dominion kept its command nodes and attacked on many fronts. Every node you take removes a front.');
  if (s.peakTiles < 400) tips.push('Your empire stayed small. Expand into wilderness early: more land means a higher troop cap and more income.');
  if (!tips.length) tips.push('The enemy out-grew you. Expand earlier, take resource sites, and build Habitats and Extractors with your minerals.');
  return tips.slice(0, 4);
}

export { borders };
