import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle } from '../config';
import { CrazySDK } from '../systems/CrazySDK';
import { Button, drawPanel } from '../ui/widgets';
import type { GameScene } from './GameScene';

/** Once per run: watch an ad to come back with half health and your junk ball. Optional. */
export class ReviveScene extends Phaser.Scene {
  private left = 6;
  private busy = false;

  constructor() {
    super('Revive');
  }

  create(): void {
    const g = this.scene.get('Game') as GameScene;
    this.left = 6;
    this.busy = false;
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, PAL.outline, 0.6).setOrigin(0).setInteractive();
    const pw = Math.min(460, w - 32);
    const ph = 330;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    drawPanel(this.add.graphics(), px, py, pw, ph, PAL.lime);
    this.add.text(w / 2, py + 52, 'REVIVE?', displayStyle(52, CSS.lime)).setOrigin(0.5);
    this.add.text(w / 2, py + 102, 'Come back with half health and your junk ball.', bodyStyle(19)).setOrigin(0.5);
    const timer = this.add.text(w / 2, py + 140, '6', displayStyle(34, CSS.dim)).setOrigin(0.5);
    const revive: Button = new Button(this, w / 2, py + 210, {
      width: Math.min(340, pw - 50),
      height: 72,
      label: '▶ REVIVE (watch ad)',
      fill: PAL.lime,
      textColor: CSS.outline,
      fontSize: 28,
      onClick: () => {
        if (this.busy) return;
        this.busy = true;
        revive.setEnabled(false);
        let rewarded = false;
        // Nothing is given if the ad fails or is skipped.
        CrazySDK.rewarded(
          () => (rewarded = true),
          () => (rewarded ? g.revive() : g.declineRevive()),
        );
      },
    });
    revive.text.setStroke(CSS.outline, 0);
    new Button(this, w / 2, py + 286, {
      width: 200,
      height: 46,
      label: 'NO THANKS',
      fill: 0x5a5266,
      fontSize: 22,
      onClick: () => !this.busy && g.declineRevive(),
    });
    this.time.addEvent({
      delay: 1000,
      repeat: 5,
      callback: () => {
        if (this.busy) return;
        this.left--;
        timer.setText(String(this.left));
        if (this.left <= 0) g.declineRevive();
      },
    });
  }
}
