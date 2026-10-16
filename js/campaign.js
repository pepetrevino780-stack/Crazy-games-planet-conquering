// Campaign and content definitions. Everything here is data: worlds, enemy
// civilizations, objective sites, victory rules and tutorial objectives.
// New planets, civilizations or skirmish setups can be added without
// touching the engine.

// NPC behaviour profiles. Later planets get smarter commanders, not bigger
// armies: faster decisions, better targets, defence, retaliation and
// coordinated multi-front attacks.
export const AI_PROFILES = {
  // Small independent nations: expand into wilderness, retaliate, rarely start wars.
  tribe: {
    interval: 3.2, attackAt: 0.55, ratio: 0.3, wildBias: 2.2, playerBias: 0.4, nationBias: 0.6,
    objectiveSense: 0.1, retaliate: true, fronts: 1, reserve: 0.25, build: 0.3, noise: 0.5,
  },
  passive: {
    interval: 3.6, attackAt: 0.75, ratio: 0.22, wildBias: 0.8, playerBias: 0.3, nationBias: 0.6,
    objectiveSense: 0.2, retaliate: false, fronts: 1, reserve: 0.4, build: 0.3, noise: 0.5,
  },
  cautious: {
    interval: 2.4, attackAt: 0.5, ratio: 0.35, wildBias: 1.4, playerBias: 0.8, nationBias: 0.8,
    objectiveSense: 0.6, retaliate: true, fronts: 1, reserve: 0.45, build: 0.7, noise: 0.3,
  },
  // Waits for neighbours to get into wars, then strikes whoever is weakest or busy.
  opportunist: {
    interval: 2.2, attackAt: 0.5, ratio: 0.38, wildBias: 1.0, playerBias: 1.0, nationBias: 1.1,
    objectiveSense: 0.3, retaliate: true, fronts: 2, reserve: 0.3, build: 0.5, noise: 0.3, prey: 1.2, ignorePlayer: 240,
  },
  aggressive: {
    interval: 2.0, attackAt: 0.42, ratio: 0.4, wildBias: 1.1, playerBias: 1.2, nationBias: 1.0,
    objectiveSense: 0.5, retaliate: true, fronts: 2, reserve: 0.25, build: 0.6, noise: 0.25,
  },
  tactical: {
    interval: 1.6, attackAt: 0.45, ratio: 0.4, wildBias: 1.2, playerBias: 1.1, nationBias: 1.0,
    objectiveSense: 1.0, retaliate: true, fronts: 2, reserve: 0.4, build: 0.9, noise: 0.15, expeditions: true,
  },
  mastermind: {
    interval: 1.3, attackAt: 0.42, ratio: 0.42, wildBias: 1.1, playerBias: 1.3, nationBias: 1.0,
    objectiveSense: 1.0, retaliate: true, fronts: 1, reserve: 0.4, build: 1.0, noise: 0.1, expeditions: true, // + command nodes
  },
};

// How each behaviour reads to the player (leaderboard, hover cards).
export const PERSONAS = {
  tribe: { name: 'Isolationist', desc: 'Settles the wilderness and fights back when attacked, but rarely starts a war.' },
  passive: { name: 'Relaxed', desc: 'Slow to act and keeps big reserves. Attacks only when far stronger.' },
  opportunist: { name: 'Opportunist', desc: 'Waits for a neighbour to get into a war, then strikes whoever is weakest.' },
  cautious: { name: 'Defensive', desc: 'Guards its border, holds reserves and always retaliates.' },
  aggressive: { name: 'Aggressive', desc: 'Expands fast, attacks on two fronts and targets you often.' },
  tactical: { name: 'Calculating', desc: 'Quick decisions, goes for objectives and weak borders.' },
  mastermind: { name: 'Mastermind', desc: 'Fastest commander. Coordinates fronts and punishes mistakes.' },
};

