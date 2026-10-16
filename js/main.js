// Interface controller: screens, map input, HUD, notices, saving and portal hooks.
import { PLANETS, getPlanet, BUILDINGS, RESEARCH, SITE_TYPES, PERSONAS, SKIRMISH_MODES, TUTORIAL_LESSONS } from './campaign.js';
import {
  newCampaign, loadCampaign, saveCampaign, isUnlocked, UPGRADES, CIVS, ABILITIES, upgradeCost,
  buyUpgrade, unlockCiv, playerLoadout, cleanName, nextWorld, playTarget, completeLesson, TUTORIAL_REWARD, computeRewards, applyVictory, applyDefeat, assistLevel, starsFor,
} from './progression.js';
import {
  createBattle, step, spawnPlayer, canSpawnAt, playerAttack, playerDropship, playerBuild,
  playerResearch, useAbility, abilityReady, ABILITY_ENERGY, DROPSHIP_COST, canDropship, currentObjective, playerRetreat, expeditionPlan,
  condProgress, battleResult, serialize, deserialize, analyzeDefeat, TICK, PLAYER,
  tutorialStep, tutorialSteps, tutorialUnlocked, skipTutorial, playerBuildShip, playerMoveFleet, buildPreview,
} from './sim/engine.js';
import { SHIP_COST } from './sim/ships.js';
import {
  config, world, maxTroops, regen, income, buildCost, siteOwner, isShielded, isPowered, countSites,
  eventPhase, tileDefense, attackFronts, sitesOf, borders, graceLeft, upgradeCost as levelUpCost, mapScale, bastionRadius,
  EXILE, capitalOf, homeCapital,
} from './sim/core.js';
import { isAllied, attitude, requestAlliance, gift, betray, isTraitor } from './sim/diplomacy.js';
import { planRoute } from './sim/path.js';
import { rateLimiter } from './battlefx.js';
import { MapRenderer, fmt } from './render.js';
import { THEMES, TERRAIN, THEME_IDS, isLand } from './world/themes.js';
import { iconURL, spriteCanvas, mixHex } from './art/sprites.js';
import { titleScene, planetOrb, backdropCanvas } from './art/backdrop.js';
import { sfx, setSound, setAdMute, setPortalMute, setHidden, setVolumes, unlockAudio, playMusic, setAmbience, setBattleIntensity } from './audio.js';
import {
  initPlatform, platformActive, platformStorage, setAdHandlers, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, midgameAd, rewardedAd, onAudioSettings,
} from './platform.js';

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let storage = null;
let campaign = null;
let battle = null;
let renderer = null;
let ratio = 0.2;
let lastConquered = 0;
let paused = false;
let speed = 1;
let adPlaying = false;
let battlesEnded = 0;
let armed = null; // { kind: 'build'|'ability'|'dropship'|'ship', id }
let hoverTile = -1;
let inspectTile = -1;
let seenTips = new Set();
let seenAttacks = new Set();
let lastFrame = 0, accumulator = 0, lastSave = 0, lastHud = 0;
let endTimer = 0;
let inspectorClosed = false;
let skirmishSeed = 1 + Math.floor(Math.random() * 99999);

const EVENT_TEXT = {
  eruption: { name: 'Eruption', start: 'Eruption! Every magma vent pays out a burst of minerals to its owner.' },
  storm: { name: 'Whiteout', start: 'Whiteout! Attacks launched now lose a quarter of their troops to the cold.', warn: 'A whiteout is coming. Launch attacks now or wait until it passes.' },
  bloom: { name: 'Spore bloom', start: 'Spore bloom! Every hub owner gains a burst of troops.' },
  surge: { name: 'Grid surge', start: 'Grid surge! Powered defenses are 50% stronger until it ends.' },
  eclipse: { name: 'Eclipse', start: 'Eclipse! The Citadel and bastions lose most of their defense. Strike now!', warn: 'An eclipse is coming. Build up your army and strike the Citadel when it begins.' },
};
const PROFILE_TEXT = {
  passive: 'Relaxed. Expands slowly and rarely attacks you. A safe place to learn.',
  cautious: 'Cautious. Keeps a large reserve, builds bastions and strikes back when attacked.',
  aggressive: 'Aggressive. Expands fast on two fronts and is fed by its network hubs.',
  tactical: 'Tactical. Guards its relays and factories and strikes whoever empties their army.',
  mastermind: 'Coordinated. Attacks on one front per command node and times its moves to the eclipse.',
};
const REASONS = {
  noPath: 'There is no way through: allied or shielded land blocks every route.',
  water: 'Troops cannot land on water.',
  allied: 'You are allied with them. Break the alliance first (right-click or long-press their land).',
  enemyRefuses: 'They are at war with you and will not deal.',
  traitor: 'Nobody trusts a traitor. Wait until your traitor mark fades.',
  locked: 'Teammates cannot be betrayed.',
  notAllied: 'You are not allied with them.',
  notBordering: 'You do not border that land.',
  noCoast: 'You hold no coast to launch an expedition from.',
  noTroops: 'Not enough troops. Raise the attack ratio or wait for your army to regrow.',
  fronts: 'Too many attacks at once. Wait for one to finish.',
  shielded: 'Shielded! Capture the network hubs first.',
  own: 'That land is already yours.',
  minerals: 'Not enough minerals.',
  energy: 'Not enough energy.',
  exotic: 'Not enough exotic matter.',
  cooldown: 'Still recharging.',
  locked: 'Unlock this ability in Command Upgrades.',
  terrain: 'Build on your own flat land (not mountains, rivers or volcanoes).',
  crowded: 'Too close to another structure.',
  maxLevel: 'That building is already at its highest level (3).',
  coast: 'Starports must be built within 3 tiles of the coast.',
  noStarport: 'Build a Starport first: battleships are launched from one.',
  noSea: 'That Starport has no open sea nearby for a battleship.',
  noShips: 'You have no battleships.',
  target: 'Target enemy land.',
  notStarted: 'Choose your landing site first.',
  invalid: 'You cannot do that there.',
};

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  // Menus play the menu theme; battles their world's theme and ambience.
  if (name !== 'battle') { playMusic('menu'); setAmbience(null); }
  if (name === 'title') renderTitle();
  if (name === 'campaign') renderCampaign();
  if (name === 'upgrades') renderUpgrades();
  if (name === 'skirmish') renderSkirmish();
  if (name === 'tutorial') renderTutorial();
}

const persist = () => { if (campaign) saveCampaign(storage, campaign); };

function confirmBox(text, yes = 'Confirm', no = 'Cancel') {
  return new Promise(resolve => {
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yes;
    $('#confirm-no').textContent = no;
    $('#confirm-yes').classList.toggle('danger', yes === 'Confirm');
    $('#modal-confirm').classList.remove('hidden');
    const done = v => { $('#modal-confirm').classList.add('hidden'); resolve(v); };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
  });
}

function applyIcons(root = document) {
  root.querySelectorAll('img[data-icon]').forEach(img => { if (!img.src) img.src = iconURL(img.dataset.icon, 3); });
}

const spriteIcons = new Map();
function spriteIcon(type) {
  if (!spriteIcons.has(type)) {
    const spr = spriteCanvas(type, '#3fd0ff');
    const c = document.createElement('canvas');
    const s = 3;
    c.width = spr.width * s; c.height = spr.height * s;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(spr, 0, 0, c.width, c.height);
    spriteIcons.set(type, c.toDataURL());
  }
  return spriteIcons.get(type);
}

function orbCanvas(theme, size = 48) {
  const src = planetOrb(theme, size);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

// ---------- Menus ----------

let titleArt = null;
function hasProgress() {
  return !!campaign && (!!campaign.battle || campaign.totalEarned > 0 || Object.values(campaign.planets).some(p => p.attempts > 0));
}

function renderTitle() {
  if (!titleArt) {
    titleArt = titleScene(320, 180).toDataURL();
    $('#screen-title').style.backgroundImage = `url(${titleArt})`;
  }
  // One big Play button: one click back into the action.
  const b = campaign?.battle, t = playTarget(campaign);
  $('#btn-play').textContent = t.kind === 'resume' ? `Continue: ${battleName(b)} ${fmtTime(b.time)}` : t.kind === 'world' ? `Play: ${getPlanet(t.id).name}` : 'Play';
  $('#btn-new').classList.toggle('hidden', !hasProgress());
  if (document.activeElement !== $('#player-name')) $('#player-name').value = campaign?.settings.name || 'Commander';
}

const battleName = b => (b.configId === 'tutorial' ? `Tutorial lesson ${b.lesson}` : b.configId === 'skirmish' ? `Skirmish${b.mode && b.mode !== 'classic' ? ` (${SKIRMISH_MODES[b.mode].name})` : ''}: ${THEMES[b.theme].name}` : getPlanet(b.configId).name);

function renderCampaign() {
  $('#cores-campaign').textContent = campaign.cores;
  $('#sel-difficulty').value = campaign.settings.difficulty;
  const saved = campaign.battle;
  $('#btn-resume-campaign').classList.toggle('hidden', !saved);
  if (saved) $('#btn-resume-campaign').textContent = `Resume ${battleName(saved)} (${fmtTime(saved.time)})`;
  const list = $('#planet-list');
  list.innerHTML = '';
  PLANETS.forEach((p, i) => {
    const rec = campaign.planets[p.id];
    const unlocked = isUnlocked(campaign, i);
    const li = document.createElement('li');
    li.className = 'planet panel' + (unlocked ? '' : ' locked') + (rec.completed ? ' done' : '');
    const objs = `${rec.objectives.length}/${p.objectives.length} objectives`;
    const status = rec.completed ? `Conquered · best ${fmtTime(rec.bestTime)}<br>${objs}`
      : rec.attempts ? `${rec.defeats} defeat${rec.defeats === 1 ? '' : 's'} · ${objs}` : esc(p.title);
    const pips = '<span class="pip on"></span>'.repeat(p.difficulty) + '<span class="pip"></span>'.repeat(5 - p.difficulty);
    li.innerHTML = `<span class="step" title="Recommended order">#${i + 1}</span>${rec.completed ? starRow(rec.stars || 1) : ''}<h3>${esc(p.name)}</h3><div class="lesson">${esc(p.lesson)}</div>
      <div class="difficulty" aria-label="Difficulty ${p.difficulty} of 5" title="Difficulty ${p.difficulty} of 5">${pips}</div><div class="status">${status}</div>
      <button class="btn ${unlocked && !rec.completed ? 'primary' : ''}" ${unlocked ? '' : 'disabled'}>${rec.completed ? 'Replay' : 'Invade'}</button>`;
    li.insertBefore(orbCanvas(p.theme), li.querySelector('h3'));
    li.querySelector('button').onclick = () => launch({ configId: p.id });
    list.appendChild(li);
  });
}

function renderSkirmish() {
  $('#skirmish-seed').value = skirmishSeed;
  const sel = $('#skirmish-mode');
  if (!sel.options.length) {
    sel.innerHTML = Object.entries(SKIRMISH_MODES).map(([id, m]) => `<option value="${id}">${esc(m.name)}</option>`).join('');
    sel.onchange = () => { $('#skirmish-mode-desc').textContent = SKIRMISH_MODES[sel.value].desc; };
  }
  $('#skirmish-mode-desc').textContent = SKIRMISH_MODES[sel.value].desc;
  const list = $('#skirmish-list');
  list.innerHTML = '';
  for (const theme of THEME_IDS) {
    const li = document.createElement('li');
    li.className = 'planet panel';
    li.innerHTML = `<h3>${esc(THEMES[theme].name)}</h3><div class="lesson">${esc(getPlanet(theme)?.name || '')} world</div><button class="btn primary">Generate &amp; play</button>`;
    li.insertBefore(orbCanvas(theme), li.querySelector('h3'));
    li.querySelector('button').onclick = () => launch({ configId: 'skirmish', theme, worldSeed: Number($('#skirmish-seed').value) || 1, mode: $('#skirmish-mode').value });
    list.appendChild(li);
  }
}

function renderTutorial() {
  if (!campaign) { campaign = newCampaign(); persist(); }
  const done = campaign.tutorial.done;
  $('#tutorial-progress').textContent = `${done.length}/${TUTORIAL_LESSONS.length}${campaign.tutorial.rewarded ? ' · bonus earned' : ` · +${TUTORIAL_REWARD.cores} cores for all`}`;
  const list = $('#lesson-list');
  list.innerHTML = '';
  for (const L of TUTORIAL_LESSONS) {
    const li = document.createElement('li');
    li.className = 'panel' + (done.includes(L.id) ? ' done' : '');
    const next = !done.includes(L.id) && TUTORIAL_LESSONS.find(x => !done.includes(x.id)) === L;
    li.innerHTML = `<span class="mark">${done.includes(L.id) ? '&#10003;' : L.id}</span><div class="info"><b>${L.id}. ${esc(L.name)}</b><p>${esc(L.desc)}</p></div><button class="btn ${next ? 'primary' : ''}">${done.includes(L.id) ? 'Replay' : 'Play'}</button>`;
    li.querySelector('button').onclick = () => startTutorial(L.id);
    list.appendChild(li);
  }
}

// Lessons land at once: the very first launch drops straight into play.
function startTutorial(lesson) {
  sfx.click();
  battle = createBattle('tutorial', playerLoadout(campaign), { lesson, seed: 77 + lesson, autoSpawn: true });
  enterBattle();
}

function renderUpgrades() {
  $('#cores-upgrades').textContent = campaign.cores;
  const ul = $('#upgrade-list');
  ul.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = campaign.upgrades[u.id];
    const cost = upgradeCost(campaign, u.id);
    const li = document.createElement('li');
    li.className = 'card panel';
    li.innerHTML = `<h4>${esc(u.name)} <span class="pips">${u.costs.map((_, i) => `<i class="pip ${i < lvl ? 'on' : ''}"></i>`).join('')}</span></h4><p>${esc(u.desc)}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    if (cost === null) { btn.textContent = 'Maxed'; btn.disabled = true; } else { btn.textContent = `${lvl ? 'Upgrade' : 'Acquire'} · ${cost}`; btn.disabled = campaign.cores < cost; }
    btn.onclick = () => { if (buyUpgrade(campaign, u.id)) { sfx.build(); persist(); renderUpgrades(); } };
    li.appendChild(btn);
    ul.appendChild(li);
  }
  const cl = $('#civ-list');
  cl.innerHTML = '';
  for (const c of CIVS) {
    const owned = campaign.civsUnlocked.includes(c.id);
    const li = document.createElement('li');
    li.className = 'card panel' + (campaign.civ === c.id ? ' selected' : '');
    li.innerHTML = `<h4><span><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</span></h4><p>${esc(c.desc)}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    if (campaign.civ === c.id) { btn.textContent = 'Commanding'; btn.disabled = true; }
    else if (owned) { btn.textContent = 'Command'; btn.onclick = () => { campaign.civ = c.id; persist(); renderUpgrades(); }; }
    else { btn.textContent = `Contact · ${c.cost}`; btn.disabled = campaign.cores < c.cost; btn.onclick = () => { if (unlockCiv(campaign, c.id)) { campaign.civ = c.id; persist(); renderUpgrades(); } }; }
    li.appendChild(btn);
    cl.appendChild(li);
  }
}

