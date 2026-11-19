import Phaser from 'phaser';
import { DEPTH, PAL } from '../config';
import upgradeData from '../data/upgrades.json';
import { Audio } from './AudioManager';
import { Controls } from './Controls';
import type { Enemy } from './EnemySpawner';
import { Pool } from './Pool';
import { TS } from './Textures';
import type { GameScene } from '../scenes/GameScene';

const FB = upgradeData.fireball;
const METEOR = upgradeData.cards.find((c) => c.id === 'meteorDrop') as unknown as {
  cost: number;
  radius: number;
  damage: number;
  cooldown: number;
  charge: number;
};

interface Shot {
  active: boolean;
  img: Phaser.GameObjects.Image;
  kind: 'fire' | 'scrap';
  x: number;
  y: number;
  vx: number;
  vy: number;
  travelled: number;
  range: number;
  damage: number;
  junkType: number;
  chain: boolean;
  lavaStep: number;
  hits: number;
}

interface Timed {
  active: boolean;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
}

interface Bolt {
  points: number[];
  life: number;
}

/**
 * Aimed attacks: Fireball (left-click, auto-aim on touch), Junk Shotgun and Magnet Mine
 * (right-click / special button), Meteor Drop (hold left-click), Chain Lightning and Inferno.
 */
export class Weapons {
  fireCd = 0;
  specialCd = 0;
  meteorCd = 0;
  /** Seconds the left button has been held, for Meteor Drop. */
  charge = 0;
  firstFire = false;
  private fireCount = 0;
  private readonly shots: Pool<Shot>;
  private readonly mines: Pool<Timed>;
  private readonly meteors: Pool<Timed>;
  private readonly lava: Pool<Timed>;
  private readonly bolts: Bolt[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private aimWX = 0;
  private aimWY = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly g: GameScene,
  ) {
    this.shots = new Pool(48, () => ({
      active: false,
      img: scene.add.image(0, 0, 'fireball').setDepth(DEPTH.junk + 2).setVisible(false),
      kind: 'fire',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      travelled: 0,
      range: 0,
      damage: 0,
      junkType: 0,
      chain: false,
      lavaStep: 0,
      hits: 0,
    }));
    const timed = (key: string, depth: number) => () => ({
      active: false,
      img: scene.add.image(0, 0, key).setDepth(depth).setVisible(false),
      x: 0,
      y: 0,
      t: 0,
    });
    this.mines = new Pool(3, timed('magnet-mine', DEPTH.loose + 1));
    this.meteors = new Pool(2, timed('junk-cube', DEPTH.fx + 1));
    this.lava = new Pool(40, timed('lava', DEPTH.belt + 0.6));
    this.gfx = scene.add.graphics().setDepth(DEPTH.fx);
  }

  get specials(): ('shotgun' | 'mine')[] {
    const s = this.g.stats;
    const list: ('shotgun' | 'mine')[] = [];
    if (s.shotgunPieces > 0) list.push('shotgun');
    if (s.mineRadius > 0) list.push('mine');
    return list;
  }

