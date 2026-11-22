/**
 * Records the CrazyGames preview video frame by frame on a virtual clock, so it plays at real
 * game speed even on a slow machine. Real gameplay only: a mid-run swarm with Pulses, a
 * level-up pick, then The Compactor falling and the junk ball exploding.
 *
 *   npm run dev                                   (port 5173, or set URL=...)
 *   node tools/record-preview.cjs <width> <height> <frames-dir>
 *
 * Record at the game's native size (1280 720 landscape, 560 840 portrait); tools/make-previews.sh
 * scales up and adds the cover.
 */
const { chromium } = require('playwright');
const fs = require('fs');

const [W, H, OUT] = [+process.argv[2], +process.argv[3], process.argv[4]];
const URL = process.env.URL || 'http://localhost:5173/';
const FPS = 30;
const DT = 1000 / FPS;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(`${OUT}/${f}`);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    let vt = 0;
    let cbs = [];
    window.__rec = {
      step(ms) {
        vt += ms;
        const list = cbs;
        cbs = [];
        for (const cb of list) cb(vt);
      },
    };
    window.requestAnimationFrame = (cb) => {
      cbs.push(cb);
      return cbs.length;
    };
    performance.now = () => vt;
    let r = 4242;
    Math.random = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    localStorage.clear();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(URL);
  // Pump frames until the title screen is up (fonts load on real time).
  for (let i = 0; i < 400; i++) {
    const ready = await page.evaluate(() => {
      window.__rec.step(1000 / 30);
      return !!(window.__jm && window.__jm.scene.isActive('Menu'));
    });
    if (ready) break;
    await page.waitForTimeout(20);
  }

  // In-page helpers: advance N frames (optionally with the bot steering) and a kiting bot.
  await page.evaluate(() => {
    const game = window.__jm;
    const C = window.__controls;
    const g = () => game.scene.getScene('Game');
    window.__bot = () => {
      const s = g();
      if (s.state !== 'playing') return;
      const pl = s.player;
      let best = null;
      let bd = 1e9;
      let ax = 0;
      let ay = 0;
      let near = 0;
      const want = Math.max(40, s.junk.cloudRadius * 0.85);
      for (const e of s.enemies.pool.items) {
        if (!e.active) continue;
        const dx = pl.x - e.x;
        const dy = pl.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        if (e.kind === 'boss') {
          if (d < 260) (ax += (dx / d) * 2), (ay += (dy / d) * 2);
          if (d < bd + 200) (bd = d), (best = e);
          continue;
        }
        if (d < bd) (bd = d), (best = e);
        if (d < s.junk.cloudRadius + 60) near++;
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
      // Aim the mouse at the nearest robot and hold fire, like a desktop player.
      const tgt = best && best.kind !== 'boss' ? best : null;
      if (tgt) {
        const cam = s.cameras.main;
        C.aimX = (tgt.x - cam.worldView.x) * cam.zoom;
        C.aimY = (tgt.y - cam.worldView.y) * cam.zoom;
        C.hasAim = true;
        C.fireHeld = true;
      } else {
        C.fireHeld = false;
      }
      const l = Math.hypot(mx, my) || 1;
      C.touchActive = true;
      C.touchX = mx / l;
      C.touchY = my / l;
      return near;
    };
    window.__advance = (frames, bot) => {
      for (let i = 0; i < frames; i++) {
        if (bot) window.__bot();
        window.__rec.step(1000 / 30);
      }
    };
    window.__g = g;
  });

  let frame = 0;
  const shoot = () => page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  /** Record `seconds` of play; `at` maps a frame index to a page function run before that frame. */
  const record = async (seconds, at = {}) => {
    for (let k = 0; k < Math.round(seconds * FPS); k++) {
      if (at[k]) await page.evaluate(at[k]);
      await page.evaluate(() => window.__advance(1, true));
      await shoot();
    }
  };

  // Start a run and stage a busy mid-run moment (not recorded).
  await page.evaluate(() => {
    window.__jm.scene.getScene('Menu').play(false);
    window.__advance(40, false);
    const s = window.__g();
    s.player.hasMoved = true;
    s.pulseUsed = true;
    // Keep the clip on the action: no junk shop break, no mini-bosses.
    s.openShop = () => {
      s.shopPending = false;
    };
    s.enemies.minibossWarned = s.enemies.minibossSpawned = true;
    s.enemies.midbossWarned = s.enemies.midbossSpawned = true;
    s.enemies.goldenTimer = 1e9;
    // A fire build: Molten Core + Inferno (lava trails), spinning a huge ball.
    for (const [id, n] of [['hotScrap', 3], ['explosiveCans', 3], ['moltenCore', 1], ['hotterFireballs', 3], ['inferno', 1], ['spinCycle', 2], ['secondRing', 1], ['junkHoarder', 2]]) for (let i = 0; i < n; i++) s.upgrades.take(id);
    s.stats = s.upgrades.stats(s.magnetDef);
    s.player.stats = s.stats;
    s.level = 14;
    s.updateCap();
    s.xpNeed = 1e9;
    s.runTime = 148;
    s.player.invuln = 1e9;
    for (let i = 0; i < s.junk.cap + 10; i++) s.junk.spawnLoose(s.player.x + Math.cos(i) * 50, s.player.y + Math.sin(i) * 50, i % 23 === 0 ? 4 : i % 11 === 0 ? 6 + (i % 4) : i % 4);
    window.__advance(75, true);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      s.enemies.spawn(['tin', 'sprinter', 'spitter', 'shield', 'tin'][i % 5], s.player.x + Math.cos(a) * 520, s.player.y + Math.sin(a) * 380);
    }
    window.__advance(30, true);
    s.player.invuln = 0.01;
  });

  const pulse = () => {
    window.__controls.pulseQueued = true;
  };
  // A: swarm + two Pulses (6 s).
  await record(6, { 30: pulse, 120: pulse });
  // B: a treasure chest opening (slot machine, 3 upgrades) (4.2 s).
  await record(4.2, {
    0: () => window.__g().openChest(),
    122: () => {
      const s = window.__g();
      if (window.__jm.scene.isActive('Chest')) s.closeChest();
    },
  });
  // Stage the boss (not recorded): full ball.
  await page.evaluate(() => {
    const s = window.__g();
    s.player.invuln = 1e9;
    s.level = 16;
    s.updateCap();
    // Skip the Crusher: this clip is about the Compactor.
    s.enemies.minibossWarned = true;
    s.enemies.minibossSpawned = true;
    for (let i = 0; i < 110; i++) s.junk.spawnLoose(s.player.x + Math.cos(i) * 60, s.player.y + Math.sin(i) * 60, i % 4);
    window.__advance(45, true);
  });
  // C: warning banner, the Compactor drops in on screen, charges, falls; everything explodes.
  await record(6.8, {
    0: () => {
      const s = window.__g();
      s.player.invuln = 0.01;
      s.runTime = 354.9;
    },
    26: () => {
      window.__g().runTime = 359.98;
    },
    28: () => {
      const s = window.__g();
      const b = s.bossActive;
      if (!b) return;
      // Bring it on screen and skip the long walk-in.
      b.x = s.player.x + 60;
      b.y = s.player.y - 330;
      b.mode = 0;
      b.modeTimer = 0.7;
      b.hp = b.maxHp = 2600;
      s.juice.shake(0.5);
    },
    // Finish it while it's close to the magnet (or at 5.7 s at the latest).
    ...Object.fromEntries(
      Array.from({ length: 70 }, (_, i) => [
        100 + i,
        new Function(`const s = window.__g(); const b = s.bossActive;
          if (b && (${i} === 69 || Math.hypot(b.x - s.player.x, b.y - s.player.y) < 240)) s.enemies.damage(b, 1e9, s.player.x, s.player.y, 0);`),
      ]),
    ),
  });
  console.log(`${W}x${H}: ${frame} frames; errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await browser.close();
})();