// Objective and resource sites that appear on maps. Effects are applied by
// the engine through these properties.
export const SITE_TYPES = {
  capital: { label: 'Capital', desc: 'Fortified: the land around it defends at 2x. Lose it and the civilization falls.', fortress: 2, radius: 6 },
  citadel: { label: 'Eclipse Citadel', desc: 'Capital fortress: nearly impregnable except during an eclipse.', fortress: 4, radius: 9, eclipseOnly: true },
  vent: { label: 'Magma Vent', desc: '+energy and +minerals; erupts with riches.', energy: 1.2, minerals: 2 },
  crystal: { label: 'Crystal Deposit', desc: '+minerals and +5% troop growth for its owner.', minerals: 4, growth: 0.05 },
  hub: { label: 'Network Hub', desc: 'Nourishes its owner\'s land in a wide radius (+35% defense). Shields the Brood Heart.', nourish: 1.35, radius: 26 },
  relay: { label: 'Energy Relay', desc: 'Powers automated defenses. +energy.', energy: 1 },
  turret: { label: 'Automated Defense', desc: 'While powered, land around it costs 2.5x to attack.', guard: 2.5, radius: 14 },
  factory: { label: 'Ancient Factory', desc: '+minerals and +10% troop growth.', minerals: 5, growth: 0.1 },
  command: { label: 'Command Node', desc: 'Grants its owner an extra attack front and +6% attack strength. +energy.', energy: 0.5 },
  ruin: { label: 'Ancient Ruin', desc: '+exotic matter.', exotic: 0.5 },
};

// Player-built structures (bought with minerals). Cost grows with each copy.
export const BUILDINGS = {
  habitat: { key: '1', name: 'Habitat', desc: '+12% max troops per level (up to 5 levels count).', cost: 300 },
  extractor: { key: '2', name: 'Extractor', desc: '+4 minerals/s per level.', cost: 250 },
  starport: { key: '3', name: 'Starport', desc: 'Expeditions launched from it are 40% faster per level, and it can build battleships. Must be near the coast.', cost: 400, coastal: true },
  bastion: { key: '4', name: 'Bastion', desc: 'Your nearby land defends at 1.8x. Each upgrade widens its reach by a fifth.', cost: 300, radius: 10 },
  spire: { key: '5', name: 'Research Spire', desc: '+0.5 exotic matter/s per level, for research.', cost: 350 },
};

// Buildings stack: click one of your own with the same tool to raise its level.
export const MAX_LEVEL = 3;
export const UPGRADE_GROWTH = 1.6; // upgrade cost = base cost x 1.6^level

export const RESEARCH = {
  swift: { name: 'Swift Assault', desc: 'Attacks advance 30% faster.', cost: 40 },
  hardened: { name: 'Hardened Troops', desc: 'Attacks cost 12% fewer troops.', cost: 60 },
  logistics: { name: 'Deep Logistics', desc: '+10% max troops and growth.', cost: 80 },
};

