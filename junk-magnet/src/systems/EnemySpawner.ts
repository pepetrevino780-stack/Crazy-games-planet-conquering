import Phaser from 'phaser';
import { ARENA, CAPS, DEPTH } from '../config';
import enemyData from '../data/enemies.json';
import type { Rng } from '../rng';
import type { Belt, JunkSystem, Repeller } from './JunkSystem';
import type { Juice } from './Juice';
import type { Player } from './Player';
import { Pool } from './Pool';
import { TS } from './Textures';

export type EnemyKind =
  | 'tin'
  | 'sprinter'
  | 'spitter'
  | 'shield'
  | 'antimag'
  | 'thief'
  | 'splitter'
  | 'splitling'
  | 'burrower'
  | 'magnetbot'
  | 'bomber'
  | 'repair'
  | 'crusher'
  | 'tyre'
  | 'press'
  | 'mine'
  | 'boss';

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
  noElite?: boolean;
  map?: string;
  armor?: number;
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
  fleeSpeed?: number;
  carryMax?: number;
  splitInto?: string;
  splitCount?: number;
  tunnelTime?: number;
  surfaceTime?: number;
  emergeRadius?: number;
  pullEvery?: number;
  pullCount?: number;
  fuseRange?: number;
  fuse?: number;
  blastRadius?: number;
  blastDamage?: number;
  healRadius?: number;
  healRate?: number;
  stompRadius?: number;
  stompEvery?: number;
  bounces?: number;
  slamRadius?: number;
  slamEvery?: number;
  pullRadius?: number;
  pullStrength?: number;
  chargeSpeed?: number;
  chargeTime?: number;
  telegraph?: number;
  walkTime?: number;
  recover?: number;
  compactRadius?: number;
  compactEvery?: number;
  junkKnock?: number;
  dmg?: number;
  chargeDamage?: number;
  armorAfterSlam?: number;
  stompDamage?: number;
  bulletDmg?: number;
}

export interface Phase {
  name: string;
  at: number;
  speed: number;
  damage: number;
  min: number;
  max: number;
  chaseRange?: number;
  lunge?: boolean;
  flank: number;
  leadShots?: boolean;
  ripChance: number;
  fireRate: number;
  aheadSpawn: number;
  bomberRush?: number;
  noCalm?: boolean;
  weights: Record<string, number>;
}

export const PHASES = enemyData.phases as unknown as Phase[];
export const PHASE_WARNING = enemyData.phaseWarning;

interface Squad {
  id: string;
  unlockAt: number;
  weight: number;
  cost: number;
  members: Record<string, number>;
}

export const ENEMY_DEFS = enemyData.types as unknown as Record<EnemyKind, EnemyDef>;
const KINDS = Object.keys(ENEMY_DEFS) as EnemyKind[];
const SQUADS = enemyData.squads as unknown as Squad[];
const WAVES = enemyData.waves;
const INTRO = enemyData.intro;
export const CONTACT_TIME = enemyData.contactTime;

export const BOSS_WALK = 0;
export const BOSS_TELEGRAPH = 1;
export const BOSS_CHARGE = 2;
export const BOSS_RECOVER = 3;
export const BOSS_SLAM_TELEGRAPH = 4;
export const BOSS_ENTER = 5;

/** Generic modes for the newer robots (walk → telegraph → act). */
export const MODE_MOVE = 0;
export const MODE_TELEGRAPH = 1;
export const MODE_ACT = 2;
/** Crusher charge: aim (red line), then rush. */
export const CRUSHER_AIM = 6;
export const CRUSHER_CHARGE = 7;

export interface Enemy {
  active: boolean;
  kind: EnemyKind;
  def: EnemyDef;
  sprite: Phaser.GameObjects.Image;
  extra: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
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
  /** Underground (Burrower): can't be hit and can't hit. */
  hidden: boolean;
  stun: number;
  elite: boolean;
  xp: number;
  scrap: number;
  carried: number;
  armor: number;
  fuse: number;
  tx: number;
  ty: number;
  bounces: number;
  healing: boolean;
  /** Crusher: immune to junk contact for a few seconds after each slam. */
  junkImmune: number;
  /** Which side this robot flanks from (−1 or 1). */
  flankSide: number;
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
  junk: JunkSystem;
  player: Player;
  mapId: string;
  spawnRng: Rng;
  spawnDistance(): number;
  onEnemyKilled(e: Enemy): void;
  onBossWarning(): void;
  onBossSpawned(e: Enemy): void;
  onBossSlam(e: Enemy): void;
  onBossTelegraph(e: Enemy): void;
  onBossWallHit(e: Enemy): void;
  onMinibossWarning(): void;
  onMinibossSpawned(e: Enemy): void;
  onCrusherStomp(e: Enemy): void;
  onBurrowerEmerge(e: Enemy): void;
  onPressSlam(e: Enemy): void;
  onMagnetPull(e: Enemy, pieces: number): void;
  onThiefEscaped(e: Enemy): void;
  queueExplosion(x: number, y: number, r: number, damage: number, hurtsPlayer: boolean): void;
  onSpitterFire(): void;
  onPhaseChange(index: number): void;
}

