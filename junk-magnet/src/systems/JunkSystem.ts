import Phaser from 'phaser';
import { ARENA, DEPTH } from '../config';
import junkData from '../data/junk.json';
import type { Rng } from '../rng';
import { Pool } from './Pool';
import { TS } from './Textures';

export const LOOSE = 0;
export const PULLED = 1;
export const ATTACHED = 2;
export const FLUNG = 3;
const TAU = Math.PI * 2;

export const CAN_TYPE = junkData.types.findIndex((t) => t.id === 'can');
const CUBE_TYPE = junkData.types.findIndex((t) => t.id === 'cube');

export interface JunkPiece {
  active: boolean;
  sprite: Phaser.GameObjects.Image;
  state: number;
  type: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  age: number;
  noPickup: number;
  pullSpeed: number;
  rot: number;
  spin: number;
  bounce: number;
  /** Contact damage right now: mass × speed (set while attached). */
  damage: number;
  hitTimer: number;
  explodeCd: number;
}

export interface Repeller {
  x: number;
  y: number;
  r: number;
}

export interface Belt {
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
}

export interface JunkFrame {
  px: number;
  py: number;
  magnetRadius: number;
  spin: number;
  massMult: number;
  damageMult: number;
  counterRings: boolean;
  repellers: Repeller[];
  belts: Belt[];
  beltSpeed: number;
  looseFriction: number;
  /** Molten Core: pieces glow. */
  hot: boolean;
}

const types = junkData.types;
const dropWeight = types.reduce((sum, t) => sum + t.weight, 0);

