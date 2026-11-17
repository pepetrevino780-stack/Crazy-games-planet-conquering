import Phaser from 'phaser';
import { ARENA, CAPS, DEPTH } from '../config';
import enemyData from '../data/enemies.json';
import type { Rng } from '../rng';
import type { Belt, Repeller } from './JunkSystem';
import type { Juice } from './Juice';
import { Pool } from './Pool';
import { TS } from './Textures';

export type EnemyKind = 'tin' | 'sprinter' | 'spitter' | 'shield' | 'antimag' | 'boss';

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  radius: number;
  xp: number;
  scrap: number;
  drops: number[];
  cost: number;
  unlockAt: number;
  weight: number;
  group: number;
  texture: string;
  elite?: boolean;
  range?: number;
  fireInterval?: number;
  bulletSpeed?: number;
  windup?: number;
  volleyFromWave?: number;
  volley?: number;
  volleySpread?: number;
  shieldArc?: number;
  turnRate?: number;
  auraRadius?: number;
  shortOut?: number;
  chargeSpeed?: number;
  chargeTime?: number;
  telegraph?: number;
  walkTime?: number;
  recover?: number;
  compactRadius?: number;
  compactEvery?: number;
  junkKnock?: number;
}

export const ENEMY_DEFS = enemyData.types as Record<EnemyKind, EnemyDef>;
const KINDS = Object.keys(ENEMY_DEFS) as EnemyKind[];
const WAVES = enemyData.waves;
const INTRO = enemyData.intro;
export const CONTACT_TIME = enemyData.contactTime;

export const BOSS_WALK = 0;
export const BOSS_TELEGRAPH = 1;
export const BOSS_CHARGE = 2;
export const BOSS_RECOVER = 3;
export const BOSS_SLAM_TELEGRAPH = 4;
export const BOSS_ENTER = 5;

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  def: EnemyDef;
  sprite: Phaser.GameObjects.Image;
  extra: Phaser.GameObjects.Image;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  kx: number;
  ky: number;
  flash: number;
  facing: number;
  touch: number;
  fireTimer: number;
  windup: number;
  burnDps: number;
  burnTimer: number;
  /** Damage numbers are batched per robot so the screen doesn't fill with digits. */
  dmgAcc: number;
  numCd: number;
  /** Short invulnerability between junk hits, so a huge ball can't shred a boss in one frame. */
  hurtCd: number;
  auraOff: number;
  harmless: boolean;
  seed: number;
  age: number;
  mode: number;
  modeTimer: number;
  cdx: number;
  cdy: number;
  cycle: number;
}

export interface Bullet {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface EnemyHost {
  juice: Juice;
  spawnRng: Rng;
  spawnDistance(): number;
  onEnemyKilled(e: Enemy): void;
  onBossWarning(): void;
  onBossSpawned(e: Enemy): void;
  onBossSlam(e: Enemy): void;
  onBossTelegraph(e: Enemy): void;
  onBossWallHit(e: Enemy): void;
  onSpitterFire(): void;
}

export class EnemySpawner {
  readonly pool: Pool<Enemy>;
  readonly bullets: Pool<Bullet>;
  activeCount = 0;
  wave = 0;
  boss: Enemy | null = null;
  bossSpawned = false;
  private bossWarned = false;
  private credit = 0;
  private rate = 0;
  private nextKind: EnemyKind | null = null;
  private introStep = 0;
  private trickle = 0;
  private menuTimer = 0;
  private readonly repellerPool: Repeller[] = Array.from({ length: CAPS.enemies }, () => ({ x: 0, y: 0, r: 0 }));

