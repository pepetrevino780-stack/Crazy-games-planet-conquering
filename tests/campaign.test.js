import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, AI_PROFILES, skirmishConfig, getPlanet, TUTORIAL_LESSONS } from '../js/campaign.js';
import {
  createBattle, step, advance, spawnPlayer, canSpawnAt, playerAttack, playerBuild, playerDropship,
  playerResearch, useAbility, serialize, deserialize, battleResult, analyzeDefeat, PLAYER,
  tutorialStep, tutorialUnlocked, skipTutorial, rleEncode, rleDecode, playerRetreat,
} from '../js/sim/engine.js';
import {
  world, maxTroops, regen, borders, siteOwner, isShielded, isPowered, tileDefense, eventPhase, setOwner,
  countSites, attackFronts, config, income, upgradeCost, buildCost,
} from '../js/sim/core.js';
import { generateWorld, components } from '../js/world/generate.js';
import { requestAlliance, gift, betray, isAllied, relation, isTraitor } from '../js/sim/diplomacy.js';
import { planRoute } from '../js/sim/path.js';
import { tryExpedition, tryNavy } from '../js/sim/ai.js';
import { seaGrid, seaPath, nearestSeaCell, buildShip, advanceShips, SHIP_COST, SHIP_HP } from '../js/sim/ships.js';
import { coastalTiles, buildPreview } from '../js/sim/engine.js';
import { travelTime, expeditionPlan } from '../js/sim/engine.js';
import { connectedShare, growthMult, isConnected } from '../js/sim/core.js';
import { THEMES, THEME_IDS, isLand, T } from '../js/world/themes.js';
import {
  newCampaign, normalizeCampaign, loadCampaign, saveCampaign, playerLoadout, computeRewards,
  applyVictory, applyDefeat, assistLevel, buyUpgrade, unlockCiv, isUnlocked, nextWorld, shouldOfferTutorial, SAVE_KEY, starsFor, parTime,
  completeLesson, TUTORIAL_REWARD,
} from '../js/progression.js';

const loadout = (mut = c => c) => playerLoadout(mut(newCampaign()));
const battle = (id, opts = {}) => createBattle(id, loadout(), { seed: 7, autoSpawn: true, ...opts });
const enemyOf = s => s.factions.find(f => f && f.kind === 'enemy');
const site = (s, id) => s.sites.find(x => x.id === id);
const give = (s, x, y, owner) => setOwner(s, y * s.w + x, owner);
const freezeAI = s => s.factions.forEach(f => { if (f && f.id !== PLAYER) f.profile = null; });

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

// ---------- World generation ----------

test('worlds are deterministic, varied and geographically coherent', () => {
  for (const theme of THEME_IDS) {
    const a = generateWorld({ theme, seed: 99, width: 480, height: 300 });
    const b = generateWorld({ theme, seed: 99, width: 480, height: 300 });
    assert.deepEqual(a.terrain, b.terrain, `${theme}: same seed, same world`);
    const c = generateWorld({ theme, seed: 100, width: 480, height: 300 });
    assert.notDeepEqual(a.terrain, c.terrain, `${theme}: new seed, new world`);
    const share = a.landCount / (480 * 300);
    assert.ok(Math.abs(share - THEMES[theme].gen.land) < 0.08, `${theme}: land share ${share.toFixed(2)}`);
    // Earth-like: one big main continent, several smaller named ones, islands.
    const sizes = [...a.compSize].sort((x, y) => y - x);
    assert.ok(sizes[0] > a.landCount * 0.35, `${theme}: a big main continent (${(sizes[0] / a.landCount).toFixed(2)})`);
    assert.ok(a.continents.length >= 3, `${theme}: ${a.continents.length} continents`);
    assert.ok(a.continents.every(k => k.name && a.comp[k.y * a.w + k.x] === k.id), `${theme}: named, labelled on land`);
    assert.ok(sizes.length > a.continents.length + 3, `${theme}: has islands`);
    const kinds = new Set(a.terrain);
    for (const t of [T.DEEP, T.SHALLOW, T.PLAINS, T.MOUNTAIN]) assert.ok(kinds.has(t), `${theme}: has terrain ${t}`);
  }
});

test('rivers reach the sea and the map edge is ocean', () => {
  const w = generateWorld({ theme: 'mycelion', seed: 5, width: 300, height: 190 });
  for (let x = 0; x < w.w; x++) {
    assert.ok(!isLand(w.terrain[x]), 'top edge is water');
    assert.ok(!isLand(w.terrain[(w.h - 1) * w.w + x]), 'bottom edge is water');
  }
  assert.ok(w.terrain.includes(T.RIVER), 'has rivers');
  const comp = components(w.terrain, w.w, w.h);
  assert.equal(comp.size.reduce((s, n) => s + n, 0), w.landCount);
});

test('every planet and skirmish setup is fair and reachable', () => {
  const configs = [...PLANETS.map(p => p.id), ...THEME_IDS.map(t => ['skirmish', t])];
  for (const ref of configs) {
    const s = Array.isArray(ref) ? createBattle('skirmish', loadout(), { seed: 3, theme: ref[1], worldSeed: 42, autoSpawn: true }) : battle(ref);
    const w = world(s);
    const main = w.compSize.indexOf(Math.max(...w.compSize));
    const name = Array.isArray(ref) ? `skirmish-${ref[1]}` : ref;
    const cap = site(s, 'enemy-capital');
    const me = site(s, 'player-capital');
    assert.ok(cap && me, `${name}: both capitals exist`);
    assert.equal(w.comp[cap.y * s.w + cap.x], main, `${name}: enemy capital on the main continent`);
    assert.equal(w.comp[me.y * s.w + me.x], main, `${name}: player lands on the main continent`);
    assert.ok(Math.hypot(cap.x - me.x, cap.y - me.y) > 45, `${name}: capitals are far apart`);
    for (const st of s.sites) assert.ok(isLand(w.terrain[st.y * s.w + st.x]), `${name}: ${st.id} on land`);
    // Starting empires are comparable: no faction begins far bigger than the player.
    const myTiles = s.factions[PLAYER].tiles;
    for (const f of s.factions) if (f && f.id !== PLAYER) assert.ok(f.tiles < myTiles * 4, `${name}: ${f.name} start ${f.tiles} vs ${myTiles}`);
  }
});

// ---------- Engine ----------

test('spawn phase: choose a landing site, re-pick it, or auto-land', () => {
  const s = createBattle('vulkara', loadout(), { seed: 2 });
  assert.equal(s.status, 'spawn');
  const w = world(s);
  let spot = null;
  for (let i = 0; i < w.terrain.length && !spot; i++) { const x = i % s.w, y = Math.floor(i / s.w); if (canSpawnAt(s, x, y)) spot = { x, y }; }
  assert.ok(spawnPlayer(s, spot.x, spot.y));
  const tiles = s.factions[PLAYER].tiles;
  assert.ok(tiles > 50);
  assert.equal(s.status, 'spawn', 'still choosing');
  advance(s, 11);
  assert.equal(s.status, 'playing', 'timer lands you');
  assert.equal(s.factions[PLAYER].tiles >= tiles, true);
  const auto = createBattle('vulkara', loadout(), { seed: 2, spawnTime: 0.2 });
  advance(auto, 1);
  assert.equal(auto.status, 'playing');
  assert.ok(site(auto, 'player-capital'));
});

test('attacks advance the border tile by tile and spend troops', () => {
  const s = battle('vulkara');
  freezeAI(s);
  const me = s.factions[PLAYER];
  const before = me.tiles;
  assert.ok(borders(s, PLAYER, 0));
  let target = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && [i - 1, i + 1, i - s.w, i + s.w].some(j => s.owner[j] === PLAYER)) { target = i; break; }
  const k = config(s).scale ** 2;
  me.troops = 600 * k;
  const res = playerAttack(s, target, 0.5);
  assert.ok(res.ok);
  assert.ok(me.troops < 400 * k, 'troops left the pool');
  advance(s, 15);
  assert.ok(me.tiles > before + 100 * k, `expanded from ${before} to ${me.tiles}`);
  assert.equal(s.attacks.length, 0, 'attack ended when its troops ran out');
});