export class JunkSystem {
  readonly attached: JunkPiece[] = [];
  looseCount = 0;
  /** Overflow junk converted to scrap coins this run. */
  overflowScrap = 0;
  /** How many pieces can stick right now. Rises with level; extra junk upgrades the lightest piece. */
  cap = junkData.capStart;
  /** Pieces upgraded to a heavier type this run. */
  upgradedPieces = 0;
  onUpgrade: (x: number, y: number) => void = () => {};
  /** Radius of the outermost occupied ring, for broad-phase checks and camera zoom. */
  cloudRadius: number;
  /** Seconds left of the current Pulse, or 0. */
  pulseT = 0;
  pulseRange = 150;
  onAttach: (count: number) => void = () => {};
  onShatter: (x: number, y: number) => void = () => {};
  private angA = 0;
  private angB = 0;
  private readonly pool: Pool<JunkPiece>;
  private readonly ringCaps: number[] = [];
  private hotTinted = false;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: string,
    private readonly ringFirst: number,
    private readonly ringSpacing: number,
  ) {
    this.cloudRadius = ringFirst;
    this.pool = new Pool(junkData.maxAttached + junkData.maxLoose, () => ({
      active: false,
      sprite: scene.add.image(0, 0, 'junk-bolt').setVisible(false).setScale(TS),
      state: LOOSE,
      type: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      mass: 1,
      radius: 5,
      age: 0,
      noPickup: 0,
      pullSpeed: 0,
      rot: 0,
      spin: 0,
      bounce: 0,
      damage: 0,
      hitTimer: 0,
      explodeCd: 0,
    }));
    let capacity = 0;
    for (let ring = 0; capacity < junkData.maxAttached; ring++) {
      const cap = Math.floor((TAU * (ringFirst + ring * ringSpacing)) / junkData.pieceSpacing);
      this.ringCaps.push(cap);
      capacity += cap;
    }
  }

  get count(): number {
    return this.attached.length;
  }

  /** Lucky Find multiplies how often gold TVs drop. */
  tvMult = 1;

  rollType(rng: Rng): number {
    const tv = types.findIndex((t) => t.id === 'tv');
    const total = dropWeight + types[tv].weight * (this.tvMult - 1);
    let roll = rng.next() * total;
    for (let i = 0; i < types.length; i++) {
      roll -= types[i].weight * (i === tv ? this.tvMult : 1);
      if (roll < 0) return i;
    }
    return 0;
  }

  /** Drop one piece at a point with a little outward burst. */
  spawnLoose(x: number, y: number, type: number, speed = 90 + Math.random() * 150, angle = Math.random() * TAU): JunkPiece | null {
    if (this.looseCount >= junkData.maxLoose) {
      this.overflowScrap++;
      return null;
    }
    const p = this.pool.obtain();
    if (!p) {
      this.overflowScrap++;
      return null;
    }
    const def = types[type];
    p.state = LOOSE;
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.mass = def.mass;
    p.radius = def.radius;
    p.age = 0;
    p.noPickup = 0.22;
    p.hitTimer = 0;
    p.explodeCd = 0;
    p.rot = Math.random() * TAU;
    p.spin = (Math.random() - 0.5) * 16;
    p.bounce = 0;
    p.sprite
      .setTexture(`junk-${def.id}`)
      .clearTint()
      .setPosition(x, y)
      .setRotation(p.rot)
      .setScale(TS)
      .setAlpha(1)
      .setDepth(DEPTH.loose)
      .setVisible(true);
    this.looseCount++;
    return p;
  }

  startPulse(duration: number, range: number): void {
    this.pulseT = duration;
    this.pulseRange = range;
    for (const p of this.attached) p.hitTimer = 0;
  }

  /** Extra outward distance during a Pulse: shoot out fast, then snap back. */
  private pulseExtra(duration: number): number {
    if (this.pulseT <= 0) return 0;
    const t = 1 - this.pulseT / duration;
    if (t < 0.35) {
      const k = t / 0.35;
      return this.pulseRange * (1 - (1 - k) * (1 - k));
    }
    const k = (t - 0.35) / 0.65;
    return this.pulseRange * (1 - k * k * k);
  }

  get pulsing(): boolean {
    return this.pulseT > 0;
  }

  /** Knock a fraction of the attached junk loose (outermost first). Returns how many. */
  knockLoose(fraction: number, fromX: number, fromY: number, shatter = 0): number {
    const n = Math.min(this.attached.length, Math.max(1, Math.ceil(this.attached.length * fraction)));
    for (let i = 0; i < n; i++) {
      const p = this.attached.pop()!;
      if (Math.random() < shatter) {
        // Shattered: gone for good (the game spawns sparks where it was).
        this.onShatter(p.x, p.y);
        p.sprite.setVisible(false);
        this.pool.release(p);
        continue;
      }
      this.release(p, fromX, fromY, 260 + Math.random() * 220);
    }
    return n;
  }

  /** Detach one specific attached piece (e.g. hit by a bullet). */
  detach(p: JunkPiece, fromX: number, fromY: number): void {
    const i = this.attached.indexOf(p);
    if (i < 0) return;
    this.attached.splice(i, 1);
    this.release(p, fromX, fromY, 220);
  }

  private release(p: JunkPiece, fromX: number, fromY: number, speed: number): void {
    const a = Math.atan2(p.y - fromY, p.x - fromX) + (Math.random() - 0.5) * 0.9;
    p.state = LOOSE;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    p.age = 0;
    p.noPickup = junkData.noPickupTime;
    p.spin = (Math.random() - 0.5) * 20;
    p.sprite.setDepth(DEPTH.loose).clearTint();
    this.looseCount++;
  }

  /** The Compactor crushes attached pieces near it into heavy cubes that fall loose. */
  crushNear(x: number, y: number, radius: number): number {
    const crushed: JunkPiece[] = [];
    for (let i = this.attached.length - 1; i >= 0; i--) {
      const p = this.attached[i];
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < radius * radius) {
        crushed.push(p);
        this.attached.splice(i, 1);
      }
    }
    let cx = 0;
    let cy = 0;
    for (const p of crushed) {
      cx += p.x;
      cy += p.y;
      p.sprite.setVisible(false);
      this.pool.release(p);
    }
    if (crushed.length === 0) return 0;
    cx /= crushed.length;
    cy /= crushed.length;
    const cubes = Math.ceil(crushed.length / 4);
    for (let i = 0; i < cubes; i++) {
      const c = this.spawnLoose(cx, cy, CUBE_TYPE, 200 + Math.random() * 200);
      if (c) c.noPickup = 1.2;
    }
    return crushed.length;
  }

  /** Black Hole: swallow the outermost pieces. */
  consume(n: number): void {
    for (let i = 0; i < n && this.attached.length > 0; i++) {
      const p = this.attached.pop()!;
      p.sprite.setVisible(false);
      this.pool.release(p);
    }
  }

  /** Polarity Flip: every loose piece on the map flies to you. */
  pullAll(): void {
    for (const p of this.pool.items) {
      if (p.active && p.state === LOOSE && p.noPickup <= 0.3) {
        p.state = PULLED;
        p.pullSpeed = 300;
      }
    }
  }

  /** End of run: everything you collected explodes outward. */
  explodeAll(x: number, y: number): void {
    for (const p of this.pool.items) {
      if (!p.active || p.state === FLUNG) continue;
      if (p.state !== ATTACHED) this.looseCount--;
      p.state = FLUNG;
      const a = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5) * 0.6;
      const speed = 500 + Math.random() * 900;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.age = 0;
      p.spin = (Math.random() - 0.5) * 30;
      p.sprite.setDepth(DEPTH.fx);
    }
    this.attached.length = 0;
  }

  update(dt: number, f: JunkFrame): void {
    const items = this.pool.items;
    const friction = Math.exp(-f.looseFriction * dt);
    const px = f.px;
    const py = f.py;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active || p.state === ATTACHED) continue;
      if (p.state === FLUNG) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-1.5 * dt);
        p.vy *= Math.exp(-1.5 * dt);
        p.rot += p.spin * dt;
        p.sprite.setPosition(p.x, p.y).setRotation(p.rot).setAlpha(Math.max(0, 1 - p.age / 1.6));
        if (p.age > 1.6) {
          p.sprite.setVisible(false);
          this.pool.release(p);
        }
        continue;
      }
      const dx = px - p.x;
      const dy = py - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (p.state === LOOSE) {
        p.age += dt;
        if (p.noPickup > 0) p.noPickup -= dt;
        p.vx *= friction;
        p.vy *= friction;
        for (const b of f.belts) {
          if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
            p.x += b.dx * f.beltSpeed * dt;
            p.y += b.dy * f.beltSpeed * dt;
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Bounce off the arena edge.
        const m = ARENA.margin;
        if (p.x < m) (p.x = m), (p.vx = Math.abs(p.vx) * 0.6);
        else if (p.x > ARENA.width - m) (p.x = ARENA.width - m), (p.vx = -Math.abs(p.vx) * 0.6);
        if (p.y < m) (p.y = m), (p.vy = Math.abs(p.vy) * 0.6);
        else if (p.y > ARENA.height - m) (p.y = ARENA.height - m), (p.vy = -Math.abs(p.vy) * 0.6);
        p.spin *= Math.exp(-2 * dt);
        if (p.noPickup <= 0 && dist < f.magnetRadius) {
          p.state = PULLED;
          p.pullSpeed = 140;
        }
      } else {
        p.pullSpeed = Math.min(p.pullSpeed + 1600 * dt, 900);
        const step = p.pullSpeed * dt;
        if (dist <= this.cloudRadius + step + 4) {
          this.attach(p);
          continue;
        }
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.spin = 18;
      }
      p.rot += p.spin * dt;
      p.sprite.setPosition(p.x, p.y).setRotation(p.rot);
    }
    if (this.pulseT > 0) this.pulseT = Math.max(0, this.pulseT - dt);
    this.layoutAttached(dt, f);
  }

  /** Attached junk is pure maths (angle + radius), eased so pieces settle with a little bounce. */
  private layoutAttached(dt: number, f: JunkFrame): void {
    const duration = junkData.pulse.duration;
    const extra = this.pulseExtra(duration);
    const pulseBoost = this.pulseT > 0 ? junkData.pulse.damageMult : 1;
    this.angA = (this.angA + f.spin * dt) % TAU;
    this.angB = (this.angB - f.spin * dt) % TAU;
    const ease = 1 - Math.exp(-(this.pulseT > 0 ? 30 : 16) * dt);
    const count = this.attached.length;
    const dmgScale = junkData.damageScale * f.massMult * f.damageMult * pulseBoost;
    let outer = this.ringFirst;

    if (f.hot !== this.hotTinted) {
      this.hotTinted = f.hot;
      for (const p of this.attached) {
        if (f.hot) p.sprite.setTint(0xffb070);
        else p.sprite.clearTint();
      }
    }

    if (this.layout === 'line') {
      // Fridge Magnet: a flat bar through the magnet, 3 pieces wide.
      const a = this.angA * 0.7;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (let k = 0; k < count; k++) {
        const p = this.attached[k];
        const slot = Math.floor(k / 6);
        const lateral = (k % 3) - 1;
        const side = k % 6 < 3 ? 1 : -1;
        const d = this.ringFirst + slot * this.ringSpacing + extra;
        const tx = f.px + cos * d * side - sin * lateral * 11;
        const ty = f.py + sin * d * side + cos * lateral * 11;
        this.place(p, tx, ty, f, ease, dt, f.spin * 0.7 * d * dmgScale * p.mass);
        if (d > outer) outer = d;
      }
      this.cloudRadius = Math.max(this.ringFirst, outer - extra + 6);
      return;
    }

    let index = 0;
    for (let ring = 0; index < count; ring++) {
      const inRing = Math.min(this.ringCaps[ring] ?? 40, count - index);
      const radius = this.ringFirst + ring * this.ringSpacing;
      const reverse = f.counterRings && ring % 2 === 1;
      const base = (reverse ? this.angB : this.angA) + ring * 0.7;
      const stepAngle = TAU / inRing;
      const dmg = f.spin * radius * dmgScale;
      for (let j = 0; j < inRing; j++) {
        const p = this.attached[index + j];
        const a = base + j * stepAngle;
        const r = radius + extra;
        this.place(p, f.px + Math.cos(a) * r, f.py + Math.sin(a) * r, f, ease, dt, dmg * p.mass);
      }
      index += inRing;
      outer = radius;
    }
    this.cloudRadius = outer;
  }

  private place(p: JunkPiece, tx: number, ty: number, f: JunkFrame, ease: number, dt: number, damage: number): void {
    // Anti-Mag auras shove nearby junk out of the way.
    for (let i = 0; i < f.repellers.length; i++) {
      const r = f.repellers[i];
      const dx = tx - r.x;
      const dy = ty - r.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r.r * r.r) {
        const d = Math.sqrt(d2) || 1;
        const push = (r.r - d) * 0.75;
        tx += (dx / d) * push;
        ty += (dy / d) * push;
      }
    }
    p.x += (tx - p.x) * ease;
    p.y += (ty - p.y) * ease;
    p.damage = damage;
    if (p.hitTimer > 0) p.hitTimer -= dt;
    if (p.explodeCd > 0) p.explodeCd -= dt;
    p.rot += dt * 2;
    if (p.bounce > 0) p.bounce = Math.max(0, p.bounce - dt * 5);
    p.sprite.setPosition(p.x, p.y).setRotation(p.rot).setScale(TS * (1 + p.bounce * 0.6));
  }

  private attach(p: JunkPiece): void {
    this.looseCount--;
    if (this.attached.length >= Math.min(this.cap, junkData.maxAttached)) {
      // Ball is full: the new piece fuses into the lightest one, making it heavier.
      p.sprite.setVisible(false);
      this.pool.release(p);
      if (!this.upgradeLightest()) {
        this.overflowScrap++; // everything is already as heavy as it gets: scrap coins
        this.onAttach(-1);
      }
      return;
    }
    p.state = ATTACHED;
    p.hitTimer = 0;
    p.bounce = 1;
    p.sprite.setDepth(DEPTH.junk);
    if (this.hotTinted) p.sprite.setTint(0xffb070);
    this.attached.push(p);
    this.onAttach(this.attached.length);
  }

  private upgradeLightest(): boolean {
    const chain = junkData.upgradeChain;
    let best: JunkPiece | null = null;
    for (const a of this.attached) {
      if (chain[a.type] === a.type) continue;
      if (!best || a.mass < best.mass) best = a;
    }
    if (!best) return false;
    const next = types[chain[best.type]];
    best.type = chain[best.type];
    best.mass = next.mass;
    best.radius = next.radius;
    best.bounce = 1.6;
    best.sprite.setTexture(`junk-${next.id}`);
    this.upgradedPieces++;
    this.onUpgrade(best.x, best.y);
    return true;
  }

  /** Total mass of the ball: keeps growing after the piece cap is reached. */
  get mass(): number {
    let m = 0;
    for (const a of this.attached) m += a.mass;
    return m;
  }

  /** Magnet Bot: rip the outermost pieces off and fling them toward (x, y). */
  steal(n: number, x: number, y: number): number {
    let taken = 0;
    for (; taken < n && this.attached.length > 0; taken++) {
      const p = this.attached.pop()!;
      const a = Math.atan2(y - p.y, x - p.x);
      p.state = LOOSE;
      p.vx = Math.cos(a) * 420;
      p.vy = Math.sin(a) * 420;
      p.age = 0;
      p.noPickup = 1.6;
      p.spin = 20;
      p.sprite.setDepth(DEPTH.loose).clearTint();
      this.looseCount++;
    }
    return taken;
  }

  /** Scrap Thief / Magnet Bot: swallow loose pieces within r. Returns how many. */
  absorbNear(x: number, y: number, r: number, max: number): number {
    let n = 0;
    for (const p of this.pool.items) {
      if (n >= max) break;
      if (!p.active || (p.state !== LOOSE && p.state !== PULLED)) continue;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 > r * r) continue;
      p.sprite.setVisible(false);
      this.pool.release(p);
      this.looseCount--;
      n++;
    }
    return n;
  }

  /** Nearest loose piece for a Scrap Thief to go after. */
  nearestLoose(x: number, y: number, maxD: number): JunkPiece | null {
    let best: JunkPiece | null = null;
    let bd = maxD * maxD;
    for (const p of this.pool.items) {
      if (!p.active || p.state !== LOOSE) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Pieces being pulled, for drawing the cyan streaks. */
  forEachPulled(fn: (p: JunkPiece) => void): void {
    for (const p of this.pool.items) if (p.active && p.state === PULLED) fn(p);
  }
}

export const JUNK = junkData;
