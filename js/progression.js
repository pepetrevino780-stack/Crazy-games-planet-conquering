// Permanent progression: rewards, upgrades, civilizations and the save file.
import { PLANETS } from './campaign.js';

export const SAVE_KEY = 'planet-conquest-campaign';
export const SAVE_VERSION = 1;

// Each upgrade gives a modest edge. None of them removes the need to adapt.
export const UPGRADES = [
  { id: 'reserves', name: 'Starting Reserves', desc: '+150 troops when you land, per level.', costs: [20, 35, 55] },
  { id: 'production', name: 'Production Efficiency', desc: '+7% troop growth per level.', costs: [25, 40, 60] },
  { id: 'income', name: 'Resource Extraction', desc: '+25% minerals per level.', costs: [20, 35, 50] },
  { id: 'fortify', name: 'Defensive Doctrine', desc: '+8% defence on all your land per level.', costs: [20, 35, 55] },
  { id: 'scouting', name: 'Scouting & Intelligence', desc: 'L1: see enemy attack sizes and garrison density. L2: warnings when an attack is launched at you. L3: live troop counts on every attack front.', costs: [15, 30, 45] },
  { id: 'strike', name: 'Orbital Strike', desc: 'Ability: scorch a circle of enemy land back to wilderness and kill its troops there. 40 energy.', costs: [40] },
  { id: 'rally', name: 'Rapid Muster', desc: 'Ability: instantly gain 15% of your troop cap. 30 energy.', costs: [30] },
  { id: 'emp', name: 'EMP Pulse', desc: 'Ability: disable nearby hubs, relays, defenses, command nodes and buildings for 20s. 35 energy.', costs: [45] },
];

export const CIVS = [
  { id: 'terran', name: 'Terran Coalition', desc: 'Balanced and adaptable.', cost: 0, color: '#3fd0ff', mods: {} },
  { id: 'kryll', name: 'Kryll Hive', desc: '+15% production, -5% defense.', cost: 40, color: '#3fe0c0', mods: { growth: 1.15, def: 0.95 } },
  { id: 'vexari', name: 'Vexari Ascendancy', desc: '+12% attack strength, attacks advance 20% faster, -10% troop growth.', cost: 50, color: '#4f8bff', mods: { atk: 1.12, speed: 1.2, growth: 0.9 } },
  { id: 'lumen', name: 'Lumen Wardens', desc: '+18% defense, abilities recharge 25% faster.', cost: 60, color: '#9ae8ff', mods: { def: 1.18, cooldown: 0.75 } },
];

export const ABILITIES = {
  strike: { name: 'Orbital Strike', cooldown: 45, key: '7' },
  rally: { name: 'Rapid Muster', cooldown: 40, key: '8' },
  emp: { name: 'EMP Pulse', cooldown: 60, key: '9' },
};

export const DIFFICULTIES = {
  cadet: { name: 'Cadet', aiInterval: 1.35, aiMargin: 0.15 },
  commander: { name: 'Commander', aiInterval: 1.0, aiMargin: 0 },
  warlord: { name: 'Warlord', aiInterval: 0.8, aiMargin: -0.05 },
};

export function newCampaign() {
  return {
    version: SAVE_VERSION,
    cores: 0,
    totalEarned: 0,
    tutorial: { done: [], rewarded: false },
    upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    civ: 'terran',
    civsUnlocked: ['terran'],
    planets: Object.fromEntries(PLANETS.map(p => [p.id, { completed: false, attempts: 0, defeats: 0, bestTime: null, objectives: [], stars: 0 }])),
    settings: { difficulty: 'commander', tips: true, sound: true, labels: true, simple: false, motion: false, playerColor: 'civ', name: 'Commander', controlsSeen: false, expeditionAsked: false, volume: { master: 0.8, music: 0.5, sfx: 0.8 } },
    // In-progress battle snapshots: one slot per mode, so starting a campaign
    // world never wipes a tutorial lesson or a skirmish. lastSlot is the one
    // played most recently (the title's Continue).
    saves: { tutorial: null, campaign: null, skirmish: null },
    lastSlot: null,
  };
}

