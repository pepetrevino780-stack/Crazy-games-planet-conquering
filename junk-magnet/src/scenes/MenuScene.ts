import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';
import { Controls } from '../systems/Controls';
import { Meta } from '../systems/MetaSave';
import { todayKey } from '../rng';
import { Button } from '../ui/widgets';
import type { GameScene } from './GameScene';

/** Title screen: a big PLAY button over the live arena. One click starts. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const build = () => this.build();
    build();
    this.input.keyboard?.on('keydown-ENTER', () => this.play(false));
    this.input.keyboard?.on('keydown-SPACE', () => this.play(false));
    this.scale.on('resize', build);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', build));
  }

  private build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    // Soft vignette so the title reads over the live arena.
    const shade = this.add.graphics();
    shade.fillStyle(PAL.outline, 0.35);
    shade.fillRect(0, 0, w, h);

    const titleY = h * 0.25;
    const glow = this.add.graphics();
    glow.fillStyle(PAL.cyan, 0.08);
    glow.fillCircle(w / 2, titleY + 10, 210);
    glow.fillStyle(PAL.cyan, 0.08);
    glow.fillCircle(w / 2, titleY + 10, 150);
    const size = Math.min(110, w / 7);
    const junk = this.add.text(w / 2, titleY - size * 0.42, 'JUNK', displayStyle(size)).setOrigin(0.5).setAngle(-4);
    const magnet = this.add.text(w / 2, titleY + size * 0.48, 'MAGNET', displayStyle(size, CSS.red)).setOrigin(0.5).setAngle(-4);
    magnet.setShadow(0, 0, CSS.cyan, 18, true, false);
    for (const [t, d] of [
      [junk, 0],
      [magnet, 180],
    ] as const) {
      t.setScale(0);
      this.tweens.add({ targets: t, scale: 1, duration: 500, delay: d, ease: 'Back.easeOut' });
      this.tweens.add({ targets: t, y: t.y - 6, duration: 1400, delay: 600 + d, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const play = new Button(this, w / 2, h * 0.58, {
      width: Math.min(340, w - 80),
      height: 96,
      label: 'PLAY',
      fill: PAL.red,
      fontSize: 56,
      tilt: -2,
      onClick: () => this.play(false),
    });
    this.tweens.add({ targets: play, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const bw = Math.min(200, (w - 100) / 2);
    const rowY = h * 0.58 + 98;
    new Button(this, w / 2 - bw / 2 - 12, rowY, {
      width: bw,
      height: 58,
      label: 'GARAGE',
      fill: 0x5a5266,
      fontSize: 26,
      onClick: () => {
        this.scene.stop();
        this.scene.launch('Garage');
      },
    });
    new Button(this, w / 2 + bw / 2 + 12, rowY, {
      width: bw,
      height: 58,
      label: 'DAILY',
      fill: PAL.cyan,
      textColor: CSS.outline,
      fontSize: 26,
      onClick: () => this.play(true),
    }).text.setStroke(CSS.outline, 0);
    const daily = Meta.data.daily.key === todayKey() ? `Today's best: ${Meta.data.daily.best}` : 'Same map for everyone today';
    this.add.text(w / 2 + bw / 2 + 12, rowY + 46, daily, bodyStyle(18, CSS.dim)).setOrigin(0.5);

    const coins = this.add.container(w - 20, 34);
    const ct = this.add.text(0, 0, String(Meta.data.coins), displayStyle(30, CSS.brass)).setOrigin(1, 0.5);
    coins.add([ct, this.add.image(-ct.width - 22, 0, 'coin').setScale(0.75)]);
    if (Meta.data.best.score > 0) {
      this.add.text(20, 34, `Best ${Meta.data.best.score}`, displayStyle(24, CSS.cyan)).setOrigin(0, 0.5);
    }

    const hint = Controls.isTouch || this.sys.game.device.input.touch && !this.sys.game.device.os.desktop
      ? 'Drag to move  ·  Tap the Pulse button'
      : 'Move: WASD / Arrows   ·   Pulse: Space   ·   Pause: P';
    this.add.text(w / 2, h - 28, hint, bodyStyle(18, CSS.dim)).setOrigin(0.5);
  }

  private play(daily: boolean): void {
    Audio.unlock();
    const g = this.scene.get('Game') as GameScene;
    this.scene.stop();
    g.scene.restart({ mode: 'run', daily });
  }
}
