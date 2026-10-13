// NPC commanders. Profiles (campaign.js) change how they decide, not how
// many troops they get: think speed, when to strike, whom to strike,
// how much to keep home, whether they retaliate, how many fronts they run.
import { isLand, T } from '../world/themes.js';
import {
  maxTroops, borderMap, launchAttack, attackFronts, siteOwner, buildCost, world, PLAYER, mapScale, areaScale, graceLeft,
} from './core.js';
import { npcBuild, npcUpgrade, launchExpedition, coastalTiles } from './engine.js';
import { isAllied } from './diplomacy.js';

const VALUE = { capital: 3, citadel: 3, hub: 2.5, relay: 2.2, command: 2.2, factory: 1.6, crystal: 1.4, vent: 1.2, turret: 0.6, ruin: 0.6 };

function targetValue(state, fid, o) {
  let v = 0;
  for (const s of state.sites) {
    if (siteOwner(state, s) !== o) continue;
    // Retaking our own lost infrastructure matters most.
    v += (VALUE[s.type] || 0) * (s.faction === fid ? 2 : 1);
  }
  return v;
}

export function think(state, fid, rand) {
  const f = state.factions[fid];
  const p = f.profile;
  const max = maxTroops(state, f);

  // Spend minerals on structures.
  if (rand() < p.build) tryBuild(state, fid, rand);

  if (f.troops < max * p.attackAt) return;
  // Smart commanders send expeditions against weak, isolated civilizations.
  // (Only computer opponents: the balance bot playing the player's side doesn't.)
  if (p.expeditions && fid !== PLAYER && rand() < 0.08 && tryExpedition(state, f, rand)) return;
  const running = state.attacks.filter(a => a.attacker === fid).length;
  if (running >= attackFronts(state, f)) return;

  const near = borderMap(state).get(fid);
  if (!near) return;
  let best = null, bestScore = 0;
  for (const [o, len] of near) {
    if (o === fid || state.attacks.some(a => a.attacker === fid && a.target === o)) continue;
    // Allies and teammates never attack each other.
    if (o && isAllied(state, fid, o)) continue;
    let score;
    if (o === 0) {
      score = p.wildBias * Math.min(1, len / (15 * mapScale(state)));
    } else {
      const other = state.factions[o];
      if (!other || !other.alive) continue;
      // Nobody starts a war with a fresh landing (unless the player struck first),
      // and opportunists leave the player alone for longer still.
      const provoked = other.id in f.attackedBy;
      if (o === PLAYER && !provoked && (graceLeft(state) > 0 || state.time < (p.ignorePlayer || 0))) continue;
      const ratio = f.troops / Math.max(1, other.troops);
      const grudge = p.retaliate && other.id in f.attackedBy && state.time - f.attackedBy[other.id] < 30;
      // Opportunists pounce on neighbours already fighting someone else.
      const busy = p.prey ? state.attacks.some(a => a.target === o && a.attacker !== fid) : false;
      // A grudge lowers the bar but never makes a much weaker civilization charge in.
      const bar = busy && o !== PLAYER ? 0.6 : 0.9;
      if (ratio < (grudge ? Math.min(bar, 0.75) : bar)) continue;
      const bias = other.kind === 'player' ? p.playerBias : p.nationBias;
      score = bias * Math.min(3, ratio) * 0.6;
      score += p.objectiveSense * targetValue(state, fid, o) * 0.35;
      if (f.kind === 'player' && other.kind === 'enemy') score += p.objectiveSense * 1.2;
      if (grudge) score += 1.2;
      // Allies of the player help out against whoever is attacking the player.
      const pa = state.factions[PLAYER].attackedBy;
      if (isAllied(state, fid, PLAYER) && o in pa && state.time - pa[o] < 30) score += 1.2;
      if (p.prey) score += p.prey * ((busy ? 0.9 : 0) + Math.min(1.5, Math.max(0, ratio - 1)) * 0.5);
      score *= Math.min(1, 0.4 + len / (25 * mapScale(state)));
    }
    score *= 1 + p.noise * (rand() - 0.5);
    if (score > bestScore) { bestScore = score; best = o; }
  }
  if (best === null) return;
  const reserve = max * p.reserve * (best === 0 ? 0.5 : 1);
  const send = Math.min(f.troops * p.ratio * (best === 0 ? 0.8 : 1.3), f.troops - reserve);
  if (send < 10 * areaScale(state)) return;
  launchAttack(state, fid, best, send);
}

// A weak civilization (under 40% of our troops) on another continent:
// land on its coast nearest to us.
export function tryExpedition(state, f, rand) {
  if (f.minerals < 100) return false;
  const w = world(state);
  const capOf = id => state.sites.find(s => s.faction === id && (s.type === 'capital' || s.type === 'citadel') && siteOwner(state, s) === id);
  const mine = capOf(f.id);
  if (!mine) return false;
  const myComp = w.comp[mine.y * state.w + mine.x];
  const prey = state.factions.filter(o => o && o.alive && o.id !== f.id && !isAllied(state, f.id, o.id) && o.troops < f.troops * 0.4)
    // The player's ceasefire (and an opportunist's patience) apply at sea too.
    .filter(o => o.id !== PLAYER || o.id in f.attackedBy || (graceLeft(state) <= 0 && state.time >= (f.profile.ignorePlayer || 0)))
    .filter(o => { const c = capOf(o.id); return c && w.comp[c.y * state.w + c.x] !== myComp; })
    .sort((a, b) => a.troops - b.troops);
  if (!prey.length) return false;
  const target = prey[Math.floor(rand() * Math.min(2, prey.length))];
  const coast = coastalTiles(state, target.id);
  if (!coast.length) return false;
  let best = coast[0], bd = Infinity;
  for (const i of coast) {
    const d = (i % state.w - mine.x) ** 2 + (Math.floor(i / state.w) - mine.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return launchExpedition(state, f.id, best, f.troops * 0.3).ok;
}

function randomOwnTile(state, fid, rand, accept) {
  const N = state.owner.length;
  for (let k = 0; k < 300; k++) {
    const i = Math.floor(rand() * N);
    if (state.owner[i] === fid && accept(i)) return i;
  }
  return -1;
}

function tryBuild(state, fid, rand) {
  const f = state.factions[fid];
  const terrain = world(state).terrain;
  const p = f.profile;
  const options = ['habitat', 'extractor'];
  if (p.reserve >= 0.4) options.push('bastion');
  const type = options[Math.floor(rand() * options.length)];
  // Sometimes raise an existing building's level instead of placing a new one.
  if (rand() < 0.4 && npcUpgrade(state, fid, type)) return;
  if (f.minerals < buildCost(state, fid, type)) return;
  const i = randomOwnTile(state, fid, rand, j => {
    const t = terrain[j];
    if (!isLand(t) || t === T.MOUNTAIN || t === T.VOLCANO || t === T.RIVER) return false;
    if (type !== 'bastion') return true;
    // Bastions go near borders with another civilization.
    const x = j % state.w, y = (j - x) / state.w;
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= state.w || yy >= state.h) continue;
      const o = state.owner[yy * state.w + xx];
      if (o && o !== fid && (o === PLAYER || state.factions[o]?.kind !== 'nation')) return true;
    }
    return false;
  });
  if (i >= 0) npcBuild(state, fid, type, i);
}