test('troop cap grows with land and regrowth slows near the cap', () => {
  const s = battle('vulkara');
  const f = s.factions[PLAYER];
  const cap0 = maxTroops(s, f);
  f.troops = cap0 * 0.4;
  const mid = regen(s, f);
  f.troops = cap0 * 0.98;
  assert.ok(regen(s, f) < mid / 5);
  for (let i = 0; i < 400; i++) if (s.owner[i + s.w * 100] === 0) setOwner(s, i + s.w * 100, PLAYER);
  assert.ok(maxTroops(s, f) > cap0);
});

test('mountains, rivers and fortifications make tiles dearer to take', () => {
  const s = battle('cryonis');
  const e = enemyOf(s);
  const cap = site(s, 'enemy-capital');
  const near = cap.y * s.w + cap.x + 2;
  const far = (() => { for (let i = 0; i < s.owner.length; i++) { if (s.owner[i] === e.id && Math.hypot(i % s.w - cap.x, Math.floor(i / s.w) - cap.y) > 8 && world(s).terrain[i] === T.PLAINS) return i; } return -1; })();
  assert.ok(far >= 0);
  assert.ok(tileDefense(s, near) > tileDefense(s, far), 'capital surroundings are fortified');
});

test('capturing a capital collapses that civilization', () => {
  const s = battle('vulkara');
  const e = enemyOf(s);
  const cap = site(s, 'enemy-capital');
  give(s, cap.x, cap.y, PLAYER);
  advance(s, 1);
  assert.equal(e.alive, false);
  assert.equal(e.tiles, 0);
  assert.equal(s.status, 'won');
});

test('losing your capital is a defeat with an explanation', () => {
  const s = battle('vulkara');
  const e = enemyOf(s);
  const cap = site(s, 'player-capital');
  give(s, cap.x, cap.y, e.id);
  advance(s, 1);
  assert.equal(s.status, 'lost');
  const tips = analyzeDefeat(s);
  assert.match(tips[0], /capital/);
});

test('every planet has a working victory condition', () => {
  for (const p of PLANETS) {
    const s = battle(p.id);
    const cap = site(s, 'enemy-capital');
    give(s, cap.x, cap.y, PLAYER);
    for (const c of p.victory.conds) {
      if (c.type === 'ownType') for (const x of s.sites.filter(q => q.type === c.site).slice(0, c.n)) give(s, x.x, x.y, PLAYER);
    }
    advance(s, 1);
    assert.equal(s.status, 'won', p.id);
  }
});

test('Cryonis can also be won by holding three crystals', () => {
  const s = battle('cryonis');
  freezeAI(s);
  const crystals = s.sites.filter(x => x.type === 'crystal');
  assert.ok(crystals.length >= 3);
  for (const c of crystals.slice(0, 3)) give(s, c.x, c.y, PLAYER);
  advance(s, 100);
  assert.equal(s.status, 'playing');
  advance(s, 55);
  assert.equal(s.status, 'won');
});

test('Mycelion: the Brood Heart is shielded until the Swarm loses every hub', () => {
  const s = battle('mycelion');
  const cap = site(s, 'enemy-capital');
  assert.ok(isShielded(s, cap));
  const hubs = s.sites.filter(x => x.type === 'hub');
  assert.equal(hubs.length, 3);
  const i = cap.y * s.w + cap.x;
  assert.equal(playerAttack(s, i, 0.5).reason, 'shielded');
  for (const h of hubs.slice(0, 2)) give(s, h.x, h.y, PLAYER);
  assert.ok(isShielded(s, cap), 'still shielded with one hub left');
  give(s, hubs[2].x, hubs[2].y, PLAYER);
  assert.ok(!isShielded(s, cap));
});

test('Xythera: relays power defenses that make nearby land costly', () => {
  const s = battle('xythera');
  const e = enemyOf(s);
  const turret = s.sites.find(x => x.type === 'turret');
  assert.ok(isPowered(s, turret));
  const i = turret.y * s.w + turret.x + 1;
  if (s.owner[i] !== e.id) give(s, turret.x + 1, turret.y, e.id);
  const guarded = tileDefense(s, i);
  for (const r of s.sites.filter(x => x.type === 'relay')) give(s, r.x, r.y, PLAYER);
  assert.ok(!isPowered(s, turret));
  assert.ok(tileDefense(s, i) < guarded / 2);
});

test('Noctyra: command nodes add fronts; the eclipse strips the Citadel', () => {
  const s = battle('noctyra');
  freezeAI(s);
  const e = enemyOf(s);
  const fronts = attackFronts(s, e);
  const node = s.sites.find(x => x.type === 'command');
  give(s, node.x, node.y, PLAYER);
  assert.equal(attackFronts(s, e), fronts - 1);
  const cit = site(s, 'enemy-capital');
  assert.equal(cit.type, 'citadel');
  const i = cit.y * s.w + cit.x + 1;
  const strong = tileDefense(s, i);
  while (!eventPhase(s).active) step(s);
  assert.ok(tileDefense(s, i) < strong / 2, 'eclipse weakens the Citadel');
});

test('buildings, research, dropships and abilities work and cost resources', () => {
  const s = createBattle('xythera', loadout(c => { c.upgrades.strike = 1; c.upgrades.rally = 1; c.upgrades.emp = 1; return c; }), { seed: 4, autoSpawn: true });
  freezeAI(s);
  const me = s.factions[PLAYER];
  me.minerals = 5000; me.energy = 200; me.exotic = 200;
  const cap = site(s, 'player-capital');
  // Find own flat tiles to build on.
  const spots = [];
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER && [T.PLAINS, T.WILD, T.HIGHLAND, T.RUINS].includes(world(s).terrain[i])) spots.push(i);
  const habitat = spots.find(i => playerBuild(s, 'habitat', i).ok);
  assert.ok(habitat !== undefined, 'built a habitat');
  assert.ok(me.minerals < 5000);
  assert.equal(playerResearch(s, 'swift').ok, true);
  assert.equal(playerResearch(s, 'swift').reason, 'done');
  // Expeditions need no Starport: any coastal border tile will do.
  let far = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && Math.hypot(i % s.w - cap.x, Math.floor(i / s.w) - cap.y) > 80) { far = i; break; }
  const mBefore = me.minerals;
  const exp = playerDropship(s, far, 0.1);
  assert.ok(exp.ok && exp.eta > 0, `expedition launched (${exp.reason})`);
  assert.equal(mBefore - me.minerals, 100);
  const e = enemyOf(s);
  const ecap = site(s, 'enemy-capital');
  let target = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === e.id && Math.hypot(i % s.w - ecap.x, Math.floor(i / s.w) - ecap.y) > 6) { target = i; break; }
  const tiles = e.tiles;
  assert.ok(useAbility(s, 'strike', target).ok);
  assert.ok(e.tiles < tiles, 'strike scorched enemy land');
  assert.equal(useAbility(s, 'strike', target).reason, 'cooldown');
  const relay = s.sites.find(x => x.type === 'relay');
  assert.ok(useAbility(s, 'emp', relay.y * s.w + relay.x).ok);
  assert.ok(s.sites.filter(x => x.type === 'turret').some(t => !isPowered(s, t)));
});

// ---------- Learning curve ----------

function botRun(id, profile, tier, seed) {
  const camp = newCampaign();
  for (const k of ['reserves', 'production', 'fortify', 'income']) camp.upgrades[k] = tier;
  const s = createBattle(id, playerLoadout(camp), { seed, playerProfile: profile, autoSpawn: true });
  advance(s, 900);
  return s.status;
}

test('NPC commanders get sharper across the campaign', () => {
  const p = PLANETS.map(x => AI_PROFILES[x.enemy.profile]);
  for (let i = 2; i < p.length; i++) assert.ok(p[i].interval <= p[i - 1].interval, `planet ${i + 1} thinks at least as fast`);
  assert.ok(p[4].objectiveSense >= p[1].objectiveSense);
  assert.ok(!p[0].retaliate && p[1].retaliate, 'Cryonis introduces retaliation');
  // No main civilization starts much bigger than the player's landing.
  for (const pl of PLANETS) assert.ok(pl.enemy.radius <= 10 && pl.enemy.troops <= 1300, pl.id);
});

