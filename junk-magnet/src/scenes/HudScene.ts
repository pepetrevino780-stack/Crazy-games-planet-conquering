import Phaser from 'phaser';
import { COLORS, VIEW } from '../config';
import type { GameScene } from './GameScene';

const FONT = 'system-ui, "Segoe UI", Arial, sans-serif';

/** Overlay scene with its own camera, so the HUD ignores the game camera's zoom. */
export class HudScene extends Phaser.Scene {
  private game_!: GameScene;
  private junkText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private shownJunk = -1;
  private shownStats = -1;
  private shownSeconds = -1;

  constructor() {
    super('HUD');
  }

  create(): void {
    this.game_ = this.scene.get('Game') as GameScene;
    this.shownJunk = this.shownStats = this.shownSeconds = -1;
    const style = { fontFamily: FONT, fontStyle: 'bold', color: COLORS.text, stroke: '#120F16', strokeThickness: 6 };
    this.junkText = this.add.text(VIEW.width / 2, 18, '0', { ...style, fontSize: '56px' }).setOrigin(0.5, 0);
    this.statsText = this.add.text(24, 22, '', { ...style, fontSize: '26px' });
    this.timerText = this.add.text(VIEW.width - 24, 22, '0:00', { ...style, fontSize: '32px' }).setOrigin(1, 0);
    this.hint = this.add
      .text(VIEW.width / 2, VIEW.height - 110, 'WASD / ARROWS', { ...style, fontSize: '34px', color: '#3EE6F2' })
      .setOrigin(0.5);
  }

  update(now: number, deltaMs: number): void {
    const g = this.game_;
    // Text only re-renders when its value changes.
    const junk = g.junk.attached.length;
    if (junk !== this.shownJunk) {
      if (junk > this.shownJunk) this.junkText.setScale(1.3);
      this.shownJunk = junk;
      this.junkText.setText(String(junk));
    }
    if (this.junkText.scale > 1) {
      this.junkText.setScale(Math.max(1, this.junkText.scale - (deltaMs / 1000) * 2.5));
    }
    const stats = g.enemies.kills * 100000 + g.junk.scrap;
    if (stats !== this.shownStats) {
      this.shownStats = stats;
      this.statsText.setText(`Bots ${g.enemies.kills}   Scrap ${g.junk.scrap}`);
    }
    const seconds = Math.floor(g.time_);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.timerText.setText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    }
    if (this.hint.visible) {
      if (g.player.hasMoved) {
        this.hint.alpha -= deltaMs / 400;
        if (this.hint.alpha <= 0) this.hint.setVisible(false);
      } else {
        this.hint.alpha = 0.65 + 0.35 * Math.sin(now / 220);
      }
    }
  }
}
