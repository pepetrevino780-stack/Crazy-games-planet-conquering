import Phaser from 'phaser';
import { ARENA, CSS, DEPTH, PAL } from '../config';
import enemyData from '../data/enemies.json';
import achievementData from '../data/achievements.json';
const ACHIEVEMENTS = achievementData.list;
import magnetsData from '../data/magnets.json';
import mapsData from '../data/maps.json';
import { Rng, hashString, todayKey } from '../rng';
import { Audio } from '../systems/AudioManager';
import { Controls } from '../systems/Controls';
import { CrazySDK } from '../systems/CrazySDK';
import {
  BOSS_CHARGE,
  BOSS_SLAM_TELEGRAPH,
  BOSS_TELEGRAPH,
  CONTACT_TIME,
  isBig,
  RING,
  CRUSHER_AIM,
  CRUSHER_CHARGE,
  ENEMY_DEFS,
  PHASES,
  PHASE_WARNING,
  MODE_TELEGRAPH,
  EnemySpawner,
  type Enemy,
  type EnemyHost,
} from '../systems/EnemySpawner';
import { Juice } from '../systems/Juice';
import { Weapons } from '../systems/Weapons';
import { CAN_TYPE, JUNK, JunkSystem, type Belt, type JunkFrame, type Repeller } from '../systems/JunkSystem';
import { Meta } from '../systems/MetaSave';
import { applyRun, type ChallengeProgress } from '../systems/Challenges';
import { Player, type MagnetDef } from '../systems/Player';
import { TS, makeCrusherTextures, makeFloor } from '../systems/Textures';
import { UpgradeSystem, cardById, pathDef, xpForLevel, type CardDef, type PlayerStats } from '../systems/UpgradeSystem';

export interface RunConfig {
  mode: 'menu' | 'run';
  daily?: boolean;
  /** Open the Garage instead of the title (from the results screen). */
  garage?: boolean;
}

export interface RunResult {
  win: boolean;
  daily: boolean;
  time: number;
  kills: number;
  peakJunk: number;
  level: number;
  scrapKills: number;
  scrapOverflow: number;
  scrapJunk: number;
  scrapWin: number;
  coins: number;
  score: number;
  newBest: boolean;
  dailyBest: number;
  mapName: string;
  challenges: ChallengeProgress[];
  achievements: { id: string; title: string; desc: string }[];
  modeName: string;
}

interface MapDef {
  name: string;
  desc: string;
  price: number;
  floor: string;
  detail: string;
  props: string;
  looseFriction: number;
  accelMult: number;
  conveyors: Belt[];
  conveyorSpeed?: number;
  hazards?: Hazard[];
}

interface Hazard {
  type: 'crusher' | 'fence';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  every?: number;
  offset: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  on?: number;
  off?: number;
}

const HAZARD_DMG = (mapsData as unknown as { hazardDamage: Record<string, number> }).hazardDamage;

export const MAGNETS = magnetsData as Record<string, MagnetDef>;
export const MAPS = Object.fromEntries(
  Object.entries(mapsData).filter(([k]) => k !== 'hazardDamage'),
) as unknown as Record<string, MapDef>;
const WAVES = enemyData.waves;
const MAX_EXPLOSIONS_PER_FRAME = 6;
export const MODES = enemyData.modes as Record<string, { name: string; hp: number; dmg: number; speed: number; scrap: number }>;
export const DAILY_MODS = enemyData.dailyModifiers;
/** Hard unlocks after your first win, Nightmare after a win on Hard. */
export function modeUnlocked(mode: string): boolean {
  const wins = Meta.data.modeWins;
  if (mode === 'normal') return true;
  if (mode === 'hard') return Meta.data.best.wins > 0;
  return (wins.hard ?? 0) > 0;
}
const BLACK_HOLE = cardById('blackHolePulse') as unknown as { pull: number; duration: number; radius: number; damageMult: number };
const JUNK_POWER = JUNK.types.map((t) => (t as { power?: string }).power ?? '');

type State = 'menu' | 'intro' | 'playing' | 'levelup' | 'dying' | 'reviving' | 'won' | 'over';

export class GameScene extends Phaser.Scene implements EnemyHost {
  cfg: RunConfig = { mode: 'menu' };
  state: State = 'menu';
  runTime = 0;
  timeScale = 1;
  slowTarget = 1;
  hitStop = 0;
  stateTimer = 0;

  player!: Player;
  junk!: JunkSystem;
  enemies!: EnemySpawner;
  upgrades!: UpgradeSystem;
  juice!: Juice;
  weapons!: Weapons;
  stats!: PlayerStats;
  spawnRng!: Rng;
  lootRng!: Rng;
  magnetDef!: MagnetDef;
  mapDef!: MapDef;
  mapId = 'junkyard';

  xp = 0;
  level = 1;
  xpNeed = xpForLevel(1);
  pendingLevels = 0;
  kills = 0;
  scrapKills = 0;
  peakJunk = 0;
  pulseUsed = false;
  hitsTaken = 0;
  bestCrowd = 0;
  bossWarningAt = -1;
  /** HUD banner: text + the time it was raised. */
  bannerText = '';
  bannerAt = -1;
  /** The next card pick is a rare reward from the Crusher. */
  rareReward = false;
  readonly runKills: Record<string, number> = {};
  lowHpAt = -1;
  reviveUsed = false;
  private rescueGiven = false;
  private rescueTimer = 0;
  private savedJunk: number[] = [];
  healthTimer = 0;
  phaseLabel = 'CALM';
  phaseAt = -1;
  pickups: Phaser.GameObjects.Image[] = [];
  chests: Phaser.GameObjects.Image[] = [];
  chestsOpened = 0;
  modeId = 'normal';
  modifier = '';
  mods = { hp: 1, speed: 1, onlySprinters: false };
  pulses = 0;
  frenzies = 0;
  pathsDone = 0;
  fullHealthAt120 = false;
  private vortex: { x: number; y: number; t: number; dmg: number } | null = null;
  private killTimes: number[] = [];
  private streakLevel = 0;
  frenzyTimer = 0;
  private hazardClock = 0;
  private hazardGfx!: Phaser.GameObjects.Graphics;
  private hazardSprites = new Map<Hazard, { base: Phaser.GameObjects.Image; plate: Phaser.GameObjects.Image }>();
  private shopPending = false;
  rerollUsed = false;
  hurtFlash = 0;

  private nextDoubling = 16;
  private shieldWave = -1;
  private upgradeOpen = false;
  private finaleDone = false;
  private belts: Belt[] = [];
  private beltSprites: Phaser.GameObjects.TileSprite[] = [];
  private beltSpeed = 0;
  private field!: Phaser.GameObjects.Graphics;
  private readonly repellers: Repeller[] = [];
  private readonly explosions: { x: number; y: number; r: number; d: number; hurts: boolean }[] = [];
  private readonly frame: JunkFrame = {
    px: 0,
    py: 0,
    magnetRadius: 0,
    spin: 0,
    massMult: 1,
    damageMult: 1,
    counterRings: false,
    repellers: [],
    belts: [],
    beltSpeed: 0,
    looseFriction: 3.5,
    hot: false,
  };
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private clock = 0;
  private dustTimer = 0;

  constructor() {
    super('Game');
  }

  init(data: RunConfig): void {
    this.cfg = data?.mode ? data : { mode: 'menu' };
    // The scene instance is reused on restart, so reset every bit of run state here.
    this.state = this.cfg.mode === 'menu' ? 'menu' : 'intro';
    this.runTime = 0;
    this.timeScale = 1;
    this.slowTarget = 1;
    this.hitStop = 0;
    this.stateTimer = 0;
    this.xp = 0;
    this.level = 1;
    this.xpNeed = xpForLevel(1);
    this.pendingLevels = 0;
    this.kills = 0;
    this.scrapKills = 0;
    this.peakJunk = 0;
    this.pulseUsed = false;
    this.hitsTaken = 0;
    this.bestCrowd = 0;
    this.bossWarningAt = -1;
    this.bannerText = '';
    this.bannerAt = -1;
    this.rareReward = false;
    for (const k of Object.keys(this.runKills)) delete this.runKills[k];
    this.lowHpAt = -1;
    this.reviveUsed = false;
    this.rescueGiven = false;
    this.rescueTimer = 0;
    this.savedJunk = [];
    this.healthTimer = 0;
    this.phaseLabel = 'CALM';
    this.phaseAt = -1;
    this.pickups = [];
    this.chests = [];
    this.chestsOpened = 0;
    this.pulses = 0;
    this.frenzies = 0;
    this.pathsDone = 0;
    this.fullHealthAt120 = false;
    this.vortex = null;
    this.killTimes = [];
    this.streakLevel = 0;
    this.frenzyTimer = 0;
    this.hazardClock = 0;
    this.shopPending = false;
    this.rerollUsed = false;
    this.hurtFlash = 0;
    this.nextDoubling = 16;
    this.shieldWave = -1;
    this.upgradeOpen = false;
    this.finaleDone = false;
    this.beltSprites = [];
    this.explosions.length = 0;
    this.clock = 0;
    Controls.reset();
  }