// Worlds start straight away. The mission (victory goals, enemy, field notes)
// lives in the in-battle Mission panel (the ? button), not a screen to pass.
async function launch(ref) {
  const saved = campaign.battle;
  if (saved && !(await confirmBox(`Abandon your saved battle (${battleName(saved)})?`))) return;
  campaign.battle = null;
  beginBattle(ref);
}

// ---------- Battle lifecycle ----------

async function beginBattle(ref) {
  if (battlesEnded > 0) await midgameAd();
  startBattle(ref);
}

function startBattle(ref) {
  const rec = campaign.planets[ref.configId];
  if (rec) rec.attempts += 1;
  battle = createBattle(ref.configId, playerLoadout(campaign), {
    difficulty: campaign.settings.difficulty,
    assist: rec ? assistLevel(campaign, ref.configId) : 0,
    seed: Date.now() & 0x7fffffff,
    theme: ref.theme, worldSeed: ref.worldSeed, mode: ref.mode,
    // The training steps run until the planet has been cleared once
    // (a short version for players who finished the standalone tutorial).
    tutorial: rec?.completed ? false : campaign.tutorial.done.length >= TUTORIAL_REWARD.lessons ? 'short' : true,
  });
  enterBattle();
}

function enterBattle() {
  playMusic(battle.theme);
  setAmbience(battle.theme);
  seenTips = new Set(battle.objectivesDone);
  seenAttacks = new Set(battle.attacks.map(a => a.id));
  armed = null; hoverTile = -1; inspectTile = -1; paused = false; speed = 1; endTimer = 0;
  ['#overlay-pause', '#overlay-help', '#overlay-research', '#board', '#objectives', '#banner'].forEach(s => $(s).classList.add('hidden'));
  lastConquered = battle.stats.conquered;
  lastMassing.clear(); intents = [];
  $('#toasts').innerHTML = '';
  const cfg = config(battle);
  const idx = PLANETS.indexOf(cfg);
  $('#hud-planet').textContent = cfg.skirmish ? `Skirmish · ${THEMES[battle.theme].name}` : cfg.name;
  $('#hud-sub').textContent = `${idx >= 0 ? `World ${idx + 1}/5 · ` : ''}${cfg.lesson} · ${battle.difficulty}`;
  buildToolbar();
  show('battle');
  $('#empire').classList.toggle('collapsed', window.innerWidth < 760 && window.innerHeight > window.innerWidth);
  $('#empire-toggle').textContent = $('#empire').classList.contains('collapsed') ? '>' : '<';
  renderer.attach(battle, campaign.settings.simple);
  renderer.setSimple(campaign.settings.simple);
  resize();
  renderer.fit();
  updateHud(true);
  saveBattle();
  if (battle.status === 'spawn') toast(`<b>${esc(cfg.name)}</b> — choose your landing site.`, 'tip', 5000);
}

function saveBattle() {
  if (!battle || (battle.status !== 'playing' && battle.status !== 'spawn')) return;
  campaign.battle = serialize(battle);
  persist();
  lastSave = performance.now();
}

function resumeBattle() {
  const restored = deserialize(campaign.battle);
  if (!restored) { campaign.battle = null; persist(); toast('That saved battle could not be restored.', 'bad'); show('campaign'); return; }
  battle = restored;
  enterBattle();
  toast('Battle resumed.', 'good');
}

const starRow = (n, max = 3) => `<span class="stars" aria-label="${n} of ${max} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(max - n)}</span></span>`;

// Land share over time for every civilization, as a small pixel chart.
function landChart(state) {
  const hist = state.history || [];
  const cvs = document.createElement('canvas');
  const d = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const W = 480, H = 150;
  cvs.width = W * d; cvs.height = H * d;
  cvs.className = 'land-chart';
  const ctx = cvs.getContext('2d');
  ctx.scale(d, d);
  ctx.fillStyle = '#0d0b18'; ctx.fillRect(0, 0, W, H);
  const land = world(state).landCount;
  const pad = { l: 34, r: 8, t: 8, b: 18 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  let top = 0;
  for (const row of hist) for (const v of row) top = Math.max(top, v / land);
  top = Math.max(0.1, Math.ceil(top * 10) / 10);
  ctx.font = '10px "Silkscreen", monospace'; ctx.fillStyle = '#8f88b0'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 2; k++) {
    const y = pad.t + ch - (ch * k) / 2;
    ctx.fillStyle = '#231f3a'; ctx.fillRect(pad.l, Math.round(y), cw, 1);
    ctx.fillStyle = '#8f88b0'; ctx.fillText(`${Math.round((top * 100 * k) / 2)}%`, pad.l - 4, y);
  }
  ctx.textAlign = 'left'; ctx.fillText('0:00', pad.l, H - 8);
  ctx.textAlign = 'right'; ctx.fillText(fmtTime(Math.max(0, (hist.length - 1) * 5)), W - pad.r, H - 8);
  if (hist.length < 2) return cvs;
  const n = hist[0].length;
  // Draw nations first, then the main enemy, then you on top.
  const order = [...Array(n).keys()].filter(i => state.factions[i]).sort((a, b) => {
    const rank = f => (f.id === PLAYER ? 2 : f.kind === 'enemy' ? 1 : 0);
    return rank(state.factions[a]) - rank(state.factions[b]);
  });
  for (const i of order) {
    const f = state.factions[i];
    const lw = f.id === PLAYER ? 3 : f.kind === 'enemy' ? 2 : 1;
    ctx.fillStyle = f.kind === 'nation' ? mixHex(f.color, '#0d0b18', 0.45) : f.color;
    for (let k = 0; k < hist.length; k++) {
      const x = pad.l + Math.round((k / (hist.length - 1)) * (cw - lw));
      const y = pad.t + ch - Math.round(((hist[k][i] || 0) / land / top) * ch);
      const y2 = k + 1 < hist.length ? pad.t + ch - Math.round(((hist[k + 1][i] || 0) / land / top) * ch) : y;
      const x2 = k + 1 < hist.length ? pad.l + Math.round(((k + 1) / (hist.length - 1)) * (cw - lw)) : x + lw;
      ctx.fillRect(x, Math.min(y, y2), Math.max(lw, x2 - x), Math.abs(y2 - y) + lw);
    }
  }
  return cvs;
}

function battleStats(state, result) {
  const items = [
    ['Time', fmtTime(result.time)],
    ['Peak land', `${((result.peakTiles / world(state).landCount) * 100).toFixed(1)}%`],
    ['Battles won', result.battlesWon],
    ['Enemies defeated', result.defeated],
    ['Attacks repelled', result.repelled],
  ];
  return `<div class="stat-grid">${items.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
}

function endTutorialLesson() {
  const cfg = config(battle);
  const won = battle.status === 'won';
  const lesson = cfg.lessonId;
  const body = $('#debrief-body');
  $('#debrief-icon').src = iconURL(won ? 'victory' : 'defeat', 4);
  $('#btn-debrief-replay').classList.remove('hidden');
  $('#btn-debrief-replay').onclick = () => startTutorial(lesson);
  if (won) {
    const bonus = completeLesson(campaign, lesson);
    campaign.battle = null;
    persist();
    $('#debrief-title').textContent = `Lesson ${lesson} complete`;
    $('#debrief-sub').textContent = `${cfg.lesson} · ${campaign.tutorial.done.length}/${TUTORIAL_LESSONS.length} lessons done`;
    body.innerHTML = `<ul class="bullets">${cfg.tutorial.map(s => `<li>${esc(s.label)}</li>`).join('')}</ul>
      ${bonus ? `<p class="reward-ad">Every lesson done: <b>+${bonus} Stellar Cores</b>. Spend them on Command upgrades.</p>` : ''}`;
    const nextLesson = TUTORIAL_LESSONS.find(L => !campaign.tutorial.done.includes(L.id));
    // A new player goes from the first lesson straight into the first world;
    // the other lessons stay one click away.
    const newPlayer = !PLANETS.some(p => campaign.planets[p.id].attempts > 0);
    if (newPlayer || !nextLesson) {
      $('#btn-debrief-primary').textContent = `Play: ${PLANETS[0].name}`;
      $('#btn-debrief-primary').onclick = () => launch({ configId: PLANETS[0].id });
    } else {
      $('#btn-debrief-primary').textContent = `Next: ${nextLesson.name}`;
      $('#btn-debrief-primary').onclick = () => startTutorial(nextLesson.id);
    }
  } else {
    campaign.battle = null;
    persist();
    $('#debrief-title').textContent = 'Lesson not finished';
    $('#debrief-sub').textContent = cfg.lesson;
    body.innerHTML = '<p class="note">Try the lesson again: nobody attacks you, so take your time.</p>';
    $('#btn-debrief-primary').textContent = 'Try again';
    $('#btn-debrief-primary').onclick = () => startTutorial(lesson);
  }
  $('#btn-debrief-secondary').textContent = 'More lessons';
  $('#btn-debrief-secondary').onclick = () => show('tutorial');
  battle = null;
  show('debrief');
}

function endBattle() {
  gameplayStop();
  if (config(battle).tutorialWorld) { endTutorialLesson(); return; }
  const cfg = config(battle);
  const won = battle.status === 'won';
  const body = $('#debrief-body');
  const result = battleResult(battle);
  const chart = landChart(battle);
  const replayRef = cfg.skirmish ? { configId: 'skirmish', theme: battle.theme, worldSeed: battle.seed, mode: battle.mode } : { configId: cfg.id };
  $('#btn-debrief-replay').onclick = () => launch(replayRef);
  $('#debrief-icon').src = iconURL(won ? 'victory' : 'defeat', 4);
  if (won) {
    const stars = starsFor(cfg, result);
    const rewards = computeRewards(campaign, cfg, result);
    applyVictory(campaign, cfg, result, rewards);
    persist();
    happytime();
    const idx = PLANETS.indexOf(cfg);
    const next = idx >= 0 ? nextWorld(campaign, cfg.id) : null;
    $('#debrief-title').textContent = `${cfg.skirmish ? 'World' : cfg.name} conquered`;
    $('#debrief-sub').textContent = `${cfg.lesson} · ${fmtTime(result.time)}`;
    const bonus = Math.ceil(rewards.total / 2);
    body.innerHTML = `<div class="star-box">${starRow(stars.count)}<div class="star-marks">${stars.marks.map(m => `<span class="${m.got ? 'got' : ''}">${m.got ? '★' : '☆'} ${esc(m.label)}</span>`).join('')}</div></div>
      ${battleStats(battle, result)}<div class="chart-slot"></div>
      <table class="reward-table">${rewards.lines.map(l => `<tr><td>${esc(l.label)}</td><td>+${l.value}</td></tr>`).join('')}
      <tr class="total"><td>Stellar Cores earned</td><td>+${rewards.total}</td></tr></table>
      ${platformActive() ? `<p class="reward-ad"><button id="btn-reward-ad" class="btn">Watch an ad: +${bonus} bonus cores</button></p>` : ''}
      <h3>Skills proven</h3><ul class="bullets">${cfg.lessons.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      ${next ? `<div class="next-world panel"><div class="next-orb"></div><div><small>NEXT WORLD</small><b>${esc(next.name)}: ${esc(next.title)}</b><p>${esc(next.lesson)}. ${esc(next.tagline)}</p></div></div>` : ''}`;
    if (next) body.querySelector('.next-orb').appendChild(orbCanvas(next.theme, 56));
    const adBtn = $('#btn-reward-ad');
    if (adBtn) adBtn.onclick = async () => {
      adBtn.disabled = true;
      if (await rewardedAd()) { campaign.cores += bonus; campaign.totalEarned += bonus; persist(); adBtn.textContent = `+${bonus} bonus cores added`; }
      else adBtn.textContent = 'No ad available right now';
    };
    $('#btn-debrief-primary').textContent = next ? `Next: ${next.name}` : cfg.skirmish ? 'New skirmish' : 'Campaign';
    $('#btn-debrief-primary').onclick = () => (next ? launch({ configId: next.id }) : show(cfg.skirmish ? 'skirmish' : 'campaign'));
    $('#btn-debrief-secondary').textContent = 'Command upgrades';
    $('#btn-debrief-secondary').onclick = () => show('upgrades');
  } else {
    const tips = analyzeDefeat(battle);
    applyDefeat(campaign, cfg);
    persist();
    const assist = cfg.skirmish ? 0 : assistLevel(campaign, cfg.id);
    $('#debrief-title').textContent = 'Your civilization has fallen';
    $('#debrief-sub').textContent = `${cfg.skirmish ? 'Skirmish' : cfg.name} · ${fmtTime(battle.time)} · ${cfg.lesson}`;
    body.innerHTML = `${battleStats(battle, result)}<div class="chart-slot"></div><h3>What went wrong</h3><ul class="bullets">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h3>This world tests</h3><ul class="bullets">${cfg.lessons.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      ${assist ? `<p class="assist">Adaptive assist ${assist}/3 active for your next attempt.</p>` : ''}`;
    const ref = { configId: battle.configId, theme: battle.theme, worldSeed: battle.seed, mode: battle.mode };
    $('#btn-debrief-primary').textContent = 'Retry';
    $('#btn-debrief-primary').onclick = () => beginBattle(ref);
    $('#btn-debrief-secondary').textContent = cfg.skirmish ? 'Skirmish menu' : 'Campaign';
    $('#btn-debrief-secondary').onclick = () => show(cfg.skirmish ? 'skirmish' : 'campaign');
  }
  body.querySelector('.chart-slot')?.appendChild(chart);
  $('#btn-debrief-replay').classList.toggle('hidden', won === false);
  battle = null;
  battlesEnded++;
  show('debrief');
}

// ---------- HUD ----------

function toast(html, kind = '', ms = 4200) {
  const box = $('#toasts');
  if ([...box.children].some(c => c.innerHTML === html && !c.classList.contains('out'))) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = html;
  box.appendChild(el);
  const max = window.innerWidth < 760 || window.innerHeight < 520 ? 1 : 4;
  while (box.children.length > max) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// Big centre-screen announcement for milestones such as a captured capital.
let bannerTimer = 0;
function banner(title, sub = '', major = false) {
  const el = $('#banner');
  el.innerHTML = `${esc(title.toUpperCase())}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  el.classList.toggle('major', major);
  el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function tip(key, text) {
  if (!campaign.settings.tips || seenTips.has(key)) return;
  // The training card already explains things step by step.
  if (battle && tutorialStep(battle)?.waitFor && !key.startsWith('warn-')) return;
  seenTips.add(key);
  toast(esc(text), 'tip', 6000);
}

function buildToolbar() {
  const bar = $('#toolbar');
  const f = battle.factions[PLAYER];
  const tools = [
    ...Object.entries(BUILDINGS).map(([id, b]) => ({ kind: 'build', id, key: b.key, label: b.name, icon: spriteIcon(id) })),
    'sep',
    { kind: 'dropship', id: 'dropship', key: '6', label: 'Expedition', icon: iconURL('fleet', 3) },
    { kind: 'ship', id: 'ship', key: '0', label: 'Battleship', icon: iconURL('ship', 3) },
    { kind: 'research', id: 'research', key: 'R', label: 'Research', icon: iconURL('research', 3) },
    'sep',
    ...Object.entries(ABILITIES).map(([id, a]) => ({ kind: 'ability', id, key: a.key, label: a.name.split(' ')[1], icon: iconURL(id, 3), locked: !f.abilities.includes(id) })),
  ];
  bar.innerHTML = '';
  for (const t of tools) {
    if (t === 'sep') { const s = document.createElement('span'); s.className = 'tool-sep'; bar.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'btn tool' + (t.locked ? ' locked' : '');
    b.dataset.kind = t.kind; b.dataset.id = t.id;
    b.dataset.tipFn = 'tool';
    b.setAttribute('aria-label', t.kind === 'build' ? `${BUILDINGS[t.id].name}: ${BUILDINGS[t.id].desc}` : t.label);
    b.innerHTML = `<span class="key">${t.key}</span><img src="${t.icon}" alt="" draggable="false"><span class="label">${esc(t.label)}</span><span class="cost"></span>${t.kind === 'ability' ? '<span class="cd"></span>' : ''}<img class="lockmark" src="${iconURL('lock', 2)}" alt="">`;
    b.onclick = () => { if (performance.now() - dragEndedAt > 350) activateTool(t.kind, t.id); };
    if (t.kind === 'build') b.addEventListener('pointerdown', e => startDrag(e, t.id));
    bar.appendChild(b);
  }
}

// ---------- Drag-and-drop building ----------
// Press a building in the toolbar and drag it onto the map: a ghost follows
// the pointer, green where it can go and red (with the reason) where it
// cannot. Dropping on your own building of the same type upgrades it.
// Esc, or dropping back on the toolbar, cancels. Hotkeys + click still work.
let drag = null;      // { type, pid, x0, y0, cx, cy, active, touch, tile, preview }
let dragEndedAt = 0;

function startDrag(e, type) {
  if (!battle || battle.status !== 'playing' || e.button > 0) return;
  drag = { type, pid: e.pointerId, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, active: false, touch: e.pointerType !== 'mouse', tile: -1, preview: null };
}

function updateDrag() {
  if (!drag?.active) return;
  const el = document.elementFromPoint(drag.cx, drag.cy);
  if (el !== $('#canvas')) { drag.tile = -1; drag.preview = null; return; }
  const r = $('#canvas').getBoundingClientRect();
  // On touch, the ghost floats above the finger so it stays visible.
  const lift = drag.touch ? 36 : 0;
  drag.tile = renderer.screenToTile(drag.cx - r.left, drag.cy - r.top - lift);
  drag.preview = drag.tile >= 0 ? buildPreview(battle, drag.type, drag.tile) : null;
}

// While a finger drags a building near the screen edge, the map slides.
// It only starts once the finger has been well inside the map, so leaving
// the toolbar never scrolls by accident.
function dragAutoPan(dt) {
  if (!drag?.active || !drag.touch) return;
  const r = $('#canvas').getBoundingClientRect(), m = 48, v = 420 * dt;
  const bottom = Math.min(r.bottom, $('#toolbar').getBoundingClientRect().top);
  let dx = 0, dy = 0;
  if (drag.cx < r.left + m) dx = v; else if (drag.cx > r.right - m) dx = -v;
  if (drag.cy < r.top + m) dy = v; else if (drag.cy > bottom - m && drag.cy < bottom) dy = -v;
  if (!dx && !dy) { drag.inside = true; return; }
  if (drag.inside) { renderer.panBy(dx, dy); updateDrag(); }
}

function endDrag(e, cancel = false) {
  const d = drag;
  drag = null;
  if (!d || !d.active) return;
  dragEndedAt = performance.now();
  if (cancel || !battle) return;
  const overBar = document.elementFromPoint(e.clientX, e.clientY)?.closest('#toolbar');
  if (overBar || d.tile < 0) { toast('Building cancelled.', 'tip', 1400); return; }
  const res = playerBuild(battle, d.type, d.tile);
  if (!res.ok) { sfx.error(); toast(REASONS[res.reason] || 'You cannot build there.', 'bad', 2600); }
}

function ghostLabel(p, type) {
  if (!p) return '';
  if (p.ok) return p.upgrade ? `Upgrade to level ${p.level} · ${fmt(p.cost)}` : `${BUILDINGS[type].name} · ${fmt(p.cost)}`;
  if (p.reason === 'maxLevel') return 'Already level 3';
  if (p.reason === 'minerals') return `Need ${fmt(p.cost)} minerals`;
  return { terrain: 'Only on your own flat land', crowded: 'Too close to another structure', coast: 'Must be near the coast' }[p.reason] || 'Cannot build here';
}

function bindDrag() {
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    drag.cx = e.clientX; drag.cy = e.clientY;
    if (!drag.active && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) {
      if (!toolUnlocked('build', drag.type)) { drag = null; return; }
      drag.active = true;
      armed = null;
      clearTimeout(pressTimer);
      hideTooltip();
    }
    updateDrag();
  });
  document.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(e); });
  document.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pid) endDrag(e, true); });
}

