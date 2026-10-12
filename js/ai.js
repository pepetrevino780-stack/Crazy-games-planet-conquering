// NPC commanders. Each profile changes how well an NPC chooses targets,
// defends, coordinates and reacts — not how many troops it receives.
import { TYPE_INFO } from './campaign.js';
import {
  terr, neighbors, defMult, atkMult, growthRate, threatOn, incomingFriendly,
  isShielded, isPowered, eventPhase, enemyFronts, FLEET_SPEED, TURRET_RANGE, TURRET_DPS,
} from './rules.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Rough cost of turret fire along a lane for a fleet of `owner`.
function turretToll(state, owner, from, to) {
  let toll = 0;
  for (const t of state.territories) {
    if (t.type !== 'turret' || t.owner === owner || !isPowered(state, t)) continue;
    // Closest point of segment from->to to the turret.
    const dx = to.x - from.x, dy = to.y - from.y;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((t.x - from.x) * dx + (t.y - from.y) * dy) / len2));
    const d = Math.hypot(from.x + dx * k - t.x, from.y + dy * k - t.y);
    if (d < TURRET_RANGE) toll += TURRET_DPS * (2 * Math.sqrt(TURRET_RANGE * TURRET_RANGE - d * d)) / FLEET_SPEED;
  }
  return toll;
}

function targetValue(state, owner, p, t) {
  let v = 1 + (TYPE_INFO[t.type].value - 1) * p.objectiveSense;
  // Recapture our own network hub or relay quickly: whole regions depend on it.
  if (t.type === 'hub' && state.territories.some(o => o.net === t.network && o.owner === owner)) v += 2 * p.objectiveSense;
  if (t.type === 'relay' && (t.powers || []).some(id => terr(state, id).owner === owner)) v += 1.5 * p.objectiveSense;
  if (t.shieldedBy && isShielded(state, t)) return 0;
  const ai = state.ai[owner];
  if (p.counterattack && ai.lost[t.id] !== undefined && state.time - ai.lost[t.id] < 40) v += 1.5;
  if (t.owner !== 0) {
    v *= p.playerBias;
    if (p.punishWeak && t.troops < 8) v += 1;
  }
  return v;
}