export const PLANETS = [
  {
    id: 'vulkara',
    difficulty: 1, // 1-5, shown on the world card
    name: 'Vulkara',
    title: 'The Ashen Cradle',
    lesson: 'Learn to Attack',
    tagline: 'A volcanic world of ash plains and magma seas. Expand fast and break the Cindari.',
    theme: 'vulkara', seed: 4101, size: [900, 570], scale: 3,
    enemy: { name: 'Cindari Clans', color: '#ff4b3e', profile: 'passive', radius: 8, troops: 900, capitalName: 'Ember Throne', startDelay: 12 },
    nations: { count: 10, radius: 5, troops: 400, profiles: ['passive'] },
    sites: [{ type: 'vent', count: 4, where: 'middle' }, { type: 'ruin', count: 2, where: 'any' }],
    events: { type: 'eruption', period: 45, duration: 8, warn: 5 },
    victory: { mode: 'all', conds: [{ type: 'capture', site: 'enemy-capital', label: 'Capture the Ember Throne' }] },
    objectives: [
      { id: 'v1', type: 'tiles', n: 2700, label: 'Expand to 2,700 tiles', reward: 5,
        tip: 'Click unclaimed land next to your border. Wilderness is cheap to take.' },
      { id: 'v2', type: 'ratioAttack', ratio: 0.5, label: 'Attack with a 50% ratio or more', reward: 5,
        tip: 'The ratio sets how much of your army joins an attack. Troops regrow fastest when your army is not full.' },
      { id: 'v3', type: 'ownType', site: 'vent', n: 1, label: 'Seize a magma vent', reward: 5, highlight: 'vent',
        tip: 'Vents give energy and minerals. Eruptions pay out to whoever holds them.' },
      { id: 'v4', type: 'build', building: 'habitat', label: 'Build a Habitat', reward: 5,
        tip: 'Spend minerals on buildings. Habitats raise your troop cap.' },
    ],
    // After the standalone tutorial, only these steps run here.
    tutorialShort: ['habitat', 'capital'],
    // Learn by doing, three core actions only: attack, the ratio, drag a
    // building. Each step is one short line plus a picture (icon, keys).
    // Everything else unlocks with the last step, and one-line hints appear
    // the first time each feature becomes useful.
    tutorial: [
      { id: 'expand', label: 'Attack the land next to your border', point: 'frontier', waitFor: { type: 'attack' },
        icon: 'click', text: 'Click the land next to your border.' },
      { id: 'ratio', label: 'Attack with a 50% ratio', point: 'ratio', waitFor: { type: 'ratioAttack' },
        icon: 'slider', text: 'Slide the ratio to 50%, then attack.' },
      { id: 'habitat', label: 'Build a Habitat', point: 'tool:habitat', unlock: ['habitat'], waitFor: { type: 'build', building: 'habitat' },
        icon: 'drag', keys: ['1'], ensureBuild: 'habitat', text: 'Drag a Habitat onto your land.' },
      { id: 'capital', label: 'Capture the Ember Throne', point: 'site:enemy-capital',
        unlock: ['extractor', 'starport', 'bastion', 'spire', 'dropship', 'ship', 'research', 'exotic', 'energy', 'abilities'],
        icon: 'click', text: 'Capture the Ember Throne to win.' },
    ],
    briefing: [
      'Pick your landing site, then click land next to your border to attack it. Your border advances tile by tile until the attack runs out of troops.',
      'Your troop cap grows with territory. Troops regrow fastest when your army is well below its cap, so keep attacking.',
      'Mountains, rivers and volcanoes are slow and costly to cross. Plains are fast.',
    ],
    lessons: ['Expand into wilderness', 'Use the attack ratio', 'Grow your troop cap', 'Capture an enemy capital'],
    rewards: { base: 30 },
  },
  {
    id: 'cryonis',
    difficulty: 2, // 1-5, shown on the world card
    name: 'Cryonis',
    title: 'The Frozen Frontier',
    lesson: 'Learn to Defend',
    tagline: 'A frozen world of glaciers and crystal fields. The Glacari defend every ridge.',
    theme: 'cryonis', seed: 5207, size: [990, 630], scale: 3,
    enemy: { name: 'Glacari Concord', color: '#b48cff', profile: 'cautious', radius: 9, troops: 1000, capitalName: 'Frost Bastion', startDelay: 10 },
    nations: { count: 12, radius: 5, troops: 450, profiles: ['tribe', 'cautious', 'opportunist'] },
    sites: [{ type: 'crystal', count: 4, where: 'middle' }, { type: 'ruin', count: 2, where: 'any' }],
    events: { type: 'storm', period: 50, duration: 12, warn: 6 },
    victory: { mode: 'any', conds: [
      { type: 'holdType', site: 'crystal', n: 3, duration: 150, label: 'Hold 3 crystal deposits for 2:30' },
      { type: 'capture', site: 'enemy-capital', label: 'Or capture the Frost Bastion' },
    ] },
    objectives: [
      { id: 'c1', type: 'ownType', site: 'crystal', n: 1, label: 'Secure a crystal deposit', reward: 5, highlight: 'crystal',
        tip: 'Crystals give minerals and faster troop growth. The Glacari will try to take them back.' },
      { id: 'c2', type: 'build', building: 'bastion', label: 'Build a Bastion near a crystal', reward: 5,
        tip: 'Bastions make your land nearby defend at 1.8x. Put them where enemies attack.' },
      { id: 'c3', type: 'repel', n: 3, label: 'Repel 3 enemy attacks', reward: 10,
        tip: 'An attack is repelled when it runs out of troops on your land. Keep a reserve and use high ground.' },
    ],
    briefing: [
      'Mountains, glaciers and rivers multiply your defence. Hold the high ground and let attacks break on it.',
      'Bastions strengthen your land nearby. Crystal deposits fund your war; holding three of them long enough wins the planet.',
      'Whiteout storms freeze troops in transit: attacks launched during a storm lose a quarter of their troops.',
    ],
    lessons: ['Defend with terrain', 'Protect resource regions', 'Build defences', 'Survive counterattacks'],
    rewards: { base: 40 },
  },
  {
    id: 'mycelion',
    difficulty: 4, // 1-5, shown on the world card
    name: 'Mycelion',
    title: 'The Living World',
    lesson: 'Learn to Disrupt',
    tagline: 'A fungal world wired together by living hubs. The Mycelials spread without pause.',
    theme: 'mycelion', seed: 6311, size: [1080, 660], scale: 3,
    enemy: { name: 'Mycelial Swarm', color: '#c6ff3d', profile: 'aggressive', radius: 9, troops: 750, capitalName: 'Brood Heart', startDelay: 22,
      sites: [{ type: 'hub', count: 3, ring: [16, 26], name: 'Hub' }], shieldedBy: 'hub' },
    nations: { count: 12, radius: 5, troops: 450, profiles: ['tribe', 'opportunist', 'aggressive'] },
    sites: [{ type: 'ruin', count: 2, where: 'any' }],
    events: { type: 'bloom', period: 40, duration: 4, warn: 5 },
    victory: { mode: 'all', conds: [{ type: 'capture', site: 'enemy-capital', orDestroyed: true, label: 'Destroy the Brood Heart' }] },
    objectives: [
      { id: 'm1', type: 'ownType', site: 'hub', n: 1, label: 'Capture a network hub', reward: 10, highlight: 'hub',
        tip: 'Hubs nourish all Mycelial land around them. Taking one weakens a whole region at once.' },
      { id: 'm2', type: 'ownType', site: 'hub', n: 2, label: 'Hold two hubs', reward: 10,
        tip: 'Each hub you hold also stops the spore bloom from feeding the Swarm.' },
      { id: 'm3', type: 'unshield', label: 'Drop the Brood Heart shield', reward: 5, highlight: 'enemy-capital',
        tip: 'The shield is down. Strike the Brood Heart before the Swarm retakes a hub.' },
    ],
    briefing: [
      'Network hubs nourish the land around them: nourished land defends at 1.35x.',
      'The Brood Heart is shielded while the Swarm holds any hub. Its biggest armies are not the target. The hubs are.',
      'Spore blooms give every hub owner a burst of troops. Cut the hubs and the blooms feed you instead.',
    ],
    lessons: ['Locate network hubs', 'Break enemy connections', 'Prioritise key targets', 'Contain a fast expander'],
    rewards: { base: 50 },
  },
  {
    id: 'xythera',
    difficulty: 3, // 1-5, shown on the world card
    name: 'Xythera',
    title: 'The World of Ancient Machines',
    lesson: 'Learn to Plan',
    tagline: 'A ruined machine world. Axiom defenses still hum with relay power.',
    theme: 'xythera', seed: 7417, size: [1140, 690], scale: 3, aiShips: true,
    enemy: { name: 'Axiom Directorate', color: '#ffae3d', profile: 'tactical', radius: 9, troops: 950, capitalName: 'Core Foundry', startDelay: 8,
      sites: [{ type: 'relay', count: 2, ring: [20, 30], name: 'Relay' }, { type: 'turret', count: 4, ring: [9, 15], name: 'Defense' }],
      powers: true },
    nations: { count: 14, radius: 5, troops: 500, profiles: ['tribe', 'opportunist', 'cautious', 'aggressive'] },
    sites: [{ type: 'factory', count: 3, where: 'middle' }, { type: 'ruin', count: 3, where: 'any' }],
    growthScale: 0.85,
    events: { type: 'surge', period: 55, duration: 10, warn: 5 },
    victory: { mode: 'all', conds: [
      { type: 'capture', site: 'enemy-capital', label: 'Capture the Core Foundry' },
      { type: 'ownType', site: 'factory', n: 2, label: 'Control 2 Ancient Factories' },
    ] },
    objectives: [
      { id: 'x1', type: 'ownType', site: 'factory', n: 1, label: 'Secure an Ancient Factory', reward: 5, highlight: 'factory',
        tip: 'Factories pay minerals and speed up troop growth. Production is scarce here.' },
      { id: 'x2', type: 'ownType', site: 'relay', n: 1, label: 'Capture an energy relay', reward: 10, highlight: 'relay',
        tip: 'Relays power the automated defenses around the Core Foundry. No power, no defense.' },
      { id: 'x3', type: 'unpowered', n: 3, label: 'Disable 3 automated defenses', reward: 10,
        tip: 'Unpowered defenses are just land. The road to the Core Foundry is open.' },
    ],
    briefing: [
      'Automated defenses make land within 14 tiles cost 2.5x to attack, but only while an Axiom relay is powered.',
      'Ancient factories boost minerals and troop growth. Troops grow more slowly on Xythera, so factories decide long wars.',
      'The Directorate guards its infrastructure and strikes whoever empties their army. Plan each attack.',
    ],
    lessons: ['Capture energy relays', 'Disable defenses first', 'Secure factories', 'Plan around scarce resources'],
    rewards: { base: 60 },
  },
  {
    id: 'noctyra',
    difficulty: 5, // 1-5, shown on the world card
    name: 'Noctyra',
    title: 'The Eternal Eclipse',
    lesson: 'Prove Your Mastery',
    tagline: 'A world under a dead sun. The Umbral Dominion strikes on every front.',
    theme: 'noctyra', seed: 8521, size: [1230, 750], scale: 3, aiShips: true,
    enemy: { name: 'Umbral Dominion', color: '#ff3355', profile: 'mastermind', radius: 9, troops: 1200, capitalName: 'Eclipse Citadel', capitalType: 'citadel', startDelay: 6,
      sites: [{ type: 'command', count: 3, ring: [20, 34], name: 'Command Node' }, { type: 'hub', count: 1, ring: [12, 18], name: 'Umbral Hub' },
        { type: 'relay', count: 1, ring: [22, 28], name: 'Shade Relay' }, { type: 'turret', count: 2, ring: [10, 14], name: 'Shade Defense' }],
      powers: true },
    nations: { count: 16, radius: 5, troops: 500, profiles: ['opportunist', 'aggressive', 'tribe', 'cautious'] },
    sites: [{ type: 'crystal', count: 2, where: 'middle' }, { type: 'factory', count: 1, where: 'middle' }, { type: 'ruin', count: 3, where: 'any' }],
    events: { type: 'eclipse', period: 70, duration: 18, warn: 8 },
    victory: { mode: 'all', conds: [{ type: 'capture', site: 'enemy-capital', label: 'Conquer the Eclipse Citadel' }] },
    objectives: [
      { id: 'k1', type: 'ownType', site: 'command', n: 1, label: 'Capture a command node', reward: 10, highlight: 'command',
        tip: 'Every command node gives the Dominion another attack front. Take one and its coordination drops.' },
      { id: 'k2', type: 'ownType', site: 'crystal', n: 2, label: 'Hold both crystal deposits', reward: 10,
        tip: 'A long war needs income. Crystals keep your troops and minerals flowing.' },
      { id: 'k3', type: 'eclipseStrike', label: 'Attack the Citadel during an eclipse', reward: 10,
        tip: 'The eclipse strips the Citadel\'s defenses. Strike while it lasts.' },
    ],
    briefing: [
      'Command nodes let the Dominion attack on several fronts at once. Each one you take removes a front.',
      'The Eclipse Citadel defends at 4x, except during an eclipse. Gather your army and strike then.',
      'Everything you have learned applies: hubs, relays and defenses, crystals and factories all return.',
    ],
    lessons: ['Break multi-front coordination', 'Capture command nodes', 'Manage a long war', 'Time the eclipse', 'Storm the Citadel'],
    rewards: { base: 80 },
  },
];