export class EnemySpawner {
  readonly pool: Pool<Enemy>;
  readonly bullets: Pool<Bullet>;
  activeCount = 0;
  wave = 0;
  boss: Enemy | null = null;
  crusher: Enemy | null = null;
  bossSpawned = false;
  minibossSpawned = false;
  private time = 0;
  phaseIndex = 0;
  private fillTimer = 0;
  private bossWarned = false;
  private minibossWarned = false;
  private credit = 0;
  private rate = 0;
  private next: { kind?: EnemyKind; squad?: Squad; cost: number } | null = null;
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
      glow: scene.add.image(0, 0, 'elite-glow').setDepth(DEPTH.enemy - 0.5).setVisible(false),
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
      hidden: false,
      stun: 0,
      elite: false,
      xp: 1,
      scrap: 1,
      carried: 0,
      armor: 1,
      fuse: 0,
      tx: 0,
      ty: 0,
      bounces: 0,
      healing: false,
      junkImmune: 0,
      flankSide: 1,
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

  get phase(): Phase {
    return PHASES[this.phaseIndex];
  }

  get hpMult(): number {
    return 1 + WAVES.hpPerWave * this.wave;
  }

  /** The boss or mini-boss currently on the field (for the HUD bar). */
  get bigOne(): Enemy | null {
    if (this.boss?.active) return this.boss;
    if (this.crusher?.active) return this.crusher;
    return null;
  }

  spawn(kind: EnemyKind, x: number, y: number, speedScale = 1): Enemy | null {
    const e = this.pool.obtain();
    if (!e) return null;
    const def = ENEMY_DEFS[kind];
    const r = def.radius;
    const big = kind === 'boss' || kind === 'crusher';
    e.kind = kind;
    e.def = def;
    e.x = Phaser.Math.Clamp(x, ARENA.margin + r, ARENA.width - ARENA.margin - r);
    e.y = Phaser.Math.Clamp(y, ARENA.margin + r, ARENA.height - ARENA.margin - r);
    // Glowing elites after 4:00: more HP, faster, more scrap.
    const eliteChance = WAVES.eliteChance + WAVES.eliteChancePerWave * Math.max(0, this.wave - 8);
    e.elite = !def.noElite && !big && this.time >= WAVES.eliteFrom && this.host.spawnRng.next() < eliteChance;
    const hp = big ? def.hp : def.hp * this.hpMult;
    e.maxHp = e.hp = hp * (e.elite ? WAVES.eliteHp : 1);
    const speedMult = 1;
    e.speed = def.speed * speedScale * speedMult * (e.elite ? WAVES.eliteSpeed : 1) * (0.9 + Math.random() * 0.2);
    e.radius = r * (e.elite ? 1.15 : 1);
    e.xp = def.xp * (e.elite ? WAVES.eliteXp : 1);
    e.scrap = def.scrap * (e.elite ? WAVES.eliteScrap : 1);
    e.armor = def.armor ?? 1;
    e.kx = e.ky = 0;
    e.flash = 0;
    e.facing = Math.random() * Math.PI * 2;
    e.touch = 0;
    e.fireTimer = (def.fireInterval ?? def.pullEvery ?? def.stompEvery ?? def.slamEvery ?? 2) * (0.5 + Math.random() * 0.5);
    e.windup = 0;
    e.burnDps = 0;
    e.burnTimer = 0;
    e.dmgAcc = 0;
    e.numCd = 0;
    e.hurtCd = 0;
    e.auraOff = 0;
    e.harmless = false;
    e.hidden = kind === 'burrower';
    e.stun = 0;
    e.carried = 0;
    e.fuse = 0;
    e.bounces = 0;
    e.healing = false;
    e.junkImmune = 0;
    e.flankSide = Math.random() < 0.5 ? -1 : 1;
    e.seed = Math.random() * 100;
    e.age = 0;
    e.mode = kind === 'boss' || kind === 'crusher' ? BOSS_ENTER : MODE_MOVE;
    e.modeTimer = kind === 'boss' || kind === 'crusher' ? 2 : kind === 'burrower' ? (def.tunnelTime ?? 3.5) : 0;
    e.cycle = 0;
    e.sprite
      .setTexture(e.hidden ? 'mound' : def.texture)
      .clearTint()
      .setPosition(e.x, e.y)
      .setScale(0)
      .setAlpha(1)
      .setRotation(0)
      .setVisible(true);
    e.sprite.setDepth(big ? DEPTH.enemy + 2 : e.hidden ? DEPTH.loose - 1 : DEPTH.enemy);
    if (kind === 'tyre') {
      // Rolls straight at where you are now, bouncing off walls.
      const p = this.host.player;
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.cdx = Math.cos(a);
      e.cdy = Math.sin(a);
    }
    if (kind === 'shield') {
      e.extra.setTexture('shield-plate').setOrigin(0.5, 1.25).setScale(TS * (def.radius / 17)).setDepth(DEPTH.enemy + 1).setAlpha(1).setVisible(true);
    } else if (kind === 'antimag') {
      e.extra.setTexture('aura').setOrigin(0.5).setScale((def.auraRadius ?? 115) / 115).setDepth(DEPTH.aura).setAlpha(1).setVisible(true);
    } else if (kind === 'spitter') {
      e.extra.setTexture('barrel').setOrigin(0.15, 0.5).setScale(TS).setDepth(DEPTH.enemy + 1).setAlpha(1).setVisible(true);
    } else {
      e.extra.setVisible(false);
    }
    e.glow.setVisible(e.elite).setScale((e.radius / 20) * 0.5).setPosition(e.x, e.y);
    this.activeCount++;
    return e;
  }

