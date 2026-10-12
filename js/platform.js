// Portal integration (CrazyGames HTML5 SDK v3).
//
// Everything here degrades to a no-op when the SDK is missing, blocked, or
// running outside CrazyGames (the SDK reports the "disabled" environment and
// its calls throw there). The game never waits on an ad that cannot play.

const AD_START_TIMEOUT = 4000;

let sdk = null;
let active = false;
let gameplayOn = false;
let adHandlers = { pause: () => {}, resume: () => {} };

function call(fn) {
  if (!active) return undefined;
  try {
    return fn(sdk);
  } catch (e) {
    console.warn('[platform]', e);
    return undefined;
  }
}

/**
 * Initialise the SDK if present. `win` is injectable for tests.
 * Resolves to the environment name: 'crazygames', 'local' or 'none'.
 */
export async function initPlatform(win = globalThis.window) {
  sdk = win?.CrazyGames?.SDK || null;
  active = false;
  gameplayOn = false;
  if (!sdk) return 'none';
  try {
    await sdk.init();
    const env = sdk.environment;
    active = env === 'crazygames' || env === 'local';
    return active ? env : 'none';
  } catch (e) {
    console.warn('[platform] SDK init failed', e);
    return 'none';
  }
}

export const platformActive = () => active;

// Ads pause the battle; the game provides how.
export function setAdHandlers(handlers) {
  adHandlers = { ...adHandlers, ...handlers };
}

// Save storage: the SDK Data module (same API as localStorage, synced to the
// player's CrazyGames account) on the portal; plain localStorage elsewhere.
export function platformStorage(win = globalThis.window) {
  if (active && sdk.data) return sdk.data;
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

export const loadingStart = () => call(s => s.game.loadingStart());
export const loadingStop = () => call(s => s.game.loadingStop());

export function gameplayStart() {
  if (gameplayOn) return;
  gameplayOn = true;
  call(s => s.game.gameplayStart());
}

export function gameplayStop() {
  if (!gameplayOn) return;
  gameplayOn = false;
  call(s => s.game.gameplayStop());
}

// A moment of celebration (planet conquered).
export const happytime = () => call(s => s.game.happytime());

function requestAd(type) {
  return new Promise(resolve => {
    if (!active || !sdk.ad) { resolve(false); return; }
    let started = false;
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      if (started) adHandlers.resume();
      resolve(ok);
    };
    // If no ad starts promptly (ignored request, slow network), carry on.
    setTimeout(() => { if (!started) finish(false); }, AD_START_TIMEOUT);
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => { started = true; adHandlers.pause(); },
        adFinished: () => finish(true),
        adError: () => finish(false),
      });
    } catch (e) {
      console.warn('[platform] ad request failed', e);
      finish(false);
    }
  });
}

// Ad break at a natural pause (between battles). The SDK itself enforces the
// minimum interval between midgame ads and ignores early requests.
export const midgameAd = () => requestAd('midgame');

// Rewarded ad: resolves true only when the player watched it to the end.
export const rewardedAd = () => requestAd('rewarded');