// A replayable random battle on any world.
export const SKIRMISH_MODES = {
  classic: { name: 'Classic', desc: 'Capture the enemy capital or rule 60% of the land.' },
  ffa: { name: 'Free-for-all', desc: 'Every civilization for itself. Capture any 4 capitals to win.' },
  teams: { name: 'Teams', desc: 'Half the nations fight on your side, half with the Dominion. Capture its capital.' },
  fast: { name: 'Fast build', desc: 'Half-price buildings, double income, faster growth, a short ceasefire.' },
};

const skirmishCache = new Map();
export function skirmishConfig(theme, seed, mode = 'classic') {
  const key = `${theme}:${seed}:${mode}`;
  if (skirmishCache.has(key)) return skirmishCache.get(key);
  const profiles = { vulkara: 'aggressive', cryonis: 'cautious', mycelion: 'aggressive', xythera: 'tactical', noctyra: 'mastermind' };
  const m = SKIRMISH_MODES[mode] ? mode : 'classic';
  const cfg = {
    id: 'skirmish', name: 'Skirmish', title: 'Uncharted World', lesson: SKIRMISH_MODES[m].name,
    tagline: 'A procedurally generated world. Conquer it your way.',
    theme, seed, mode: m, size: [1140, 690], scale: 3, skirmish: true,
    enemy: { name: 'Hostile Dominion', color: '#ff4b3e', profile: profiles[theme] || 'aggressive', radius: 9, troops: 1000, capitalName: 'Enemy Capital', startDelay: 8 },
    nations: { count: 18, radius: 5, troops: 500, profiles: ['tribe', 'opportunist', 'aggressive', 'cautious'] },
    sites: [{ type: 'crystal', count: 2, where: 'middle' }, { type: 'factory', count: 2, where: 'middle' }, { type: 'vent', count: 2, where: 'any' }, { type: 'ruin', count: 3, where: 'any' }],
    events: null,
    victory: { mode: 'any', conds: [
      { type: 'capture', site: 'enemy-capital', label: 'Capture the enemy capital' },
      { type: 'landShare', share: 0.6, label: 'Or rule 60% of the land' },
    ] },
    objectives: [],
    briefing: ['A new world every time. ' + SKIRMISH_MODES[m].desc],
    lessons: ['Free conquest'],
    rewards: { base: 15 },
  };
  if (m === 'ffa') cfg.victory = { mode: 'any', conds: [{ type: 'capitals', n: 4, label: 'Capture 4 capitals' }] };
  if (m === 'teams') { cfg.teams = true; cfg.victory = { mode: 'any', conds: [{ type: 'capture', site: 'enemy-capital', label: 'Capture the Dominion capital' }] }; }
  if (m === 'fast') Object.assign(cfg, { costScale: 0.5, incomeScale: 2, growthScale: 1.5, grace: 30 });
  skirmishCache.set(key, cfg);
  return cfg;
}

