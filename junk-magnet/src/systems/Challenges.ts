import challengeData from '../data/challenges.json';
import { Meta } from './MetaSave';

export interface ChallengeDef {
  id: string;
  text: string;
  /** kills: counts across runs. The others take the best single run. */
  type: 'kills' | 'noHeartTime' | 'junk' | 'crowd' | 'time' | 'level';
  kind?: string;
  target: number;
  reward: number;
}

export interface RunStats {
  kills: Record<string, number>;
  totalKills: number;
  heartLostAt: number;
  time: number;
  peakJunk: number;
  bestCrowd: number;
  level: number;
}

export interface ChallengeProgress {
  def: ChallengeDef;
  value: number;
  completed: boolean;
}

const LIST = challengeData.list as ChallengeDef[];

function state(): { progress: Record<string, number>; done: string[] } {
  return Meta.data.challenges;
}

/** The first few unfinished challenges, in list order. */
export function activeChallenges(): ChallengeProgress[] {
  const s = state();
  return LIST.filter((c) => !s.done.includes(c.id))
    .slice(0, challengeData.active)
    .map((def) => ({ def, value: Math.min(def.target, s.progress[def.id] ?? 0), completed: false }));
}

function runValue(def: ChallengeDef, run: RunStats): number {
  switch (def.type) {
    case 'kills':
      return def.kind === '*' ? run.totalKills : (run.kills[def.kind ?? ''] ?? 0);
    case 'noHeartTime':
      return run.heartLostAt < 0 ? run.time : run.heartLostAt;
    case 'junk':
      return run.peakJunk;
    case 'crowd':
      return run.bestCrowd;
    case 'time':
      return run.time;
    case 'level':
      return run.level;
  }
}

/** Apply a finished run to the active challenges. Completed ones pay their scrap right away. */
export function applyRun(run: RunStats): ChallengeProgress[] {
  const s = state();
  const results: ChallengeProgress[] = [];
  for (const c of activeChallenges()) {
    const def = c.def;
    const v = runValue(def, run);
    const before = s.progress[def.id] ?? 0;
    const after = def.type === 'kills' ? before + v : Math.max(before, v);
    s.progress[def.id] = after;
    const completed = after >= def.target;
    if (completed) {
      s.done.push(def.id);
      Meta.data.coins += def.reward;
    }
    results.push({ def, value: Math.min(def.target, after), completed });
  }
  return results;
}

export function formatProgress(c: ChallengeProgress): string {
  const t = c.def.type;
  const fmt = (v: number) => (t === 'noHeartTime' || t === 'time' ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` : String(Math.floor(v)));
  // Single-run goals show your best run, so they don't look like they add up across runs.
  const best = c.def.type === 'kills' ? '' : 'best ';
  return `${best}${fmt(c.value)}/${fmt(c.def.target)}`;
}