  constructor(
    scene: Phaser.Scene,
    private readonly host: EnemyHost,
  ) {
    this.pool = new Pool(CAPS.enemies, () => ({
      active: false,
      kind: 'tin',
      def: ENEMY_DEFS.tin,
      sprite: scene.add.image(0, 0, 'bot-tin').setDepth(DEPTH.enemy).setVisible(false),
      extra: scene.add.image(0, 0, 'shield-plate').setDepth(DEPTH.enemy + 1).setVisible(false),
      x: 0,
      y: 0,
      hp: 0,
      maxHp: 1,
      speed: 0,
      radius: 15,
      kx: 0,
      ky: 0,
      flash: 0,
      facing: 0,
      touch: 0,
      fireTimer: 0,
      windup: 0,
      burnDps: 0,
      burnTimer: 0,
      dmgAcc: 0,
      numCd: 0,
      hurtCd: 0,
      auraOff: 0,
      harmless: false,
      seed: 0,
      age: 0,
      mode: 0,
      modeTimer: 0,
      cdx: 0,
      cdy: 0,
      cycle: 0,
    }));
    this.bullets = new Pool(CAPS.bullets, () => ({
      active: false,
      img: scene.add.image(0, 0, 'bullet').setDepth(DEPTH.junk + 1).setScale(TS).setVisible(false),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
    }));
  }

  get hpMult(): number {
    return 1 + WAVES.hpPerWave * this.wave;
  }

  spawn(kind: EnemyKind, x: number, y: number, speedScale = 1): Enemy | null {
    const e = this.pool.obtain();
    if (!e) return null;
    const def = ENEMY_DEFS[kind];
    const r = def.radius;
    e.kind = kind;
    e.def = def;
    e.x = Phaser.Math.Clamp(x, ARENA.margin + r, ARENA.width - ARENA.margin - r);
    e.y = Phaser.Math.Clamp(y, ARENA.margin + r, ARENA.height - ARENA.margin - r);
    e.maxHp = e.hp = kind === 'boss' ? def.hp : def.hp * this.hpMult;
    const speedMult = kind === 'boss' ? 1 : Math.min(1.4, 1 + WAVES.speedPerWave * this.wave);
    e.speed = def.speed * speedScale * speedMult * (0.9 + Math.random() * 0.2);
    e.radius = r;
    e.kx = e.ky = 0;
    e.flash = 0;
    e.facing = Math.random() * Math.PI * 2;
    e.touch = 0;
    e.fireTimer = (def.fireInterval ?? 2) * (0.5 + Math.random() * 0.5);
    e.windup = 0;
    e.burnDps = 0;
    e.burnTimer = 0;
    e.dmgAcc = 0;
    e.numCd = 0;
    e.hurtCd = 0;
    e.auraOff = 0;
    e.harmless = false;
    e.seed = Math.random() * 100;
    e.age = 0;
    e.mode = kind === 'boss' ? BOSS_ENTER : 0;
    e.modeTimer = kind === 'boss' ? 2 : 0;
    e.cycle = 0;
    e.sprite.setTexture(def.texture).clearTint().setPosition(e.x, e.y).setScale(0).setAlpha(1).setRotation(0).setVisible(true);
    e.sprite.setDepth(kind === 'boss' ? DEPTH.enemy + 2 : DEPTH.enemy);
    if (kind === 'shield') {
      e.extra.setTexture('shield-plate').setOrigin(0.5, 1.25).setScale(TS * (def.radius / 17)).setDepth(DEPTH.enemy + 1).setAlpha(1).setVisible(true);
    } else if (kind === 'antimag') {
      e.extra.setTexture('aura').setOrigin(0.5).setScale((def.auraRadius ?? 115) / 115).setDepth(DEPTH.aura).setAlpha(1).setVisible(true);
    } else if (kind === 'spitter') {
      e.extra.setTexture('barrel').setOrigin(0.15, 0.5).setScale(TS).setDepth(DEPTH.enemy + 1).setAlpha(1).setVisible(true);
    } else {
      e.extra.setVisible(false);
    }
    this.activeCount++;
    return e;
  }

  /** Returns true if the hit killed the enemy. */
  damage(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number): boolean {
    if (!e.active) return false;
    e.hp -= amount;
    if (knockback > 0) {
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = e.kind === 'boss' ? knockback * 0.04 : knockback;
      e.kx = (dx / dist) * k;
      e.ky = (dy / dist) * k;
    }
    if (e.hp <= 0) {
      this.kill(e);
      return true;
    }
    if (amount >= 1) {
      e.flash = 0.05;
      e.sprite.setTintFill(0xffffff);
    }
    return false;
  }

  private kill(e: Enemy): void {
    this.activeCount--;
    e.sprite.setVisible(false);
    e.extra.setVisible(false);
    this.pool.release(e);
    if (e === this.boss) this.boss = null;
    this.host.onEnemyKilled(e);
  }