// ---------- Standalone tutorial ----------
// Seven short lessons on one small, calm map: one weak neighbour, no attacks
// on you, no time pressure. Each lesson is a list of training steps; the
// lesson ends when its last step is done (lesson 7 when you take the capital).

const step = (id, label, waitFor, text, extra = {}) => ({ id, label, waitFor, text, ...extra });
const flag = name => ({ type: 'flag', flag: name });

export const TUTORIAL_LESSONS = [
  { id: 1, name: 'Attack and build', desc: 'Attack, set the ratio, drag a building.', setup: { minerals: 400 },
    steps: [
      step('attack', 'Attack next to your border', { type: 'attack' }, 'Click the land next to your border.', { point: 'frontier', icon: 'click' }),
      step('ratio', 'Attack with a 50% ratio', { type: 'ratioAttack' }, 'Slide the ratio to 50%, then attack.', { point: 'ratio', icon: 'slider' }),
      step('build', 'Build a Habitat', { type: 'build', building: 'habitat' }, 'Drag a Habitat onto your land.', { point: 'tool:habitat', icon: 'drag', keys: ['1'] }),
    ] },
  { id: 2, name: 'Direction and survivors', desc: 'Troops push where you click, and survivors come home.', setup: {},
    steps: [
      step('spear', 'Click far from your border', flag('spearhead'), 'Click land far from your border.', { point: 'frontier', icon: 'click' }),
      step('returned', 'Let an attack finish', flag('returned'), 'Survivors march home: watch your Troops.', { point: 'el:#empire .stat.big', icon: 'eye' }),
    ] },
  { id: 3, name: 'Build and upgrade', desc: 'Place buildings, then stack them to level 2 and 3.', setup: { minerals: 3000 },
    steps: [
      step('build', 'Build a Habitat', { type: 'build', building: 'habitat' }, 'Drag a Habitat onto your land.', { point: 'tool:habitat', icon: 'drag', keys: ['1'] }),
      step('upgrade', 'Upgrade the Habitat', flag('upgraded_habitat'), 'Drop another Habitat on it: level 2.', { point: 'tool:habitat', icon: 'drag', keys: ['1'] }),
      step('extract', 'Build an Extractor', { type: 'build', building: 'extractor' }, 'Drag an Extractor for more minerals.', { point: 'tool:extractor', icon: 'drag', keys: ['2'] }),
    ] },
  { id: 4, name: 'The battle panel', desc: 'Read your troops against theirs, and retreat.', setup: {},
    steps: [
      step('war', 'Attack the neighbouring nation', flag('attackedNation'), 'Attack the nation next to you.', { point: 'el:#battles', icon: 'click' }),
      step('retreat', 'Retreat from the battle', flag('retreated'), 'Press Retreat on the battle row.', { point: 'el:#battles', icon: 'click' }),
    ] },
  { id: 5, name: 'Across the sea', desc: 'Expeditions reach other continents; Starports speed them up.', setup: { minerals: 2000 },
    steps: [
      step('port', 'Build a Starport', { type: 'build', building: 'starport' }, 'Drag a Starport onto your coast.', { point: 'tool:starport', icon: 'drag', keys: ['3'] }),
      step('drop', 'Send an expedition', flag('dropship'), 'Click land across the sea.', { point: 'tool:dropship', icon: 'click', keys: ['6'] }),
    ] },
  { id: 6, name: 'Research and abilities', desc: 'Spend exotic matter on research, energy on abilities.', setup: { exotic: 120, energy: 120, abilities: ['strike', 'rally', 'emp'] },
    steps: [
      step('research', 'Research something', flag('researched'), 'Open Research and pick one.', { point: 'tool:research', icon: 'click', keys: ['R'] }),
      step('muster', 'Use Rapid Muster', flag('ability_rally'), 'Muster, then click anywhere: free troops.', { point: 'tool:rally', icon: 'click', keys: ['8'] }),
    ] },
  { id: 7, name: 'Win a world', desc: 'Objectives and capturing a capital.', setup: { troops: 3000 },
    steps: [
      step('capital', 'Capture the Training Fort', null, 'Capture the Training Fort to win.', { point: 'site:enemy-capital', icon: 'click' }),
    ] },
];

