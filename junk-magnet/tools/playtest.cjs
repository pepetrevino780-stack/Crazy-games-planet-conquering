/**
 * Automated balance playtest: a simple kiting bot plays a full run (optionally time-warped)
 * and logs junk, hearts, hits, kills and boss HP every 20 s of game time.
 * Run `npm run dev` first, then: node tools/playtest.cjs <screenshot-dir> [warp=4] [max-seconds=520]
 */
// Automated playtest: menu -> run with a kiting bot, random cards, screenshots, error capture.
const { chromium } = require('playwright');
const OUT = process.argv[2];
const WARP = Number(process.argv[3] || 1);
const MAXT = Number(process.argv[4] || 60);
const VW = Number(process.argv[5] || 1280), VH = Number(process.argv[6] || 720);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto(process.env.URL || 'http://localhost:5173/');
  await p.waitForFunction(() => window.__jm && window.__jm.scene.isActive('Menu'), null, { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/menu-${VW}.png` });
  // Click PLAY (center, 58% height of the canvas)
  const box = await p.locator('canvas').boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height * 0.58);
  await p.waitForFunction(() => window.__jm.scene.getScene('Game').state === 'playing', null, { timeout: 5000 });
  const t0 = Date.now();
  await p.evaluate((warp) => {
    window.__warp = warp;
    const C = window.__controls;
    const game = window.__jm;
    window.__bot = setInterval(() => {
      const g = game.scene.getScene('Game');
      if (game.scene.isActive('Upgrade')) {
        const u = game.scene.getScene('Upgrade');
        if (!u.locked && u.cards.length) u.pick(Math.floor(Math.random() * u.cards.length));
        return;
      }
      if (g.state !== 'playing') return;
      const pl = g.player;
      let best = null, bd = 1e9, ax = 0, ay = 0, near = 0;
      const want = Math.max(40, g.junk.cloudRadius * 0.9);
      for (const e of g.enemies.pool.items) {
        if (!e.active) continue;
        const dx = pl.x - e.x, dy = pl.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (e.kind === 'boss') { if (d < 330) { ax += dx / d * 3; ay += dy / d * 3; } continue; }
        if (d < bd) { bd = d; best = e; }
        if (d < 90 && g.junk.count < 8) { ax += dx / d * 0.6; ay += dy / d * 0.6; }
        if (d < g.junk.cloudRadius + 60) near++;
      }
      for (const bl of g.enemies.bullets.items) {
        if (!bl.active) continue;
        const dx = pl.x - bl.x, dy = pl.y - bl.y, d = Math.hypot(dx, dy) || 1;
        if (d < 150) { ax -= bl.vy / 175 * 1.5; ay += bl.vx / 175 * 1.5; }
      }
      let mx = ax, my = ay;
      if (best) {
        const ux = (best.x - pl.x) / bd, uy = (best.y - pl.y) / bd;
        const radial = Math.max(-1, Math.min(1, (bd - want) / 80));
        mx += ux * radial - uy * 0.8; my += uy * radial + ux * 0.8;
      }
      mx += (1400 - pl.x) * 0.0006; my += (1000 - pl.y) * 0.0006;
      const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      C.touchActive = true; C.touchX = mx; C.touchY = my;
      if (near >= 4 && pl.pulseCd <= 0) C.pulseQueued = true;
    }, 40);
  }, WARP);
  let lastLog = -10, shots = new Set();
  const snap = async (name) => { if (!shots.has(name)) { shots.add(name); await p.screenshot({ path: `${OUT}/${name}.png` }); } };
  while (true) {
    const s = await p.evaluate(() => {
      const game = window.__jm, g = game.scene.getScene('Game');
      return { state: g.state, t: +g.runTime.toFixed(1), junk: g.junk.count, loose: g.junk.looseCount, hearts: g.player.hearts, lvl: g.level, kills: g.kills, hits: g.hitsTaken, bots: g.enemies.activeCount, wave: g.enemies.wave, boss: g.bossActive ? Math.round(g.bossActive.hp) : null, fps: Math.round(game.loop.actualFps), upg: game.scene.isActive('Upgrade'), res: game.scene.isActive('Results') };
    });
    if (s.t - lastLog >= 20 || s.res) { console.log(JSON.stringify(s)); lastLog = s.t; }
    if (s.t > 6) await snap('run-06s');
    if (s.upg) await snap('upgrade');
    if (s.t > 45) await snap('run-45s');
    if (s.t > 150) await snap('run-150s');
    if (s.boss) await snap('boss');
    if (s.res) { await p.waitForTimeout(1800); await snap('results'); break; }
    if (s.t > MAXT || Date.now() - t0 > 600000) break;
    await p.waitForTimeout(500);
  }
  console.log('errors:', errs.slice(0, 15).join('\n'));
  await b.close();
})();