  private nearestEnemy(x: number, y: number, maxD: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD * maxD;
    for (const e of this.g.enemies.pool.items) {
      if (!e.active || e.hidden) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Where the player is aiming, in world space: the mouse, or the nearest robot on touch screens. */
  private aim(): { x: number; y: number } | null {
    const p = this.g.player;
    if (Controls.hasAim && !Controls.isTouch) {
      const wp = this.g.cameras.main.getWorldPoint(Controls.aimX, Controls.aimY);
      this.aimWX = wp.x;
      this.aimWY = wp.y;
      return { x: wp.x, y: wp.y };
    }
    const e = this.nearestEnemy(p.x, p.y, 480);
    return e ? { x: e.x, y: e.y } : null;
  }

  update(dt: number, playing: boolean): void {
    const s = this.g.stats;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.specialCd > 0) this.specialCd -= dt;
    if (this.meteorCd > 0) this.meteorCd -= dt;

    if (playing) {
      const target = this.aim();
      // Touch screens auto-fire at the nearest robot; mice fire while the button is held.
      const wantFire = Controls.isTouch ? !!target : Controls.fireHeld;
      if (Controls.fireHeld && s.meteor && !Controls.isTouch) this.charge += dt;
      if (!Controls.fireHeld && this.charge > 0) {
        if (this.charge >= METEOR.charge && target) this.dropMeteor(target.x, target.y);
        this.charge = 0;
      }
      if (wantFire && target && this.fireCd <= 0) {
        this.fireCd = FB.cooldown * s.fbRateMult;
        this.fireball(target.x, target.y);
      }
      if (Controls.specialQueued) {
        Controls.specialQueued = false;
        this.useSpecial(target);
      }
    } else {
      this.charge = 0;
      Controls.specialQueued = false;
    }

    this.updateShots(dt);
    this.updateTimed(dt);
    this.draw(dt);
  }

  private fireball(tx: number, ty: number): void {
    const p = this.g.player;
    const shot = this.shots.obtain();
    if (!shot) return;
    this.firstFire = true;
    this.fireCount++;
    const a = Math.atan2(ty - p.y, tx - p.x);
    shot.kind = 'fire';
    shot.x = p.x + Math.cos(a) * 24;
    shot.y = p.y + Math.sin(a) * 24;
    shot.vx = Math.cos(a) * FB.speed;
    shot.vy = Math.sin(a) * FB.speed;
    shot.travelled = 0;
    shot.range = Math.min(FB.range, Math.hypot(tx - p.x, ty - p.y) + 40);
    shot.damage = FB.damage * (1 + 0.08 * this.g.level) * this.g.stats.fbDamageMult;
    shot.chain = this.g.stats.chainTargets > 0 && this.fireCount % FB.chainEvery === 0;
    shot.lavaStep = 0;
    shot.hits = 0;
    shot.img.setTexture('fireball').setScale(TS * (shot.chain ? 1.25 : 1)).setTint(shot.chain ? 0xbff6ff : 0xffffff).setPosition(shot.x, shot.y).setVisible(true);
    Audio.fireball();
    this.g.player.stretch = -0.25;
  }

  private useSpecial(target: { x: number; y: number } | null): void {
    if (this.specialCd > 0) return;
    const s = this.g.stats;
    const junk = this.g.junk;
    const p = this.g.player;
    const tx = target?.x ?? p.x + p.vx;
    const ty = target?.y ?? p.y + p.vy;
    for (const kind of this.specials) {
      if (kind === 'shotgun' && junk.count >= s.shotgunPieces) {
        // Spend junk from the ball: armour turned into ammo.
        const a0 = Math.atan2(ty - p.y, tx - p.x);
        const types = junk.takeOutermost(s.shotgunPieces);
        types.forEach((type, i) => {
          const shot = this.shots.obtain();
          if (!shot) return;
          const a = a0 + (i / (types.length - 1) - 0.5) * 0.7 + (Math.random() - 0.5) * 0.08;
          const sp = 680 + Math.random() * 120;
          shot.kind = 'scrap';
          shot.x = p.x + Math.cos(a) * 26;
          shot.y = p.y + Math.sin(a) * 26;
          shot.vx = Math.cos(a) * sp;
          shot.vy = Math.sin(a) * sp;
          shot.travelled = 0;
          shot.range = 420;
          shot.junkType = type;
          shot.damage = 14 * (1 + 0.08 * this.g.level) * junk.massOf(type);
          shot.chain = false;
          shot.hits = 0;
          shot.img.setTexture(`junk-${junk.typeId(type)}`).setScale(TS * 1.3).clearTint().setPosition(shot.x, shot.y).setVisible(true);
        });
        this.specialCd = s.shotgunCooldown;
        Audio.shotgun();
        this.g.juice.shake(0.3);
        p.vx -= Math.cos(a0) * 160;
        p.vy -= Math.sin(a0) * 160;
        return;
      }
      if (kind === 'mine' && junk.count >= s.mineCost) {
        const m = this.mines.obtain();
        if (!m) continue;
        junk.consume(s.mineCost);
        const placeX = Controls.isTouch ? p.x : tx;
        const placeY = Controls.isTouch ? p.y : ty;
        m.x = placeX;
        m.y = placeY;
        m.t = 1.6;
        m.img.setPosition(m.x, m.y).setScale(TS).setVisible(true);
        this.specialCd = s.mineCooldown;
        Audio.clank();
        return;
      }
    }
  }

  private dropMeteor(x: number, y: number): void {
    if (this.meteorCd > 0 || this.g.junk.count < METEOR.cost) return;
    const m = this.meteors.obtain();
    if (!m) return;
    this.g.junk.consume(METEOR.cost);
    m.x = x;
    m.y = y;
    m.t = 0.6;
    m.img.setPosition(x, y - 400).setScale(TS * 5).setAlpha(1).setVisible(true);
    this.meteorCd = METEOR.cooldown;
    Audio.alarm();
  }

  private explode(x: number, y: number, r: number, damage: number, burn: number): void {
    const g = this.g;
    g.juice.explosion(x, y, r);
    for (const e of g.enemies.pool.items) {
      if (!e.active || e.hidden) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > (r + e.radius) ** 2) continue;
      if (burn > 0) {
        e.burnDps = Math.max(e.burnDps, burn);
        e.burnTimer = Math.max(e.burnTimer, FB.burnTime);
      }
      g.showDamage(e, damage, false, true);
      e.weaponHit = true;
      g.enemies.damage(e, damage, x, y, 220);
    }
  }

