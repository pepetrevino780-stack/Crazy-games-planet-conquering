import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initPlatform, platformActive, platformStorage, setAdHandlers, loadingStart, loadingStop,
  gameplayStart, gameplayStop, happytime, midgameAd, rewardedAd,
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
