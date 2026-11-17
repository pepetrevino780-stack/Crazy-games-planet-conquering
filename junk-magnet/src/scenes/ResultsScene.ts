import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle, formatTime } from '../config';
import { Audio } from '../systems/AudioManager';
import { CrazySDK } from '../systems/CrazySDK';
import { Meta } from '../systems/MetaSave';
import { Button, drawPanel } from '../ui/widgets';
import type { GameScene, RunResult } from './GameScene';

/** Death or victory → results → Play again in one click. */
export class ResultsScene extends Phaser.Scene {
  private result!: RunResult;
  private ready = false;

  constructor() {
    super('Results');
  }

  init(result: RunResult): void {
    this.result = result;
    this.ready = false;
  }

  create(): void {
    const build = () => this.build();
    build();
    // A short guard so a held key from the run doesn't skip the screen.
    this.time.delayedCall(350, () => (this.ready = true));
    this.input.keyboard?.on('keydown-SPACE', () => this.ready && this.playAgain());
    this.input.keyboard?.on('keydown-ENTER', () => this.ready && this.playAgain());
    this.scale.on('resize', build);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', build));
  }

  private build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    const r = this.result;
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.add.rectangle(0, 0, w, h, PAL.outline, 0.55).setOrigin(0).setInteractive();

    const pw = Math.min(560, w - 32);
    const ph = Math.min(640, h - 30);
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    const panel = this.add.graphics();
    drawPanel(panel, px, py, pw, ph, r.win ? PAL.brass : PAL.pink);

    const title = this.add
      .text(w / 2, py + 54, r.win ? 'COMPACTOR CRUSHED!' : 'SCRAPPED!', displayStyle(r.win ? 44 : 56, r.win ? CSS.brass : CSS.text))
      .setOrigin(0.5)
      .setScale(0);
    this.tweens.add({ targets: title, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.add
      .text(w / 2, py + 96, r.daily ? `Daily Seed · ${r.mapName}` : r.mapName, bodyStyle(20, CSS.dim))
      .setOrigin(0.5);

    const rows: [string, number, (v: number) => string][] = [
      ['Survived', r.time, (v) => formatTime(v)],
      ['Bots smashed', r.kills, (v) => String(Math.round(v))],
      ['Biggest junk ball', r.peakJunk, (v) => String(Math.round(v))],
      ['Score', r.score, (v) => String(Math.round(v))],
    ];
    const rowH = Math.min(44, (ph - 380) / 4 + 20);
    rows.forEach(([label, value, fmt], i) => {
      const y = py + 140 + i * rowH;
      this.add.text(px + 44, y, label, bodyStyle(22, CSS.text)).setOrigin(0, 0.5);
      const t = this.add.text(px + pw - 44, y, fmt(0), displayStyle(30, i === 3 ? CSS.cyan : CSS.text)).setOrigin(1, 0.5);
      this.rollUp(t, value, fmt, 250 + i * 160);
    });

    const coinsY = py + 140 + rows.length * rowH + 22;
    const coinRow = this.add.container(w / 2, coinsY);
    const coin = this.add.image(-70, 0, 'coin').setScale(0.9);
    const coinText = this.add.text(-44, 0, '+0', displayStyle(40, CSS.brass)).setOrigin(0, 0.5);
    coinRow.add([coin, coinText]);
    this.rollUp(coinText, r.coins, (v) => `+${Math.round(v)}`, 950, () => Audio.coin());
    const parts = [`bots ${r.scrapKills}`, `ball ${r.scrapJunk}`];
    if (r.scrapOverflow) parts.push(`overflow ${r.scrapOverflow}`);
    if (r.scrapWin) parts.push(`victory ${r.scrapWin}`);
    this.add.text(w / 2, coinsY + 34, `${parts.join(' · ')}   ·   total ${Meta.data.coins}`, bodyStyle(18, CSS.dim)).setOrigin(0.5);

    if (r.newBest || r.daily) {
      const label = r.newBest ? 'NEW BEST!' : `TODAY'S BEST ${r.dailyBest}`;
      const badge = this.add.text(px + pw - 20, py + 18, label, displayStyle(24, CSS.lime)).setOrigin(1, 0.5).setAngle(8);
      this.tweens.add({ targets: badge, scale: { from: 1.25, to: 1 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const btnY = py + ph - 150;
    const play = new Button(this, w / 2, btnY, {
      width: Math.min(360, pw - 60),
      height: 76,
      label: 'PLAY AGAIN',
      fill: PAL.red,
      tilt: -2,
      onClick: () => this.playAgain(),
    });
    play.setScale(0);
    this.tweens.add({ targets: play, scale: 1, duration: 350, delay: 150, ease: 'Back.easeOut' });

    const small = Math.min(170, (pw - 70) / 2);
    const row2 = py + ph - 62;
    if (CrazySDK.active && r.coins > 0) {
      const dbl: Button = new Button(this, w / 2, row2 - 0, {
        width: Math.min(260, pw - 60),
        height: 52,
        label: 'DOUBLE SCRAP ▶',
        fill: PAL.brass,
        textColor: CSS.outline,
        fontSize: 24,
        onClick: () => {
          dbl.setEnabled(false);
          CrazySDK.rewarded(
            () => {
              Meta.data.coins += r.coins;
              r.coins *= 2;
              Meta.save();
              coinText.setText(`+${r.coins}`);
              Audio.coin();
            },
            () => dbl.setVisible(false),
          );
        },
      });
      dbl.text.setStroke(CSS.outline, 0);
      this.smallButtons(w, row2 + 0, small, true);
    } else {
      this.smallButtons(w, row2, small, false);
    }
  }

  private smallButtons(w: number, y: number, bw: number, shifted: boolean): void {
    const g = this.scene.get('Game') as GameScene;
    const offset = shifted ? bw + 70 : bw / 2 + 10;
    new Button(this, w / 2 - offset, y, {
      width: bw,
      height: 52,
      label: 'GARAGE',
      fill: 0x5a5266,
      fontSize: 24,
      onClick: () => {
        this.scene.stop();
        g.scene.restart({ mode: 'menu', garage: true });
      },
    });
    new Button(this, w / 2 + offset, y, {
      width: bw,
      height: 52,
      label: 'MENU',
      fill: 0x5a5266,
      fontSize: 24,
      onClick: () => {
        this.scene.stop();
        g.scene.restart({ mode: 'menu' });
      },
    });
  }

  private rollUp(text: Phaser.GameObjects.Text, value: number, fmt: (v: number) => string, delay: number, onDone?: () => void): void {
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: value,
      delay,
      duration: 600,
      ease: 'Cubic.easeOut',
      onUpdate: () => text.setText(fmt(counter.v)),
      onComplete: () => {
        text.setText(fmt(value));
        onDone?.();
        this.tweens.add({ targets: text, scale: { from: 1.25, to: 1 }, duration: 200, ease: 'Back.easeOut' });
      },
    });
  }

  private playAgain(): void {
    if (!this.ready) return;
    this.ready = false;
    Audio.unlock();
    const g = this.scene.get('Game') as GameScene;
    const daily = this.result.daily;
    CrazySDK.midgame(() => {
      this.scene.stop();
      g.scene.restart({ mode: 'run', daily });
    });
  }
}