  private chainLightning(x: number, y: number): void {
    this.zap(x, y, this.g.stats.chainTargets, this.g.stats.chainDamage);
  }

  /** Lightning that arcs between up to `targets` robots (Chain Lightning, Storm path, batteries). */
  zap(x: number, y: number, targets: number, baseDamage: number, range = 230): void {
    const hit = new Set<Enemy>();
    const pts = [x, y];
    let cx = x;
    let cy = y;
    for (let i = 0; i < targets; i++) {
      let best: Enemy | null = null;
      let bd = range * range;
      for (const e of this.g.enemies.pool.items) {
        if (!e.active || e.hidden || hit.has(e)) continue;
        const d = (e.x - cx) ** 2 + (e.y - cy) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      hit.add(best);
      pts.push(best.x, best.y);
      cx = best.x;
      cy = best.y;
      const dmg = baseDamage * (1 + 0.08 * this.g.level);
      this.g.showDamage(best, dmg, true);
      best.weaponHit = true;
      this.g.enemies.damage(best, dmg, x, y, 120);
      best.stun = Math.max(best.stun, 0.3);
    }
    if (pts.length > 2) {
      this.bolts.push({ points: pts, life: 0.22 });
      Audio.zap();
    }
  }

  private updateShots(dt: number): void {
    const g = this.g;
    const s = g.stats;
    for (const shot of this.shots.items) {
      if (!shot.active) continue;
      const step = Math.hypot(shot.vx, shot.vy) * dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.travelled += step;
      shot.img.setPosition(shot.x, shot.y).setRotation(shot.img.rotation + dt * 14);
      if (shot.kind === 'fire') {
        if (!g.juice.low && Math.random() < 0.7) {
          g.juice.emit(shot.x, shot.y, 'p-puff', Math.random() < 0.5 ? 0xd9772b : 0xf2c14e, { speed: 30, life: 0.3, scale: 0.8, endScale: 0.1 });
        }
        if (s.inferno) {
          shot.lavaStep += step;
          if (shot.lavaStep > 34) {
            shot.lavaStep = 0;
            const l = this.lava.obtain();
            if (l) {
              l.x = shot.x;
              l.y = shot.y;
              l.t = 2.5;
              l.img.setPosition(l.x, l.y).setScale(TS * (0.9 + Math.random() * 0.3)).setAlpha(0.9).setVisible(true);
            }
          }
        }
      }
      let done = shot.travelled >= shot.range;
      for (const e of g.enemies.pool.items) {
        if (done) break;
        if (!e.active || e.hidden) continue;
        const r = e.radius + 10;
        if ((e.x - shot.x) ** 2 + (e.y - shot.y) ** 2 > r * r) continue;
        if (shot.kind === 'scrap') {
          g.showDamage(e, shot.damage, false);
          e.weaponHit = true;
          g.enemies.damage(e, shot.damage, shot.x - shot.vx * 0.01, shot.y - shot.vy * 0.01, 240);
          g.juice.sparks(shot.x, shot.y, 3);
          Audio.hit();
          shot.hits++;
          shot.vx *= 0.6;
          shot.vy *= 0.6;
          if (shot.hits >= 2) done = true;
        } else {
          done = true;
        }
      }
      if (!done) continue;
      shot.img.setVisible(false);
      this.shots.release(shot);
      if (shot.kind === 'fire') {
        const r = FB.radius * (1 + (s.fbDamageMult - 1) * 0.5);
        this.explode(shot.x, shot.y, r, shot.damage, FB.burn * s.fbDamageMult);
        Audio.boom();
        g.juice.shake(0.08);
        if (shot.chain) this.chainLightning(shot.x, shot.y);
      } else {
        // Shotgun junk lands as loose junk you can pull back in.
        const piece = g.junk.spawnLoose(shot.x, shot.y, shot.junkType, 60);
        if (piece) piece.noPickup = 0.6;
      }
    }
  }

  private updateTimed(dt: number): void {
    const g = this.g;
    const s = g.stats;
    for (const m of this.mines.items) {
      if (!m.active) continue;
      m.t -= dt;
      m.img.rotation += dt * 6;
      const r = s.mineRadius;
      for (const e of g.enemies.pool.items) {
        if (!e.active || e.hidden || e.kind === 'boss') continue;
        const dx = m.x - e.x;
        const dy = m.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > r || d < 4) continue;
        const pull = (1 - d / r) * 420 * dt * (e.kind === 'crusher' ? 0.2 : 1);
        e.x += (dx / d) * pull;
        e.y += (dy / d) * pull;
      }
      if (m.t <= 0) {
        m.img.setVisible(false);
        this.mines.release(m);
        this.explode(m.x, m.y, r * 0.65, s.mineDamage * (1 + 0.08 * g.level), 0);
        Audio.boom();
        g.juice.shake(0.3);
      }
    }
    for (const m of this.meteors.items) {
      if (!m.active) continue;
      m.t -= dt;
      const k = Math.max(0, m.t / 0.6);
      m.img.setPosition(m.x, m.y - 400 * k).setScale(TS * (2.2 + 2.8 * k)).setRotation(m.img.rotation + dt * 3);
      if (m.t <= 0) {
        m.img.setVisible(false);
        this.meteors.release(m);
        this.explode(m.x, m.y, METEOR.radius, METEOR.damage * (1 + 0.08 * g.level), 0);
        g.juice.ring(m.x, m.y, PAL.brass, 0.4, 0.4, METEOR.radius / 64);
        g.juice.confetti(m.x, m.y, 14);
        Audio.crush();
        g.juice.shake(0.6);
        g.hitStop = Math.max(g.hitStop, 0.06);
        // The cube breaks into pieces you can collect again.
        for (let i = 0; i < 6; i++) g.junk.spawnLoose(m.x, m.y, 5, 260);
      }
    }
    for (const l of this.lava.items) {
      if (!l.active) continue;
      l.t -= dt;
      l.img.setAlpha(Math.min(0.9, l.t));
      if (l.t <= 0) {
        l.img.setVisible(false);
        this.lava.release(l);
        continue;
      }
      for (const e of g.enemies.pool.items) {
        if (!e.active || e.hidden) continue;
        if ((e.x - l.x) ** 2 + (e.y - l.y) ** 2 > (e.radius + 20) ** 2) continue;
        e.burnDps = Math.max(e.burnDps, s.infernoBurn);
        e.burnTimer = Math.max(e.burnTimer, 1.5);
      }
    }
  }

