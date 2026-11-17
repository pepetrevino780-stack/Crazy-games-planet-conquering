import Phaser from 'phaser';
import { ARENA, DEPTH } from '../config';
import { Controls } from './Controls';
import { TS } from './Textures';
import type { PlayerStats } from './UpgradeSystem';

export interface MagnetDef {
  name: string;
  desc: string;
  price: number;
  texture: string;
  radius: number;
  speed: number;
  accel: number;
  magnetRadius: number;
  spin: number;
  layout: string;
  ringFirst: number;
  ringSpacing: number;
  pulseCooldown: number;
  pulseRange: number;
  hearts: number;
  bumpDamage: number;
  bumpCooldown: number;
  bumpKnockback: number;
  eatCost?: number;
  eatInterval?: number;
}

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hearts: number;
  invuln = 0;
  pulseCd = 0;
  bumpTimer = 0;
  eatTimer = 0;
  hasMoved = false;
  /** False until the magnet has dropped in. */
  canMove = false;
  stretch = 0;
  readonly radius: number;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> | null;

  constructor(
    scene: Phaser.Scene,
    readonly def: MagnetDef,
    public stats: PlayerStats,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.radius = def.radius;
    this.hearts = stats.maxHearts;
    this.sprite = scene.add.image(x, y, def.texture).setScale(TS).setDepth(DEPTH.player);
    // WASD + arrows, plus Z/Q so AZERTY keyboards work without a setting.
    this.keys = scene.input.keyboard
      ? (scene.input.keyboard.addKeys('W,A,S,D,Z,Q,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>)
      : null;
  }

  private readInput(): { ix: number; iy: number } {
    let ix = 0;
    let iy = 0;
    const k = this.keys;
    if (k) {
      if (k.A.isDown || k.Q.isDown || k.LEFT.isDown) ix -= 1;
      if (k.D.isDown || k.RIGHT.isDown) ix += 1;
      if (k.W.isDown || k.Z.isDown || k.UP.isDown) iy -= 1;
      if (k.S.isDown || k.DOWN.isDown) iy += 1;
    }
    if (Controls.touchActive) {
      ix += Controls.touchX;
      iy += Controls.touchY;
    }
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    return { ix, iy };
  }

  /** `steer` overrides input (used by the menu's attract-mode magnet). */
  update(dt: number, accelMult: number, steer?: { x: number; y: number }): void {
    let { ix, iy } = steer ? { ix: steer.x, iy: steer.y } : this.readInput();
    if (!this.canMove) ix = iy = 0;
    if (!steer && (ix !== 0 || iy !== 0)) this.hasMoved = true;

    // Frame-rate independent easing toward the target velocity.
    const blend = 1 - Math.exp(-this.stats.accel * accelMult * dt);
    this.vx += (ix * this.stats.speed - this.vx) * blend;
    this.vy += (iy * this.stats.speed - this.vy) * blend;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const min = ARENA.margin + this.radius;
    if (this.x < min) (this.x = min), (this.vx = Math.abs(this.vx) * 0.3);
    else if (this.x > ARENA.width - min) (this.x = ARENA.width - min), (this.vx = -Math.abs(this.vx) * 0.3);
    if (this.y < min) (this.y = min), (this.vy = Math.abs(this.vy) * 0.3);
    else if (this.y > ARENA.height - min) (this.y = ARENA.height - min), (this.vy = -Math.abs(this.vy) * 0.3);

    if (this.bumpTimer > 0) this.bumpTimer -= dt;
    if (this.pulseCd > 0) this.pulseCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    this.stretch *= Math.exp(-6 * dt);
    this.draw();
  }

  get speedFraction(): number {
    return Math.min(1, Math.hypot(this.vx, this.vy) / this.stats.speed);
  }

  draw(): void {
    // Squash while moving, stretch when Pulsing.
    const f = this.speedFraction;
    const s = this.stretch;
    if (!this.canMove) return;
    this.sprite
      .setPosition(this.x, this.y)
      .setScale(TS * (1 + 0.14 * f - 0.22 * s), TS * (1 - 0.1 * f + 0.38 * s))
      .setRotation((this.vx / this.stats.speed) * 0.18)
      .setAlpha(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0 ? 0.35 : 1);
  }
}
