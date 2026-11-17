import Phaser from 'phaser';
import { ARENA, hex, makeCircleTexture } from '../config';

export interface MagnetDef {
  name: string;
  color: string;
  radius: number;
  speed: number;
  accel: number;
  magnetRadius: number;
  spin: number;
  bumpDamage: number;
  bumpCooldown: number;
  bumpKnockback: number;
}

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  bumpTimer = 0;
  hasMoved = false;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene, readonly def: MagnetDef, x: number, y: number) {
    this.x = x;
    this.y = y;
    makeCircleTexture(scene, 'player', def.radius);
    this.sprite = scene.add.image(x, y, 'player').setTint(hex(def.color)).setDepth(40);
    // WASD + arrows, plus Z/Q so AZERTY keyboards work without a setting.
    this.keys = scene.input.keyboard!.addKeys('W,A,S,D,Z,Q,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
  }

  update(dt: number): void {
    const k = this.keys;
    let ix = 0;
    let iy = 0;
    if (k.A.isDown || k.Q.isDown || k.LEFT.isDown) ix -= 1;
    if (k.D.isDown || k.RIGHT.isDown) ix += 1;
    if (k.W.isDown || k.Z.isDown || k.UP.isDown) iy -= 1;
    if (k.S.isDown || k.DOWN.isDown) iy += 1;
    if (ix !== 0 && iy !== 0) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    if (ix !== 0 || iy !== 0) this.hasMoved = true;

    // Frame-rate independent easing toward the target velocity.
    const blend = 1 - Math.exp(-this.def.accel * dt);
    this.vx += (ix * this.def.speed - this.vx) * blend;
    this.vy += (iy * this.def.speed - this.vy) * blend;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const r = this.def.radius;
    if (this.x < r) this.x = r;
    else if (this.x > ARENA.width - r) this.x = ARENA.width - r;
    if (this.y < r) this.y = r;
    else if (this.y > ARENA.height - r) this.y = ARENA.height - r;

    if (this.bumpTimer > 0) this.bumpTimer -= dt;
    this.sprite.setPosition(this.x, this.y);
  }
}
