import Phaser from 'phaser';
import { VIEW } from './config';
import { GameScene } from './scenes/GameScene';
import { HudScene } from './scenes/HudScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#120F16',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: VIEW.width,
    height: VIEW.height,
  },
  scene: [GameScene, HudScene],
});

if (import.meta.env.DEV) (window as unknown as { __jm: Phaser.Game }).__jm = game;