export const SAVE_SLOTS = ['tutorial', 'campaign', 'skirmish'];
// Which slot a battle saves into.
export const slotOf = configId => (configId === 'tutorial' || configId === 'skirmish' ? configId : 'campaign');
// The save the title's Continue resumes: the most recent one.
export function latestSave(campaign) {
  if (!campaign) return null;
  return campaign.saves[campaign.lastSlot] || SAVE_SLOTS.map(k => campaign.saves[k]).find(Boolean) || null;
}

// Merge a loaded save onto a fresh template so new fields are filled in
// and corrupt or foreign data cannot break the game.
export function normalizeCampaign(raw) {
  const base = newCampaign();
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return base;
  const c = base;
  c.cores = Number.isFinite(raw.cores) ? Math.max(0, Math.floor(raw.cores)) : 0;
  c.totalEarned = Number.isFinite(raw.totalEarned) ? raw.totalEarned : c.cores;
  for (const u of UPGRADES) {
    const lvl = raw.upgrades?.[u.id];
    if (Number.isInteger(lvl)) c.upgrades[u.id] = Math.max(0, Math.min(u.costs.length, lvl));
  }
  if (Array.isArray(raw.civsUnlocked)) {
    c.civsUnlocked = CIVS.map(v => v.id).filter(id => id === 'terran' || raw.civsUnlocked.includes(id));
  }
  if (c.civsUnlocked.includes(raw.civ)) c.civ = raw.civ;
  for (const p of PLANETS) {
    const rp = raw.planets?.[p.id];
    if (!rp) continue;
    const t = c.planets[p.id];
    t.completed = !!rp.completed;
    t.attempts = Number.isInteger(rp.attempts) ? rp.attempts : 0;
    t.defeats = Number.isInteger(rp.defeats) ? rp.defeats : 0;
    t.bestTime = Number.isFinite(rp.bestTime) ? rp.bestTime : null;
    t.objectives = Array.isArray(rp.objectives) ? rp.objectives.filter(o => typeof o === 'string') : [];
    t.stars = Number.isInteger(rp.stars) ? Math.max(0, Math.min(3, rp.stars)) : t.completed ? 1 : 0;
  }
  if (raw.settings && DIFFICULTIES[raw.settings.difficulty]) c.settings.difficulty = raw.settings.difficulty;
  for (const k of ['tips', 'sound', 'labels', 'simple', 'motion', 'controlsSeen', 'expeditionAsked']) {
    if (raw.settings && typeof raw.settings[k] === 'boolean') c.settings[k] = raw.settings[k];
  }
  if (raw.settings && /^(civ|#[0-9a-f]{6})$/i.test(raw.settings.playerColor || '')) c.settings.playerColor = raw.settings.playerColor;
  if (raw.settings && typeof raw.settings.name === 'string') c.settings.name = cleanName(raw.settings.name);
  for (const k of ['master', 'music', 'sfx']) {
    const v = raw.settings?.volume?.[k];
    if (typeof v === 'number' && v >= 0 && v <= 1) c.settings.volume[k] = v;
  }
  if (raw.tutorial && Array.isArray(raw.tutorial.done)) {
    c.tutorial.done = [...new Set(raw.tutorial.done.filter(n => Number.isInteger(n) && n >= 1 && n <= TUTORIAL_REWARD.lessons))];
    c.tutorial.rewarded = !!raw.tutorial.rewarded;
    c.tutorial.offered = !!raw.tutorial.offered;
  }
  const okSave = b => !!b && typeof b === 'object' && b.v === 4;
  for (const k of SAVE_SLOTS) if (okSave(raw.saves?.[k])) c.saves[k] = raw.saves[k];
  // Older saves had a single slot.
  if (okSave(raw.battle)) { c.saves[slotOf(raw.battle.configId)] = raw.battle; c.lastSlot = slotOf(raw.battle.configId); }
  if (SAVE_SLOTS.includes(raw.lastSlot)) c.lastSlot = raw.lastSlot;
  return c;
}

export function loadCampaign(storage) {
  try {
    const txt = storage?.getItem(SAVE_KEY);
    if (!txt) return null;
    return normalizeCampaign(JSON.parse(txt));
  } catch {
    return null;
  }
}

export function saveCampaign(storage, campaign) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(campaign));
    return true;
  } catch {
    return false;
  }
}