  /** Returns true if the hit killed the enemy. */
  damage(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number): boolean {
    if (!e.active || e.hidden) return false;
    e.hp -= amount * e.armor;
    if (knockback > 0) {
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const heavy = e.kind === 'boss' || e.kind === 'crusher' || e.kind === 'tyre';
      const k = heavy ? knockback * 0.04 : knockback;
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

  /** `silent`: removed without counting as a kill (escaped thief, a mine or bomber blowing itself up). */
  kill(e: Enemy, silent = false): void {
    if (!e.active) return;
    this.activeCount--;
    e.sprite.setVisible(false);
    e.extra.setVisible(false);
    e.glow.setVisible(false);
    this.pool.release(e);
    if (e === this.boss) this.boss = null;
    if (e === this.crusher) this.crusher = null;
    const d = e.def;
    if (e.kind === 'bomber' || e.kind === 'mine') {
      this.host.queueExplosion(e.x, e.y, d.blastRadius ?? 100, (d.blastDamage ?? 30) * this.hpMult, true);
    }
    if (!silent) this.host.onEnemyKilled(e);
    if (!silent && d.splitInto) {
      for (let i = 0; i < (d.splitCount ?? 3); i++) {
        const a = (i / (d.splitCount ?? 3)) * Math.PI * 2 + e.seed;
        const s = this.spawn(d.splitInto as EnemyKind, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
        if (s) {
          s.kx = Math.cos(a) * 260;
          s.ky = Math.sin(a) * 260;
        }
      }
    }
  }

  /** Clear bullets (used when the run ends). */
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

  /** Mostly all around you; later phases also spawn ahead of where you're moving (no safe corners). */
  private spawnAngle(): number {
    const rng = this.host.spawnRng;
    const pl = this.host.player;
    const moving = Math.hypot(pl.vx, pl.vy) > 60;
    if (moving && rng.next() < this.phase.aheadSpawn) return Math.atan2(pl.vy, pl.vx) + rng.range(-0.6, 0.6);
    return rng.range(0, Math.PI * 2);
  }

  private spawnGroup(kind: EnemyKind, px: number, py: number): void {
    const rng = this.host.spawnRng;
    const def = ENEMY_DEFS[kind];
    const p = this.spawnPoint(px, py, this.spawnAngle(), this.host.spawnDistance());
    for (let i = 0; i < def.group; i++) this.spawn(kind, p.x + rng.range(-40, 40), p.y + rng.range(-40, 40));
  }

  /** Mixed squads: e.g. Shield Bots with a Repair Drone behind them. */
  private spawnSquad(squad: Squad, px: number, py: number): void {
    const rng = this.host.spawnRng;
    const p = this.spawnPoint(px, py, this.spawnAngle(), this.host.spawnDistance());
    for (const [kind, count] of Object.entries(squad.members)) {
      for (let i = 0; i < count; i++) this.spawn(kind as EnemyKind, p.x + rng.range(-50, 50), p.y + rng.range(-50, 50));
    }
  }

  private pickNext(t: number): { kind?: EnemyKind; squad?: Squad; cost: number } {
    const rng = this.host.spawnRng;
    const map = this.host.mapId;
    const kinds = KINDS.filter((k) => {
      const d = ENEMY_DEFS[k];
      return d.unlockAt <= t && d.weight > 0 && (!d.map || d.map === map);
    });
    const squads = SQUADS.filter((s) => s.unlockAt <= t);
    const weight = (k: EnemyKind) => ENEMY_DEFS[k].weight * (this.phase.weights[k] ?? 1);
    const total = kinds.reduce((s, k) => s + weight(k), 0) + squads.reduce((s, q) => s + q.weight, 0);
    let roll = rng.next() * total;
    for (const k of kinds) {
      roll -= weight(k);
      if (roll < 0) return { kind: k, cost: ENEMY_DEFS[k].cost };
    }
    for (const q of squads) {
      roll -= q.weight;
      if (roll < 0) return { squad: q, cost: q.cost };
    }
    return { kind: 'tin', cost: 1 };
  }

  /** Scripted first 30 seconds, then waves every 30 s driven by a growing budget. */
  private runSpawns(dt: number, t: number, px: number, py: number): void {
    const rng = this.host.spawnRng;
    const dist = this.host.spawnDistance();
    // Aggression phases: Calm → Hunting → Swarming → Frenzy → Overdrive.
    let pi = 0;
    while (pi + 1 < PHASES.length && t >= PHASES[pi + 1].at) pi++;
    if (pi !== this.phaseIndex) {
      this.phaseIndex = pi;
      this.host.onPhaseChange(pi);
    }
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
          if (this.activeCount < this.phase.max) this.spawnGroup('tin', px, py);
        }
      }
      return;
    }

    // Mini-boss: a goal halfway to the Compactor.
    if (!this.minibossWarned && t >= WAVES.minibossAt - WAVES.minibossWarning) {
      this.minibossWarned = true;
      this.host.onMinibossWarning();
    }
    if (!this.minibossSpawned && t >= WAVES.minibossAt) {
      this.minibossSpawned = true;
      const p = this.spawnPoint(px, py, Math.PI / 2, dist + 40);
      const c = this.spawn('crusher', p.x, p.y);
      if (c) {
        this.crusher = c;
        this.host.onMinibossSpawned(c);
      }
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
    const calm = !this.phase.noCalm && t >= WAVES.calmEvery && t % WAVES.calmEvery < WAVES.calmLength;
    if (wave !== this.wave) {
      this.wave = wave;
      let budget = WAVES.baseBudget + WAVES.budgetPerWave * (wave - 1) + WAVES.budgetQuad * (wave - 1) ** 2;
      const calmHere = waveStart >= WAVES.calmEvery && waveStart % WAVES.calmEvery < WAVES.calmLength;
      // The wave that starts on a calm gets compressed into a surge.
      if (calmHere) budget *= WAVES.surgeMult;
      if (this.bossSpawned) budget *= WAVES.bossBudgetMult;
      const spendTime = WAVES.interval - (calmHere ? WAVES.calmLength : 0) - 2;
      this.credit += budget * WAVES.burstFraction * (calmHere ? 0 : 1);
      this.rate = (budget * (1 - (calmHere ? 0 : WAVES.burstFraction))) / spendTime;
    }
    if (calm) return;
    // Keep the screen busy: never fewer than the phase minimum, never more than its maximum.
    const ph = this.phase;
    this.fillTimer -= dt;
    if (this.activeCount < ph.min && this.fillTimer <= 0) {
      this.fillTimer = 0.3;
      const pick = this.pickNext(t);
      if (pick.kind) this.spawnGroup(pick.kind, px, py);
      else if (pick.squad) this.spawnSquad(pick.squad, px, py);
    }
    this.credit += this.rate * dt;
    while (this.activeCount < Math.min(ph.max, CAPS.enemies - 8)) {
      if (!this.next) this.next = this.pickNext(t);
      if (this.credit < this.next.cost) break;
      this.credit -= this.next.cost;
      if (this.next.squad) this.spawnSquad(this.next.squad, px, py);
      else if (this.next.kind) this.spawnGroup(this.next.kind, px, py);
      this.next = null;
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
    this.time = t;
    if (menu) this.runMenu(dt, px, py);
    else this.runSpawns(dt, t, px, py);

    const items = this.pool.items;
    const decay = Math.exp(-7 * dt);
    const enraged = !menu && t >= WAVES.enrageAt;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      e.age += dt;
      if (e.harmless && e.age > 8) e.harmless = false;
      if (e.numCd > 0) e.numCd -= dt;
      if (e.hurtCd > 0) e.hurtCd -= dt;
      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      let mx = nx * e.speed;
      let my = ny * e.speed;

      if (e.stun > 0) {
        e.stun -= dt;
        mx = my = 0;
      } else {
        const m = this.behave(e, dt, dist, nx, ny, menu, enraged) ?? this.chase(e, dt, dist, nx, ny, menu);
        if (m === null) continue; // removed this frame
        mx = m.mx;
        my = m.my;
      }
      if (e.junkImmune > 0) e.junkImmune -= dt;
      // Phase speed (and burning robots panic and run faster).
      if (!menu && e.kind !== 'boss' && e.kind !== 'crusher') {
        const sm = this.phase.speed * (e.burnTimer > 0 ? 1.25 : 1);
        mx *= sm;
        my *= sm;
      }

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
        // Fire spreads to robots it bumps into.
        if (Math.random() < dt * 3) this.spreadFire(e);
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
      if (!e.hidden) this.separate(e, i, items);
      this.draw(e);
    }

    this.updateBullets(dt);
  }

  /** Default movement: wander in the Calm phase, otherwise chase, flanking from the sides later on. */
  private chase(e: Enemy, dt: number, dist: number, nx: number, ny: number, menu: boolean): { mx: number; my: number } {
    const ph = this.phase;
    if (e.burnTimer > 0) {
      const w = Math.sin(e.age * 9 + e.seed) * 0.9;
      return { mx: (nx - ny * w) * e.speed, my: (ny + nx * w) * e.speed };
    }
    if (!menu && ph.chaseRange && dist > ph.chaseRange) {
      // Wandering, but drifting your way.
      const toward = Math.atan2(ny, nx);
      e.facing += (Math.sin(e.age * 0.9 + e.seed) * 1.6 + Phaser.Math.Angle.Wrap(toward - e.facing) * 0.6) * dt;
      return { mx: Math.cos(e.facing) * e.speed * 0.6, my: Math.sin(e.facing) * e.speed * 0.6 };
    }
    if (!menu && ph.flank > 0) {
      const k = ph.flank * 0.9 * e.flankSide * Phaser.Math.Clamp((dist - 90) / 260, 0, 1);
      const c = Math.cos(k);
      const sn = Math.sin(k);
      return { mx: (nx * c - ny * sn) * e.speed, my: (nx * sn + ny * c) * e.speed };
    }
    return { mx: nx * e.speed, my: ny * e.speed };
  }

  private spreadFire(e: Enemy): void {
    for (const o of this.pool.items) {
      if (!o.active || o === e || o.burnTimer > 0 || o.hidden) continue;
      const r = e.radius + o.radius + 22;
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < r * r) {
        o.burnDps = e.burnDps * 0.8;
        o.burnTimer = 1.6;
        return;
      }
    }
  }

