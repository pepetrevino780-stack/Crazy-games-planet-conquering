import Phaser from 'phaser';
import { hex, makeCircleTexture } from '../config';
import junkData from '../data/junk.json';
import { Pool } from './Pool';

const LOOSE = 0;
const PULLED = 1;
const ATTACHED = 2;
const TAU = Math.PI * 2;

export interface JunkPiece {
  active: boolean;
  sprite: Phaser.GameObjects.Image;
  state: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  age: number;
  pullSpeed: number;
  /** Contact damage right now: mass × orbital speed (set while attached). */
  damage: number;
  hitTimer: number;
}

const types = junkData.types;
const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);

export class JunkSystem {
  readonly attached: JunkPiece[] = [];
  looseCount = 0;
  scrap = 0;
  /** Radius of the outermost occupied ring, for broad-phase checks and camera zoom. */
  cloudRadius = junkData.ring.firstRadius;
  private ringAngle = 0;
  private readonly pool: Pool<JunkPiece>;
  private readonly ringCaps: number[] = [];

  constructor(scene: Phaser.Scene) {
    for (const t of types) makeCircleTexture(scene, `junk-${t.id}`, t.radius);
    this.pool = new Pool(junkData.maxAttached + junkData.maxLoose, () => ({
      active: false,
      sprite: scene.add.image(0, 0, `junk-${types[0].id}`).setVisible(false),
      state: LOOSE,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      mass: 1,
      radius: 5,
      age: 0,
      pullSpeed: 0,
      damage: 0,
      hitTimer: 0,
    }));
    const { firstRadius, spacing, pieceSpacing } = junkData.ring;
    let capacity = 0;
    for (let ring = 0; capacity < junkData.maxAttached; ring++) {
      const cap = Math.floor((TAU * (firstRadius + ring * spacing)) / pieceSpacing);
      this.ringCaps.push(cap);
      capacity += cap;
    }
  }

  /** Drop one piece at a point with a little outward burst. */
  spawnLoose(x: number, y: number, forceBolt = false): void {
    if (this.looseCount >= junkData.maxLoose) {
      this.scrap++; // over the loose cap: straight to scrap coins
      return;
    }
    const p = this.pool.obtain();
    if (!p) {
      this.scrap++;
      return;
    }
    let type = types[0];
    if (!forceBolt) {
      let roll = Math.random() * totalWeight;
      for (const t of types) {
        roll -= t.weight;
        if (roll < 0) {
          type = t;
          break;
        }
      }
    }
    const angle = Math.random() * TAU;
    const speed = 90 + Math.random() * 150;
    p.state = LOOSE;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.mass = type.mass;
    p.radius = type.radius;
    p.age = 0;
    p.hitTimer = 0;
    p.sprite
      .setTexture(`junk-${type.id}`)
      .setTint(hex(type.color))
      .setPosition(x, y)
      .setDepth(10)
      .setVisible(true);
    this.looseCount++;
  }

  update(dt: number, px: number, py: number, magnetRadius: number, spin: number): void {
    const items = this.pool.items;
    const friction = Math.exp(-3.5 * dt);
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active || p.state === ATTACHED) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (p.state === LOOSE) {
        p.age += dt;
        p.vx *= friction;
        p.vy *= friction;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Short delay so the burst reads before the magnet grabs it.
        if (p.age > 0.22 && dist < magnetRadius) {
          p.state = PULLED;
          p.pullSpeed = 140;
        }
      } else {
        p.pullSpeed = Math.min(p.pullSpeed + 1500 * dt, 850);
        const step = p.pullSpeed * dt;
        if (dist <= this.cloudRadius + step) {
          this.attach(p);
          continue;
        }
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
      p.sprite.setPosition(p.x, p.y);
    }

    // Attached junk: pure maths (angle + radius), eased so pieces settle with a little bounce.
    this.ringAngle = (this.ringAngle + spin * dt) % TAU;
    const { firstRadius, spacing } = junkData.ring;
    const ease = 1 - Math.exp(-16 * dt);
    const count = this.attached.length;
    let index = 0;
    let radius = firstRadius;
    for (let ring = 0; index < count; ring++) {
      const inRing = Math.min(this.ringCaps[ring], count - index);
      radius = firstRadius + ring * spacing;
      const base = this.ringAngle + ring * 0.7;
      const stepAngle = TAU / inRing;
      const speed = spin * radius;
      for (let j = 0; j < inRing; j++) {
        const p = this.attached[index + j];
        const a = base + j * stepAngle;
        p.x += (px + Math.cos(a) * radius - p.x) * ease;
        p.y += (py + Math.sin(a) * radius - p.y) * ease;
        p.damage = p.mass * speed * junkData.damageScale;
        if (p.hitTimer > 0) p.hitTimer -= dt;
        p.sprite.setPosition(p.x, p.y);
      }
      index += inRing;
    }
    this.cloudRadius = radius;
  }

  private attach(p: JunkPiece): void {
    this.looseCount--;
    if (this.attached.length >= junkData.maxAttached) {
      this.scrap++; // over the attached cap: converts to scrap coins
      p.sprite.setVisible(false);
      this.pool.release(p);
      return;
    }
    p.state = ATTACHED;
    p.hitTimer = 0;
    p.sprite.setDepth(30);
    this.attached.push(p);
  }
}

export const JUNK_HIT_COOLDOWN = junkData.hitCooldown;
export const JUNK_HIT_KNOCKBACK = junkData.hitKnockback;
