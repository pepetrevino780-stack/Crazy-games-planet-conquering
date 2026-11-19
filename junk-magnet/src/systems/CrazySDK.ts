/**
 * CrazyGames SDK v3 wrapper. Loads the SDK script on demand and no-ops when the game
 * runs anywhere else (local dev, other hosts, adblock).
 */
interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}
interface SdkLike {
  environment: 'local' | 'crazygames' | 'disabled';
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (listener: (settings: { muteAudio?: boolean }) => void) => void;
  };
  ad: { requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): void };
  data?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
const MIDGAME_GAP_MS = 180_000;

let sdk: SdkLike | null = null;
/** Dev only: ?fakeads simulates ads so the rewarded flows can be tested locally. */
const fakeAds = import.meta.env.DEV && new URLSearchParams(location.search).has('fakeads');
let inGameplay = false;
let lastMidgame = 0;
let adMuteListener: (muted: boolean) => void = () => {};
let settingsMuteListener: (muted: boolean) => void = () => {};

function loadScript(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const w = window as unknown as { CrazyGames?: { SDK?: SdkLike } };
    if (w.CrazyGames?.SDK) return resolve(true);
    const script = document.createElement('script');
    const timer = window.setTimeout(() => resolve(false), timeoutMs);
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

function call(fn: (s: SdkLike) => void): void {
  if (!sdk) return;
  try {
    fn(sdk);
  } catch {
    /* the SDK must never break the game */
  }
}

export const CrazySDK = {
  async init(): Promise<void> {
    // Only talk to CrazyGames when we are actually embedded there (or ?cgsdk for testing).
    const params = new URLSearchParams(location.search);
    const embedded = window.top !== window.self || params.has('cgsdk');
    if (!embedded) return;
    if (!(await loadScript(4000))) return;
    const candidate = (window as unknown as { CrazyGames?: { SDK?: SdkLike } }).CrazyGames?.SDK;
    if (!candidate) return;
    try {
      await Promise.race([candidate.init(), new Promise((_, reject) => setTimeout(reject, 4000))]);
      if (candidate.environment === 'disabled') return;
      sdk = candidate;
      call((s) => {
        if (s.game.settings?.muteAudio) settingsMuteListener(true);
        s.game.addSettingsChangeListener?.((settings) => settingsMuteListener(!!settings.muteAudio));
      });
    } catch {
      sdk = null;
    }
  },

  get active(): boolean {
    return sdk !== null;
  },

  /** Rewarded buttons only show when an ad can actually play (never with an ad blocker). */
  get adsAvailable(): boolean {
    return sdk !== null || fakeAds;
  },

  onAdMute(listener: (muted: boolean) => void): void {
    adMuteListener = listener;
  },

  onSettingsMute(listener: (muted: boolean) => void): void {
    settingsMuteListener = listener;
  },

  loadingStart(): void {
    call((s) => s.game.loadingStart());
  },
  loadingStop(): void {
    call((s) => s.game.loadingStop());
  },
  gameplayStart(): void {
    if (inGameplay) return;
    inGameplay = true;
    call((s) => s.game.gameplayStart());
  },
  gameplayStop(): void {
    if (!inGameplay) return;
    inGameplay = false;
    call((s) => s.game.gameplayStop());
  },
  happytime(): void {
    call((s) => s.game.happytime());
  },

  /** Midgame ad, only from the results screen and never more than once every 3 minutes. */
  midgame(done: () => void): void {
    const now = Date.now();
    if (!sdk || now - lastMidgame < MIDGAME_GAP_MS) return done();
    lastMidgame = now;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      adMuteListener(false);
      done();
    };
    try {
      sdk.ad.requestAd('midgame', { adStarted: () => adMuteListener(true), adFinished: finish, adError: finish });
    } catch {
      finish();
    }
  },

  /** Rewarded ad: onReward runs only if the ad completed. done always runs once. */
  rewarded(onReward: () => void, done: () => void): void {
    // A rewarded ad also counts toward the midgame cap, so a revive is never followed by a midgame ad.
    lastMidgame = Date.now();
    if (!sdk && fakeAds) {
      adMuteListener(true);
      window.setTimeout(() => {
        adMuteListener(false);
        onReward();
        done();
      }, 600);
      return;
    }
    if (!sdk) return done();
    let finished = false;
    const end = (rewarded: boolean) => {
      if (finished) return;
      finished = true;
      adMuteListener(false);
      if (rewarded) onReward();
      done();
    };
    try {
      sdk.ad.requestAd('rewarded', {
        adStarted: () => adMuteListener(true),
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch {
      end(false);
    }
  },

  /** Key-value storage: the CrazyGames data module when embedded, else localStorage. */
  storage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } | null {
    if (sdk?.data) return sdk.data;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  },
};