  /** Keep bots from stacking into one blob; big ones shove everyone aside. */
  private separate(e: Enemy, i: number, items: Enemy[]): void {
    const heavyE = e.kind === 'boss' || e.kind === 'crusher';
    for (let j = i + 1; j < items.length; j++) {
      const o = items[j];
      if (!o.active || o.hidden) continue;
      const sx = o.x - e.x;
      const sy = o.y - e.y;
      const min = e.radius + o.radius;
      const d2 = sx * sx + sy * sy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = min - d;
      const ux = sx / d;
      const uy = sy / d;
      const heavyO = o.kind === 'boss' || o.kind === 'crusher';
      if (heavyE && !heavyO) {
        o.x += ux * push;
        o.y += uy * push;
      } else if (heavyO && !heavyE) {
        e.x -= ux * push;
        e.y -= uy * push;
      } else {
        e.x -= ux * push * 0.5;
        e.y -= uy * push * 0.5;
        o.x += ux * push * 0.5;
        o.y += uy * push * 0.5;
      }
    }
  }

  private draw(e: Enemy): void {
    // Pop in, then waddle (squash and stretch).
    const appear = Math.min(1, e.age / 0.25);
    const pop = appear < 1 ? Phaser.Math.Easing.Back.Out(appear) : 1;
    const heavy = e.kind === 'boss' || e.kind === 'crusher';
    const bob = heavy ? 0.03 : e.kind === 'tyre' || e.kind === 'mine' ? 0 : 0.07;
    const wob = Math.sin(e.age * 11 + e.seed) * bob;
    let sx = 1 + wob;
    let sy = 1 - wob;
    const telegraphing =
      e.windup > 0 ||
      e.fuse > 0 ||
      (heavy && (e.mode === BOSS_TELEGRAPH || e.mode === BOSS_SLAM_TELEGRAPH)) ||
      ((e.kind === 'press' || e.kind === 'burrower' || e.kind === 'crusher') && e.mode === MODE_TELEGRAPH) ||
      (e.kind === 'crusher' && e.mode === CRUSHER_AIM);
    if (telegraphing) {
      const k = Math.sin(e.age * 40) * 0.08;
      sx += k;
      sy -= k;
      if (e.flash <= 0) e.sprite.setTint(Math.sin(e.age * 30) > 0 ? 0xffb0c8 : 0xffffff);
    } else if (e.stun > 0 && e.flash <= 0) {
      e.sprite.setTint(Math.sin(e.age * 25) > 0 ? 0x9ff6ff : 0xffffff);
    } else if (e.flash <= 0 && e.sprite.isTinted && e.burnTimer <= 0) {
      e.sprite.clearTint();
    }
    if (e.burnTimer > 0 && e.flash <= 0 && !telegraphing) e.sprite.setTint(0xffb27a);
    const scale = e.elite ? 1.15 : 1;
    e.sprite.setPosition(e.x, e.y).setScale(TS * pop * sx * scale, TS * pop * sy * scale);
    if (e.extra.visible) e.extra.setPosition(e.x, e.y);
    if (e.elite) {
      e.glow.setPosition(e.x, e.y).setAlpha(0.65 + Math.sin(e.age * 6) * 0.3);
    }
  }

