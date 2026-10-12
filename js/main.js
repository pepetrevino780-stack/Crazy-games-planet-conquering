// UI controller: screens, input, HUD, tips and persistence.
import { PLANETS, TYPE_INFO, getPlanet } from './campaign.js';
import {
  newCampaign, loadCampaign, saveCampaign, isUnlocked, UPGRADES, CIVS, ABILITIES, upgradeCost,
  buyUpgrade, unlockCiv, playerLoadout, computeRewards, applyVictory, applyDefeat, assistLevel,
} from './progression.js';
import {
  createBattle, step, playerLaunch, useAbility, abilityReady, currentObjective, battleResult,
  serialize, deserialize, analyzeDefeat, TICK,
} from './game.js';
import {
  terr, eventPhase, isPowered, isShielded, networkStatus, defMult, playerVision, enemyFronts,
  countOwned, growthRate, supplyCap, totalTroops, empActive,
} from './rules.js';
import { makeView, render, hitTest, validTargetsFor } from './render.js';
import { titleScene } from './art/backdrop.js';
import {
  initPlatform, platformActive, platformStorage, setAdHandlers, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, midgameAd, rewardedAd,
} from './platform.js';

const $ = sel => document.querySelector(sel);
// Set in init(): the portal's cloud-synced save store, or localStorage.
let storage = null;
let campaign = null;
let battle = null;
let view = null;
let ratio = 0.5;
let paused = false;
let speed = 1;
let armedAbility = null;
const ui = { selection: new Set(), hover: null, drag: null, highlights: new Set(), vision: new Set(), validTargets: new Set(), now: 0 };
let lastFrame = 0;
let accumulator = 0;
let lastSave = 0;
let seenTips = new Set();
let lastEventWarn = false;
let inspectedId = null;
let adPlaying = false;
let battlesEnded = 0; // ad breaks only come after the player has played

const EVENT_TEXT = {
  eruption: { warn: 'Eruption soon', active: 'Eruption: vents surge', start: 'The vents erupt! Magma vents produce troops much faster for a few seconds.' },
  storm: { warn: 'Whiteout incoming', active: 'WHITEOUT', start: 'Whiteout! Fleets launched now crawl and lose a quarter of their troops to frostbite.', warnTip: 'A whiteout storm is coming. Launch now or wait until it passes — troops sent during the storm arrive weakened.' },
  bloom: { warn: 'Spore bloom soon', active: 'Spore bloom', start: 'Spore bloom! Every region nourished by a hub gains 4 troops. Hubs you hold feed you instead.' },
  surge: { warn: 'Grid surge soon', active: 'GRID SURGE', start: 'Grid surge! Powered defenses fire twice as fast. Hold attacks past turrets until it ends.' },
  eclipse: { warn: 'Eclipse approaching', active: 'ECLIPSE', start: 'Eclipse! Fortifications and the Citadel lose their defensive bonus. Strike now!', warnTip: 'An eclipse is coming. Gather troops next to fortified regions and strike once it begins.' },
};

const PROFILE_TEXT = {
  passive: 'Relaxed. Expands into empty land and rarely strikes your territory. A safe place to experiment.',
  cautious: 'Cautious. Reinforces threatened regions, retakes what it loses and avoids attacking into storms.',
  aggressive: 'Aggressive. Expands fast on two fronts, fed by its network hubs and spore blooms.',
  tactical: 'Tactical. Guards relays and factories, chooses targets carefully and strikes territories you leave empty.',
  mastermind: 'Coordinated. Attacks on one front per command node it holds, defends its core and times assaults to the eclipse.',
};

// ---------- Screens ----------

function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  if (name === 'title') renderTitle();
  if (name === 'campaign') renderCampaign();
  if (name === 'upgrades') renderUpgrades();
}

