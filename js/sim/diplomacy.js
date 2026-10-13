// Diplomacy between the player and AI civilizations: trust, alliances,
// gifts and betrayal. Also team play (skirmish "Teams" mode), where whole
// teams are permanently allied.
import { PLAYER, notice, alive, areaScale } from './core.js';

// How much a personality trusts a newcomer to begin with.
const BASE_TRUST = { passive: 15, tribe: 5, cautious: 0, opportunist: -15, aggressive: -20, tactical: -10, mastermind: -40 };
export const ALLY_THRESHOLD = 20;

export function relation(state, fid) {
  if (!state.relations) state.relations = {};
  let r = state.relations[fid];
  if (!r) {
    const f = state.factions[fid];
    r = state.relations[fid] = { trust: BASE_TRUST[f?.persona] ?? 0, allied: false, locked: false };
  }
  return r;
}

export const teamOf = (state, fid) => (state.teams ? state.teams[fid] || 0 : 0);

// Are these two civilizations on the same side (never attack each other)?
export function isAllied(state, a, b) {
  if (a === b) return true;
  const ta = teamOf(state, a), tb = teamOf(state, b);
  if (ta && ta === tb) return true;
  if (a !== PLAYER && b !== PLAYER) return false;
  const other = a === PLAYER ? b : a;
  return !!(other && state.relations && state.relations[other] && state.relations[other].allied);
}

export const isTraitor = state => (state.traitorUntil || 0) > state.time;

// How a civilization feels about the player, for tooltips.
export function attitude(state, fid) {
  const f = state.factions[fid];
  if (!f || fid === PLAYER) return null;
  if (isAllied(state, PLAYER, fid)) return { label: relation(state, fid).locked ? 'Teammate' : 'Allied', trust: relation(state, fid).trust, cls: 'ok' };
  if (f.kind === 'enemy' || teamOf(state, fid) > 1) return { label: 'At war', trust: -100, cls: 'no' };
  const t = relation(state, fid).trust;
  const label = t >= 40 ? 'Friendly' : t >= 10 ? 'Cordial' : t > -20 ? 'Neutral' : t > -50 ? 'Wary' : 'Hostile';
  return { label, trust: Math.round(t), cls: t >= 10 ? 'ok' : t <= -20 ? 'no' : '' };
}

const clampTrust = r => { r.trust = Math.max(-100, Math.min(100, r.trust)); };

export function requestAlliance(state, fid) {
  const f = state.factions[fid];
  if (!alive(f) || fid === PLAYER) return { ok: false, reason: 'invalid' };
  if (f.kind === 'enemy' || teamOf(state, fid) > 1) return { ok: false, reason: 'enemyRefuses' };
  const r = relation(state, fid);
  if (r.allied) return { ok: false, reason: 'already' };
  if (isTraitor(state)) return { ok: false, reason: 'traitor' };
  const me = state.factions[PLAYER];
  // Strength and a common threat both make an alliance more attractive.
  let score = r.trust;
  if (me.troops > f.troops * 1.5) score += 10;
  if (state.attacks.some(a => a.target === fid && a.attacker !== PLAYER)) score += 10;
  if (score >= ALLY_THRESHOLD) {
    r.allied = true;
    notice(state, 'diplomacy', { faction: fid, kind: 'allied' });
    return { ok: true };
  }
  r.trust += 2; // asking politely helps a little
  clampTrust(r);
  return { ok: false, reason: 'refused', need: Math.ceil(ALLY_THRESHOLD - score) };
}

// Send troops or minerals to another civilization; it raises their trust.
export function gift(state, fid, kind, amount) {
  const f = state.factions[fid], me = state.factions[PLAYER];
  if (!alive(f) || fid === PLAYER) return { ok: false, reason: 'invalid' };
  if (f.kind === 'enemy' || teamOf(state, fid) > 1) return { ok: false, reason: 'enemyRefuses' };
  amount = Math.floor(Math.min(amount, kind === 'troops' ? me.troops : me.minerals));
  if (amount <= 0) return { ok: false, reason: kind === 'troops' ? 'noTroops' : 'minerals' };
  const r = relation(state, fid);
  if (kind === 'troops') { me.troops -= amount; f.troops += amount; r.trust += Math.min(30, amount / (40 * areaScale(state))); }
  else { me.minerals -= amount; f.minerals += amount; r.trust += Math.min(30, amount / 25); }
  clampTrust(r);
  notice(state, 'diplomacy', { faction: fid, kind: 'gift', what: kind, amount });
  return { ok: true, amount };
}

// Break an alliance. Everyone remembers: a traitor mark for 30 s, and every
// other civilization trusts the player less.
export function betray(state, fid) {
  const r = relation(state, fid);
  if (!r.allied) return { ok: false, reason: 'notAllied' };
  if (r.locked) return { ok: false, reason: 'locked' };
  r.allied = false;
  r.trust = -100;
  state.traitorUntil = state.time + 30;
  for (const f of state.factions) if (f && f.id !== PLAYER && f.id !== fid) { const o = relation(state, f.id); o.trust -= 25; clampTrust(o); }
  notice(state, 'diplomacy', { faction: fid, kind: 'betrayed' });
  return { ok: true };
}

// The player struck a civilization: it trusts the player much less.
export function onPlayerAttack(state, target) {
  if (!target) return;
  const r = relation(state, target);
  r.trust -= 30;
  clampTrust(r);
}

// Trust drifts slowly back toward each personality's starting point.
export function driftTrust(state, dt) {
  if (!state.relations) return;
  for (const [id, r] of Object.entries(state.relations)) {
    const base = BASE_TRUST[state.factions[id]?.persona] ?? 0;
    r.trust += (base - r.trust) * Math.min(1, 0.01 * dt);
  }
}