export function tutorialConfig(lesson = 1) {
  const L = TUTORIAL_LESSONS[Math.max(0, Math.min(TUTORIAL_LESSONS.length - 1, lesson - 1))];
  return {
    id: 'tutorial', name: 'Tutorial', title: `Lesson ${L.id}: ${L.name}`, lesson: L.name, tagline: L.desc,
    theme: 'vulkara', seed: 2024, size: [300, 190], scale: 1, tutorialWorld: true, lessonId: L.id, setup: L.setup,
    grace: 99999,
    enemy: { name: 'Training Drones', color: '#ff4b3e', profile: 'passive', radius: 6, troops: 250, capitalName: 'Training Fort', startDelay: 99999 },
    nations: { count: 1, radius: 5, troops: 300, profiles: ['passive'], mainOnly: true },
    sites: [],
    events: null,
    victory: L.id === 7
      ? { mode: 'any', conds: [{ type: 'capture', site: 'enemy-capital', label: 'Capture the Training Fort' }] }
      : { mode: 'any', conds: [{ type: 'tutorialDone', label: `Finish: ${L.name}` }] },
    objectives: [],
    tutorial: L.steps,
    briefing: [L.desc],
    lessons: [L.name],
    rewards: { base: 0 },
  };
}

export const PLANET_INDEX = Object.fromEntries(PLANETS.map((p, i) => [p.id, i]));
export const getPlanet = id => PLANETS[PLANET_INDEX[id]];

