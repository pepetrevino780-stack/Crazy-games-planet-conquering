import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, AI_PROFILES, TYPE_INFO, getPlanet } from '../js/campaign.js';
import {
  createBattle, step, advance, playerLaunch, useAbility, sendTroops, serialize, deserialize,
  battleResult, analyzeDefeat,
} from '../js/game.js';
import {
  newCampaign, normalizeCampaign, loadCampaign, saveCampaign, playerLoadout, computeRewards,
  applyVictory, applyDefeat, assistLevel, buyUpgrade, unlockCiv, isUnlocked, SAVE_KEY,
} from '../js/progression.js';
import {
  terr, neighbors, isShielded, isPowered, defMult, enemyFronts, eventPhase, networkStatus, playerVision,
} from '../js/rules.js';

const loadout = (mut = c => c) => playerLoadout(mut(newCampaign()));
const battle = (id, opts = {}) => createBattle(id, loadout(), { seed: 7, ...opts });
const own = (s, ...ids) => ids.forEach(id => { terr(s, id).owner = 1; });
const freezeEnemy = s => { s.factions[2].profile = null; };

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

// ---------- 1. Distinct planets, themes and mechanics ----------

test('five planets with distinct themes, lessons and enemies', () => {
  assert.equal(PLANETS.length, 5);
  assert.deepEqual(PLANETS.map(p => p.id), ['vulkara', 'cryonis', 'mycelion', 'xythera', 'noctyra']);
  for (const key of ['lesson', 'name']) assert.equal(new Set(PLANETS.map(p => p[key])).size, 5);
  assert.equal(new Set(PLANETS.map(p => p.theme.bg2)).size, 5);
  assert.equal(new Set(PLANETS.map(p => p.events.type)).size, 5, 'each planet has its own planetary event');
  assert.equal(new Set(PLANETS.map(p => p.enemy.profile)).size, 5, 'each planet has its own NPC behaviour');
});

