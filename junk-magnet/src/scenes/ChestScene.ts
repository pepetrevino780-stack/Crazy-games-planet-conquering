import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';
import { Meta } from '../systems/MetaSave';
import { Rewards } from '../systems/Rewards';
import { cardById } from '../systems/UpgradeSystem';
import { Button, drawPanel } from '../ui/widgets';
import type { GameScene } from './GameScene';

export interface ChestConfig {
  /** run: treasure chest during a run (upgrades). daily / bonus: the menu's daily chest (scrap). */
  mode: 'run' | 'daily' | 'bonus';
}

/**
 * Slot-machine chest. In a run it lands on 1, 3 or 5 upgrades (the first chest of a run always
 * gives 3); on the menu it lands on an amount of scrap.
 */
export class ChestScene extends Phaser.Scene {
  private cfg: ChestConfig = { mode: 'run' };
  private done = false;

  constructor() {
    super('Chest');
  }

  init(cfg: ChestConfig): void {
    this.cfg = cfg?.mode ? cfg : { mode: 'run' };
    this.done = false;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, PAL.outline, 0.7).setOrigin(0).setInteractive();
    const pw = Math.min(620, w - 32);
    const ph = 420;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    drawPanel(this.add.graphics(), px, py, pw, ph, PAL.brass);
    const glow = this.add.image(w / 2, py + 150, 'elite-glow').setScale(4);
    this.tweens.add({ targets: glow, angle: 360, duration: 6000, repeat: -1 });
    const chest = this.add.image(w / 2, py + 150, 'chest').setScale(0);
    this.tweens.add({ targets: chest, scale: 1.2, duration: 450, ease: 'Back.easeOut' });
    this.add.text(w / 2, py + 44, this.cfg.mode === 'run' ? 'TREASURE CHEST!' : this.cfg.mode === 'bonus' ? 'BONUS CHEST!' : 'DAILY CHEST!', displayStyle(40, CSS.brass)).setOrigin(0.5);
    Audio.rare();
    if (this.cfg.mode === 'run') this.time.delayedCall(500, () => this.spinUpgrades(py, pw, ph, chest));
    else this.time.delayedCall(500, () => this.spinScrap(py, ph, chest));
  }

  /** The reel ticks through values, slowing down, then lands. */
  private reel(text: Phaser.GameObjects.Text, values: string[], final: string, duration: number, onLand: () => void): void {
    let i = 0;
    let delay = 40;
    let elapsed = 0;
    const tick = () => {
      if (elapsed >= duration) {
        text.setText(final);
        this.tweens.add({ targets: text, scale: { from: 1.6, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        onLand();
        return;
      }
      text.setText(values[i++ % values.length]);
      Audio.click();
      elapsed += delay;
      delay *= 1.12;
      this.time.delayedCall(delay, tick);
    };
    tick();
  }

  private spinUpgrades(py: number, pw: number, ph: number, chest: Phaser.GameObjects.Image): void {
    const g = this.scene.get('Game') as GameScene;
    const w = this.scale.width;
    // First chest of a run is rigged to 3; then 1 (65%), 3 (28%) or 5 (7%).
    const roll = Math.random();
    const count = g.chestsOpened === 0 ? 3 : roll < 0.65 ? 1 : roll < 0.93 ? 3 : 5;
    g.chestsOpened++;
    const label = this.add.text(w / 2, py + 150, '', displayStyle(64, CSS.text)).setOrigin(0.5);
    chest.setAlpha(0.35);
    this.reel(label, ['1', '3', '5'], `×${count}`, 1100, () => {
      Audio.levelUp();
      this.time.delayedCall(350, () => {
        label.setVisible(false);
        chest.setVisible(false);
        const ids = g.chestCards(count);
        const size = Math.min(100, (pw - 40) / Math.max(3, ids.length) - 10);
        ids.forEach((id, i) => {
          const x = w / 2 + (i - (ids.length - 1) / 2) * (size + 12);
          const icon = this.add.image(x, py + 150, 'icon-fireball').setScale(size / 128);
          const name = this.add.text(x, py + 150 + size / 2 + 18, '', bodyStyle(15, CSS.text)).setOrigin(0.5);
          const pool = ['icon-strongerField', 'icon-spinCycle', 'icon-hotScrap', 'icon-shockwave', 'icon-chainLightning', 'icon-junkHoarder'];
          let k = 0;
          const spin = this.time.addEvent({ delay: 60, loop: true, callback: () => icon.setTexture(pool[k++ % pool.length]) });
          this.time.delayedCall(500 + i * 280, () => {
            spin.remove();
            icon.setTexture(`icon-${id}`);
            name.setText(cardById(id).name);
            this.tweens.add({ targets: icon, scale: { from: (size / 128) * 1.5, to: size / 128 }, duration: 300, ease: 'Back.easeOut' });
            g.chooseCardFree(id);
            Audio.pick();
            if (i === ids.length - 1) this.finish(py + ph - 56, () => g.closeChest());
          });
        });
      });
    });
  }

  private spinScrap(py: number, ph: number, chest: Phaser.GameObjects.Image): void {
    const w = this.scale.width;
    const amount = Rewards.rollDailyScrap();
    if (this.cfg.mode === 'daily') Rewards.claimFreeChest();
    else Rewards.claimBonusChest();
    Meta.data.coins += amount;
    Meta.save();
    chest.setAlpha(0.35);
    const label = this.add.text(w / 2, py + 150, '', displayStyle(60, CSS.brass)).setOrigin(0.5);
    this.reel(label, ['+40', '+60', '+80', '+100', '+150'], `+${amount}`, 1300, () => {
      Audio.coin();
      this.add.image(w / 2 - label.width / 2 - 30, py + 150, 'coin').setScale(1.2);
      this.add.text(w / 2, py + 220, `Wallet: ${Meta.data.coins} scrap`, bodyStyle(20, CSS.dim)).setOrigin(0.5);
      this.finish(py + ph - 56, () => {
        this.scene.stop();
        this.scene.launch('Menu');
      });
    });
  }

  private finish(y: number, close: () => void): void {
    if (this.done) return;
    this.done = true;
    const w = this.scale.width;
    const btn = new Button(this, w / 2, y, {
      width: 240,
      height: 64,
      label: 'COLLECT',
      fill: PAL.brass,
      textColor: CSS.outline,
      fontSize: 30,
      onClick: () => close(),
    });
    btn.text.setStroke(CSS.outline, 0);
    btn.setScale(0);
    this.tweens.add({ targets: btn, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.input.keyboard?.once('keydown-SPACE', () => close());
    this.input.keyboard?.once('keydown-ENTER', () => close());
  }
}
