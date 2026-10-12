// Prints each side's troop production once neutrals are split by proximity
// (each neutral goes to whichever side's start is fewer lanes away).
import { PLANETS } from '../js/campaign.js';
import { createBattle } from '../js/game.js';
import { newCampaign, playerLoadout } from '../js/progression.js';
import { neighbors, growthRate, resourceBonus } from '../js/rules.js';

function hops(s, owner) {
  const d = new Map();
  let q = s.territories.filter(t => t.owner === owner).map(t => t.id);
  q.forEach(id => d.set(id, 0));
  while (q.length) {
    const n = [];
    for (const id of q) for (const m of neighbors(s, id)) if (!d.has(m)) { d.set(m, d.get(id) + 1); n.push(m); }
    q = n;
  }
  return d;
}
for (const p of PLANETS) {
  const s = createBattle(p.id, playerLoadout(newCampaign()), {});
  const start = owner => s.territories.filter(t => t.owner === owner).reduce((a, t) => a + growthRate(s, t), 0);
  const p0 = start(1), e0 = start(2);
  const d1 = hops(s, 1), d2 = hops(s, 2);
  for (const t of s.territories) if (t.owner === 0) t.owner = d1.get(t.id) < d2.get(t.id) ? 1 : d1.get(t.id) > d2.get(t.id) ? 2 : 0;
  const bonus = { 1: resourceBonus(s, 1), 2: resourceBonus(s, 2) };
  const prod = owner => s.territories.filter(t => t.owner === owner).reduce((a, t) => a + growthRate(s, t, bonus), 0);
  const cnt = owner => s.territories.filter(t => t.owner === owner).length;
  console.log(p.id.padEnd(9), `start P ${p0.toFixed(2)} E ${e0.toFixed(2)} | split P ${prod(1).toFixed(2)}(${cnt(1)}) E ${prod(2).toFixed(2)}(${cnt(2)}) ratio ${(prod(2) / prod(1)).toFixed(2)}`);
}
