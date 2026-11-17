import Phaser from 'phaser';
import { CAPS, CSS, DEPTH, FONT_DISPLAY } from '../config';
import { Meta } from './MetaSave';
import { Pool } from './Pool';
import { TS } from './Textures';

interface Particle {
  active: boolean;
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  drag: number;
  life: number;
  maxLife: number;
  spin: number;
  scale0: number;
  scale1: number;
  alpha0: number;
  faceVelocity: boolean;
}

interface DamageNumber {
  active: boolean;
  text: Phaser.GameObjects.Text;
  vy: number;
  life: number;
}

/** Hooks the game uses to feel crunchy: shake, hit-stop, slow motion, zoom punches, particles. */
export class Juice {
  trauma = 0;
  shakeX = 0;
  shakeY = 0;
  /** Extra zoom-out that springs back (camera punch when the junk count doubles). */
  zoomPunch = 0;
  private readonly particles: Pool<Particle>;
  private readonly numbers: Pool<DamageNumber>;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.particles = new Pool(CAPS.particles, () => ({
      active: false,
      img: scene.add.image(0, 0, 'p-dot').setVisible(false).setDepth(DEPTH.fx),
      vx: 0,
      vy: 0,
      drag: 0,
      life: 0,
      maxLife: 1,
      spin: 0,
      scale0: 1,
      scale1: 0,
      alpha0: 1,
      faceVelocity: false,
    }));
    this.numbers = new Pool(CAPS.numbers, () => ({
      active: false,
      text: scene.add
        .text(0, 0, '', {
          fontFamily: FONT_DISPLAY,
          fontSize: '22px',
          color: CSS.text,
          stroke: CSS.outline,
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.numbers)
        .setVisible(false),
      vy: 0,
      life: 0,
    }));
  }

  get low(): boolean {
    return Meta.data.settings.lowFx;
  }

