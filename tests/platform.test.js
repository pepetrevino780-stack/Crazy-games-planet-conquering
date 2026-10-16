import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPlatform, platformActive, platformStorage, setAdHandlers, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, midgameAd, rewardedAd, onAudioSettings,
} from '../js/platform.js';

const fakeLocal = { getItem: () => null, setItem: () => {} };

function mockSdk(environment, adBehaviour = 'finish') {
  const calls = [];
  const data = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
  const SDK = {
    environment: 'uninitialised',
    async init() { calls.push('init'); SDK.environment = environment; },
    data,
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
    },
    ad: {
      requestAd(type, cb) {
        calls.push('ad:' + type);
        if (adBehaviour === 'finish') { cb.adStarted(); setTimeout(cb.adFinished, 5); }
        if (adBehaviour === 'error') setTimeout(() => cb.adError({ code: 'unfilled' }), 5);
        if (adBehaviour === 'throw') throw new Error('disabled');
        // 'ignore': never calls back
      },
    },
  };
  return { win: { CrazyGames: { SDK }, localStorage: fakeLocal }, calls, data };
}

test('without the SDK everything is a safe no-op', async () => {
  assert.equal(await initPlatform({ localStorage: fakeLocal }), 'none');
  assert.equal(platformActive(), false);
  assert.equal(platformStorage({ localStorage: fakeLocal }), fakeLocal);
  loadingStart(); gameplayStart(); gameplayStop(); happytime();
  assert.equal(await midgameAd(), false);
  assert.equal(await rewardedAd(), false);
});

test('the disabled environment (other websites) never calls the SDK', async () => {
  const { win, calls } = mockSdk('disabled');
  assert.equal(await initPlatform(win), 'none');
  gameplayStart();
  assert.equal(await midgameAd(), false);
  assert.deepEqual(calls, ['init']);
  assert.equal(platformStorage(win), fakeLocal);
});

test('on CrazyGames: lifecycle events, cloud saves and deduplicated gameplay events', async () => {
  const { win, calls, data } = mockSdk('crazygames');
  assert.equal(await initPlatform(win), 'crazygames');
  assert.equal(platformStorage(win), data, 'saves go through the Data module');
  loadingStart(); loadingStop();
  gameplayStart(); gameplayStart(); gameplayStop(); gameplayStop(); gameplayStart();
  happytime();
  assert.deepEqual(calls, ['init', 'loadingStart', 'loadingStop', 'gameplayStart', 'gameplayStop', 'gameplayStart', 'happytime']);
  gameplayStop();
});

test('ads pause the game and resume it afterwards', async () => {
  const { win } = mockSdk('crazygames', 'finish');
  await initPlatform(win);
  const events = [];
  setAdHandlers({ pause: () => events.push('pause'), resume: () => events.push('resume') });
  assert.equal(await rewardedAd(), true);
  assert.deepEqual(events, ['pause', 'resume']);
});

test('unfilled or failing ads never block the game', async () => {
  for (const behaviour of ['error', 'throw']) {
    const { win } = mockSdk('crazygames', behaviour);
    await initPlatform(win);
    assert.equal(await midgameAd(), false, behaviour);
  }
});

test('an ignored ad request times out and the game carries on', async () => {
  const { win } = mockSdk('local', 'ignore');
  await initPlatform(win);
  const t0 = Date.now();
  assert.equal(await midgameAd(), false);
  assert.ok(Date.now() - t0 < 6000);
});

// ---------- One look on every planet ----------

