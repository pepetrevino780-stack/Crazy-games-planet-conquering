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
  private hpBar!: Phaser.GameObjects.Graphics;
  private topBand!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private shownHp = 1;
  private lastHp = 1;
  private hpShake = 0;
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
  private shownLevel = -1;
  private bannerShownAt = -1;
  private capBar!: Phaser.GameObjects.Graphics;
  private capText!: Phaser.GameObjects.Text;
  private joyId = -1;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private pulseRadius = 40;
  private specialBtn!: Phaser.GameObjects.Container;
  private abilityGfx!: Phaser.GameObjects.Graphics;
  private threatGfx!: Phaser.GameObjects.Graphics;
  private abilityIcons: Phaser.GameObjects.Image[] = [];
  private abilityLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('HUD');
  }

  create(): void {
    this.g = this.scene.get('Game') as GameScene;
    this.shownJunk = 0;
    this.lastJunk = 0;
    this.junkBounce = 0;
    this.shownCoins = this.shownSeconds = this.shownLevel = -1;
    this.bannerShownAt = -1;
    this.joyId = -1;
    this.shownHp = this.lastHp = 1;
    this.hpShake = 0;
    // A dark band behind the top HUD so the arena never shows through the bars and numbers.
    // Created first so it sits BEHIND the health bar (on top, it made the bar look greyed out).
    this.topBand = this.add.graphics();
    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(0, 0, '', displayStyle(15)).setOrigin(0.5);
    this.phaseText = this.add.text(0, 0, '', displayStyle(24, CSS.pink)).setOrigin(1, 0.5);

    this.vignette = this.add.graphics();
    this.xpBar = this.add.graphics();
    this.levelText = this.add.text(0, 0, '', displayStyle(18, CSS.text)).setOrigin(0, 0.5);
    this.capBar = this.add.graphics();
    this.capText = this.add.text(0, 0, '', displayStyle(15, CSS.dim)).setOrigin(0, 0.5);
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
    this.bossName = this.add.text(0, 0, '', displayStyle(20, CSS.pink)).setOrigin(0.5).setVisible(false);
    this.banner = this.add.text(0, 0, '', displayStyle(44, CSS.pink)).setOrigin(0.5).setVisible(false);

    this.createPulseButton();
    this.abilityGfx = this.add.graphics();
    this.threatGfx = this.add.graphics();
    this.abilityIcons = [0, 1, 2].map(() => this.add.image(0, 0, 'icon-fireball').setScale(0.42).setVisible(false));
    this.abilityLabels = [0, 1, 2].map(() => this.add.text(0, 0, '', displayStyle(13, CSS.text)).setOrigin(0.5).setVisible(false));
    const sb = this.add.container(0, 0);
    const sbg = this.add.graphics();
    sbg.fillStyle(PAL.outline, 0.85);
    sbg.fillCircle(0, 4, 44);
    sbg.fillStyle(PAL.panel, 0.92);
    sbg.fillCircle(0, 0, 40);
    sbg.lineStyle(4, PAL.outline);
    sbg.strokeCircle(0, 0, 40);
    sb.add([sbg, this.add.image(0, 0, 'icon-junkShotgun').setScale(0.6)]);
    sb.setVisible(false);
    this.specialBtn = sb;
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
    this.topBand.clear();
    this.topBand.fillGradientStyle(PAL.outline, PAL.outline, PAL.outline, PAL.outline, 0.85, 0.85, 0, 0);
    this.topBand.fillRect(0, 0, w, 150);
    const touch = Controls.isTouch;
    this.levelText.setPosition(10, 11);
    this.coinIcon.setPosition(30, 84);
    this.coinText.setPosition(48, 84);
    this.junkText.setPosition(w / 2 + 14, 62);
    this.junkIcon.setPosition(w / 2 - 44, 64);
    this.timerText.setPosition(w - 18, 46);
    this.pauseBtn.setPosition(w - 18 - this.timerText.width - 40, 46);
    this.bossName.setPosition(w / 2, 132);
    this.banner.setPosition(w / 2, h * 0.32);
    this.pulseRadius = touch ? 54 : 40;
    const margin = touch ? 30 : 22;
    this.pulseBtn.setPosition(w - margin - this.pulseRadius, h - margin - this.pulseRadius - (touch ? 0 : 14));
    this.pulseKey.setPosition(0, this.pulseRadius + 16).setVisible(!touch);
    (this.pulseBtn.list[1] as Phaser.GameObjects.Image).setScale(touch ? 0.8 : 0.62);
    this.drawPulseBg();
    this.specialBtn.setPosition(this.pulseBtn.x - this.pulseRadius - 62, this.pulseBtn.y + 8);
    this.pauseBtn.setScale(touch ? 0.75 : 0.6);
    this.moveHint.setPosition(w / 2, h - (touch ? 150 : 120));
    this.drawMoveHint();
  }

  /** Cooldown icons next to the Pulse button: Fireball, the special, Meteor Drop. */
  private updateAbilities(now: number): void {
    const g = this.g;
    const w = g.weapons;
    const touch = Controls.isTouch;
    const specials = w.specials;
    const slots: { icon: string; label: string; cd: number; max: number; ready: boolean }[] = [];
    slots.push({ icon: 'icon-fireball', label: touch ? 'AUTO' : 'L-CLICK', cd: w.fireCd, max: 0.6 * g.stats.fbRateMult, ready: w.fireCd <= 0 });
    if (specials.length && !touch) {
      const icon = specials[0] === 'shotgun' ? 'icon-junkShotgun' : 'icon-magnetMine';
      slots.push({ icon, label: 'R-CLICK', cd: w.specialCd, max: specials[0] === 'shotgun' ? g.stats.shotgunCooldown : g.stats.mineCooldown, ready: w.specialCd <= 0 });
    }
    if (g.stats.meteor && !touch) slots.push({ icon: 'icon-meteorDrop', label: 'HOLD', cd: w.meteorCd, max: 8, ready: w.meteorCd <= 0 });
    const gfx = this.abilityGfx;
    gfx.clear();
    const baseX = this.pulseBtn.x - this.pulseRadius - (touch && specials.length ? 120 : 36);
    const y = this.pulseBtn.y + (touch ? 30 : 18);
    for (let i = 0; i < 3; i++) {
      const slot = slots[i];
      const icon = this.abilityIcons[i];
      const label = this.abilityLabels[i];
      if (!slot || !this.pulseBtn.visible) {
        icon.setVisible(false);
        label.setVisible(false);
        continue;
      }
      const x = baseX - i * 58;
      gfx.fillStyle(PAL.outline, 0.85);
      gfx.fillCircle(x, y, 25);
      gfx.fillStyle(PAL.panel, 0.92);
      gfx.fillCircle(x, y, 22);
      if (!slot.ready) {
        gfx.lineStyle(5, PAL.brass, 0.9);
        gfx.beginPath();
        gfx.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - slot.cd / Math.max(0.01, slot.max)));
        gfx.strokePath();
      } else {
        gfx.lineStyle(3, PAL.brass, 0.8);
        gfx.strokeCircle(x, y, 22);
      }
      icon.setTexture(slot.icon).setPosition(x, y).setAlpha(slot.ready ? 1 : 0.5).setVisible(true);
      label.setText(slot.label).setPosition(x, y + 34).setVisible(true);
    }
    // Touch: a second button for the special, next to Pulse.
    this.specialBtn.setVisible(touch && specials.length > 0 && this.pulseBtn.visible);
    if (this.specialBtn.visible) {
      (this.specialBtn.list[1] as Phaser.GameObjects.Image).setTexture(specials[0] === 'shotgun' ? 'icon-junkShotgun' : 'icon-magnetMine');
      this.specialBtn.setAlpha(w.specialCd > 0 ? 0.55 : 1);
    }
    void now;
  }

  private drawThreats(g: GameScene): void {
    const gfx = this.threatGfx;
    gfx.clear();
    if (g.state !== 'playing') return;
    const cam = g.cameras.main;
    const view = cam.worldView;
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;
    let shown = 0;
    for (const e of g.enemies.pool.items) {
      if (shown >= 8) break;
      if (!e.active || e.hidden) continue;
      const big = e.kind === 'boss' || e.kind === 'crusher' || e.kind === 'magnetron';
      if (!big && e.kind !== 'bomber' && e.kind !== 'driller') continue;
      if (view.contains(e.x, e.y)) continue;
      const sx = (e.x - view.x) * cam.zoom;
      const sy = (e.y - view.y) * cam.zoom;
      const dx = sx - cx;
      const dy = sy - cy;
      if (Math.hypot(dx, dy) > Math.max(w, h) * 1.3) continue;
      // Clamp to the screen edge.
      const k = Math.min((w / 2 - 34) / Math.abs(dx || 1e-6), (h / 2 - 34) / Math.abs(dy || 1e-6));
      const ex = cx + dx * k;
      const ey = cy + dy * k;
      const a = Math.atan2(dy, dx);
      const size = big ? 20 : 13;
      const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 120);
      gfx.fillStyle(PAL.red, 0.25 * pulse);
      gfx.fillCircle(ex, ey, size * 1.8);
      gfx.fillStyle(big ? PAL.pink : PAL.red, 0.9);
      gfx.lineStyle(3, PAL.outline);
      const p1x = ex + Math.cos(a) * size;
      const p1y = ey + Math.sin(a) * size;
      const p2x = ex + Math.cos(a + 2.5) * size;
      const p2y = ey + Math.sin(a + 2.5) * size;
      const p3x = ex + Math.cos(a - 2.5) * size;
      const p3y = ey + Math.sin(a - 2.5) * size;
      gfx.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
      gfx.strokeTriangle(p1x, p1y, p2x, p2y, p3x, p3y);
      shown++;
    }
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
    if (Controls.isTouch && this.specialBtn.visible && Phaser.Math.Distance.Between(p.x, p.y, this.specialBtn.x, this.specialBtn.y) < 54) {
      Controls.specialQueued = true;
      this.tweens.add({ targets: this.specialBtn, scale: { from: 0.85, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      return;
    }
    if (!p.wasTouch) {
      // Mouse: left button fires (hold for Meteor Drop), right button uses the special.
      Controls.aimX = p.x;
      Controls.aimY = p.y;
      Controls.hasAim = true;
      if (p.rightButtonDown()) Controls.specialQueued = true;
      else Controls.fireHeld = true;
      return;
    }
    if (this.joyId !== -1) return;
    this.joyId = p.id;
    this.joyBaseX = p.x;
    this.joyBaseY = p.y;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.wasTouch) {
      Controls.aimX = p.x;
      Controls.aimY = p.y;
      Controls.hasAim = true;
    }
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
    if (!p.wasTouch && !p.leftButtonDown()) Controls.fireHeld = false;
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

    // Thick XP bar along the top, with the level inside it.
    const frac = Phaser.Math.Clamp(g.xp / g.xpNeed, 0, 1);
    const barH = 22;
    this.xpBar.clear();
    this.xpBar.fillStyle(PAL.outline, 0.92);
    this.xpBar.fillRect(0, 0, w, barH + 3);
    this.xpBar.fillStyle(0x2a2533);
    this.xpBar.fillRect(0, 0, w, barH);
    this.xpBar.fillStyle(PAL.cyan);
    this.xpBar.fillRect(0, 0, w * frac, barH);
    this.xpBar.fillStyle(0xffffff, 0.3);
    this.xpBar.fillRect(0, 0, w * frac, 6);

    // Capacity bar under the junk count: fills as the ball nears its current cap.
    const cap = g.junk.cap;
    const fill = Phaser.Math.Clamp(g.junk.count / cap, 0, 1);
    const cw = 170;
    const cx = w / 2 - cw / 2;
    const cy = 96;
    this.capBar.clear();
    this.capBar.fillStyle(PAL.outline, 0.9);
    this.capBar.fillRoundedRect(cx - 3, cy - 3, cw + 6, 14, 6);
    this.capBar.fillStyle(0x3a3346);
    this.capBar.fillRoundedRect(cx, cy, cw, 8, 4);
    this.capBar.fillStyle(fill >= 1 ? PAL.brass : PAL.cyan);
    this.capBar.fillRoundedRect(cx, cy, Math.max(8, cw * fill), 8, 4);
    const capLabel = fill >= 1 ? `FULL ${cap} · fusing` : `${g.junk.count}/${cap}`;
    if (this.capText.text !== capLabel) this.capText.setText(capLabel);
    this.capText.setPosition(cx + cw + 10, cy + 4).setColor(fill >= 1 ? CSS.brass : CSS.dim);
    if (g.level !== this.shownLevel) {
      this.shownLevel = g.level;
      this.levelText.setText(`LV ${g.level}`);
    }

    // Health bar, top-left: flashes red under 30%.
    const hpFrac = Phaser.Math.Clamp(g.player.hp / g.stats.maxHp, 0, 1);
    this.shownHp += (hpFrac - this.shownHp) * (1 - Math.exp(-10 * dt));
    if (hpFrac < this.lastHp - 0.001) this.hpShake = 1;
    this.lastHp = hpFrac;
    this.hpShake = Math.max(0, this.hpShake - dt * 4);
    const hx = 16 + (this.hpShake > 0 ? Math.sin(_now / 20) * 4 * this.hpShake : 0);
    const hy = 36;
    const hw = Math.min(240, w * 0.28);
    const hh = 20;
    const low = hpFrac < 0.3;
    const blink = low && Math.sin(_now / 90) > 0;
    // Bright, saturated fill: green when healthy, yellow from half, red (blinking) when low.
    const color = low ? (blink ? 0xffffff : 0xff3b30) : hpFrac < 0.5 ? 0xffd23f : 0x39e75f;
    this.hpBar.clear();
    this.hpBar.fillStyle(PAL.outline);
    this.hpBar.fillRoundedRect(hx - 3, hy - 3, hw + 6, hh + 6, 8);
    this.hpBar.fillStyle(0x1a1024);
    this.hpBar.fillRoundedRect(hx, hy, hw, hh, 6);
    // Damage trail: only the chunk just lost, in orange, shrinking after a hit.
    if (this.shownHp > hpFrac + 0.003) {
      this.hpBar.fillStyle(0xff8a3d, 0.9);
      this.hpBar.fillRoundedRect(hx, hy, Math.max(6, hw * this.shownHp), hh, 6);
    }
    this.hpBar.fillStyle(color);
    this.hpBar.fillRoundedRect(hx, hy, Math.max(6, hw * hpFrac), hh, 6);
    this.hpBar.fillStyle(0xffffff, 0.22);
    this.hpBar.fillRoundedRect(hx + 4, hy + 3, Math.max(0, hw * hpFrac - 8), 4, 2);
    const hpLabel = `${Math.ceil(g.player.hp)}/${Math.round(g.stats.maxHp)}`;
    if (this.hpText.text !== hpLabel) this.hpText.setText(hpLabel);
    this.hpText.setPosition(hx + hw / 2, hy + hh / 2);

    // Current aggression phase, under the timer.
    if (this.phaseText.text !== g.phaseLabel) {
      this.phaseText.setText(g.phaseLabel);
      this.tweens.add({ targets: this.phaseText, scale: { from: 1.8, to: 1 }, duration: 600, ease: 'Back.easeOut' });
    }
    this.phaseText.setPosition(w - 18, 80).setVisible(g.isRun);

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
    this.junkText.setScale(1 + (1 - b) * 0.35 + (junk >= cap ? 0.05 * Math.sin(_now / 120) : 0));
    this.junkText.setColor(junk >= cap ? CSS.brass : CSS.text);
    this.junkIcon.rotation += dt * (1 + junk / 30);

    const seconds = Math.floor(g.runTime);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.timerText.setText(formatTime(seconds));
      this.pauseBtn.x = w - 18 - this.timerText.width - 40;
    }

    // Boss warning + health bar.
    const boss = g.state === 'levelup' ? null : g.bossActive;
    if (g.bannerAt >= 0 && g.bannerAt !== this.bannerShownAt) {
      this.bannerShownAt = g.bannerAt;
      this.tweens.killTweensOf(this.banner);
      this.banner.setText(g.bannerText).setColor(g.bannerText.startsWith('RARE') ? CSS.brass : CSS.pink);
      this.banner.setVisible(true).setScale(0).setAlpha(1);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 450, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.banner, alpha: 0, delay: 3000, duration: 500, ease: 'Sine.easeIn' });
    }
    this.bossBar.clear();
    this.bossName.setVisible(!!boss);
    if (boss && this.bossName.text !== boss.def.name.toUpperCase()) this.bossName.setText(boss.def.name.toUpperCase());
    if (boss) {
      const bw = Math.min(520, w - 300);
      const x = w / 2 - bw / 2;
      const y = 148;
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
      // Gold when the ball is full: the next Pulse is Overcharged.
      const full = g.junk.count >= g.junk.cap;
      this.pulseRing.lineStyle(full ? 6 : 4, full ? PAL.brass : PAL.cyan, 0.95);
      this.pulseRing.strokeCircle(0, 0, r - 4);
      if (full) {
        const k = (Math.sin(_now / 110) + 1) / 2;
        this.pulseRing.lineStyle(4, PAL.brass, 0.3 + k * 0.5);
        this.pulseRing.strokeCircle(0, 0, r + 6 + k * 6);
      }
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
    if (!playing) Controls.fireHeld = false;
    this.updateAbilities(_now);

    // Movement glyph until the first move.
    if (g.player.hasMoved || g.runTime > 10 || !playing) {
      this.moveHint.alpha = Math.max(0, this.moveHint.alpha - dt * 3);
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

    // Off-screen danger: red arrows at the screen edge pointing at bosses, Bombers and Drillers.
    this.drawThreats(g);

    // Red edge flash when you get hit; a pulse while health is low.
    this.vignette.clear();
    const lowHp = g.player.hp / g.stats.maxHp < 0.3 && playing ? 0.2 + Math.sin(_now / 160) * 0.1 : 0;
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

