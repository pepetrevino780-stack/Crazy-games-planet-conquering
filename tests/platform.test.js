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
