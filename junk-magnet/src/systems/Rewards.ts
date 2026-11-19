import { todayKey } from '../rng';
import { Meta } from './MetaSave';

/** Rewarded-ad amounts shrink with each claim on the same day (100 → 50 → 25). */
const SCRAP_AD_STEPS = [100, 50, 25];

function today(): typeof Meta.data.rewards {
  const r = Meta.data.rewards;
  const key = todayKey();
  if (r.day !== key) {
    r.day = key;
    r.freeChest = false;
    r.bonusChest = false;
    r.scrapAds = 0;
  }
  return r;
}

export const Rewards = {
  freeChestReady(): boolean {
    return !today().freeChest;
  },
  bonusChestReady(): boolean {
    const r = today();
    return r.freeChest && !r.bonusChest;
  },
  claimFreeChest(): void {
    today().freeChest = true;
    Meta.save();
  },
  claimBonusChest(): void {
    today().bonusChest = true;
    Meta.save();
  },
  /** Next "watch an ad for scrap" amount, or 0 when today's are used up. */
  nextScrapAd(): number {
    return SCRAP_AD_STEPS[today().scrapAds] ?? 0;
  },
  claimScrapAd(): number {
    const r = today();
    const amount = SCRAP_AD_STEPS[r.scrapAds] ?? 0;
    r.scrapAds++;
    Meta.data.coins += amount;
    Meta.save();
    return amount;
  },
  /** Daily chest scrap: the very first one is generous. */
  rollDailyScrap(): number {
    if (!Meta.data.rewards.firstRunChest) {
      Meta.data.rewards.firstRunChest = true;
      return 120;
    }
    return [40, 60, 60, 80, 80, 100, 150][Math.floor(Math.random() * 7)];
  },
};