test('a careless commander struggles after the tutorial world', () => {
  let losses = 0;
  for (const id of ['cryonis', 'mycelion', 'xythera', 'noctyra']) if (botRun(id, 'passive', 0, 2) !== 'won') losses++;
  assert.equal(losses, 4);
});

test('the tutorial world is winnable without upgrades', () => {
  const wins = [1, 2, 3].filter(seed => botRun('vulkara', 'tactical', 0, seed) === 'won').length;
  assert.ok(wins >= 2, `won ${wins}/3`);
});

// ---------- Progression and saving ----------

test('upgrades carry into battles', () => {
  const plain = battle('vulkara');
  const up = createBattle('vulkara', loadout(c => { c.upgrades.reserves = 2; c.upgrades.production = 3; return c; }), { seed: 7, autoSpawn: true });
  assert.equal(up.factions[PLAYER].troops, plain.factions[PLAYER].troops + 300 * config(up).scale ** 2);
  assert.ok(up.factions[PLAYER].growth > plain.factions[PLAYER].growth);
});

test('rewards: first clear pays in full, objectives once, replays less; skirmish pays a little', () => {
  const c = newCampaign();
  const p = getPlanet('vulkara');
  const result = { time: 300, objectivesDone: ['v1', 'v2'], capitalThreatened: false };
  const r1 = computeRewards(c, p, result);
  assert.equal(r1.total, 30 + 5 + 5 + 6 + 5);
  applyVictory(c, p, result, r1);
  assert.ok(c.planets.vulkara.completed && isUnlocked(c, 1) && isUnlocked(c, 2));
  assert.equal(computeRewards(c, p, { ...result, time: 9999 }).total, 9 + 5);
  const sk = skirmishConfig('noctyra', 5);
  const r3 = computeRewards(c, sk, { time: 9999, objectivesDone: [], capitalThreatened: true });
  assert.equal(r3.total, 15);
  applyVictory(c, sk, { time: 9999, objectivesDone: [] }, r3);
  applyDefeat(c, sk);
  assert.equal(assistLevel(c, 'skirmish'), 0);
});

test('buying upgrades and civilizations spends cores', () => {
  const c = newCampaign();
  assert.equal(buyUpgrade(c, 'production'), false);
  c.cores = 100;
  assert.ok(buyUpgrade(c, 'production'));
  assert.ok(unlockCiv(c, 'kryll'));
  assert.equal(c.cores, 35);
});

test('adaptive assist grows with defeats and slows enemy commanders', () => {
  const c = newCampaign();
  for (let i = 0; i < 5; i++) applyDefeat(c, getPlanet('mycelion'));
  assert.equal(assistLevel(c, 'mycelion'), 3);
  const base = battle('mycelion');
  const easy = battle('mycelion', { assist: 3 });
  assert.ok(enemyOf(easy).profile.interval > enemyOf(base).profile.interval);
});

test('settings survive normalisation and the player colour applies', () => {
  const n = normalizeCampaign({ version: 1, settings: { sound: false, simple: true, playerColor: '#4f7bff', tips: false } });
  assert.equal(n.settings.sound, false);
  assert.equal(n.settings.simple, true);
  assert.equal(playerLoadout(n).color, '#4f7bff');
  assert.equal(normalizeCampaign({ version: 1, settings: { playerColor: 'red; drop' } }).settings.playerColor, 'civ');
});

test('corrupt or foreign saves fall back safely', () => {
  const store = memoryStorage();
  store.setItem(SAVE_KEY, '{nope');
  assert.equal(loadCampaign(store), null);
  assert.equal(deserialize({ v: 1 }), null);
  assert.equal(deserialize({ v: 3, owner: 'AAAA', w: 10, h: 10, configId: 'vulkara', theme: 'vulkara', seed: 1 }), null);
  assert.equal(normalizeCampaign({ version: 1, battle: { v: 1, planetId: 'vulkara' } }).battle, null, 'old battle format dropped');
});

test('a battle saved mid-war resumes exactly where it left off', () => {
  const store = memoryStorage();
  const a = battle('noctyra', { playerProfile: 'tactical' });
  advance(a, 60);
  const c = newCampaign();
  c.battle = serialize(a);
  saveCampaign(store, c);
  const loaded = loadCampaign(store);
  const b = deserialize(loaded.battle);
  assert.ok(b);
  advance(a, 60);
  advance(b, 60);
  // Count differences rather than deep-comparing a million-tile array (whose diff alone can exhaust memory).
  let diff = 0;
  for (let i = 0; i < a.owner.length; i++) if (a.owner[i] !== b.owner[i]) diff++;
  assert.equal(diff, 0, 'same ownership after resuming');
  assert.deepEqual(b.factions.map(f => f && Math.round(f.troops)), a.factions.map(f => f && Math.round(f.troops)));
  assert.deepEqual(battleResult(b), battleResult(a));
  assert.ok(JSON.stringify(c).length < 200000, `save is compact (${JSON.stringify(c).length} bytes)`);
});

test('Vulkara training advances step by step, unlocks tools, and survives a save', () => {
  const s = battle('vulkara');
  freezeAI(s);
  advance(s, 0.5);
  assert.equal(tutorialStep(s).id, 'expand');
  assert.equal(tutorialUnlocked(s).size, 0, 'nothing unlocked at first');
  let target = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && [i - 1, i + 1, i - s.w, i + s.w].some(j => s.owner[j] === PLAYER)) { target = i; break; }
  assert.ok(playerAttack(s, target, 0.2).ok);
  advance(s, 0.5);
  assert.equal(tutorialStep(s).id, 'grow');
  advance(s, 30);
  if (s.factions[PLAYER].tiles >= 2250) assert.notEqual(tutorialStep(s).id, 'grow');
  s.tutorial = 3;
  assert.ok(tutorialUnlocked(s).has('habitat') && !tutorialUnlocked(s).has('energy'));
  const b = deserialize(serialize(s));
  assert.equal(tutorialStep(b).id, 'habitat', 'resuming continues the training');
  skipTutorial(b);
  assert.equal(tutorialStep(b), null);
  assert.equal(tutorialUnlocked(b), null, 'skipping unlocks everything');
  // Replays and other worlds have no training.
  assert.equal(tutorialStep(battle('vulkara', { tutorial: false })), null);
  assert.equal(tutorialStep(battle('cryonis')), null);
});

test('buildings stack: clicking your own building upgrades it up to level 3', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  me.minerals = 10000;
  const spots = [];
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER && [T.PLAINS, T.WILD, T.HIGHLAND, T.RUINS].includes(world(s).terrain[i])) spots.push(i);
  const at = spots.find(i => playerBuild(s, 'extractor', i).ok);
  assert.ok(at !== undefined);
  const b = s.buildings.find(x => x.type === 'extractor');
  const base = income(s, me).minerals;
  const cost = upgradeCost(b);
  assert.equal(cost, Math.round(250 * 1.6));
  const before = me.minerals;
  const up = playerBuild(s, 'extractor', at + 1);
  assert.ok(up.ok && up.upgraded && b.level === 2, 'clicking next to it upgraded it');
  assert.equal(before - me.minerals, cost);
  assert.equal(s.buildings.filter(x => x.type === 'extractor').length, 1, 'no second building');
  assert.ok(Math.abs(income(s, me).minerals - base - 4) < 1e-6, '+4 minerals/s per level');
  assert.ok(playerBuild(s, 'extractor', at).ok);
  assert.equal(playerBuild(s, 'extractor', at).reason, 'maxLevel');
  // Habitat levels count toward the 5-level cap; bastion radius grows.
  const hab = spots.find(i => playerBuild(s, 'habitat', i).ok);
  const m1 = maxTroops(s, me);
  playerBuild(s, 'habitat', hab);
  assert.ok(maxTroops(s, me) > m1);
  assert.ok(s.notices.some(n => n.kind === 'upgraded'));
  const restored = deserialize(serialize(s));
  assert.equal(restored.buildings.find(x => x.type === 'extractor').level, 3, 'levels survive a save');
});

