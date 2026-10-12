// Balance probe: an NPC brain plays the player side on every planet.
// Usage: node tools/balance.js [profile] [seeds] [upgradeTier]
import { PLANETS } from '../js/campaign.js';
import { createBattle, advance } from '../js/sim/engine.js';
import { newCampaign, playerLoadout } from '../js/progression.js';

const profile = process.argv[2] || 'tactical';
const seeds = Number(process.argv[3] || 4);
const tier = Number(process.argv[4] || 0);
const only = process.argv[5];
const camp = newCampaign();
for (const id of ['reserves', 'production', 'fortify', 'income']) camp.upgrades[id] = tier;
for (const p of PLANETS) {
  if (only && p.id !== only) continue;
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = Date.now();
    const s = createBattle(p.id, playerLoadout(camp), { seed, playerProfile: profile, autoSpawn: true });
    advance(s, 900);
    const me = s.factions[1];
    out.push(`${s.status[0]}${Math.round(s.time)}(${me.tiles}t/${s.objectivesDone.length}o ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  console.log(p.id.padEnd(9), out.join(' '));
}
