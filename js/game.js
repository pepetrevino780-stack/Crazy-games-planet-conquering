// Battle simulation. The whole battle is plain JSON-serialisable data so it
// can be saved mid-fight and resumed later.
import { AI_PROFILES, TYPE_INFO, getPlanet } from './campaign.js';
import { DIFFICULTIES, ABILITIES } from './progression.js';
import { think, initAiState } from './ai.js';
import {
  terr, isAdjacent, laneKind, eventPhase, isPowered, isShielded, networkStatus, defMult, atkMult,
  growthRate, resourceBonus, supplyCap, totalTroops, fleetPos, countOwned, enemyFronts,
  FLEET_SPEED, ICE_SPEED, FROST_SPEED, FROST_LOSS, TURRET_RANGE, TURRET_DPS, EMP_DURATION, WITHER_RATE,
} from './rules.js';

export const STATE_VERSION = 1;
export const TICK = 1 / 30;
export const PLAYER = 1;
export const ENEMY = 2;

function rand(state) {
  // mulberry32, state kept in the battle so replays and resumes are deterministic.
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Create a battle.
 * loadout: player modifiers from progression.playerLoadout().
 * opts: { difficulty, assist, seed, playerProfile } — playerProfile lets an
 * NPC brain drive the player faction (used by automated tests).
 */
export function createBattle(planetId, loadout, opts = {}) {
  const planet = getPlanet(planetId);
  const diff = DIFFICULTIES[opts.difficulty || 'commander'];
  const assist = opts.assist || 0;
  const baseProfile = AI_PROFILES[planet.enemy.profile];
  const enemyProfile = {
    ...baseProfile,
    interval: baseProfile.interval * diff.aiInterval * (1 + 0.12 * assist),
    neutralMargin: baseProfile.neutralMargin + diff.aiMargin + 0.05 * assist,
    playerMargin: baseProfile.playerMargin + diff.aiMargin + 0.05 * assist,
  };
  const territories = planet.nodes.map(([id, x, y, type, owner, troops, extra]) => {
    const t = { id, x, y, type, owner, troops, emp: 0, ...(extra || {}) };
    if (owner === PLAYER) t.troops += type === 'capital' ? 10 * loadout.reserves : 3 * loadout.reserves;
    return t;
  });
  const capital = territories.find(t => t.owner === PLAYER && t.type === 'capital');
  const state = {
    v: STATE_VERSION,
    planetId,
    time: 0,
    rng: (opts.seed ?? 12345) | 0,
    status: 'playing',
    difficulty: opts.difficulty || 'commander',
    assist,
    capitalId: capital.id,
    capitalStart: capital.troops,
    factions: {
      1: {
        name: 'You', color: loadout.color, civ: loadout.civ,
        growth: loadout.growth, atk: loadout.atk, def: loadout.def, speed: loadout.speed,
        income: loadout.income, cooldown: loadout.cooldown, scouting: loadout.scouting,
        abilities: loadout.abilities,
        profile: opts.playerProfile ? { ...AI_PROFILES[opts.playerProfile], ...(opts.playerProfileOverrides || {}) } : null,
      },
      2: {
        name: planet.enemy.name, color: planet.enemy.color,
        growth: planet.enemy.growth, atk: planet.enemy.atk, def: planet.enemy.def, speed: 1, income: 1,
        profile: enemyProfile,
      },
    },
    territories,
    lanes: planet.lanes.map(l => [...l]),
    fleets: [],
    nextFleet: 1,
    cooldowns: { strike: 0, rally: 0, emp: 0 },
    hold: planet.victory.conds.map(() => 0),
    objectivesDone: [],
    flags: {},
    eventWasActive: false,
    ai: { 1: initAiState(), 2: initAiState() },
    notices: [],
    stats: {
      attacks: 0, captures: 0, failedAttacks: 0, failedFortified: 0, failedOffEclipse: 0,
      troopsLostAttacking: 0, frostLoss: 0, turretLoss: 0, shieldLoss: 0, witherLoss: 0,
      lostTerritories: 0, repelled: 0, capitalMin: capital.troops, cappedSeconds: 0,
      enemyHubSeconds: 0, enemyFrontsPeak: 0, attacksIntoTurretFire: 0, enemyCaptures: 0,
      lastLossCause: null,
    },
  };
  state.ai[2].next = (planet.enemy.startDelay ?? 2) + enemyProfile.interval;
  state.ai[1].next = 0.5;
  return state;
}

function notice(state, kind, data = {}) {
  state.notices.push({ kind, time: state.time, ...data });
  if (state.notices.length > 50) state.notices.shift();
}

// Send `amount` troops from one territory to an adjacent one.
export function sendTroops(state, fromId, toId, amount, owner) {
  const from = terr(state, fromId);
  const to = terr(state, toId);
  if (!from || !to || from.owner !== owner || fromId === toId) return null;
  if (!isAdjacent(state, fromId, toId)) return null;
  amount = Math.min(Math.floor(amount), Math.floor(from.troops) - 1);
  if (amount < 1) return null;
  from.troops -= amount;
  const f = state.factions[owner];
  const ev = eventPhase(state);
  const frost = ev.type === 'storm' && ev.active;
  let speed = FLEET_SPEED * (f.speed || 1);
  if (laneKind(state, fromId, toId) === 'ice') speed *= ICE_SPEED;
  if (frost) speed *= FROST_SPEED;
  const fleet = {
    id: state.nextFleet++, owner, from: fromId, to: toId, troops: amount,
    x0: from.x, y0: from.y, x1: to.x, y1: to.y,
    dist: Math.hypot(to.x - from.x, to.y - from.y), pos: 0, speed, frost,
  };
  state.fleets.push(fleet);
  return fleet;
}

/**
 * Player command: launch `ratio` of the troops in each selected source that
 * is adjacent to the target. Returns { ok, reason, sent }.
 */
export function playerLaunch(state, sourceIds, targetId, ratio) {
  if (state.status !== 'playing') return { ok: false, reason: 'over' };
  const target = terr(state, targetId);
  if (!target) return { ok: false, reason: 'invalid' };
  const hostile = target.owner !== PLAYER;
  if (hostile && isShielded(state, target)) return { ok: false, reason: 'shielded' };
  let sent = 0;
  let anyAdjacent = false;
  for (const id of sourceIds) {
    const s = terr(state, id);
    if (!s || s.owner !== PLAYER || id === targetId) continue;
    if (!isAdjacent(state, id, targetId)) continue;
    anyAdjacent = true;
    const fl = sendTroops(state, id, targetId, Math.max(1, Math.floor(s.troops * ratio)), PLAYER);
    if (fl) { sent += fl.troops; fl.ratio = ratio; }
  }
  if (!anyAdjacent) return { ok: false, reason: 'notAdjacent' };
  if (!sent) return { ok: false, reason: 'noTroops' };
  if (hostile) {
    state.stats.attacks++;
    if (ratio >= 0.74) state.flags.ratioAttack = true;
  }
  return { ok: true, sent };
}

export function abilityReady(state, id) {
  return state.factions[PLAYER].abilities.includes(id) && state.cooldowns[id] <= state.time;
}

export function useAbility(state, id, targetId) {
  if (state.status !== 'playing' || !abilityReady(state, id)) return { ok: false, reason: 'notReady' };
  const t = terr(state, targetId);
  if (!t) return { ok: false, reason: 'invalid' };
  if (id === 'strike') {
    if (t.owner === PLAYER) return { ok: false, reason: 'ownTarget' };
    if (isShielded(state, t)) return { ok: false, reason: 'shielded' };
    t.troops = Math.max(0, t.troops - Math.min(30, t.troops * 0.35));
  } else if (id === 'rally') {
    if (t.owner !== PLAYER) return { ok: false, reason: 'notOwn' };
    t.troops += 12;
  } else if (id === 'emp') {
    if (!['hub', 'relay', 'turret', 'command', 'fortress'].includes(t.type)) return { ok: false, reason: 'empTarget' };
    t.emp = state.time + EMP_DURATION;
  } else {
    return { ok: false, reason: 'invalid' };
  }
  state.cooldowns[id] = state.time + ABILITIES[id].cooldown * state.factions[PLAYER].cooldown;
  notice(state, 'ability', { ability: id, target: t.id });
  return { ok: true };
}

function resolveArrival(state, fl) {
  const t = terr(state, fl.to);
  if (t.owner === fl.owner) {
    t.troops += fl.troops;
    return;
  }
  const s = state.stats;
  const ev = eventPhase(state);
  const fortified = t.type === 'fortress' || t.type === 'citadel';
  if (fl.owner === PLAYER && fortified && ev.type === 'eclipse' && ev.active) state.flags.eclipseStrike = true;
  if (isShielded(state, t)) {
    if (fl.owner === PLAYER) { s.shieldLoss += fl.troops; s.failedAttacks++; }
    notice(state, 'shieldBlock', { target: t.id, owner: fl.owner });
    return;
  }
  const am = atkMult(state, fl.owner);
  const dm = defMult(state, t);
  const atk = fl.troops * am;
  const def = t.troops * dm;
  const prevOwner = t.owner;
  if (atk > def) {
    t.owner = fl.owner;
    t.troops = (atk - def) / am;
    t.emp = 0;
    state.ai[prevOwner] && (state.ai[prevOwner].lost[t.id] = state.time);
    if (fl.owner === PLAYER) {
      s.captures++;
      s.troopsLostAttacking += fl.troops - t.troops;
    }
    if (prevOwner === PLAYER) {
      s.lostTerritories++;
      s.lastLossCause = { id: t.id, type: t.type, garrison: Math.round(def / dm), attackers: Math.round(fl.troops) };
    }
    if (prevOwner !== PLAYER && fl.owner !== PLAYER) s.enemyCaptures++;
    notice(state, 'capture', { target: t.id, owner: fl.owner, prevOwner });
  } else {
    t.troops = Math.max(0, t.troops - atk / dm);
    if (fl.owner === PLAYER) {
      s.failedAttacks++;
      s.troopsLostAttacking += fl.troops;
      if (dm >= 1.5) s.failedFortified++;
      if (fortified && ev.type === 'eclipse' && !ev.active) s.failedOffEclipse++;
    }
    if (t.owner === PLAYER && fl.owner !== PLAYER) {
      s.repelled++;
      notice(state, 'repelled', { target: t.id });
    }
  }
}

function checkObjective(state, obj) {
  const owned = id => terr(state, id).owner === PLAYER;
  switch (obj.type) {
    case 'own': return obj.ids.every(owned);
    case 'ownCount': return obj.ids.filter(owned).length >= obj.n;
    case 'count': return countOwned(state, PLAYER) >= obj.n;
    case 'ratioAttack': return !!state.flags.ratioAttack;
    case 'repel': return state.stats.repelled >= obj.n;
    case 'hubsCut': return state.territories.filter(t => t.type === 'hub' && t.owner === PLAYER).length >= obj.n;
    case 'unshield': return obj.ids.every(id => !isShielded(state, terr(state, id)));
    case 'unpowered': return state.territories.filter(t => t.type === 'turret' && !(t.owner === ENEMY && isPowered(state, t))).length >= obj.n;
    case 'eclipseStrike': return !!state.flags.eclipseStrike;
    default: return false;
  }
}

function updateVictory(state, dt) {
  const planet = getPlanet(state.planetId);
  const results = planet.victory.conds.map((c, i) => {
    if (c.type === 'own') return c.ids.every(id => terr(state, id).owner === PLAYER);
    if (c.type === 'ownCount') return c.ids.filter(id => terr(state, id).owner === PLAYER).length >= c.n;
    if (c.type === 'hold') {
      if (c.ids.every(id => terr(state, id).owner === PLAYER)) state.hold[i] += dt;
      return state.hold[i] >= c.duration;
    }
    return false;
  });
  const won = planet.victory.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
  if (won) {
    state.status = 'won';
    notice(state, 'victory');
    return;
  }
  const cap = terr(state, state.capitalId);
  const playerAlive = state.territories.some(t => t.owner === PLAYER);
  if (cap.owner !== PLAYER || !playerAlive) {
    state.status = 'lost';
    notice(state, 'defeat');
  }
}

export function step(state, dt = TICK) {
  if (state.status !== 'playing') return;
  state.time += dt;
  const planet = getPlanet(state.planetId);
  const ev = eventPhase(state);

  // Planetary event transitions.
  if (ev.active && !state.eventWasActive) {
    notice(state, 'eventStart', { type: ev.type });
    if (ev.type === 'bloom') {
      for (const t of state.territories) if (networkStatus(state, t) === 'nourished' || (t.type === 'hub' && t.owner !== 0)) t.troops += 4;
    }
  } else if (!ev.active && state.eventWasActive) {
    notice(state, 'eventEnd', { type: ev.type });
  }
  state.eventWasActive = ev.active;

  // Production.
  const bonus = { 1: resourceBonus(state, 1), 2: resourceBonus(state, 2) };
  const supplyFull = {};
  if (planet.supplyCap) for (const o of [1, 2]) supplyFull[o] = totalTroops(state, o) >= supplyCap(state, o);
  for (const t of state.territories) {
    if (t.owner === 0) continue;
    const cap = TYPE_INFO[t.type].cap;
    const ns = networkStatus(state, t);
    if (ns === 'withered') {
      const loss = t.troops * WITHER_RATE * dt;
      t.troops -= loss;
      if (t.owner === PLAYER) state.stats.witherLoss += loss;
    } else if (t.troops < cap && !supplyFull[t.owner]) {
      t.troops = Math.min(cap, t.troops + growthRate(state, t, bonus) * dt);
    } else if (t.troops > cap) {
      t.troops -= (t.troops - cap) * 0.02 * dt;
    }
    if (t.owner === PLAYER && t.troops >= cap - 0.5) state.stats.cappedSeconds += dt;
  }

  // Automated defenses fire on hostile fleets in range.
  const surge = ev.type === 'surge' && ev.active ? 2 : 1;
  const turrets = state.territories.filter(t => t.type === 'turret' && isPowered(state, t));
  for (const fl of state.fleets) {
    const p = fleetPos(fl);
    for (const tu of turrets) {
      if (tu.owner === fl.owner) continue;
      if (Math.hypot(p.x - tu.x, p.y - tu.y) < TURRET_RANGE) {
        const dmg = Math.min(fl.troops, TURRET_DPS * surge * dt);
        fl.troops -= dmg;
        if (fl.owner === PLAYER) {
          state.stats.turretLoss += dmg;
          if (!fl.shot) { fl.shot = true; state.stats.attacksIntoTurretFire++; }
        }
      }
    }
  }

  // Fleet movement and arrivals.
  const arrived = [];
  for (const fl of state.fleets) {
    fl.pos += fl.speed * dt;
    if (fl.pos >= fl.dist) arrived.push(fl);
  }
  if (arrived.length) {
    state.fleets = state.fleets.filter(f => !arrived.includes(f));
    for (const fl of arrived) {
      if (fl.frost) {
        const loss = fl.troops * FROST_LOSS;
        fl.troops -= loss;
        if (fl.owner === PLAYER) state.stats.frostLoss += loss;
      }
      if (fl.troops > 0.01) resolveArrival(state, fl);
    }
  }
  state.fleets = state.fleets.filter(f => f.troops > 0.01);

  // NPC decisions.
  for (const owner of [1, 2]) {
    const f = state.factions[owner];
    if (!f.profile) continue;
    const ai = state.ai[owner];
    if (state.time < ai.next) continue;
    ai.next = state.time + f.profile.interval * (0.85 + 0.3 * rand(state));
    const orders = think(state, owner, () => rand(state));
    for (const o of orders) sendTroops(state, o.from, o.to, o.amount, owner);
  }

  // Stats used by the debrief.
  const s = state.stats;
  const cap = terr(state, state.capitalId);
  if (cap.owner === PLAYER) s.capitalMin = Math.min(s.capitalMin, cap.troops);
  if (state.territories.some(t => t.type === 'hub' && t.owner === ENEMY)) s.enemyHubSeconds += dt;
  s.enemyFrontsPeak = Math.max(s.enemyFrontsPeak, enemyFronts(state, ENEMY));

  // Objectives (sticky once complete).
  for (const obj of planet.objectives) {
    if (state.objectivesDone.includes(obj.id)) continue;
    if (checkObjective(state, obj)) {
      state.objectivesDone.push(obj.id);
      notice(state, 'objective', { id: obj.id });
    }
  }
  updateVictory(state, dt);
}

export function advance(state, seconds) {
  const steps = Math.round(seconds / TICK);
  for (let i = 0; i < steps && state.status === 'playing'; i++) step(state, TICK);
}

// Next tutorial objective that has not been completed (for highlights/tips).
export function currentObjective(state) {
  const planet = getPlanet(state.planetId);
  return planet.objectives.find(o => !state.objectivesDone.includes(o.id)) || null;
}

export function battleResult(state) {
  return {
    time: Math.round(state.time),
    objectivesDone: [...state.objectivesDone],
    capitalThreatened: state.stats.capitalMin < state.capitalStart * 0.5,
  };
}

export function serialize(state) {
  return JSON.parse(JSON.stringify({ ...state, notices: [] }));
}

export function deserialize(data) {
  if (!data || data.v !== STATE_VERSION || !Array.isArray(data.territories)) return null;
  try {
    getPlanet(data.planetId).id;
  } catch {
    return null;
  }
  return { ...data, notices: [] };
}

// Explain a defeat in concrete, actionable terms.
export function analyzeDefeat(state) {
  const s = state.stats;
  const planet = getPlanet(state.planetId);
  const tips = [];
  const lc = s.lastLossCause;
  if (lc && lc.id === state.capitalId) {
    tips.push(`Your capital fell to ${lc.attackers} attackers while holding about ${lc.garrison} troops. Keep a reserve at home, or reinforce it when a large enemy stack gathers next to it.`);
  }
  if (s.failedFortified >= 2) tips.push(`${s.failedFortified} attacks broke against fortified positions. Fortifications multiply defenders; weaken them first, bring a much larger force, or find another route.`);
  if (s.frostLoss > 15) tips.push(`Whiteout storms froze ${Math.round(s.frostLoss)} of your troops in transit. Watch the storm warning and launch between storms.`);
  if (s.turretLoss > 15) tips.push(`Automated defenses shot down ${Math.round(s.turretLoss)} troops. Capture the energy relay that powers them before attacking past them.`);
  if (s.shieldLoss > 0 || (planet.id === 'mycelion' && s.enemyHubSeconds > state.time * 0.8)) tips.push('The Brood Heart stays shielded while the Swarm holds any network hub. Target hubs, not the largest armies.');
  if (s.witherLoss > 10) tips.push('Some of your regions withered after losing their network hub. Protect the hubs that feed your territory.');
  if (s.failedOffEclipse >= 1) tips.push('Attacks on fortified regions outside the eclipse were costly. Wait for the eclipse to strip their defenses.');
  if (planet.id === 'noctyra' && s.enemyFrontsPeak >= 4 && countOwned(state, PLAYER, 'command') === 0) tips.push('The Dominion kept all its command nodes and attacked on many fronts. Capturing even one node reduces its coordination.');
  if (s.failedAttacks >= 4 && s.failedAttacks > s.captures) tips.push(`${s.failedAttacks} of your attacks failed. Compare troop counts before launching and use a higher ratio or combine several territories.`);
  if (s.cappedSeconds > state.time * 2) tips.push('Many of your territories sat at full capacity. Troops at the cap stop growing — spend them on expansion.');
  if (planet.supplyCap) tips.push('Supply is limited here: holding more territories raises your troop cap.');
  if (!tips.length) tips.push('The enemy out-produced you. Expand earlier and secure production sites (vents, crystals, factories) before the main assault.');
  return tips.slice(0, 4);
}

