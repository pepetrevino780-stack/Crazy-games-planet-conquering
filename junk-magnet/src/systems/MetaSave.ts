import { CrazySDK } from './CrazySDK';

export interface Settings {
  music: number;
  sfx: number;
  shake: boolean;
  lowFx: boolean;
}

export interface SaveData {
  version: 1;
  coins: number;
  magnets: string[];
  maps: string[];
  magnet: string;
  map: string;
  settings: Settings;
  best: { score: number; time: number; kills: number; junk: number; wins: number };
  runs: number;
  daily: { key: string; best: number; runs: number };
  challenges: { progress: Record<string, number>; done: string[] };
}

const KEY = 'junk-magnet-save-v1';

function defaults(): SaveData {
  return {
    version: 1,
    coins: 0,
    magnets: ['horseshoe'],
    maps: ['junkyard'],
    magnet: 'horseshoe',
    map: 'junkyard',
    settings: { music: 0.6, sfx: 0.8, shake: true, lowFx: false },
    best: { score: 0, time: 0, kills: 0, junk: 0, wins: 0 },
    runs: 0,
    daily: { key: '', best: 0, runs: 0 },
    challenges: { progress: {}, done: [] },
  };
}

/** Persistent meta progression and settings, behind one small wrapper. */
export const Meta = {
  data: defaults(),

  load(): void {
    const fresh = defaults();
    try {
      const raw = CrazySDK.storage()?.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SaveData>;
        this.data = {
          ...fresh,
          ...saved,
          settings: { ...fresh.settings, ...saved.settings },
          best: { ...fresh.best, ...saved.best },
          daily: { ...fresh.daily, ...saved.daily },
          challenges: { progress: { ...saved.challenges?.progress }, done: [...(saved.challenges?.done ?? [])] },
        };
        return;
      }
    } catch {
      /* corrupt or blocked storage: start fresh */
    }
    this.data = fresh;
  },

  save(): void {
    try {
      CrazySDK.storage()?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: progress stays for this session */
    }
  },
};
