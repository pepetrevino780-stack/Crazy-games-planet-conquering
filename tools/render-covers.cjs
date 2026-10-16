// Renders the three store covers and the 2:3 video intro from tools/cover.html.
// Needs a local server on :8080 (npx http-server -c-1 -p 8080 .) and Playwright.
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();
const OUT = require('path').join(__dirname, '..', 'assets', 'crazygames') + '/';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  // The portrait video opens on the portrait cover at 2:3, 1080x1620.
  for (const [name, w, h, s] of [['cover-landscape-1920x1080', 320, 180, 6], ['cover-portrait-800x1200', 160, 240, 5], ['cover-square-800x800', 200, 200, 4], ['video-intro-portrait-1080x1620', 160, 240, 6.75]]) {
    const p = await b.newPage({ viewport: { width: w * s, height: h * s } });
    await p.goto(`http://localhost:8080/tools/cover.html?w=${w}&h=${h}&s=${s}`);
    await p.waitForFunction(() => document.title === 'ready');
    await p.locator('#c').screenshot({ path: OUT + name + '.png' });
    await p.close();
  }
  await b.close();
})();