test('maps are valid, connected graphs with a capital on each side', () => {
  for (const p of PLANETS) {
    const s = battle(p.id);
    const ids = new Set(s.territories.map(t => t.id));
    assert.equal(ids.size, s.territories.length, `${p.id}: unique ids`);
    for (const [a, b] of p.lanes) assert.ok(ids.has(a) && ids.has(b), `${p.id}: lane ${a}-${b}`);
    for (const t of s.territories) assert.ok(TYPE_INFO[t.type], `${p.id}: type ${t.type}`);
    // Connectivity.
    const seen = new Set([s.territories[0].id]);
    const queue = [s.territories[0].id];
    while (queue.length) for (const n of neighbors(s, queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, ids.size, `${p.id}: connected`);
    assert.ok(s.territories.some(t => t.owner === 1 && t.type === 'capital'), `${p.id}: player capital`);
    assert.ok(s.territories.some(t => t.owner === 2), `${p.id}: enemy present`);
    for (const c of p.victory.conds) for (const id of c.ids || []) assert.ok(ids.has(id), `${p.id}: victory ref ${id}`);
    for (const o of p.objectives) {
      for (const id of [...(o.ids || []), ...(o.highlight || [])]) assert.ok(ids.has(id), `${p.id}: objective ref ${id}`);
      assert.ok(o.tip && o.tip.length < 200, `${p.id}: objective ${o.id} has a concise tip`);
    }
  }
});

test('each planet introduces its signature mechanic, and earlier mechanics recur later', () => {
  const types = id => new Set(getPlanet(id).nodes.map(n => n[3]));
  assert.ok(types('vulkara').has('vent'));
  assert.ok(types('cryonis').has('fortress') && types('cryonis').has('crystal'));
  assert.ok(getPlanet('cryonis').lanes.some(l => l[2] === 'ice'));
  assert.ok(types('mycelion').has('hub'));
  assert.ok(types('xythera').has('relay') && types('xythera').has('turret') && types('xythera').has('factory'));
  assert.ok(types('noctyra').has('command') && types('noctyra').has('citadel'));
  // Noctyra combines everything taught before.
  for (const t of ['fortress', 'crystal', 'hub', 'relay', 'turret', 'factory']) assert.ok(types('noctyra').has(t), `noctyra reuses ${t}`);
});

// ---------- 2. NPCs get smarter, not just bigger ----------

test('NPC behaviour becomes more capable across the campaign', () => {
  const profiles = PLANETS.map(p => AI_PROFILES[p.enemy.profile]);
  for (let i = 1; i < profiles.length; i++) {
    assert.ok(profiles[i].interval < profiles[i - 1].interval, `planet ${i + 1} NPCs think faster`);
    assert.ok(profiles[i].noise <= profiles[i - 1].noise, `planet ${i + 1} NPCs target more precisely`);
    assert.ok(profiles[i].idleChance <= profiles[i - 1].idleChance);
  }
  assert.ok(!profiles[0].defend && profiles[1].defend, 'Cryonis introduces defensive NPCs');
  assert.ok(profiles[4].objectiveSense >= profiles[2].objectiveSense);
  // Difficulty is not bought with troop inflation: no enemy outproduces or
  // outfights the player's base stats.
  for (const p of PLANETS) {
    assert.ok(p.enemy.growth <= 1 && p.enemy.atk <= 1 && p.enemy.def <= 1, `${p.id}: no stat cheating`);
  }
});

test('difficulty setting and adaptive assist slow NPCs without changing armies', () => {
  const base = battle('cryonis');
  const cadet = battle('cryonis', { difficulty: 'cadet' });
  const assisted = battle('cryonis', { assist: 3 });
  assert.ok(cadet.factions[2].profile.interval > base.factions[2].profile.interval);
  assert.ok(assisted.factions[2].profile.interval > base.factions[2].profile.interval);
  const troops = s => s.territories.filter(t => t.owner === 2).reduce((a, t) => a + t.troops, 0);
  assert.equal(troops(cadet), troops(base));
  assert.equal(troops(assisted), troops(base));
});

// Bot-vs-bot sanity checks on the learning curve: a careless commander only
// manages the tutorial world, a strong upgraded commander can finish them all.
function botRun(planetId, profile, tier, seed) {
  const camp = newCampaign();
  for (const id of ['reserves', 'production', 'fortify', 'income']) camp.upgrades[id] = tier;
  const s = createBattle(planetId, playerLoadout(camp), { seed, playerProfile: profile });
  advance(s, 600);
  return s.status;
}

test('a careless commander cannot win the later planets', () => {
  for (const id of ['cryonis', 'mycelion', 'xythera', 'noctyra']) {
    for (const seed of [1, 2]) assert.equal(botRun(id, 'passive', 0, seed), 'lost', `${id} seed ${seed}`);
  }
});

test('every planet is winnable by a capable, upgraded commander', () => {
  for (const p of PLANETS) {
    const wins = [1, 2, 3].filter(seed => botRun(p.id, 'mastermind', 2, seed) === 'won').length;
    assert.ok(wins >= 2, `${p.id}: won ${wins}/3`);
  }
});

// ---------- 3. Victory conditions ----------

test('every planet has a working victory condition', () => {
  const winning = {
    vulkara: ['ecap'], cryonis: ['ecap'], mycelion: ['heart'], xythera: ['core', 'f1', 'f2'], noctyra: ['cit'],
  };
  for (const p of PLANETS) {
    const s = battle(p.id);
    own(s, ...winning[p.id]);
    step(s);
    assert.equal(s.status, 'won', p.id);
  }
});

test('Cryonis can also be won by holding both crystals long enough', () => {
  const s = battle('cryonis');
  freezeEnemy(s);
  own(s, 'c1', 'c2');
  advance(s, 100);
  assert.equal(s.status, 'playing');
  terr(s, 'c2').owner = 0; // losing a crystal pauses the timer
  advance(s, 30);
  assert.equal(s.status, 'playing');
  terr(s, 'c2').owner = 1;
  advance(s, 52);
  assert.equal(s.status, 'won');
});

test('Xythera requires both the Core Foundry and two factories', () => {
  const s = battle('xythera');
  own(s, 'core');
  step(s);
  assert.equal(s.status, 'playing');
  own(s, 'f1', 'f3');
  step(s);
  assert.equal(s.status, 'won');
});

test('losing the capital is a defeat, with an actionable explanation', () => {
  const s = battle('vulkara');
  terr(s, 'p0').troops = 2;
  s.fleets.push({ id: 99, owner: 2, from: 'n1', to: 'p0', troops: 20, x0: 0, y0: 0, x1: 1, y1: 0, dist: 1, pos: 1, speed: 1, frost: false });
  step(s);
  assert.equal(s.status, 'lost');
  const tips = analyzeDefeat(s);
  assert.ok(tips.length >= 1);
  assert.match(tips[0], /capital/i);
});

// ---------- 4. Planet mechanics ----------

test('combat: attack ratio and fortification decide battles', () => {
  const s = battle('cryonis');
  freezeEnemy(s);
  terr(s, 'f1').troops = 60;
  terr(s, 'n3').troops = 22; // fortified neutral gate: 22 x 1.8 = 39.6
  playerLaunch(s, ['f1'], 'n3', 0.5); // 30 troops: not enough
  advance(s, 4);
  assert.equal(terr(s, 'n3').owner, 0);
  assert.equal(s.stats.failedFortified, 1);
  terr(s, 'f1').troops = 80;
  playerLaunch(s, ['f1'], 'n3', 1);
  advance(s, 4);
  assert.equal(terr(s, 'n3').owner, 1);
});

test('launching only works along lanes', () => {
  const s = battle('vulkara');
  assert.equal(playerLaunch(s, ['p0'], 'n8', 0.5).reason, 'notAdjacent');
  assert.ok(playerLaunch(s, ['p0'], 'n1', 0.5).ok);
});

test('Cryonis whiteouts slow fleets and cost troops in transit', () => {
  const s = battle('cryonis');
  freezeEnemy(s);
  while (!eventPhase(s).active) step(s);
  const f = sendTroops(s, 'p0', 'n1', 20, 1);
  assert.ok(f.frost);
  terr(s, 'n1').troops = 0;
  advance(s, 10);
  assert.ok(s.stats.frostLoss >= 4.9, `frost loss ${s.stats.frostLoss}`);
});

test('Mycelion: hubs nourish regions, shield the Brood Heart, and cutting them starves the network', () => {
  const s = battle('mycelion');
  const heart = terr(s, 'heart');
  assert.ok(isShielded(s, heart));
  assert.equal(networkStatus(s, terr(s, 'm3')), 'nourished');
  own(s, 'n2');
  terr(s, 'm3').owner = 1;
  terr(s, 'm3').troops = 50;
  assert.equal(playerLaunch(s, ['m3'], 'heart', 1).reason, 'shielded');
  terr(s, 'm3').owner = 2;
  own(s, 'h2');
  assert.equal(networkStatus(s, terr(s, 'b1')), 'withered', 'regions cut from their hub wither');
  assert.ok(isShielded(s, heart), 'still shielded while other hubs stand');
  own(s, 'h1', 'h3');
  assert.ok(!isShielded(s, heart));
});

test('Xythera: relays power defenses; capturing one disables every defense it feeds', () => {
  const s = battle('xythera');
  for (const id of ['t1', 't2', 't3', 't4']) assert.ok(isPowered(s, terr(s, id)), id);
  const before = defMult(s, terr(s, 't1'));
  own(s, 'r2');
  assert.ok(!isPowered(s, terr(s, 't1')) && !isPowered(s, terr(s, 't3')));
  assert.ok(isPowered(s, terr(s, 't2')));
  assert.ok(defMult(s, terr(s, 't1')) < before);
});

test('Xythera: powered defenses shoot fleets passing in range', () => {
  const s = battle('xythera');
  freezeEnemy(s);
  own(s, 'n3');
  terr(s, 'n3').troops = 60;
  playerLaunch(s, ['n3'], 't1', 0.5);
  advance(s, 2);
  assert.ok(s.stats.turretLoss > 0);
});

test('Noctyra: command nodes drive enemy fronts and the eclipse strips fortifications', () => {
  const s = battle('noctyra');
  assert.equal(enemyFronts(s, 2), 3);
  own(s, 'cn2');
  assert.equal(enemyFronts(s, 2), 2);
  const cit = terr(s, 'cit');
  const normal = defMult(s, cit);
  freezeEnemy(s);
  while (!eventPhase(s).active) step(s);
  assert.ok(defMult(s, cit) < normal / 2, 'citadel defense collapses during the eclipse');
});

test('Noctyra supply cap limits total troops', () => {
  const s = battle('noctyra');
  freezeEnemy(s);
  advance(s, 240);
  const total = s.territories.filter(t => t.owner === 1).reduce((a, t) => a + t.troops, 0);
  const cap = getPlanet('noctyra').supplyCap;
  assert.ok(total <= cap.base + cap.perTerritory * 4 + 5, `total ${total}`);
});

test('tutorial objectives complete from play', () => {
  const s = battle('vulkara');
  freezeEnemy(s);
  playerLaunch(s, ['p0'], 'n1', 0.75);
  advance(s, 5);
  assert.ok(s.objectivesDone.includes('v1'));
  assert.ok(s.objectivesDone.includes('v2'));
});

test('abilities: strike, rally and EMP', () => {
  const s = createBattle('xythera', loadout(c => { c.upgrades.strike = 1; c.upgrades.rally = 1; c.upgrades.emp = 1; return c; }), { seed: 3 });
  const t1 = terr(s, 't1');
  assert.ok(useAbility(s, 'emp', 't1').ok);
  assert.ok(!isPowered(s, t1));
  assert.equal(useAbility(s, 'emp', 't2').reason, 'notReady', 'cooldown');
  const before = terr(s, 'core').troops;
  assert.ok(useAbility(s, 'strike', 'core').ok);
  assert.ok(terr(s, 'core').troops < before);
  assert.ok(useAbility(s, 'rally', 'p0').ok);
  const locked = battle('xythera');
  assert.equal(useAbility(locked, 'strike', 'core').reason, 'notReady', 'abilities need the upgrade');
});

test('scouting upgrade widens vision', () => {
  const s0 = battle('noctyra');
  const s2 = createBattle('noctyra', loadout(c => { c.upgrades.scouting = 2; return c; }), { seed: 7 });
  assert.ok(!playerVision(s0).has('cit'));
  assert.ok(playerVision(s2).has('cit'));
});

// ---------- 5. Rewards and permanent upgrades ----------

test('upgrades carry into battles', () => {
  const plain = battle('vulkara');
  const upgraded = createBattle('vulkara', loadout(c => { c.upgrades.reserves = 2; c.upgrades.production = 3; c.upgrades.fortify = 1; return c; }), { seed: 7 });
  assert.equal(terr(upgraded, 'p0').troops, terr(plain, 'p0').troops + 20);
  assert.ok(upgraded.factions[1].growth > plain.factions[1].growth);
  assert.ok(defMult(upgraded, terr(upgraded, 'p0')) > defMult(plain, terr(plain, 'p0')));
});

test('rewards: first clear pays in full, objectives pay once, replays pay less', () => {
  const c = newCampaign();
  const p = getPlanet('vulkara');
  const result = { time: 200, objectivesDone: ['v1', 'v2'], capitalThreatened: false };
  const r1 = computeRewards(c, p, result);
  assert.equal(r1.total, 30 + 5 + 5 + 6 + 5);
  applyVictory(c, p, result, r1);
  assert.equal(c.cores, r1.total);
  assert.ok(c.planets.vulkara.completed);
  assert.ok(isUnlocked(c, 1) && !isUnlocked(c, 2));
  const r2 = computeRewards(c, p, { ...result, time: 999 });
  assert.equal(r2.total, 9 + 5);
});

test('buying upgrades and civilizations spends cores', () => {
  const c = newCampaign();
  assert.equal(buyUpgrade(c, 'production'), false);
  c.cores = 100;
  assert.ok(buyUpgrade(c, 'production'));
  assert.equal(c.cores, 75);
  assert.equal(c.upgrades.production, 1);
  assert.ok(unlockCiv(c, 'kryll'));
  assert.equal(c.cores, 35);
  c.civ = 'kryll';
  assert.ok(playerLoadout(c).growth > playerLoadout(newCampaign()).growth);
});

test('adaptive assist grows with defeats and ends once the planet is conquered', () => {
  const c = newCampaign();
  const p = getPlanet('mycelion');
  for (let i = 0; i < 5; i++) applyDefeat(c, p);
  assert.equal(assistLevel(c, 'mycelion'), 3);
  c.planets.mycelion.completed = true;
  assert.equal(assistLevel(c, 'mycelion'), 0);
});

// ---------- 6. Save, close and resume ----------

test('campaign save survives a round trip through storage', () => {
  const store = memoryStorage();
  const c = newCampaign();
  c.cores = 42;
  c.upgrades.scouting = 2;
  c.planets.vulkara.completed = true;
  c.battle = serialize(battle('cryonis'));
  assert.ok(saveCampaign(store, c));
  const loaded = loadCampaign(store);
  assert.equal(loaded.cores, 42);
  assert.equal(loaded.upgrades.scouting, 2);
  assert.ok(loaded.planets.vulkara.completed);
  assert.equal(loaded.battle.planetId, 'cryonis');
});

test('corrupt or foreign saves fall back safely', () => {
  const store = memoryStorage();
  store.setItem(SAVE_KEY, '{not json');
  assert.equal(loadCampaign(store), null);
  const n = normalizeCampaign({ version: 1, cores: -5, upgrades: { production: 99 }, civ: 'vexari', civsUnlocked: ['hax'], planets: { vulkara: { completed: 'yes' } } });
  assert.equal(n.cores, 0);
  assert.equal(n.upgrades.production, 3);
  assert.equal(n.civ, 'terran');
  assert.equal(n.planets.vulkara.completed, true);
  assert.equal(normalizeCampaign({ version: 999 }).cores, 0);
  assert.equal(deserialize({ v: 1, planetId: 'nowhere', territories: [] }), null);
});

test('a battle resumed from a save continues exactly where it left off', () => {
  const a = battle('noctyra', { playerProfile: 'tactical' });
  advance(a, 30);
  const saved = JSON.parse(JSON.stringify(serialize(a)));
  const b = deserialize(saved);
  advance(a, 45);
  advance(b, 45);
  const snap = s => s.territories.map(t => `${t.id}:${t.owner}:${t.troops.toFixed(3)}`).join(',');
  assert.equal(snap(b), snap(a));
  assert.equal(b.status, a.status);
  assert.deepEqual(battleResult(b), battleResult(a));
});