function toolUnlocked(kind, id) {
  const open = tutorialUnlocked(battle);
  if (!open) return true;
  if (kind === 'ability' && !battle.factions[PLAYER].abilities.includes(id)) return false;
  return open.has(kind === 'build' ? id : kind === 'ability' ? 'abilities' : kind);
}

function activateTool(kind, id) {
  if (!battle) return;
  if (!toolUnlocked(kind, id)) { sfx.error(); toast('That unlocks later in your training.', 'bad', 2000); return; }
  sfx.click();
  if (kind === 'research') { openResearch(); return; }
  if (kind === 'ability' && !battle.factions[PLAYER].abilities.includes(id)) { toast(REASONS.locked, 'bad', 2500); return; }
  if (armed && armed.kind === kind && armed.id === id) { armed = null; return; }
  armed = { kind, id };
  const hints = {
    build: `Click your land to build a ${BUILDINGS[id]?.name}. Right-click or Esc to cancel.`,
    ship: 'Click the sea (or any spot) to build a battleship at your nearest Starport and send it there.',
    dropship: canDropship(battle) ? 'Click land anywhere to send an expedition from your nearest coast.' : 'You need land on a coast to launch expeditions.',
    ability: { strike: 'Click enemy land to bombard it.', rally: 'Click anywhere to muster troops.', emp: 'Click near enemy hubs, relays, defenses or buildings.' }[id],
  };
  toast(hints[kind], 'tip', 2600);
}

const hasPort = () => battle.buildings.some(b => b.type === 'starport' && battle.owner[b.y * battle.w + b.x] === PLAYER);

function updateToolbar() {
  const f = battle.factions[PLAYER];
  // On narrow screens the bar scrolls sideways: fade its edge while more tools hide there.
  const bar = $('#toolbar');
  bar.classList.toggle('more-right', bar.scrollWidth - bar.scrollLeft - bar.clientWidth > 4);
  bar.classList.toggle('more-left', bar.scrollLeft > 4);
  const open = tutorialUnlocked(battle);
  // During training, tools stay greyed out with a lock until a step introduces
  // them, and Energy and Exotic stay hidden until they matter.
  $('#st-energy').closest('.stat').classList.toggle('hidden', !!open && !open.has('energy'));
  $('#st-exotic').closest('.stat').classList.toggle('hidden', !!open && !open.has('exotic'));
  document.querySelectorAll('.tool').forEach(b => {
    const { kind, id } = b.dataset;
    const trainingLock = !!open && !toolUnlocked(kind, id) && !(kind === 'ability' && !f.abilities.includes(id));
    b.classList.toggle('tut-locked', trainingLock);
    if (trainingLock) { b.querySelector('.cost').textContent = ''; return; }
    const cost = b.querySelector('.cost');
    b.classList.toggle('armed', !!armed && armed.kind === kind && armed.id === id);
    if (kind === 'build') { const c = buildCost(battle, PLAYER, id); cost.textContent = fmt(c); b.disabled = f.minerals < c; }
    else if (kind === 'dropship') { cost.textContent = DROPSHIP_COST; b.disabled = !canDropship(battle) || f.minerals < DROPSHIP_COST; }
    else if (kind === 'ship') { cost.textContent = SHIP_COST.minerals; b.disabled = !hasPort() || f.minerals < SHIP_COST.minerals || f.energy < SHIP_COST.energy; }
    else if (kind === 'research') { cost.textContent = fmt(f.exotic); }
    else if (kind === 'ability') {
      cost.textContent = `${ABILITY_ENERGY[id]}E`;
      if (!f.abilities.includes(id)) return;
      const total = ABILITIES[id].cooldown * (f.cooldown || 1);
      const left = Math.max(0, battle.cooldowns[id] - battle.time);
      b.disabled = !abilityReady(battle, id);
      b.querySelector('.cd').style.width = `${100 * (1 - left / total)}%`;
    }
  });
}

