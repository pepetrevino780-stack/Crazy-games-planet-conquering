import Phaser from 'phaser';
import { CSS, PAL, bodyStyle, displayStyle, hex } from '../config';
import { Audio } from '../systems/AudioManager';
import { Meta } from '../systems/MetaSave';
import { Button, drawPanel } from '../ui/widgets';
import { MAGNETS, MAPS, type GameScene } from './GameScene';

type Kind = 'magnet' | 'map';

/** Spend scrap coins on magnets and maps that change how a run plays. */
export class GarageScene extends Phaser.Scene {
  constructor() {
    super('Garage');
  }

  create(): void {
    const build = () => this.build();
    build();
    this.scale.on('resize', build);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', build));
  }

  private build(): void {
    this.children.removeAll(true);
    this.tweens.killAll();
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.add.rectangle(0, 0, w, h, PAL.outline, 0.72).setOrigin(0).setInteractive();

    this.add.text(w / 2, 44, 'GARAGE', displayStyle(52)).setOrigin(0.5).setAngle(-2);
    const coins = this.add.container(w - 20, 44);
    const ct = this.add.text(0, 0, String(Meta.data.coins), displayStyle(32, CSS.brass)).setOrigin(1, 0.5);
    coins.add([ct, this.add.image(-ct.width - 22, 0, 'coin').setScale(0.8)]);

    new Button(this, 90, 44, {
      width: 140,
      height: 52,
      label: '◀ BACK',
      fill: 0x5a5266,
      fontSize: 24,
      onClick: () => {
        this.scene.stop();
        this.scene.launch('Menu');
      },
    });

    const portrait = h > w;
    const cols = portrait ? 2 : 4;
    const cw = Math.min(280, (w - 40 - (cols - 1) * 16) / cols);
    const ch = portrait ? 232 : Math.min(250, (h - 200) / 2 - 20);
    let y = 104;
    y = this.section('MAGNETS', 'magnet', Object.keys(MAGNETS), y, cols, cw, ch);
    this.section('MAPS', 'map', Object.keys(MAPS), y + 8, cols, cw, ch);
  }

  private section(title: string, kind: Kind, ids: string[], y: number, cols: number, cw: number, ch: number): number {
    const w = this.scale.width;
    this.add.text(w / 2, y + 4, title, displayStyle(26, CSS.cyan)).setOrigin(0.5);
    y += 34;
    ids.forEach((id, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, ids.length - row * cols);
      const col = i % cols;
      const x = w / 2 + (col - (inRow - 1) / 2) * (cw + 16);
      this.card(kind, id, x, y + row * (ch + 18) + ch / 2, cw, ch);
    });
    return y + Math.ceil(ids.length / cols) * (ch + 18);
  }

  private card(kind: Kind, id: string, x: number, y: number, cw: number, ch: number): void {
    const save = Meta.data;
    const def = kind === 'magnet' ? MAGNETS[id] : MAPS[id];
    const owned = kind === 'magnet' ? save.magnets.includes(id) : save.maps.includes(id);
    const selected = kind === 'magnet' ? save.magnet === id : save.map === id;
    const g = this.add.graphics();
    drawPanel(g, x - cw / 2, y - ch / 2, cw, ch, selected ? PAL.cyan : owned ? PAL.steel : 0x5a5266);

    const iconY = y - ch / 2 + 54;
    if (kind === 'magnet') {
      const img = this.add.image(x, iconY, MAGNETS[id].texture).setScale(0.85);
      if (!owned) img.setTint(0x6a6378);
    } else {
      const m = MAPS[id];
      const sw = this.add.graphics();
      sw.fillStyle(PAL.outline);
      sw.fillRoundedRect(x - 54, iconY - 34, 108, 68, 10);
      sw.fillStyle(hex(m.floor));
      sw.fillRoundedRect(x - 50, iconY - 30, 100, 60, 8);
      sw.fillStyle(hex(m.detail));
      sw.fillCircle(x - 22, iconY - 8, 14);
      sw.fillCircle(x + 24, iconY + 12, 10);
      if (m.props === 'station') {
        sw.fillStyle(PAL.text, 0.7);
        for (const [sx, sy] of [
          [-36, -18],
          [10, -20],
          [34, -6],
          [-8, 16],
        ]) sw.fillCircle(x + sx, iconY + sy, 1.8);
      }
      if (m.props === 'factory') {
        sw.fillStyle(PAL.brass, 0.6);
        sw.fillRect(x - 50, iconY - 4, 100, 10);
      }
    }
    if (!owned) this.add.image(x + cw / 2 - 30, y - ch / 2 + 30, 'lock').setScale(0.55);

    this.add.text(x, y - ch / 2 + 108, def.name.toUpperCase(), displayStyle(Math.min(26, cw / 8.5))).setOrigin(0.5);
    this.add
      .text(x, y - ch / 2 + 128, def.desc, { ...bodyStyle(16, '#D9D3E2'), align: 'center', wordWrap: { width: cw - 30 } })
      .setOrigin(0.5, 0);

    const by = y + ch / 2 - 36;
    if (selected) {
      this.add.text(x, by, 'EQUIPPED', displayStyle(24, CSS.cyan)).setOrigin(0.5);
      return;
    }
    const affordable = save.coins >= def.price;
    const btn = new Button(this, x, by, {
      width: Math.min(170, cw - 30),
      height: 48,
      label: owned ? 'SELECT' : `${def.price}`,
      icon: owned ? undefined : 'coin',
      fill: owned ? PAL.cyan : affordable ? PAL.brass : 0x5a5266,
      textColor: owned || affordable ? CSS.outline : CSS.text,
      fontSize: 24,
      onClick: () => {
        if (!owned) {
          if (save.coins < def.price) {
            this.cameras.main.shake(120, 0.004);
            return;
          }
          save.coins -= def.price;
          (kind === 'magnet' ? save.magnets : save.maps).push(id);
          Audio.coin();
        }
        if (kind === 'magnet') save.magnet = id;
        else save.map = id;
        Meta.save();
        this.build();
        // The title arena behind always shows the Junkyard; nothing to refresh there.
        void (this.scene.get('Game') as GameScene);
      },
    });
    if (owned || affordable) btn.text.setStroke(CSS.outline, 0);
  }
}