  /** Screen shake scaled to impact and capped. Turned off entirely by the setting. */
  shake(amount: number): void {
    if (!Meta.data.settings.shake) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  punchZoom(amount: number): void {
    this.zoomPunch = Math.min(0.2, this.zoomPunch + amount);
  }

  /** Real-time update (unaffected by slow motion or hit-stop). */
  updateReal(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const power = this.trauma * this.trauma * 18;
    this.shakeX = power * (Math.sin(this.time * 71) + Math.sin(this.time * 37.3) * 0.5) * 0.66;
    this.shakeY = power * (Math.cos(this.time * 63) + Math.sin(this.time * 41.7) * 0.5) * 0.66;
    this.zoomPunch *= Math.exp(-4 * dt);
  }

  update(dt: number): void {
    const items = this.particles.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.img.setVisible(false);
        this.particles.release(p);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      const t = 1 - p.life / p.maxLife;
      p.img.setScale((p.scale0 + (p.scale1 - p.scale0) * t) * TS);
      p.img.setAlpha(p.alpha0 * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4));
      if (p.faceVelocity) p.img.rotation = Math.atan2(p.vy, p.vx);
      else p.img.rotation += p.spin * dt;
    }
    const nums = this.numbers.items;
    for (let i = 0; i < nums.length; i++) {
      const n = nums[i];
      if (!n.active) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.text.setVisible(false);
        this.numbers.release(n);
        continue;
      }
      n.text.y += n.vy * dt;
      n.vy *= Math.exp(-5 * dt);
      const age = 0.7 - n.life;
      n.text.setScale(age < 0.08 ? 0.6 + age * 7 : 1.16 - Math.min(age, 0.3) * 0.5);
      n.text.setAlpha(n.life < 0.25 ? n.life / 0.25 : 1);
    }
  }

  emit(
    x: number,
    y: number,
    texture: string,
    tint: number,
    opts: {
      speed?: number;
      angle?: number;
      spread?: number;
      life?: number;
      scale?: number;
      endScale?: number;
      drag?: number;
      alpha?: number;
      faceVelocity?: boolean;
      depth?: number;
    } = {},
  ): void {
    const p = this.particles.obtain();
    if (!p) return;
    const angle = (opts.angle ?? Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (opts.spread ?? 0);
    const speed = (opts.speed ?? 200) * (0.5 + Math.random() * 0.7);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.drag = opts.drag ?? 4;
    p.maxLife = p.life = (opts.life ?? 0.5) * (0.7 + Math.random() * 0.6);
    p.spin = (Math.random() - 0.5) * 14;
    p.scale0 = opts.scale ?? 1;
    p.scale1 = opts.endScale ?? 0;
    p.alpha0 = opts.alpha ?? 1;
    p.faceVelocity = opts.faceVelocity ?? false;
    p.img
      .setTexture(texture)
      .setTint(tint)
      .setPosition(x, y)
      .setRotation(angle)
      .setScale(p.scale0 * TS)
      .setAlpha(p.alpha0)
      .setDepth(opts.depth ?? DEPTH.fx)
      .setVisible(true);
  }

  sparks(x: number, y: number, count: number, tint = 0xfff1b0, angle?: number): void {
    const n = this.low ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      this.emit(x, y, 'p-spark', tint, {
        speed: 380,
        angle,
        spread: angle === undefined ? 0 : 1.6,
        life: 0.25,
        scale: 1.2,
        endScale: 0.2,
        drag: 6,
        faceVelocity: true,
      });
    }
  }

  puff(x: number, y: number, tint = 0x8a7f99, count = 1): void {
    if (this.low) return;
    for (let i = 0; i < count; i++) {
      this.emit(x, y, 'p-puff', tint, { speed: 40, life: 0.5, scale: 1, endScale: 2.2, alpha: 0.5, drag: 3, depth: DEPTH.loose - 1 });
    }
  }

  /** Robots pop apart: chunky pieces in their colour plus a flash ring. */
  pop(x: number, y: number, tint: number, size = 1): void {
    const n = this.low ? 4 : 8;
    for (let i = 0; i < n * size; i++) {
      this.emit(x, y, i % 2 ? 'p-square' : 'p-dot', i % 3 === 0 ? 0xffffff : tint, {
        speed: 280 * Math.sqrt(size),
        life: 0.45,
        scale: 1.6,
        endScale: 0.3,
        drag: 5,
      });
    }
    this.ring(x, y, 0xffffff, 0.35 * size, 0.25, 0.8);
  }

  ring(x: number, y: number, tint: number, startScale: number, life: number, endScale: number): void {
    const p = this.particles.obtain();
    if (!p) return;
    p.vx = p.vy = 0;
    p.drag = 0;
    p.spin = 0;
    p.maxLife = p.life = life;
    p.scale0 = startScale;
    p.scale1 = endScale;
    p.alpha0 = 0.9;
    p.faceVelocity = false;
    p.img.setTexture('p-ring').setTint(tint).setPosition(x, y).setRotation(0).setAlpha(0.9).setDepth(DEPTH.fx).setVisible(true);
  }

  explosion(x: number, y: number, radius: number): void {
    this.ring(x, y, 0xf2c14e, 0.1, 0.3, radius / 64);
    const n = this.low ? 5 : 12;
    for (let i = 0; i < n; i++) {
      this.emit(x, y, 'p-puff', i % 2 ? 0xd9772b : 0xf2c14e, { speed: radius * 3, life: 0.4, scale: 1.4, endScale: 0.4, drag: 6 });
    }
  }

  confetti(x: number, y: number, count: number): void {
    const colors = [0xf2c14e, 0x3ee6f2, 0xe8423f, 0x9be564, 0xff3d7f, 0xa7b0ba];
    const n = this.low ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      this.emit(x, y, 'p-square', colors[i % colors.length], { speed: 700, life: 1.6, scale: 2, endScale: 1.2, drag: 2.2 });
    }
  }

  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    if (this.low && !crit) return;
    const n = this.numbers.obtain();
    if (!n) return;
    n.life = 0.7;
    n.vy = -90;
    n.text
      .setText(String(Math.max(1, Math.round(amount))))
      .setFontSize(crit ? 30 : 20)
      .setColor(crit ? CSS.brass : CSS.text)
      .setPosition(x + (Math.random() - 0.5) * 16, y - 10)
      .setScale(0.6)
      .setAlpha(1)
      .setVisible(true);
  }
}