test('results: land history, battle stats and stars', () => {
  const s = battle('vulkara', { playerProfile: 'mastermind' });
  advance(s, 60);
  assert.ok(s.history.length >= 12, `sampled every 5s (${s.history.length})`);
  assert.equal(s.history[0].length, s.factions.length);
  const r = battleResult(s);
  for (const k of ['peakTiles', 'battlesWon', 'defeated', 'repelled']) assert.ok(Number.isFinite(r[k]), k);
  const v = getPlanet('vulkara');
  const all = v.objectives.map(o => o.id);
  assert.equal(starsFor(v, { time: parTime(v) - 1, objectivesDone: all }).count, 3);
  assert.equal(starsFor(v, { time: parTime(v) + 1, objectivesDone: all }).count, 2);
  assert.equal(starsFor(v, { time: parTime(v) + 1, objectivesDone: [] }).count, 1);
  const c = newCampaign();
  applyVictory(c, v, { time: parTime(v) + 1, objectivesDone: all }, { total: 0 });
  applyVictory(c, v, { time: parTime(v) + 1, objectivesDone: [] }, { total: 0 });
  assert.equal(c.planets.vulkara.stars, 2, 'best stars are kept');
  assert.equal(normalizeCampaign(JSON.parse(JSON.stringify(c))).planets.vulkara.stars, 2);
  const old = deserialize({ ...serialize(s), history: undefined });
  assert.deepEqual(old.history, [], 'older saves gain an empty history');
});

test('planets field many nations with mixed personalities', () => {
  for (const id of ['cryonis', 'noctyra']) {
    const s = battle(id);
    const nations = s.factions.filter(f => f && f.kind === 'nation');
    assert.equal(nations.length, getPlanet(id).nations.count, `${id}: every nation placed`);
    assert.ok(new Set(nations.map(f => f.persona)).size >= 2, `${id}: mixed personalities`);
    assert.ok(nations.every(f => AI_PROFILES[f.persona] && f.profile), `${id}: personas map to profiles`);
  }
  assert.ok(battle('noctyra').factions.some(f => f && f.persona === 'opportunist'));
});

test('survivors come home, retreat costs a quarter, and over-cap troops linger', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const k = config(s).scale ** 2;
  let target = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && [i - 1, i + 1, i - s.w, i + s.w].some(j => s.owner[j] === PLAYER)) { target = i; break; }
  me.troops = 4000 * k;
  assert.ok(playerAttack(s, target, 0.5).ok);
  advance(s, 0.3);
  const a = s.attacks.find(x => x.attacker === PLAYER);
  const left = a.troops, before = me.troops;
  s.notices.length = 0;
  assert.ok(playerRetreat(s, 0).ok);
  assert.equal(s.attacks.filter(x => x.attacker === PLAYER).length, 0);
  assert.ok(Math.abs(me.troops - before - Math.round(left * 0.75)) <= 1, 'retreat returns 75%');
  const n = s.notices.find(x => x.kind === 'ended');
  assert.ok(n && n.retreat && n.returned > 0, 'the HUD hears how it ended');
  assert.equal(playerRetreat(s, 0).ok, false);
  // Above the cap, troops drift down slowly instead of being cut off.
  me.troops = maxTroops(s, me) * 1.5;
  advance(s, 1);
  assert.ok(me.troops > maxTroops(s, me) * 1.4, 'over-cap troops linger');
});

test('a clicked attack pushes a spearhead toward the click and can be re-aimed', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const k = config(s).scale ** 2;
  const before = new Uint8Array(s.owner);
  // Click a wilderness tile next to our border, far to one side of the capital.
  const cap = site(s, 'player-capital');
  let click = -1, bd = -1;
  for (let i = 0; i < s.owner.length; i++) {
    if (s.owner[i] !== 0 || !isLand(world(s).terrain[i]) || ![i - 1, i + 1, i - s.w, i + s.w].some(j => s.owner[j] === PLAYER)) continue;
    const d = Math.hypot(i % s.w - cap.x, Math.floor(i / s.w) - cap.y);
    if (d > bd) { bd = d; click = i; }
  }
  me.troops = 3000 * k;
  const res = playerAttack(s, click, 0.5);
  assert.ok(res.ok && res.aim, 'aim reported for the HUD');
  const a = s.attacks.find(x => x.attacker === PLAYER);
  assert.ok(Math.hypot(a.ox - click % s.w, a.oy - Math.floor(click / s.w)) <= 2, 'starts at the border tile nearest the click');
  advance(s, 2);
  // The new land hugs the line from the start point onward (a push, not a ring around the capital).
  const ux = a.fx - a.ox, uy = a.fy - a.oy;
  let n = 0, sideSum = 0;
  for (let i = 0; i < s.owner.length; i++) {
    if (before[i] === PLAYER || s.owner[i] !== PLAYER) continue;
    n++;
    const L = Math.hypot(ux, uy) || 1;
    sideSum += Math.abs((i % s.w - a.ox) * uy / L - (Math.floor(i / s.w) - a.oy) * ux / L);
  }
  assert.ok(n > 20, `took ground (${n})`);
  assert.ok(sideSum / n < 12 * config(s).scale, `stays narrow (mean side ${(sideSum / n).toFixed(1)})`);
  // Clicking elsewhere on the same front re-aims the same attack.
  const other = [...Array(s.owner.length).keys()].find(i => s.owner[i] === 0 && isLand(world(s).terrain[i]) && [i - 1, i + 1, i - s.w, i + s.w].some(j => s.owner[j] === PLAYER) && Math.hypot(i % s.w - a.fx, Math.floor(i / s.w) - a.fy) > 20);
  const re = playerAttack(s, other, 0.2);
  assert.ok(re.ok, `re-aim (${re.reason})`);
  assert.equal(s.attacks.filter(x => x.attacker === PLAYER).length, 1, 'still one attack');
  assert.equal(a.fx, other % s.w, 're-aimed at the new click');
});

test('diplomacy: gifts build trust, allies are off-limits, betrayal is remembered', () => {
  const s = battle('cryonis', { tutorial: false });
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const nations = s.factions.filter(f => f && f.kind === 'nation');
  const [a, b] = nations;
  const enemy = s.factions.find(f => f && f.kind === 'enemy');
  assert.equal(requestAlliance(s, enemy.id).reason, 'enemyRefuses');
  relation(s, a.id).trust = -30;
  assert.equal(requestAlliance(s, a.id).ok, false, 'distrustful nations refuse');
  me.minerals = 5000;
  for (let k = 0; k < 4; k++) gift(s, a.id, 'minerals', 500);
  assert.ok(requestAlliance(s, a.id).ok, 'gifts earned the alliance');
  assert.ok(isAllied(s, PLAYER, a.id) && isAllied(s, a.id, PLAYER));
  // Allies are off-limits for attacks.
  let tile = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === a.id) { tile = i; break; }
  assert.equal(playerAttack(s, tile, 0.2).reason, 'allied');
  // Betrayal: traitor mark, everyone else trusts you less.
  const before = relation(s, b.id).trust;
  assert.ok(betray(s, a.id).ok);
  assert.ok(isTraitor(s));
  assert.ok(relation(s, b.id).trust <= before - 25 + 1e-9);
  assert.equal(requestAlliance(s, b.id).reason, 'traitor');
});

test('skirmish modes: teams, free-for-all and fast build', () => {
  const t = createBattle('skirmish', loadout(), { seed: 2, theme: 'cryonis', worldSeed: 9, mode: 'teams', autoSpawn: true });
  const mates = t.factions.filter(f => f && f.kind === 'nation' && t.teams[f.id] === 1);
  const foes = t.factions.filter(f => f && f.kind === 'nation' && t.teams[f.id] === 2);
  assert.ok(mates.length && foes.length, 'nations split into two teams');
  assert.ok(isAllied(t, PLAYER, mates[0].id) && !isAllied(t, PLAYER, foes[0].id));
  assert.ok(isAllied(t, foes[0].id, t.factions.find(f => f && f.kind === 'enemy').id), 'the other team sides with the Dominion');
  assert.equal(betray(t, mates[0].id).reason, 'locked');
  const ffa = createBattle('skirmish', loadout(), { seed: 2, theme: 'cryonis', worldSeed: 9, mode: 'ffa', autoSpawn: true });
  assert.equal(config(ffa).victory.conds[0].type, 'capitals');
  const fast = createBattle('skirmish', loadout(), { seed: 2, theme: 'cryonis', worldSeed: 9, mode: 'fast', autoSpawn: true });
  const classic = createBattle('skirmish', loadout(), { seed: 2, theme: 'cryonis', worldSeed: 9, autoSpawn: true });
  assert.equal(buildCost(fast, PLAYER, 'habitat') * 2, buildCost(classic, PLAYER, 'habitat'));
  assert.equal(deserialize(serialize(fast)).mode, 'fast', 'the mode is saved');
});

