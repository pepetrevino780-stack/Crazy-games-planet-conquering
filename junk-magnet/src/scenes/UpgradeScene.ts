import Phaser from 'phaser';
import { CSS, PAL, RARITY_COLOR, bodyStyle, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';
import type { CardDef } from '../systems/UpgradeSystem';
import type { GameScene } from './GameScene';

/** Pick 1 of 3: sticker-style cards slide in while the game is frozen in slow motion. */
export class UpgradeScene extends Phaser.Scene {
  private g!: GameScene;
  private cards: Phaser.GameObjects.Container[] = [];
  private defs: CardDef[] = [];
  private dim!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private locked = false;
  private selected = 0;

  constructor() {
    super('Upgrade');
  }

  create(): void {
    this.g = this.scene.get('Game') as GameScene;
    this.cards = [];
    this.locked = false;
    this.dim = this.add.rectangle(0, 0, 10, 10, PAL.outline, 0.55).setOrigin(0);
    this.title = this.add.text(0, 0, 'LEVEL UP!', displayStyle(54, CSS.brass)).setOrigin(0.5);
    this.title.setScale(0);
    this.tweens.add({ targets: this.title, scale: 1, duration: 380, ease: 'Back.easeOut' });

    const kb = this.input.keyboard;
    kb?.on('keydown-ONE', () => this.pick(0));
    kb?.on('keydown-TWO', () => this.pick(1));
    kb?.on('keydown-THREE', () => this.pick(2));
    kb?.on('keydown-LEFT', () => this.select(this.selected - 1));
    kb?.on('keydown-A', () => this.select(this.selected - 1));
    kb?.on('keydown-Q', () => this.select(this.selected - 1));
    kb?.on('keydown-RIGHT', () => this.select(this.selected + 1));
    kb?.on('keydown-D', () => this.select(this.selected + 1));
    kb?.on('keydown-ENTER', () => this.pick(this.selected));
    kb?.on('keydown-SPACE', () => this.pick(this.selected));

    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', this.layout, this));
    this.showCards();
  }

  /** Portrait screens stack wide cards vertically; landscape shows three tall cards in a row. */
  private get stacked(): boolean {
    return this.scale.height > this.scale.width;
  }

  private cardSize(): { cw: number; ch: number } {
    const w = this.scale.width;
    const h = this.scale.height;
    if (this.stacked) return { cw: Math.min(520, w - 44), ch: Math.min(190, (h - 300) / 3 - 20) };
    const cw = Math.min(260, (w - 80) / 3);
    return { cw, ch: Math.round(cw * 1.42) };
  }

  private showCards(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    this.defs = this.g.rollCards();
    this.title.setText(this.g.rareReward ? 'RARE UPGRADE!' : 'LEVEL UP!');
    this.locked = false;
    this.selected = -1;
    const { cw, ch } = this.cardSize();
    this.defs.forEach((def, i) => {
      const card = this.buildCard(def, cw, ch);
      this.cards.push(card);
      card.setAngle(i === 1 ? 0 : i === 0 ? (this.stacked ? -1.5 : -3) : this.stacked ? 1.5 : 3);
      card.setData('baseAngle', card.angle);
      card.setSize(cw, ch);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => this.select(i));
      card.on('pointerup', () => this.pick(i));
    });
    this.layout();
    const h = this.scale.height;
    this.cards.forEach((card, i) => {
      const y = card.y;
      card.y = h + card.height;
      this.tweens.add({ targets: card, y, duration: 420, delay: 80 + i * 90, ease: 'Back.easeOut' });
    });
  }

  private buildCard(def: CardDef, cw: number, ch: number): Phaser.GameObjects.Container {
    const k = cw / 260;
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    const border = RARITY_COLOR[def.rarity] ?? PAL.steel;
    // Sticker: drop shadow, white die-cut edge, rarity border, dark face.
    g.fillStyle(PAL.outline, 0.6);
    g.fillRoundedRect(-cw / 2 + 6, -ch / 2 + 10, cw, ch, 22);
    g.fillStyle(PAL.outline);
    g.fillRoundedRect(-cw / 2 - 4, -ch / 2 - 4, cw + 8, ch + 8, 24);
    g.fillStyle(PAL.text);
    g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 21);
    g.fillStyle(PAL.outline);
    g.fillRoundedRect(-cw / 2 + 7, -ch / 2 + 7, cw - 14, ch - 14, 16);
    g.fillStyle(border);
    g.fillRoundedRect(-cw / 2 + 9, -ch / 2 + 9, cw - 18, ch - 18, 15);
    g.fillStyle(PAL.panel);
    g.fillRoundedRect(-cw / 2 + 15, -ch / 2 + 15, cw - 30, ch - 30, 11);
    c.add(g);

    const lv = this.g.upgrades.level(def.id);
    let tag = lv === 0 ? 'NEW' : `LV ${lv} → ${lv + 1}`;
    if (def.rarity === 'epic') tag = 'EVOLUTION';
    if (def.max >= 99) tag = 'BONUS';
    const hint = def.rarity === 'epic' ? null : this.g.upgrades.comboHint(def.id);
    const tagColor = def.rarity === 'common' ? CSS.steel : def.rarity === 'rare' ? CSS.cyan : CSS.brass;
    const nameColor = def.rarity === 'epic' ? CSS.brass : CSS.text;
    const pipsAt = (px: number, py: number, size: number, align: 'center' | 'left') => {
      if (def.max <= 1 || def.max >= 99) return;
      const pips = this.add.graphics();
      const gap = size + 6;
      const startX = align === 'center' ? px - ((def.max - 1) * gap) / 2 : px + size / 2;
      for (let i = 0; i < def.max; i++) {
        const x = startX + i * gap;
        pips.fillStyle(PAL.outline);
        pips.fillCircle(x, py, size / 2 + 2);
        pips.fillStyle(i < lv ? border : i === lv ? PAL.text : 0x3a3346);
        pips.fillCircle(x, py, size / 2 - 1);
      }
      c.add(pips);
    };

    if (this.stacked) {
      const left = -cw / 2 + 30;
      const icon = this.add.image(left + 52, 0, `icon-${def.id}`).setScale(Math.min(1, ch / 150));
      const textX = left + 120;
      const name = this.add.text(textX, -ch / 2 + 40, def.name.toUpperCase(), displayStyle(30, nameColor)).setOrigin(0, 0.5);
      const desc = this.add
        .text(textX, -ch / 2 + 62, def.desc, { ...bodyStyle(20, '#D9D3E2'), wordWrap: { width: cw - 170 }, lineSpacing: 2 })
        .setOrigin(0, 0);
      const tagText = this.add.text(cw / 2 - 26, -ch / 2 + 40, tag, displayStyle(18, tagColor)).setOrigin(1, 0.5);
      c.add([icon, name, desc, tagText]);
      pipsAt(textX, ch / 2 - 26, 14, 'left');
      if (hint) c.add(this.add.text(cw / 2 - 26, ch / 2 - 26, hint, bodyStyle(15, CSS.cyan)).setOrigin(1, 0.5));
      return c;
    }

    const icon = this.add.image(0, -ch / 2 + 82 * k, `icon-${def.id}`).setScale(0.95 * k);
    const name = this.add.text(0, -ch / 2 + 156 * k, def.name.toUpperCase(), displayStyle(Math.round(27 * k), nameColor)).setOrigin(0.5);
    const desc = this.add
      .text(0, -ch / 2 + 182 * k, def.desc, {
        ...bodyStyle(Math.round(19 * k), '#D9D3E2'),
        align: 'center',
        wordWrap: { width: cw - 44 },
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);
    const tagText = this.add.text(0, ch / 2 - 34 * k, tag, displayStyle(Math.round(20 * k), tagColor)).setOrigin(0.5);
    c.add([icon, name, desc, tagText]);
    pipsAt(0, ch / 2 - 62 * k, 14 * k, 'center');
    if (hint) {
      c.add(
        this.add
          .text(0, ch / 2 - 84 * k, hint, { ...bodyStyle(Math.round(14 * k), CSS.cyan), align: 'center', wordWrap: { width: cw - 36 } })
          .setOrigin(0.5, 1),
      );
    }
    return c;
  }

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setSize(w, h);
    this.dim.setSize(w, h);
    const { cw, ch } = this.cardSize();
    if (this.stacked) {
      const gap = 22;
      const total = ch * 3 + gap * 2;
      const top = Math.max(150, h / 2 - total / 2 + 30);
      this.title.setPosition(w / 2, top - 60);
      this.cards.forEach((card, i) => card.setPosition(w / 2, top + ch / 2 + i * (ch + gap)));
      return;
    }
    const gap = Math.min(30, (w - cw * 3) / 4);
    const top = Math.max(110, h / 2 - ch / 2 + 30);
    this.title.setPosition(w / 2, top - 60);
    this.cards.forEach((card, i) => {
      card.setPosition(w / 2 + (i - 1) * (cw + gap), top + ch / 2);
    });
  }

  private select(i: number): void {
    if (this.locked || this.cards.length === 0) return;
    const next = (i + this.cards.length) % this.cards.length;
    if (next === this.selected) return;
    this.selected = next;
    this.cards.forEach((card, j) => {
      const on = j === next;
      this.tweens.add({
        targets: card,
        scale: on ? 1.06 : 1,
        angle: on ? 0 : (card.getData('baseAngle') as number),
        duration: 140,
        ease: 'Sine.easeOut',
      });
    });
  }

  private pick(i: number): void {
    if (this.locked || i < 0 || i >= this.cards.length) return;
    this.locked = true;
    Audio.pick();
    const chosen = this.cards[i];
    this.tweens.add({ targets: chosen, scale: 1.18, angle: 0, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: chosen, alpha: 0, scale: 0.6, delay: 260, duration: 180, ease: 'Sine.easeIn' });
    this.cards.forEach((card, j) => {
      if (j !== i) this.tweens.add({ targets: card, y: this.scale.height + 300, angle: card.angle * 4, duration: 320, ease: 'Back.easeIn' });
    });
    const id = this.defs[i].id;
    this.time.delayedCall(450, () => {
      const more = this.g.chooseCard(id);
      if (more) {
        Audio.levelUp();
        this.showCards();
      } else {
        this.g.resumeFromUpgrade();
      }
    });
  }
}
