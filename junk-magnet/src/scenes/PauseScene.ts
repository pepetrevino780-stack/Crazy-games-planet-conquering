import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';
import { CrazySDK } from '../systems/CrazySDK';
import { Meta } from '../systems/MetaSave';
import { Button, Slider, drawPanel } from '../ui/widgets';
import type { GameScene } from './GameScene';

/** Pause overlay. All settings live here, never in front of play. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }

  private fromTab = false;

  init(data: { fromTab?: boolean }): void {
    this.fromTab = !!data?.fromTab;
  }

  create(): void {
    const g = this.scene.get('Game') as GameScene;
    const s = Meta.data.settings;
    const build = () => {
      this.children.removeAll(true);
      const w = this.scale.width;
      const h = this.scale.height;
      this.cameras.main.setSize(w, h);
      this.add.rectangle(0, 0, w, h, PAL.outline, 0.6).setOrigin(0).setInteractive();
      const pw = Math.min(480, w - 40);
      const ph = 560;
      const px = w / 2 - pw / 2;
      const py = Math.max(20, h / 2 - ph / 2);
      const panel = this.add.graphics();
      drawPanel(panel, px, py, pw, ph, PAL.cyan);
      this.add.text(w / 2, py + 52, 'PAUSED', displayStyle(52)).setOrigin(0.5);
      if (this.fromTab) {
        // Tell players why the game stopped when they come back to the tab.
        const hint = this.add
          .text(w / 2, Math.max(16, py - 30), 'Paused while you were away. Click RESUME or press P.', displayStyle(20, CSS.cyan))
          .setOrigin(0.5);
        this.tweens.add({ targets: hint, alpha: { from: 1, to: 0.5 }, duration: 700, yoyo: true, repeat: -1 });
      }

      new Button(this, w / 2, py + 132, { width: pw - 80, height: 66, label: 'RESUME', fill: PAL.red, onClick: () => g.resumeFromPause() });

      const row = (y: number, label: string) => this.add.text(px + 40, y, label, bodyStyle(22, CSS.text)).setOrigin(0, 0.5);
      const sliderW = pw - 210;
      row(py + 220, 'Music');
      new Slider(this, px + pw - 40 - sliderW / 2, py + 220, sliderW, s.music, (v) => {
        s.music = v;
        Audio.setVolumes(s.music, s.sfx);
      });
      row(py + 280, 'Sound FX');
      new Slider(this, px + pw - 40 - sliderW / 2, py + 280, sliderW, s.sfx, (v) => {
        s.sfx = v;
        Audio.setVolumes(s.music, s.sfx);
        Audio.clink();
      });
      const toggle = (y: number, label: string, get: () => boolean, set: (v: boolean) => void) => {
        row(y, label);
        const btn = new Button(this, px + pw - 40 - 70, y, {
          width: 140,
          height: 48,
          label: get() ? 'ON' : 'OFF',
          fill: get() ? PAL.cyan : 0x5a5266,
          textColor: get() ? CSS.outline : CSS.text,
          fontSize: 24,
          onClick: () => {
            set(!get());
            btn.setLabel(get() ? 'ON' : 'OFF').setFill(get() ? PAL.cyan : 0x5a5266);
            btn.text.setColor(get() ? CSS.outline : CSS.text);
            Meta.save();
          },
        });
        btn.text.setStroke(CSS.outline, get() ? 0 : 4);
      };
      toggle(py + 345, 'Screen shake', () => s.shake, (v) => (s.shake = v));
      toggle(py + 410, 'Low effects', () => s.lowFx, (v) => (s.lowFx = v));

      new Button(this, w / 2, py + ph - 62, {
        width: pw - 80,
        height: 58,
        label: 'QUIT TO MENU',
        fill: 0x5a5266,
        fontSize: 26,
        onClick: () => {
          Meta.save();
          CrazySDK.gameplayStop();
          this.scene.stop('HUD');
          this.scene.stop();
          g.scene.restart({ mode: 'menu' });
        },
      });
    };
    build();
    this.input.keyboard?.on('keydown-P', () => {
      Meta.save();
      g.resumeFromPause();
    });
    this.input.on('pointerup', () => Meta.save());
    this.scale.on('resize', build);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', build));
  }
}
