import Phaser from 'phaser';
import { MAX_ENEMIES, hex, makeCircleTexture } from '../config';
import enemyData from '../data/enemies.json';
import { Pool } from './Pool';

export interface Enemy {
  active: boolean;
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  hp: number;
  speed: number;
  radius: number;
  /** Knockback velocity, decays quickly. */
  kx: number;
  ky: number;
  flash: number;
}

const tin = enemyData.tinBot;
const TAU = Math.PI * 2;

/**
 * Milestone 1 spawner: the scripted opening from the spec (one slow bot, then six),
 * followed by a steady ramp. The wave budget replaces the ramp in milestone 2.
 */
export class EnemySpawner {
  readonly pool: Pool<Enemy>;
  activeCount = 0;
  kills = 0;
  onKill: (enemy: Enemy, index: number) => void = () => {};
  private introDone = false;
  private packDone = false;
  private spawnTimer = 0;
  private readonly tint = hex(tin.color);

  constructor(scene: Phaser.Scene) {
    makeCircleTexture(scene, 'tinBot', tin.radius);
    this.pool = new Pool(MAX_ENEMIES, () => ({
      active: false,
      sprite: scene.add.image(0, 0, 'tinBot').setDepth(20).setVisible(false),
      x: 0,
      y: 0,
      hp: 0,
      speed: 0,
      radius: tin.radius,
      kx: 0,
      ky: 0,
      flash: 0,
    }));
  }

  spawn(x: number, y: number, speedScale = 1): void {
    const e = this.pool.obtain();
    if (!e) return;
    e.x = x;
    e.y = y;
    e.hp = tin.hp;
    e.speed = tin.speed * speedScale * (0.9 + Math.random() * 0.2);
    e.kx = 0;
    e.ky = 0;
    e.flash = 0;
    e.sprite.setTint(this.tint).setPosition(x, y).setVisible(true);
    this.activeCount++;
  }

  /** Returns true if the hit killed the enemy. */
  damage(e: Enemy, amount: number, fromX: number, fromY: number, knockback: number): boolean {
    e.hp -= amount;
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    e.kx = (dx / dist) * knockback;
    e.ky = (dy / dist) * knockback;
    if (e.hp <= 0) {
      const index = this.kills++;
      this.activeCount--;
      e.sprite.setVisible(false);
      this.pool.release(e);
      this.onKill(e, index);
      return true;
    }
    e.flash = 0.06;
    e.sprite.setTintFill(0xffffff);
    return false;
  }

  update(dt: number, time: number, px: number, py: number, spawnDistance: number): void {
    this.runSpawns(dt, time, px, py, spawnDistance);

    const items = this.pool.items;
    const decay = Math.exp(-7 * dt);
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += ((dx / dist) * e.speed + e.kx) * dt;
      e.y += ((dy / dist) * e.speed + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0) e.sprite.setTint(this.tint);
      }
      // Keep bots from stacking into one blob.
      for (let j = i + 1; j < items.length; j++) {
        const o = items[j];
        if (!o.active) continue;
        const sx = o.x - e.x;
        const sy = o.y - e.y;
        const min = e.radius + o.radius;
        const d2 = sx * sx + sy * sy;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = sx / d;
        const ny = sy / d;
        e.x -= nx * push;
        e.y -= ny * push;
        o.x += nx * push;
        o.y += ny * push;
      }
      e.sprite.setPosition(e.x, e.y);
    }
  }

  private runSpawns(dt: number, time: number, px: number, py: number, spawnDistance: number): void {
    if (!this.introDone && time >= 3) {
      this.introDone = true;
      this.spawn(px + 430, py, 0.65); // one slow bot walks in from the side, in view
    }
    if (!this.packDone && time >= 10) {
      this.packDone = true;
      const start = Math.random() * TAU;
      for (let i = 0; i < 6; i++) this.spawnAround(px, py, spawnDistance, start + (i * TAU) / 6);
    }
    if (time < 14) return;
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0) {
      // 1 bot/s at the start, ramping to ~7/s by five minutes.
      const ramp = Math.min((time - 14) / 286, 1);
      this.spawnTimer += 1 / (1 + ramp * 6);
      this.spawnAround(px, py, spawnDistance, Math.random() * TAU);
    }
  }

  private spawnAround(px: number, py: number, distance: number, angle: number): void {
    this.spawn(px + Math.cos(angle) * distance, py + Math.sin(angle) * distance);
  }
}

export const TIN_DROPS = { min: tin.dropMin, max: tin.dropMax };