test('a dropship turns back when its target changes hands', () => {
  const s = battle('cryonis', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const cap = site(s, 'player-capital');
  let tile = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && Math.hypot(i % s.w - cap.x, Math.floor(i / s.w) - cap.y) > 150) { tile = i; break; }
  const tx = tile % s.w, ty = Math.floor(tile / s.w);
  s.dropships.push({ id: 999, owner: PLAYER, troops: 500, x: cap.x, y: cap.y, tx, ty, px: cap.x, py: cap.y, targetOwner: 0, speed: 30 });
  const before = me.troops;
  advance(s, 1);
  setOwner(s, tile, s.factions.find(f => f && f.kind === 'nation').id);
  s.notices.length = 0;
  advance(s, 30);
  assert.equal(s.dropships.length, 0);
  assert.ok(me.troops >= before + 400, 'troops came home');
});

test('every tutorial lesson can be finished, and finishing all pays a bonus once', () => {
  const lesson = n => createBattle('tutorial', loadout(), { seed: 5, lesson: n, autoSpawn: n > 1 });
  const W = s => s.w;
  const borderTiles = (s, owner) => {
    const out = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === owner && isLand(world(s).terrain[i]) && [i - 1, i + 1, i - W(s), i + W(s)].some(j => s.owner[j] === PLAYER)) out.push(i);
    return out;
  };
  // Push toward a point until we border its owner (or 3 minutes pass).
  const reach = (s, x, y) => {
    for (let t = 0; t < 180; t += 2) {
      const o = s.owner[y * s.w + x];
      if (o !== 0 && borderTiles(s, o).length) return true;
      const wild = borderTiles(s, 0);
      if (!wild.length) return false;
      wild.sort((a, b) => Math.hypot(a % s.w - x, Math.floor(a / s.w) - y) - Math.hypot(b % s.w - x, Math.floor(b / s.w) - y));
      s.factions[PLAYER].troops = Math.max(s.factions[PLAYER].troops, 4000);
      playerAttack(s, wild[0], 0.6);
      advance(s, 2);
    }
    return false;
  };
  const done = [];
  for (const L of TUTORIAL_LESSONS) {
    const s = lesson(L.id);
    const me = s.factions[PLAYER];
    if (L.id === 1) {
      const w = world(s), main = w.compSize.indexOf(Math.max(...w.compSize));
      let ok = false;
      for (let i = 0; i < s.owner.length && !ok; i += 7) if (w.comp[i] === main && canSpawnAt(s, i % s.w, Math.floor(i / s.w))) ok = spawnPlayer(s, i % s.w, Math.floor(i / s.w));
      s.spawnLeft = 0.01; advance(s, 0.5);
      playerAttack(s, borderTiles(s, 0)[0], 0.6);
      for (let t = 0; t < 60 && s.status === 'playing'; t++) { const b = borderTiles(s, 0); if (b.length) playerAttack(s, b[t % b.length], 0.6); advance(s, 2); }
    } else if (L.id === 2) {
      advance(s, 0.5);
      const cap = site(s, 'player-capital');
      const far = borderTiles(s, 0).sort((a, b) => Math.hypot(b % s.w - cap.x, Math.floor(b / s.w) - cap.y) - Math.hypot(a % s.w - cap.x, Math.floor(a / s.w) - cap.y));
      // Click well beyond the border: aim at a wilderness tile ~20 tiles out.
      const t0 = far[0], fx = t0 % s.w, fy = Math.floor(t0 / s.w);
      let target = t0;
      for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(world(s).terrain[i]) && Math.abs(Math.hypot(i % s.w - fx, Math.floor(i / s.w) - fy) - 15) < 1) { target = i; break; }
      playerAttack(s, target, 0.3);
      advance(s, 60);
    } else if (L.id === 3) {
      advance(s, 0.5);
      const spots = [];
      for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER && [T.PLAINS, T.WILD, T.HIGHLAND, T.RUINS].includes(world(s).terrain[i])) spots.push(i);
      const h = spots.find(i => playerBuild(s, 'habitat', i).ok);
      playerBuild(s, 'habitat', h);
      spots.find(i => playerBuild(s, 'extractor', i).ok);
      advance(s, 1);
    } else if (L.id === 4) {
      advance(s, 0.5);
      const n = s.factions.find(f => f && f.kind === 'nation');
      const c = s.sites.find(x => x.faction === n.id);
      assert.ok(reach(s, c.x, c.y), 'lesson 4: can reach the neighbour');
      playerAttack(s, borderTiles(s, n.id)[0], 0.3);
      advance(s, 0.3);
      playerRetreat(s, n.id);
      advance(s, 1);
    } else if (L.id === 5) {
      advance(s, 0.5);
      me.minerals = 5000;
      const spots = [];
      for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER) spots.push(i);
      let port = spots.find(i => playerBuild(s, 'starport', i).ok);
      if (port === undefined) { const cap = site(s, 'player-capital'); reach(s, 0, cap.y); for (let i = 0; i < s.owner.length && port === undefined; i++) if (s.owner[i] === PLAYER && playerBuild(s, 'starport', i).ok) port = i; }
      assert.ok(port !== undefined, 'lesson 5: a starport fits');
      const w = world(s), main = w.comp[port];
      let target = -1;
      for (let i = 0; i < s.owner.length; i++) if (isLand(w.terrain[i]) && w.comp[i] !== main && s.owner[i] !== PLAYER) { target = i; break; }
      assert.ok(playerDropship(s, target, 0.2).ok, 'lesson 5: dropship across the sea');
      advance(s, 1);
    } else if (L.id === 6) {
      advance(s, 0.5);
      assert.ok(playerResearch(s, 'swift').ok);
      assert.ok(useAbility(s, 'rally', site(s, 'player-capital').y * s.w + site(s, 'player-capital').x).ok);
      advance(s, 1);
    } else {
      advance(s, 0.5);
      const c = site(s, 'enemy-capital');
      for (let t = 0; t < 150 && s.status === 'playing'; t++) {
        const tiles = borderTiles(s, s.owner[c.y * s.w + c.x]);
        if (tiles.length) { me.troops = Math.max(me.troops, 20000); playerAttack(s, c.y * s.w + c.x, 1); advance(s, 3); } else reach(s, c.x, c.y);
      }
    }
    assert.equal(s.status, 'won', `lesson ${L.id} (${L.name}) can be finished`);
    done.push(L.id);
  }
  const c = newCampaign();
  const cores = c.cores;
  for (const id of done.slice(0, -1)) assert.equal(completeLesson(c, id), 0);
  assert.equal(completeLesson(c, done[done.length - 1]), TUTORIAL_REWARD.cores, 'bonus for finishing all');
  assert.equal(completeLesson(c, 1), 0, 'paid only once');
  assert.equal(c.cores, cores + TUTORIAL_REWARD.cores);
  assert.deepEqual(normalizeCampaign(JSON.parse(JSON.stringify(c))).tutorial.done.sort(), [1, 2, 3, 4, 5, 6, 7]);
});

test('Vulkara training is shorter after the standalone tutorial', () => {
  const s = createBattle('vulkara', loadout(), { seed: 7, autoSpawn: true, tutorial: 'short' });
  advance(s, 0.5);
  assert.deepEqual(TUTORIAL_LESSONS.length, 7);
  assert.equal(tutorialStep(s).id, 'expand');
  assert.equal(tutorialUnlocked(s), null, 'nothing locked in the short version');
});