// Every world is open from the start. The cards show a recommended order
// (each world's lesson builds on the one before) and a difficulty rating.
export function isUnlocked(_campaign, index) {
  return index >= 0 && index < PLANETS.length;
}

// The world to suggest after finishing `id`: the next unconquered one in the
// recommended order (wrapping around), or null when all are conquered.
export function nextWorld(campaign, id) {
  const i = PLANETS.findIndex(p => p.id === id);
  for (let k = 1; k <= PLANETS.length; k++) {
    const p = PLANETS[(i + k) % PLANETS.length];
    if (p.id !== id && !campaign.planets[p.id].completed) return p;
  }
  return null;
}

// What the title screen's one Play button does: resume a saved battle, start
// the first tutorial lesson for a brand-new player, else play the first
// unconquered world in the recommended order (Vulkara when all are done).
export function playTarget(campaign) {
  if (!campaign) return { kind: 'tutorial', lesson: 1 };
  if (latestSave(campaign)) return { kind: 'resume' };
  const fresh = !campaign.tutorial.done.length && !PLANETS.some(p => campaign.planets[p.id].attempts > 0);
  if (fresh) return { kind: 'tutorial', lesson: 1 };
  const next = PLANETS.find(p => !campaign.planets[p.id].completed) || PLANETS[0];
  return { kind: 'world', id: next.id };
}

export function upgradeCost(campaign, id) {
  const u = UPGRADES.find(x => x.id === id);
  const lvl = campaign.upgrades[id];
  return lvl < u.costs.length ? u.costs[lvl] : null;
}

export function buyUpgrade(campaign, id) {
  const cost = upgradeCost(campaign, id);
  if (cost === null || campaign.cores < cost) return false;
  campaign.cores -= cost;
  campaign.upgrades[id] += 1;
  return true;
}

export function unlockCiv(campaign, id) {
  const civ = CIVS.find(c => c.id === id);
  if (!civ || campaign.civsUnlocked.includes(id) || campaign.cores < civ.cost) return false;
  campaign.cores -= civ.cost;
  campaign.civsUnlocked.push(id);
  return true;
}

// Player modifiers derived from upgrades + chosen civilization.
// Finishing every tutorial lesson pays a one-time bonus.
export const TUTORIAL_REWARD = { lessons: 7, cores: 25 };

export function completeLesson(campaign, lesson) {
  if (!campaign.tutorial.done.includes(lesson)) campaign.tutorial.done.push(lesson);
  if (!campaign.tutorial.rewarded && campaign.tutorial.done.length >= TUTORIAL_REWARD.lessons) {
    campaign.tutorial.rewarded = true;
    campaign.cores += TUTORIAL_REWARD.cores;
    campaign.totalEarned += TUTORIAL_REWARD.cores;
    return TUTORIAL_REWARD.cores;
  }
  return 0;
}

// Player names: printable characters only, at most 16, never empty.
export function cleanName(name) {
  const n = String(name).replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16);
  return n || 'Commander';
}

