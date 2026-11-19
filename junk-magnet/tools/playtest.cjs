/**
 * Automated playtests. Start `npm run dev` first (port 5173, or set URL=...).
 *
 *   node tools/playtest.cjs [--idle] [--warp=4] [--max=520] [--shots=dir]
 *
 * Default: a kiting bot plays a full run (time-warped) and logs health, junk, hits, kills and
 * boss HP every 20 s of game time.
 * --idle: the AFK test. Nobody touches the controls; the run must end in death before 1:30,
 *         otherwise the script exits with code 1.
 */
const { chromium } = require('playwright');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const IDLE = !!args.idle;
const WARP = Number(args.warp ?? 4);
const MAXT = Number(args.max ?? (IDLE ? 120 : 520));
const SHOTS = args.shots;
const URL = process.env.URL || 'http://localhost:5173/';
const AFK_LIMIT = 90;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));
  await page.goto(URL);
  await page.waitForFunction(() => window.__jm && window.__jm.scene.isActive('Menu'), null, { timeout: 20000 });
  await page.evaluate(() => {
    localStorage.clear();
    window.__jm.scene.getScene('Menu').play(false);
  });
  await page.waitForFunction(() => window.__jm.scene.getScene('Game').state === 'playing', null, { timeout: 8000 });

  await page.evaluate(
    ({ warp, idle }) => {
      window.__warp = warp;
      const C = window.__controls;
      const game = window.__jm;
      window.__botTimer = setInterval(() => {
        const g = game.scene.getScene('Game');
        if (game.scene.isActive('Upgrade')) {
          const u = game.scene.getScene('Upgrade');
          if (!u.locked && u.cards.length) u.pick(Math.floor(Math.random() * u.cards.length));
          return;
        }
        if (idle || g.state !== 'playing') return;
        // Touch mode: fireballs auto-aim at the nearest robot.
        C.isTouch = true;
        const pl = g.player;
        let best = null;
        let bd = 1e9;
        let ax = 0;
        let ay = 0;
        let near = 0;
        const want = Math.max(40, g.junk.cloudRadius * 0.9);
        for (const e of g.enemies.pool.items) {
          if (!e.active || e.hidden) continue;
          const dx = pl.x - e.x;
          const dy = pl.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          if (e.kind === 'boss' || e.kind === 'crusher' || e.kind === 'bomber') {
            if (d < 300) (ax += (dx / d) * 3), (ay += (dy / d) * 3);
            continue;
          }
          if (d < bd) (bd = d), (best = e);
          if (d < 90 && g.junk.count < 8) (ax += (dx / d) * 0.6), (ay += (dy / d) * 0.6);
          if (d < g.junk.cloudRadius + 60) near++;
        }
        for (const b of g.enemies.bullets.items) {
          if (!b.active) continue;
          const d = Math.hypot(pl.x - b.x, pl.y - b.y);
          if (d < 150) (ax -= (b.vy / 175) * 1.5), (ay += (b.vx / 175) * 1.5);
        }
        let mx = ax;
        let my = ay;
        if (best) {
          const ux = (best.x - pl.x) / bd;
          const uy = (best.y - pl.y) / bd;
          const radial = Math.max(-1, Math.min(1, (bd - want) / 80));
          mx += ux * radial - uy * 0.8;
          my += uy * radial + ux * 0.8;
        }
        mx += (1400 - pl.x) * 0.0006;
        my += (1000 - pl.y) * 0.0006;
        const l = Math.hypot(mx, my) || 1;
        C.touchActive = true;
        C.touchX = mx / l;
        C.touchY = my / l;
        if (near >= 4 && pl.pulseCd <= 0) C.pulseQueued = true;
        if (g.weapons.specials.length && g.weapons.specialCd <= 0 && g.junk.count > 40) C.specialQueued = true;
      }, 40);
    },
    { warp: WARP, idle: IDLE },
  );

  let lastLog = -100;
  let last = null;
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const game = window.__jm;
      const g = game.scene.getScene('Game');
      return {
        state: g.state,
        t: +g.runTime.toFixed(1),
        phase: g.phaseLabel,
        hp: Math.round(g.player.hp),
        junk: g.junk.count,
        cap: g.junk.cap,
        lvl: g.level,
        kills: g.kills,
        hits: g.hitsTaken,
        bots: g.enemies.activeCount,
        boss: g.bossActive ? `${g.bossActive.kind} ${Math.round(g.bossActive.hp)}` : null,
        results: game.scene.isActive('Results'),
      };
    });
    last = s;
    if (s.t - lastLog >= 20 || s.results) {
      console.log(JSON.stringify(s));
      lastLog = s.t;
    }
    if (SHOTS && s.results) await page.screenshot({ path: `${SHOTS}/playtest-results.png` });
    if (s.results || s.state === 'dying' || s.t > MAXT || Date.now() - t0 > 900000) break;
    await page.waitForTimeout(400);
  }
  await browser.close();

  if (errors.length) {
    console.log('PAGE ERRORS:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  if (IDLE) {
    const died = last.state === 'dying' || last.state === 'over';
    const ok = died && last.t < AFK_LIMIT;
    console.log(ok ? `AFK test passed: idle player died at ${last.t}s` : `AFK test FAILED: idle player ${died ? `died at ${last.t}s` : `still alive at ${last.t}s`} (limit ${AFK_LIMIT}s)`);
    if (!ok) process.exitCode = 1;
  } else {
    console.log(`Run ended at ${last.t}s in phase ${last.phase} (${last.state})`);
  }
})();
