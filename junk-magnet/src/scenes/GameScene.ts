import Phaser from 'phaser';
import { ARENA, DEPTH, PAL } from '../config';
import enemyData from '../data/enemies.json';
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
  EnemySpawner,
  type Enemy,
  type EnemyHost,
} from '../systems/EnemySpawner';
import { Juice } from '../systems/Juice';
import { CAN_TYPE, JUNK, JunkSystem, type Belt, type JunkFrame, type Repeller } from '../systems/JunkSystem';
import { Meta } from '../systems/MetaSave';
import { Player, type MagnetDef } from '../systems/Player';
import { makeFloor } from '../systems/Textures';
import { UpgradeSystem, cardById, xpForLevel, type CardDef, type PlayerStats } from '../systems/UpgradeSystem';

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
}

export const MAGNETS = magnetsData as Record<string, MagnetDef>;
export const MAPS = mapsData as Record<string, MapDef>;
const WAVES = enemyData.waves;
const MAX_EXPLOSIONS_PER_FRAME = 6;

type State = 'menu' | 'intro' | 'playing' | 'levelup' | 'dying' | 'won' | 'over';

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
  bossWarningAt = -1;
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
  private readonly explosions: { x: number; y: number; r: number; d: number }[] = [];
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
    this.bossWarningAt = -1;
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

    this.junk.onAttach = (count) => {
      if (count < 0) {
        Audio.coin();
        return;
      }
      Audio.clink();
      if (this.isRun && count >= this.nextDoubling) {
        this.nextDoubling *= 2;
        this.juice.punchZoom(0.09);
      }
    };

    this.junk.onShatter = (x, y) => this.juice.sparks(x, y, 2, 0xa7b0ba);

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
      kb.on('keydown-P', () => this.openPause());
    }
    const onBlur = () => this.openPause();
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
      },
    });
  }

  // ------------------------------------------------------------------ EnemyHost

  spawnDistance(): number {
    const cam = this.cameras.main;
    return Math.hypot(cam.width, cam.height) / 2 / cam.zoom + 60;
  }

  onEnemyKilled(e: Enemy): void {
    const elite = !!e.def.elite;
    const size = e.radius / 15;
    this.juice.pop(e.x, e.y, e.kind === 'boss' ? PAL.pink : PAL.lime, size);
    Audio.pop(elite);
    if (!this.isRun) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.junk.spawnLoose(e.x, e.y, Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3));
      return;
    }
    this.kills++;
    this.scrapKills += e.def.scrap;
    const first = this.kills === 1;
    const drops = first ? 3 : this.lootRng.int(e.def.drops[0], e.def.drops[1]);
    for (let i = 0; i < drops; i++) {
      this.junk.spawnLoose(e.x, e.y, first ? 0 : this.junk.rollType(this.lootRng), e.kind === 'boss' ? 500 : undefined);
    }
    if (elite) {
      this.hitStop = Math.max(this.hitStop, 0.05);
      this.juice.shake(0.15);
    }
    if (e.kind === 'boss') {
      this.win(e);
      return;
    }
    this.gainXp(e.def.xp);
  }

  onBossWarning(): void {
    this.bossWarningAt = this.runTime;
    Audio.alarm();
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
      this.playerHit(e.x, e.y, e.def.junkKnock ?? 0.3);
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
    return this.upgrades.roll(3);
  }

  /** Called by the Upgrade overlay. Returns true if another level-up is waiting. */
  chooseCard(id: string): boolean {
    const card = cardById(id);
    if (id === 'scrapPile') this.scrapKills += (card.value as number) / JUNK.economy.coinsPerScrap;
    else if (id === 'patchUp') this.player.hearts = Math.min(this.stats.maxHearts, this.player.hearts + 1);
    else {
      this.upgrades.take(id);
      this.stats = this.upgrades.stats(this.magnetDef);
      this.player.stats = this.stats;
      if (id === 'spareHeart') this.player.hearts = this.stats.maxHearts;
    }
    this.pendingLevels--;
    return this.pendingLevels > 0;
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

  openPause(): void {
    if (this.state !== 'playing' || !this.scene.isActive()) return;
    CrazySDK.gameplayStop();
    this.scene.launch('Pause');
    this.scene.pause();
  }

  resumeFromPause(): void {
    this.scene.stop('Pause');
    this.scene.resume();
    CrazySDK.gameplayStart();
  }

  // ------------------------------------------------------------------ combat

  tryPulse(): void {
    const p = this.player;
    if (this.state !== 'playing' || p.pulseCd > 0) return;
    p.pulseCd = this.stats.pulseCooldown;
    p.stretch = 1;
    this.pulseUsed = true;
    const range = this.stats.pulseRange;
    this.junk.startPulse(JUNK.pulse.duration, range);
    const reach = range + this.junk.cloudRadius + 30;
    const dmg = JUNK.pulse.shockDamage * (1 + 0.08 * this.level);
    for (const e of this.enemies.pool.items) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > reach + e.radius) continue;
      const falloff = 1 - (d / (reach + e.radius)) * 0.5;
      if (e.kind === 'antimag') e.auraOff = e.def.shortOut ?? 3.5;
      const amount = dmg * (e.kind === 'antimag' ? 2 : 1);
      this.showDamage(e, amount, false, true);
      this.enemies.damage(e, amount, p.x, p.y, JUNK.pulse.shockKnockback * falloff);
    }
    if (this.stats.polarity) this.junk.pullAll();
    Audio.pulse();
    this.juice.shake(0.25);
    this.juice.ring(p.x, p.y, PAL.cyan, 0.3, 0.45, reach / 64);
    this.juice.ring(p.x, p.y, 0xffffff, 0.2, 0.3, reach / 90);
  }

  private playerHit(fromX: number, fromY: number, fraction: number = JUNK.knockFraction): void {
    const p = this.player;
    if (this.state !== 'playing' || p.invuln > 0) return;
    p.invuln = JUNK.invulnTime;
    this.hitsTaken++;
    if (this.stats.scrapShield && this.shieldWave !== this.enemies.wave) {
      this.shieldWave = this.enemies.wave;
      this.juice.ring(p.x, p.y, PAL.cyan, 0.5, 0.35, 1.6);
      Audio.clank();
      return;
    }
    const angle = Math.atan2(p.y - fromY, p.x - fromX);
    if (this.junk.count > 0) {
      this.junk.knockLoose(fraction, fromX, fromY, JUNK.shatterFraction);
      Audio.hurt();
      this.juice.shake(0.35);
      this.juice.sparks(p.x, p.y, 10, 0xffd27a, angle);
      this.hitStop = Math.max(this.hitStop, 0.05);
      return;
    }
    p.hearts--;
    this.hurtFlash = 1;
    Audio.heartLost();
    this.juice.shake(0.55);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.juice.sparks(p.x, p.y, 12, PAL.red, angle);
    if (p.hearts <= 0) this.die();
  }

  private die(): void {
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

  private finish(win: boolean): void {
    this.state = 'over';
    this.slowTarget = 1;
    CrazySDK.gameplayStop();
    Audio.music(null);
    const save = Meta.data;
    const eco = JUNK.economy;
    const scrapJunk = Math.floor(this.peakJunk / eco.junkPerCoin);
    const scrapWin = win ? eco.winBonus : 0;
    const coinsKills = Math.round(this.scrapKills * eco.coinsPerScrap);
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
    if (win) save.best.wins++;
    if (this.daily) {
      const key = todayKey();
      if (save.daily.key !== key) save.daily = { key, best: 0, runs: 0 };
      save.daily.runs++;
      save.daily.best = Math.max(save.daily.best, score);
    }
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
      if (this.stateTimer <= 0) this.finish(this.state === 'won');
    }

    if (this.state === 'playing') this.runTime += dt;
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
    f.damageMult = this.stats.damageMult;
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
    if (p.hearts >= this.stats.maxHearts || this.junk.count < def.eatCost) return;
    this.junk.consume(def.eatCost);
    p.hearts++;
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
    const crit = JUNK.critChance;
    let hitSound = false;

    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
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
        if (e.kind !== 'boss') {
          e.x = p.x + (dx / dist) * minDist;
          e.y = p.y + (dy / dist) * minDist;
        }
        const toward = (p.vx * dx + p.vy * dy) / dist;
        if (e.kind !== 'boss' && toward > 90 && p.bumpTimer <= 0) {
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
          if (e.touch >= CONTACT_TIME || (e.kind === 'boss' && e.mode === BOSS_CHARGE)) {
            e.touch = 0;
            this.playerHit(e.x, e.y, e.kind === 'boss' ? (e.def.junkKnock ?? 0.3) : JUNK.knockFraction);
          }
        }
      } else if (e.touch > 0) {
        e.touch = Math.max(0, e.touch - dt);
      }

      // Anti-Mag aura: your junk can't touch it until a Pulse shorts it out.
      if (e.kind === 'antimag' && e.auraOff <= 0) continue;

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
        const amount = pc.damage * (isCrit ? 2 : 1);
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
        if (pc.explodeCd <= 0) {
          if (stats.molten) {
            pc.explodeCd = stats.moltenCooldown;
            this.explosions.push({ x: pc.x, y: pc.y, r: stats.moltenRadius, d: stats.moltenDamage });
          } else if (pc.type === CAN_TYPE && stats.canRadius > 0) {
            pc.explodeCd = stats.canCooldown;
            this.explosions.push({ x: pc.x, y: pc.y, r: stats.canRadius, d: stats.canDamage });
          }
        }
        if (this.enemies.damage(e, amount, p.x, p.y, JUNK.hitKnockback)) break;
      }

      // A charging Compactor crushes the junk it rams into cubes.
      if (e.active && e.kind === 'boss' && e.mode === BOSS_CHARGE && this.junk.crushNear(e.x, e.y, e.radius + 10) > 0) {
        Audio.crush();
        this.juice.shake(0.2);
      }
    }

    let n = 0;
    for (const ex of this.explosions) {
      if (n++ >= MAX_EXPLOSIONS_PER_FRAME) break;
      this.juice.explosion(ex.x, ex.y, ex.r);
      Audio.boom();
      this.juice.shake(0.08);
      for (const e of items) {
        if (!e.active) continue;
        const d = Math.hypot(e.x - ex.x, e.y - ex.y);
        if (d < ex.r + e.radius) this.enemies.damage(e, ex.d, ex.x, ex.y, 260);
      }
    }
    this.explosions.length = 0;
  }

  /** Batch damage numbers per robot: one number every 0.25 s; crits, kills and big hits right away. */
  private showDamage(e: Enemy, amount: number, crit: boolean, immediate = false): void {
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
        this.playerHit(b.x, b.y);
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
    const growth = Math.min(1, (this.junk.cloudRadius - this.magnetDef.ringFirst) / 100);
    let target = this.state === 'menu' ? 0.85 : 1 - growth * 0.36;
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

    const boss = this.enemies.boss;
    if (boss?.active) {
      const flash = 0.25 + Math.abs(Math.sin(this.clock * 14)) * 0.35;
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
    return this.enemies.boss?.active ? this.enemies.boss : null;
  }

  get bossAt(): number {
    return WAVES.bossAt;
  }
}
