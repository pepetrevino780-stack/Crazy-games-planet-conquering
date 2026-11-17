import Phaser from 'phaser';
import { CSS, PAL, displayStyle, formatTime } from '../config';
import { Audio } from '../systems/AudioManager';
import { Controls } from '../systems/Controls';
import type { GameScene } from './GameScene';

const JOY_RADIUS = 70;

/** Overlay scene with its own camera, so the HUD ignores the game camera's zoom and shake. */
export class HudScene extends Phaser.Scene {
  private g!: GameScene;
  private xpBar!: Phaser.GameObjects.Graphics;
  private vignette!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];
  private levelText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinText!: Phaser.GameObjects.Text;
  private junkIcon!: Phaser.GameObjects.Image;
  private junkText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Image;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossName!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private pulseBtn!: Phaser.GameObjects.Container;
  private pulseRing!: Phaser.GameObjects.Graphics;
  private pulseKey!: Phaser.GameObjects.Text;
  private moveHint!: Phaser.GameObjects.Container;
  private joy!: Phaser.GameObjects.Graphics;

  private shownJunk = 0;
  private junkBounce = 0;
  private lastJunk = 0;
  private shownCoins = -1;
  private shownSeconds = -1;
  private shownHearts = '';
  private shownLevel = -1;
  private bannerShown = false;
  private joyId = -1;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private pulseRadius = 40;

  constructor() {
    super('HUD');
  }

  create(): void {
    this.g = this.scene.get('Game') as GameScene;
    this.shownJunk = 0;
    this.lastJunk = 0;
    this.junkBounce = 0;
    this.shownCoins = this.shownSeconds = this.shownLevel = -1;
    this.shownHearts = '';
    this.bannerShown = false;
    this.joyId = -1;
    this.hearts = [];

    this.vignette = this.add.graphics();
    this.xpBar = this.add.graphics();
    this.levelText = this.add.text(0, 0, '', displayStyle(20, CSS.cyan)).setOrigin(0, 0.5);
    this.coinIcon = this.add.image(0, 0, 'coin').setScale(0.5);
    this.coinText = this.add.text(0, 0, '0', displayStyle(22, CSS.brass)).setOrigin(0, 0.5);
    this.junkIcon = this.add.image(0, 0, 'junk-gear').setScale(1.1);
    this.junkText = this.add.text(0, 0, '0', displayStyle(58)).setOrigin(0.5, 0.5);
    this.timerText = this.add.text(0, 0, '0:00', displayStyle(32)).setOrigin(1, 0.5);
    this.pauseBtn = this.add.image(0, 0, 'pause-icon').setScale(0.6).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerup', () => {
      Audio.click();
      this.g.openPause();
    });
    this.bossBar = this.add.graphics();
    this.bossName = this.add.text(0, 0, 'THE COMPACTOR', displayStyle(20, CSS.pink)).setOrigin(0.5).setVisible(false);
    this.banner = this.add.text(0, 0, 'THE COMPACTOR IS COMING', displayStyle(44, CSS.pink)).setOrigin(0.5).setVisible(false);

    this.createPulseButton();
    this.createMoveHint();
    this.joy = this.add.graphics();

    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));

    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layout, this);
      Controls.reset();
    });
    this.layout();
  }

  private createPulseButton(): void {
    const c = this.add.container(0, 0);
    const bg = this.add.graphics();
    const icon = this.add.image(0, 0, 'pulse-icon').setScale(0.62);
    this.pulseRing = this.add.graphics();
    this.pulseKey = this.add.text(0, 0, 'SPACE', displayStyle(16, CSS.cyan)).setOrigin(0.5);
    c.add([bg, icon, this.pulseRing, this.pulseKey]);
    c.setData('bg', bg);
    this.pulseBtn = c;
  }

  private drawPulseBg(): void {
    const bg = this.pulseBtn.getData('bg') as Phaser.GameObjects.Graphics;
    const r = this.pulseRadius;
    bg.clear();
    bg.fillStyle(PAL.outline, 0.85);
    bg.fillCircle(0, 4, r + 4);
    bg.fillStyle(PAL.panel, 0.92);
    bg.fillCircle(0, 0, r);
    bg.lineStyle(4, PAL.outline);
    bg.strokeCircle(0, 0, r);
  }

  private createMoveHint(): void {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    c.add(g);
    c.setData('g', g);
    this.moveHint = c;
  }

  private drawMoveHint(): void {
    const g = this.moveHint.getData('g') as Phaser.GameObjects.Graphics;
    this.moveHint.each((child: Phaser.GameObjects.GameObject) => {
      if (child !== g) child.destroy();
    });
    g.clear();
    if (Controls.isTouch) {
      // Ghost joystick with a finger-drag arrow.
      g.lineStyle(5, PAL.outline);
      g.strokeCircle(0, 0, JOY_RADIUS);
      g.lineStyle(3, PAL.cyan, 0.9);
      g.strokeCircle(0, 0, JOY_RADIUS);
      g.fillStyle(PAL.text, 0.9);
      g.fillCircle(30, -18, 26);
      g.lineStyle(4, PAL.outline);
      g.strokeCircle(30, -18, 26);
      return;
    }
    const key = (x: number, y: number, label: string) => {
      g.fillStyle(PAL.outline);
      g.fillRoundedRect(x - 25, y - 21, 50, 50, 10);
      g.fillStyle(PAL.text);
      g.fillRoundedRect(x - 23, y - 25, 46, 46, 9);
      g.lineStyle(3, PAL.outline);
      g.strokeRoundedRect(x - 23, y - 25, 46, 46, 9);
      this.moveHint.add(this.add.text(x, y - 2, label, displayStyle(26, CSS.outline)).setStroke(CSS.outline, 0).setOrigin(0.5));
    };
    key(0, -30, 'W');
    key(-56, 26, 'A');
    key(0, 26, 'S');
    key(56, 26, 'D');
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    const touch = Controls.isTouch;
    this.levelText.setPosition(16, 28);
    this.coinIcon.setPosition(30, 104);
    this.coinText.setPosition(48, 104);
    this.junkText.setPosition(w / 2 + 14, 58);
    this.junkIcon.setPosition(w / 2 - 44, 60);
    this.timerText.setPosition(w - 18, 40);
    this.pauseBtn.setPosition(w - 18 - this.timerText.width - 40, 40);
    this.bossName.setPosition(w / 2, 108);
    this.banner.setPosition(w / 2, h * 0.32);
    this.pulseRadius = touch ? 54 : 40;
    const margin = touch ? 30 : 22;
    this.pulseBtn.setPosition(w - margin - this.pulseRadius, h - margin - this.pulseRadius - (touch ? 0 : 14));
    this.pulseKey.setPosition(0, this.pulseRadius + 16).setVisible(!touch);
    (this.pulseBtn.list[1] as Phaser.GameObjects.Image).setScale(touch ? 0.8 : 0.62);
    this.drawPulseBg();
    this.pauseBtn.setScale(touch ? 0.75 : 0.6);
    this.moveHint.setPosition(w / 2, h - (touch ? 150 : 120));
    this.drawMoveHint();
    this.shownHearts = '';
  }

  private overPulse(p: Phaser.Input.Pointer): boolean {
    return Phaser.Math.Distance.Between(p.x, p.y, this.pulseBtn.x, this.pulseBtn.y) < this.pulseRadius + 14;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    Audio.unlock();
    if (p.wasTouch && !Controls.isTouch) {
      Controls.isTouch = true;
      this.layout();
    }
    if (this.g.state !== 'playing') return;
    if (this.overPulse(p)) {
      Controls.pulseQueued = true;
      this.tweens.add({ targets: this.pulseBtn, scale: { from: 0.85, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      return;
    }
    if (Phaser.Math.Distance.Between(p.x, p.y, this.pauseBtn.x, this.pauseBtn.y) < 40) return;
    if (this.joyId !== -1) return;
    this.joyId = p.id;
    this.joyBaseX = p.x;
    this.joyBaseY = p.y;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.joyId || !p.isDown) return;
    let dx = p.x - this.joyBaseX;
    let dy = p.y - this.joyBaseY;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      // Floating joystick: the base follows the finger.
      this.joyBaseX += (dx / d) * (d - JOY_RADIUS);
      this.joyBaseY += (dy / d) * (d - JOY_RADIUS);
      dx = p.x - this.joyBaseX;
      dy = p.y - this.joyBaseY;
    }
    const len = Math.hypot(dx, dy);
    const dead = 8;
    if (len < dead) {
      Controls.touchX = Controls.touchY = 0;
    } else {
      const k = Math.min(1, (len - dead) / (JOY_RADIUS * 0.7));
      Controls.touchX = (dx / len) * k;
      Controls.touchY = (dy / len) * k;
    }
    Controls.touchActive = true;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.joyId) return;
    this.joyId = -1;
    Controls.touchX = Controls.touchY = 0;
    Controls.touchActive = false;
  }

  update(_now: number, deltaMs: number): void {
    const g = this.g;
    if (!g.player) return;
    const dt = deltaMs / 1000;
    const w = this.scale.width;
    const h = this.scale.height;
    const playing = g.state === 'playing';
    if (!playing && this.joyId !== -1) this.onUp({ id: this.joyId } as Phaser.Input.Pointer);

    // XP bar along the very top.
    const frac = Phaser.Math.Clamp(g.xp / g.xpNeed, 0, 1);
    this.xpBar.clear();
    this.xpBar.fillStyle(PAL.outline, 0.9);
    this.xpBar.fillRect(0, 0, w, 12);
    this.xpBar.fillStyle(PAL.cyan);
    this.xpBar.fillRect(0, 0, w * frac, 9);
    this.xpBar.fillStyle(0xffffff, 0.35);
    this.xpBar.fillRect(0, 0, w * frac, 3);
    if (g.level !== this.shownLevel) {
      this.shownLevel = g.level;
      this.levelText.setText(`LV ${g.level}`);
    }

    // Hearts, top-left.
    const heartKey = `${g.player.hearts}/${g.stats.maxHearts}`;
    if (heartKey !== this.shownHearts) {
      const lost = this.shownHearts !== '' && g.player.hearts < Number(this.shownHearts.split('/')[0]);
      this.shownHearts = heartKey;
      for (const img of this.hearts) img.destroy();
      this.hearts = [];
      for (let i = 0; i < g.stats.maxHearts; i++) {
        const full = i < g.player.hearts;
        const img = this.add.image(84 + i * 36, 28, full ? 'heart' : 'heart-empty').setScale(0.55);
        this.hearts.push(img);
        if (lost && i === g.player.hearts) this.tweens.add({ targets: img, scale: { from: 1.1, to: 0.55 }, duration: 400, ease: 'Back.easeOut' });
      }
    }

    // Run scrap coins.
    const coins = g.runCoins;
    if (coins !== this.shownCoins) {
      this.shownCoins = coins;
      this.coinText.setText(String(coins));
    }

    // Junk count: rolls up and bounces when it grows.
    const junk = g.junk.count;
    if (junk > this.lastJunk) this.junkBounce = 1;
    this.lastJunk = junk;
    this.shownJunk += (junk - this.shownJunk) * (1 - Math.exp(-12 * dt));
    if (Math.abs(junk - this.shownJunk) < 0.5) this.shownJunk = junk;
    this.junkText.setText(String(Math.round(this.shownJunk)));
    this.junkBounce = Math.max(0, this.junkBounce - dt * 4);
    const b = Phaser.Math.Easing.Back.Out(1 - this.junkBounce);
    this.junkText.setScale(1 + (1 - b) * 0.35 + (junk >= 150 ? 0.05 * Math.sin(_now / 120) : 0));
    this.junkText.setColor(junk >= 150 ? CSS.brass : CSS.text);
    this.junkIcon.rotation += dt * (1 + junk / 30);

    const seconds = Math.floor(g.runTime);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.timerText.setText(formatTime(seconds));
      this.pauseBtn.x = w - 18 - this.timerText.width - 40;
    }

    // Boss warning + health bar.
    const boss = g.state === 'levelup' ? null : g.bossActive;
    if (g.bossWarningAt >= 0 && !this.bannerShown) {
      this.bannerShown = true;
      this.banner.setVisible(true).setScale(0).setAlpha(1);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 450, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 3000, duration: 500, ease: 'Sine.easeIn' });
    }
    this.bossBar.clear();
    this.bossName.setVisible(!!boss);
    if (boss) {
      const bw = Math.min(520, w - 300);
      const x = w / 2 - bw / 2;
      const y = 124;
      this.bossBar.fillStyle(PAL.outline);
      this.bossBar.fillRoundedRect(x - 4, y - 4, bw + 8, 22, 8);
      this.bossBar.fillStyle(0x3a3346);
      this.bossBar.fillRoundedRect(x, y, bw, 14, 6);
      this.bossBar.fillStyle(PAL.pink);
      this.bossBar.fillRoundedRect(x, y, Math.max(6, bw * Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1)), 14, 6);
    }

    // Pulse button with cooldown ring; it glows to teach Pulse at ~20 s.
    const cd = g.player.pulseCd;
    const ready = cd <= 0;
    const r = this.pulseRadius;
    this.pulseRing.clear();
    if (!ready) {
      const k = 1 - cd / g.stats.pulseCooldown;
      this.pulseRing.lineStyle(7, PAL.cyan, 0.9);
      this.pulseRing.beginPath();
      this.pulseRing.arc(0, 0, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      this.pulseRing.strokePath();
      this.pulseBtn.setAlpha(0.65);
    } else {
      this.pulseBtn.setAlpha(1);
      this.pulseRing.lineStyle(4, PAL.cyan, 0.9);
      this.pulseRing.strokeCircle(0, 0, r - 4);
    }
    const teach = playing && !g.pulseUsed && g.runTime > 19;
    if (teach) {
      const k = (Math.sin(_now / 140) + 1) / 2;
      this.pulseRing.lineStyle(6, PAL.cyan, 0.4 + k * 0.6);
      this.pulseRing.strokeCircle(0, 0, r + 10 + k * 10);
      this.pulseBtn.setScale(1 + k * 0.12);
    } else if (this.pulseBtn.scale > 1.001 && !this.tweens.isTweening(this.pulseBtn)) {
      this.pulseBtn.setScale(1);
    }
    this.pulseBtn.setVisible(g.state !== 'intro');

    // Movement glyph until the first move.
    if (g.player.hasMoved) {
      this.moveHint.alpha = Math.max(0, this.moveHint.alpha - dt * 2.5);
    } else {
      this.moveHint.alpha = 0.6 + 0.4 * Math.sin(_now / 220);
    }
    this.moveHint.setVisible(this.moveHint.alpha > 0.01);

    // Floating joystick.
    this.joy.clear();
    if (this.joyId !== -1) {
      this.joy.fillStyle(PAL.outline, 0.35);
      this.joy.fillCircle(this.joyBaseX, this.joyBaseY, JOY_RADIUS);
      this.joy.lineStyle(3, PAL.cyan, 0.7);
      this.joy.strokeCircle(this.joyBaseX, this.joyBaseY, JOY_RADIUS);
      this.joy.fillStyle(PAL.text, 0.9);
      this.joy.fillCircle(
        this.joyBaseX + Controls.touchX * JOY_RADIUS * 0.7,
        this.joyBaseY + Controls.touchY * JOY_RADIUS * 0.7,
        28,
      );
      this.joy.lineStyle(4, PAL.outline);
      this.joy.strokeCircle(this.joyBaseX + Controls.touchX * JOY_RADIUS * 0.7, this.joyBaseY + Controls.touchY * JOY_RADIUS * 0.7, 28);
    }

    // Red edge flash when a heart is lost; pink pulse on low health.
    this.vignette.clear();
    const lowHp = g.player.hearts === 1 && g.junk.count === 0 && playing ? 0.18 + Math.sin(_now / 200) * 0.08 : 0;
    const a = Math.max(g.hurtFlash * 0.45, lowHp);
    if (a > 0.01) {
      const t = 26;
      this.vignette.fillStyle(PAL.red, a);
      this.vignette.fillRect(0, 0, w, t);
      this.vignette.fillRect(0, h - t, w, t);
      this.vignette.fillRect(0, 0, t, h);
      this.vignette.fillRect(w - t, 0, t, h);
    }
  }
}

