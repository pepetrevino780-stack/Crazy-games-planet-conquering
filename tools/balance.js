// Balance probe: an NPC brain plays the player side on every planet.
// Usage: node tools/balance.js [profile] [seeds]
import { PLANETS } from '../js/campaign.js';
import { createBattle, advance } from '../js/game.js';
import { newCampaign, playerLoadout } from '../js/progression.js';

const profile = process.argv[2] || 'tactical';
const seeds = Number(process.argv[3] || 6);
// Upgrade tier: 0 = none, 1 = one level of each economy/defense upgrade, 2 = two levels.
const tier = Number(process.argv[4] || 0);
const camp = newCampaign();
for (const id of ['reserves', 'production', 'fortify', 'income']) camp.upgrades[id] = tier;
for (const p of PLANETS) {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const s = createBattle(p.id, playerLoadout(camp), { seed, playerProfile: profile });
    advance(s, 900);
    const own = s.territories.filter(t => t.owner === 1).length;
    out.push(`${s.status[0]}${Math.round(s.time)}(${own}/${s.objectivesDone.length})`);
  }
  console.log(p.id.padEnd(9), out.join(' '));
}