function openResearch() {
  paused = true;
  const f = battle.factions[PLAYER];
  const list = $('#research-list');
  list.innerHTML = '';
  for (const [id, r] of Object.entries(RESEARCH)) {
    const done = f.research.includes(id);
    const card = document.createElement('div');
    card.className = 'card panel';
    card.innerHTML = `<div style="flex:1"><b>${esc(r.name)}</b><p>${esc(r.desc)}</p></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = done ? 'Researched' : `${r.cost} exotic`;
    btn.disabled = done || f.exotic < r.cost;
    btn.onclick = () => { const res = playerResearch(battle, id); if (res.ok) { sfx.build(); openResearch(); } };
    card.appendChild(btn);
    list.appendChild(card);
  }
  $('#overlay-research').classList.remove('hidden');
}

let objKey = '';
function updateObjectives() {
  const cfg = config(battle);
  const cur = currentObjective(battle);
  const conds = cfg.victory.conds.map((c, i) => ({ c, pr: condProgress(battle, c, i) }));
  const next = conds.find(x => !x.pr.done);
  const tut = battle.status === 'playing' ? tutorialStep(battle) : null;
  $('#hud-objective').textContent = battle.status === 'spawn' ? 'Choose your landing site' : tut ? tut.label : cur ? cur.label : next ? next.c.label + (next.pr.text || '') : '';
  $('#obj-count').textContent = cfg.objectives.length ? `${battle.objectivesDone.length}/${cfg.objectives.length}` : '';
  // Victory progress bar: hold timers and land share report real progress.
  const frac = Math.max(...conds.map(x => (x.pr.done ? 1 : x.pr.frac || 0)), 0);
  $('#hud-progress').style.width = `${Math.min(100, frac * 100).toFixed(1)}%`;
  const parts = conds.map(({ c, pr }) => `<div class="obj ${pr.done ? 'done' : ''}"><span class="mark">${pr.done ? '&#10003;' : '&#9733;'}</span><span>${esc(c.label)}${pr.text || ''}${pr.holding ? ' · holding' : ''}</span></div>`);
  parts.push('<div class="obj-sep"></div>');
  for (const o of cfg.objectives) {
    const done = battle.objectivesDone.includes(o.id);
    parts.push(`<div class="obj ${done ? 'done' : cur && cur.id === o.id ? '' : 'pending'}"><span class="mark">${done ? '&#10003;' : cur && cur.id === o.id ? '&#9656;' : '&#9675;'}</span><span>${esc(o.label)}<br><small class="note">${esc(o.tip)}</small></span><span class="rw">+${o.reward}</span></div>`);
  }
  const html = parts.join('');
  if (html !== objKey) { objKey = html; $('#objectives').innerHTML = html; }
}

// ---------- Tooltips ----------
// Anything with data-tip (static text) or data-tip-fn (live content) gets a
// tooltip that follows the pointer. Map tiles get one too. On touch screens a
// long press (450 ms) shows it and swallows the tap.

let tipSource = null;       // the element (or 'map') the tooltip describes
let tipXY = { x: 0, y: 0 };
let swallowClick = false;
let pressTimer = 0;
const LONG_PRESS = 450;

const STAT_TIPS = {
  troops: f => `<b>Troops</b><br>Your army: one pool for attacks and defence. The cap (${fmt(maxTroops(battle, f))}) grows with land and Habitats. Regrows +${fmt(regen(battle, f))}/s, fastest when well below the cap.${f.troops > maxTroops(battle, f) ? '<br><span class="warn">Over the cap: growth pauses until you spend the extra troops.</span>' : ''}`,
  minerals: f => `<b>Minerals</b><br>Spend on buildings and expeditions. +${income(battle, f).minerals.toFixed(1)}/s from your land, Extractors and vents.`,
  energy: f => `<b>Energy</b><br>Powers abilities (7, 8, 9). +${income(battle, f).energy.toFixed(1)}/s from vents and other sites.`,
  exotic: f => `<b>Exotic matter</b><br>Spend on research (R). +${income(battle, f).exotic.toFixed(1)}/s from Research Spires.`,
  land: f => `<b>Land</b><br>${fmt(f.tiles)} tiles, ${((f.tiles / world(battle).landCount) * 100).toFixed(1)}% of the planet. More land means a higher troop cap and more minerals.`,
  ratio: f => `<b>Attack ratio</b><br>Share of your army sent with each attack: now ${fmt(f.troops * ratio)} troops. <kbd>[</kbd> <kbd>]</kbd> adjust it.`,
};

const TIP_FNS = {
  tool(el) {
    const { kind, id } = el.dataset;
    const f = battle.factions[PLAYER];
    if (!toolUnlocked(kind, id) && !(kind === 'ability' && !f.abilities.includes(id))) {
      const name = kind === 'build' ? BUILDINGS[id].name : kind === 'ability' ? ABILITIES[id].name : kind === 'dropship' ? 'Expedition' : kind === 'ship' ? 'Battleship' : 'Research';
      return `<b>${esc(name)}</b><br><span class="no">Locked: your training unlocks it in a later step.</span>`;
    }
    if (kind === 'build') {
      const b = BUILDINGS[id], c = buildCost(battle, PLAYER, id);
      return `<b>${esc(b.name)}</b> <kbd>${b.key}</kbd><br>${esc(b.desc)}<br><span class="${f.minerals >= c ? 'ok' : 'no'}">Cost ${fmt(c)} minerals</span> (you have ${fmt(f.minerals)}). Each one you own costs more.<br><span class="dim">Use it on one of your own ${esc(b.name)}s to upgrade it (up to level 3).</span>`;
    }
    if (kind === 'dropship') return `<b>Expedition</b> <kbd>6</kbd><br>Send your attack ratio of troops to land anywhere, even across the sea. Launches from your fastest coast; each Starport level makes it 40% faster.${canDropship(battle) ? '' : ' <span class="no">You hold no coast.</span>'}<br>Cost ${DROPSHIP_COST} minerals. Clicking land on another continent sends one automatically.`;
    if (kind === 'ship') {
      const n = battle.ships.filter(x => x.owner === PLAYER).length;
      return `<b>Battleship</b> <kbd>0</kbd><br>Built at your Starport nearest the spot you click, then sails there by sea. Every few seconds it shells enemy coast in range, fights enemy ships and cuts down passing enemy expeditions.${hasPort() ? '' : ' <span class="no">Build a Starport first.</span>'}<br>Cost ${SHIP_COST.minerals} minerals + ${SHIP_COST.energy} energy. You have ${n}. Right-click the sea to move your fleet.`;
    }
    if (kind === 'research') return `<b>Research</b> <kbd>R</kbd><br>Spend exotic matter on upgrades that last this battle. You have ${fmt(f.exotic)} exotic.`;
    const a = ABILITIES[id], u = UPGRADES.find(x => x.id === id);
    const owned = f.abilities.includes(id);
    return `<b>${esc(a.name)}</b> <kbd>${a.key}</kbd><br>${esc(u.desc.replace(/^Ability: (.)/, (_, c) => c.toUpperCase()))}<br>Cooldown ${Math.round(a.cooldown * (f.cooldown || 1))}s.${owned ? '' : ' <span class="no">Unlock it in Command upgrades.</span>'}`;
  },
  stat(el) { return STAT_TIPS[el.dataset.stat](battle.factions[PLAYER]); },
  exile() {
    const f = battle.factions[PLAYER], home = homeCapital(battle, PLAYER);
    const holder = home ? battle.factions[battle.owner[home.y * battle.w + home.x]] : null;
    const pct = k => `${Math.round((1 - k) * 100)}%`;
    return `<b>Capital lost</b><br>${holder ? `${esc(holder.name)} holds ${esc(home.name)}. ` : ''}Until you retake it: troop growth −${pct(EXILE.growth)}, income −${pct(EXILE.income)}, troop cap −${pct(EXILE.cap)}, one attack front fewer.<br>${f.seat ? 'Your provisional capital keeps your supply lines together. If it falls too, you are in disarray again.' : `Disarray: no capital at all, so all your land counts as cut off. A provisional capital is set up in ${Math.max(0, Math.ceil(f.exile.seatAt - battle.time))} s.`}<br><span class="dim">You are defeated only when you lose all your land.</span>`;
  },
  event() {
    const ev = eventPhase(battle);
    return ev.type ? `<b>${esc(EVENT_TEXT[ev.type].name)}</b><br>${esc(EVENT_TEXT[ev.type].start)}` : '';
  },
};

function tipHtml(el) {
  if (el.dataset.tipFn) return battle && TIP_FNS[el.dataset.tipFn] ? TIP_FNS[el.dataset.tipFn](el) : '';
  return esc(el.dataset.tip || '');
}

// What a map tile is: owner and personality, terrain cost and defence, nearby site or building.
function tileTip(i) {
  const w = world(battle);
  const t = w.terrain[i];
  const x = i % battle.w, y = (i - x) / battle.w;
  const o = battle.owner[i];
  const f = o ? battle.factions[o] : null;
  const names = THEMES[battle.theme].names;
  const ter = TERRAIN[t];
  const parts = [];
  if (f) {
    const p = persona(f);
    const att = o !== PLAYER && attitude(battle, o);
    parts.push(`<b style="color:${f.color}">${esc(o === PLAYER ? 'Your empire' : f.name)}</b>${p ? ` · ${esc(p.name)}` : ''}<br>${fmt(f.tiles)} tiles · ${fmt(f.troops)} troops`);
    if (p) parts.push(`<span class="dim">${esc(p.desc)}</span>`);
    if (att) parts.push(`Attitude to you: <span class="${att.cls}">${esc(att.label)}</span>${att.label === 'At war' || att.label === 'Teammate' ? '' : ` (trust ${att.trust})`}`);
  } else if (isLand(t)) parts.push('<b>Unclaimed wilderness</b>');
  if (isLand(t)) {
    const cont = (w.continents || []).find(c => c.id === w.comp[i]);
    parts.push(`${esc(names[ter.id])}${cont ? ` on ${esc(cont.name)}` : ''}: attack cost ×${ter.cost} · defence ×${tileDefense(battle, i).toFixed(2)}`);
  }
  else parts.push(`<b>${esc(names[ter.id])}</b><br>Water. Cross it with an expedition (6) from any of your coasts.`);
  const site = battle.sites.find(s => Math.abs(s.x - x) <= 2 && Math.abs(s.y - y) <= 2);
  if (site) parts.push(`<b>${esc(site.name)}</b>: ${esc(SITE_TYPES[site.type].desc)}`);
  const bld = battle.buildings.find(b => Math.abs(b.x - x) <= 2 && Math.abs(b.y - y) <= 2);
  if (bld) {
    const lvl = bld.level || 1;
    parts.push(`<b>${esc(BUILDINGS[bld.type].name)}</b> · level ${lvl}/3: ${esc(BUILDINGS[bld.type].desc)}`);
    if (armed?.kind === 'build' && armed.id === bld.type && o === PLAYER) {
      parts.push(lvl >= 3 ? '<span class="no">Already at the highest level.</span>' : `<span class="ok">Click to upgrade to level ${lvl + 1} for ${fmt(levelUpCost(bld, battle))} minerals.</span>`);
    }
  }
  if (battle.status === 'playing' && isLand(t) && o !== PLAYER && !armed) {
    const near = borders(battle, PLAYER, o);
    const sea = !near && routeTile === i && routeKind === 'sea';
    if (sea) parts.push(`<span class="ok">Across the sea: click to send an expedition of ${fmt(battle.factions[PLAYER].troops * ratio)} troops.</span><br><span class="dim">${routeEta ? `Arrives in ${Math.ceil(routeEta)} s. ` : ''}Costs ${DROPSHIP_COST} minerals.</span>`);
    else parts.push(`<span class="ok">Click to ${near ? 'attack' : 'march there'} with ${fmt(battle.factions[PLAYER].troops * ratio)} troops.</span>${near ? '' : '<br><span class="dim">The dotted line shows the route.</span>'}`);
  }
  return parts.join('<br>');
}

function showTooltip(html, x, y) {
  const el = $('#tooltip');
  if (!html) { hideTooltip(); return; }
  if (el.innerHTML !== html) el.innerHTML = html;
  el.classList.remove('hidden');
  placeTooltip(x, y);
}

function placeTooltip(x, y) {
  tipXY = { x, y };
  const el = $('#tooltip');
  const r = el.getBoundingClientRect();
  let left = x + 12, top = y + 12;
  if (left + r.width > window.innerWidth - 4) left = x - 12 - r.width;
  if (top + r.height > window.innerHeight - 4) top = y - 12 - r.height;
  el.style.left = `${Math.max(4, Math.round(left))}px`;
  el.style.top = `${Math.max(4, Math.round(top))}px`;
}

function hideTooltip() {
  $('#tooltip').classList.add('hidden');
  tipSource = null;
}

// Called with the HUD refresh so costs, rates and the hovered tile stay live.
function refreshTooltip() {
  if (tipSource && tipSource !== 'map') {
    if (!tipSource.isConnected || tipSource.closest('.hidden')) hideTooltip();
    else showTooltip(tipHtml(tipSource), tipXY.x, tipXY.y);
  } else if (tipSource === 'map') {
    if (hoverTile >= 0 && battle && battle.status !== 'spawn' && !gesture?.moved) showTooltip(tileTip(hoverTile), tipXY.x, tipXY.y);
    else hideTooltip();
  }
}

function initTooltips() {
  // Native title tooltips would double up with ours.
  document.querySelectorAll('[title]').forEach(el => {
    el.dataset.tip = el.title;
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title);
    el.removeAttribute('title');
  });
  const tipTarget = e => e.target.closest?.('[data-tip], [data-tip-fn]');
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = tipTarget(e);
    if (el) { tipSource = el; showTooltip(tipHtml(el), e.clientX, e.clientY); }
    else if (e.target.id === 'canvas' && battle) tipSource = 'map';
    else if (tipSource) hideTooltip();
  });
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    // The battle screen can appear under a resting cursor without a pointerover.
    if (!tipSource && e.target.id === 'canvas' && battle) tipSource = 'map';
    if (tipSource === 'map') { tipXY = { x: e.clientX, y: e.clientY }; refreshTooltip(); }
    else if (tipSource) placeTooltip(e.clientX, e.clientY);
  });
  document.documentElement.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideTooltip(); });
  // Touch: long press shows the tooltip and swallows the tap that follows.
  document.addEventListener('pointerdown', e => {
    if (!$('#tooltip').classList.contains('hidden') && e.pointerType === 'touch') hideTooltip();
    if (e.pointerType !== 'touch') return;
    const el = tipTarget(e);
    if (!el) return;
    const { clientX: x, clientY: y } = e;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => { tipSource = el; swallowClick = true; showTooltip(tipHtml(el), x, y - 40); }, LONG_PRESS);
  }, true);
  const cancelPress = () => clearTimeout(pressTimer);
  document.addEventListener('pointerup', cancelPress, true);
  document.addEventListener('pointercancel', cancelPress, true);
  document.addEventListener('click', e => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault(); e.stopPropagation();
  }, true);
}

// ---------- Route preview ----------
// Hovering land you don't border shows the route a click would march along.
let routeTile = -1, routeAt = 0, routePath = null, routeKind = null, routeEta = 0;
function updateRoutePreview() {
  if (!battle || battle.status !== 'playing' || armed || hoverTile < 0 || tipSource !== 'map') { routePath = null; return; }
  const i = hoverTile, o = battle.owner[i];
  if (o === PLAYER || !isLand(world(battle).terrain[i]) || borders(battle, PLAYER, o)) { routePath = null; routeTile = -1; return; }
  const now = performance.now();
  if (i === routeTile || now - routeAt < 250) return;
  routeTile = i; routeAt = now;
  const r = planRoute(battle, PLAYER, i);
  routePath = r && r.kind === 'land' ? r.path : null;
  routeKind = r ? r.kind : null;
  routeEta = r && r.kind === 'sea' ? expeditionPlan(battle, PLAYER, i)?.eta || 0 : 0;
}

// ---------- Radial menu ----------
// Right-click (or long-press on touch) a spot on the map: Attack, Expedition,
// Build, diplomacy (Ally, send troops or minerals, Betray) and Info.

function radialItems(i) {
  const o = battle.owner[i], t = world(battle).terrain[i];
  const f = o ? battle.factions[o] : null;
  const land = isLand(t);
  const allied = !!(o && o !== PLAYER && isAllied(battle, PLAYER, o));
  const items = [];
  if (battle.status !== 'playing') return items;
  const act = (kind, id) => () => { armed = kind ? { kind, id } : null; clickTile(i); armed = null; };
  if (land && o !== PLAYER && !allied) items.push({ icon: iconURL('attack', 3), label: 'Attack', act: act(null) });
  if (land && o !== PLAYER && !allied && canDropship(battle) && toolUnlocked('dropship', 'dropship')) items.push({ icon: iconURL('fleet', 3), label: 'Expedition', act: act('dropship', 'dropship') });
  if (!land && battle.ships.some(s => s.owner === PLAYER)) items.push({ icon: iconURL('ship', 3), label: 'Move fleet', act: () => { const r = playerMoveFleet(battle, i); if (!r.ok) toast(REASONS[r.reason] || 'No sea route there.', 'bad', 2500); } });
  if (o === PLAYER) {
    for (const [id, b] of Object.entries(BUILDINGS)) {
      if (!toolUnlocked('build', id)) continue;
      items.push({ icon: spriteIcon(id), label: `${b.name.split(' ')[0]} ${fmt(buildCost(battle, PLAYER, id))}`, act: act('build', id) });
    }
  }
  if (f && o !== PLAYER && f.kind !== 'enemy' && attitude(battle, o).label !== 'At war') {
    if (!allied) {
      items.push({ icon: iconURL('crown', 3), label: 'Ally', act: () => {
        const r = requestAlliance(battle, o);
        if (!r.ok) toast(r.reason === 'refused' ? `${esc(f.name)} declined. They need ${r.need} more trust: gifts help.` : REASONS[r.reason] || 'They refused.', 'bad', 3500);
      } });
    }
    const me = battle.factions[PLAYER];
    items.push({ icon: iconURL('troops', 3), label: `Send ${fmt(me.troops * 0.1)}`, act: () => gift(battle, o, 'troops', me.troops * 0.1) });
    items.push({ icon: iconURL('minerals', 3), label: 'Send 100', act: () => { const r = gift(battle, o, 'minerals', 100); if (!r.ok) toast(REASONS[r.reason] || 'Not enough minerals.', 'bad', 2500); } });
    if (allied && attitude(battle, o).label !== 'Teammate') {
      items.push({ icon: iconURL('enemy', 3), label: 'Betray', act: async () => { if (await confirmBox(`Break your alliance with ${f.name}? Every nation will trust you less.`)) betray(battle, o); } });
    }
  }
  items.push({ icon: iconURL('map', 3), label: 'Info', act: () => { inspectTile = i; inspectorClosed = false; } });
  return items;
}

function openRadial(i, cx, cy) {
  if (!battle || battle.status !== 'playing') return;
  const items = radialItems(i);
  const el = $('#radial');
  const o = battle.owner[i];
  const title = o ? (o === PLAYER ? 'Your land' : battle.factions[o].name) : isLand(world(battle).terrain[i]) ? 'Wilderness' : 'Sea';
  const R = items.length > 6 ? 78 : 64;
  el.innerHTML = `<div class="rcenter">${esc(title)}${isTraitor(battle) ? '<br><small class="no">traitor</small>' : ''}</div>` + items.map((it, k) => {
    const a = -Math.PI / 2 + (k / items.length) * Math.PI * 2;
    return `<button class="ritem" data-k="${k}" style="left:${Math.round(Math.cos(a) * R)}px;top:${Math.round(Math.sin(a) * R)}px"><img src="${it.icon}" alt=""><span>${esc(it.label)}</span></button>`;
  }).join('');
  const m = R + 40;
  el.style.left = `${Math.max(m, Math.min(window.innerWidth - m, cx))}px`;
  el.style.top = `${Math.max(m, Math.min(window.innerHeight - m, cy))}px`;
  el.classList.remove('hidden');
  el.onpointerdown = e => {
    e.stopPropagation();
    const b = e.target.closest('.ritem');
    if (!b) return;
    closeRadial();
    sfx.click();
    items[Number(b.dataset.k)].act();
  };
  hideTooltip();
}

function closeRadial() {
  $('#radial').classList.add('hidden');
}

// ---------- Battle panel ----------
// One row per battle you are in: your troops vs theirs, biggest first.
// Rows for your attacks have a Retreat button; attacks on you are marked
// Incoming. Finished battles flash their result, then fade out.

let finishedBattles = [];
let battlesOpen = true;
let battlesKey = '';

function battleGroups() {
  const groups = new Map();
  for (const a of battle.attacks) {
    if (a.attacker !== PLAYER && a.target !== PLAYER) continue;
    const out = a.attacker === PLAYER;
    const key = out ? `out${a.target}` : `in${a.attacker}`;
    if (!groups.has(key)) groups.set(key, { key, out, other: out ? a.target : a.attacker, mine: 0, theirs: 0, attacks: [] });
    const g = groups.get(key);
    if (out) g.mine += a.troops; else g.theirs += a.troops;
    g.attacks.push(a);
  }
  const me = battle.factions[PLAYER];
  for (const g of groups.values()) {
    if (g.out) g.theirs = g.other ? battle.factions[g.other].troops : null;
    else g.mine = me.troops;
  }
  return [...groups.values()].sort((a, b) => (b.mine + (b.theirs || 0)) - (a.mine + (a.theirs || 0)));
}

function battleFront(g) {
  let sx = 0, sy = 0, n = 0;
  for (const a of g.attacks) {
    if (a.lx !== undefined) { sx += a.lx; sy += a.ly; n++; } else if (a.focus != null) { sx += a.focus % battle.w; sy += Math.floor(a.focus / battle.w); n++; }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

function battleEnded(n) {
  const out = n.attacker === PLAYER;
  const other = out ? n.target : n.attacker;
  const name = other ? battle.factions[other].name : 'Wilderness';
  const key = out ? `out${other}` : `in${other}`;
  let text, cls;
  if (out) {
    text = n.retreat ? `Retreated from ${name}: ${fmt(n.returned)} came home` : n.won ? `Won vs ${name}: ${fmt(n.returned)} survivors returned` : `Stalled vs ${name}: ${fmt(n.returned)} returned`;
    cls = n.won && !n.retreat ? 'won' : 'lost';
    if (n.returned > 0 && n.x !== null) {
      renderer.pop(n.x, n.y, `+${fmt(n.returned)} returned`, '#7fe8ff');
      const cap = capitalOf(battle, PLAYER);
      if (cap) renderer.march(n.x, n.y, cap.x, cap.y, battle.factions[PLAYER].color);
      const row = $('#st-troops').closest('.stat');
      row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    }
  } else {
    text = n.repelled ? `${name}'s attack repelled` : `${name} took ground from you`;
    cls = n.repelled ? 'won' : 'lost';
  }
  finishedBattles = finishedBattles.filter(f => f.key !== key);
  finishedBattles.push({ key, text, cls, until: performance.now() + 3000 });
}

