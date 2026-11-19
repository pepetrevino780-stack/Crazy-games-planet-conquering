import upgradeData from '../data/upgrades.json';
import type { Rng } from '../rng';
import type { MagnetDef } from './Player';

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  rarity: string;
  max: number;
  requires?: string[];
  [key: string]: unknown;
}

export interface PlayerStats {
  speed: number;
  accel: number;
  magnetRadius: number;
  spin: number;
  pulseCooldown: number;
  pulseRange: number;
  maxHearts: number;
  massMult: number;
  damageMult: number;
  burnDps: number;
  burnTime: number;
  canRadius: number;
  canDamage: number;
  canCooldown: number;
  molten: boolean;
  moltenRadius: number;
  moltenDamage: number;
  moltenCooldown: number;
  polarity: boolean;
  counterRings: boolean;
  scrapShield: boolean;
  pulseDamageMult: number;
  stunTime: number;
  coinMult: number;
  critBonus: number;
  knockMult: number;
  tvMult: number;
  capBonus: number;
  fireRing: boolean;
  fireRingDps: number;
  fireRingTime: number;
}

const cards = upgradeData.cards as CardDef[];
const fallback = upgradeData.fallback as CardDef[];
const byId = new Map<string, CardDef>([...cards, ...fallback].map((c) => [c.id, c]));

export function cardById(id: string): CardDef {
  return byId.get(id)!;
}

export function xpForLevel(level: number): number {
  const { base, linear, quad } = upgradeData.xp;
  const n = level - 1;
  return Math.round(base + n * linear + n * n * quad);
}

/** Data-driven card pool: levels per card, pick-1-of-3 rolls, and derived player stats. */
export class UpgradeSystem {
  readonly levels: Record<string, number> = {};

  constructor(private readonly rng: Rng) {}

  level(id: string): number {
    return this.levels[id] ?? 0;
  }

  maxed(id: string): boolean {
    return this.level(id) >= cardById(id).max;
  }

  /** Three different cards. An unlocked evolution always takes the first slot. */
  roll(count = 3, rareOnly = false): CardDef[] {
    const evolutions = cards.filter(
      (c) => c.requires && !this.maxed(c.id) && c.requires.every((r) => this.maxed(r)),
    );
    let pool = cards.filter((c) => !c.requires && !this.maxed(c.id));
    // The Crusher's reward: rare cards only (falls back to the full pool if they're all taken).
    if (rareOnly && pool.some((c) => c.rarity !== 'common')) {
      const rares = pool.filter((c) => c.rarity !== 'common');
      if (rares.length >= count - evolutions.slice(0, 1).length) pool = rares;
    }
    const picked: CardDef[] = evolutions.slice(0, 1);
    const weights = upgradeData.rarityWeight as Record<string, number>;
    while (picked.length < count && pool.length > 0) {
      const total = pool.reduce((sum, c) => sum + (weights[c.rarity] ?? 5), 0);
      let roll = this.rng.next() * total;
      let index = 0;
      for (; index < pool.length - 1; index++) {
        roll -= weights[pool[index].rarity] ?? 5;
        if (roll < 0) break;
      }
      picked.push(pool.splice(index, 1)[0]);
    }
    for (const f of fallback) if (picked.length < count) picked.push(f);
    return picked;
  }

  /** Names of evolutions this card is part of and that aren't owned yet (for combo hints on cards). */
  comboHint(id: string): string | null {
    const evo = cards.find((c) => c.requires?.includes(id) && !this.maxed(c.id));
    if (!evo) return null;
    const partner = evo.requires!.find((r) => r !== id)!;
    return `+ ${cardById(partner).name} = ${evo.name}`;
  }

  take(id: string): void {
    this.levels[id] = this.level(id) + 1;
  }

  stats(def: MagnetDef): PlayerStats {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (id: string) => cardById(id) as unknown as Record<string, any>;
    const lv = (id: string) => this.level(id);
    const buzz = lv('buzzsaw') > 0;
    const molten = c('moltenCore');
    const cans = c('explosiveCans');
    const hot = c('hotScrap');
    return {
      speed: def.speed * Math.pow(1 - c('heavyMetal').slow, lv('heavyMetal')) * (1 + c('quickFeet').value * lv('quickFeet')),
      accel: def.accel,
      magnetRadius: def.magnetRadius * (1 + c('strongerField').value * lv('strongerField')) * (lv('megaMagnet') ? 2 : 1),
      spin:
        def.spin *
        (1 + c('spinCycle').value * lv('spinCycle')) *
        (lv('secondRing') ? 1 + c('secondRing').value : 1) *
        (buzz ? 1 + c('buzzsaw').spin : 1),
      pulseCooldown: def.pulseCooldown * Math.pow(1 - c('quickCharge').value, lv('quickCharge')),
      pulseRange: def.pulseRange * (1 + c('bigPulse').value * lv('bigPulse')),
      maxHearts: def.hearts + lv('spareHeart'),
      massMult: Math.pow(1 + c('heavyMetal').value, lv('heavyMetal')),
      damageMult: buzz ? 1 + c('buzzsaw').damage : 1,
      burnDps: lv('moltenCore') ? molten.burn : hot.values[lv('hotScrap')],
      burnTime: hot.duration,
      canRadius: cans.radius[lv('explosiveCans')],
      canDamage: cans.damage[lv('explosiveCans')],
      canCooldown: cans.cooldown,
      molten: lv('moltenCore') > 0,
      moltenRadius: molten.radius,
      moltenDamage: molten.damage,
      moltenCooldown: molten.cooldown,
      polarity: lv('polarityFlip') > 0,
      counterRings: lv('secondRing') > 0,
      scrapShield: lv('scrapShield') > 0,
      pulseDamageMult: 1 + c('shockwave').value * lv('shockwave'),
      stunTime: c('staticCharge').values[lv('staticCharge')],
      coinMult: 1 + c('scrapCollector').value * lv('scrapCollector'),
      critBonus: c('sharpEdges').value * lv('sharpEdges'),
      knockMult: 1 - c('reinforced').value * lv('reinforced'),
      tvMult: lv('luckyFind') ? c('luckyFind').value : 1,
      capBonus: c('junkHoarder').value * lv('junkHoarder') + (lv('megaMagnet') ? c('megaMagnet').value : 0),
      fireRing: lv('fireRing') > 0,
      fireRingDps: c('fireRing').burn,
      fireRingTime: c('fireRing').duration,
    };
  }
}