  /** Clear everything (used when the run ends). */
  freezeAll(): void {
    for (const b of this.bullets.items) {
      if (b.active) {
        b.img.setVisible(false);
        this.bullets.release(b);
      }
    }
  }

  private spawnPoint(px: number, py: number, angle: number, dist: number): { x: number; y: number } {
    // Prefer an angle that stays inside the arena so bots don't all pile on the wall.
    for (let i = 0; i < 6; i++) {
      const a = angle + i * 1.05;
      const x = px + Math.cos(a) * dist;
      const y = py + Math.sin(a) * dist;
      if (x > ARENA.margin && x < ARENA.width - ARENA.margin && y > ARENA.margin && y < ARENA.height - ARENA.margin) {
        return { x, y };
      }
    }
    return { x: px + Math.cos(angle) * dist, y: py + Math.sin(angle) * dist };
  }

  private spawnGroup(kind: EnemyKind, px: number, py: number): void {
    const rng = this.host.spawnRng;
    const def = ENEMY_DEFS[kind];
    const p = this.spawnPoint(px, py, rng.range(0, Math.PI * 2), this.host.spawnDistance());
    for (let i = 0; i < def.group; i++) {
      this.spawn(kind, p.x + rng.range(-40, 40), p.y + rng.range(-40, 40));
    }
  }

  private pickKind(t: number): EnemyKind {
    const rng = this.host.spawnRng;
    const options = KINDS.filter((k) => ENEMY_DEFS[k].unlockAt <= t && ENEMY_DEFS[k].weight > 0);
    const total = options.reduce((s, k) => s + ENEMY_DEFS[k].weight, 0);
    let roll = rng.next() * total;
    for (const k of options) {
      roll -= ENEMY_DEFS[k].weight;
      if (roll < 0) return k;
    }
    return 'tin';
  }

  /** Scripted first 30 seconds, then waves every 30 s driven by a growing budget. */
  private runSpawns(dt: number, t: number, px: number, py: number): void {
    const rng = this.host.spawnRng;
    const dist = this.host.spawnDistance();
    if (this.introStep === 0 && t >= INTRO.firstBotAt) {
      this.introStep = 1;
      const e = this.spawn('tin', px + dist * 0.62, py - 20, INTRO.firstBotSpeed);
      if (e) e.harmless = true;
    }
    if (this.introStep === 1 && t >= INTRO.packAt) {
      this.introStep = 2;
      const start = rng.range(0, Math.PI * 2);
      for (let i = 0; i < INTRO.packSize; i++) {
        const p = this.spawnPoint(px, py, start + (i * Math.PI * 2) / INTRO.packSize, dist * 0.85);
        this.spawn('tin', p.x, p.y, 0.85);
      }
    }
    if (this.introStep === 2 && t >= INTRO.clusterAt) {
      this.introStep = 3;
      const p = this.spawnPoint(px, py, rng.range(0, Math.PI * 2), dist * 0.9);
      for (let i = 0; i < INTRO.clusterSize; i++) this.spawn('tin', p.x + rng.range(-35, 35), p.y + rng.range(-35, 35));
    }
    if (t < WAVES.firstWaveAt) {
      if (t > INTRO.packAt + 4) {
        this.trickle += INTRO.trickle * dt;
        while (this.trickle >= 1) {
          this.trickle -= 1;
          this.spawnGroup('tin', px, py);
        }
      }
      return;
    }

    // Boss.
    if (!this.bossWarned && t >= WAVES.bossAt - WAVES.bossWarning) {
      this.bossWarned = true;
      this.host.onBossWarning();
    }
    if (!this.bossSpawned && t >= WAVES.bossAt) {
      this.bossSpawned = true;
      const p = this.spawnPoint(px, py, -Math.PI / 2, dist + 60);
      const boss = this.spawn('boss', p.x, p.y);
      if (boss) {
        this.boss = boss;
        this.host.onBossSpawned(boss);
      }
    }

    const wave = Math.floor((t - WAVES.firstWaveAt) / WAVES.interval) + 1;
    const waveStart = WAVES.firstWaveAt + (wave - 1) * WAVES.interval;
    const calm = t >= WAVES.calmEvery && t % WAVES.calmEvery < WAVES.calmLength;
    if (wave !== this.wave) {
      this.wave = wave;
      let budget = WAVES.baseBudget + WAVES.budgetPerWave * (wave - 1) + WAVES.budgetQuad * (wave - 1) ** 2;
      // The wave that starts on a calm gets compressed into a surge.
      if (waveStart >= WAVES.calmEvery && waveStart % WAVES.calmEvery < WAVES.calmLength) budget *= WAVES.surgeMult;
      if (this.bossSpawned) budget *= WAVES.bossBudgetMult;
      const calmHere = waveStart % WAVES.calmEvery < WAVES.calmLength && waveStart >= WAVES.calmEvery;
      const spendTime = WAVES.interval - (calmHere ? WAVES.calmLength : 0) - 2;
      this.credit += budget * WAVES.burstFraction * (calmHere ? 0 : 1);
      this.rate = (budget * (1 - (calmHere ? 0 : WAVES.burstFraction))) / spendTime;
    }
    if (calm) return;
    this.credit += this.rate * dt;
    while (this.activeCount < CAPS.enemies - 5) {
      if (!this.nextKind) this.nextKind = this.pickKind(t);
      const cost = ENEMY_DEFS[this.nextKind].cost;
      if (this.credit < cost) break;
      this.credit -= cost;
      this.spawnGroup(this.nextKind, px, py);
      this.nextKind = null;
    }
  }