function updateBattles() {
  const box = $('#battles'), chip = $('#battles-chip');
  if (battle.status !== 'playing') { box.classList.add('hidden'); chip.classList.add('hidden'); return; }
  const groups = battleGroups();
  const now = performance.now();
  finishedBattles = finishedBattles.filter(f => f.until > now && !groups.some(g => g.key === f.key));
  const total = groups.length + finishedBattles.length;
  // Phones: a summary chip that opens the list.
  const compact = window.innerWidth < 760 || window.innerHeight < 520;
  chip.classList.toggle('hidden', !compact || !groups.length);
  chip.innerHTML = `<img class="vs" src="${iconURL('attack', 2)}" alt=""> ${groups.length} battle${groups.length === 1 ? '' : 's'}`;
  const show = total > 0 && (!compact || battlesOpen);
  box.classList.toggle('hidden', !show);
  if (!show) return;
  const me = battle.factions[PLAYER];
  const rows = groups.slice(0, 5).map(g => {
    const f = g.other ? battle.factions[g.other] : null;
    const theirName = f ? f.name : 'Wilderness';
    const share = g.theirs === null ? 1 : g.mine / Math.max(1, g.mine + g.theirs);
    return `<div class="brow ${g.out ? 'out' : 'in'}" data-key="${g.key}">
      <div class="line"><span class="who" style="color:${me.color}">${esc(me.name)}</span><b>${fmt(g.mine)}</b><img class="vs" src="${iconURL('attack', 2)}" alt="vs"><b>${g.theirs === null ? '—' : fmt(g.theirs)}</b><span class="who" style="color:${f ? f.color : 'var(--muted)'}">${esc(theirName)}</span>${g.out ? `<button class="btn small retreat" data-retreat="${g.other}" data-tip="Recall this attack: survivors come home minus 25%.">Retreat</button>` : '<span class="tag">INCOMING</span>'}</div>
      <div class="bbar"><i style="width:${(share * 100).toFixed(0)}%;background:${me.color}"></i></div></div>`;
  });
  if (groups.length > 5) rows.push(`<div class="more">+${groups.length - 5} more</div>`);
  for (const f of finishedBattles) rows.push(`<div class="brow done ${f.cls}${f.until - now < 800 ? ' fade' : ''}">${esc(f.text)}</div>`);
  const html = rows.join('');
  if (html !== battlesKey) { battlesKey = html; box.innerHTML = html; }
}

function initBattlePanel() {
  // pointerdown, not click: rows re-render several times a second.
  $('#battles').addEventListener('pointerdown', e => {
    if (!battle) return;
    const rb = e.target.closest('[data-retreat]');
    if (rb) {
      e.stopPropagation();
      const res = playerRetreat(battle, Number(rb.dataset.retreat));
      if (res.ok) sfx.click();
      return;
    }
    const row = e.target.closest('.brow[data-key]');
    if (!row) return;
    const g = battleGroups().find(x => x.key === row.dataset.key);
    const p = g && battleFront(g);
    if (p) { renderer.centerOn(p.x, p.y); sfx.click(); }
  });
  $('#battles-chip').onclick = () => { battlesOpen = !battlesOpen; updateBattles(); };
  // Any press outside the radial menu closes it.
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#radial')) closeRadial(); }, true);
}

// ---------- Enemy intent ----------
// Scouting decides how much you see: the main enemy's attacks on you are
// always marked; independent nations' need scouting level 1. Level 1 adds
// attack sizes, level 3 live troop counts.

let intents = [];
const lastMassing = new Map();

function updateIntents() {
  const scout = battle.factions[PLAYER].scouting || 0;
  intents = [];
  for (const a of battle.attacks) {
    if (a.target !== PLAYER || !a.frontier) continue;
    const f = battle.factions[a.attacker];
    if (f.kind !== 'enemy' && scout < 1) continue;
    let sx = 0, sy = 0, n = 0;
    const front = a.frontier.v;
    for (let k = 0; k < front.length && n < 200; k++) {
      const i = front[k];
      if (battle.owner[i] !== PLAYER) continue;
      sx += i % battle.w; sy += Math.floor(i / battle.w); n++;
    }
    if (!n) continue;
    const x1 = sx / n, y1 = sy / n;
    let x0 = a.ox ?? f.sx / Math.max(1, f.tiles), y0 = a.oy ?? f.sy / Math.max(1, f.tiles);
    // Keep arrows short: they start a little way back inside the attacker's land.
    const len = Math.hypot(x1 - x0, y1 - y0), max = 24 * mapScale(battle);
    if (len > max) { x0 = x1 + ((x0 - x1) / len) * max; y0 = y1 + ((y0 - y1) / len) * max; }
    const troops = scout >= 3 ? a.troops : a.initial;
    intents.push({
      x0, y0, x1, y1, color: f.kind === 'enemy' ? '#ff4b3e' : mixHex(f.color, '#ff4b3e', 0.4),
      weight: Math.min(1.6, 0.7 + troops / (1500 * mapScale(battle) ** 2)), label: scout >= 1 ? fmt(troops) : '',
    });
  }
  // Massing warnings: a neighbour near its troop cap is about to strike.
  for (const f of battle.factions) {
    if (!f || f.id === PLAYER || !f.alive || !f.profile) continue;
    if (f.kind !== 'enemy' && scout < 2) continue;
    if (f.troops < maxTroops(battle, f) * 0.8 || !borders(battle, f.id, PLAYER)) continue;
    if (battle.time - (lastMassing.get(f.id) ?? -99) < 30) continue;
    lastMassing.set(f.id, battle.time);
    toast(`${esc(f.name)} is massing ${fmt(f.troops)} troops on your border.`, 'bad', 3500);
    sfx.alarm();
  }
}

function persona(f) {
  return f.persona && PERSONAS[f.persona];
}

// ---------- Training ----------

let tutPointer = null, tutPointerAt = 0, tutKey = '';

// Touch-first devices get tap pictures and no key caps.
const touchFirst = () => !!window.matchMedia?.('(pointer: coarse)').matches;

// One-time controls card: a drawing of the mouse (or finger) and keys. It
// fades out after the first attack and never comes back.
function updateControlsHelp() {
  const el = $('#controls-help');
  if (!campaign || campaign.settings.controlsSeen || battle.status !== 'playing') { el.classList.add('hidden'); return; }
  if (battle.flags.attacked) {
    campaign.settings.controlsSeen = true; persist();
    el.classList.add('fade');
    setTimeout(() => el.classList.add('hidden'), 700);
    return;
  }
  if (!el.dataset.built) {
    el.dataset.built = '1';
    const item = (icon, label) => `<span class="ctl"><img src="${iconURL(icon, 3)}" alt="">${label}</span>`;
    el.innerHTML = touchFirst()
      ? item('hand', 'Tap: attack') + item('drag', 'Drag: move') + item('wheel', 'Pinch: zoom')
      : item('mouse', 'Click: attack') + item('drag', 'Drag: move') + item('wheel', 'Wheel: zoom') + '<span class="ctl"><kbd class="cap">1</kbd>–<kbd class="cap">5</kbd> build</span><span class="ctl"><kbd class="cap">␣</kbd> pause</span>';
  }
  el.classList.remove('hidden', 'fade');
}

// One-line hints the first time a feature becomes useful (after the
// training has unlocked everything).
const HINTS = [
  { key: 'hint-extractor', when: (b, f) => f.minerals >= buildCost(b, PLAYER, 'extractor') * 1.6, text: () => `Spare minerals: drag an Extractor${touchFirst() ? '' : ' (2)'} for more income.` },
  { key: 'hint-defend', when: b => b.attacks.some(a => a.target === PLAYER && a.attacker && b.factions[a.attacker].kind !== 'player'), text: () => `Under attack! A Bastion${touchFirst() ? '' : ' (4)'} makes nearby land much harder to take.` },
  { key: 'hint-sea', when: b => b.time > 90 && canDropship(b), text: () => 'Click land across the sea to send an expedition.' },
  { key: 'hint-ability', when: (b, f) => f.abilities.length > 0 && f.energy >= Math.min(...f.abilities.map(id => ABILITY_ENERGY[id])), text: () => `Ability ready${touchFirst() ? ': tap Strike, Muster or Pulse.' : ': press 7, 8 or 9.'}` },
  { key: 'hint-research', when: (b, f) => f.exotic >= 40, text: () => `Research ready${touchFirst() ? ': tap Research.' : ': press R.'}` },
];
let hintAt = 0;
function contextHints() {
  if (!battle || battle.status !== 'playing' || config(battle).tutorialWorld || performance.now() - hintAt < 1000) return;
  hintAt = performance.now();
  const f = battle.factions[PLAYER];
  for (const h of HINTS) if (!seenTips.has(h.key) && toolUnlocked('build', 'extractor') && h.when(battle, f)) { tip(h.key, h.text()); return; }
}

function findPointer(step) {
  const st = battle, W = st.w;
  const cap = st.sites.find(s => s.id === 'player-capital');
  if (!step.point || !cap) return null;
  if (step.point.startsWith('site:')) {
    const what = step.point.slice(5);
    const list = st.sites.filter(s => (s.id === what || s.type === what) && siteOwner(st, s) !== PLAYER);
    list.sort((a, b) => Math.hypot(a.x - cap.x, a.y - cap.y) - Math.hypot(b.x - cap.x, b.y - cap.y));
    return list[0] ? { x: list[0].x, y: list[0].y } : null;
  }
  if (step.point !== 'frontier') return null;
  // Keep pointing at the same tile while it is still a valid target.
  const touches = i => st.owner[i - 1] === PLAYER || st.owner[i + 1] === PLAYER || st.owner[i - W] === PLAYER || st.owner[i + W] === PLAYER;
  const terrain = world(st).terrain;
  if (tutPointer) { const i = tutPointer.y * W + tutPointer.x; if (st.owner[i] === 0 && touches(i)) return tutPointer; }
  // Otherwise unclaimed land on the border near the middle of the visible map
  // (never under a HUD panel), preferring cheap terrain.
  const r = $('#canvas').getBoundingClientRect(), ins = renderer.insets;
  const mid = renderer.screenToTileF((ins.left + r.width - ins.right) / 2, (ins.top + r.height - ins.bottom) / 2);
  const ax = (cap.x + mid.x) / 2, ay = (cap.y + mid.y) / 2;
  let best = -1, bd = Infinity;
  for (let y = 1; y < st.h - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (st.owner[i] !== 0 || !isLand(terrain[i]) || !touches(i)) continue;
      const dd = Math.hypot(x - ax, y - ay) + (TERRAIN[terrain[i]].cost - 1) * 6;
      if (dd < bd) { bd = dd; best = i; }
    }
  }
  return best < 0 ? null : { x: best % W, y: Math.floor(best / W) };
}

function updateTutorial() {
  const card = $('#tutorial');
  const step = battle.status === 'playing' ? tutorialStep(battle) : null;
  document.querySelectorAll('.glow').forEach(el => el.classList.remove('glow'));
  if (!step) { if (!card.classList.contains('hidden')) { card.classList.add('hidden'); resize(); } tutPointer = null; return; }
  const steps = tutorialSteps(battle);
  const key = `${battle.tutorial}`;
  if (key !== tutKey) {
    tutKey = key;
    // One short line plus a picture: an animated mouse or finger, and the key caps.
    const icon = step.icon === 'click' && touchFirst() ? 'hand' : step.icon === 'click' ? 'mouse' : step.icon;
    const keys = touchFirst() ? [] : step.keys || [];
    const visual = icon || keys.length ? `<span class="tut-visual">${icon ? `<img class="tut-icon anim-${step.icon}" src="${iconURL(icon, 4)}" alt="">` : ''}${keys.map(k => `<kbd class="cap">${esc(k)}</kbd>`).join('')}</span>` : '';
    const text = touchFirst() ? step.text.replace(/^Click/, 'Tap').replace(/, then click/, ', then tap') : step.text;
    card.innerHTML = `<div class="tut-head"><span>TRAINING ${battle.tutorial + 1}/${steps.length}</span><button class="btn small ghost" id="btn-tut-skip" data-tip="Unlock every tool and stop the training.">Skip</button></div><div class="tut-row">${visual}<p>${esc(text)}</p></div>`;
    $('#btn-tut-skip').onclick = () => { skipTutorial(battle); sfx.click(); toast('Training skipped. Everything is unlocked; the field manual (?) has the details.', 'tip', 4000); updateHud(true); };
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    tutPointer = null; tutPointerAt = 0;
  }
  if (card.classList.contains('hidden') || key !== card.dataset.laid) { card.classList.remove('hidden'); card.dataset.laid = key; resize(); }
  const now = performance.now();
  if (now - tutPointerAt > 1000) { tutPointerAt = now; tutPointer = findPointer(step); }
  const p = step.point || '';
  if (p.startsWith('el:')) document.querySelector(p.slice(3))?.classList.add('glow');
  if (p.startsWith('tool:')) document.querySelector(`.tool[data-id="${p.slice(5)}"]`)?.classList.add('glow');
  if (p === 'ratio') {
    $('#empire .ratio').classList.add('glow');
    if ($('#empire').classList.contains('collapsed')) $('#empire-toggle').classList.add('glow');
  }
}

