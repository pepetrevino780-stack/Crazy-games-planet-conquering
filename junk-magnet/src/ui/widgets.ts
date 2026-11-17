import Phaser from 'phaser';
import { CSS, PAL, displayStyle } from '../config';
import { Audio } from '../systems/AudioManager';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  fill?: number;
  textColor?: string;
  fontSize?: number;
  tilt?: number;
  icon?: string;
  onClick: () => void;
}

function shade(color: number, k: number): number {
  const r = Math.round(((color >> 16) & 255) * k);
  const g = Math.round(((color >> 8) & 255) * k);
  const b = Math.round((color & 255) * k);
  return (r << 16) | (g << 8) | b;
}

/** Large rounded, slightly tilted button that presses down 4 px. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Container;
  readonly text: Phaser.GameObjects.Text;
  private pressed = false;
  private enabled = true;
  private fill: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: ButtonOptions,
  ) {
    super(scene, x, y);
    this.fill = opts.fill ?? PAL.red;
    this.bg = scene.add.graphics();
    this.face = scene.add.container(0, 0);
    const size = opts.fontSize ?? Math.round(opts.height * 0.46);
    this.text = scene.add.text(0, 0, opts.label, displayStyle(size, opts.textColor ?? CSS.text)).setOrigin(0.5);
    this.face.add(this.text);
    if (opts.icon) {
      const icon = scene.add.image(0, 0, opts.icon).setScale(0.5);
      const total = icon.displayWidth + 10 + this.text.width;
      icon.x = -total / 2 + icon.displayWidth / 2;
      this.text.x = icon.x + icon.displayWidth / 2 + 10 + this.text.width / 2;
      this.face.add(icon);
    }
    this.add([this.bg, this.face]);
    this.setAngle(opts.tilt ?? 0);
    this.setSize(opts.width, opts.height + 6);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabled && this.hover(1.05));
    this.on('pointerout', () => {
      this.hover(1);
      this.setPressed(false);
    });
    this.on('pointerdown', () => this.enabled && this.setPressed(true));
    this.on('pointerup', () => {
      if (!this.pressed) return;
      this.setPressed(false);
      this.activate();
    });
    this.draw();
    scene.add.existing(this);
  }

  activate(): void {
    if (!this.enabled) return;
    Audio.unlock();
    Audio.click();
    this.opts.onClick();
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  setFill(fill: number): this {
    this.fill = fill;
    this.draw();
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.5);
    return this;
  }

  private hover(scale: number): void {
    this.scene.tweens.add({ targets: this, scale, duration: 120, ease: 'Sine.easeOut' });
  }

  private setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.draw();
  }

  private draw(): void {
    const { width: w, height: h } = this.opts;
    const g = this.bg;
    const press = this.pressed ? 4 : 0;
    const r = Math.min(18, h / 2);
    g.clear();
    g.fillStyle(PAL.outline);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
    g.fillStyle(shade(this.fill, 0.62));
    g.fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w - 4, h, r);
    g.fillStyle(this.fill);
    g.fillRoundedRect(-w / 2, -h / 2 + press, w, h - 2, r);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 8, -h / 2 + press + 5, w - 16, Math.max(4, h * 0.16), r / 2);
    g.lineStyle(4, PAL.outline);
    g.strokeRoundedRect(-w / 2, -h / 2 + press, w, h - 2, r);
    this.face.y = press - 1;
  }
}

/** Dark sticker-style panel with a thick outline. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  border: number = PAL.text,
  fill: number = PAL.panel,
): void {
  g.fillStyle(PAL.outline, 0.6);
  g.fillRoundedRect(x + 4, y + 8, w, h, 22);
  g.fillStyle(PAL.outline);
  g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 26);
  g.fillStyle(border);
  g.fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 24);
  g.fillStyle(fill);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h - 6, 19);
}

/** Horizontal slider, value 0..1. */
export class Slider extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private dragging = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly trackW: number,
    public value: number,
    private readonly onChange: (v: number) => void,
  ) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.add(this.g);
    this.setSize(trackW + 40, 48);
    this.setInteractive({ useHandCursor: true, draggable: false });
    const update = (pointer: Phaser.Input.Pointer) => {
      const local = this.pointToContainer(pointer) as Phaser.Math.Vector2;
      this.value = Phaser.Math.Clamp((local.x + this.trackW / 2) / this.trackW, 0, 1);
      this.draw();
      this.onChange(this.value);
    };
    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      update(p);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.dragging && p.isDown && update(p));
    scene.input.on('pointerup', () => (this.dragging = false));
    this.draw();
    scene.add.existing(this);
  }

  private draw(): void {
    const g = this.g;
    const w = this.trackW;
    g.clear();
    g.fillStyle(PAL.outline);
    g.fillRoundedRect(-w / 2 - 3, -9, w + 6, 18, 9);
    g.fillStyle(0x3a3346);
    g.fillRoundedRect(-w / 2, -6, w, 12, 6);
    g.fillStyle(PAL.cyan);
    g.fillRoundedRect(-w / 2, -6, Math.max(12, w * this.value), 12, 6);
    const kx = -w / 2 + w * this.value;
    g.fillStyle(PAL.outline);
    g.fillCircle(kx, 0, 17);
    g.fillStyle(PAL.text);
    g.fillCircle(kx, 0, 13);
  }
}