  /** Attract mode behind the title: a handful of bots for the magnet to smash. */
  private runMenu(dt: number, px: number, py: number): void {
    this.menuTimer -= dt;
    if (this.menuTimer <= 0 && this.activeCount < 14) {
      this.menuTimer = 0.7;
      this.spawnGroup(Math.random() < 0.2 ? 'sprinter' : 'tin', px, py);
    }
  }

  update(dt: number, t: number, px: number, py: number, menu: boolean, belts: Belt[], beltSpeed: number): void {
    if (menu) this.runMenu(dt, px, py);
    else this.runSpawns(dt, t, px, py);

    const items = this.pool.items;
    const decay = Math.exp(-7 * dt);
    const enraged = !menu && t >= WAVES.enrageAt;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      e.age += dt;
      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      let mx = nx * e.speed;
      let my = ny * e.speed;

      switch (e.kind) {
        case 'sprinter': {
          const w = Math.sin(e.age * 6 + e.seed) * 0.5;
          mx = (nx - ny * w) * e.speed;
          my = (ny + nx * w) * e.speed;
          break;
        }
        case 'shield': {
          // Turns slowly: circle around it to hit its unshielded side.
          const want = Math.atan2(dy, dx);
          const diff = Phaser.Math.Angle.Wrap(want - e.facing);
          const turn = (e.def.turnRate ?? 1.4) * dt;
          e.facing += Phaser.Math.Clamp(diff, -turn, turn);
          mx = Math.cos(e.facing) * e.speed;
          my = Math.sin(e.facing) * e.speed;
          e.extra.setPosition(e.x, e.y).setRotation(e.facing + Math.PI / 2);
          break;
        }
        case 'antimag': {
          if (e.auraOff > 0) e.auraOff -= dt;
          e.extra.setPosition(e.x, e.y).setAlpha(e.auraOff > 0 ? 0.15 : 0.85 + Math.sin(e.age * 5) * 0.15);
          e.extra.rotation += dt * 0.6;
          break;
        }
        case 'spitter': {
          const range = e.def.range ?? 300;
          const strafe = e.seed > 50 ? 1 : -1;
          if (dist > range + 40) {
            /* approach */
          } else if (dist < range - 70) {
            mx = -mx;
            my = -my;
          } else {
            mx = -ny * strafe * e.speed * 0.7;
            my = nx * strafe * e.speed * 0.7;
          }
          e.facing = Math.atan2(dy, dx);
          e.extra.setPosition(e.x, e.y).setRotation(e.facing);
          if (!menu && dist < range + 200) {
            if (e.windup > 0) {
              e.windup -= dt;
              mx *= 0.2;
              my *= 0.2;
              if (e.windup <= 0) this.fire(e, nx, ny);
            } else {
              e.fireTimer -= dt;
              if (e.fireTimer <= 0) {
                e.windup = e.def.windup ?? 0.4;
                e.fireTimer = e.def.fireInterval ?? 2.6;
              }
            }
          }
          break;
        }
        case 'boss':
          ({ mx, my } = this.updateBoss(e, dt, nx, ny, enraged));
          break;
        default:
          break;
      }

      if (e.numCd > 0) e.numCd -= dt;
      if (e.hurtCd > 0) e.hurtCd -= dt;
      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        if (!this.host.juice.low && Math.random() < dt * 8) {
          this.host.juice.emit(e.x, e.y - e.radius * 0.5, 'p-puff', Math.random() < 0.5 ? 0xd9772b : 0xf2c14e, {
            speed: 40,
            angle: -Math.PI / 2,
            spread: 1,
            life: 0.4,
            scale: 0.7,
            endScale: 0.1,
          });
        }
        if (this.damage(e, e.burnDps * dt, e.x, e.y, 0)) continue;
      }