function updateBoard() {
  if ($('#board').classList.contains('hidden')) return;
  const land = world(battle).landCount;
  const rows = battle.factions.filter(f => f && f.alive).sort((a, b) => b.tiles - a.tiles).slice(0, 10);
  $('#board').innerHTML = `<table><tr><th>#</th><th>Civilization</th><th>Land</th><th>Troops</th></tr>${rows.map((f, i) => `<tr class="${f.id === PLAYER ? 'me' : ''}"><td>${i + 1}</td><td><span class="sw" style="background:${f.color}"></span>${esc(f.id === PLAYER ? `${f.name} (you)` : f.name)}${persona(f) ? `<small class="persona" data-tip="${esc(persona(f).desc)}">${esc(persona(f).name)}${f.id !== PLAYER && isAllied(battle, PLAYER, f.id) ? ' · <span class="ally">ally</span>' : ''}</small>` : ''}</td><td>${((f.tiles / land) * 100).toFixed(1)}%</td><td>${fmt(f.troops)}</td></tr>`).join('')}</table>`;
}

function updateInspector() {
  const el = $('#inspector');
  // Hovering shows a tooltip; the inspector is the pinned card for a clicked tile.
  const i = inspectTile;
  // One source of truth: while the hover tooltip describes another tile, the pinned card steps aside.
  const hoveringElsewhere = tipSource === 'map' && hoverTile >= 0 && hoverTile !== i;
  if (!battle || i < 0 || battle.status === 'spawn' || inspectorClosed || hoveringElsewhere) { el.classList.add('hidden'); return; }
  const w = world(battle);
  const t = w.terrain[i];
  const x = i % battle.w, y = (i - x) / battle.w;
  const o = battle.owner[i];
  const f = o ? battle.factions[o] : null;
  const me = battle.factions[PLAYER];
  const scout = me.scouting || 0;
  const names = THEMES[battle.theme].names;
  const site = battle.sites.find(s => Math.abs(s.x - x) <= 2 && Math.abs(s.y - y) <= 2);
  let html = `<h4>${f ? `<span class="sw" style="display:inline-block;width:10px;height:10px;background:${f.color}"></span>${esc(o === PLAYER ? 'Your empire' : f.name)}` : isLand(t) ? 'Unclaimed wilderness' : esc(names[TERRAIN[t].id])}</h4>`;
  if (f) {
    const attacking = battle.attacks.filter(a => a.attacker === o).reduce((s, a) => s + a.troops, 0);
    html += `<div class="row"><span>${o === PLAYER ? 'Civilization' : f.kind === 'enemy' ? 'Hostile civilization' : 'Independent nation'}</span><b>${fmt(f.tiles)} tiles</b></div>`;
    html += `<div class="row"><span>Troops</span><b>${fmt(f.troops)} / ${fmt(maxTroops(battle, f))}</b></div>`;
    if (persona(f)) html += `<div class="row"><span>Personality</span><b>${esc(persona(f).name)}</b></div><div class="note">${esc(persona(f).desc)}</div>`;
    if (o !== PLAYER && scout >= 1) {
      html += `<div class="row"><span>Garrison density</span><b>${(f.troops / Math.max(1, f.tiles)).toFixed(1)}/tile</b></div>`;
      html += `<div class="row"><span>Attacking troops</span><b style="color:#ff6b6b">${fmt(attacking)}</b></div>`;
    }
  }
  if (isLand(t)) {
    const def = tileDefense(battle, i);
    html += `<div class="row"><span>Terrain</span><b>${esc(names[TERRAIN[t].id])}</b></div>`;
    html += `<div class="row"><span>Defense here</span><b>×${def.toFixed(2)}</b></div>`;
  }
  if (site) {
    const so = siteOwner(battle, site);
    const st = SITE_TYPES[site.type];
    let extra = '';
    if (site.type === 'turret') extra = isPowered(battle, site) ? ' Powered.' : ' Unpowered.';
    if ((site.type === 'capital' || site.type === 'citadel') && isShielded(battle, site)) extra = ' SHIELDED.';
    html += `<div class="tags">${esc(site.name)} — ${esc(st.desc)}${extra}${so ? '' : ' (unclaimed)'}</div>`;
  }
  if (o !== PLAYER && isLand(t) && battle.status === 'playing') html += `<div class="tags">Click to attack with ${fmt(me.troops * ratio)} troops.</div>`;
  if (o === PLAYER) html += '<div class="tags">Your land. Drag a building here, or press 1–5.</div>';
  el.innerHTML = '<button class="close" aria-label="Close">x</button>' + html;
  el.querySelector('.close').onclick = () => { inspectTile = -1; inspectorClosed = true; el.classList.add('hidden'); };
  el.classList.remove('hidden');
}

function updateHud(force = false) {
  if (battle) setBattleIntensity(battle.attacks.filter(a => a.attacker === PLAYER || a.target === PLAYER).length);
  if (battle) { updateControlsHelp(); contextHints(); }
  const now = performance.now();
  if (!force && now - lastHud < 120) return;
  lastHud = now;
  renderer.insets = layoutHud();
  const f = battle.factions[PLAYER];
  const max = maxTroops(battle, f);
  const inc = income(battle, f);
  // Before landing there is no territory yet, so no meaningful cap to show.
  $('#st-troops').textContent = battle.status === 'spawn' ? fmt(f.troops) : `${fmt(f.troops)} / ${fmt(max)}`;
  // Over the cap (e.g. survivors coming home): shown in amber, growth pauses.
  $('#st-troops').classList.toggle('over', battle.status === 'playing' && f.troops > max);
  $('#st-troops-sub').textContent = `+${fmt(regen(battle, f))}/s growth`;
  $('#st-minerals').textContent = fmt(f.minerals);
  $('#st-minerals-rate').textContent = `+${inc.minerals.toFixed(1)}/s`;
  $('#st-energy').textContent = fmt(f.energy);
  $('#st-energy-rate').textContent = `+${inc.energy.toFixed(1)}/s`;
  $('#st-exotic').textContent = fmt(f.exotic);
  $('#st-exotic-rate').textContent = `+${inc.exotic.toFixed(1)}/s`;
  $('#st-land').textContent = fmt(f.tiles);
  $('#st-land-share').textContent = `${((f.tiles / world(battle).landCount) * 100).toFixed(1)}%`;
  $('#ratio-label').textContent = `${Math.round(ratio * 100)}% (${fmt(f.troops * ratio)})`;
  $('#hud-time').textContent = battle.status === 'spawn' ? `Landing ${Math.ceil(battle.spawnLeft)}s` : fmtTime(battle.time);
  // (The tutorial world is peaceful throughout: no countdown there.)
  const grace = battle.status === 'playing' && !config(battle).tutorialWorld ? graceLeft(battle) : 0;
  $('#hud-grace').classList.toggle('hidden', !grace);
  if (grace) $('#hud-grace').textContent = `Ceasefire ${fmtTime(Math.ceil(grace))}`;
  // Capital lost: a red chip until it is retaken.
  const ex = battle.factions[PLAYER].exile;
  $('#hud-exile').classList.toggle('hidden', !ex || battle.status !== 'playing');
  if (ex) $('#hud-exile').textContent = battle.factions[PLAYER].seat ? 'Capital lost · retake it' : `Disarray · new seat in ${Math.max(0, Math.ceil(ex.seatAt - battle.time))}s`;
  const ev = eventPhase(battle);
  const chip = $('#hud-event');
  if (ev.type && battle.status === 'playing') {
    const tx = EVENT_TEXT[ev.type];
    chip.classList.remove('hidden');
    chip.classList.toggle('alert', ev.active);
    chip.classList.toggle('warn', ev.warning);
    chip.textContent = ev.active ? `${tx.name.toUpperCase()} ${Math.ceil(ev.remaining)}s` : `${tx.name} in ${Math.ceil(ev.remaining)}s`;
    if (ev.warning && tx.warn) tip('warn-' + ev.type, tx.warn);
  } else chip.classList.add('hidden');
  const intel = $('#hud-intel');
  const enemy = battle.factions.find(x => x && x.kind === 'enemy');
  const cfg = config(battle);
  let text = '';
  if (cfg.id === 'mycelion') { const cap = battle.sites.find(s => s.id === 'enemy-capital'); text = `Swarm hubs: ${countSites(battle, 'hub', enemy.id)}/3 · Heart ${cap && isShielded(battle, cap) ? 'shielded' : 'EXPOSED'}`; }
  else if (cfg.id === 'xythera') text = `Powered defenses: ${sitesOf(battle, 'turret').filter(t => isPowered(battle, t) && siteOwner(battle, t) !== PLAYER).length}`;
  else if (cfg.id === 'noctyra') text = `Enemy fronts: ${enemy.alive ? attackFronts(battle, enemy) : 0}`;
  else if (cfg.id === 'cryonis') text = `Crystals held: ${countSites(battle, 'crystal', PLAYER)}/${sitesOf(battle, 'crystal').length}`;
  intel.classList.toggle('hidden', !text);
  intel.textContent = text;
  const sb = $('#spawn-banner');
  sb.classList.toggle('hidden', battle.status !== 'spawn');
  if (battle.status === 'spawn') sb.innerHTML = `CHOOSE YOUR LANDING SITE<small>Click open land on the main continent · auto-landing in ${Math.ceil(battle.spawnLeft)}s</small>`;
  if (battle.status === 'playing') updateIntents(); else intents = [];
  updateTutorial();
  updateBattles();
  refreshTooltip();
  updateObjectives();
  updateBoard();
  updateToolbar();
  updateInspector();
}