test('attack any land you click: the spearhead marches along a route to it', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const w = world(s);
  const cap = site(s, 'player-capital');
  const mainComp = w.comp[cap.y * s.w + cap.x];
  // A nation on our continent that we don't border.
  const nation = s.factions.find(f => f && f.kind === 'nation' && !borders(s, PLAYER, f.id) && (() => { const c = s.sites.find(x => x.faction === f.id); return c && w.comp[c.y * s.w + c.x] === mainComp; })());
  assert.ok(nation, 'found a distant nation');
  const c = s.sites.find(x => x.faction === nation.id);
  const goal = c.y * s.w + c.x;
  const route = planRoute(s, PLAYER, goal);
  assert.equal(route.kind, 'land');
  assert.equal(route.path[route.path.length - 1], goal, 'the route ends at the click');
  me.troops = 60000 * config(s).scale ** 2;
  const res = playerAttack(s, goal, 0.8);
  assert.ok(res.ok && res.route, `route attack launched (${res.reason})`);
  const a = s.attacks.find(x => x.attacker === PLAYER);
  assert.ok(a.path && a.path.length > 10, 'follows a path');
  const startTiles = me.tiles;
  advance(s, 20);
  assert.ok(me.tiles > startTiles + 30, 'took a corridor of land');
  // Progress along the route: the first stretch of it is ours now.
  const firstHalf = route.path.slice(0, Math.floor(route.path.length / 3));
  assert.ok(firstHalf.filter(i => s.owner[i] === PLAYER).length > firstHalf.length * 0.8, 'the first third of the route is ours');
  // Another continent: no land route.
  let island = -1;
  for (let i = 0; i < s.owner.length; i++) if (isLand(w.terrain[i]) && w.comp[i] !== mainComp && w.compSize[w.comp[i]] > 50) { island = i; break; }
  assert.equal(planRoute(s, PLAYER, island).kind, 'sea');
});

test('expeditions: launch from any coast, take time, land; Starports speed them up', () => {
  const s = battle('cryonis', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  me.minerals = 5000;
  const w = world(s);
  const cap = site(s, 'player-capital');
  const mainComp = w.comp[cap.y * s.w + cap.x];
  let goal = -1;
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === 0 && isLand(w.terrain[i]) && w.comp[i] !== mainComp && w.compSize[w.comp[i]] > 5000 && [T.PLAINS, T.WILD].includes(w.terrain[i])) { goal = i; break; }
  // Clicking land on another continent sends an expedition automatically.
  me.troops = 20000;
  const res = playerAttack(s, goal, 0.05);
  assert.ok(res.ok && res.expedition, `expedition (${res.reason})`);
  const plan = expeditionPlan(s, PLAYER, goal);
  assert.ok(Math.abs(plan.eta - travelTime(s, plan.x, plan.y, goal % s.w, Math.floor(goal / s.w), plan.bonus)) < 1e-9);
  // Sea is faster than land: 20 vs 14 tiles/s (x scale).
  const lin = config(s).scale;
  assert.ok(Math.abs(travelTime(s, 0, 0, 40, 0) - 40 / (20 * lin)) < 0.01, 'open sea at sea speed');
  const eta = res.eta;
  advance(s, eta * 0.5);
  assert.equal(s.dropships.length, 1, 'still under way halfway');
  advance(s, eta * 0.6 + 1);
  assert.equal(s.dropships.length, 0, 'arrived');
  assert.equal(s.owner[goal], PLAYER, 'landed and took the target');
  // The beachhead is cut off from the capital: half growth on that share.
  advance(s, 2);
  assert.ok(!isConnected(s, goal));
  const share = connectedShare(s, me);
  assert.ok(share < 1);
  // Reinforcing the beachhead sails the full way first.
  let near = -1;
  for (let i = 0; i < s.owner.length && near < 0; i++) {
    const d = Math.hypot(i % s.w - goal % s.w, Math.floor(i / s.w) - Math.floor(goal / s.w));
    if (s.owner[i] !== PLAYER && isLand(w.terrain[i]) && w.comp[i] === w.comp[goal] && d > 10 && d < 60) near = i;
  }
  assert.ok(near >= 0, 'found land near the beachhead');
  const r2 = playerAttack(s, near, 0.2);
  assert.ok(r2.ok && r2.reinforce && r2.eta > 1, `reinforcements travel (${JSON.stringify({ ok: r2.ok, reason: r2.reason, reinforce: r2.reinforce, exp: r2.expedition, eta: r2.eta })})`);
  // A Starport makes expeditions faster.
  const t0 = expeditionPlan(s, PLAYER, goal).eta;
  const port = s.factions && (() => { for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER && playerBuild(s, 'starport', i).ok) return i; return -1; })();
  if (port >= 0) assert.ok(expeditionPlan(s, PLAYER, goal).eta <= t0, 'a port never slows things down');
});

test('half growth on land cut off from the capital', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  const g0 = growthMult(s, me);
  // Hand the player a large enclave far away.
  const w = world(s);
  let n = 0;
  const t0 = me.tiles;
  for (let i = 0; i < s.owner.length && n < t0; i++) if (s.owner[i] === 0 && isLand(w.terrain[i]) && i % s.w > s.w * 0.8) { setOwner(s, i, PLAYER); n++; }
  advance(s, 1.1);
  const share = connectedShare(s, me);
  assert.ok(share > 0.4 && share < 0.6, `about half connected (${share.toFixed(2)})`);
  assert.ok(Math.abs(growthMult(s, me) - g0 * (0.5 + 0.5 * share)) < 1e-9);
});

test('tactical commanders send expeditions against weak, isolated civilizations', () => {
  const s = createBattle('xythera', loadout(), { seed: 3, autoSpawn: true });
  advance(s, 1);
  const enemy = s.factions.find(f => f && f.kind === 'enemy');
  const w = world(s);
  const capOf = id => s.sites.find(x => x.faction === id && (x.type === 'capital' || x.type === 'citadel'));
  const ec = capOf(enemy.id);
  const islander = s.factions.find(f => f && f.kind === 'nation' && capOf(f.id) && w.comp[capOf(f.id).y * s.w + capOf(f.id).x] !== w.comp[ec.y * s.w + ec.x]);
  assert.ok(islander, 'a nation lives on another continent');
  enemy.troops = 100000; enemy.minerals = 1000; islander.troops = 100;
  for (const f of s.factions) if (f && f !== islander && f !== enemy && f.id !== PLAYER) f.troops = 1e9; // only the islander is weak
  assert.ok(tryExpedition(s, enemy, () => 0), 'launched');
  assert.equal(s.dropships.length, 1);
  assert.equal(s.dropships[0].owner, enemy.id);
});

test('ownership maps round-trip through run-length encoding', () => {
  const a = new Uint8Array(100000);
  for (let i = 0; i < a.length; i++) a[i] = (i % 997 < 300 ? 1 : 0) + (i > 70000 ? 5 : 0);
  a[5] = 200; a[99999] = 3;
  const enc = rleEncode(a);
  assert.ok(enc.length < 2000);
  assert.deepEqual(rleDecode(enc, a.length), a);
  assert.throws(() => rleDecode(enc, a.length - 1));
});

test('config lookups resolve for campaign and skirmish states', () => {
  const s = createBattle('skirmish', loadout(), { seed: 1, theme: 'cryonis', worldSeed: 77, autoSpawn: true });
  assert.equal(config(s).skirmish, true);
  assert.equal(s.theme, 'cryonis');
  assert.ok(countSites(s, 'crystal', 0) >= 1);
  assert.ok(siteOwner(s, site(s, 'enemy-capital')) > 1);
});

// ---------- Battleships ----------

