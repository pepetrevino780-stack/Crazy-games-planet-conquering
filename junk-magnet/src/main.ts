import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/nunito/latin-800.css';
import Phaser from 'phaser';
import { BASE, PORTRAIT_BASE } from './config';
import { GameScene } from './scenes/GameScene';
import { GarageScene } from './scenes/GarageScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultsScene } from './scenes/ResultsScene';
import { ReviveScene } from './scenes/ReviveScene';
import { ChestScene } from './scenes/ChestScene';
import { ShopScene } from './scenes/ShopScene';
import { UpgradeScene } from './scenes/UpgradeScene';
import { Audio } from './systems/AudioManager';
import { Controls } from './systems/Controls';
import { Meta } from './systems/MetaSave';

/** Shorter screen side is always BASE units; the longer side follows the window's shape. */
// Dev-only: ?base=1080 renders at a higher internal resolution (used to capture store art).
const devBase = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('base')) || 0 : 0;

function virtualSize(): { width: number; height: number } {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const aspect = Phaser.Math.Clamp(w / h, 1 / 2.3, 2.3);
  // Portrait phones get a narrower base so text and buttons stay big enough to read.
  if (devBase) return aspect >= 1 ? { width: Math.round(devBase * aspect), height: devBase } : { width: devBase, height: Math.round(devBase / aspect) };
  return aspect >= 1
    ? { width: Math.round(BASE * aspect), height: BASE }
    : { width: PORTRAIT_BASE, height: Math.round(PORTRAIT_BASE / aspect) };
}

const size = virtualSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#120F16',
  audio: { noAudio: true },
  disableContextMenu: true,
  input: { activePointers: 3 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: size.width,
    height: size.height,
  },
  scene: [PreloadScene, GameScene, HudScene, MenuScene, GarageScene, UpgradeScene, PauseScene, ReviveScene, ChestScene, ShopScene, ResultsScene],
});

let resizeTimer = 0;
const onResize = () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const next = virtualSize();
    if (next.width !== game.scale.gameSize.width || next.height !== game.scale.gameSize.height) {
      game.scale.setGameSize(next.width, next.height);
    }
  }, 100);
};
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// Audio may only start after a user gesture.
const unlock = () => Audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, { __jm: game, __controls: Controls, __meta: Meta });
}