function processNotices() {
  const cfg = config(battle);
  for (const n of battle.notices.splice(0)) {
    switch (n.kind) {
      case 'site': {
        const s = battle.sites.find(x => x.id === n.site);
        if (!s) break;
        if (n.owner === PLAYER) {
          toast(`${esc(s.name)} captured.`, 'good');
          sfx.capture();
          renderer.burst(s.x, s.y, '#7ff0c8');
          renderer.pop(s.x, s.y - 2, s.name, '#7ff0c8');
          if (s.type === 'hub') tip('hub', 'Hub captured: the Swarm land around it is no longer nourished.');
          if (s.type === 'relay') tip('relay', 'Relay captured: the defenses it powered have gone dark.');
          if (s.type === 'command') tip('command', 'Command node taken: the Dominion loses an attack front.');
        } else if (n.prev === PLAYER) { toast(`${esc(s.name)} lost!`, 'bad'); sfx.lost(); }
        break;
      }
      case 'capitalFell': {
        const f = battle.factions[n.faction], by = battle.factions[n.by];
        renderer.ring(n.x, n.y, '#ff4b3e', 16); renderer.burst(n.x, n.y, '#ff9a3c', 24); renderer.burst(n.x, n.y, '#6a6070', 12);
        if (n.faction === PLAYER) {
          banner('Your capital has fallen', `${by ? by.name : 'The enemy'} took ${n.name}`, true);
          toast(`<b>Capital lost!</b> ${fmt(n.troops)} troops lost${n.loot ? ` and ${fmt(n.loot)} minerals plundered` : ''}. Growth, income and your troop cap are down until you retake it. A provisional capital is set up in ${EXILE.disarray} s.`, 'bad', 7000);
          sfx.lost(); renderer.shake(0.5, 5);
        } else if (n.by === PLAYER) {
          banner(`${n.name} captured`, `${f.name} is in disarray`, f.kind === 'enemy');
          if (n.loot) renderer.pop(n.x, n.y - 3, `+${fmt(n.loot)} minerals`, '#c9b8ff');
          sfx.fanfare(); renderer.ring(n.x, n.y, '#ffffff', 28); renderer.shake(0.3, 3);
        } else toast(`${esc(f.name)} lost its capital to ${by ? esc(by.name) : 'raiders'}.`);
        break;
      }
      case 'capitalRestored':
        renderer.ring(n.x, n.y, '#7ff0c8', 14);
        if (n.faction === PLAYER) { banner('Capital retaken', 'Your empire recovers', true); toast(`You retook ${esc(n.name)}: full growth, income and fronts are back.`, 'good', 4000); sfx.objective(); }
        else toast(`${esc(battle.factions[n.faction].name)} retook its capital.`, 'tip', 3000);
        break;
      case 'seatFounded':
        if (n.faction === PLAYER) { renderer.ring(n.x, n.y, '#ffd25e', 10); toast('Provisional capital set up deep in your land: your supply lines hold again. Retake your capital to recover fully.', 'tip', 5000); }
        break;
      case 'seatLost':
        if (n.faction === PLAYER) { toast('Your provisional capital fell: disarray again until a new one is set up.', 'bad', 4000); sfx.alarm(); }
        break;
      case 'collapse': {
        const f = battle.factions[n.faction];
        if (n.faction === PLAYER) break;
        const cap = battle.sites.find(s => s.faction === n.faction && (s.type === 'capital' || s.type === 'citadel'));
        if (n.by === PLAYER) {
          banner(`${cap ? cap.name : f.name} captured`, `${f.name} has collapsed`, f.kind === 'enemy');
          if (f.kind === 'enemy') sfx.fanfare(); else sfx.capture();
        } else toast(`${esc(f.name)} has collapsed.`);
        if (cap) {
          renderer.ring(cap.x, cap.y, '#ffd25e', 16); renderer.burst(cap.x, cap.y, '#ffd25e', 24);
          if (n.by === PLAYER) { renderer.ring(cap.x, cap.y, '#ffffff', 28); renderer.shake(0.3, 3); }
        }
        break;
      }
      case 'repelled': toast(`Attack by ${esc(battle.factions[n.attacker].name)} repelled.`, 'good', 2600); break;
      case 'objective': {
        const o = cfg.objectives.find(x => x.id === n.id);
        toast(`Objective complete: ${esc(o.label)} <b>+${o.reward}</b>`, 'good'); sfx.objective();
        const cap = capitalOf(battle, PLAYER) || homeCapital(battle, PLAYER);
        if (cap) renderer.pop(cap.x, cap.y - 3, `+${o.reward} cores`, '#ffd25e');
        break;
      }
      case 'eventStart':
        toast(EVENT_TEXT[n.type].start, 'tip', 4500); sfx.alarm();
        if (n.type === 'eruption') {
          // The ground shakes and every vent and volcano throws up magma.
          sfx.rumble();
          renderer.shake(0.6, 4);
          for (const s of battle.sites.filter(x => x.type === 'vent')) { renderer.burst(s.x, s.y, '#ff7a1f', 18); renderer.burst(s.x, s.y, '#ffd25e', 8); }
        }
        break;
      case 'upgraded':
        if (n.owner !== PLAYER) break;
        sfx.build(); renderer.raise(n.id, performance.now()); renderer.ring(n.x, n.y, '#ffd25e', 7); renderer.burst(n.x, n.y, '#ffd25e', 10);
        renderer.pop(n.x, n.y, `-${fmt(n.cost)} minerals`, '#c9b8ff');
        toast(`${esc(BUILDINGS[n.building].name)} upgraded to level ${n.level}.`, 'good', 2500);
        break;
      case 'built':
        sfx.build(); renderer.raise(n.id, performance.now()); renderer.ring(n.x, n.y, '#3fd0ff', 5); renderer.burst(n.x, n.y, '#8a7a6a', 10);
        if (n.owner === PLAYER && n.cost) renderer.pop(n.x, n.y, `-${fmt(n.cost)} minerals`, '#c9b8ff');
        break;
      case 'tutorial': sfx.objective(); break;
      case 'diplomacy': {
        const f = battle.factions[n.faction];
        if (n.kind === 'allied') { toast(`<b>${esc(f.name)}</b> accepted your alliance.`, 'good'); sfx.objective(); }
        else if (n.kind === 'gift') toast(`Sent ${fmt(n.amount)} ${n.what} to ${esc(f.name)}.`, 'good', 2200);
        else if (n.kind === 'betrayed') { toast(`You betrayed <b>${esc(f.name)}</b>. Every nation trusts you less, and you carry a traitor mark for 30 s.`, 'bad', 5000); sfx.lost(); }
        break;
      }
      case 'dropReturn': if (n.owner === PLAYER) toast('Expedition turned back: its target changed hands. The troops are coming home.', 'tip', 3000); break;
      case 'ended': battleEnded(n); break;
      case 'gain': renderer.pop(n.x, n.y - 2, n.text, { minerals: '#c9b8ff', troops: '#7fe8ff', energy: '#ffe066' }[n.res] || '#ffffff'); break;
      case 'research': toast(`Research complete: ${esc(RESEARCH[n.id].name)}.`, 'good'); break;
      case 'landed':
        if (n.owner === PLAYER) { toast('Expedition landed. Beachhead established.', 'good'); renderer.crashLanding(n.x, n.y, { small: true, color: battle.factions[PLAYER].color }); }
        break;
      case 'shipBuilt':
        if (n.owner === PLAYER) { sfx.build(); renderer.ring(n.x, n.y, '#3fd0ff', 5); }
        else toast(`<b>${esc(battle.factions[n.owner].name)}</b> launched a battleship.`, 'bad', 3000);
        break;
      case 'shell':
        renderer.shell(n.x0, n.y0, n.x, n.y);
        if (n.owner === PLAYER || n.target === PLAYER) sfx.thud();
        break;
      case 'sunk':
        renderer.burst(n.x, n.y, '#ff9a3c', 20); renderer.ring(n.x, n.y, '#ffd25e', 6);
        if (n.owner === PLAYER) { toast('One of your battleships was sunk.', 'bad', 2500); sfx.lost(); }
        else toast(`An enemy battleship went down.`, 'good', 2200);
        break;
      case 'dropFailed': if (n.owner === PLAYER) toast('The expedition was beaten back on landing. Send more troops.', 'bad'); break;
      case 'strike': renderer.burst(n.x, n.y, '#ff7a1f', 40); renderer.ring(n.x, n.y, '#ffd25e', 8); sfx.ability(); break;
      case 'emp': renderer.ring(n.x, n.y, '#7fd8ff', 10); sfx.ability(); break;
      case 'start': {
        // Bring the camera in over the landing zone and crash-land the colony ship.
        // Glide in over the landing zone.
        renderer.zoomTo(Math.max(renderer.target.zoom, 3.2 * renderer.dpr));
        centerOnCapital();
        const cap = battle.sites.find(s => s.id === 'player-capital');
        if (cap) renderer.crashLanding(cap.x, cap.y, { owner: PLAYER, color: battle.factions[PLAYER].color });
        setTimeout(() => toast('Landing complete. Expand into the wilderness!', 'good'), 1200);
        break;
      }
      default:
    }
  }
  // Incoming attacks (scouting level 2 warns about every launch).
  for (const a of battle.attacks) {
    if (seenAttacks.has(a.id)) continue;
    seenAttacks.add(a.id);
    if (a.target === PLAYER) {
      const f = battle.factions[a.attacker];
      // The battle panel shows it as an "Incoming" row; just sound the alarm.
      if ((battle.factions[PLAYER].scouting || 0) >= 2 || f.kind === 'enemy') sfx.alarm();
    }
  }
  const cur = currentObjective(battle);
  if (cur && battle.status === 'playing') tip(cur.id, cur.tip);
}

// ---------- Map input ----------

const pointers = new Map();
let gesture = null;

function canvasXY(e) {
  const r = $('#canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onDown(e) {
  if (!battle) return;
  $('#canvas').setPointerCapture?.(e.pointerId);
  const p = canvasXY(e);
  pointers.set(e.pointerId, p);
  if (e.button === 2) {
    // Right-click: cancel a tool, or open the radial menu on that spot.
    if (armed) { armed = null; return; }
    const i = renderer.screenToTile(p.x, p.y);
    if (i >= 0) openRadial(i, e.clientX, e.clientY);
    return;
  }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { pinch: true, dist: Math.hypot(a.x - b.x, a.y - b.y), moved: true };
  } else {
    gesture = { x: p.x, y: p.y, lx: p.x, ly: p.y, t: performance.now(), moved: false, pinch: false, type: e.pointerType };
    if (e.pointerType === 'touch') {
      const g = gesture, cx = e.clientX, cy = e.clientY;
      // Long press on the map: the radial menu (with the tile's details).
      setTimeout(() => {
        if (gesture !== g || g.moved || pointers.size !== 1 || !battle || battle.status === 'spawn') return;
        const i = renderer.screenToTile(g.x, g.y);
        if (i < 0) return;
        g.longPress = true;
        tipSource = null;
        openRadial(i, cx, cy);
      }, LONG_PRESS);
    }
  }
}

