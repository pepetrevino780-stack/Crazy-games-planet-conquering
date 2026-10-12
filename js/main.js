// Interface controller: screens, map input, HUD, notices, saving and portal hooks.
import { PLANETS, getPlanet, skirmishConfig, BUILDINGS, RESEARCH, SITE_TYPES, PERSONAS } from './campaign.js';
import {
  newCampaign, loadCampaign, saveCampaign, isUnlocked, UPGRADES, CIVS, ABILITIES, upgradeCost,
  buyUpgrade, unlockCiv, playerLoadout, computeRewards, applyVictory, applyDefeat, assistLevel, starsFor,
} from './progression.js';
import {
  createBattle, step, spawnPlayer, canSpawnAt, playerAttack, playerDropship, playerBuild,
  playerResearch, useAbility, abilityReady, ABILITY_ENERGY, DROPSHIP_COST, canDropship, currentObjective,
  condProgress, battleResult, serialize, deserialize, analyzeDefeat, TICK, PLAYER,
  tutorialStep, tutorialSteps, tutorialUnlocked, skipTutorial,
} from './sim/engine.js';
import {
  config, world, maxTroops, regen, income, buildCost, siteOwner, isShielded, isPowered, countSites,
  eventPhase, tileDefense, attackFronts, sitesOf, borders,
} from './sim/core.js';
import { MapRenderer, fmt } from './render.js';
import { THEMES, TERRAIN, THEME_IDS, isLand } from './world/themes.js';
import { iconURL, spriteCanvas, mixHex } from './art/sprites.js';
import { titleScene, planetOrb, backdropCanvas } from './art/backdrop.js';
import { sfx, setSound, setAdMute } from './audio.js';
import {
  initPlatform, platformActive, platformStorage, setAdHandlers, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, midgameAd, rewardedAd,
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
let armed = null; // { kind: 'build'|'ability'|'dropship', id }
let hoverTile = -1;
let inspectTile = -1;
let seenTips = new Set();
let seenAttacks = new Set();
let lastFrame = 0, accumulator = 0, lastSave = 0, lastHud = 0;
let endTimer = 0;
let lastPointerTouch = false;
let inspectorClosed = false;
let briefingRef = null; // { configId, theme?, worldSeed? }
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
  notBordering: 'You do not border that land. Expand toward it, or build a Starport and use a dropship (6).',
  noTroops: 'Not enough troops. Raise the attack ratio or wait for your army to regrow.',
  fronts: 'Too many attacks at once. Wait for one to finish.',
  shielded: 'Shielded! Capture the network hubs first.',
  water: 'Your troops cannot march over water. Use a dropship from a Starport.',
  own: 'That land is already yours.',
  minerals: 'Not enough minerals.',
  energy: 'Not enough energy.',
  exotic: 'Not enough exotic matter.',
  cooldown: 'Still recharging.',
  locked: 'Unlock this ability in Command Upgrades.',
  terrain: 'Build on your own flat land (not mountains, rivers or volcanoes).',
  crowded: 'Too close to another structure.',
  coast: 'Starports must be built within 3 tiles of the coast.',
  noStarport: 'Build a Starport first.',
  target: 'Target enemy land.',
  notStarted: 'Choose your landing site first.',
  invalid: 'You cannot do that there.',
};

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'title') renderTitle();
  if (name === 'campaign') renderCampaign();
  if (name === 'upgrades') renderUpgrades();
  if (name === 'skirmish') renderSkirmish();
}

const persist = () => { if (campaign) saveCampaign(storage, campaign); };