      for (const b of belts) {
        if (e.kind !== 'boss' && e.x > b.x && e.x < b.x + b.w && e.y > b.y && e.y < b.y + b.h) {
          e.x += b.dx * beltSpeed * dt;
          e.y += b.dy * beltSpeed * dt;
        }
      }

      e.x += (mx + e.kx) * dt;
      e.y += (my + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      const r = e.radius;
      e.x = Phaser.Math.Clamp(e.x, ARENA.margin + r, ARENA.width - ARENA.margin - r);
      e.y = Phaser.Math.Clamp(e.y, ARENA.margin + r, ARENA.height - ARENA.margin - r);

      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.sprite.clearTint();
      }
      // Keep bots from stacking into one blob; the boss shoves everyone aside.
      for (let j = i + 1; j < items.length; j++) {
        const o = items[j];
        if (!o.active) continue;
        const sx = o.x - e.x;
        const sy = o.y - e.y;
        const min = e.radius + o.radius;
        const d2 = sx * sx + sy * sy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = min - d;
        const ux = sx / d;
        const uy = sy / d;
        if (e.kind === 'boss') {
          o.x += ux * push;
          o.y += uy * push;
        } else if (o.kind === 'boss') {
          e.x -= ux * push;
          e.y -= uy * push;
        } else {
          e.x -= ux * push * 0.5;
          e.y -= uy * push * 0.5;
          o.x += ux * push * 0.5;
          o.y += uy * push * 0.5;
        }
      }

      // Pop in, then waddle (squash and stretch).
      const appear = Math.min(1, e.age / 0.25);
      const pop = appear < 1 ? Phaser.Math.Easing.Back.Out(appear) : 1;
      const bob = e.kind === 'boss' ? 0.03 : 0.07;
      const wob = Math.sin(e.age * 11 + e.seed) * bob;
      let sx = 1 + wob;
      let sy = 1 - wob;
      if (e.windup > 0 || (e.kind === 'boss' && (e.mode === BOSS_TELEGRAPH || e.mode === BOSS_SLAM_TELEGRAPH))) {
        const k = Math.sin(e.age * 40) * 0.08;
        sx += k;
        sy -= k;
        if (e.flash <= 0) e.sprite.setTint(Math.sin(e.age * 30) > 0 ? 0xffb0c8 : 0xffffff);
      } else if (e.flash <= 0 && e.sprite.isTinted && e.burnTimer <= 0) {
        e.sprite.clearTint();
      }
      if (e.burnTimer > 0 && e.flash <= 0) e.sprite.setTint(0xffb27a);
      e.sprite.setPosition(e.x, e.y).setScale(TS * pop * sx, TS * pop * sy);
      if (e.extra.visible) e.extra.setPosition(e.x, e.y);
    }