// Returns a list of orders: { from, to, amount }.
export function think(state, owner, rng) {
  const f = state.factions[owner];
  const p = f.profile;
  const orders = [];
  const own = state.territories.filter(t => t.owner === owner);
  if (!own.length) return orders;
  const ev = eventPhase(state);
  const used = new Set();
  const spent = new Map();

  const threatCache = new Map();
  const threat = t => {
    if (!threatCache.has(t.id)) threatCache.set(t.id, threatOn(state, t));
    return threatCache.get(t.id);
  };
  const farThreat = t => {
    let sum = 0;
    const seen = new Set([t.id]);
    for (const a of neighbors(state, t.id)) for (const b of [a, ...neighbors(state, a)]) {
      if (seen.has(b)) continue;
      seen.add(b);
      const n = terr(state, b);
      if (n.owner !== 0 && n.owner !== owner) sum += n.troops * atkMult(state, n.owner);
    }
    return sum;
  };
  // Troops a territory can spare. When attacking `target`, the target's own
  // garrison is not counted as a threat: capturing it removes that threat.
  const avail = (t, target) => {
    let reserve;
    let th = threat(t);
    if (target && target.owner !== 0 && target.owner !== owner) {
      th = Math.max(0, th - target.troops * 0.6 * atkMult(state, target.owner));
    }
    if (p.defend) reserve = Math.min(t.troops, (th / defMult(state, t)) * 1.1);
    else reserve = t.troops * 0.15;
    if (t.type === 'capital' || t.type === 'citadel') {
      // Capitals also watch hostile stacks two lanes away.
      reserve = Math.max(reserve, t.troops * p.keepHome, Math.min(t.troops, p.homeGuard || 0),
        (farThreat(t) * 0.5) / defMult(state, t));
    }
    return Math.max(0, t.troops - reserve - 1 - (spent.get(t.id) || 0));
  };
  const send = (from, to, amount) => {
    amount = Math.floor(amount);
    if (amount < 1) return;
    orders.push({ from: from.id, to: to.id, amount });
    spent.set(from.id, (spent.get(from.id) || 0) + amount);
    used.add(from.id);
  };

  // 1. Defence: shore up endangered territories from safe neighbours.
  if (p.defend) {
    const endangered = own
      .map(t => ({ t, deficit: (threat(t) * 1.15) / defMult(state, t) - t.troops - incomingFriendly(state, t) }))
      .filter(x => x.deficit > 0)
      .sort((a, b) => TYPE_INFO[b.t.type].value - TYPE_INFO[a.t.type].value);
    for (const { t, deficit } of endangered.slice(0, 2)) {
      let need = deficit;
      for (const nid of neighbors(state, t.id)) {
        const n = terr(state, nid);
        if (n.owner !== owner || used.has(n.id) || need <= 0) continue;
        if (threat(n) > n.troops * defMult(state, n) * 0.5) continue;
        const amt = Math.min(avail(n) * 0.8, need);
        if (amt >= 2) { send(n, t, amt); need -= amt; }
      }
    }
  }

  // 2. Offence.
  const stormHold = p.eventAware && ev.type === 'storm' && (ev.active || ev.warning);
  const skipAttack = stormHold || rng() < p.idleChance;
  if (!skipAttack) {
    const targets = new Set();
    for (const t of own) for (const nid of neighbors(state, t.id)) {
      const n = terr(state, nid);
      if (n.owner !== owner) targets.add(n);
    }
    const candidates = [];
    for (const t of targets) {
      if (isShielded(state, t)) continue;
      const sources = neighbors(state, t.id)
        .map(id => terr(state, id))
        .filter(s => s.owner === owner && !used.has(s.id) && avail(s, t) > 0)
        .sort((a, b) => avail(b, t) - avail(a, t));
      if (!sources.length) continue;
      const pool = p.multiSource ? sources : sources.slice(0, 1);
      const eta = dist(pool[0], t) / FLEET_SPEED;
      const toll = turretToll(state, owner, pool[0], t);
      const defenders = t.troops + growthRate(state, t) * eta + (t.owner !== 0 ? incomingFriendly(state, t) : 0);
      let margin = t.owner === 0 ? p.neutralMargin : p.playerMargin;
      const fortified = t.type === 'fortress' || t.type === 'citadel';
      if (p.eventAware && fortified && ev.type === 'eclipse' && !ev.active) margin *= 1.25;
      const need = (defenders * defMult(state, t) * margin) / atkMult(state, owner) + toll + 1;
      const total = pool.reduce((s, x) => s + avail(x, t), 0);
      if (total < need) continue;
      const value = targetValue(state, owner, p, t);
      if (value <= 0) continue;
      const score = value * (12 / (need + 12)) * (1 + p.noise * (rng() - 0.5));
      candidates.push({ t, pool, need, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const fronts = Math.max(1, enemyFronts(state, owner));
    let launched = 0;
    for (const c of candidates) {
      if (launched >= fronts) break;
      const pool = c.pool.filter(s => !used.has(s.id));
      let remaining = c.need * p.sendBuffer;
      if (pool.reduce((s, x) => s + avail(x, c.t), 0) < c.need) continue;
      for (const s of pool) {
        if (remaining <= 0) break;
        const amt = Math.min(avail(s, c.t), remaining);
        send(s, c.t, Math.ceil(amt));
        remaining -= amt;
      }
      launched++;
    }
  }

  // 3. Consolidation: move idle interior troops toward the front line.
  if (p.consolidate) {
    const isFrontier = t => neighbors(state, t.id).some(id => terr(state, id).owner !== owner);
    const depth = new Map();
    let queue = own.filter(isFrontier);
    queue.forEach(t => depth.set(t.id, 0));
    while (queue.length) {
      const next = [];
      for (const t of queue) for (const nid of neighbors(state, t.id)) {
        const n = terr(state, nid);
        if (n.owner === owner && !depth.has(n.id)) { depth.set(n.id, depth.get(t.id) + 1); next.push(n); }
      }
      queue = next;
    }
    for (const t of own) {
      const d = depth.get(t.id);
      if (!d || used.has(t.id) || t.troops < 10) continue;
      const step = neighbors(state, t.id).map(id => terr(state, id))
        .filter(n => n.owner === owner && depth.get(n.id) === d - 1)
        .sort((a, b) => threat(b) - threat(a))[0];
      if (step) send(t, step, avail(t) * 0.7);
    }
  }
  return orders;
}

export function initAiState() {
  return { next: 0, lost: {} };
}

