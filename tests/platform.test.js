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

// ---------- Keyboard layouts ----------

test('keys work by position on any layout, and Escape is never used', async () => {
  const { keyAction, keyLabel, panKeys, setLayout, loadLayout } = await import('../js/keys.js');
  // QWERTY.
  assert.deepEqual(keyAction({ code: 'KeyW', key: 'w' }), { action: 'panUp' });
  assert.deepEqual(keyAction({ code: 'Digit1', key: '1' }), { action: 'digit', digit: '1' });
  assert.deepEqual(keyAction({ code: 'KeyR', key: 'r' }), { action: 'research' });
  // AZERTY: the physical W key types "z" and pans up; the number row types
  // symbols without Shift but still builds; Q (types "a") zooms out.
  assert.deepEqual(keyAction({ code: 'KeyW', key: 'z' }), { action: 'panUp' });
  assert.deepEqual(keyAction({ code: 'KeyA', key: 'q' }), { action: 'panLeft' });
  assert.deepEqual(keyAction({ code: 'KeyQ', key: 'a' }), { action: 'zoomOut' });
  assert.deepEqual(keyAction({ code: 'Digit1', key: '&' }), { action: 'digit', digit: '1' });
  assert.deepEqual(keyAction({ code: 'Numpad7', key: '7' }), { action: 'digit', digit: '7' });
  assert.deepEqual(keyAction({ code: 'BracketLeft', key: '^' }), { action: 'ratioDown' });
  // Escape does nothing; Backspace or X cancel.
  assert.equal(keyAction({ code: 'Escape', key: 'Escape' }), null);
  assert.deepEqual(keyAction({ code: 'Backspace', key: 'Backspace' }), { action: 'cancel' });
  assert.deepEqual(keyAction({ code: 'KeyX', key: 'x' }), { action: 'cancel' });
  // Hints in the player's layout.
  setLayout(null);
  assert.equal(panKeys(), 'WASD');
  setLayout(new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyQ', 'a']]));
  assert.equal(panKeys(), 'ZQSD');
  assert.equal(keyLabel('KeyQ'), 'A');
  assert.equal(keyLabel('KeyE'), 'E', 'missing keys fall back');
  // Browsers without the Keyboard API just keep the defaults.
  assert.equal(await loadLayout({}), null);
  assert.equal(panKeys(), 'WASD');
  setLayout(null);
});

// ---------- Mobile layout guards ----------

test('phones: the map canvas never collapses, the map always covers the window, and zoom stays on the pixel grid', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  // iOS Safari before 14.1 ignores the inset shorthand: it left the map blank.
  assert.doesNotMatch(css, /\binset:\s/);
  const { MapRenderer } = await import('../js/render.js');
  const canvas = { width: 300, height: 150, getContext: () => ({}) };
  const r = new MapRenderer(canvas);
  r.resize(0, 0, 2);
  assert.deepEqual([canvas.width, canvas.height], [300, 150], 'a zero-size layout is ignored');
  assert.ok(!r.cssW, 'still waiting for a real size');
  r.resize(907, 510, 1, { top: 60, right: 0, bottom: 70, left: 180 });
  r.W = 1200; r.H = 900;
  // No backdrop: whatever the camera asks for, the map covers the viewport.
  for (const cam of [{ zoom: 0.1, cx: 0, cy: 0 }, { zoom: 4, cx: -50, cy: 2999 }, { zoom: 8, cx: 1200, cy: 0 }]) {
    r.clampCam(cam);
    const vw = 907 / cam.zoom, vh = 510 / cam.zoom;
    assert.ok(cam.zoom >= r.minZoom() - 1e-9);
    assert.ok(cam.cx - vw / 2 >= -1e-9 && cam.cx + vw / 2 <= 1200 + 1e-9, 'covers horizontally');
    assert.ok(cam.cy - vh / 2 >= -1e-9 && cam.cy + vh / 2 <= 900 + 1e-9, 'covers vertically');
  }
  // One pixel scale: close zooms settle on even device px per tile (2 per texel).
  for (const z of [2.3, 3.1, 4.9, 6.2, 7.7]) assert.equal(r.snapZoom(z) % 2, 0, `zoom ${z}`);
  assert.equal(r.snapZoom(3.2), 4);
});