export function playerLoadout(campaign) {
  const u = campaign.upgrades;
  const civ = CIVS.find(c => c.id === campaign.civ) || CIVS[0];
  const m = civ.mods;
  return {
    civ: civ.id,
    name: cleanName(campaign.settings?.name || 'Commander'),
    color: campaign.settings?.playerColor && campaign.settings.playerColor !== 'civ' ? campaign.settings.playerColor : civ.color,
    growth: (m.growth || 1) * (1 + 0.07 * u.production),
    atk: m.atk || 1,
    def: (m.def || 1) * (1 + 0.08 * u.fortify),
    speed: m.speed || 1,
    income: 1 + 0.25 * u.income,
    cooldown: m.cooldown || 1,
    reserves: u.reserves,
    scouting: u.scouting,
    abilities: ['strike', 'rally', 'emp'].filter(a => u[a] > 0),
  };
}

// Par time for the swift-victory bonus and the third star.
export function parTime(planet) {
  return 420 + 90 * Math.max(0, PLANETS.indexOf(planet));
}

// Stars for a victory: one for winning, one for every objective, one for beating par.
export function starsFor(planet, result) {
  const marks = [
    { label: 'Victory', got: true },
    { label: 'All objectives', got: planet.objectives.every(o => result.objectivesDone.includes(o.id)) },
    { label: `Under ${Math.floor(parTime(planet) / 60)}:${String(parTime(planet) % 60).padStart(2, '0')}`, got: result.time <= parTime(planet) },
  ];
  return { count: marks.filter(m => m.got).length, marks };
}

// Rewards for a finished battle. First clears pay in full; replays pay a
// smaller amount so earlier planets can be revisited without grinding them.
export function computeRewards(campaign, planet, result) {
  const record = campaign.planets[planet.id] || { completed: false, objectives: [] };
  const firstClear = !record.completed && !planet.skirmish;
  const lines = [];
  let total = 0;
  const base = planet.skirmish ? planet.rewards.base : firstClear ? planet.rewards.base : Math.round(planet.rewards.base * 0.3);
  lines.push({ label: planet.skirmish ? 'World conquered' : firstClear ? 'Planet conquered' : 'Planet reconquered', value: base });
  total += base;
  for (const objId of result.objectivesDone) {
    if (record.objectives.includes(objId)) continue;
    const obj = planet.objectives.find(o => o.id === objId);
    if (!obj) continue;
    lines.push({ label: obj.label, value: obj.reward });
    total += obj.reward;
  }
  const par = parTime(planet);
  if (result.time <= par) {
    const speed = Math.round(planet.rewards.base * 0.2);
    lines.push({ label: `Swift victory (under ${Math.floor(par / 60)}:${String(par % 60).padStart(2, '0')})`, value: speed });
    total += speed;
  }
  if (!result.capitalThreatened) {
    lines.push({ label: 'Lost less than a third of your peak land', value: 5 });
    total += 5;
  }
  return { lines, total };
}

export function applyVictory(campaign, planet, result, rewards) {
  const record = campaign.planets[planet.id];
  if (record) {
    record.completed = true;
    record.bestTime = record.bestTime === null ? result.time : Math.min(record.bestTime, result.time);
    for (const o of result.objectivesDone) if (!record.objectives.includes(o)) record.objectives.push(o);
    record.stars = Math.max(record.stars || 0, starsFor(planet, result).count);
  }
  campaign.cores += rewards.total;
  campaign.totalEarned += rewards.total;
  campaign.saves.campaign = null;
}

export function applyDefeat(campaign, planet) {
  if (campaign.planets[planet.id]) campaign.planets[planet.id].defeats += 1;
  campaign.saves.campaign = null;
}

// Adaptive assist: each defeat on a planet makes its NPCs slightly slower
// to react (capped), so repeated failure eases the challenge without
// removing it. Once the planet is conquered the assist no longer applies.
export function assistLevel(campaign, planetId) {
  const rec = campaign.planets[planetId];
  if (!rec) return 0;
  return rec.completed ? 0 : Math.min(3, rec.defeats);
}