function onMove(e) {
  if (!battle) return;
  const p = canvasXY(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  if (gesture?.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Pinch zooms in proportion to the gesture.
    if (gesture.dist > 0 && d > 0) renderer.zoomByFactor(d / gesture.dist, mid.x, mid.y);
    gesture.dist = d;
    return;
  }
  if (gesture && pointers.has(e.pointerId)) {
    const threshold = gesture.type === 'touch' ? 10 : 5;
    if (!gesture.moved && Math.hypot(p.x - gesture.x, p.y - gesture.y) > threshold) { gesture.moved = true; $('#canvas').classList.add('panning'); }
    if (gesture.moved) { renderer.panBy(p.x - gesture.lx, p.y - gesture.ly); gesture.lx = p.x; gesture.ly = p.y; }
    return;
  }
  if (e.pointerType === 'mouse') hoverTile = renderer.screenToTile(p.x, p.y);
}

function onUp(e) {
  if (!battle) return;
  const p = canvasXY(e);
  pointers.delete(e.pointerId);
  $('#canvas').classList.remove('panning');
  const g = gesture;
  if (pointers.size === 0) gesture = null;
  // A tap only counts when the finger did not move and no pinch happened:
  // panning the map never launches an attack by accident.
  if (!g || g.pinch || g.moved || g.longPress || e.button === 2 || performance.now() - g.t > 700) return;
  const i = renderer.screenToTile(p.x, p.y);
  if (i >= 0) clickTile(i);
}

function clickTile(i) {
  inspectorClosed = false;
  const x = i % battle.w, y = (i - x) / battle.w;
  if (battle.status === 'spawn') {
    if (spawnPlayer(battle, x, y)) { sfx.capture(); renderer.ring(x, y, '#7ff0c8', 12); toast('Landing site chosen. Click again to move it, or wait for touchdown.', 'good', 2500); }
    else { sfx.error(); toast('Land on open ground on the main continent, away from other civilizations.', 'bad', 2500); }
    return;
  }
  if (battle.status !== 'playing') return;
  let res;
  if (armed?.kind === 'build') res = playerBuild(battle, armed.id, i);
  else if (armed?.kind === 'ability') res = useAbility(battle, armed.id, i);
  else if (armed?.kind === 'ship') { res = playerBuildShip(battle, i); if (res.ok) toast('Battleship launched. Right-click the sea to move your fleet.', 'good', 2500); }
  else if (armed?.kind === 'dropship') { res = playerDropship(battle, i, ratio); if (res.ok) { toast(`Expedition of ${fmt(res.sent)} troops launched: arrives in ${Math.ceil(res.eta)} s.`, 'good', 2500); sfx.attack(); } }
  else if (battle.owner[i] === PLAYER) { inspectTile = inspectTile === i ? -1 : i; sfx.click(); return; }
  else {
    res = playerAttack(battle, i, ratio);
    if (res.ok && res.expedition) toast(`Across the sea: expedition of ${fmt(res.sent)} troops launched, arrives in ${Math.ceil(res.eta)} s.`, 'good', 3000);
    if (res.ok && res.reinforce) toast(`Reinforcements sailing to your beachhead: they attack on arrival in ${Math.ceil(res.eta)} s.`, 'good', 3000);
    if (res.ok) { sfx.attack(); renderer.pop(x, y, `-${fmt(res.sent)}`, '#ffe9a8'); if (res.aim) renderer.aim(res.aim.x0, res.aim.y0, res.aim.x1, res.aim.y1, '#fff2a8'); tip('ratio', 'Troops regrow fastest when your army is well below its cap. Big attacks are not wasted.'); }
  }
  if (res && !res.ok) { sfx.error(); toast(REASONS[res.reason] || 'You cannot do that.', 'bad', 2600); }
  else if (res && res.ok && armed && armed.kind !== 'dropship') armed = null;
  else if (res && res.ok && armed?.kind === 'dropship') armed = null;
}

function dragGhost() {
  if (!drag?.active || drag.tile < 0 || !drag.preview) return null;
  const p = drag.preview, x = p.upgrade ? p.x : drag.tile % battle.w, y = p.upgrade ? p.y : Math.floor(drag.tile / battle.w);
  const level = p.upgrade ? p.level : 1;
  return {
    type: drag.type, x, y, level, ok: p.ok, label: ghostLabel(p, drag.type),
    radius: drag.type === 'bastion' ? bastionRadius(battle, { level }) : 0,
  };
}

function setRatio(r) {
  ratio = Math.max(0.05, Math.min(1, r));
  $('#ratio').value = Math.round(ratio * 100);
}

function togglePause(force) {
  if (!battle) return;
  paused = force ?? !paused;
  $('#overlay-pause').classList.toggle('hidden', !paused);
  if (paused) saveBattle();
}

function centerOnCapital() {
  const cap = capitalOf(battle, PLAYER) || homeCapital(battle, PLAYER);
  if (cap) renderer.centerOn(cap.x, cap.y);
}

function openHelp() {
  const cfg = config(battle);
  paused = true;
  const names = THEMES[battle.theme].names;
  const sitesHere = [...new Set(battle.sites.map(s => s.type))];
  $('#help-title').textContent = cfg.skirmish ? 'Mission' : `Mission: ${cfg.name}`;
  const idx = PLANETS.findIndex(p => p.id === cfg.id);
  const assist = idx >= 0 ? assistLevel(campaign, cfg.id) : 0;
  const enemy = cfg.enemy ? `<b style="color:${cfg.enemy.color}">${esc(cfg.enemy.name)}</b>: ${esc(PROFILE_TEXT[cfg.enemy.profile] || '')}${cfg.nations ? ` Plus ${cfg.nations.count} independent nations.` : ''}` : '';
  $('#help-body').innerHTML = `
    <p class="lesson-tag">${idx >= 0 ? `World ${idx + 1}/5 · ${esc(cfg.lesson)} · difficulty ${cfg.difficulty}/5` : esc(cfg.tagline || '')}</p>
    <h4>Victory</h4><ul>${cfg.victory.conds.map(c => `<li>${esc(c.label)}</li>`).join('')}<li>Defeat: lose all your land.</li></ul>
    ${enemy ? `<h4>Enemy</h4><p>${enemy}</p>` : ''}
    ${assist ? `<p class="note">Adaptive assist ${assist}/3: after your earlier defeats, enemy commanders here react a little slower.</p>` : ''}
    <h4>Field notes</h4><ul>${cfg.briefing.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <h4>Controls</h4><ul>
      <li>Click enemy or unclaimed land next to your border to attack it with your attack ratio of troops.</li>
      <li>Drag or WASD to pan the map. Mouse wheel, pinch or Q / E to zoom smoothly. C glides to your capital.</li>
      <li>Zoomed out, buildings show as badges with their level; zoom in to see them up close.</li>
      <li>1–5 build, 6 expedition, 0 battleship, R research, 7–9 abilities, Space pause, L leaderboard, O objectives.</li>
      <li>On touch screens, a drag never attacks: only a clean tap does.</li>
      <li>Oceans separate the continents. Click land across the sea to send an expedition from your nearest coast (Starports make them faster). Cut-off land grows troops at half rate.</li></ul>
    <h4>Capitals</h4><ul>
      <li>Take a small nation's capital and it collapses. Empires (you and the main enemy) survive losing theirs, but it hurts: 40% of troops and half the minerals lost at once, then slower growth, less income, a lower troop cap and one attack front fewer until the capital is retaken.</li>
      <li>After ${EXILE.disarray} s of disarray, a provisional capital is set up deep in the remaining land. You are defeated only when you lose all your land.</li></ul>
    <h4>Terrain (attack cost · defense)</h4><ul>${['plains', 'wild', 'highland', 'mountain', 'river', 'volcano', 'ruins'].map(k => { const t = TERRAIN.find(x => x.id === k); return `<li>${esc(names[k])}: ×${t.cost} · ×${t.defense}</li>`; }).join('')}</ul>
    <h4>Sites on this world</h4><ul>${sitesHere.map(t => `<li><b>${esc(SITE_TYPES[t].label)}</b>: ${esc(SITE_TYPES[t].desc)}</li>`).join('')}</ul>`;
  $('#overlay-help').classList.remove('hidden');
}

// ---------- Settings ----------

function openSettings() {
  const s = campaign ? campaign.settings : newCampaign().settings;
  $('#set-sound').checked = s.sound; $('#set-tips').checked = s.tips; $('#set-labels').checked = s.labels;
  $('#set-simple').checked = s.simple; $('#set-motion').checked = s.motion; $('#set-color').value = s.playerColor;
  for (const k of ['master', 'music', 'sfx']) $(`#set-vol-${k}`).value = Math.round(s.volume[k] * 100);
  if (battle) paused = true;
  $('#overlay-settings').classList.remove('hidden');
}

function closeSettings() {
  if (!campaign) { campaign = newCampaign(); }
  const s = campaign.settings;
  s.sound = $('#set-sound').checked; s.tips = $('#set-tips').checked; s.labels = $('#set-labels').checked;
  s.simple = $('#set-simple').checked; s.motion = $('#set-motion').checked; s.playerColor = $('#set-color').value;
  for (const k of ['master', 'music', 'sfx']) s.volume[k] = Number($(`#set-vol-${k}`).value) / 100;
  setSound(s.sound);
  setVolumes(s.volume);
  persist();
  if (battle) {
    renderer.setSimple(s.simple);
    const col = playerLoadout(campaign).color;
    if (battle.factions[PLAYER].color !== col) { battle.factions[PLAYER].color = col; renderer.colors.clear(); renderer.attach(battle, s.simple); resize(); }
    paused = !$('#overlay-pause').classList.contains('hidden');
  }
  $('#overlay-settings').classList.add('hidden');
}

// ---------- Main loop ----------

// Dock panels around the measured top bar and toolbar so nothing overlaps,
// and tell the camera which strips of the window the HUD covers.
function layoutHud() {
  const scr = $('#screen-battle');
  const H = window.innerHeight;
  const top = Math.round($('.hud-top').getBoundingClientRect().bottom + 6);
  const bar = $('#toolbar');
  const bottom = bar.classList.contains('hidden') ? 8 : Math.round(H - bar.getBoundingClientRect().top + 6);
  scr.style.setProperty('--hud-top', `${top}px`);
  scr.style.setProperty('--hud-bottom', `${bottom}px`);
  // On narrow screens the battle chip and panel sit below the training card.
  const tut = $('#tutorial');
  const tutBottom = tut.classList.contains('hidden') ? top : Math.round(tut.getBoundingClientRect().bottom + 6);
  scr.style.setProperty('--below-tut', `${tutBottom}px`);
  const emp = $('#empire');
  const empRect = emp.getBoundingClientRect();
  const empOpen = !emp.classList.contains('collapsed');
  scr.style.setProperty('--board-max', `${Math.max(120, (empOpen ? empRect.top : H - bottom) - top - 8)}px`);
  // The pinned inspector sits under the battle panel.
  const bat = $('#battles');
  scr.style.setProperty('--insp-top', `${bat.classList.contains('hidden') ? top : Math.round(bat.getBoundingClientRect().bottom + 6)}px`);
  const insp = $('#inspector');
  const inspBottom = insp.classList.contains('hidden') ? top : insp.getBoundingClientRect().bottom + 6;
  scr.style.setProperty('--toast-max', `${Math.max(60, H - bottom - inspBottom)}px`);
  return { top, bottom, left: empOpen ? Math.round(empRect.right + 4) : 0, right: 0 };
}

function resize() {
  if (!battle) return;
  const c = $('#canvas');
  renderer.resize(c.clientWidth, c.clientHeight, Math.min(window.devicePixelRatio || 1, 2), layoutHud());
}

function syncGameplay() {
  const playing = !!battle && (battle.status === 'playing' || battle.status === 'spawn') && !paused && !adPlaying && !document.hidden;
  if (playing) gameplayStart(); else gameplayStop();
}

function frame(ts) {
  requestAnimationFrame(frame);
  syncGameplay();
  const dt = Math.min(0.25, (ts - (lastFrame || ts)) / 1000);
  lastFrame = ts;
  if (!battle) return;
  dragAutoPan(dt);
  if (drag?.active) updateDrag();
  if (!paused && !adPlaying && (battle.status === 'playing' || battle.status === 'spawn')) {
    accumulator += dt * speed;
    while (accumulator >= TICK) { step(battle, TICK); accumulator -= TICK; }
  }
  processNotices();
  // Soft ticks while your border advances.
  if (battle.stats.conquered > lastConquered && battle.attacks.some(a => a.attacker === PLAYER)) sfx.tick();
  lastConquered = battle.stats.conquered;
  if (battle.status === 'won' || battle.status === 'lost') {
    if (!endTimer) { endTimer = ts; sfx[battle.status === 'won' ? 'victory' : 'defeat'](); toast(battle.status === 'won' ? '<b>PLANET CONQUERED</b>' : '<b>YOUR CIVILIZATION HAS FALLEN</b>', battle.status === 'won' ? 'good' : 'bad', 2000); }
    if (battle.status === 'won' && Math.random() < 0.3) { const cap = battle.sites.find(s => s.id === 'enemy-capital'); if (cap) renderer.burst(cap.x + (Math.random() - 0.5) * 30, cap.y + (Math.random() - 0.5) * 20, ['#ffd25e', '#7ff0c8', '#ff6ad2'][Math.floor(Math.random() * 3)], 6); }
    if (ts - endTimer > 1800) { campaign.battle = null; endBattle(); return; }
  }
  const s = campaign.settings;
  let spawnHover = null;
  if (battle.status === 'spawn' && hoverTile >= 0) { const x = hoverTile % battle.w, y = (hoverTile - x) / battle.w; spawnHover = { x, y, ok: canSpawnAt(battle, x, y) }; }
  const cur = currentObjective(battle);
  renderer.render({
    now: ts, dt, reducedMotion: s.motion, labels: s.labels, spawnHover,
    hoverOwner: hoverTile >= 0 ? battle.owner[hoverTile] : 0,
    inspectOwner: inspectTile >= 0 ? battle.owner[inspectTile] : 0,
    highlights: new Set(cur?.highlight ? [cur.highlight] : []),
    intents,
    route: drag?.active ? null : (updateRoutePreview(), routePath),
    ghost: dragGhost(),
    pointer: battle.status === 'playing' && !renderer.holdOwner && tutorialStep(battle) ? tutPointer : null,
  });
  updateHud();
  if (ts - lastSave > 5000) saveBattle();
}

// ---------- Wiring ----------

async function init() {
  await initPlatform();
  loadingStart();
  storage = platformStorage();
  campaign = loadCampaign(storage) || null;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (campaign && prefersReduced && !campaign.settings.motion) campaign.settings.motion = true;
  setSound(campaign ? campaign.settings.sound : true);
  if (campaign) setVolumes(campaign.settings.volume);
  onAudioSettings(setPortalMute);
  // Browsers only start audio after a gesture: the first click or key does it.
  const unlock = () => { unlockAudio(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // Volume sliders apply as you drag them.
  for (const k of ['master', 'music', 'sfx']) $(`#set-vol-${k}`).addEventListener('input', e => setVolumes({ [k]: Number(e.target.value) / 100 }));
  setAdHandlers({
    pause: () => { adPlaying = true; setAdMute(true); },
    resume: () => { adPlaying = false; setAdMute(false); lastFrame = 0; },
  });
  renderer = new MapRenderer($('#canvas'));
  renderer.onImpact = small => (small ? sfx.thud() : sfx.crash());
  // Gunfire on the fronts you can see: at most 4 cracks a second.
  const skirmishOk = rateLimiter(4);
  renderer.onSkirmish = () => { if (skirmishOk(performance.now())) sfx.skirmish(); };
  applyIcons();
  initTooltips();
  initBattlePanel();
  $('#player-name').addEventListener('change', e => {
    if (!campaign) campaign = newCampaign();
    campaign.settings.name = cleanName(e.target.value);
    e.target.value = campaign.settings.name;
    persist();
  });
  // Menus sit on a dimmed pixel starfield.
  $('#app').style.backgroundImage = `linear-gradient(rgba(6,5,12,0.55), rgba(6,5,12,0.75)), url(${backdropCanvas('noctyra', 320, 180).toDataURL()})`;

  document.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => { sfx.click(); show(b.dataset.nav); }; });
  document.querySelectorAll('[data-open="settings"]').forEach(b => { b.onclick = openSettings; });
  $('#btn-settings-close').onclick = closeSettings;
  $('#btn-play').onclick = () => {
    const t = playTarget(campaign);
    if (!campaign) { campaign = newCampaign(); persist(); }
    if (t.kind === 'resume') resumeBattle();
    else if (t.kind === 'tutorial') startTutorial(t.lesson);
    else launch({ configId: t.id });
  };
  $('#btn-continue').onclick = () => { if (!campaign) { campaign = newCampaign(); persist(); } sfx.click(); show('campaign'); };
  $('#btn-tutorial').onclick = () => show('tutorial');
  $('#btn-skirmish').onclick = () => { if (!campaign) { campaign = newCampaign(); persist(); } show('skirmish'); };
  $('#btn-skirmish-reroll').onclick = () => { skirmishSeed = 1 + Math.floor(Math.random() * 99999); $('#skirmish-seed').value = skirmishSeed; };
  $('#btn-new').onclick = async () => {
    if (!(await confirmBox('Start a new game? Your campaign progress, upgrades, cores and any saved battle will be lost.'))) return;
    const settings = campaign?.settings;
    campaign = newCampaign();
    if (settings) campaign.settings = settings; // keep sound, colour and accessibility choices
    persist();
    launch({ configId: PLANETS[0].id });
  };
  $('#btn-resume-campaign').onclick = resumeBattle;
  $('#btn-upgrades').onclick = () => show('upgrades');
  $('#sel-difficulty').onchange = e => { campaign.settings.difficulty = e.target.value; persist(); };
  $('#btn-reset').onclick = async () => { if (await confirmBox('Reset the whole campaign? This cannot be undone.')) { campaign = newCampaign(); persist(); renderCampaign(); } };
  $('#btn-pause').onclick = () => togglePause();
  $('#btn-resume-battle').onclick = () => togglePause(false);
  $('#btn-restart').onclick = async () => {
    if (await confirmBox('Restart this world? Current battle progress will be lost.')) {
      const ref = { configId: battle.configId, theme: battle.theme, worldSeed: battle.seed, mode: battle.mode };
      campaign.battle = null;
      startBattle(ref);
    }
  };
  $('#btn-quit').onclick = () => { saveBattle(); const id = campaign.battle?.configId; battle = null; show(id === 'skirmish' ? 'title' : id === 'tutorial' ? 'tutorial' : 'campaign'); };
  $('#btn-help').onclick = openHelp;
  // Closing an overlay resumes the game, unless the pause menu is still open.
  const resumeUnlessPaused = () => { paused = !$('#overlay-pause').classList.contains('hidden'); };
  $('#btn-help-close').onclick = () => { $('#overlay-help').classList.add('hidden'); resumeUnlessPaused(); };
  $('#btn-research-close').onclick = () => { $('#overlay-research').classList.add('hidden'); resumeUnlessPaused(); };
  $('#btn-speed').onclick = () => { speed = speed === 1 ? 2 : 1; toast(`Game speed ${speed}×`, '', 1200); };
  $('#btn-sound').onclick = () => { campaign.settings.sound = !campaign.settings.sound; setSound(campaign.settings.sound); $('#btn-sound img').src = iconURL(campaign.settings.sound ? 'sound' : 'mute', 3); persist(); };
  $('#btn-board').onclick = () => { $('#board').classList.toggle('hidden'); updateBoard(); };
  $('#obj-toggle').onclick = () => $('#objectives').classList.toggle('hidden');
  $('#empire-toggle').onclick = () => { $('#empire').classList.toggle('collapsed'); $('#empire-toggle').textContent = $('#empire').classList.contains('collapsed') ? '>' : '<'; resize(); };
  $('#ratio').oninput = e => setRatio(Number(e.target.value) / 100);
  if (campaign && !campaign.settings.sound) $('#btn-sound img').src = iconURL('mute', 3);

  bindDrag();
  const c = $('#canvas');
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); gesture = null; });
  c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hoverTile = -1; if (tipSource === 'map') hideTooltip(); } });
  c.addEventListener('contextmenu', e => e.preventDefault());
  // Each wheel tick zooms by a small percentage (trackpads give fine steps).
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const p = canvasXY(e);
    const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    renderer.zoomByFactor(Math.pow(1.0015, -Math.max(-300, Math.min(300, dy))), p.x, p.y);
  }, { passive: false });

  // Keep the embedding page from scrolling on game keys.
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault();
  });
  window.addEventListener('keydown', e => {
    if (!battle || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const b = Object.entries(BUILDINGS).find(([, v]) => v.key === k);
    const a = Object.entries(ABILITIES).find(([, v]) => v.key === k);
    if (b) activateTool('build', b[0]);
    else if (a) activateTool('ability', a[0]);
    else if (k === '6') activateTool('dropship', 'dropship');
    else if (k === '0') activateTool('ship', 'ship');
    else if (k === 'r') activateTool('research', 'research');
    else if (k === ' ') togglePause();
    else if (k === 'escape') { if (drag?.active) dragEndedAt = performance.now(); drag = null; armed = null; inspectTile = -1; closeRadial(); }
    else if (k === 'l') $('#btn-board').click();
    else if (k === 'o') $('#objectives').classList.toggle('hidden');
    else if (k === 'c') centerOnCapital();
    else if (k === '=' || k === '+' || k === 'e') renderer.zoomBy(1);
    else if (k === '-' || k === 'q') renderer.zoomBy(-1);
    else if (k === 'w' || k === 'arrowup') renderer.panBy(0, 60);
    else if (k === 's' || k === 'arrowdown') renderer.panBy(0, -60);
    else if (k === 'a' || k === 'arrowleft') renderer.panBy(60, 0);
    else if (k === 'd' || k === 'arrowright') renderer.panBy(-60, 0);
    else if (k === '[') setRatio(ratio - 0.05);
    else if (k === ']') setRatio(ratio + 0.05);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { setHidden(document.hidden); if (document.hidden) saveBattle(); });
  window.addEventListener('pagehide', saveBattle);

  // The very first launch skips every menu: the first lesson lands at once.
  if (!campaign) { campaign = newCampaign(); persist(); startTutorial(1); } else show('title');
  requestAnimationFrame(frame);
  loadingStop();
}

// Hook for automated browser tests.
window.__planetConquest = {
  battle: () => battle,
  campaign: () => campaign,
  renderer: () => renderer,
  tileToCss: (x, y) => renderer.tileToCss(x, y),
  pointer: () => tutPointer,
  tipSource: () => (tipSource === 'map' ? 'map' : tipSource ? tipSource.id || tipSource.className : null),
  advance: seconds => { for (let k = 0; k < seconds / TICK && battle?.status === 'playing'; k++) step(battle, TICK); },
};

init();
