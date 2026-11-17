import type Phaser from 'phaser';

export const VIEW = { width: 1280, height: 720 };
export const ARENA = { width: 2400, height: 1600 };

export const COLORS = {
  floor: 0x1e1b24,
  floorDetail: 0x2e2838,
  outline: 0x120f16,
  cyan: 0x3ee6f2,
  text: '#F4F1EA',
};

export const MAX_ENEMIES = 120;

export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

/** White filled circle with the 3 px dark outline; tint it for colour. */
export function makeCircleTexture(scene: Phaser.Scene, key: string, radius: number): void {
  if (scene.textures.exists(key)) return;
  const size = radius * 2 + 6;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff);
  g.fillCircle(size / 2, size / 2, radius);
  g.lineStyle(3, COLORS.outline);
  g.strokeCircle(size / 2, size / 2, radius);
  g.generateTexture(key, size, size);
  g.destroy();
}