// Pronounceable alien names for independent nations.
const SYLL = {
  vulkara: ['ash', 'kor', 'vul', 'mag', 'ter', 'pyr', 'ox', 'zan', 'cin', 'dra'],
  cryonis: ['gla', 'cri', 'ne', 'vos', 'tal', 'ice', 'rim', 'sil', 'ka', 'mor'],
  mycelion: ['spo', 'my', 'gal', 'rho', 'ven', 'lic', 'thal', 'bry', 'ul', 'osh'],
  xythera: ['ax', 'xy', 'tek', 'ron', 'vex', 'ior', 'sar', 'qua', 'lum', 'dex'],
  noctyra: ['um', 'noc', 'tyr', 'vael', 'shad', 'mor', 'kra', 'eth', 'nyx', 'or'],
};
const SUFFIX = ['Clans', 'Hegemony', 'Brood', 'Covenant', 'Remnant', 'League', 'Dominion', 'Collective', 'Tribes', 'Order', 'Choir', 'Assembly'];
export function nationName(theme, r) {
  const s = SYLL[theme] || SYLL.noctyra;
  const a = s[Math.floor(r() * s.length)], b = s[Math.floor(r() * s.length)];
  const word = (a + b).replace(/^./, c => c.toUpperCase());
  return `${word} ${SUFFIX[Math.floor(r() * SUFFIX.length)]}`;
}

// Muted colours for independent nations: distinct from the player (cyan),
// from bright enemy civilizations, and from each other.
export const NATION_COLORS = ['#b07a6a', '#8a8f5a', '#7a6aa0', '#a0708e', '#6a8a86', '#a08a5e', '#8a6a5a', '#6e7aa0', '#9a7e9e', '#7e9a6e', '#a07a5a', '#8e8e9e'];
