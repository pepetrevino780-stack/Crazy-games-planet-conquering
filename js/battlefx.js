// Battle effects on the fronts: soldiers, muzzle flashes, explosions and
// smoke, and a bigger clash where a front reaches a capital or a Bastion.
// Pure logic (no DOM): the renderer draws what this spawns, and the tests
// check the limits. Everything here is cosmetic; it never touches the
// simulation, so it uses Math.random freely.
import { PLAYER, mapScale, bastionRadius } from './sim/core.js';

export const MAX_PARTICLES = 600;

// At most `perSecond` events in any one-second window.
export function rateLimiter(perSecond) {
  let stamps = [];
  return now => {
    stamps = stamps.filter(t => now - t < 1000);
    if (stamps.length >= perSecond) return false;
    stamps.push(now);
    return true;
  };
}

// Add a particle unless the list is full.
export function pushCapped(list, p, cap = MAX_PARTICLES) {
  if (list.length >= cap) return false;
  list.push(p);
  return true;
}

const inView = (view, x, y) => x >= view.x0 && y >= view.y0 && x <= view.x1 && y <= view.y1;

// Capitals, citadels and Bastions of `owner`: fighting near them clashes.
function strongpoints(state, owner) {
  const out = [];
  const lin = mapScale(state);
  for (const s of state.sites) {
    if ((s.type === 'capital' || s.type === 'citadel') && state.owner[s.y * state.w + s.x] === owner) out.push({ x: s.x, y: s.y, r: 7 * lin });
  }
  for (const b of state.buildings) {
    if (b.type === 'bastion' && state.owner[b.y * state.w + b.x] === owner) out.push({ x: b.x, y: b.y, r: bastionRadius(state, b) * 0.6 });
  }
  return out;
}

/**
 * Spawn this frame's battle effects into `list` (the renderer's particles).
 * view: visible tile bounds { x0, y0, x1, y1 }; off-screen fronts spawn nothing.
 * Returns the number of shots fired on screen (for the skirmish sound).
 */
export function spawnBattleFx(state, view, list, dt, colorOf, rand = Math.random) {
  if (!state.attacks.length || list.length >= MAX_PARTICLES) return 0;
  const W = state.w;
  let shots = 0;
  for (const a of state.attacks) {
    const front = a.frontier?.v;
    if (!front || !front.length) continue;
    // Busier fronts are livelier, but every front gets a few events a second.
    const rate = Math.min(36, 8 + Math.sqrt(Math.max(0, a.troops)) / 5);
    let n = Math.floor(rate * dt + rand());
    if (n <= 0) continue;
    const forts = a.target ? strongpoints(state, a.target) : [];
    const color = colorOf(a.attacker);
    const end = Math.min(front.length, 200);
    while (n-- > 0 && list.length < MAX_PARTICLES) {
      const i = front[Math.floor(rand() * end)];
      if (state.owner[i] !== a.target) continue;
      const x = i % W, y = (i - x) / W;
      if (!inView(view, x, y)) continue;
      // Soldiers come from the attacker's side of the front.
      let sx = x, sy = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * W + x + dx;
        if (j >= 0 && j < state.owner.length && state.owner[j] === a.attacker) { sx = x + dx * 2; sy = y + dy * 2; break; }
      }
      const tx = x + 0.5 + (rand() - 0.5), ty = y + 0.5 + (rand() - 0.5);
      const dur = 0.5 + rand() * 0.4;
      pushCapped(list, { kind: 'soldier', x: sx + 0.5, y: sy + 0.5, vx: (tx - sx - 0.5) / dur, vy: (ty - sy - 0.5) / dur, life: dur, max: dur, color, mine: a.attacker === PLAYER });
      pushCapped(list, { kind: 'flash', x: tx, y: ty, vx: 0, vy: 0, life: 0.09, max: 0.09, color: '#fff6c8' });
      shots++;
      const fort = forts.find(f => Math.hypot(f.x - x, f.y - y) <= f.r);
      // Explosions and smoke: now and then on any front, often at a fort.
      if (rand() < (fort ? 0.45 : 0.1)) {
        const big = fort ? 1.6 : 1;
        for (let k = 0; k < 5 * big; k++) {
          const ang = rand() * Math.PI * 2, v = (3 + rand() * 6) * big;
          pushCapped(list, { kind: 'spark', x: tx, y: ty, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, life: 0.35 + rand() * 0.25, max: 0.6, color: rand() < 0.5 ? '#ff9a3c' : '#ffd25e' });
        }
        for (let k = 0; k < 2 * big; k++) pushCapped(list, { kind: 'smoke', x: tx + (rand() - 0.5), y: ty, vx: (rand() - 0.5) * 1.5, vy: -1.5 - rand() * 1.5, life: 1.2 + rand() * 0.6, max: 1.8, color: '#6a6070' });
      }
      // The clash ring where the front hits a capital or Bastion.
      if (fort && rand() < 0.15) pushCapped(list, { ring: true, kind: 'ring', x: tx, y: ty, r0: 0.5, r: 3, life: 0.45, max: 0.45, color: '#ffe9a8' });
    }
  }
  return shots;
}