function confirmBox(text) {
  return new Promise(resolve => {
    $('#confirm-text').textContent = text;
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
  // One clear primary action: resume the saved battle, else continue, else start.
  const b = campaign?.battle;
  const started = hasProgress();
  $('#btn-resume').classList.toggle('hidden', !b);
  if (b) $('#btn-resume').textContent = `Resume: ${battleName(b)} ${fmtTime(b.time)}`;
  const cont = $('#btn-continue');
  cont.textContent = b ? 'Campaign map' : started ? 'Continue campaign' : 'Start campaign';
  cont.classList.toggle('primary', !b);
  $('#btn-new').classList.toggle('hidden', !started);
}

const battleName = b => (b.configId === 'skirmish' ? `Skirmish: ${THEMES[b.theme].name}` : getPlanet(b.configId).name);

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
    const status = !unlocked ? `Conquer ${PLANETS[i - 1].name} to unlock`
      : rec.completed ? `Conquered · best ${fmtTime(rec.bestTime)}<br>${objs}`
      : rec.attempts ? `${rec.defeats} defeat${rec.defeats === 1 ? '' : 's'} · ${objs}` : esc(p.title);
    li.innerHTML = `<span class="step">${i + 1}/5</span>${rec.completed ? starRow(rec.stars || 1) : ''}<h3>${esc(p.name)}</h3><div class="lesson">${esc(p.lesson)}</div><div class="status">${status}</div>
      <button class="btn ${unlocked && !rec.completed ? 'primary' : ''}" ${unlocked ? '' : 'disabled'}>${rec.completed ? 'Replay' : 'Invade'}</button>`;
    li.insertBefore(orbCanvas(p.theme), li.querySelector('h3'));
    li.querySelector('button').onclick = () => openBriefing({ configId: p.id });
    list.appendChild(li);
  });
}

function renderSkirmish() {
  $('#skirmish-seed').value = skirmishSeed;
  const list = $('#skirmish-list');
  list.innerHTML = '';
  for (const theme of THEME_IDS) {
    const li = document.createElement('li');
    li.className = 'planet panel';
    li.innerHTML = `<h3>${esc(THEMES[theme].name)}</h3><div class="lesson">${esc(getPlanet(theme)?.name || '')} world</div><button class="btn primary">Generate &amp; play</button>`;
    li.insertBefore(orbCanvas(theme), li.querySelector('h3'));
    li.querySelector('button').onclick = () => openBriefing({ configId: 'skirmish', theme, worldSeed: Number($('#skirmish-seed').value) || 1 });
    list.appendChild(li);
  }
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

function cfgFor(ref) {
  return ref.configId === 'skirmish' ? skirmishConfig(ref.theme, ref.worldSeed) : getPlanet(ref.configId);
}

function openBriefing(ref) {
  briefingRef = ref;
  const p = cfgFor(ref);
  const idx = PLANETS.indexOf(p);
  $('#brief-title').textContent = ref.configId === 'skirmish' ? `Skirmish — ${THEMES[ref.theme].name}` : `${p.name}: ${p.title}`;
  $('#brief-back').dataset.nav = ref.configId === 'skirmish' ? 'skirmish' : 'campaign';
  $('#brief-lesson').textContent = idx >= 0 ? `Lesson ${idx + 1}: ${p.lesson}` : `World seed ${ref.worldSeed}`;
  $('#brief-tagline').textContent = p.tagline;
  const orb = planetOrb(p.theme, 64);
  const bc = $('#brief-orb');
  bc.getContext('2d').clearRect(0, 0, 64, 64);
  bc.getContext('2d').drawImage(orb, 0, 0);
  $('#brief-victory').innerHTML = p.victory.conds.map(c => `<li>${esc(c.label)}</li>`).join('') + '<li>Defeat: lose your capital or all your land.</li>';
  $('#brief-enemy').innerHTML = `<b style="color:${p.enemy.color}">${esc(p.enemy.name)}</b> — ${esc(PROFILE_TEXT[p.enemy.profile] || '')} Plus ${p.nations.count} independent nations.`;
  $('#brief-notes').innerHTML = p.briefing.map(b => `<li>${esc(b)}</li>`).join('');
  const assist = idx >= 0 ? assistLevel(campaign, p.id) : 0;
  $('#brief-assist').classList.toggle('hidden', !assist);
  $('#brief-assist').textContent = assist ? `Adaptive assist ${assist}/3: after your earlier defeats, enemy commanders here react a little slower.` : '';
  show('briefing');
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
    theme: ref.theme, worldSeed: ref.worldSeed,
    // The training steps run until the planet has been cleared once.
    tutorial: !rec?.completed,
  });
  enterBattle();
}

