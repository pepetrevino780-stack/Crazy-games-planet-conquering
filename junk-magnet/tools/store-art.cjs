/**
 * Captures store art from the real game (no fake footage): a full junk ball, robots popping
 * off the ring, the cyan field, and the title. Run `npm run dev` first, then:
 *   node tools/store-art.cjs
 * Writes store/cover-1920x1080.png, store/cover-800x1200.png, store/cover-800x800.png.
 */
const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, '..', 'store');
const URL = process.env.URL || 'http://localhost:5173/';
const SIZES = [
  { name: 'cover-1920x1080', w: 1920, h: 1080, base: 1080, zoom: 1.75, title: 190, side: true },
  { name: 'cover-800x1200', w: 800, h: 1200, base: 800, zoom: 1.25, title: 104 },
  { name: 'cover-800x800', w: 800, h: 800, base: 800, zoom: 1.2, title: 96 },
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    await page.goto(`${URL}?base=${s.base}`);
    await page.waitForFunction(() => window.__jm && window.__jm.scene.isActive('Menu'), null, { timeout: 20000 });
    await page.evaluate(() => {
      const game = window.__jm;
      game.scene.getScene('Menu').scene.stop();
      game.scene.getScene('Game').scene.restart({ mode: 'run' });
    });
    await page.waitForFunction(() => window.__jm.scene.getScene('Game').state === 'playing', null, { timeout: 8000 });
    await page.evaluate(() => {
      const g = window.__jm.scene.getScene('Game');
      g.scene.stop('HUD');
      g.player.invuln = 1e9;
      g.player.hasMoved = true;
      g.level = 16; g.updateCap(); for (let i = 0; i < 150; i++) g.junk.spawnLoose(g.player.x + Math.cos(i) * 40, g.player.y + Math.sin(i) * 40, i % 17 === 0 ? 4 : i % 4);
    });
    await page.waitForTimeout(2500);
    await page.evaluate((zoom) => {
      const g = window.__jm.scene.getScene('Game');
      const kinds = ['tin', 'sprinter', 'shield', 'spitter', 'tin', 'antimag'];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 190 + (i % 3) * 70;
        g.enemies.spawn(kinds[i % kinds.length], g.player.x + Math.cos(a) * r, g.player.y + Math.sin(a) * r);
      }
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + 0.4;
        const x = g.player.x + Math.cos(a) * 150;
        const y = g.player.y + Math.sin(a) * 150;
        g.juice.pop(x, y, 0x9be564, 1.4);
        g.juice.sparks(x, y, 10);
        g.juice.damageNumber(x, y - 20, 40 + i * 13, i % 3 === 0);
      }
      g.juice.ring(g.player.x, g.player.y, 0x3ee6f2, 0.3, 0.6, 3.6);
      window.__zoomOverride = zoom;
    }, s.zoom);
    await page.waitForTimeout(180);
    await page.evaluate(({ zoom, side }) => {
      const g = window.__jm.scene.getScene('Game');
      g.scene.pause();
      const cam = g.cameras.main;
      cam.setZoom(zoom);
      // Landscape: ball on the right, title on the left. Portrait/square: title above the ball.
      if (side) cam.centerOn(g.player.x - (cam.width * 0.2) / zoom, g.player.y);
      else cam.centerOn(g.player.x, g.player.y - 60 / zoom);
    }, { zoom: s.zoom, side: !!s.side });
    await page.evaluate(({ title, portrait, side }) => {
      const el = document.createElement('div');
      el.innerHTML = '<span style="color:#F4F1EA">JUNK</span><br><span style="color:#E8423F">MAGNET</span>';
      Object.assign(el.style, {
        position: 'fixed', left: side ? '3%' : '0', right: side ? '52%' : '0', top: side ? '30%' : portrait ? '6%' : '5%', textAlign: 'center',
        font: `${title}px "Lilita One"`, lineHeight: '0.95', transform: 'rotate(-4deg)',
        WebkitTextStroke: `${Math.round(title * 0.07)}px #120F16`, paintOrder: 'stroke fill',
        textShadow: `0 ${Math.round(title * 0.06)}px 0 #120F16, 0 0 ${Math.round(title * 0.3)}px rgba(62,230,242,0.7)`,
      });
      document.body.appendChild(el);
    }, { title: s.title, portrait: s.h > s.w, side: !!s.side });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    await page.close();
    console.log('wrote', s.name);
  }
  await browser.close();
})();