// A Cryonis battle with a player Starport on the coast (AI frozen).
function navalBattle() {
  const s = battle('cryonis', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  me.minerals = 5000; me.energy = 200;
  const coast = coastalTiles(s, PLAYER).find(i => nearestSeaCell(s, i % s.w, Math.floor(i / s.w), 6) >= 0);
  assert.ok(coast !== undefined, 'the player holds open coast');
  s.buildings.push({ id: s.nextId++, type: 'starport', x: coast % s.w, y: Math.floor(coast / s.w), level: 1 });
  return s;
}

const isSeaAt = (s, x, y) => { const g = seaGrid(s); return g.sea[Math.floor(y / 4) * g.cw + Math.floor(x / 4)] === 1; };

test('battleships: built at a Starport for minerals and energy, sail only by sea, survive a save', () => {
  const s0 = battle('cryonis', { tutorial: false });
  advance(s0, 0.5);
  s0.factions[PLAYER].minerals = 5000;
  assert.equal(buildShip(s0, PLAYER, 0).reason, 'noStarport');
  const s = navalBattle();
  const me = s.factions[PLAYER];
  // A far-away sea goal.
  const g = seaGrid(s);
  let goal = -1;
  for (let k = g.sea.length - 1; k >= 0 && goal < 0; k--) {
    if (!g.sea[k]) continue;
    const c = { x: (k % g.cw) * 4 + 2, y: Math.floor(k / g.cw) * 4 + 2 };
    if (seaPath(s, nearestSeaCell(s, s.buildings[0].x, s.buildings[0].y, 6), k)?.length > 20) goal = c.y * s.w + c.x;
  }
  assert.ok(goal >= 0, 'found a reachable far sea spot');
  const m0 = me.minerals, e0 = me.energy;
  const res = buildShip(s, PLAYER, goal);
  assert.ok(res.ok, res.reason);
  assert.equal(me.minerals, m0 - SHIP_COST.minerals);
  assert.ok(Math.abs(me.energy - (e0 - SHIP_COST.energy)) < 1e-9);
  const ship = res.ship;
  assert.equal(ship.hp, SHIP_HP);
  for (const k of ['id', 'owner', 'x', 'y', 'tx', 'ty', 'hp', 'cooldown']) assert.ok(k in ship, k);
  // Every waypoint is open sea, and the ship stays on water as it sails.
  for (const wp of ship.path) assert.ok(isSeaAt(s, wp.x, wp.y), 'waypoint at sea');
  const x0 = ship.x, y0 = ship.y;
  for (let t = 0; t < 20; t++) { advance(s, 0.25); if (s.ships[0]) assert.ok(isSeaAt(s, s.ships[0].x, s.ships[0].y), 'ship on water'); }
  assert.ok(Math.hypot(s.ships[0].x - x0, s.ships[0].y - y0) > 5, 'it moved');
  const back = deserialize(JSON.parse(JSON.stringify(serialize(s))));
  assert.deepEqual(back.ships, s.ships);
  assert.ok(Array.isArray(deserialize({ ...JSON.parse(JSON.stringify(serialize(s))), ships: undefined }).ships), 'old saves get an empty fleet');
});

test('battleships bombard enemy coast, fight ships, cut expeditions and sink at 0 hp', () => {
  const s = navalBattle();
  // An enemy-held coastal tile with sea next to it.
  let coast = -1, foe = 0;
  for (const f of s.factions) {
    if (!f || f.id === PLAYER || !f.alive) continue;
    const c = coastalTiles(s, f.id).find(i => nearestSeaCell(s, i % s.w, Math.floor(i / s.w), 2) >= 0);
    if (c !== undefined) { coast = c; foe = f.id; break; }
  }
  assert.ok(coast >= 0, 'found enemy coast');
  const cell = nearestSeaCell(s, coast % s.w, Math.floor(coast / s.w), 2);
  const g = seaGrid(s);
  const at = { x: (cell % g.cw) * 4 + 2, y: Math.floor(cell / g.cw) * 4 + 2 };
  const ship = { id: s.nextId++, owner: PLAYER, x: at.x, y: at.y, tx: at.x, ty: at.y, hp: SHIP_HP, cooldown: 0, path: [] };
  s.ships.push(ship);
  const before = s.factions.map(f => (f ? f.tiles + f.troops : 0));
  advanceShips(s, 0.01);
  const shell = s.notices.find(n => n.kind === 'shell' && n.owner === PLAYER);
  assert.ok(shell, 'a volley was fired');
  const hit = s.factions[shell.target];
  assert.ok(hit.tiles + hit.troops < before[shell.target], 'the coast lost land or troops');
  assert.ok(ship.cooldown > 1, 'then it reloads');

  // A passing enemy expedition loses troops.
  ship.cooldown = 0;
  s.dropships.push({ id: s.nextId++, owner: foe, troops: 1000, x: at.x + 2, y: at.y, tx: 0, ty: 0, px: 0, py: 0, targetOwner: 0, bonus: 1, eta: 30 });
  advanceShips(s, 0.01);
  assert.equal(s.dropships.at(-1).troops, 800, 'expedition cut by a fifth');

  // Ship against ship: enemy ships are shot first; at 0 hp one sinks.
  ship.cooldown = 0;
  const enemyShip = { id: s.nextId++, owner: foe, x: at.x + 1, y: at.y, tx: at.x + 1, ty: at.y, hp: 25, cooldown: 99, path: [] };
  s.ships.push(enemyShip);
  advanceShips(s, 0.01);
  assert.ok(!s.ships.includes(enemyShip), 'the enemy ship sank');
  assert.ok(s.notices.some(n => n.kind === 'sunk' && n.owner === foe));
  assert.equal(ship.hp, SHIP_HP, 'ours is untouched');
});

test('enemy commanders on Xythera and Noctyra build a navy; other worlds do not', () => {
  assert.ok(getPlanet('xythera').aiShips && getPlanet('noctyra').aiShips);
  assert.ok(!getPlanet('vulkara').aiShips && !getPlanet('mycelion').aiShips);
  for (const id of ['xythera', 'noctyra']) {
    const s = battle(id, { tutorial: false });
    advance(s, 1);
    const e = enemyOf(s);
    // Give the enemy a stretch of coast and plenty to spend.
    const coast = coastalTiles(s, PLAYER).find(i => nearestSeaCell(s, i % s.w, Math.floor(i / s.w), 6) >= 0)
      ?? (() => { for (let i = 0; i < s.owner.length; i++) if (isLand(world(s).terrain[i]) && nearestSeaCell(s, i % s.w, Math.floor(i / s.w), 1) >= 0 && s.owner[i] === 0) return i; return -1; })();
    if (coastalTiles(s, e.id).length === 0) setOwner(s, coast, e.id);
    let r = 0;
    const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 40 && !s.ships.some(x => x.owner === e.id); k++) { e.minerals = 5000; e.energy = 200; tryNavy(s, e.id, rand); }
    assert.ok(s.buildings.some(b => b.type === 'starport' && s.owner[b.y * s.w + b.x] === e.id), `${id}: enemy Starport`);
    assert.ok(s.ships.some(x => x.owner === e.id), `${id}: enemy battleship`);
  }
  const v = battle('vulkara', { tutorial: false });
  advance(v, 1);
  const e = enemyOf(v);
  e.minerals = 5000; e.energy = 200;
  assert.equal(tryNavy(v, e.id, () => 0.1), false);
});

// ---------- Drag-and-drop building ----------

