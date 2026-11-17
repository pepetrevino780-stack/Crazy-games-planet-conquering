import Phaser from 'phaser';
import { ARENA, COLORS, VIEW } from '../config';
import magnets from '../data/magnets.json';
import junkData from '../data/junk.json';
import { EnemySpawner, TIN_DROPS, type Enemy } from '../systems/EnemySpawner';
import { JUNK_HIT_COOLDOWN, JUNK_HIT_KNOCKBACK, JunkSystem } from '../systems/JunkSystem';
import { Player } from '../systems/Player';

const MIN_ZOOM = 0.68;

export class GameScene extends Phaser.Scene {
  player!: Player;
  junk!: JunkSystem;
  enemies!: EnemySpawner;
  time_ = 0;
  private field!: Phaser.GameObjects.Graphics;
  private camX = 0;
  private camY = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    this.time_ = 0;
    this.drawFloor();

    this.junk = new JunkSystem(this);
    this.enemies = new EnemySpawner(this);
    this.player = new Player(this, magnets.horseshoe, ARENA.width / 2, ARENA.height / 2);
    this.field = this.add.graphics().setDepth(5);

    this.enemies.onKill = (enemy: Enemy, index: number) => {
      // The very first bot always pops into exactly 3 bolts (spec: first 30 seconds).
      const drops =
        index === 0 ? 3 : Phaser.Math.Between(TIN_DROPS.min, TIN_DROPS.max);
      for (let i = 0; i < drops; i++) this.junk.spawnLoose(enemy.x, enemy.y, index === 0);
    };

    this.camX = this.player.x;
    this.camY = this.player.y;
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height).centerOn(this.camX, this.camY);
    this.scene.launch('HUD');
  }

  update(_now: number, deltaMs: number): void {
    // Delta time in seconds, clamped so a tab switch can't teleport everything.
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time_ += dt;
    const player = this.player;
    const def = player.def;
    const cam = this.cameras.main;

    player.update(dt);
    const spawnDistance = Math.hypot(VIEW.width, VIEW.height) / 2 / cam.zoom + 40;
    this.enemies.update(dt, this.time_, player.x, player.y, spawnDistance);
    this.junk.update(dt, player.x, player.y, def.magnetRadius, def.spin);
    this.collide();

    // Camera: smooth follow, and pull back as the junk ball grows.
    const follow = 1 - Math.exp(-9 * dt);
    this.camX += (player.x - this.camX) * follow;
    this.camY += (player.y - this.camY) * follow;
    cam.centerOn(this.camX, this.camY);
    const growth = (this.junk.cloudRadius - junkData.ring.firstRadius) / 80;
    const targetZoom = 1 - Math.min(growth, 1) * (1 - MIN_ZOOM);
    cam.setZoom(cam.zoom + (targetZoom - cam.zoom) * (1 - Math.exp(-2 * dt)));

    this.field.clear();
    this.field.lineStyle(2, COLORS.cyan, 0.45);
    this.field.strokeCircle(player.x, player.y, def.magnetRadius);
  }

  private collide(): void {
    const player = this.player;
    const def = player.def;
    const attached = this.junk.attached;
    const reach = this.junk.cloudRadius + 14;
    const bots = this.enemies.pool.items;

    for (let i = 0; i < bots.length; i++) {
      const e = bots[i];
      if (!e.active) continue;
      const dx = e.x - player.x;
      const dy = e.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > reach + e.radius) continue; // broad phase: outside the whole junk cloud

      // Magnet body: bots can't walk through it, and a bump hurts them.
      const minDist = def.radius + e.radius;
      if (dist < minDist) {
        e.x = player.x + (dx / dist) * minDist;
        e.y = player.y + (dy / dist) * minDist;
        if (player.bumpTimer <= 0) {
          player.bumpTimer = def.bumpCooldown;
          if (this.enemies.damage(e, def.bumpDamage, player.x, player.y, def.bumpKnockback)) continue;
        }
      }

      // Junk ring: each piece hits on its own cooldown, so more junk = more damage.
      for (let j = 0; j < attached.length; j++) {
        const p = attached[j];
        if (p.hitTimer > 0) continue;
        const jx = e.x - p.x;
        const jy = e.y - p.y;
        const min = e.radius + p.radius;
        if (jx * jx + jy * jy > min * min) continue;
        p.hitTimer = JUNK_HIT_COOLDOWN;
        if (this.enemies.damage(e, p.damage, player.x, player.y, JUNK_HIT_KNOCKBACK)) break;
      }
    }
  }

  private drawFloor(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COLORS.floor);
    g.fillRect(0, 0, ARENA.width, ARENA.height);
    g.lineStyle(2, COLORS.floorDetail, 1);
    for (let x = 0; x <= ARENA.width; x += 80) g.lineBetween(x, 0, x, ARENA.height);
    for (let y = 0; y <= ARENA.height; y += 80) g.lineBetween(0, y, ARENA.width, y);
    g.lineStyle(6, COLORS.floorDetail, 1);
    g.strokeRect(0, 0, ARENA.width, ARENA.height);
  }
}