function persist() {
  if (campaign) saveCampaign(storage, campaign);
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function confirmBox(text) {
  return new Promise(resolve => {
    $('#confirm-text').textContent = text;
    $('#modal-confirm').classList.remove('hidden');
    const done = v => {
      $('#modal-confirm').classList.add('hidden');
      $('#confirm-yes').onclick = $('#confirm-no').onclick = null;
      resolve(v);
    };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
  });
}

let titleArt = null;
function renderTitle() {
  if (!titleArt) {
    titleArt = titleScene(320, 180).toDataURL();
    $('#screen-title').style.backgroundImage = `linear-gradient(rgba(5,3,12,0.35), rgba(5,3,12,0.55)), url(${titleArt})`;
  }
  const hasSave = !!campaign;
  $('#btn-continue').textContent = hasSave ? 'Continue campaign' : 'Start campaign';
  $('#btn-new').classList.toggle('hidden', !hasSave);
  const b = campaign?.battle;
  $('#btn-resume').classList.toggle('hidden', !b);
  if (b) $('#btn-resume').textContent = `Resume battle on ${getPlanet(b.planetId).name} (${fmtTime(b.time)})`;
}

function planetOrb(p) {
  return `background: radial-gradient(circle at 35% 30%, ${p.theme.accent}, ${p.theme.bg2} 55%, ${p.theme.bg1});`;
}

function renderCampaign() {
  $('#cores-campaign').textContent = campaign.cores;
  $('#sel-difficulty').value = campaign.settings.difficulty;
  $('#chk-tips').checked = campaign.settings.tips;
  const saved = campaign.battle;
  $('#btn-resume-campaign').classList.toggle('hidden', !saved);
  if (saved) $('#btn-resume-campaign').textContent = `Resume battle on ${getPlanet(saved.planetId).name} (${fmtTime(saved.time)})`;
  const list = $('#planet-list');
  list.innerHTML = '';
  PLANETS.forEach((p, i) => {
    const rec = campaign.planets[p.id];
    const unlocked = isUnlocked(campaign, i);
    const li = document.createElement('li');
    li.className = 'planet' + (unlocked ? '' : ' locked') + (rec.completed ? ' done' : '');
    const objs = `${rec.objectives.length}/${p.objectives.length} objectives`;
    const status = !unlocked ? `Conquer ${PLANETS[i - 1].name} to unlock`
      : rec.completed ? `Conquered · best ${fmtTime(rec.bestTime)}<br>${objs}`
      : rec.attempts ? `${rec.defeats} defeat${rec.defeats === 1 ? '' : 's'} · ${objs}` : 'Uncharted';
    li.innerHTML = `
      <span class="step">${i + 1}/5</span>
      <div class="orb" style="${planetOrb(p)}"></div>
      <h3>${esc(p.name)}</h3>
      <div class="lesson">${esc(p.lesson)}</div>
      <div class="status">${status}</div>
      <button class="btn ${unlocked && !rec.completed ? 'primary' : ''}" ${unlocked ? '' : 'disabled'}>${rec.completed ? 'Replay' : 'Invade'}</button>`;
    li.querySelector('button').onclick = () => openBriefing(p.id);
    list.appendChild(li);
  });
}

function renderUpgrades() {
  $('#cores-upgrades').textContent = campaign.cores;
  const ul = $('#upgrade-list');
  ul.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = campaign.upgrades[u.id];
    const cost = upgradeCost(campaign, u.id);
    const li = document.createElement('li');
    li.className = 'card';
    const pips = u.costs.map((_, i) => `<i class="pip ${i < lvl ? 'on' : ''}"></i>`).join('');
    li.innerHTML = `<h4>${esc(u.name)} <span class="pips">${pips}</span></h4><p>${esc(u.desc)}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    if (cost === null) { btn.textContent = 'Maxed'; btn.disabled = true; }
    else { btn.textContent = `${lvl ? 'Upgrade' : 'Acquire'} · ${cost}`; btn.disabled = campaign.cores < cost; }
    btn.onclick = () => { if (buyUpgrade(campaign, u.id)) { persist(); renderUpgrades(); } };
    li.appendChild(btn);
    ul.appendChild(li);
  }
  const cl = $('#civ-list');
  cl.innerHTML = '';
  for (const c of CIVS) {
    const owned = campaign.civsUnlocked.includes(c.id);
    const li = document.createElement('li');
    li.className = 'card' + (campaign.civ === c.id ? ' selected' : '');
    li.innerHTML = `<h4><span><span class="swatch" style="background:${c.color}"></span>${esc(c.name)}</span></h4><p>${esc(c.desc)}</p>`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    if (campaign.civ === c.id) { btn.textContent = 'Commanding'; btn.disabled = true; }
    else if (owned) { btn.textContent = 'Command'; btn.onclick = () => { campaign.civ = c.id; persist(); renderUpgrades(); }; }
    else {
      btn.textContent = `Contact · ${c.cost}`;
      btn.disabled = campaign.cores < c.cost;
      btn.onclick = () => { if (unlockCiv(campaign, c.id)) { campaign.civ = c.id; persist(); renderUpgrades(); } };
    }
    li.appendChild(btn);
    cl.appendChild(li);
  }
}

let briefingPlanet = null;
function openBriefing(planetId) {
  const p = getPlanet(planetId);
  briefingPlanet = p.id;
  $('#brief-title').textContent = p.name;
  $('#brief-lesson').textContent = `Lesson ${PLANETS.indexOf(p) + 1}: ${p.lesson}`;
  $('#brief-tagline').textContent = p.tagline;
  const vic = p.victory.conds.map(c => `<li>${esc(c.label)}</li>`).join('');
  $('#brief-victory').innerHTML = vic + '<li>Defeat: lose your capital.</li>';
  $('#brief-enemy').innerHTML = `<b style="color:${p.enemy.color}">${esc(p.enemy.name)}</b> — ${esc(PROFILE_TEXT[p.enemy.profile])}`;
  $('#brief-notes').innerHTML = p.briefing.map(b => `<li>${esc(b)}</li>`).join('');
  const assist = assistLevel(campaign, p.id);
  $('#brief-assist').classList.toggle('hidden', !assist);
  $('#brief-assist').textContent = assist ? `Adaptive assist ${assist}/3: after your earlier defeats, enemy commanders here react a little slower.` : '';
  show('briefing');
}

// ---------- Battle lifecycle ----------

// Start a battle after a natural break, offering the portal an ad slot first.
// Never before the session's first battle; the SDK also rate-limits ads.
async function beginBattle(planetId) {
  if (battlesEnded > 0) await midgameAd();
  startBattle(planetId);
}

function startBattle(planetId) {
  const rec = campaign.planets[planetId];
  rec.attempts += 1;
  battle = createBattle(planetId, playerLoadout(campaign), {
    difficulty: campaign.settings.difficulty,
    assist: assistLevel(campaign, planetId),
    seed: (Date.now() & 0x7fffffff),
  });
  enterBattle();
  const p = getPlanet(planetId);
  toast(`<b>${esc(p.name)}</b> — ${esc(p.lesson)}`, 'tip', 5000);
}

function enterBattle() {
  seenTips = new Set(battle.objectivesDone);
  ui.selection.clear();
  armedAbility = null;
  paused = false;
  speed = 1;
  $('#btn-speed').innerHTML = '1&times;';
  $('#overlay-pause').classList.add('hidden');
  $('#overlay-help').classList.add('hidden');
  $('#toasts').innerHTML = '';
  lastEventWarn = false;
  inspectedId = null;
  const p = getPlanet(battle.planetId);
  $('#hud-planet').textContent = p.name;
  $('#hud-lesson').textContent = p.lesson;
  buildAbilities();
  objKey = '';
  show('battle');
  $('#objectives').classList.toggle('collapsed', window.innerWidth < 700 || window.innerHeight < 500);
  updateHud();
  resize();
  saveBattle();
}

function saveBattle() {
  if (!battle || battle.status !== 'playing') return;
  campaign.battle = serialize(battle);
  persist();
  lastSave = performance.now();
}

function resumeBattle() {
  const restored = deserialize(campaign.battle);
  if (!restored) {
    campaign.battle = null;
    persist();
    show('campaign');
    return;
  }
  battle = restored;
  enterBattle();
  toast('Battle resumed.', 'good');
}

function endBattle() {
  gameplayStop();
  const p = getPlanet(battle.planetId);
  const won = battle.status === 'won';
  const body = $('#debrief-body');
  if (won) {
    const result = battleResult(battle);
    const rewards = computeRewards(campaign, p, result);
    applyVictory(campaign, p, result, rewards);
    persist();
    happytime();
    const idx = PLANETS.indexOf(p);
    $('#debrief-title').textContent = `${p.name} conquered`;
    $('#debrief-sub').textContent = `Lesson learned: ${p.lesson} · ${fmtTime(result.time)}`;
    const rows = rewards.lines.map(l => `<tr><td>${esc(l.label)}</td><td>+${l.value}</td></tr>`).join('');
    const next = PLANETS[idx + 1];
    body.innerHTML = `
      <table class="reward-table">${rows}<tr class="total"><td>Stellar Cores earned</td><td>+${rewards.total}</td></tr></table>
      ${platformActive() ? `<p class="reward-ad"><button id="btn-reward-ad" class="btn">Watch an ad: +${Math.ceil(rewards.total / 2)} bonus cores</button></p>` : ''}
      <h3>Skills proven</h3><ul class="bullets">${p.lessons.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      ${next ? `<p class="note">Next: <b>${esc(next.name)}</b> — ${esc(next.lesson)}. Spend your cores on upgrades before you launch.</p>`
        : '<p class="note">You have mastered all five lessons. The sector is yours, Commander.</p>'}`;
    const adBtn = $('#btn-reward-ad');
    if (adBtn) {
      const bonus = Math.ceil(rewards.total / 2);
      adBtn.onclick = async () => {
        adBtn.disabled = true;
        if (await rewardedAd()) {
          campaign.cores += bonus;
          campaign.totalEarned += bonus;
          persist();
          adBtn.textContent = `+${bonus} bonus cores added`;
        } else {
          adBtn.textContent = 'No ad available right now';
        }
      };
    }
    $('#btn-debrief-primary').textContent = 'Command upgrades';
    $('#btn-debrief-primary').onclick = () => show('upgrades');
    $('#btn-debrief-secondary').textContent = next ? `Brief ${next.name}` : 'Campaign';
    $('#btn-debrief-secondary').onclick = () => (next ? openBriefing(next.id) : show('campaign'));
  } else {
    const tips = analyzeDefeat(battle);
    applyDefeat(campaign, p);
    persist();
    const assist = assistLevel(campaign, p.id);
    $('#debrief-title').textContent = 'Capital lost';
    $('#debrief-sub').textContent = `${p.name} · ${fmtTime(battle.time)} · ${p.lesson}`;
    body.innerHTML = `
      <h3>What went wrong</h3><ul class="bullets tips">${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h3>This planet tests</h3><ul class="bullets">${p.lessons.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      ${assist ? `<p class="assist">Adaptive assist ${assist}/3 active for your next attempt.</p>` : ''}`;
    $('#btn-debrief-primary').textContent = 'Retry';
    $('#btn-debrief-primary').onclick = () => beginBattle(p.id);
    $('#btn-debrief-secondary').textContent = 'Campaign';
    $('#btn-debrief-secondary').onclick = () => show('campaign');
  }
  battle = null;
  battlesEnded++;
  show('debrief');
}

// ---------- HUD ----------

function toast(html, kind = '', ms = 4200) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = html;
  box.appendChild(el);
  const max = window.innerWidth < 700 || window.innerHeight < 500 ? 2 : 4;
  while (box.children.length > max) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}

function tip(key, text) {
  if (!campaign.settings.tips || seenTips.has(key)) return;
  seenTips.add(key);
  toast(`<b>Tip:</b> ${esc(text)}`, 'tip', 7000);
}

function buildAbilities() {
  const box = $('#abilities');
  box.innerHTML = '';
  for (const id of battle.factions[1].abilities) {
    const b = document.createElement('button');
    b.className = 'btn ability';
    b.dataset.ability = id;
    b.innerHTML = `${ABILITIES[id].name} <small>(${ABILITIES[id].key})</small><span class="cd"></span>`;
    b.onclick = () => armAbility(id);
    box.appendChild(b);
  }
}

function armAbility(id) {
  if (!battle || !abilityReady(battle, id)) return;
  armedAbility = armedAbility === id ? null : id;
  ui.selection.clear();
  if (armedAbility) {
    const hint = { strike: 'Tap an enemy or neutral territory to bombard it.', rally: 'Tap one of your territories to muster troops there.', emp: 'Tap a hub, relay, defense, command node or fortress to disable it.' }[id];
    toast(hint, 'tip', 3000);
  }
}

function updateAbilities() {
  document.querySelectorAll('.ability').forEach(b => {
    const id = b.dataset.ability;
    const cdTotal = ABILITIES[id].cooldown * battle.factions[1].cooldown;
    const left = Math.max(0, battle.cooldowns[id] - battle.time);
    b.disabled = left > 0;
    b.classList.toggle('armed', armedAbility === id);
    b.querySelector('.cd').style.width = `${100 * (1 - left / cdTotal)}%`;
  });
}

function condProgress(c) {
  const owned = id => terr(battle, id).owner === 1;
  if (c.type === 'own') return { done: c.ids.every(owned), text: '' };
  if (c.type === 'ownCount') {
    const n = c.ids.filter(owned).length;
    return { done: n >= c.n, text: ` (${Math.min(n, c.n)}/${c.n})` };
  }
  if (c.type === 'hold') {
    const i = getPlanet(battle.planetId).victory.conds.indexOf(c);
    const t = battle.hold[i];
    return { done: t >= c.duration, text: ` (${fmtTime(t)}/${fmtTime(c.duration)})`, frac: t / c.duration, holding: c.ids.every(owned) };
  }
  return { done: false, text: '' };
}

let objKey = '';
function updateObjectives() {
  const p = getPlanet(battle.planetId);
  const cur = currentObjective(battle);
  const parts = [];
  p.victory.conds.forEach(c => {
    const pr = condProgress(c);
    const bar = pr.frac !== undefined ? `<div class="progress"><i style="width:${Math.min(100, pr.frac * 100).toFixed(1)}%"></i></div>` : '';
    parts.push(`<div class="obj ${pr.done ? 'done' : 'current'}"><span class="mark">${pr.done ? '&#10003;' : '&#9733;'}</span><span>${esc(c.label)}${pr.text}${pr.holding ? ' · holding' : ''}${bar}</span></div>`);
  });
  parts.push('<div class="obj-sep"></div>');
  for (const o of p.objectives) {
    const done = battle.objectivesDone.includes(o.id);
    const isCur = cur && cur.id === o.id;
    parts.push(`<div class="obj ${done ? 'done' : isCur ? 'current' : 'pending'}"><span class="mark">${done ? '&#10003;' : isCur ? '&#9656;' : '&#9675;'}</span><span>${esc(o.label)}</span><span class="rw">+${o.reward}</span><button class="why" data-tip="${o.id}" title="Explain">?</button></div>`);
  }
  const html = parts.join('');
  if (html !== objKey) {
    objKey = html;
    $('#obj-body').innerHTML = html;
    $('#obj-count').textContent = `${battle.objectivesDone.length}/${p.objectives.length}`;
  }
  const next = p.victory.conds.find(c => !condProgress(c).done);
  const headline = cur ? cur.label : next ? next.label : '';
  if ($('#obj-current').textContent !== headline) $('#obj-current').textContent = headline;
}

function updateHud() {
  $('#hud-time').textContent = fmtTime(battle.time);
  const ev = eventPhase(battle);
  const chip = $('#hud-event');
  if (ev.type) {
    const txt = EVENT_TEXT[ev.type];
    chip.classList.remove('hidden');
    chip.classList.toggle('alert', ev.active);
    chip.classList.toggle('warn', ev.warning);
    chip.textContent = ev.active ? `${txt.active} ${Math.ceil(ev.remaining)}s`
      : ev.warning ? `${txt.warn}: ${Math.ceil(ev.remaining)}s` : `${txt.warn.replace(/ (soon|incoming|approaching)$/, '')} in ${Math.ceil(ev.remaining)}s`;
    if (ev.warning && !lastEventWarn && txt.warnTip) tip('warn-' + ev.type, txt.warnTip);
    lastEventWarn = ev.warning;
  }
  // Planet-specific intel.
  const intel = $('#hud-intel');
  const pid = battle.planetId;
  let text = '';
  if (pid === 'mycelion') {
    const held = battle.territories.filter(t => t.type === 'hub' && t.owner === 2).length;
    text = `Swarm hubs: ${held}/3${isShielded(battle, terr(battle, 'heart')) ? ' · Heart shielded' : ' · Heart EXPOSED'}`;
  } else if (pid === 'xythera') {
    const live = battle.territories.filter(t => t.type === 'turret' && t.owner === 2 && isPowered(battle, t)).length;
    text = `Powered defenses: ${live}`;
  } else if (pid === 'noctyra') {
    text = `Enemy fronts: ${enemyFronts(battle, 2)} · Supply ${Math.floor(totalTroops(battle, 1))}/${supplyCap(battle, 1)}`;
  } else if (pid === 'cryonis') {
    text = `Crystals held: ${['c1', 'c2', 'c3'].filter(id => terr(battle, id).owner === 1).length}/3`;
  } else {
    text = `Territories: ${countOwned(battle, 1)}`;
  }
  intel.classList.remove('hidden');
  intel.textContent = text;
  updateObjectives();
  updateAbilities();
  updateInspector();
}

function describe(t) {
  const info = TYPE_INFO[t.type];
  const owner = t.owner === 0 ? 'Neutral' : t.owner === 1 ? 'Yours' : battle.factions[2].name;
  const tags = [];
  const d = defMult(battle, t);
  if (d > 1.05) tags.push(`Defense ×${d.toFixed(1)}`);
  if (t.type === 'turret') tags.push(isPowered(battle, t) ? 'Powered: fires on passing fleets' : 'Unpowered');
  if (t.powers) tags.push(`Powers ${t.powers.length} defense${t.powers.length > 1 ? 's' : ''}`);
  const ns = networkStatus(battle, t);
  if (ns === 'nourished') tags.push('Nourished by hub');
  if (ns === 'withered') tags.push('Cut off: withering');
  if (t.type === 'hub') tags.push('Feeds linked regions');
  if (isShielded(battle, t)) tags.push('Shielded while its hubs stand');
  if (t.type === 'crystal') tags.push('+production for its owner');
  if (t.type === 'factory') tags.push('+production for its owner');
  if (t.type === 'command') tags.push('+1 enemy attack front');
  if (empActive(battle, t)) tags.push('EMP: disabled');
  const visible = ui.vision.has(t.id);
  const g = growthRate(battle, t);
  return `<b>${esc(t.name || info.label)}</b> · ${owner} · ${visible ? Math.floor(t.troops) : '?'} troops${g > 0 && visible ? ` (+${g.toFixed(1)}/s)` : ''}
    ${t.name ? `<div>${esc(info.label)}</div>` : ''}${tags.length ? `<div class="tags">${esc(tags.join(' · '))}</div>` : ''}`;
}

function updateInspector() {
  const id = ui.hover || inspectedId || (ui.selection.size === 1 ? [...ui.selection][0] : null);
  const el = $('#inspector');
  const html = id ? describe(terr(battle, id)) : '';
  el.classList.toggle('hidden', !id);
  if (el.innerHTML !== html) el.innerHTML = html;
  // In portrait the inspector sits at the top; keep toasts below it.
  if (el.style.bottom === 'auto') {
    const base = $('#objectives').getBoundingClientRect().bottom + 6;
    $('#toasts').style.top = `${id ? el.getBoundingClientRect().bottom + 6 : base}px`;
  }
}

function processNotices() {
  const p = getPlanet(battle.planetId);
  for (const n of battle.notices.splice(0)) {
    const t = n.target ? terr(battle, n.target) : null;
    const name = t ? esc(t.name || TYPE_INFO[t.type].label) : '';
    switch (n.kind) {
      case 'capture':
        if (n.owner === 1 && t.type !== 'normal') toast(`${name} captured.`, 'good');
        if (n.prevOwner === 1) toast(`${name} lost!`, 'bad');
        if (n.owner === 1 && t.type === 'hub') tip('hub', 'Hub captured: its linked regions stop growing for the Swarm and begin to wither.');
        if (n.owner === 1 && t.type === 'relay') tip('relay', 'Relay captured: every defense it powered has gone dark.');
        if (n.owner === 1 && t.type === 'command') tip('command', 'Command node taken: the Dominion loses one attack front.');
        if (n.owner === 1 && t.type === 'factory') tip('factory', 'Ancient factory secured: all your territories produce faster.');
        break;
      case 'repelled':
        toast(`Attack on ${name} repelled.`, 'good', 2500);
        break;
      case 'shieldBlock':
        if (n.owner === 1) toast(`The shield over ${name} absorbed your attack.`, 'bad');
        break;
      case 'objective': {
        const o = p.objectives.find(x => x.id === n.id);
        toast(`Objective complete: ${esc(o.label)} <b>+${o.reward}</b>`, 'good');
        break;
      }
      case 'eventStart':
        toast(EVENT_TEXT[n.type].start, n.type === 'eclipse' || n.type === 'eruption' ? 'good' : 'bad', 4500);
        break;
      default:
    }
  }
  const cur = currentObjective(battle);
  ui.highlights = new Set(cur?.highlight || []);
  if (cur) tip(cur.id, cur.tip);
}

// ---------- Input ----------

function canvasPoint(e) {
  const r = $('#canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

const REASONS = {
  shielded: 'Shielded! Capture the hubs that feed it first.',
  notAdjacent: 'Target is not connected to the selected territory. Attack along the lanes.',
  noTroops: 'Not enough troops to send.',
  notReady: 'Ability still recharging.',
  ownTarget: 'Choose an enemy or neutral territory.',
  notOwn: 'Choose one of your own territories.',
  empTarget: 'EMP works on hubs, relays, defenses, command nodes and fortresses.',
};

function launchTo(targetId, sources) {
  const res = playerLaunch(battle, [...sources], targetId, ratio);
  if (!res.ok) toast(REASONS[res.reason] || 'Cannot send there.', 'bad', 2500);
  else {
    const t = terr(battle, targetId);
    if (t.owner !== 1 && !seenTips.has('ratio') && countOwned(battle, 1) >= 3) {
      tip('ratio', 'Watch the numbers: an attack succeeds only if the troops arriving (× attack strength) beat the defenders × their defense bonus.');
    }
  }
  return res.ok;
}

function onPointerDown(e) {
  if (!battle || paused) return;
  const pt = canvasPoint(e);
  const t = hitTest(battle, view, pt.x, pt.y);
  $('#canvas').setPointerCapture?.(e.pointerId);
  if (armedAbility) {
    if (t) {
      const res = useAbility(battle, armedAbility, t.id);
      if (!res.ok) toast(REASONS[res.reason] || 'Invalid target.', 'bad', 2500);
      else armedAbility = null;
    } else armedAbility = null;
    return;
  }
  if (!t) {
    ui.selection.clear();
    inspectedId = null;
    return;
  }
  if (t.owner === 1) {
    ui.drag = { from: t.id, startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, active: false };
  } else if (ui.selection.size) {
    launchTo(t.id, ui.selection);
    ui.selection.clear();
  } else {
    inspectedId = inspectedId === t.id ? null : t.id;
  }
}

function onPointerMove(e) {
  if (!battle) return;
  const pt = canvasPoint(e);
  if (ui.drag) {
    ui.drag.x = pt.x; ui.drag.y = pt.y;
    if (Math.hypot(pt.x - ui.drag.startX, pt.y - ui.drag.startY) > 12) ui.drag.active = true;
  }
  if (e.pointerType === 'mouse' || ui.drag?.active) {
    const t = hitTest(battle, view, pt.x, pt.y);
    ui.hover = t ? t.id : null;
  }
}

function onPointerUp(e) {
  if (!battle || !ui.drag) { if (e.pointerType !== 'mouse') ui.hover = null; return; }
  const pt = canvasPoint(e);
  const drag = ui.drag;
  ui.drag = null;
  if (e.pointerType !== 'mouse') ui.hover = null;
  if (drag.active) {
    const t = hitTest(battle, view, pt.x, pt.y);
    if (t && t.id !== drag.from) {
      const sources = ui.selection.has(drag.from) ? ui.selection : new Set([drag.from]);
      launchTo(t.id, sources);
      ui.selection.clear();
    }
    return;
  }
  // Tap on own territory toggles selection.
  if (ui.selection.has(drag.from)) ui.selection.delete(drag.from);
  else {
    ui.selection.add(drag.from);
    if (ui.selection.size === 1) tip('select', 'Tap a highlighted target to send troops. Tap more of your territories to attack from several at once, or drag to send reinforcements.');
  }
  inspectedId = null;
}

function setRatio(r) {
  ratio = r;
  document.querySelectorAll('.btn.ratio').forEach(b => b.classList.toggle('active', Number(b.dataset.ratio) === r));
}

function togglePause(force) {
  if (!battle) return;
  paused = force ?? !paused;
  $('#overlay-pause').classList.toggle('hidden', !paused);
  if (paused) saveBattle();
}

function openHelp() {
  if (!battle) return;
  const p = getPlanet(battle.planetId);
  paused = true;
  $('#help-title').textContent = `${p.name}: ${p.lesson}`;
  const objTips = p.objectives.map(o => `<li><b>${esc(o.label)}.</b> ${esc(o.tip)}</li>`).join('');
  $('#help-body').innerHTML = `
    <h4>Field notes</h4><ul>${p.briefing.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <h4>Objectives</h4><ul>${objTips}</ul>
    <h4>Controls</h4>
    <ul><li>Tap your territory to select it (tap more to combine), then tap a connected target.</li>
    <li>Drag from your territory to any connected territory to attack or reinforce.</li>
    <li>Attack ratio: 25–100% of each source's troops. Keys 1–4.</li>
    <li>Abilities: Q / W / E, then tap a target. Space pauses.</li>
    <li>Combat: attackers × attack strength vs defenders × defense bonus. Fortified, nourished, powered and capital territories defend better.</li></ul>`;
  $('#overlay-help').classList.remove('hidden');
}

// ---------- Main loop ----------

// Fit the map into the space the HUD leaves free, and stack the overlays
// under the top bar (its height changes as it wraps on narrow screens).
function hudInsets(w, h) {
  const hudTop = $('.hud-top').getBoundingClientRect().bottom;
  const obj = $('#objectives');
  obj.style.top = `${hudTop + 6}px`;
  const objRect = obj.getBoundingClientRect();
  const portraitPhone = w < 600 && h > w;
  $('#toasts').style.top = portraitPhone ? `${objRect.bottom + 6}px` : `${hudTop + 6}px`;
  // In portrait the player's base is at the bottom, so inspect from the top.
  const insp = $('#inspector');
  insp.style.top = portraitPhone ? `${objRect.bottom + 6}px` : '';
  insp.style.bottom = portraitPhone ? 'auto' : '';
  const bar = $('.hud-bottom').getBoundingClientRect();
  const side = bar.height > bar.width; // controls stacked in a side column
  // Keep the map clear of the objectives panel when there is room beside it.
  let left = !obj.classList.contains('collapsed') && w - objRect.right > 640 ? objRect.right + 4 : 0;
  if (side) left = Math.max(left, bar.right + 4);
  return { top: hudTop + 4, bottom: side ? 0 : Math.max(0, h - bar.top + 4), left, right: 0 };
}

function resize() {
  const c = $('#canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  view = makeView(w, h, hudInsets(w, h));
  view.dpr = dpr;
}

// Tell the portal when the player is actually playing.
function syncGameplay() {
  const playing = !!battle && battle.status === 'playing' && !paused && !adPlaying && !document.hidden;
  if (playing) gameplayStart(); else gameplayStop();
}

function frame(ts) {
  requestAnimationFrame(frame);
  syncGameplay();
  const dt = Math.min(0.25, (ts - (lastFrame || ts)) / 1000);
  lastFrame = ts;
  if (!battle || !view) return;
  if (!paused && !adPlaying) {
    accumulator += dt * speed;
    while (accumulator >= TICK) {
      step(battle, TICK);
      accumulator -= TICK;
      if (battle.status !== 'playing') break;
    }
  }
  if (battle.status !== 'playing') {
    processNotices();
    accumulator = 0;
    campaign.battle = null;
    endBattle();
    return;
  }
  for (const id of [...ui.selection]) if (terr(battle, id).owner !== 1) ui.selection.delete(id);
  ui.vision = playerVision(battle);
  ui.validTargets = ui.selection.size ? validTargetsFor(battle, ui.selection) : new Set();
  ui.now = ts;
  processNotices();
  const ctx = $('#canvas').getContext('2d');
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  render(ctx, battle, view, ui);
  updateHud();
  if (ts - lastSave > 5000) saveBattle();
}

// ---------- Wiring ----------

async function init() {
  await initPlatform();
  loadingStart();
  storage = platformStorage();
  campaign = loadCampaign(storage) || null;
  setAdHandlers({
    pause: () => { adPlaying = true; },
    resume: () => { adPlaying = false; lastFrame = 0; },
  });
  document.querySelectorAll('[data-nav]').forEach(b => { b.onclick = () => show(b.dataset.nav); });
  $('#btn-continue').onclick = () => {
    if (!campaign) { campaign = newCampaign(); persist(); }
    show('campaign');
  };
  $('#btn-new').onclick = async () => {
    if (await confirmBox('Start a new campaign? All progress, upgrades and cores will be lost.')) {
      campaign = newCampaign(); persist(); show('campaign');
    }
  };
  $('#btn-resume').onclick = resumeBattle;
  $('#btn-resume-campaign').onclick = resumeBattle;
  $('#btn-upgrades').onclick = () => show('upgrades');
  $('#sel-difficulty').onchange = e => { campaign.settings.difficulty = e.target.value; persist(); };
  $('#chk-tips').onchange = e => { campaign.settings.tips = e.target.checked; persist(); };
  $('#btn-reset').onclick = async () => {
    if (await confirmBox('Reset the whole campaign? This cannot be undone.')) {
      campaign = newCampaign(); persist(); renderCampaign();
    }
  };
  $('#btn-launch').onclick = async () => {
    const saved = campaign.battle;
    if (saved && !(await confirmBox(`Abandon your saved battle on ${getPlanet(saved.planetId).name}?`))) return;
    campaign.battle = null;
    beginBattle(briefingPlanet);
  };
  $('#btn-pause').onclick = () => togglePause();
  $('#btn-resume-battle').onclick = () => togglePause(false);
  $('#btn-restart').onclick = async () => {
    if (await confirmBox('Restart this planet? Current battle progress will be lost.')) {
      const id = battle.planetId;
      campaign.battle = null;
      startBattle(id);
    }
  };
  $('#btn-quit').onclick = () => { saveBattle(); battle = null; show('campaign'); };
  $('#btn-help').onclick = openHelp;
  $('#btn-help-close').onclick = () => { $('#overlay-help').classList.add('hidden'); paused = false; };
  $('#btn-speed').onclick = () => { speed = speed === 1 ? 2 : 1; $('#btn-speed').innerHTML = `${speed}&times;`; };
  $('#obj-toggle').onclick = () => { $('#objectives').classList.toggle('collapsed'); resize(); };
  $('#obj-body').addEventListener('click', e => {
    const id = e.target.dataset?.tip;
    if (!id) return;
    const o = getPlanet(battle.planetId).objectives.find(x => x.id === id);
    toast(`<b>${esc(o.label)}:</b> ${esc(o.tip)}`, 'tip', 7000);
  });
  document.querySelectorAll('.btn.ratio').forEach(b => { b.onclick = () => setRatio(Number(b.dataset.ratio)); });

  const c = $('#canvas');
  c.addEventListener('pointerdown', onPointerDown);
  c.addEventListener('pointermove', onPointerMove);
  c.addEventListener('pointerup', onPointerUp);
  c.addEventListener('pointercancel', () => { ui.drag = null; });
  c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') ui.hover = null; });
  c.addEventListener('contextmenu', e => e.preventDefault());

  // Keep the embedding page from scrolling on game keys.
  window.addEventListener('keydown', e => {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault();
  });
  window.addEventListener('keydown', e => {
    if (!battle) return;
    const k = e.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(k)) setRatio([0.25, 0.5, 0.75, 1][Number(k) - 1]);
    else if (k === ' ') togglePause();
    else if (k === 'escape') { ui.selection.clear(); armedAbility = null; inspectedId = null; }
    else if (k === 'q') armAbility('strike');
    else if (k === 'w') armAbility('rally');
    else if (k === 'e') armAbility('emp');
  });
  window.addEventListener('resize', resize);
  // Save when the page is hidden or closed so nothing is lost.
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
  screenPos: id => { const t = terr(battle, id); return view.toScreen(t.x, t.y); },
};

init();