test('one look on every planet: every UI icon lives in js/art/sprites.js and nothing tints the HUD per theme', async () => {
  const { readFileSync } = await import('node:fs');
  const { ICONS, SPRITES } = await import('../js/art/sprites.js');
  const { ABILITIES } = await import('../js/progression.js');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  const used = new Set([
    ...[...main.matchAll(/iconURL\('([a-z_]+)'/g)].map(m => m[1]),
    ...[...html.matchAll(/data-icon="([a-z_]+)"/g)].map(m => m[1]),
    ...Object.keys(ABILITIES),
  ]);
  for (const name of used) assert.ok(ICONS[name], `icon "${name}" is drawn in sprites.js`);
  // Toolbar building icons come from the shared building sprites, in one fixed colour.
  assert.ok(SPRITES.ship && SPRITES.fleet);
  assert.match(main, /spriteCanvas\(type, '#3fd0ff'\)/);
  // No image files or inline SVG icons outside the sprite sheet.
  assert.doesNotMatch(html, /<svg|\.png"|\.svg"/);
  assert.doesNotMatch(css, /\.(png|svg|gif)\b/);
  // Nothing styles the HUD by planet: no theme classes or attributes, no theme colours in CSS.
  assert.doesNotMatch(main, /(classList\.(add|toggle)|dataset)\.?[^;\n]*\btheme\b/);
  assert.doesNotMatch(css, /\b(vulkara|cryonis|mycelion|xythera|noctyra)\b|\[data-theme/i);
});

// ---------- Audio ----------

test('CrazyGames mute: the game follows muteAudio and its changes', async () => {
  const { win } = mockSdk('crazygames');
  let listener = null;
  win.CrazyGames.SDK.game.settings = { muteAudio: true };
  win.CrazyGames.SDK.game.addSettingsChangeListener = cb => { listener = cb; };
  await initPlatform(win);
  const seen = [];
  onAudioSettings(m => seen.push(m));
  assert.deepEqual(seen, [true], 'muted from the start');
  listener({ muteAudio: false });
  listener({ disableChat: true }); // other settings are ignored
  assert.deepEqual(seen, [true, false]);
  // Off the portal it never calls back.
  await initPlatform({ localStorage: fakeLocal });
  const off = [];
  onAudioSettings(m => off.push(m));
  assert.deepEqual(off, []);
});

test('audio: music loops per world, effects normalised, mutes and volumes', async () => {
  const audio = await import('../js/audio.js');
  // Every world has its own loop: deterministic, 8 bars, notes in key and range.
  const seen = new Set();
  for (const name of ['menu', 'vulkara', 'cryonis', 'mycelion', 'xythera', 'noctyra']) {
    const a = audio.composeLoop(name), b = audio.composeLoop(name);
    assert.deepEqual(a, b, `${name} is deterministic`);
    assert.equal(a.steps, 128);
    for (const v of ['bass', 'lead', 'pad', 'kick', 'hat']) assert.ok(a.events.some(e => e.voice === v), `${name} has ${v}`);
    for (const e of a.events.filter(e => e.midi)) {
      assert.ok(e.midi >= 30 && e.midi <= 96, `${name} note in range`);
      assert.ok(e.step >= 0 && e.step < a.steps);
    }
    seen.add(JSON.stringify(a.events.slice(0, 40)));
  }
  assert.equal(seen.size, 6, 'each world sounds different');
  // Effects: no role/wave combination is harsh, and big moments stay biggest.
  for (const w of Object.keys(audio.WAVE_LOUDNESS)) for (const r of Object.keys(audio.ROLES)) assert.ok(audio.effectGain(w, r) <= 0.09);
  assert.ok(audio.effectGain('square', 'ui') < audio.effectGain('triangle', 'ui'), 'square waves are tamed');
  assert.ok(audio.effectGain('triangle', 'big') > audio.effectGain('triangle', 'event'));
  // Master level: settings and every kind of mute.
  const v = { master: 0.7, music: 0.5, sfx: 0.8 };
  const on = { enabled: true, adMuted: false, portalMuted: false, hidden: false };
  assert.equal(audio.masterLevel(v, on), 0.7);
  for (const k of ['adMuted', 'portalMuted', 'hidden']) assert.equal(audio.masterLevel(v, { ...on, [k]: true }), 0, k);
  assert.equal(audio.masterLevel(v, { ...on, enabled: false }), 0);
  // The distant battle grows with the fronts, up to a cap.
  assert.equal(audio.battleBedLevel(0), 0);
  assert.ok(audio.battleBedLevel(2) > audio.battleBedLevel(1));
  assert.equal(audio.battleBedLevel(20), audio.battleBedLevel(50));
});