test('drag-and-drop preview: green where a building fits, red with a reason, upgrade on own building', () => {
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const me = s.factions[PLAYER];
  me.minerals = 10000;
  const w = world(s);
  const spots = [];
  for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === PLAYER && [T.PLAINS, T.WILD, T.HIGHLAND, T.RUINS].includes(w.terrain[i])) spots.push(i);
  const ok = spots.find(i => buildPreview(s, 'habitat', i).ok);
  assert.ok(ok !== undefined, 'some own flat land accepts a Habitat');
  const p = buildPreview(s, 'habitat', ok);
  assert.equal(p.upgrade, false);
  assert.equal(p.cost, buildCost(s, PLAYER, 'habitat'));
  // The preview agrees with what dropping actually does.
  for (const i of spots.slice(0, 400)) {
    const pr = buildPreview(s, 'extractor', i);
    const before = JSON.stringify(s.buildings);
    const res = playerBuild(s, 'extractor', i);
    assert.equal(res.ok, pr.ok, `tile ${i}: preview ${pr.reason} vs drop ${res.reason}`);
    if (!res.ok) { assert.equal(res.reason, pr.reason); assert.equal(JSON.stringify(s.buildings), before); }
    if (res.ok && res.upgraded) break;
  }
  // Wilderness and other people's land are red, with the reason.
  const wild = s.owner.findIndex((o, i) => o === 0 && isLand(w.terrain[i]));
  assert.deepEqual([buildPreview(s, 'habitat', wild).ok, buildPreview(s, 'habitat', wild).reason], [false, 'terrain']);
  // Over our own Habitat: "Upgrade to level 2", then 3, then max.
  const spot = spots.find(i => buildPreview(s, 'habitat', i).ok);
  assert.ok(playerBuild(s, 'habitat', spot).ok);
  const hab = s.buildings.find(b => b.type === 'habitat');
  const up = buildPreview(s, 'habitat', hab.y * s.w + hab.x);
  assert.ok(up.ok && up.upgrade && up.level === 2 && up.x === hab.x && up.y === hab.y);
  assert.equal(up.cost, upgradeCost(hab, s));
  playerBuild(s, 'habitat', hab.y * s.w + hab.x);
  assert.equal(buildPreview(s, 'habitat', hab.y * s.w + hab.x).level, 3);
  playerBuild(s, 'habitat', hab.y * s.w + hab.x);
  assert.equal(buildPreview(s, 'habitat', hab.y * s.w + hab.x).reason, 'maxLevel');
  // A different type over it is just crowded.
  assert.equal(buildPreview(s, 'bastion', hab.y * s.w + hab.x).reason, 'crowded');
  // Not enough minerals: red.
  me.minerals = 0;
  const poor = spots.find(i => buildPreview(s, 'spire', i).reason === 'minerals');
  assert.ok(poor !== undefined, 'shows when you cannot afford it');
});

test('training text teaches dragging buildings', () => {
  const vul = getPlanet('vulkara');
  const steps = JSON.stringify(vul.tutorial) + JSON.stringify(TUTORIAL_LESSONS);
  assert.ok(!/Press 1 or tap Habitat/.test(steps));
  assert.ok(/Drag a Habitat onto your land/.test(steps));
});

// ---------- Battle animations ----------

test('battle effects: soldiers and flashes on visible fronts only, capped at 600, sound limited', async () => {
  const { spawnBattleFx, rateLimiter, pushCapped, MAX_PARTICLES } = await import('../js/battlefx.js');
  // Sound: at most 4 cracks in any second.
  const ok = rateLimiter(4);
  let n = 0;
  for (let t = 0; t < 1000; t += 10) if (ok(t)) n++;
  assert.equal(n, 4);
  assert.ok(ok(1200), 'allowed again a second later');
  const capped = [];
  for (let k = 0; k < 900; k++) pushCapped(capped, { k });
  assert.equal(capped.length, MAX_PARTICLES);

  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  s.factions[PLAYER].troops = 50000;
  const w = world(s);
  const edge = borders(s, PLAYER, 0) ? [...Array(s.owner.length).keys()].find(i => s.owner[i] === 0 && isLand(w.terrain[i]) && [1, -1, s.w, -s.w].some(d => s.owner[i + d] === PLAYER)) : -1;
  assert.ok(playerAttack(s, edge, 0.5).ok);
  advance(s, 0.3);
  const all = { x0: 0, y0: 0, x1: s.w, y1: s.h };
  const color = () => '#ff0000';
  let r = 0;
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  // Off screen: nothing.
  const none = [];
  assert.equal(spawnBattleFx(s, { x0: -50, y0: -50, x1: -10, y1: -10 }, none, 0.5, color, rand), 0);
  assert.equal(none.length, 0);
  // On screen: soldiers walk and muzzles flash; shots are counted for the sound.
  const fx = [];
  const shots = spawnBattleFx(s, all, fx, 0.5, color, rand);
  assert.ok(shots > 0 && fx.some(p => p.kind === 'soldier') && fx.some(p => p.kind === 'flash'));
  // Many frames never exceed the cap.
  for (let k = 0; k < 400; k++) spawnBattleFx(s, all, fx, 0.5, color, rand);
  assert.ok(fx.length <= MAX_PARTICLES);
  // The simulation is untouched by effects.
  const before = serialize(s);
  spawnBattleFx(s, all, [], 0.5, color, rand);
  assert.deepEqual(serialize(s), before);
});

test('battle effects: a clash where a front reaches a capital', async () => {
  const { spawnBattleFx } = await import('../js/battlefx.js');
  const s = battle('vulkara', { tutorial: false });
  freezeAI(s);
  advance(s, 0.5);
  const cap = site(s, 'player-capital');
  // A fake enemy front pressing right against the player capital.
  const e = enemyOf(s);
  const tiles = [];
  for (let dx = -3; dx <= 3; dx++) tiles.push(cap.y * s.w + cap.x + dx);
  for (const i of tiles) setOwner(s, i, PLAYER);
  give(s, cap.x - 5, cap.y, e.id);
  s.attacks.push({ id: 999, attacker: e.id, target: PLAYER, troops: 5000, initial: 5000, conquered: 0, focus: null, progress: 0, frontier: { v: tiles, k: tiles.map(() => 0) } });
  let r = 0;
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const fx = [];
  for (let k = 0; k < 40; k++) spawnBattleFx(s, { x0: 0, y0: 0, x1: s.w, y1: s.h }, fx, 0.1, () => '#fff', rand);
  assert.ok(fx.some(p => p.ring), 'clash rings at the capital');
  assert.ok(fx.filter(p => p.kind === 'spark').length > fx.filter(p => p.kind === 'flash').length, 'explosions dominate at a fort');
});

// ---------- All worlds open ----------

test('every world is open, with a recommended order and a 1-5 difficulty', () => {
  const c = newCampaign();
  PLANETS.forEach((p, i) => {
    assert.ok(isUnlocked(c, i), `${p.id} open from the start`);
    assert.ok(Number.isInteger(p.difficulty) && p.difficulty >= 1 && p.difficulty <= 5, `${p.id} difficulty`);
  });
  assert.equal(PLANETS[0].difficulty, 1);
  assert.ok(getPlanet('mycelion').difficulty < getPlanet('noctyra').difficulty, 'Mycelion rated easier than Noctyra');
  // Suggest the next unconquered world in the recommended order.
  assert.equal(nextWorld(c, 'vulkara').id, 'cryonis');
  c.planets.cryonis.completed = true;
  assert.equal(nextWorld(c, 'vulkara').id, 'mycelion');
  assert.equal(nextWorld(c, 'noctyra').id, 'vulkara', 'wraps around');
  for (const p of PLANETS) c.planets[p.id].completed = true;
  assert.equal(nextWorld(c, 'noctyra'), null);
});

test('a new player who picks a later world is offered the tutorial once', () => {
  const c = newCampaign();
  assert.ok(!shouldOfferTutorial(c, 'vulkara'), 'not for the first world');
  assert.ok(shouldOfferTutorial(c, 'noctyra'));
  c.tutorial.offeredWorld = true;
  assert.ok(!shouldOfferTutorial(c, 'noctyra'), 'only once');
  const saved = memoryStorage();
  saveCampaign(saved, c);
  assert.ok(loadCampaign(saved).tutorial.offeredWorld, 'remembered across sessions');
  const done = newCampaign();
  done.tutorial.done = [1];
  assert.ok(!shouldOfferTutorial(done, 'xythera'), 'not after a lesson');
  const vet = newCampaign();
  vet.planets.cryonis.completed = true;
  assert.ok(!shouldOfferTutorial(vet, 'xythera'), 'not after a conquest');
});

test('rewards do not depend on the order worlds are played in', () => {
  const result = { time: 9999, objectivesDone: [], capitalThreatened: true };
  const play = order => {
    const c = newCampaign();
    for (const id of order) {
      const p = getPlanet(id);
      const r = computeRewards(c, p, result);
      applyVictory(c, p, result, r);
    }
    return c.cores;
  };
  const ids = PLANETS.map(p => p.id);
  const inOrder = play(ids);
  assert.equal(play([...ids].reverse()), inOrder);
  assert.equal(play(['noctyra', 'mycelion', 'vulkara', 'xythera', 'cryonis']), inOrder);
  // A hard world first pays its own base once, no more.
  const c = newCampaign();
  const r = computeRewards(c, getPlanet('noctyra'), result);
  assert.equal(r.total, getPlanet('noctyra').rewards.base);
});
