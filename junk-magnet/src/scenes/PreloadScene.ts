import Phaser from 'phaser';
import { CSS, FONT_BODY, FONT_DISPLAY } from '../config';
import { Audio } from '../systems/AudioManager';
import { CrazySDK } from '../systems/CrazySDK';
import { Meta } from '../systems/MetaSave';
import { makeAllTextures } from '../systems/Textures';

/** Boot + preload: SDK, save data, fonts and every code-drawn texture. No asset files. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create(): void {
    const text = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading…', { fontFamily: 'sans-serif', fontSize: '28px', color: CSS.text })
      .setOrigin(0.5);
    void this.boot().then(() => {
      text.destroy();
      this.scene.start('Game', { mode: 'menu' });
    });
  }

  private async boot(): Promise<void> {
    CrazySDK.onAdMute((m) => Audio.setAdMuted(m));
    CrazySDK.onSettingsMute((m) => Audio.setSettingsMuted(m));
    await CrazySDK.init();
    CrazySDK.loadingStart();
    Meta.load();
    Audio.setVolumes(Meta.data.settings.music, Meta.data.settings.sfx);
    const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
    try {
      await Promise.race([
        Promise.all([document.fonts.load(`40px ${FONT_DISPLAY}`), document.fonts.load(`800 20px ${FONT_BODY}`)]),
        timeout,
      ]);
    } catch {
      /* fall back to system fonts */
    }
    makeAllTextures(this);
    CrazySDK.loadingStop();
  }
}
