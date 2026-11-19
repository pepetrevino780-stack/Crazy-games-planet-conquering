import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';
import { Button, drawPanel } from '../ui/widgets';
import type { GameScene } from './GameScene';

const OFFERS: { item: 'heal' | 'card' | 'scrap'; label: string; desc: string; cost: number; icon: string }[] = [
  { item: 'heal', label: 'PATCH UP', desc: '+30 health', cost: 20, icon: 'health-pack' },
  { item: 'card', label: 'MYSTERY CARD', desc: 'A random upgrade', cost: 35, icon: 'icon-scrapPile' },
  { item: 'scrap', label: 'SELL SCRAP', desc: '+40 scrap coins', cost: 15, icon: 'coin' },
];
const SECONDS = 10;

/** Between phases: trade junk (your armour) for health, a card or scrap. Less junk = less armour. */
export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create(): void {
    const g = this.scene.get('Game') as GameScene;
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, PAL.outline, 0.6).setOrigin(0).setInteractive();
    const pw = Math.min(700, w - 32);
    const ph = 400;
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    drawPanel(this.add.graphics(), px, py, pw, ph, PAL.cyan);
    this.add.text(w / 2, py + 44, 'JUNK SHOP', displayStyle(46, CSS.cyan)).setOrigin(0.5);
    const junkText = this.add.text(w / 2, py + 88, '', bodyStyle(19, CSS.text)).setOrigin(0.5);
    const refresh = () => junkText.setText(`You have ${g.junk.count} junk. Spending it lowers your armour.`);
    refresh();
    const cw = Math.min(200, (pw - 60) / 3);
    const buttons: Button[] = [];
    OFFERS.forEach((o, i) => {
      const x = w / 2 + (i - 1) * (cw + 14);
      const y = py + 200;
      const box = this.add.graphics();
      box.fillStyle(PAL.panel);
      box.fillRoundedRect(x - cw / 2, y - 80, cw, 170, 14);
      box.lineStyle(3, PAL.steel, 0.6);
      box.strokeRoundedRect(x - cw / 2, y - 80, cw, 170, 14);
      this.add.image(x, y - 44, o.icon).setScale(o.icon.startsWith('icon') ? 0.7 : 1);
      this.add.text(x, y + 2, o.label, displayStyle(20)).setOrigin(0.5);
      this.add.text(x, y + 26, o.desc, bodyStyle(16, CSS.dim)).setOrigin(0.5);
      const b: Button = new Button(this, x, y + 62, {
        width: cw - 24,
        height: 42,
        label: `${o.cost} JUNK`,
        icon: 'junk-gear',
        fill: PAL.brass,
        textColor: CSS.outline,
        fontSize: 18,
        onClick: () => {
          if (g.buy(o.item, o.cost)) {
            Audio.coin();
            refresh();
            b.setEnabled(false).setLabel('BOUGHT');
            update();
          }
        },
      });
      b.text.setStroke(CSS.outline, 0);
      buttons.push(b);
    });
    const update = () =>
      buttons.forEach((b, i) => {
        if (b.text.text !== 'BOUGHT') b.setEnabled(g.junk.count >= OFFERS[i].cost);
      });
    update();
    // A 10-second break, then the fight resumes.
    const bar = this.add.graphics();
    let left = SECONDS;
    const draw = () => {
      bar.clear();
      bar.fillStyle(PAL.outline);
      bar.fillRoundedRect(px + 30, py + ph - 34, pw - 60, 12, 6);
      bar.fillStyle(PAL.cyan);
      bar.fillRoundedRect(px + 30, py + ph - 34, Math.max(6, ((pw - 60) * left) / SECONDS), 12, 6);
    };
    draw();
    new Button(this, w / 2, py + ph - 70, {
      width: 220,
      height: 46,
      label: 'CONTINUE',
      fill: PAL.red,
      fontSize: 22,
      onClick: () => g.closeShop(),
    });
    this.time.addEvent({
      delay: 100,
      repeat: SECONDS * 10 - 1,
      callback: () => {
        left -= 0.1;
        draw();
        if (left <= 0.05) g.closeShop();
      },
    });
    this.input.keyboard?.once('keydown-ENTER', () => g.closeShop());
  }
}