    this.updateBullets(dt);
  }

  private updateBoss(e: Enemy, dt: number, nx: number, ny: number, enraged: boolean): { mx: number; my: number } {
    const d = e.def;
    const pace = enraged ? 1.3 : 1;
    e.modeTimer -= dt * pace;
    let mx = 0;
    let my = 0;
    switch (e.mode) {
      case BOSS_ENTER:
        mx = nx * e.speed * 1.2;
        my = ny * e.speed * 1.2;
        if (e.modeTimer <= 0) (e.mode = BOSS_WALK), (e.modeTimer = d.walkTime ?? 2.4);
        break;
      case BOSS_WALK:
        mx = nx * e.speed * pace;
        my = ny * e.speed * pace;
        if (e.modeTimer <= 0) {
          e.cycle++;
          if (e.cycle % (d.compactEvery ?? 3) === 0) {
            e.mode = BOSS_SLAM_TELEGRAPH;
            e.modeTimer = 0.75;
          } else {
            e.mode = BOSS_TELEGRAPH;
            e.modeTimer = d.telegraph ?? 0.8;
            e.cdx = nx;
            e.cdy = ny;
          }
          this.host.onBossTelegraph(e);
        }
        break;
      case BOSS_TELEGRAPH:
        // Keep aiming during the first half of the telegraph, then lock in.
        if (e.modeTimer > (d.telegraph ?? 0.8) * 0.4) {
          e.cdx = nx;
          e.cdy = ny;
        }
        if (e.modeTimer <= 0) (e.mode = BOSS_CHARGE), (e.modeTimer = d.chargeTime ?? 1);
        break;
      case BOSS_CHARGE: {
        const sp = (d.chargeSpeed ?? 560) * pace;
        mx = e.cdx * sp;
        my = e.cdy * sp;
        const r = e.radius + 2;
        const hitWall =
          e.x <= ARENA.margin + r || e.x >= ARENA.width - ARENA.margin - r || e.y <= ARENA.margin + r || e.y >= ARENA.height - ARENA.margin - r;
        if (hitWall && e.modeTimer < (d.chargeTime ?? 1) - 0.1) {
          this.host.onBossWallHit(e);
          e.modeTimer = 0;
        }
        if (e.modeTimer <= 0) (e.mode = BOSS_RECOVER), (e.modeTimer = d.recover ?? 0.8);
        break;
      }
      case BOSS_SLAM_TELEGRAPH:
        mx = nx * e.speed * 0.4;
        my = ny * e.speed * 0.4;
        if (e.modeTimer <= 0) {
          this.host.onBossSlam(e);
          e.mode = BOSS_RECOVER;
          e.modeTimer = d.recover ?? 0.8;
        }
        break;
      default:
        if (e.modeTimer <= 0) (e.mode = BOSS_WALK), (e.modeTimer = d.walkTime ?? 2.4);
        break;
    }
    return { mx, my };
  }

  private fire(e: Enemy, nx: number, ny: number): void {
    const d = e.def;
    const count = this.wave >= (d.volleyFromWave ?? 99) ? (d.volley ?? 1) : 1;
    const base = Math.atan2(ny, nx);
    const speed = d.bulletSpeed ?? 175;
    for (let i = 0; i < count; i++) {
      const b = this.bullets.obtain();
      if (!b) return;
      const a = base + (i - (count - 1) / 2) * (d.volleySpread ?? 0.28);
      b.x = e.x + Math.cos(a) * (e.radius + 8);
      b.y = e.y + Math.sin(a) * (e.radius + 8);
      b.vx = Math.cos(a) * speed;
      b.vy = Math.sin(a) * speed;
      b.life = 4;
      b.img.setPosition(b.x, b.y).setVisible(true);
    }
    this.host.onSpitterFire();
  }

  removeBullet(b: Bullet): void {
    b.img.setVisible(false);
    this.bullets.release(b);
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets.items) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > ARENA.width || b.y > ARENA.height) {
        this.removeBullet(b);
        continue;
      }
      b.img.setPosition(b.x, b.y).setRotation(b.img.rotation + dt * 8);
    }
  }

  /** Active Anti-Mag auras, for the junk system. */
  repellers(out: Repeller[]): void {
    out.length = 0;
    let n = 0;
    for (const e of this.pool.items) {
      if (!e.active || e.kind !== 'antimag' || e.auraOff > 0) continue;
      const r = this.repellerPool[n++];
      r.x = e.x;
      r.y = e.y;
      r.r = e.def.auraRadius ?? 115;
      out.push(r);
    }
  }
}