  get isRun(): boolean {
    return this.cfg.mode === 'run';
  }

  get daily(): boolean {
    return !!this.cfg.daily;
  }

  create(): void {
    const save = Meta.data;
    let seed = (Math.random() * 2 ** 32) >>> 0;
    if (this.daily) {
      seed = hashString(`junk-magnet-${todayKey()}`);
      const ids = Object.keys(MAPS);
      this.mapId = ids[seed % ids.length];
      this.magnetDef = MAGNETS.horseshoe;
    } else {
      this.mapId = MAPS[save.map] ? save.map : 'junkyard';
      this.magnetDef = MAGNETS[save.magnet] ?? MAGNETS.horseshoe;
    }
    if (!this.isRun) this.mapId = 'junkyard';
    this.mapDef = MAPS[this.mapId];
    // Difficulty mode (the Daily Seed is always Normal, with a daily modifier instead).
    this.modeId = !this.daily && MODES[save.mode] && modeUnlocked(save.mode) ? save.mode : 'normal';
    this.modifier = this.daily ? DAILY_MODS[seed % DAILY_MODS.length].id : '';
    const md = MODES[this.modeId];
    this.mods = {
      hp: md.hp,
      speed: md.speed * (this.modifier === 'speed' ? 1.5 : 1),
      onlySprinters: this.modifier === 'sprinters',
    };
    this.spawnRng = new Rng(seed);
    this.lootRng = new Rng(seed ^ 0x9e3779b9);

    const floorKey = `floor-${this.mapId}`;
    makeFloor(this, floorKey, this.mapDef);
    this.add.image(0, 0, floorKey).setOrigin(0).setDepth(DEPTH.floor);
    this.createBelts();

    this.upgrades = new UpgradeSystem(this.lootRng);
    this.stats = this.upgrades.stats(this.magnetDef);
    this.junk = new JunkSystem(this, this.magnetDef.layout, this.magnetDef.ringFirst, this.magnetDef.ringSpacing);
    this.enemies = new EnemySpawner(this, this);
    this.juice = new Juice(this);
    this.player = new Player(this, this.magnetDef, this.stats, ARENA.width / 2, ARENA.height / 2);
    this.field = this.add.graphics().setDepth(DEPTH.field);
    this.weapons = new Weapons(this, this);
    this.hazardGfx = this.add.graphics().setDepth(DEPTH.belt + 0.8);
    this.hazardSprites = new Map();
    if (this.isRun) {
      for (const hz of this.mapDef.hazards ?? []) {
        if (hz.type !== 'crusher') continue;
        const w = hz.w ?? 160;
        const h = hz.h ?? 160;
        const keys = makeCrusherTextures(this, w, h);
        const cx = (hz.x ?? 0) + w / 2;
        const cy = (hz.y ?? 0) + h / 2;
        this.hazardSprites.set(hz, {
          base: this.add.image(cx, cy + 4, keys.base).setScale(TS).setDepth(DEPTH.belt + 0.7),
          plate: this.add.image(cx, cy, keys.plate).setScale(TS).setDepth(DEPTH.junk + 3),
        });
      }
    }
    for (let i = 0; i < 3; i++) this.chests.push(this.add.image(0, 0, 'chest').setScale(0.7).setDepth(DEPTH.loose + 1).setVisible(false));
    for (let i = 0; i < 4; i++) this.pickups.push(this.add.image(0, 0, 'health-pack').setScale(0.55).setDepth(DEPTH.loose + 1).setVisible(false));

    this.junk.onAttach = (count) => {
      if (count < 0) {
        Audio.coin();
        return;
      }
      Audio.clink();
      if (this.isRun && this.junk.lastAttachedPower === 'gold') {
        this.scrapKills += JUNK.powers.gold.scrap;
        this.juice.sparks(this.player.x, this.player.y - 20, 4, PAL.brass);
        Audio.coin();
      }
      if (this.isRun && count >= this.nextDoubling) {
        this.nextDoubling *= 2;
        this.juice.punchZoom(0.09);
      }
    };

    this.junk.onShatter = (x, y) => this.juice.sparks(x, y, 2, 0xa7b0ba);
    this.junk.onUpgrade = (x, y) => {
      this.juice.sparks(x, y, 4, PAL.brass);
      Audio.fuse();
    };
    this.updateCap();

    this.camX = this.player.x;
    this.camY = this.player.y;
    this.zoom = this.isRun ? 1 : 0.85;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, ARENA.width, ARENA.height).setZoom(this.zoom).centerOn(this.camX, this.camY);
    cam.setBackgroundColor(PAL.outline);

    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
      kb.on('keydown-SPACE', () => this.tryPulse());
      kb.on('keydown-E', () => (Controls.specialQueued = true));
      kb.on('keydown-SHIFT', () => (Controls.specialQueued = true));
      kb.on('keydown-P', () => this.openPause());
    }
    const onBlur = () => this.openPause(true);
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onBlur);
    });

    if (this.isRun) {
      this.scene.stop('Menu');
      this.scene.stop('Garage');
      this.scene.launch('HUD');
      Audio.music('main');
      this.dropIn();
    } else {
      this.player.canMove = true;
      this.scene.stop('HUD');
      if (this.cfg.garage) this.scene.launch('Garage');
      else if (!this.scene.isActive('Menu') && !this.scene.isActive('Garage')) this.scene.launch('Menu');
      Audio.music('menu');
      CrazySDK.gameplayStop();
    }
  }

  private createBelts(): void {
    this.belts = this.mapDef.conveyors ?? [];
    this.beltSpeed = this.mapDef.conveyorSpeed ?? 0;
    const g = this.add.graphics().setDepth(DEPTH.belt + 0.5);
    for (const b of this.belts) {
      const horizontal = b.w >= b.h;
      const len = horizontal ? b.w : b.h;
      const thick = horizontal ? b.h : b.w;
      const ts = this.add.tileSprite(b.x + b.w / 2, b.y + b.h / 2, len, thick, 'belt').setDepth(DEPTH.belt);
      ts.rotation = horizontal ? (b.dx > 0 ? 0 : Math.PI) : b.dy > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.beltSprites.push(ts);
      g.lineStyle(5, PAL.outline);
      g.strokeRect(b.x, b.y, b.w, b.h);
      g.lineStyle(3, PAL.brass, 0.7);
      g.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    }
  }

  /** The magnet drops in with a thunk. */
  private dropIn(): void {
    const p = this.player;
    p.canMove = false;
    p.sprite.setScale(p.sprite.scaleX * 3).setAlpha(0).setPosition(p.x, p.y - 60);
    this.tweens.add({
      targets: p.sprite,
      scale: 0.5,
      alpha: 1,
      y: p.y,
      duration: 420,
      delay: 150,
      ease: 'Quad.easeIn',
      onComplete: () => {
        Audio.thunk();
        this.juice.shake(0.4);
        this.juice.ring(p.x, p.y, PAL.cyan, 0.3, 0.4, 2.2);
        for (let i = 0; i < 10; i++) this.juice.emit(p.x, p.y + 10, 'p-puff', 0x8a7f99, { speed: 260, life: 0.5, scale: 1.2, endScale: 2, alpha: 0.6, drag: 5 });
        p.canMove = true;
        p.stretch = 0.8;
        this.state = 'playing';
        CrazySDK.gameplayStart();
        if (this.modifier) this.banner(DAILY_MODS.find((m) => m.id === this.modifier)!.name);
        else if (this.modeId !== 'normal') this.banner(`${MODES[this.modeId].name} MODE`);
      },
    });
  }

  // ------------------------------------------------------------------ EnemyHost

  spawnDistance(): number {
    const cam = this.cameras.main;
    return Math.hypot(cam.width, cam.height) / 2 / cam.zoom + 60;
  }

  onEnemyKilled(e: Enemy): void {
    const elite = !!e.def.elite || e.elite;
    const size = e.radius / 15;
    this.juice.pop(e.x, e.y, e.kind === 'boss' ? PAL.pink : e.elite ? PAL.brass : PAL.lime, size);
    Audio.pop(elite);
    if (!this.isRun) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.junk.spawnLoose(e.x, e.y, Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3));
      return;
    }
    this.kills++;
    this.noteKill();
    // Fire path perk: burning robots explode when they die.
    if ((this.stats.firePerk && e.burnTimer > 0) || this.modifier === 'explode') this.queueExplosion(e.x, e.y, 60, 20 * (1 + 0.08 * this.level), false);
    if (this.healthTimer >= JUNK.health.dropEvery) {
      this.healthTimer = 0;
      this.dropHealth(e.x, e.y);
    }
    this.runKills[e.kind] = (this.runKills[e.kind] ?? 0) + 1;
    if (e.elite) this.runKills.elite = (this.runKills.elite ?? 0) + 1;
    this.scrapKills += e.scrap * this.stats.coinMult;
    const first = this.kills === 1;
    // Thieves and Magnet Bots give back what they stole.
    const drops = (first ? 3 : this.lootRng.int(e.def.drops[0], e.def.drops[1])) + e.carried;
    for (let i = 0; i < drops; i++) {
      const piece = this.junk.spawnLoose(e.x, e.y, first ? 0 : this.junk.rollType(this.lootRng), isBig(e.kind) ? 500 : undefined);
      if (piece && e.weaponHit) this.junk.magnetize(piece);
    }
    if (elite) {
      this.hitStop = Math.max(this.hitStop, 0.05);
      this.juice.shake(0.15);
    }
    if (e.kind === 'boss') {
      this.win(e);
      return;
    }
    // Treasure chests: always from the Magnetron and Golden Robots, sometimes from elites.
    if (e.kind === 'magnetron' || e.kind === 'golden' || (e.elite && this.lootRng.next() < 0.12)) this.dropChest(e.x, e.y);
    if (e.kind === 'crusher') {
      // The mini-boss pays out a guaranteed rare upgrade.
      this.juice.confetti(e.x, e.y, 50);
      this.dropChest(e.x, e.y);
      this.rareReward = true;
      this.pendingLevels++;
      if (this.state === 'playing') this.startLevelUp();
    }
    this.gainXp(e.xp * (this.modifier === 'speed' ? 1.5 : 1));
  }

  onBossWarning(): void {
    this.bossWarningAt = this.runTime;
    this.banner('THE COMPACTOR IS COMING');
    Audio.alarm();
  }

  private banner(text: string): void {
    this.bannerText = text;
    this.bannerAt = this.clock;
  }

  onMinibossWarning(): void {
    this.banner('CRUSHER INCOMING');
    Audio.alarm();
  }

  onMidbossWarning(): void {
    this.banner('MAGNETRON INCOMING');
    Audio.alarm();
  }

  onMidbossSpawned(): void {
    this.juice.shake(0.4);
  }

  onMinibossSpawned(): void {
    this.juice.shake(0.35);
  }

  /** Crusher stomp: junk near it gets knocked loose; you get shoved if you're inside. */
  onCrusherStomp(e: Enemy): void {
    const r = e.def.stompRadius ?? 190;
    const p = this.player;
    Audio.crush();
    this.juice.shake(0.5);
    this.juice.ring(e.x, e.y, PAL.lime, 0.4, 0.4, r / 64);
    for (let i = 0; i < 10; i++) this.juice.emit(e.x, e.y, 'p-puff', 0x8a7f99, { speed: 380, life: 0.5, scale: 1.4, endScale: 2.2, alpha: 0.5, drag: 5 });
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < r + this.junk.cloudRadius) {
      this.junk.knockLoose((e.def.junkKnock ?? 0.15) * this.stats.knockMult, e.x, e.y, 0);
      const k = 380 / Math.max(d, 1);
      p.vx += (p.x - e.x) * k;
      p.vy += (p.y - e.y) * k;
    }
    if (d < r * 0.5) this.playerHit(e.x, e.y, 0.1, this.phaseDamage(e.def.stompDamage ?? 2));
  }

  onBurrowerEmerge(e: Enemy): void {
    const r = e.def.emergeRadius ?? 60;
    Audio.crush();
    this.juice.shake(0.3);
    this.juice.ring(e.x, e.y, 0x8a6b4a, 0.3, 0.35, r / 64);
    for (let i = 0; i < 8; i++) this.juice.emit(e.x, e.y, 'p-puff', 0x6b5a48, { speed: 260, life: 0.5, scale: 1.2, endScale: 2, alpha: 0.6, drag: 5 });
    if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < r + this.player.radius) this.playerHit(e.x, e.y, undefined, this.phaseDamage(e.def.dmg ?? 2));
  }

  onPressSlam(e: Enemy): void {
    const r = e.def.slamRadius ?? 115;
    const crushed = this.junk.crushNear(e.x, e.y, r);
    Audio.crush();
    this.juice.shake(crushed > 0 ? 0.4 : 0.2);
    this.juice.ring(e.x, e.y, PAL.pink, 0.3, 0.35, r / 64);
    if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < r + this.player.radius) this.playerHit(e.x, e.y, undefined, this.phaseDamage(e.def.dmg ?? 2));
  }

  onMagnetPull(_e: Enemy, pieces: number): void {
    if (pieces > 0) Audio.hurt();
  }

  onGoldenEscaped(e: Enemy): void {
    this.juice.label(e.x, e.y, 'IT GOT AWAY!', CSS.brass, 22);
  }

  onThiefEscaped(e: Enemy): void {
    if (e.carried > 0) this.juice.label(this.player.x, this.player.y - 60, `-${e.carried} STOLEN`, CSS.pink, 22);
  }

  onBossSpawned(): void {
    Audio.music('boss');
    this.juice.shake(0.45);
  }

  onBossTelegraph(): void {
    Audio.clank();
  }

  onBossSlam(e: Enemy): void {
    const r = e.def.compactRadius ?? 220;
    const crushed = this.junk.crushNear(e.x, e.y, r);
    if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < r + this.player.radius && crushed === 0) {
      this.playerHit(e.x, e.y, e.def.junkKnock ?? 0.3, this.phaseDamage(e.def.dmg ?? 2));
    }
    Audio.crush();
    this.juice.shake(0.6);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.juice.ring(e.x, e.y, PAL.pink, 0.4, 0.4, r / 64);
    for (let i = 0; i < 14; i++) this.juice.emit(e.x, e.y, 'p-puff', 0x8a7f99, { speed: 420, life: 0.6, scale: 1.6, endScale: 2.4, alpha: 0.5, drag: 5 });
  }

  onBossWallHit(e: Enemy): void {
    Audio.crush();
    this.juice.shake(0.5);
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.juice.sparks(e.x, e.y, 14, 0xffd27a);
  }

  onSpitterFire(): void {
    Audio.shot();
  }

  // ------------------------------------------------------------------ progression

  private gainXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpForLevel(this.level);
      this.pendingLevels++;
    }
    this.updateCap();
    if (this.pendingLevels > 0 && this.state === 'playing') this.startLevelUp();
  }

  private startLevelUp(): void {
    this.state = 'levelup';
    this.slowTarget = 0.06;
    this.stateTimer = 0.3;
    Audio.levelUp();
    this.juice.ring(this.player.x, this.player.y, PAL.brass, 0.4, 0.5, 3);
  }

  rollCards(): CardDef[] {
    return this.upgrades.roll(3, this.rareReward);
  }

  /** Called by the Upgrade overlay. Returns true if another level-up is waiting. */
  chooseCard(id: string): boolean {
    this.applyCard(id);
    this.pendingLevels--;
    this.rareReward = false;
    return this.pendingLevels > 0;
  }

  /** Chest reward: apply a card without using up a level-up. */
  chooseCardFree(id: string): void {
    this.applyCard(id);
  }

  /** Distinct cards for a chest (up to 5). */
  chestCards(n: number): string[] {
    const out: string[] = [];
    for (let tries = 0; out.length < n && tries < 6; tries++) {
      for (const c of this.upgrades.roll(3)) {
        if (out.length >= n) break;
        if (c.max < 99 && out.includes(c.id)) continue;
        if (c.max < 99 && this.upgrades.level(c.id) + out.filter((x) => x === c.id).length >= c.max) continue;
        out.push(c.id);
      }
    }
    while (out.length < n) out.push('patchUp');
    return out;
  }

  /** Kill-streak announcer: SMASHING! → JUNK STORM! → SCRAP FRENZY! (damage boost). */
  private noteKill(): void {
    const t = this.runTime;
    this.killTimes.push(t);
    while (this.killTimes.length && this.killTimes[0] < t - 5) this.killTimes.shift();
    const n = this.killTimes.length;
    const tiers: [number, string][] = [
      [15, 'SMASHING!'],
      [30, 'JUNK STORM!'],
      [50, 'SCRAP FRENZY!'],
    ];
    let level = 0;
    for (let i = 0; i < tiers.length; i++) if (n >= tiers[i][0]) level = i + 1;
    if (level > this.streakLevel) {
      this.streakLevel = level;
      this.banner(tiers[level - 1][1]);
      Audio.levelUp();
      if (level === 3) {
        this.frenzyTimer = 5;
        this.frenzies++;
      }
    } else if (n < 10) {
      this.streakLevel = 0;
    }
  }

  /** Car crushers and electric fences hurt robots and you alike. */
  private updateHazards(dt: number): void {
    const list = this.mapDef.hazards ?? [];
    const g = this.hazardGfx;
    g.clear();
    if (!this.isRun || list.length === 0) return;
    const active = this.state === 'playing';
    if (active) this.hazardClock += dt;
    const p = this.player;
    for (const hz of list) {
      if (hz.type === 'crusher') {
        const every = hz.every ?? 5;
        const prev = (this.hazardClock - dt + hz.offset) % every;
        const t = (this.hazardClock + hz.offset) % every;
        const x = hz.x ?? 0;
        const y = hz.y ?? 0;
        const w = hz.w ?? 160;
        const h = hz.h ?? 160;
        const warn = t > every - 1;
        const down = t < 0.4;
        // The plate hangs see-through above the pit, drops during the warning, then slams.
        const sprites = this.hazardSprites.get(hz);
        if (sprites) {
          const lift = down ? 0 : warn ? 48 * (every - t) : 48;
          const shakeX = warn ? Math.sin(this.clock * 60) * 2 : 0;
          sprites.plate
            .setPosition(x + w / 2 + shakeX, y + h / 2 - lift)
            .setAlpha(down ? 1 : warn ? 0.85 : 0.5)
            .setScale(TS * (1 + lift / 600));
        }
        if (warn) {
          g.fillStyle(PAL.red, 0.12 + Math.abs(Math.sin(this.clock * 14)) * 0.18);
          g.fillRect(x + 12, y + 12, w - 24, h - 24);
        }
        if (active && t < prev) {
          // SLAM.
          const cx = x + w / 2;
          const cy = y + h / 2;
          this.juice.shake(0.25);
          Audio.crush();
          for (let i = 0; i < 6; i++) this.juice.emit(cx, cy, 'p-puff', 0x8a7f99, { speed: 300, life: 0.5, scale: 1.4, endScale: 2.2, alpha: 0.5 });
          for (const e of this.enemies.pool.items) {
            if (!e.active || e.hidden || isBig(e.kind)) continue;
            if (e.x > x && e.x < x + w && e.y > y && e.y < y + h) this.enemies.damage(e, HAZARD_DMG.crusherRobot, cx, cy, 0);
          }
          if (p.x > x && p.x < x + w && p.y > y && p.y < y + h) this.playerHit(cx, cy, 0.25, this.phaseDamage(HAZARD_DMG.crusherPlayer));
          this.junk.crushNear(cx, cy, Math.min(w, h) / 2);
        }
      } else {
        const cycle = (hz.on ?? 3) + (hz.off ?? 3);
        const t = (this.hazardClock + hz.offset) % cycle;
        const on = t < (hz.on ?? 3);
        const x1 = hz.x1 ?? 0;
        const y1 = hz.y1 ?? 0;
        const x2 = hz.x2 ?? 0;
        const y2 = hz.y2 ?? 0;
        const soon = !on && t > cycle - 0.6;
        g.lineStyle(10, PAL.outline, 0.8);
        g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(4, on ? PAL.cyan : soon ? PAL.brass : 0x4a4458, on ? 0.95 : 0.8);
        if (on) {
          // Crackling line.
          const n = 10;
          g.beginPath();
          g.moveTo(x1, y1);
          for (let i = 1; i < n; i++) {
            const k = i / n;
            g.lineTo(x1 + (x2 - x1) * k + (Math.random() - 0.5) * 10, y1 + (y2 - y1) * k + (Math.random() - 0.5) * 10);
          }
          g.lineTo(x2, y2);
          g.strokePath();
        } else {
          g.lineBetween(x1, y1, x2, y2);
        }
        for (const [px, py] of [
          [x1, y1],
          [x2, y2],
        ]) {
          g.fillStyle(PAL.outline);
          g.fillCircle(px, py, 11);
          g.fillStyle(0x6e7681);
          g.fillCircle(px, py, 8);
        }
        if (!on || !active) continue;
        const near = (ex: number, ey: number, r: number) => {
          const vx = x2 - x1;
          const vy = y2 - y1;
          const k = Phaser.Math.Clamp(((ex - x1) * vx + (ey - y1) * vy) / (vx * vx + vy * vy), 0, 1);
          return Math.hypot(ex - (x1 + vx * k), ey - (y1 + vy * k)) < r;
        };
        for (const e of this.enemies.pool.items) {
          if (!e.active || e.hidden) continue;
          if (near(e.x, e.y, e.radius + 8)) {
            this.enemies.damage(e, HAZARD_DMG.fenceRobotDps * dt, e.x, e.y, 0);
            e.stun = Math.max(e.stun, 0.15);
          }
        }
        if (near(p.x, p.y, p.radius + 8)) this.playerHit(p.x, p.y, 0.08, this.phaseDamage(HAZARD_DMG.fencePlayer));
      }
    }
  }

  /** Junk shop between phases: a 10-second break to trade junk for health, a card or scrap. */
  private openShop(): void {
    this.shopPending = false;
    this.state = 'levelup';
    this.upgradeOpen = true;
    this.scene.launch('Shop');
    this.scene.pause();
  }

  closeShop(): void {
    this.scene.stop('Shop');
    this.upgradeOpen = false;
    this.state = 'playing';
    this.slowTarget = 1;
    this.timeScale = 0.2;
    this.player.invuln = Math.max(this.player.invuln, 1);
    this.scene.resume();
    if (this.pendingLevels > 0) this.startLevelUp();
  }

  /** Shop purchase. Returns false if you can't afford it. */
  buy(item: 'heal' | 'card' | 'scrap', cost: number): boolean {
    if (this.junk.count < cost) return false;
    this.junk.consume(cost);
    if (item === 'heal') this.heal(30);
    else if (item === 'scrap') this.scrapKills += 40 / JUNK.economy.coinsPerScrap;
    else {
      const id = this.chestCards(1)[0];
      this.applyCard(id);
      this.juice.label(this.player.x, this.player.y - 60, cardById(id).name.toUpperCase(), CSS.brass, 24);
    }
    return true;
  }

  private updateVortex(dt: number): void {
    const v = this.vortex;
    if (!v) return;
    v.t -= dt;
    for (const e of this.enemies.pool.items) {
      if (!e.active || e.hidden || isBig(e.kind)) continue;
      const dx = v.x - e.x;
      const dy = v.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 760 || d < 6) continue;
      e.x += (dx / d) * BLACK_HOLE.pull * dt;
      e.y += (dy / d) * BLACK_HOLE.pull * dt;
    }
    if (v.t <= 0) {
      this.vortex = null;
      this.queueExplosion(v.x, v.y, BLACK_HOLE.radius, v.dmg, false);
      this.juice.ring(v.x, v.y, PAL.cyan, 0.5, 0.5, BLACK_HOLE.radius / 64);
      this.juice.shake(0.6);
    }
  }

  private dropChest(x: number, y: number): void {
    const k = this.chests.find((i) => !i.visible);
    if (!k) return;
    k.setPosition(x, y).setVisible(true).setData('life', 30);
    this.tweens.add({ targets: k, scale: { from: 0, to: 0.7 }, y: y - 6, duration: 400, ease: 'Back.easeOut' });
    Audio.rare();
  }

  private updateChests(dt: number): void {
    const p = this.player;
    for (const k of this.chests) {
      if (!k.visible) continue;
      const life = (k.getData('life') as number) - dt;
      k.setData('life', life);
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < this.stats.magnetRadius) {
        k.x += (dx / d) * 260 * dt;
        k.y += (dy / d) * 260 * dt;
      }
      k.rotation = Math.sin(this.clock * 6) * 0.12;
      if (life <= 0) k.setVisible(false);
      else if (d < p.radius + 22 && this.state === 'playing') {
        k.setVisible(false);
        this.openChest();
      }
    }
  }

  private openChest(): void {
    this.state = 'levelup';
    this.upgradeOpen = true;
    this.scene.launch('Chest', { mode: 'run' });
    this.scene.pause();
  }

  closeChest(): void {
    this.scene.stop('Chest');
    this.upgradeOpen = false;
    this.state = 'playing';
    this.slowTarget = 1;
    this.timeScale = 0.2;
    this.player.invuln = Math.max(this.player.invuln, 0.8);
    this.scene.resume();
    if (this.pendingLevels > 0) this.startLevelUp();
  }

  private applyCard(id: string): void {
    const card = cardById(id);
    const path = card.path;
    const hadPerk = path ? this.upgrades.hasPerk(path) : true;
    if (id === 'scrapPile') this.scrapKills += (card.value as number) / JUNK.economy.coinsPerScrap;
    else if (id === 'patchUp') this.heal(card.value as number);
    else {
      this.upgrades.take(id);
      this.stats = this.upgrades.stats(this.magnetDef);
      this.player.stats = this.stats;
      this.updateCap();
      if (id === 'spareHeart') this.heal(card.value as number);
    }
    if (path && !hadPerk && this.upgrades.hasPerk(path)) {
      this.banner(`${pathDef(path).name} PATH COMPLETE!`);
      this.pathsDone++;
      Audio.victory();
    }
  }

  resumeFromUpgrade(): void {
    this.upgradeOpen = false;
    this.state = 'playing';
    this.slowTarget = 1;
    this.timeScale = 0.15;
    this.player.invuln = Math.max(this.player.invuln, 0.6);
    this.scene.stop('Upgrade');
    this.scene.resume();
  }

  openPause(fromTab = false): void {
    if (this.state !== 'playing' || !this.scene.isActive()) return;
    CrazySDK.gameplayStop();
    this.scene.launch('Pause', { fromTab });
    this.scene.pause();
  }

  resumeFromPause(): void {
    this.scene.stop('Pause');
    this.scene.resume();
    CrazySDK.gameplayStart();
  }

  // ------------------------------------------------------------------ combat

  /**
   * Pulse rewards timing: it hits harder the fuller the ball is (Overcharged when full), and
   * catching a crowd refunds half the cooldown.
   */
  tryPulse(): void {
    const p = this.player;
    if (this.state !== 'playing' || p.pulseCd > 0) return;
    const cfg = JUNK.pulse;
    const stats = this.stats;
    p.pulseCd = stats.pulseCooldown;
    p.stretch = 1;
    this.pulseUsed = true;
    const fill = Math.min(1, this.junk.count / Math.max(1, this.junk.cap));
    const overcharged = fill >= 0.999;
    const range = stats.pulseRange * (overcharged ? cfg.overchargeRange : 1);
    this.junk.startPulse(cfg.duration, range);
    const reach = range + this.junk.cloudRadius + 30;
    const dmg =
      cfg.shockDamage * (1 + 0.08 * this.level) * stats.pulseDamageMult * (1 + cfg.fullBonus * fill) * (overcharged ? cfg.overchargeDamage : 1);
    let caught = 0;
    for (const e of this.enemies.pool.items) {
      if (!e.active || e.hidden) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > reach + e.radius) continue;
      caught++;
      const falloff = 1 - (d / (reach + e.radius)) * 0.5;
      if (e.kind === 'antimag') e.auraOff = e.def.shortOut ?? 3.5;
      if (stats.stunTime > 0) e.stun = Math.max(e.stun, stats.stunTime);
      if (stats.fireRing) {
        e.burnDps = Math.max(e.burnDps, stats.fireRingDps);
        e.burnTimer = Math.max(e.burnTimer, stats.fireRingTime);
      }
      const amount = dmg * (e.kind === 'antimag' ? 2 : 1);
      this.showDamage(e, amount, false, true);
      this.enemies.damage(e, amount, p.x, p.y, cfg.shockKnockback * falloff);
    }
    this.bestCrowd = Math.max(this.bestCrowd, caught);
    if (stats.polarity) this.junk.pullAll();
    // Storm path perk: every Pulse throws chain lightning.
    if (stats.stormPerk) this.weapons.zap(p.x, p.y, 5, 24, 320);
    if (this.magnetDef.pulseZap) this.weapons.zap(p.x, p.y, this.magnetDef.pulseZap, 18, 300);
    this.pulses++;
    // Black Hole Pulse: suck the whole screen in, then explode.
    if (stats.blackHole) {
      this.vortex = { x: p.x, y: p.y, t: BLACK_HOLE.duration, dmg: dmg * BLACK_HOLE.damageMult };
      this.juice.label(p.x, p.y - 70, 'BLACK HOLE!', CSS.cyan, 30);
    }
    Audio.pulse();
    this.juice.shake(overcharged ? 0.4 : 0.25);
    this.juice.ring(p.x, p.y, overcharged ? PAL.brass : PAL.cyan, 0.3, 0.45, reach / 64);
    this.juice.ring(p.x, p.y, stats.fireRing ? PAL.rust : 0xffffff, 0.2, 0.3, reach / 90);
    if (overcharged) this.juice.label(p.x, p.y - 70, 'OVERCHARGED!', CSS.brass, 30);
    if (caught >= cfg.crowdSize) {
      p.pulseCd *= cfg.crowdRefund;
      this.scrapKills += caught * cfg.crowdCoins;
      this.juice.label(p.x, p.y - (overcharged ? 104 : 70), `CROWD ×${caught}!`, CSS.cyan, 28);
      Audio.coin();
    }
  }

  /** Junk capacity rises with level (plus Junk Hoarder / Mega Magnet). */
  private updateCap(): void {
    this.junk.cap = Math.min(JUNK.maxAttached, JUNK.capStart + JUNK.capPerLevel * (this.level - 1) + this.stats.capBonus);
    this.junk.tvMult = this.stats.tvMult;
    this.junk.goldMult = this.modifier === 'gold' ? 8 : 1;
    this.junk.cap = Math.max(20, this.junk.cap + (this.magnetDef.capBonus ?? 0));
  }

  /** Contact damage for the current aggression phase, times a per-robot multiplier. */
  phaseDamage(mult = 1): number {
    return this.enemies.phase.damage * mult * MODES[this.modeId].dmg * (this.modifier === 'glass' ? 2 : 1);
  }

  /**
   * Every hit costs health. Junk no longer blocks hits: a full ball cuts the damage by up to
   * 40%, and some junk gets knocked loose.
   */
  private playerHit(fromX: number, fromY: number, fraction: number = JUNK.knockFraction, damage = this.phaseDamage()): void {
    const p = this.player;
    if (this.state !== 'playing' || p.invuln > 0) return;
    const H = JUNK.health;
    p.invuln = H.invuln;
    this.hitsTaken++;
    const angle = Math.atan2(p.y - fromY, p.x - fromX);
    if (this.stats.scrapShield && this.shieldWave !== this.enemies.wave) {
      this.shieldWave = this.enemies.wave;
      this.juice.ring(p.x, p.y, PAL.cyan, 0.5, 0.35, 1.6);
      Audio.clank();
      return;
    }
    const fill = Math.min(1, this.junk.count / Math.max(1, this.junk.cap));
    const taken = damage * (1 - this.stats.junkArmor * fill);
    p.hp = Math.max(0, p.hp - taken);
    if (this.junk.count > 0) this.junk.knockLoose(fraction * this.stats.knockMult, fromX, fromY, JUNK.shatterFraction);
    if (this.lowHpAt < 0 && p.hp < p.stats.maxHp * H.halfHealth) this.lowHpAt = this.runTime;
    // Once per run, dropping under 30% guarantees a health pack nearby within a few seconds.
    if (!this.rescueGiven && p.hp > 0 && p.hp < p.stats.maxHp * 0.3) {
      this.rescueGiven = true;
      this.rescueTimer = 3;
    }
    this.hurtFlash = Math.min(1, 0.35 + taken / 20);
    this.juice.label(p.x, p.y - 34, `-${Math.round(taken)}`, CSS.red, 24);
    Audio.hurt();
    this.juice.shake(Math.min(0.6, 0.2 + taken / 40));
    this.juice.sparks(p.x, p.y, 10, taken >= 15 ? PAL.red : 0xffd27a, angle);
    this.hitStop = Math.max(this.hitStop, taken >= 15 ? 0.08 : 0.04);
    if (p.hp <= 0) this.die();
  }

  heal(amount: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.stats.maxHp, p.hp + amount);
    if (p.hp > before) this.juice.label(p.x, p.y - 34, `+${Math.round(p.hp - before)}`, CSS.lime, 26);
  }

  /** Rare health drops: about one every 45 s, dropped by the next robot you break. */
  private updatePickups(dt: number): void {
    const p = this.player;
    const H = JUNK.health;
    if (this.state === 'playing') this.healthTimer += dt;
    if (this.rescueTimer > 0 && this.state === 'playing') {
      this.rescueTimer -= dt;
      if (this.rescueTimer <= 0) {
        const a = Math.random() * Math.PI * 2;
        const m = ARENA.margin + 40;
        this.dropHealth(
          Phaser.Math.Clamp(p.x + Math.cos(a) * 170, m, ARENA.width - m),
          Phaser.Math.Clamp(p.y + Math.sin(a) * 170, m, ARENA.height - m),
        );
        this.juice.label(p.x, p.y - 60, 'HEALTH PACK!', CSS.lime, 24);
      }
    }
    for (const k of this.pickups) {
      if (!k.visible) continue;
      const life = (k.getData('life') as number) - dt;
      k.setData('life', life);
      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      // Health packs aren't magnetic: you have to go and get them.
      if (d < 60) {
        k.x += (dx / d) * 240 * dt;
        k.y += (dy / d) * 240 * dt;
      }
      k.setAlpha(life < 3 && Math.floor(life * 8) % 2 === 0 ? 0.3 : 1);
      k.rotation = Math.sin(this.clock * 4) * 0.15;
      if (d < p.radius + 18) {
        k.setVisible(false);
        this.heal(H.dropHeal);
        Audio.levelUp();
        this.juice.ring(p.x, p.y, PAL.lime, 0.3, 0.4, 1.4);
      } else if (life <= 0) {
        k.setVisible(false);
      }
    }
  }

  private dropHealth(x: number, y: number): void {
    const k = this.pickups.find((i) => !i.visible);
    if (!k) return;
    k.setPosition(x, y).setVisible(true).setAlpha(1).setData('life', JUNK.health.dropLife);
    this.tweens.add({ targets: k, scale: { from: 0, to: 0.55 }, duration: 300, ease: 'Back.easeOut' });
  }

  private heartbeatTimer = 0;

  /** Heartbeat under 15% health. */
  private updateHeartbeat(dt: number): void {
    if (this.state !== 'playing') return;
    const frac = this.player.hp / this.stats.maxHp;
    if (frac >= JUNK.health.heartbeat) return;
    this.heartbeatTimer -= dt;
    if (this.heartbeatTimer <= 0) {
      this.heartbeatTimer = 0.75;
      Audio.heartbeat();
    }
  }

  onPhaseChange(index: number): void {
    if (!this.isRun || index === 0) return;
    this.banner(PHASE_WARNING);
    this.phaseLabel = PHASES[index].name;
    this.phaseAt = this.clock;
    Audio.alarm();
    Audio.setIntensity(index);
    if (index >= 1 && index <= 3) this.shopPending = true;
    this.juice.shake(0.3);
  }

  get canRevive(): boolean {
    return this.isRun && !this.reviveUsed && this.runTime >= 60 && CrazySDK.adsAvailable;
  }

  /** Revive after a rewarded ad: half health, your junk ball back, and room to breathe. */
  revive(): void {
    const p = this.player;
    this.reviveUsed = true;
    this.state = 'playing';
    this.slowTarget = 1;
    this.timeScale = 0.3;
    p.hp = this.stats.maxHp * 0.5;
    p.invuln = 3;
    p.sprite.setAngle(0).setScale(0.5).setAlpha(1);
    for (const type of this.savedJunk) {
      const piece = this.junk.spawnLoose(p.x, p.y, type, 40);
      if (piece) this.junk.magnetize(piece);
    }
    this.savedJunk = [];
    for (const e of this.enemies.pool.items) {
      if (!e.active || isBig(e.kind)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 320) this.enemies.damage(e, 1e9, p.x, p.y, 0);
    }
    this.juice.ring(p.x, p.y, PAL.lime, 0.4, 0.6, 5);
    this.juice.shake(0.5);
    Audio.levelUp();
    this.scene.stop('Revive');
    this.scene.launch('HUD');
    CrazySDK.gameplayStart();
  }

  declineRevive(): void {
    this.scene.stop('Revive');
    this.finish(false);
  }

  private die(): void {
    this.savedJunk = this.junk.attached.map((piece) => piece.type);
    this.state = 'dying';
    this.stateTimer = 1.6;
    this.slowTarget = 0.25;
    const p = this.player;
    this.junk.explodeAll(p.x, p.y);
    this.enemies.freezeAll();
    this.juice.pop(p.x, p.y, PAL.red, 2);
    Audio.boom();
    this.tweens.add({ targets: p.sprite, angle: 540, scale: 0.15, alpha: 0.2, duration: 1200, ease: 'Cubic.easeOut' });
  }

  private win(boss: Enemy): void {
    this.state = 'won';
    this.stateTimer = 3;
    this.slowTarget = 0.3;
    this.enemies.freezeAll();
    this.juice.confetti(boss.x, boss.y, 140);
    this.juice.shake(0.8);
    Audio.victory();
    Audio.music(null);
    CrazySDK.happytime();
    // Every other robot pops too.
    for (const e of this.enemies.pool.items) if (e.active) this.enemies.damage(e, 1e9, boss.x, boss.y, 600);
  }

  finish(win: boolean): void {
    this.state = 'over';
    this.slowTarget = 1;
    CrazySDK.gameplayStop();
    Audio.music(null);
    const save = Meta.data;
    const eco = JUNK.economy;
    const scrapJunk = Math.floor(this.peakJunk / eco.junkPerCoin);
    const scrapWin = win ? eco.winBonus : 0;
    const coinsKills = Math.round(this.scrapKills * eco.coinsPerScrap * MODES[this.modeId].scrap);
    const coinsOverflow = Math.floor(this.junk.overflowScrap / eco.overflowPerCoin);
    const coins = coinsKills + coinsOverflow + scrapJunk + scrapWin;
    const score = this.kills * 10 + this.peakJunk * 5 + Math.floor(this.runTime) + (win ? 2000 : 0);
    const newBest = score > save.best.score;
    save.coins += coins;
    save.runs++;
    save.best.score = Math.max(save.best.score, score);
    save.best.time = Math.max(save.best.time, this.runTime);
    save.best.kills = Math.max(save.best.kills, this.kills);
    save.best.junk = Math.max(save.best.junk, this.peakJunk);
    if (win) {
      save.best.wins++;
      save.modeWins[this.modeId] = (save.modeWins[this.modeId] ?? 0) + 1;
    }
    // Achievements and titles.
    const k = this.runKills;
    const earned: Record<string, boolean> = {
      noPulse: this.runTime >= 300 && this.pulses === 0,
      hoarder: this.peakJunk >= 250,
      crusher: (k.crusher ?? 0) > 0,
      magnetron: (k.magnetron ?? 0) > 0,
      win,
      winHard: win && this.modeId === 'hard',
      winNightmare: win && this.modeId === 'nightmare',
      frenzy: this.frenzies > 0,
      path: this.pathsDone > 0,
      chests: this.chestsOpened >= 3,
      golden: (k.golden ?? 0) > 0,
      untouched: this.fullHealthAt120,
    };
    const unlocked = ACHIEVEMENTS.filter((a) => earned[a.id] && !save.achievements.includes(a.id));
    for (const a of unlocked) save.achievements.push(a.id);
    if (unlocked.length) save.title = unlocked[unlocked.length - 1].title;
    if (this.daily) {
      const key = todayKey();
      if (save.daily.key !== key) save.daily = { key, best: 0, runs: 0 };
      save.daily.runs++;
      save.daily.best = Math.max(save.daily.best, score);
    }
    const challenges = applyRun({
      kills: this.runKills,
      totalKills: this.kills,
      heartLostAt: this.lowHpAt,
      time: this.runTime,
      peakJunk: this.peakJunk,
      bestCrowd: this.bestCrowd,
      level: this.level,
    });
    Meta.save();
    const result: RunResult = {
      win,
      daily: this.daily,
      time: this.runTime,
      kills: this.kills,
      peakJunk: this.peakJunk,
      level: this.level,
      scrapKills: coinsKills,
      scrapOverflow: coinsOverflow,
      scrapJunk,
      scrapWin,
      coins,
      score,
      newBest,
      dailyBest: save.daily.best,
      mapName: this.mapDef.name,
      challenges,
      achievements: unlocked,
      modeName: MODES[this.modeId].name,
    };
    this.scene.stop('HUD');
    this.scene.launch('Results', result);
  }

  // ------------------------------------------------------------------ main loop

  update(_now: number, deltaMs: number): void {
    // Dev-only time warp for automated balance playtests.
    const warp = import.meta.env.DEV ? ((window as unknown as { __warp?: number }).__warp ?? 1) : 1;
    for (let i = 0; i < warp; i++) {
      if (!this.scene.isActive()) break;
      this.step(deltaMs);
    }
  }

  private step(deltaMs: number): void {
    const realDt = Math.min(deltaMs / 1000, 0.05);
    this.clock += realDt;
    this.juice.updateReal(realDt);
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      this.updateCamera(realDt);
      return;
    }
    this.timeScale += (this.slowTarget - this.timeScale) * (1 - Math.exp(-8 * realDt));
    const dt = realDt * this.timeScale;
    this.hurtFlash = Math.max(0, this.hurtFlash - realDt * 2);

    if (this.state === 'levelup') {
      this.stateTimer -= realDt;
      if (this.stateTimer <= 0 && !this.upgradeOpen) {
        this.upgradeOpen = true;
        this.scene.launch('Upgrade');
        this.scene.pause();
        return;
      }
    } else if (this.state === 'dying' || this.state === 'won') {
      this.stateTimer -= realDt;
      if (this.state === 'won' && !this.finaleDone && this.stateTimer < 2) {
        this.finaleDone = true;
        this.junk.explodeAll(this.player.x, this.player.y);
        this.juice.confetti(this.player.x, this.player.y, 80);
        Audio.boom();
      }
      if (this.stateTimer <= 0) {
        if (this.state === 'dying' && this.canRevive) {
          // One revive per run (after the first minute), offered as an optional rewarded ad.
          this.state = 'reviving';
          this.scene.stop('HUD');
          this.scene.launch('Revive');
        } else {
          this.finish(this.state === 'won');
        }
      }
    }

    if (this.state === 'playing') {
      const before = this.runTime;
      this.runTime += dt;
      if (before < 120 && this.runTime >= 120) this.fullHealthAt120 = this.player.hp >= this.stats.maxHp;
    }
    if (Controls.pulseQueued) {
      Controls.pulseQueued = false;
      this.tryPulse();
    }

    const alive = this.state === 'menu' || this.state === 'intro' || this.state === 'playing' || this.state === 'levelup';
    const p = this.player;
    if (this.state !== 'over' && this.state !== 'dying') {
      p.update(dt, this.mapDef.accelMult, this.state === 'menu' ? this.menuSteer() : undefined);
      this.applyBelts(dt);
    }
    if (alive) {
      this.enemies.update(dt, this.runTime, p.x, p.y, this.state === 'menu', this.belts, this.beltSpeed);
      this.enemies.repellers(this.repellers);
    }

    const f = this.frame;
    f.px = p.x;
    f.py = p.y;
    f.magnetRadius = this.stats.magnetRadius;
    f.spin = this.stats.spin;
    f.massMult = this.stats.massMult;
    f.damageMult = this.stats.damageMult * (this.frenzyTimer > 0 ? 1.3 : 1) * (this.modifier === 'glass' ? 2 : 1);
    f.counterRings = this.stats.counterRings;
    f.repellers = this.repellers;
    f.belts = this.belts;
    f.beltSpeed = this.beltSpeed;
    f.looseFriction = this.mapDef.looseFriction;
    f.hot = this.stats.molten;
    this.junk.update(dt, f);

    if (alive) {
      this.collide(dt);
      this.collideBullets();
      this.blackHoleEat(dt);
      if (this.state === 'menu' && this.junk.count > 48) this.junk.knockLoose(0.4, p.x + 1, p.y);
    }
    this.peakJunk = Math.max(this.peakJunk, this.junk.count);

    // Dust puffs while moving.
    this.dustTimer -= dt;
    if (alive && p.speedFraction > 0.6 && this.dustTimer <= 0) {
      this.dustTimer = 0.09;
      this.juice.puff(p.x - p.vx * 0.05, p.y + 12);
    }

    this.updatePickups(dt);
    this.updateChests(dt);
    this.updateVortex(dt);
    this.updateHazards(dt);
    if (this.shopPending && this.state === 'playing') this.openShop();
    if (this.frenzyTimer > 0) this.frenzyTimer -= dt;
    this.weapons.update(dt, this.state === 'playing');
    this.updateHeartbeat(realDt);
    this.juice.update(dt);
    for (const ts of this.beltSprites) ts.tilePositionX -= this.beltSpeed * dt;
    this.updateCamera(realDt);
    this.drawField();
  }

  private menuSteer(): { x: number; y: number } {
    const p = this.player;
    let best: Enemy | null = null;
    let bestD = 700;
    for (const e of this.enemies.pool.items) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    const t = this.clock;
    let tx = ARENA.width / 2 + Math.cos(t * 0.4) * 300;
    let ty = ARENA.height / 2 + Math.sin(t * 0.55) * 200;
    if (best) {
      // Circle the bot so the junk ring sweeps through it.
      const a = Math.atan2(p.y - best.y, p.x - best.x) + 0.9;
      tx = best.x + Math.cos(a) * 40;
      ty = best.y + Math.sin(a) * 40;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 120) * 0.75;
    return { x: (dx / d) * k, y: (dy / d) * k };
  }

  private applyBelts(dt: number): void {
    const p = this.player;
    for (const b of this.belts) {
      if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
        p.x += b.dx * this.beltSpeed * dt;
        p.y += b.dy * this.beltSpeed * dt;
      }
    }
  }

  private blackHoleEat(dt: number): void {
    const def = this.magnetDef;
    const p = this.player;
    if (!def.eatCost || this.state !== 'playing') return;
    p.eatTimer += dt;
    if (p.eatTimer < (def.eatInterval ?? 1.5)) return;
    p.eatTimer = 0;
    if (p.hp >= this.stats.maxHp || this.junk.count < def.eatCost) return;
    this.junk.consume(def.eatCost);
    this.heal(def.eatHeal ?? 12);
    Audio.levelUp();
    this.juice.ring(p.x, p.y, 0x9b6cff, 2, 0.4, 0.3);
  }

  private collide(dt: number): void {
    const p = this.player;
    const def = this.magnetDef;
    const stats = this.stats;
    const attached = this.junk.attached;
    const reach = this.junk.cloudRadius + (this.junk.pulsing ? this.junk.pulseRange : 0) + 16;
    const items = this.enemies.pool.items;
    const crit = JUNK.critChance + stats.critBonus;
    let hitSound = false;

    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active || e.hidden) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > reach + e.radius) {
        e.touch = 0;
        continue;
      }

      // Magnet body: bots can't walk through it. Ramming one at speed bumps it.
      const minDist = p.radius + e.radius;
      if (dist < minDist) {
        const heavy = e.kind === 'boss' || e.kind === 'crusher' || e.kind === 'tyre';
        if (!heavy) {
          e.x = p.x + (dx / dist) * minDist;
          e.y = p.y + (dy / dist) * minDist;
        }
        const toward = (p.vx * dx + p.vy * dy) / dist;
        if (!heavy && toward > 90 && p.bumpTimer <= 0) {
          p.bumpTimer = def.bumpCooldown;
          e.touch = 0;
          this.juice.sparks((p.x + e.x) / 2, (p.y + e.y) / 2, 5);
          this.juice.shake(0.12);
          p.stretch = -0.5;
          Audio.hit();
          this.showDamage(e, def.bumpDamage, false, true);
          if (this.enemies.damage(e, def.bumpDamage, p.x, p.y, def.bumpKnockback)) continue;
        } else if (!e.harmless && this.state === 'playing') {
          e.touch += dt;
          const charging = (e.kind === 'boss' && e.mode === BOSS_CHARGE) || (e.kind === 'crusher' && e.mode === CRUSHER_CHARGE);
          if (e.touch >= CONTACT_TIME || charging || e.kind === 'tyre') {
            e.touch = 0;
            const dmg = charging ? (e.def.chargeDamage ?? 25) : this.phaseDamage((e.def.dmg ?? 1) * (e.elite ? 1.3 : 1));
            this.playerHit(e.x, e.y, e.def.junkKnock ?? JUNK.knockFraction, dmg);
          }
        }
      } else if (e.touch > 0) {
        e.touch = Math.max(0, e.touch - dt);
      }

      // Reaching the junk ball: the hit lands through it (junk only reduces the damage).
      // Each robot can do this once, then again every RING.contactTime seconds.
      if (e.ringTouch > 0) e.ringTouch -= dt;
      const inRing = this.junk.count > 0 && dist >= minDist && dist < this.junk.cloudRadius + e.radius - 6;
      if (inRing && e.ringTouch <= 0 && this.isRun && !e.harmless && this.state === 'playing') {
        e.ringTouch = RING.contactTime;
        // Plowing through robots at speed takes less of the hit than standing still in a swarm.
        const moving = 1 - RING.movingReduction * p.speedFraction;
        const dmg = this.phaseDamage((e.def.dmg ?? 1) * (e.elite ? 1.3 : 1)) * RING.damageMult * moving;
        this.playerHit(e.x, e.y, RING.knock, dmg);
      }

      // Anti-Mag aura: your junk can't touch it until a Pulse shorts it out.
      if (e.kind === 'antimag' && e.auraOff <= 0) continue;
      // Crusher's junk armour after a slam: only Pulse and aimed attacks get through.
      if (e.junkImmune > 0) {
        if (Math.random() < dt * 6) this.juice.sparks(e.x, e.y - e.radius * 0.5, 2, 0xffffff);
        continue;
      }

      for (let j = 0; j < attached.length; j++) {
        if (e.hurtCd > 0) break;
        const pc = attached[j];
        if (pc.hitTimer > 0) continue;
        const jx = e.x - pc.x;
        const jy = e.y - pc.y;
        const min = e.radius + pc.radius;
        if (jx * jx + jy * jy > min * min) continue;
        pc.hitTimer = JUNK.hitCooldown;
        e.hurtCd = e.kind === 'boss' ? JUNK.bossHitCooldown : JUNK.enemyHitCooldown;
        if (e.kind === 'shield') {
          const diff = Phaser.Math.Angle.Wrap(Math.atan2(-jy, -jx) - e.facing);
          if (Math.abs(diff) < (e.def.shieldArc ?? 1)) {
            this.juice.sparks(pc.x, pc.y, 3, 0xffffff);
            Audio.clank();
            continue;
          }
        }
        const isCrit = Math.random() < crit;
        const amount = pc.damage * (isCrit ? 2 : 1) * (e.def.junkArmor ?? 1);
        e.weaponHit = false;
        this.showDamage(e, amount, isCrit);
        if (!hitSound) {
          hitSound = true;
          Audio.hit();
        }
        this.juice.sparks(pc.x, pc.y, 2);
        if (stats.burnDps > 0) {
          e.burnDps = Math.max(e.burnDps, stats.burnDps);
          e.burnTimer = stats.burnTime;
        }
        // Junk with powers: batteries zap, fuel cans explode, springs bounce robots away.
        const power = JUNK_POWER[pc.type];
        if (power === 'bounce') {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.kx += Math.cos(a) * JUNK.powers.bounce.knockback;
          e.ky += Math.sin(a) * JUNK.powers.bounce.knockback;
        } else if (power === 'shock' && pc.explodeCd <= 0) {
          pc.explodeCd = JUNK.powers.shock.cooldown;
          this.weapons.zap(pc.x, pc.y, JUNK.powers.shock.targets, JUNK.powers.shock.damage, JUNK.powers.shock.range);
        } else if (power === 'explode' && pc.explodeCd <= 0) {
          pc.explodeCd = JUNK.powers.explode.cooldown;
          this.explosions.push({ x: pc.x, y: pc.y, r: JUNK.powers.explode.radius, d: JUNK.powers.explode.damage * (1 + 0.08 * this.level), hurts: false });
        }
        if (pc.explodeCd <= 0) {
          if (stats.molten) {
            pc.explodeCd = stats.moltenCooldown;
            this.explosions.push({ x: pc.x, y: pc.y, r: stats.moltenRadius, d: stats.moltenDamage, hurts: false });
          } else if (pc.type === CAN_TYPE && stats.canRadius > 0) {
            pc.explodeCd = stats.canCooldown;
            this.explosions.push({ x: pc.x, y: pc.y, r: stats.canRadius, d: stats.canDamage, hurts: false });
          }
        }
        if (this.enemies.damage(e, amount, p.x, p.y, JUNK.hitKnockback * (def.knockbackMult ?? 1))) break;
        // From the Swarming phase, robots rip junk off the ball when they're hit.
        if (this.isRun && Math.random() < this.enemies.phase.ripChance) {
          this.junk.detach(pc, e.x, e.y);
          break;
        }
      }

      // A charging Compactor crushes the junk it rams into cubes.
      if (e.active && e.kind === 'boss' && e.mode === BOSS_CHARGE && this.junk.crushNear(e.x, e.y, e.radius + 10) > 0) {
        Audio.crush();
        this.juice.shake(0.2);
      }
    }

    this.processExplosions();
  }

  /** Explosions chain (bombers set off bombers), so only a few go off per frame; the rest wait. */
  private processExplosions(): void {
    const batch = this.explosions.splice(0, MAX_EXPLOSIONS_PER_FRAME);
    const p = this.player;
    for (const ex of batch) {
      this.juice.explosion(ex.x, ex.y, ex.r);
      Audio.boom();
      this.juice.shake(ex.hurts ? 0.25 : 0.08);
      for (const e of this.enemies.pool.items) {
        if (!e.active || e.hidden) continue;
        const d = Math.hypot(e.x - ex.x, e.y - ex.y);
        if (d < ex.r + e.radius) this.enemies.damage(e, ex.d, ex.x, ex.y, 260);
      }
      if (ex.hurts && Math.hypot(p.x - ex.x, p.y - ex.y) < ex.r + p.radius) this.playerHit(ex.x, ex.y, ENEMY_DEFS.bomber.junkKnock ?? 0.35, this.phaseDamage(2.5));
    }
  }

  queueExplosion(x: number, y: number, r: number, damage: number, hurtsPlayer: boolean): void {
    if (this.explosions.length < 40) this.explosions.push({ x, y, r, d: damage, hurts: hurtsPlayer });
  }

  /** Batch damage numbers per robot: one number every 0.25 s; crits, kills and big hits right away. */
  showDamage(e: Enemy, amount: number, crit: boolean, immediate = false): void {
    e.dmgAcc += amount;
    if (crit || immediate || e.numCd <= 0 || e.hp - amount <= 0) {
      this.juice.damageNumber(e.x, e.y - e.radius, e.dmgAcc, crit);
      e.dmgAcc = 0;
      e.numCd = 0.25;
    }
  }

  /** Spitter bolts fly over the junk: the only answer is to dodge. */
  private collideBullets(): void {
    const p = this.player;
    for (const b of this.enemies.bullets.items) {
      if (!b.active) continue;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (p.radius + 6) ** 2) {
        this.enemies.removeBullet(b);
        this.playerHit(b.x, b.y, undefined, this.phaseDamage(ENEMY_DEFS.spitter.bulletDmg ?? 0.9));
      }
    }
  }

  // ------------------------------------------------------------------ camera + field

  private updateCamera(realDt: number): void {
    const cam = this.cameras.main;
    const p = this.player;
    const follow = 1 - Math.exp(-9 * realDt);
    this.camX += (p.x - this.camX) * follow;
    this.camY += (p.y - this.camY) * follow;
    const growth = Math.min(1, (this.junk.cloudRadius - this.magnetDef.ringFirst) / 120);
    let target = this.state === 'menu' ? 0.85 : 1 - growth * 0.4;
    if (this.state === 'dying' || this.state === 'won') target *= 1.3;
    this.zoom += (target - this.zoom) * (1 - Math.exp(-2.5 * realDt));
    const zoom = this.zoom - this.juice.zoomPunch;
    cam.setZoom(zoom);
    // On the title screen, keep the attract-mode magnet out from behind the logo and buttons.
    const menuShiftX = this.state === 'menu' && cam.width > cam.height ? (cam.width * 0.3) / zoom : 0;
    const menuShiftY = this.state === 'menu' && cam.width <= cam.height ? -(cam.height * 0.3) / zoom : 0;
    cam.centerOn(this.camX + menuShiftX + this.juice.shakeX / zoom, this.camY + menuShiftY + this.juice.shakeY / zoom);
  }

  private drawField(): void {
    const g = this.field;
    g.clear();
    if (this.state === 'over' || this.state === 'dying') return;
    const p = this.player;
    const r = this.stats.magnetRadius;
    // Cyan dashed field circle, slowly turning, with a ripple running outward.
    const dashes = 36;
    const step = (Math.PI * 2) / dashes;
    const off = this.clock * 0.4;
    g.lineStyle(3, PAL.cyan, 0.45);
    for (let i = 0; i < dashes; i++) {
      g.beginPath();
      g.arc(p.x, p.y, r, off + i * step, off + i * step + step * 0.5);
      g.strokePath();
    }
    const ripple = (this.clock * 0.7) % 1;
    g.lineStyle(2, PAL.cyan, (1 - ripple) * 0.3);
    g.strokeCircle(p.x, p.y, this.junk.cloudRadius + (r - this.junk.cloudRadius) * ripple);

    if (!this.juice.low) {
      g.lineStyle(2, PAL.cyan, 0.7);
      this.junk.forEachPulled((pc) => {
        const dx = p.x - pc.x;
        const dy = p.y - pc.y;
        const d = Math.hypot(dx, dy) || 1;
        g.lineBetween(pc.x, pc.y, pc.x - (dx / d) * 18, pc.y - (dy / d) * 18);
      });
    }

    // Telegraphs and beams, so every new robot's attack can be read and dodged.
    const flash = 0.25 + Math.abs(Math.sin(this.clock * 14)) * 0.35;
    for (const e of this.enemies.pool.items) {
      if (!e.active) continue;
      const d = e.def;
      if (e.mode === MODE_TELEGRAPH && (e.kind === 'burrower' || e.kind === 'press' || e.kind === 'crusher')) {
        const x = e.kind === 'burrower' ? e.tx : e.x;
        const y = e.kind === 'burrower' ? e.ty : e.y;
        const r = d.emergeRadius ?? d.slamRadius ?? d.stompRadius ?? 100;
        g.fillStyle(PAL.pink, flash * 0.35);
        g.fillCircle(x, y, r);
        g.lineStyle(4, PAL.pink, 0.9);
        g.strokeCircle(x, y, r);
      } else if (e.kind === 'bomber' && e.fuse > 0) {
        g.lineStyle(3, PAL.pink, flash + 0.3);
        g.strokeCircle(e.x, e.y, d.blastRadius ?? 115);
      } else if ((e.kind === 'magnetbot' || e.kind === 'magnetron') && e.modeTimer > 0 && e.mode === 0) {
        g.lineStyle(5, PAL.pink, 0.8);
        g.lineBetween(e.x, e.y, p.x, p.y);
        g.lineStyle(2, 0xffffff, 0.8);
        g.lineBetween(e.x, e.y, p.x, p.y);
      } else if (e.kind === 'repair' && e.healing) {
        const hr = d.healRadius ?? 150;
        let lines = 0;
        g.lineStyle(3, PAL.lime, 0.55 + flash * 0.4);
        for (const o of this.enemies.pool.items) {
          if (lines >= 4) break;
          if (!o.active || o === e || o.hp >= o.maxHp || o.hidden) continue;
          if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > hr * hr) continue;
          g.lineBetween(e.x, e.y, o.x, o.y);
          lines++;
        }
      }
    }

    const cr = this.enemies.crusher;
    if (cr?.active && cr.mode === CRUSHER_AIM) {
      g.lineStyle(cr.radius * 1.5, PAL.red, flash * 0.6);
      g.lineBetween(cr.x, cr.y, cr.x + cr.cdx * 700, cr.y + cr.cdy * 700);
    }

    const boss = this.enemies.boss;
    if (boss?.active) {
      if (boss.mode === BOSS_TELEGRAPH) {
        g.lineStyle(boss.radius * 1.6, PAL.pink, flash * 0.5);
        g.lineBetween(boss.x, boss.y, boss.x + boss.cdx * 900, boss.y + boss.cdy * 900);
      } else if (boss.mode === BOSS_SLAM_TELEGRAPH) {
        const cr = boss.def.compactRadius ?? 220;
        g.fillStyle(PAL.pink, flash * 0.35);
        g.fillCircle(boss.x, boss.y, cr);
        g.lineStyle(4, PAL.pink, 0.9);
        g.strokeCircle(boss.x, boss.y, cr);
      }
    }
  }

  /** Coins earned so far this run (shown in the HUD). */
  get runCoins(): number {
    const eco = JUNK.economy;
    return Math.round(this.scrapKills * eco.coinsPerScrap) + Math.floor(this.junk.overflowScrap / eco.overflowPerCoin);
  }

  get bossActive(): Enemy | null {
    return this.enemies.bigOne;
  }


  get bossAt(): number {
    return WAVES.bossAt;
  }
}