  private draw(dt: number): void {
    const gfx = this.gfx;
    gfx.clear();
    // Meteor charge ring at the cursor, landing warnings, mine pull range.
    if (this.charge > 0.15 && this.g.stats.meteor) {
      const k = Math.min(1, this.charge / METEOR.charge);
      gfx.lineStyle(4, k >= 1 ? PAL.brass : PAL.text, 0.8);
      gfx.beginPath();
      gfx.arc(this.aimWX, this.aimWY, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      gfx.strokePath();
    }
    for (const m of this.meteors.items) {
      if (!m.active) continue;
      gfx.fillStyle(PAL.brass, 0.25);
      gfx.fillCircle(m.x, m.y, METEOR.radius * (1 - m.t / 0.6));
      gfx.lineStyle(3, PAL.brass, 0.9);
      gfx.strokeCircle(m.x, m.y, METEOR.radius);
    }
    for (const m of this.mines.items) {
      if (!m.active) continue;
      gfx.lineStyle(2, PAL.cyan, 0.5);
      gfx.strokeCircle(m.x, m.y, this.g.stats.mineRadius * (0.6 + 0.4 * Math.sin(m.t * 12)));
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      for (const [w, c] of [
        [7, PAL.cyan],
        [3, 0xffffff],
      ] as const) {
        gfx.lineStyle(w, c, Math.min(1, b.life * 6));
        gfx.beginPath();
        gfx.moveTo(b.points[0], b.points[1]);
        for (let j = 2; j < b.points.length; j += 2) {
          const mx = (b.points[j - 2] + b.points[j]) / 2 + (Math.random() - 0.5) * 24;
          const my = (b.points[j - 1] + b.points[j + 1]) / 2 + (Math.random() - 0.5) * 24;
          gfx.lineTo(mx, my);
          gfx.lineTo(b.points[j], b.points[j + 1]);
        }
        gfx.strokePath();
      }
    }
  }
}
