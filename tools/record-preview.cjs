// Records a preview video frame by frame on a virtual clock (30 fps, real game speed).
// usage: node tools/record-preview.cjs <width> <height> <frames dir> [world] [seed]
// Then tools/make-previews.sh assembles the MP4s (0.5 s on the cover, then the action).
// Needs a local server on :8080 (npx http-server -c-1 -p 8080 .) and Playwright.
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs');
const [W, H, OUT] = [+process.argv[2], +process.argv[3], process.argv[4]];
const WORLD = process.argv[5] || 'xythera';
const SEED = +(process.argv[6] || 4242);
const FPS = 30;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(OUT + '/' + f);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(([world, seed]) => {
    let vt = 0, cbs = [];
    window.__rec = { step(ms) { vt += ms; const l = cbs; cbs = []; for (const cb of l) cb(vt); } };
    window.requestAnimationFrame = cb => { cbs.push(cb); return cbs.length; };
    performance.now = () => vt;
    Date.now = () => seed; // same battle every recording
    let r = seed; Math.random = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    localStorage.setItem('planet-conquest-campaign', JSON.stringify({ version: 1, cores: 0, upgrades: {}, civ: 'terran', civsUnlocked: ['terran'],
      planets: Object.fromEntries(['vulkara', 'cryonis', 'mycelion', 'xythera', 'noctyra'].map(id => [id, { completed: id !== world, attempts: 1, defeats: 0, bestTime: 500, objectives: [] }])),
      settings: { tips: false, sound: false, labels: true, controlsSeen: true }, tutorial: { done: [1, 2, 3, 4, 5, 6, 7], rewarded: true, offered: true } }));
  }, [WORLD, SEED]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/crazygames-sdk-v3.js', r => r.abort());
  await page.goto('http://localhost:8080/');
  await page.addStyleTag({ content: '#toasts, #tooltip, #banner { display: none !important; } * { cursor: none !important; }' });
  const run = async ms => page.evaluate(ms => { for (let t = 0; t < ms; t += 1000 / 30) window.__rec.step(1000 / 30); }, ms);
  await run(300);
  await page.click('#btn-play');
  await run(300);
  await page.evaluate(() => { window.__planetConquest.battle().spawnLeft = 0.01; });
  await run(3500);
  // Let the tactical AI play our side for a few minutes: a real mid-game war.
  const info = await page.evaluate(async () => {
    const pc = window.__planetConquest, b = pc.battle();
    const { AI_PROFILES } = await import('/js/campaign.js');
    b.factions[1].profile = AI_PROFILES.tactical;
    b.ai[1] = { next: 0, lastTarget: null };
    b.factions[1].minerals += 3000;
    pc.advance(230);
    return { status: b.status, t: Math.round(b.time), tiles: b.factions[1].tiles, attacks: b.attacks.length, ships: b.ships.length };
  });
  console.log('staged', JSON.stringify(info));
  let frame = 0;
  const shoot = () => page.screenshot({ path: `${OUT}/f${String(frame++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  const frames = async (seconds, at) => {
    for (let k = 0; k < Math.round(seconds * FPS); k++) {
      if (at && at[k]) await page.evaluate(at[k]);
      await page.evaluate(() => window.__rec.step(1000 / 30));
      await shoot();
    }
  };
  const camera = (x, y, z) => page.evaluate(([x, y, z]) => { const r = window.__planetConquest.renderer(); r.target.zoom = r.cam.zoom = r.maxZoom() * z; r.centerOn(x, y, true); }, [x, y, z]);
  // Where things happen.
  const pick = () => page.evaluate(async () => {
    const pc = window.__planetConquest, b = pc.battle(), W = b.w;
    const margin = 40;
    const inside = (x, y) => x > margin && y > margin && x < b.w - margin && y < b.h - margin;
    // The busiest front: the biggest attack with a frontier, ours or against us.
    const fronts = b.attacks.filter(a => a.frontier && a.frontier.v.length > 20 && (a.attacker === 1 || a.target === 1)).sort((a, c) => c.troops - a.troops);
    let front = null;
    for (const a of fronts) { const i = a.frontier.v[Math.floor(a.frontier.v.length / 2)]; const x = i % W, y = Math.floor(i / W); if (inside(x, y)) { front = { x, y }; break; } }
    const ship = b.ships.find(s => inside(s.x, s.y));
    const caps = b.sites.filter(s => s.type === 'capital' && s.faction > 1 && b.factions[s.faction].alive && b.factions[s.faction].kind === 'nation' && inside(s.x, s.y));
    const core = await import('/js/sim/core.js');
    const storm = caps.find(s => core.borders(b, 1, s.faction)) || caps[0];
    return { front, ship: ship && { x: ship.x, y: ship.y, owner: ship.owner }, storm: storm && { x: storm.x, y: storm.y } };
  });
  let p = await pick();
  console.log('pick', JSON.stringify(p));
  // Shot A: the busiest front, close.
  if (p.front) await camera(p.front.x, p.front.y, 0.85);
  await frames(6);
  // Shot B: battleships shelling a coast (we launch one if nobody has).
  p = await pick();
  if (!p.ship) {
    p.ship = await page.evaluate(async () => {
      const b = window.__planetConquest.battle(), eng = await import('/js/sim/engine.js'), ships = await import('/js/sim/ships.js');
      const g = ships.seaGrid(b);
      for (const f of b.factions) {
        if (!f || f.id === 1 || !f.alive) continue;
        for (const i of eng.coastalTiles(b, f.id)) {
          const x0 = i % b.w, y0 = Math.floor(i / b.w);
          if (x0 < 50 || y0 < 50 || x0 > b.w - 50 || y0 > b.h - 50) continue;
          const c = ships.nearestSeaCell(b, x0, y0, 2);
          if (c < 0) continue;
          const x = (c % g.cw) * 4 + 2, y = Math.floor(c / g.cw) * 4 + 2;
          b.ships.push({ id: b.nextId++, owner: 1, x, y, tx: x, ty: y, hp: 100, cooldown: 0.4, path: [] });
          b.ships.push({ id: b.nextId++, owner: 1, x: x + 5, y: y + 4, tx: x + 5, ty: y + 4, hp: 80, cooldown: 2.6, path: [] });
          return { x, y, owner: 1 };
        }
      }
      return null;
    });
  }
  if (p.ship) {
    // A duel: ships of the other side close in, and everyone fires in turn.
    const c = await page.evaluate(async ([x, y, owner]) => {
      const b = window.__planetConquest.battle(), ships = await import('/js/sim/ships.js');
      const g = ships.seaGrid(b);
      const foe = owner === 1 ? b.factions.find(f => f && f.kind === 'enemy').id : 1;
      const spots = [];
      for (let r = 6; r <= 16 && spots.length < 2; r += 2) for (let a = 0; a < 6.28 && spots.length < 2; a += 0.5) {
        const c = ships.nearestSeaCell(b, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 0);
        if (c < 0) continue;
        const sx = (c % g.cw) * 4 + 2, sy = Math.floor(c / g.cw) * 4 + 2;
        if (spots.some(s => Math.hypot(s.x - sx, s.y - sy) < 5) || Math.hypot(sx - x, sy - y) < 5) continue;
        spots.push({ x: sx, y: sy });
      }
      let cd = 0.5;
      for (const s of b.ships) if (Math.hypot(s.x - x, s.y - y) < 30) { s.cooldown = cd; cd += 1.1; }
      for (const s of spots) { b.ships.push({ id: b.nextId++, owner: foe, x: s.x, y: s.y, tx: s.x, ty: s.y, hp: 100, cooldown: cd, path: [] }); cd += 1.1; }
      const all = [{ x, y }, ...spots];
      return { x: all.reduce((a, s) => a + s.x, 0) / all.length, y: all.reduce((a, s) => a + s.y, 0) / all.length };
    }, [p.ship.x, p.ship.y, p.ship.owner]);
    await camera(c.x, c.y, 1.0);
  }
  await frames(5);
  // Shot C: a capital falls.
  p = await pick();
  if (p.storm) {
    await camera(p.storm.x, p.storm.y, 0.7);
    await page.evaluate(async ([x, y]) => { const eng = await import('/js/sim/engine.js'); const b = window.__planetConquest.battle(); b.factions[1].troops += 50000; eng.playerAttack(b, y * b.w + x, 0.3); }, [p.storm.x, p.storm.y]);
    const at = {};
    at[Math.round(1.8 * FPS)] = `(async () => { const core = await import('/js/sim/core.js'); const b = window.__planetConquest.battle(); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) core.setOwner(b, (${p.storm.y} + dy) * b.w + ${p.storm.x} + dx, 1); })()`;
    await frames(5.5, at);
  } else await frames(5.5);
  console.log('frames', frame, [...new Set(errs)]);
  await browser.close();
})();