  /** Per-kind behaviour. Returns the desired velocity, undefined to chase, or null if removed. */
  private behave(
    e: Enemy,
    dt: number,
    dist: number,
    nx: number,
    ny: number,
    menu: boolean,
    enraged: boolean,
  ): { mx: number; my: number } | undefined | null {
    const d = e.def;
    const host = this.host;
    switch (e.kind) {
      case 'sprinter':
        // From the Hunting phase, Sprinters lunge when they get close.
        if (!menu && this.phase.lunge) {
          if (e.modeTimer > 0) {
            e.modeTimer -= dt;
            return { mx: e.cdx * e.speed * 2.4, my: e.cdy * e.speed * 2.4 };
          }
          e.fireTimer -= dt;
          if (dist < 220 && e.fireTimer <= 0) {
            e.modeTimer = 0.35;
            e.fireTimer = 2.2;
            e.cdx = nx;
            e.cdy = ny;
          }
        }
      // falls through
      case 'splitling': {
        const w = Math.sin(e.age * 6 + e.seed) * 0.5;
        return { mx: (nx - ny * w) * e.speed, my: (ny + nx * w) * e.speed };
      }
      case 'shield': {
        // Turns slowly: circle around it to hit its unshielded side.
        const want = Math.atan2(ny, nx);
        const diff = Phaser.Math.Angle.Wrap(want - e.facing);
        const turn = (d.turnRate ?? 1.4) * dt;
        e.facing += Phaser.Math.Clamp(diff, -turn, turn);
        e.extra.setRotation(e.facing + Math.PI / 2);
        return { mx: Math.cos(e.facing) * e.speed, my: Math.sin(e.facing) * e.speed };
      }
      case 'antimag': {
        if (e.auraOff > 0) e.auraOff -= dt;
        e.extra.setAlpha(e.auraOff > 0 ? 0.15 : 0.85 + Math.sin(e.age * 5) * 0.15);
        e.extra.rotation += dt * 0.6;
        return undefined;
      }
      case 'spitter':
        return this.spitter(e, dt, dist, nx, ny, menu);
      case 'thief': {
        // Grab loose junk, then run off the screen with it.
        const carryMax = d.carryMax ?? 5;
        e.carried += host.junk.absorbNear(e.x, e.y, e.radius + 12, carryMax - e.carried);
        e.sprite.setTexture(e.carried > 0 ? 'bot-thief-full' : 'bot-thief');
        if (e.carried >= carryMax || (e.carried > 0 && e.age > 8)) {
          const flee = d.fleeSpeed ?? 170;
          if (dist > host.spawnDistance() * 1.15) {
            host.onThiefEscaped(e);
            this.kill(e, true);
            return null;
          }
          return { mx: -nx * flee, my: -ny * flee };
        }
        const target = host.junk.nearestLoose(e.x, e.y, 700);
        if (target) {
          const tx = target.x - e.x;
          const ty = target.y - e.y;
          const td = Math.hypot(tx, ty) || 1;
          return { mx: (tx / td) * e.speed, my: (ty / td) * e.speed };
        }
        // Nothing to steal yet: hover around the edge of your ball.
        const radial = dist > 240 ? 1 : dist < 180 ? -1 : 0;
        return { mx: (nx * radial - ny * 0.8) * e.speed, my: (ny * radial + nx * 0.8) * e.speed };
      }
      case 'burrower':
        return this.burrower(e, dt, dist, nx, ny);
      case 'magnetbot': {
        // Keeps its distance and rips pieces off your ball.
        const range = d.range ?? 260;
        e.carried += host.junk.absorbNear(e.x, e.y, e.radius + 14, 99);
        let mx = 0;
        let my = 0;
        if (dist > range + 30) (mx = nx * e.speed), (my = ny * e.speed);
        else if (dist < range - 60) (mx = -nx * e.speed), (my = -ny * e.speed);
        else (mx = -ny * e.speed * 0.5), (my = nx * e.speed * 0.5);
        if (e.modeTimer > 0) e.modeTimer -= dt;
        if (!menu && dist < range + 120) {
          e.fireTimer -= dt;
          if (e.fireTimer <= 0) {
            e.fireTimer = d.pullEvery ?? 3.2;
            e.modeTimer = 0.45;
            const n = host.junk.steal(d.pullCount ?? 3, e.x, e.y);
            host.onMagnetPull(e, n);
          }
        }
        return { mx, my };
      }
      case 'bomber': {
        // Walks in, lights its fuse, explodes. Pulse it away before it gets to you.
        if (e.fuse > 0) {
          e.fuse -= dt;
          if (e.fuse <= 0) {
            this.kill(e, true);
            return null;
          }
          return { mx: nx * e.speed * 0.3, my: ny * e.speed * 0.3 };
        }
        if (!menu && dist < (d.fuseRange ?? 95)) e.fuse = d.fuse ?? 0.8;
        const rush = menu ? 1 : (this.phase.bomberRush ?? 1);
        return rush > 1 ? { mx: nx * e.speed * rush, my: ny * e.speed * rush } : undefined;
      }
      case 'repair': {
        // Stays behind the nearest ally (away from you) and heals everyone around it.
        let anchor: Enemy | null = null;
        let best = 1e12;
        const healR = d.healRadius ?? 150;
        e.healing = false;
        for (const o of this.pool.items) {
          if (!o.active || o === e || o.kind === 'repair' || o.hidden) continue;
          const od = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
          if (od < best) {
            best = od;
            anchor = o;
          }
          if (od < healR * healR && o.hp < o.maxHp && o.kind !== 'boss') {
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (d.healRate ?? 0.12) * dt);
            e.healing = true;
          }
        }
        if (!anchor) return undefined;
        const ax = anchor.x - nx * 80 - e.x;
        const ay = anchor.y - ny * 80 - e.y;
        const ad = Math.hypot(ax, ay);
        if (ad < 10) return { mx: 0, my: 0 };
        return { mx: (ax / ad) * e.speed, my: (ay / ad) * e.speed };
      }
      case 'crusher':
        return this.crusherAI(e, dt, dist, nx, ny);
      case 'tyre': {
        e.sprite.rotation += (e.speed / e.radius) * dt;
        const r = e.radius + 2;
        if (e.x <= ARENA.margin + r || e.x >= ARENA.width - ARENA.margin - r) {
          e.cdx = e.x <= ARENA.margin + r ? Math.abs(e.cdx) : -Math.abs(e.cdx);
          e.bounces++;
        }
        if (e.y <= ARENA.margin + r || e.y >= ARENA.height - ARENA.margin - r) {
          e.cdy = e.y <= ARENA.margin + r ? Math.abs(e.cdy) : -Math.abs(e.cdy);
          e.bounces++;
        }
        if (e.bounces > (d.bounces ?? 3)) {
          this.kill(e, true);
          return null;
        }
        return { mx: e.cdx * e.speed, my: e.cdy * e.speed };
      }
      case 'press': {
        // Walks up, plants itself and stamps: junk inside the circle gets crushed into cubes.
        if (e.mode === MODE_TELEGRAPH) {
          e.modeTimer -= dt;
          if (e.modeTimer <= 0) {
            host.onPressSlam(e);
            e.mode = MODE_MOVE;
            e.fireTimer = d.slamEvery ?? 3;
          }
          return { mx: 0, my: 0 };
        }
        e.fireTimer -= dt;
        if (!menu && dist < 150 && e.fireTimer <= 0) {
          e.mode = MODE_TELEGRAPH;
          e.modeTimer = d.telegraph ?? 1;
          return { mx: 0, my: 0 };
        }
        return undefined;
      }
      case 'mine': {
        // Drifts in and drags you toward it; touching it sets it off.
        const pr = d.pullRadius ?? 280;
        if (!menu && dist < pr) {
          const pull = (d.pullStrength ?? 150) * (1 - dist / pr) * dt;
          host.player.x -= nx * pull;
          host.player.y -= ny * pull;
        }
        e.sprite.rotation += dt * 1.5;
        if (!menu && dist < e.radius + host.player.radius + 4) {
          this.kill(e, true);
          return null;
        }
        return undefined;
      }
      case 'boss':
        return this.updateBoss(e, dt, nx, ny, enraged);
      default:
        return undefined;
    }
  }

  private spitter(e: Enemy, dt: number, dist: number, nx: number, ny: number, menu: boolean): { mx: number; my: number } {
    const range = e.def.range ?? 300;
    const strafe = e.seed > 50 ? 1 : -1;
    let mx = nx * e.speed;
    let my = ny * e.speed;
    if (dist > range + 40) {
      /* approach */
    } else if (dist < range - 70) {
      mx = -mx;
      my = -my;
    } else {
      mx = -ny * strafe * e.speed * 0.7;
      my = nx * strafe * e.speed * 0.7;
    }
    e.facing = Math.atan2(ny, nx);
    e.extra.setRotation(e.facing);
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
          e.fireTimer = (e.def.fireInterval ?? 2.6) / this.phase.fireRate;
        }
      }
    }
    return { mx, my };
  }

  /** Tunnels toward you, marks a spot, pops up under it, then stays exposed for a while. */
  private burrower(e: Enemy, dt: number, dist: number, nx: number, ny: number): { mx: number; my: number } {
    const d = e.def;
    const p = this.host.player;
    e.modeTimer -= dt;
    if (e.mode === MODE_MOVE) {
      if (e.hidden && (dist < 40 || e.modeTimer <= 0)) {
        e.mode = MODE_TELEGRAPH;
        e.modeTimer = d.telegraph ?? 0.9;
        e.tx = p.x;
        e.ty = p.y;
        return { mx: 0, my: 0 };
      }
      if (!e.hidden) {
        // Exposed: slow chase, then dig back down.
        if (e.modeTimer <= 0) {
          e.hidden = true;
          e.modeTimer = d.tunnelTime ?? 3.5;
          e.sprite.setTexture('mound').setDepth(DEPTH.loose - 1);
          this.host.juice.puff(e.x, e.y, 0x6b5a48, 4);
        }
        return { mx: nx * 50, my: ny * 50 };
      }
      return { mx: nx * e.speed, my: ny * e.speed };
    }
    if (e.mode === MODE_TELEGRAPH) {
      // Slide under the marked spot while the warning circle flashes.
      e.x += (e.tx - e.x) * Math.min(1, dt * 10);
      e.y += (e.ty - e.y) * Math.min(1, dt * 10);
      if (e.modeTimer <= 0) {
        e.hidden = false;
        e.mode = MODE_MOVE;
        e.modeTimer = d.surfaceTime ?? 3.2;
        e.sprite.setTexture(d.texture).setDepth(DEPTH.enemy);
        this.host.onBurrowerEmerge(e);
      }
      return { mx: 0, my: 0 };
    }
    return { mx: 0, my: 0 };
  }

  /**
   * Crusher mini-boss: alternates a ground slam (knocks junk off, then junk can't hurt it for a
   * few seconds) and a charge along a red warning line.
   */
  private crusherAI(e: Enemy, dt: number, dist: number, nx: number, ny: number): { mx: number; my: number } {
    const d = e.def;
    e.modeTimer -= dt;
    switch (e.mode) {
      case BOSS_ENTER:
        if (e.modeTimer <= 0) (e.mode = MODE_MOVE), (e.fireTimer = 1);
        return { mx: nx * e.speed * 2, my: ny * e.speed * 2 };
      case MODE_TELEGRAPH:
        if (e.modeTimer <= 0) {
          this.host.onCrusherStomp(e);
          e.junkImmune = d.armorAfterSlam ?? 3.5;
          e.mode = MODE_ACT;
          e.modeTimer = 0.6;
        }
        return { mx: 0, my: 0 };
      case CRUSHER_AIM:
        if (e.modeTimer > (d.telegraph ?? 0.9) * 0.4) (e.cdx = nx), (e.cdy = ny);
        if (e.modeTimer <= 0) (e.mode = CRUSHER_CHARGE), (e.modeTimer = d.chargeTime ?? 0.9);
        return { mx: 0, my: 0 };
      case CRUSHER_CHARGE: {
        if (e.modeTimer <= 0) (e.mode = MODE_ACT), (e.modeTimer = 0.7);
        const sp = d.chargeSpeed ?? 480;
        return { mx: e.cdx * sp, my: e.cdy * sp };
      }
      case MODE_ACT:
        if (e.modeTimer <= 0) (e.mode = MODE_MOVE), (e.fireTimer = d.stompEvery ?? 3.6);
        return { mx: 0, my: 0 };
      default:
        break;
    }
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      e.cycle++;
      if (e.cycle % 2 === 1 && dist < (d.stompRadius ?? 190) + 60) {
        e.mode = MODE_TELEGRAPH;
        e.modeTimer = d.telegraph ?? 0.9;
      } else {
        e.mode = CRUSHER_AIM;
        e.modeTimer = d.telegraph ?? 0.9;
        e.cdx = nx;
        e.cdy = ny;
      }
      this.host.onBossTelegraph(e);
      return { mx: 0, my: 0 };
    }
    return { mx: nx * e.speed, my: ny * e.speed };
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
    const speed = d.bulletSpeed ?? 175;
    let base = Math.atan2(ny, nx);
    if (this.phase.leadShots) {
      // Aim where you're going to be.
      const p = this.host.player;
      const t = Math.hypot(p.x - e.x, p.y - e.y) / speed;
      base = Math.atan2(p.y + p.vy * t * 0.8 - e.y, p.x + p.vx * t * 0.8 - e.x);
    }
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
