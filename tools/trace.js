// Prints empire sizes over time for one battle. Usage: node tools/trace.js planet profile tier seed
import { createBattle, advance } from '../js/sim/engine.js';
import { maxTroops } from '../js/sim/core.js';
import { newCampaign, playerLoadout } from '../js/progression.js';
const [planet = 'vulkara', profile = 'tactical', tier = '0', seed = '1'] = process.argv.slice(2);
const camp = newCampaign();
for (const id of ['reserves', 'production', 'fortify', 'income']) camp.upgrades[id] = Number(tier);
const s = createBattle(planet, playerLoadout(camp), { seed: Number(seed), playerProfile: profile === 'none' ? undefined : profile, autoSpawn: true });
for (let t = 30; t <= 900 && s.status === 'playing'; t += 30) {
  advance(s, 30);
  const row = s.factions.filter(f => f && f.alive).map(f => `${f.kind[0]}${f.id}:${f.tiles}t ${Math.round(f.troops)}/${maxTroops(s, f)}`).join('  ');
  console.log(String(Math.round(s.time)).padStart(4), row, '| atk', s.attacks.map(a => `${a.attacker}>${a.target}`).join(','));
}
console.log(s.status, s.stats);
