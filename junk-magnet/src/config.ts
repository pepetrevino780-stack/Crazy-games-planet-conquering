import type Phaser from 'phaser';

/** Virtual screen: the shorter side is always this many units; the longer side follows the window. */
export const BASE = 720;
export const PORTRAIT_BASE = 560;
export const ARENA = { width: 2800, height: 2000, margin: 80 };

export const PAL = {
  floor: 0x1f1530,
  floorDetail: 0x2c1d45,
  outline: 0x120f16,
  red: 0xe8423f,
  cyan: 0x7cff6b,
  hive: 0xe04fd8,
  steel: 0xa7b0ba,
  rust: 0xd9772b,
  brass: 0xf2c14e,
  lime: 0x9be564,
  pink: 0xff3d7f,
  text: 0xf4f1ea,
  plum: 0x2c1d45,
  panel: 0x22172f,
};

export const CSS = {
  text: '#F4F1EA',
  outline: '#120F16',
  cyan: '#7CFF6B',
  hive: '#E04FD8',
  brass: '#F2C14E',
  pink: '#FF3D7F',
  lime: '#9BE564',
  red: '#E8423F',
  steel: '#A7B0BA',
  rust: '#D9772B',
  dim: '#A895BD',
};

export const FONT_DISPLAY = '"Lilita One", "Arial Black", sans-serif';
export const FONT_BODY = '"Nunito", system-ui, sans-serif';

export const CAPS = { enemies: 120, particles: 300, bullets: 60, numbers: 22 };

export const DEPTH = {
  floor: 0,
  belt: 1,
  aura: 4,
  field: 5,
  loose: 10,
  enemy: 20,
  bullet: 25,
  junk: 30,
  player: 40,
  fx: 50,
  numbers: 60,
};

export const RARITY_COLOR: Record<string, number> = {
  common: 0xa7b0ba,
  rare: 0xf2c14e,
  epic: 0xff9f1c,
};

export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

export function displayStyle(size: number, color: string = CSS.text): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_DISPLAY,
    fontSize: `${size}px`,
    color,
    stroke: CSS.outline,
    strokeThickness: Math.max(4, Math.round(size * 0.16)),
  };
}

export function bodyStyle(size: number, color: string = CSS.text): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_BODY, fontStyle: '800', fontSize: `${size}px`, color };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