function enterBattle() {
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

function endBattle() {
  gameplayStop();
  const cfg = config(battle);
  const won = battle.status === 'won';
  const body = $('#debrief-body');
  const result = battleResult(battle);
  const chart = landChart(battle);
  const replayRef = cfg.skirmish ? { configId: 'skirmish', theme: battle.theme, worldSeed: battle.seed } : { configId: cfg.id };
  $('#btn-debrief-replay').onclick = () => openBriefing(replayRef);
  $('#debrief-icon').src = iconURL(won ? 'victory' : 'defeat', 4);
  if (won) {
    const stars = starsFor(cfg, result);
    const rewards = computeRewards(campaign, cfg, result);
    applyVictory(campaign, cfg, result, rewards);
    persist();
    happytime();
    const idx = PLANETS.indexOf(cfg);
    const next = idx >= 0 ? PLANETS[idx + 1] : null;
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
    $('#btn-debrief-primary').onclick = () => (next ? openBriefing({ configId: next.id }) : show(cfg.skirmish ? 'skirmish' : 'campaign'));
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
    const ref = { configId: battle.configId, theme: battle.theme, worldSeed: battle.seed };
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
  if (battle && tutorialStep(battle) && !key.startsWith('warn-')) return;
  seenTips.add(key);
  toast(`<b>Tip:</b> ${esc(text)}`, 'tip', 7000);
}

function buildToolbar() {
  const bar = $('#toolbar');
  const f = battle.factions[PLAYER];
  const tools = [
    ...Object.entries(BUILDINGS).map(([id, b]) => ({ kind: 'build', id, key: b.key, label: b.name, icon: spriteIcon(id) })),
    'sep',
    { kind: 'dropship', id: 'dropship', key: '6', label: 'Dropship', icon: iconURL('fleet', 3) },
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
    b.title = t.kind === 'build' ? `${BUILDINGS[t.id].name}: ${BUILDINGS[t.id].desc}` : t.label;
    b.innerHTML = `<span class="key">${t.key}</span><img src="${t.icon}" alt=""><span class="label">${esc(t.label)}</span><span class="cost"></span>${t.kind === 'ability' ? '<span class="cd"></span>' : ''}`;
    b.onclick = () => activateTool(t.kind, t.id);
    bar.appendChild(b);
  }
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
    dropship: canDropship(battle) ? 'Click enemy or unclaimed land anywhere to send a dropship.' : 'Build a Starport near the coast to launch dropships.',
    ability: { strike: 'Click enemy land to bombard it.', rally: 'Click anywhere to muster troops.', emp: 'Click near enemy hubs, relays, defenses or buildings.' }[id],
  };
  toast(hints[kind], 'tip', 2600);
}

function updateToolbar() {
  const f = battle.factions[PLAYER];
  const open = tutorialUnlocked(battle);
  // During training, tools and resources appear only once a step introduces them.
  const seps = document.querySelectorAll('#toolbar .tool-sep');
  if (seps[0]) seps[0].classList.toggle('hidden', !!open && !open.has('dropship'));
  if (seps[1]) seps[1].classList.toggle('hidden', !!open && !open.has('abilities'));
  $('#st-energy').closest('.stat').classList.toggle('hidden', !!open && !open.has('energy'));
  $('#st-exotic').closest('.stat').classList.toggle('hidden', !!open && !open.has('exotic'));
  let shown = 0;
  document.querySelectorAll('.tool').forEach(b => { const v = toolUnlocked(b.dataset.kind, b.dataset.id); b.classList.toggle('hidden', !v); shown += v; });
  $('#toolbar').classList.toggle('hidden', !shown);
  document.querySelectorAll('.tool').forEach(b => {
    const { kind, id } = b.dataset;
    const cost = b.querySelector('.cost');
    b.classList.toggle('armed', !!armed && armed.kind === kind && armed.id === id);
    if (kind === 'build') { const c = buildCost(battle, PLAYER, id); cost.textContent = fmt(c); b.disabled = f.minerals < c; }
    else if (kind === 'dropship') { cost.textContent = DROPSHIP_COST; b.disabled = !canDropship(battle) || f.minerals < DROPSHIP_COST; }
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
  $('#obj-count').textContent = `${battle.objectivesDone.length}/${cfg.objectives.length}`;
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
    const len = Math.hypot(x1 - x0, y1 - y0), max = 24;
    if (len > max) { x0 = x1 + ((x0 - x1) / len) * max; y0 = y1 + ((y0 - y1) / len) * max; }
    const troops = scout >= 3 ? a.troops : a.initial;
    intents.push({
      x0, y0, x1, y1, color: f.kind === 'enemy' ? '#ff4b3e' : mixHex(f.color, '#ff4b3e', 0.4),
      weight: Math.min(1.6, 0.7 + troops / 1500), label: scout >= 1 ? fmt(troops) : '',
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
  // Otherwise the nearest unclaimed land on the border, preferring land away from the map edge.
  let best = -1, bd = Infinity;
  for (let y = 1; y < st.h - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (st.owner[i] !== 0 || !isLand(terrain[i]) || !touches(i)) continue;
      const dd = Math.hypot(x - cap.x, y - cap.y) + (TERRAIN[terrain[i]].cost - 1) * 6;
      if (dd < bd) { bd = dd; best = i; }
    }
  }
  return best < 0 ? null : { x: best % W, y: Math.floor(best / W) };
}

function updateTutorial() {
  const card = $('#tutorial');
  const step = battle.status === 'playing' ? tutorialStep(battle) : null;
  document.querySelectorAll('.glow').forEach(el => el.classList.remove('glow'));
  if (!step) { card.classList.add('hidden'); tutPointer = null; return; }
  const steps = tutorialSteps(battle);
  const key = `${battle.tutorial}`;
  if (key !== tutKey) {
    tutKey = key;
    card.innerHTML = `<div class="tut-head"><span>TRAINING ${battle.tutorial + 1}/${steps.length}</span><button class="btn small ghost" id="btn-tut-skip" title="Unlock everything and stop the training">Skip</button></div><p>${esc(step.text)}</p>`;
    $('#btn-tut-skip').onclick = () => { skipTutorial(battle); sfx.click(); toast('Training skipped. Everything is unlocked; the field manual (?) has the details.', 'tip', 4000); updateHud(true); };
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    tutPointer = null; tutPointerAt = 0;
  }
  card.classList.remove('hidden');
  const now = performance.now();
  if (now - tutPointerAt > 1000) { tutPointerAt = now; tutPointer = findPointer(step); }
  const p = step.point || '';
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
  $('#board').innerHTML = `<table><tr><th>#</th><th>Civilization</th><th>Land</th><th>Troops</th></tr>${rows.map((f, i) => `<tr class="${f.id === PLAYER ? 'me' : ''}"><td>${i + 1}</td><td><span class="sw" style="background:${f.color}"></span>${esc(f.id === PLAYER ? 'You' : f.name)}${persona(f) ? `<small class="persona" title="${esc(persona(f).desc)}">${esc(persona(f).name)}</small>` : ''}</td><td>${((f.tiles / land) * 100).toFixed(1)}%</td><td>${fmt(f.troops)}</td></tr>`).join('')}</table>`;
}

function updateInspector() {
  const el = $('#inspector');
  const i = hoverTile >= 0 ? hoverTile : inspectTile;
  if (!battle || i < 0 || battle.status === 'spawn' || (inspectorClosed && hoverTile < 0)) { el.classList.add('hidden'); return; }
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
  if (o === PLAYER) html += '<div class="tags">Your land. Press 1–5 to build here.</div>';
  el.innerHTML = '<button class="close" title="Close" aria-label="Close">x</button>' + html;
  el.querySelector('.close').onclick = () => { inspectTile = -1; inspectorClosed = true; el.classList.add('hidden'); };
  el.classList.remove('hidden');
}

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHud < 120) return;
  lastHud = now;
  renderer.insets = layoutHud();
  const f = battle.factions[PLAYER];
  const max = maxTroops(battle, f);
  const inc = income(battle, f);
  $('#st-troops').textContent = `${fmt(f.troops)} / ${fmt(max)}`;
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
        const cap = battle.sites.find(s => s.id === 'player-capital');
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
      case 'built':
        sfx.build(); renderer.ring(n.x, n.y, '#3fd0ff', 5);
        if (n.owner === PLAYER && n.cost) renderer.pop(n.x, n.y, `-${fmt(n.cost)} minerals`, '#c9b8ff');
        break;
      case 'tutorial': sfx.objective(); break;
      case 'research': toast(`Research complete: ${esc(RESEARCH[n.id].name)}.`, 'good'); break;
      case 'landed':
        if (n.owner === PLAYER) { toast('Dropship landed. Beachhead established.', 'good'); renderer.crashLanding(n.x, n.y, { small: true, color: battle.factions[PLAYER].color }); }
        break;
      case 'dropFailed': if (n.owner === PLAYER) toast('The dropship was shot down on landing. Send more troops.', 'bad'); break;
      case 'strike': renderer.burst(n.x, n.y, '#ff7a1f', 40); renderer.ring(n.x, n.y, '#ffd25e', 8); sfx.ability(); break;
      case 'emp': renderer.ring(n.x, n.y, '#7fd8ff', 10); sfx.ability(); break;
      case 'start': {
        // Bring the camera in over the landing zone and crash-land the colony ship.
        if (renderer.cam.zoom < 4) renderer.zoomBy(1);
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
      if ((battle.factions[PLAYER].scouting || 0) >= 2 || f.kind === 'enemy') {
        toast(`${esc(f.name)} is attacking you with ${fmt(a.troops)} troops!`, 'bad', 3000);
        sfx.alarm();
      }
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
  if (e.button === 2) { armed = null; return; }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { pinch: true, dist: Math.hypot(a.x - b.x, a.y - b.y), moved: true };
  } else {
    gesture = { x: p.x, y: p.y, lx: p.x, ly: p.y, t: performance.now(), moved: false, pinch: false, type: e.pointerType };
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
    if (d / gesture.dist > 1.3) { renderer.zoomBy(1, mid.x, mid.y); gesture.dist = d; }
    else if (d / gesture.dist < 0.77) { renderer.zoomBy(-1, mid.x, mid.y); gesture.dist = d; }
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
  lastPointerTouch = e.pointerType === 'touch';
  if (pointers.size === 0) gesture = null;
  // A tap only counts when the finger did not move and no pinch happened:
  // panning the map never launches an attack by accident.
  if (!g || g.pinch || g.moved || e.button === 2 || performance.now() - g.t > 700) return;
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
  else if (armed?.kind === 'dropship') { res = playerDropship(battle, i, ratio); if (res.ok) { toast(`Dropship launched with ${fmt(res.sent)} troops.`, 'good', 2000); sfx.attack(); } }
  else if (battle.owner[i] === PLAYER) { inspectTile = inspectTile === i ? -1 : i; sfx.click(); return; }
  else {
    res = playerAttack(battle, i, ratio);
    if (res.ok) { sfx.attack(); renderer.pop(x, y, `-${fmt(res.sent)}`, '#ffe9a8'); if (!lastPointerTouch) inspectTile = i; tip('ratio', 'Troops regrow fastest when your army is well below its cap. Big attacks are not wasted.'); }
  }
  if (res && !res.ok) { sfx.error(); toast(REASONS[res.reason] || 'You cannot do that.', 'bad', 2600); }
  else if (res && res.ok && armed && armed.kind !== 'dropship') armed = null;
  else if (res && res.ok && armed?.kind === 'dropship') armed = null;
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
  const cap = battle.sites.find(s => s.id === 'player-capital');
  if (cap) renderer.centerOn(cap.x, cap.y);
}

function openHelp() {
  const cfg = config(battle);
  paused = true;
  const names = THEMES[battle.theme].names;
  const sitesHere = [...new Set(battle.sites.map(s => s.type))];
  $('#help-title').textContent = cfg.skirmish ? 'Field manual' : `${cfg.name}: ${cfg.lesson}`;
  $('#help-body').innerHTML = `
    <h4>Field notes</h4><ul>${cfg.briefing.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <h4>Controls</h4><ul>
      <li>Click enemy or unclaimed land next to your border to attack it with your attack ratio of troops.</li>
      <li>Drag to pan the map. Mouse wheel or pinch to zoom. C centers on your capital.</li>
      <li>1–5 build, 6 dropship, R research, 7–9 abilities, Space pause, L leaderboard, O objectives.</li>
      <li>On touch screens, a drag never attacks: only a clean tap does.</li></ul>
    <h4>Terrain (attack cost · defense)</h4><ul>${['plains', 'wild', 'highland', 'mountain', 'river', 'volcano', 'ruins'].map(k => { const t = TERRAIN.find(x => x.id === k); return `<li>${esc(names[k])}: ×${t.cost} · ×${t.defense}</li>`; }).join('')}</ul>
    <h4>Sites on this world</h4><ul>${sitesHere.map(t => `<li><b>${esc(SITE_TYPES[t].label)}</b>: ${esc(SITE_TYPES[t].desc)}</li>`).join('')}</ul>`;
  $('#overlay-help').classList.remove('hidden');
}

// ---------- Settings ----------

function openSettings() {
  const s = campaign ? campaign.settings : newCampaign().settings;
  $('#set-sound').checked = s.sound; $('#set-tips').checked = s.tips; $('#set-labels').checked = s.labels;
  $('#set-simple').checked = s.simple; $('#set-motion').checked = s.motion; $('#set-color').value = s.playerColor;
  if (battle) paused = true;
  $('#overlay-settings').classList.remove('hidden');
}

function closeSettings() {
  if (!campaign) { campaign = newCampaign(); }
  const s = campaign.settings;
  s.sound = $('#set-sound').checked; s.tips = $('#set-tips').checked; s.labels = $('#set-labels').checked;
  s.simple = $('#set-simple').checked; s.motion = $('#set-motion').checked; s.playerColor = $('#set-color').value;
  setSound(s.sound);
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
  const emp = $('#empire');
  const empRect = emp.getBoundingClientRect();
  const empOpen = !emp.classList.contains('collapsed');
  scr.style.setProperty('--board-max', `${Math.max(120, (empOpen ? empRect.top : H - bottom) - top - 8)}px`);
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
  setAdHandlers({
    pause: () => { adPlaying = true; setAdMute(true); },
    resume: () => { adPlaying = false; setAdMute(false); lastFrame = 0; },
  });
  renderer = new MapRenderer($('#canvas'));
  renderer.onImpact = small => (small ? sfx.thud() : sfx.crash());
  applyIcons();
  // Menus sit on a dimmed pixel starfield.
  $('#app').style.backgroundImage = `linear-gradient(rgba(6,5,12,0.55), rgba(6,5,12,0.75)), url(${backdropCanvas('noctyra', 320, 180).toDataURL()})`;

  document.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => { sfx.click(); show(b.dataset.nav); }; });
  document.querySelectorAll('[data-open="settings"]').forEach(b => { b.onclick = openSettings; });
  $('#btn-settings-close').onclick = closeSettings;
  $('#btn-continue').onclick = () => {
    const fresh = !hasProgress();
    if (!campaign) { campaign = newCampaign(); persist(); }
    // A brand-new player goes straight to the first briefing.
    if (fresh) openBriefing({ configId: PLANETS[0].id }); else show('campaign');
  };
  $('#btn-skirmish').onclick = () => { if (!campaign) { campaign = newCampaign(); persist(); } show('skirmish'); };
  $('#btn-skirmish-reroll').onclick = () => { skirmishSeed = 1 + Math.floor(Math.random() * 99999); $('#skirmish-seed').value = skirmishSeed; };
  $('#btn-new').onclick = async () => {
    if (!(await confirmBox('Start a new game? Your campaign progress, upgrades, cores and any saved battle will be lost.'))) return;
    const settings = campaign?.settings;
    campaign = newCampaign();
    if (settings) campaign.settings = settings; // keep sound, colour and accessibility choices
    persist();
    openBriefing({ configId: PLANETS[0].id });
  };
  $('#btn-resume').onclick = resumeBattle;
  $('#btn-resume-campaign').onclick = resumeBattle;
  $('#btn-upgrades').onclick = () => show('upgrades');
  $('#sel-difficulty').onchange = e => { campaign.settings.difficulty = e.target.value; persist(); };
  $('#btn-reset').onclick = async () => { if (await confirmBox('Reset the whole campaign? This cannot be undone.')) { campaign = newCampaign(); persist(); renderCampaign(); } };
  $('#btn-launch').onclick = async () => {
    const saved = campaign.battle;
    if (saved && !(await confirmBox(`Abandon your saved battle (${battleName(saved)})?`))) return;
    campaign.battle = null;
    beginBattle(briefingRef);
  };
  $('#btn-pause').onclick = () => togglePause();
  $('#btn-resume-battle').onclick = () => togglePause(false);
  $('#btn-restart').onclick = async () => {
    if (await confirmBox('Restart this world? Current battle progress will be lost.')) {
      const ref = { configId: battle.configId, theme: battle.theme, worldSeed: battle.seed };
      campaign.battle = null;
      startBattle(ref);
    }
  };
  $('#btn-quit').onclick = () => { saveBattle(); battle = null; show(campaign.battle?.configId === 'skirmish' ? 'title' : 'campaign'); };
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

  const c = $('#canvas');
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); gesture = null; });
  c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hoverTile = -1; });
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('wheel', e => { e.preventDefault(); const p = canvasXY(e); renderer.zoomBy(e.deltaY < 0 ? 1 : -1, p.x, p.y); }, { passive: false });

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
    else if (k === 'r') activateTool('research', 'research');
    else if (k === ' ') togglePause();
    else if (k === 'escape') { armed = null; inspectTile = -1; }
    else if (k === 'l') $('#btn-board').click();
    else if (k === 'o') $('#objectives').classList.toggle('hidden');
    else if (k === 'c') centerOnCapital();
    else if (k === '=' || k === '+') renderer.zoomBy(1);
    else if (k === '-') renderer.zoomBy(-1);
    else if (k === 'w' || k === 'arrowup') renderer.panBy(0, 60);
    else if (k === 's' || k === 'arrowdown') renderer.panBy(0, -60);
    else if (k === 'a' || k === 'arrowleft') renderer.panBy(60, 0);
    else if (k === 'd' || k === 'arrowright') renderer.panBy(-60, 0);
    else if (k === '[') setRatio(ratio - 0.05);
    else if (k === ']') setRatio(ratio + 0.05);
  });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveBattle(); });
  window.addEventListener('pagehide', saveBattle);

  show('title');
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
  advance: seconds => { for (let k = 0; k < seconds / TICK && battle?.status === 'playing'; k++) step(battle, TICK); },
};

init();
