// Pixel map renderer. One tile = one map pixel, scaled by an integer zoom
// so pixels stay crisp. Terrain is painted once; the ownership layer is
// updated only where tiles changed; everything else is drawn per frame.
import { paintWorld } from './world/paint.js';
import { isLand } from './world/themes.js';
import { SITE_TYPES } from './campaign.js';
import { spriteCanvas, CAPITAL_SPRITE, mixHex } from './art/sprites.js';
import { backdropCanvas } from './art/backdrop.js';
import { rt, world, siteOwner, isShielded, isPowered, empActive, eventPhase, PLAYER } from './sim/core.js';

const NEUTRAL = '#8a8478';
const hexRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function fmt(n) {
  n = Math.max(0, Math.round(n));
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return String(n);
}

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.cam = { zoom: 2, cx: 0, cy: 0 };
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.particles = [];
    this.fx = [];       // timed effects: crash landings
    this.pops = [];     // floating numbers
    this.shakeT = 0; this.shakeAmp = 0;
    this.holdOwner = 0; // territory hidden until a landing ship touches down
    this.labels = new Map();
    this.labelTime = -10;
    this.dpr = 1;
  }

  attach(state, simple = false) {
    this.state = state;
    const w = world(state);
    this.W = state.w; this.H = state.h;
    this.base = this.makeCanvas(this.W, this.H);
    this.baseSimple = null;
    this.base.getContext('2d').putImageData(new ImageData(paintWorld(w, false), this.W, this.H), 0, 0);
    this.over = this.makeCanvas(this.W, this.H);
    this.overCtx = this.over.getContext('2d');
    this.overImg = this.overCtx.createImageData(this.W, this.H);
    this.hi = this.makeCanvas(this.W, this.H);
    this.hiOwner = -1; this.hiTime = 0;
    this.colors = new Map();
    this.simple = simple;
    rt(state).allDirty = true;
    this.labels.clear();
    this.labelTime = -10;
    this.particles = []; this.fx = []; this.pops = []; this.shakeT = 0; this.holdOwner = 0;
    this.fit();
  }

  makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  setSimple(on) {
    if (this.simple === on) return;
    this.simple = on;
    if (on && !this.baseSimple) {
      this.baseSimple = this.makeCanvas(this.W, this.H);
      this.baseSimple.getContext('2d').putImageData(new ImageData(paintWorld(world(this.state), true), this.W, this.H), 0, 0);
    }
    rt(this.state).allDirty = true;
  }

  resize(cssW, cssH, dpr, insets) {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.cssW = cssW; this.cssH = cssH;
    if (insets) this.insets = insets;
    if (this.state) this.clamp();
  }

  // Smallest zoom that covers the whole window with map (rounded up to a
  // whole number so pixels stay crisp; the slight overflow can be panned).
  minZoom() {
    const d = this.dpr;
    return Math.max(1, Math.ceil(Math.max((this.cssW * d) / this.W, (this.cssH * d) / this.H) - 0.02));
  }

  fit() {
    if (!this.cssW) return;
    this.cam.zoom = this.minZoom();
    this.cam.cx = this.W / 2; this.cam.cy = this.H / 2;
    this.clamp();
  }

  // The map is laid out against the full window; HUD insets only decide
  // where "centre" is (the free area between panels) and how far the map
  // may be panned so land can be pulled out from under a panel.
  origin() {
    const d = this.dpr;
    return { x: Math.round((this.cssW * d) / 2 - this.cam.cx * this.cam.zoom), y: Math.round((this.cssH * d) / 2 - this.cam.cy * this.cam.zoom) };
  }

  // strict: keep the map covering the whole window (automatic camera moves).
  // Otherwise the player may drag the edge out from under a HUD panel.
  clamp(strict = false) {
    const { W, H } = this, d = this.dpr;
    const i = strict ? { top: 0, right: 0, bottom: 0, left: 0 } : this.insets;
    this.cam.zoom = Math.max(this.minZoom(), this.cam.zoom);
    const z = this.cam.zoom;
    const vw = (this.cssW * d) / z, vh = (this.cssH * d) / z;
    const lo = x => x * d / z;
    this.cam.cx = Math.max(vw / 2 - lo(i.left), Math.min(W - vw / 2 + lo(i.right), this.cam.cx));
    this.cam.cy = Math.max(vh / 2 - lo(i.top), Math.min(H - vh / 2 + lo(i.bottom), this.cam.cy));
  }

  zoomBy(dir, sx, sy) {
    const z0 = this.cam.zoom;
    const z1 = Math.max(this.minZoom(), Math.min(16, z0 + dir));
    if (z1 === z0) return;
    // Keep the point under the cursor fixed.
    if (sx !== undefined) {
      const t = this.screenToTileF(sx, sy);
      this.cam.zoom = z1;
      const t2 = this.screenToTileF(sx, sy);
      this.cam.cx += t.x - t2.x; this.cam.cy += t.y - t2.y;
    } else this.cam.zoom = z1;
    this.clamp();
  }

  panBy(dxCss, dyCss) {
    this.cam.cx -= (dxCss * this.dpr) / this.cam.zoom;
    this.cam.cy -= (dyCss * this.dpr) / this.cam.zoom;
    this.clamp();
  }

  // Put a tile in the middle of the free area between the HUD panels.
  centerOn(x, y) {
    const i = this.insets, d = this.dpr, z = this.cam.zoom;
    const dx = ((i.left - i.right) / 2) * d / z, dy = ((i.top - i.bottom) / 2) * d / z;
    this.cam.cx = x - dx; this.cam.cy = y - dy;
    this.clamp();
  }

  screenToTileF(sxCss, syCss) {
    const o = this.origin();
    return { x: (sxCss * this.dpr - o.x) / this.cam.zoom, y: (syCss * this.dpr - o.y) / this.cam.zoom };
  }

  screenToTile(sxCss, syCss) {
    const t = this.screenToTileF(sxCss, syCss);
    const x = Math.floor(t.x), y = Math.floor(t.y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    return y * this.W + x;
  }

  tileToCss(x, y) {
    const o = this.origin();
    return { x: (o.x + (x + 0.5) * this.cam.zoom) / this.dpr, y: (o.y + (y + 0.5) * this.cam.zoom) / this.dpr };
  }

  colorOf(o) {
    if (!this.colors.has(o)) {
      const f = this.state.factions[o];
      const c = f ? f.color : NEUTRAL;
      this.colors.set(o, { rgb: hexRgb(c), edge: hexRgb(mixHex(c, '#ffffff', 0.45)), kind: f?.kind });
    }
    return this.colors.get(o);
  }

  // Recompute ownership pixels for changed tiles (and their neighbours).
  updateOverlay() {
    const st = this.state, c = rt(st), W = this.W, H = this.H;
    const img = this.overImg.data;
    const owner = st.owner, terrain = world(st).terrain;
    const paint = i => {
      const o = owner[i];
      const p = i * 4;
      if (!o || !isLand(terrain[i]) || o === this.holdOwner) { img[p + 3] = 0; return; }
      const x = i % W, y = (i - x) / W;
      const col = this.colorOf(o);
      const edge = (x > 0 && owner[i - 1] !== o && isLand(terrain[i - 1])) || (x < W - 1 && owner[i + 1] !== o && isLand(terrain[i + 1]))
        || (y > 0 && owner[i - W] !== o && isLand(terrain[i - W])) || (y < H - 1 && owner[i + W] !== o && isLand(terrain[i + W]));
      if (edge) {
        img[p] = col.edge[0]; img[p + 1] = col.edge[1]; img[p + 2] = col.edge[2]; img[p + 3] = 255;
        return;
      }
      img[p] = col.rgb[0]; img[p + 1] = col.rgb[1]; img[p + 2] = col.rgb[2];
      // Ownership patterns, so colour is not the only cue.
      let a = this.simple ? 215 : 118;
      if (col.kind === 'player' && (x + y) % 5 === 0) a += 60;
      else if (col.kind === 'enemy' && (x % 3 === 0 && y % 3 === 0)) a += 80;
      img[p + 3] = a;
    };
    if (c.allDirty) {
      for (let i = 0; i < W * H; i++) paint(i);
      c.allDirty = false;
      c.dirty.length = 0;
    } else if (c.dirty.length) {
      for (const i of c.dirty) {
        paint(i);
        const x = i % W;
        if (x > 0) paint(i - 1);
        if (x < W - 1) paint(i + 1);
        if (i >= W) paint(i - W);
        if (i + W < W * H) paint(i + W);
      }
      c.dirty.length = 0;
    } else return;
    this.overCtx.putImageData(this.overImg, 0, 0);
  }

  // Bright outline of one civilization's whole territory (hover/inspect).
  updateHighlight(owner, now) {
    if (owner === this.hiOwner && now - this.hiTime < 400) return;
    this.hiOwner = owner; this.hiTime = now;
    const ctx = this.hi.getContext('2d');
    ctx.clearRect(0, 0, this.W, this.H);
    if (owner <= 0) return;
    const img = ctx.createImageData(this.W, this.H);
    const st = this.state, W = this.W, o = owner;
    for (let i = 0; i < W * this.H; i++) {
      if (st.owner[i] !== o) continue;
      const x = i % W;
      const edge = (x > 0 && st.owner[i - 1] !== o) || (x < W - 1 && st.owner[i + 1] !== o) || (i >= W && st.owner[i - W] !== o) || (i + W < st.owner.length && st.owner[i + W] !== o);
      if (edge) { img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
  }

  updateLabels() {
    const st = this.state;
    if (st.time - this.labelTime < 1 && this.labels.size) return;
    this.labelTime = st.time;
    for (const f of st.factions) {
      if (!f || !f.alive || f.tiles < 8) { if (f) this.labels.delete(f.id); continue; }
      let x = Math.round(f.sx / f.tiles), y = Math.round(f.sy / f.tiles);
      if (st.owner[y * st.w + x] !== f.id) {
        let found = null;
        for (let r = 1; r < 60 && !found; r++) {
          for (let k = 0; k < r * 8 && !found; k++) {
            const a = (k / (r * 8)) * Math.PI * 2;
            const xx = Math.round(x + Math.cos(a) * r), yy = Math.round(y + Math.sin(a) * r);
            if (xx >= 0 && yy >= 0 && xx < st.w && yy < st.h && st.owner[yy * st.w + xx] === f.id) found = { x: xx, y: yy };
          }
        }
        if (found) ({ x, y } = found);
      }
      this.labels.set(f.id, { x, y });
    }
  }

  burst(x, y, color, n = 14) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 14;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.8 + Math.random() * 0.5, color });
    }
  }

  // A ship streaks down onto (x, y), then impacts with a flash, debris, a
  // shockwave, a shake and a crater. The owner's territory appears on impact.
  // small: the dropship version (no crater, no hidden territory).
  crashLanding(x, y, { small = false, owner = 0, color = '#3fd0ff' } = {}) {
    this.fx.push({ x, y, t: 0, dur: small ? 0.7 : 1.2, small, owner, color });
    if (owner) { this.holdOwner = owner; rt(this.state).allDirty = true; }
  }

  shake(seconds, amp) {
    this.shakeT = Math.max(this.shakeT, seconds);
    this.shakeAmp = Math.max(this.shakeT > seconds ? this.shakeAmp : 0, amp);
  }

  pop(x, y, text, color = '#ffffff') {
    this.pops.push({ x, y, text, color, life: 1.3, max: 1.3 });
    if (this.pops.length > 24) this.pops.shift();
  }

  impact(f) {
    const { x, y, small } = f;
    this.burst(x, y, '#fff6c8', small ? 8 : 18);
    this.burst(x, y, '#ff9a3c', small ? 10 : 30);
    this.burst(x, y, '#6a6070', small ? 6 : 20);
    this.ring(x, y, '#ffe9a8', small ? 6 : 14);
    if (!small) { this.ring(x, y, f.color, 22); this.stampCrater(x, y); }
    this.shake(small ? 0.2 : 0.45, small ? 2 : 5);
    this.onImpact?.(small);
    if (f.owner && this.holdOwner === f.owner) { this.holdOwner = 0; rt(this.state).allDirty = true; }
  }

  // Scorch a small crater into the painted terrain (cosmetic only).
  stampCrater(cx, cy) {
    const ctx = this.base.getContext('2d');
    const terrain = world(this.state).terrain;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, r = Math.hypot(dx, dy);
        if (x < 0 || y < 0 || x >= this.W || y >= this.H || r > 4.2 || !isLand(terrain[y * this.W + x])) continue;
        if (r < 2.2) ctx.fillStyle = (dx + dy) & 1 ? '#1b1418' : '#251c20';
        else if (r < 3.2) ctx.fillStyle = (dx * 3 + dy) % 4 ? '#3a2c2a' : '#5a4436';
        else if ((dx + dy * 2) % 3 === 0) ctx.fillStyle = '#7a6250';
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  drawFx(T, z, dt, motion) {
    const ctx = this.ctx, d = this.dpr;
    for (const f of this.fx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (k >= 1) { f.done = true; this.impact(f); continue; }
      // Falls in from the upper left, accelerating.
      const e = k * k;
      const dist = f.small ? 30 : 70;
      const sx = f.x - dist * (1 - e), sy = f.y - dist * 1.2 * (1 - e);
      const u = Math.max(2, Math.round(z / 2));
      // Fire trail.
      for (let j = 1; j <= 10; j++) {
        const tk = Math.max(0, k - j * 0.025), te = tk * tk;
        const tx = f.x - dist * (1 - te), ty = f.y - dist * 1.2 * (1 - te);
        ctx.fillStyle = j < 3 ? '#fff2a8' : j < 6 ? '#ff9a3c' : '#a03a2a';
        const q = T(tx + 0.5, ty + 0.5), size = Math.max(u, (f.small ? 2 : 4) * u - j * u * 0.3);
        if (!motion && j % 2) continue;
        ctx.fillRect(Math.round(q.x - size / 2), Math.round(q.y - size / 2), size, size);
      }
      const spr = spriteCanvas('fleet', f.color);
      const sc = Math.max(1, Math.round((z / 2) * (f.small ? 1 : 2)));
      const p = T(sx + 0.5, sy + 0.5);
      ctx.drawImage(spr, Math.round(p.x - (spr.width * sc) / 2), Math.round(p.y - (spr.height * sc) / 2), spr.width * sc, spr.height * sc);
      // Target marker on the ground.
      this.dotCircle(T(f.x + 0.5, f.y + 0.5), (f.small ? 3 : 6) * z * (1 - k * 0.6), '#ffe066', Math.max(1, d));
    }
    this.fx = this.fx.filter(f => !f.done);
  }

  drawPops(T, dt) {
    const ctx = this.ctx, d = this.dpr;
    this.pops = this.pops.filter(p => (p.life -= dt) > 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(13 * d)}px "Pixelify Sans", monospace`;
    ctx.lineWidth = Math.max(2, 3 * d);
    ctx.strokeStyle = 'rgba(5,4,12,0.9)';
    for (const p of this.pops) {
      const k = 1 - p.life / p.max;
      const q = T(p.x + 0.5, p.y + 0.5);
      const y = Math.round(q.y - 10 * d - k * 26 * d);
      ctx.globalAlpha = Math.min(1, p.life / 0.4);
      ctx.strokeText(p.text, Math.round(q.x), y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, Math.round(q.x), y);
    }
    ctx.globalAlpha = 1;
  }

  drawPointer(p, now, motion) {
    const ctx = this.ctx, d = this.dpr;
    const u = Math.max(3, Math.round(3 * d));
    const bob = motion ? Math.round(Math.abs(Math.sin(now * 4)) * 4) * u : 0;
    const r = (6 + (motion ? (now * 1.5) % 1 * 6 : 3)) * u;
    this.dotCircle(p, r, '#ffe066', u, true);
    // Pixel arrow pointing down at the target.
    const rows = ['0111110', '0111110', '0111110', '1111111', '0111110', '0011100', '0001000'];
    const x0 = Math.round(p.x - 3.5 * u), y0 = Math.round(p.y - (rows.length + 4) * u - bob);
    ctx.fillStyle = '#1a1020';
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < 7; x++) if (rows[y][x] === '1') ctx.fillRect(x0 + x * u - u, y0 + y * u, u * 3, u + u);
    ctx.fillStyle = '#ffe066';
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < 7; x++) if (rows[y][x] === '1') ctx.fillRect(x0 + x * u, y0 + y * u, u, u);
  }

  ring(x, y, color, r = 10) {
    this.particles.push({ ring: true, x, y, r0: 1, r, life: 0.9, max: 0.9, color });
  }

  render(ui) {
    const st = this.state, ctx = this.ctx;
    if (!st) return;
    const z = this.cam.zoom, d = this.dpr;
    const o = this.origin();
    const now = ui.now / 1000;
    const motion = !ui.reducedMotion;
    if (this.shakeT > 0) {
      this.shakeT -= ui.dt || 0.016;
      if (motion) {
        const a = Math.round(this.shakeAmp * d * Math.min(1, this.shakeT / 0.15));
        o.x += Math.round((Math.random() * 2 - 1) * a); o.y += Math.round((Math.random() * 2 - 1) * a);
      }
    }
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Space backdrop at a fixed pixel scale.
    const bs = Math.max(2, Math.round(2 * d));
    const sky = backdropCanvas(st.theme, Math.ceil(this.canvas.width / bs), Math.ceil(this.canvas.height / bs));
    ctx.drawImage(sky, 0, 0, sky.width * bs, sky.height * bs);

    // Map frame, terrain, ownership.
    ctx.fillStyle = '#05040a';
    ctx.fillRect(o.x - z, o.y - z, (this.W + 2) * z, (this.H + 2) * z);
    ctx.drawImage(this.simple && this.baseSimple ? this.baseSimple : this.base, o.x, o.y, this.W * z, this.H * z);
    this.updateOverlay();
    ctx.drawImage(this.over, o.x, o.y, this.W * z, this.H * z);
    const hiOwner = ui.hoverOwner > 0 ? ui.hoverOwner : ui.inspectOwner;
    this.updateHighlight(hiOwner || 0, ui.now);
    if (hiOwner > 0) {
      ctx.globalAlpha = motion ? 0.55 + 0.35 * Math.sin(now * 4) : 0.8;
      ctx.drawImage(this.hi, o.x, o.y, this.W * z, this.H * z);
      ctx.globalAlpha = 1;
    }

    const T = (x, y) => ({ x: o.x + x * z, y: o.y + y * z });
    const ev = eventPhase(st);

    // Defense ranges.
    for (const s of st.sites) {
      const so = siteOwner(st, s);
      if (s.type === 'turret' && isPowered(st, s)) this.dotCircle(T(s.x + 0.5, s.y + 0.5), SITE_TYPES.turret.radius * z, ev.type === 'surge' && ev.active ? '#ff6a4a' : '#ff3b3b', z);
      if (s.type === 'hub' && so && !empActive(st, s)) this.dotCircle(T(s.x + 0.5, s.y + 0.5), SITE_TYPES.hub.radius * z, '#b8ff5a', z * 3);
      if ((s.type === 'capital' || s.type === 'citadel') && isShielded(st, s)) {
        const r = (4.5 + (motion ? Math.sin(now * 3) * 0.4 : 0)) * z;
        this.dotCircle(T(s.x + 0.5, s.y + 0.5), r, '#c4ff6a', Math.max(1, z / 2), true);
      }
    }

    // Attack fronts: the next tiles each attack will take.
    for (const a of st.attacks) {
      if (!a.frontier) continue;
      // The player's own fronts pulse so the advancing edge reads as alive.
      const mine = motion && Math.floor(now * 5) % 2 ? '#ffd25e' : '#fff2a8';
      const col = a.target === PLAYER ? '#ff2a2a' : a.attacker === PLAYER ? mine : mixHex(st.factions[a.attacker].color, '#ffffff', 0.3);
      ctx.fillStyle = col;
      const front = a.frontier.v;
      const end = Math.min(front.length, 200);
      for (let k = 0; k < end; k++) {
        const i = front[k];
        if (st.owner[i] !== a.target) continue;
        if (motion && (k + Math.floor(now * 8)) % 3 === 0) continue;
        const x = i % this.W, y = (i - x) / this.W;
        ctx.fillRect(o.x + x * z, o.y + y * z, z, z);
      }
    }

    // Structures.
    const sc = Math.max(1, Math.round(z / 2));
    const drawSprite = (name, x, y, color) => {
      const spr = spriteCanvas(name, color);
      const p = T(x + 0.5, y + 0.5);
      ctx.drawImage(spr, Math.round(p.x - (spr.width * sc) / 2), Math.round(p.y - spr.height * sc + sc), spr.width * sc, spr.height * sc);
      return { p, w: spr.width * sc, h: spr.height * sc };
    };
    for (const b of st.buildings) {
      const bo = st.owner[b.y * st.w + b.x];
      drawSprite(b.type, b.x, b.y, bo ? st.factions[bo].color : NEUTRAL);
    }
    for (const s of st.sites) {
      const so = siteOwner(st, s);
      const color = so ? st.factions[so].color : NEUTRAL;
      if (this.holdOwner && so === this.holdOwner) continue;
      let name = s.type;
      if (s.type === 'capital') name = s.id === 'enemy-capital' ? CAPITAL_SPRITE[st.theme] : s.id === 'player-capital' ? 'fortress' : 'normal';
      const r = drawSprite(name, s.x, s.y, color);
      if (empActive(st, s)) {
        ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = Math.max(1, d);
        if (!motion || Math.floor(now * 6) % 2) ctx.strokeRect(r.p.x - r.w / 2 - 2, r.p.y - r.h - 2, r.w + 4, r.h + 4);
      }
      if (ui.highlights && (ui.highlights.has(s.type) || ui.highlights.has(s.id)) && so !== PLAYER) {
        const pulse = motion ? Math.floor(now * 3) % 2 : 1;
        ctx.strokeStyle = pulse ? '#ffe066' : '#ffb020'; ctx.lineWidth = Math.max(2, 2 * d);
        const pad = 4 * d;
        ctx.strokeRect(r.p.x - r.w / 2 - pad, r.p.y - r.h - pad, r.w + pad * 2, r.h + pad * 2);
      }
    }

    // Tutorial pointer: a bouncing arrow over the tile the current step is about.
    if (ui.pointer) this.drawPointer(T(ui.pointer.x + 0.5, ui.pointer.y + 0.5), now, motion);

    // Dropships.
    for (const ds of st.dropships) drawSprite('fleet', ds.x, ds.y, st.factions[ds.owner].color);

    // Particles and rings.
    const dt = ui.dt || 0.016;
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    for (const p of this.particles) {
      if (p.ring) {
        const k = 1 - p.life / p.max;
        this.dotCircle(T(p.x + 0.5, p.y + 0.5), (p.r0 + (p.r - p.r0) * k) * z, p.color, Math.max(1, z / 2));
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 10 * dt;
      ctx.fillStyle = p.color;
      const q = T(p.x, p.y);
      ctx.fillRect(Math.round(q.x), Math.round(q.y), Math.max(1, z), Math.max(1, z));
    }

    this.drawFx(T, z, dt, motion);
    this.drawPops(T, dt);

    // Planetary events over the map.
    this.drawEvent(ev, o, z, now, motion);

    // Spawn phase.
    if (st.status === 'spawn') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(o.x, o.y, this.W * z, this.H * z);
      if (ui.spawnHover) {
        const c = T(ui.spawnHover.x + 0.5, ui.spawnHover.y + 0.5);
        const col = ui.spawnHover.ok ? '#7ff0c8' : '#ff4b3e';
        for (let k = 0; k < 3; k++) {
          const rr = ((motion ? (now * 0.8 + k / 3) % 1 : k / 3) * 14 + 4) * z;
          this.dotCircle(c, rr, col, Math.max(1, z / 2));
        }
      }
    }

    if (ui.labels !== false) this.drawLabels(o, z);
  }

  dotCircle(c, r, color, step, solid = false) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const n = Math.max(12, Math.floor((r * 2 * Math.PI) / Math.max(2, step * 2)));
    const s = Math.max(1, Math.round(this.dpr));
    for (let k = 0; k < n; k++) {
      if (!solid && k % 2) continue;
      const a = (k / n) * Math.PI * 2;
      ctx.fillRect(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r), s * (solid ? 2 : 1), s * (solid ? 2 : 1));
    }
  }

  drawEvent(ev, o, z, now, motion) {
    if (!ev.type || (!ev.active && !ev.warning)) return;
    const ctx = this.ctx, W = this.W * z, H = this.H * z;
    if (ev.type === 'eclipse' && ev.active) {
      ctx.fillStyle = 'rgba(10,0,8,0.38)';
      ctx.fillRect(o.x, o.y, W, H);
    }
    if (!motion) return;
    const count = ev.active ? 160 : 40;
    const seedT = Math.floor(now * 20);
    const colors = { storm: '#e6f6ff', bloom: '#c4ff6a', eruption: '#ffb02e', surge: '#7fe8ff', eclipse: '#ff3a4a' };
    ctx.fillStyle = colors[ev.type] || '#ffffff';
    for (let k = 0; k < count; k++) {
      const u = ((k * 9301 + 49297) % 233280) / 233280, v = ((k * 4513 + 1931) % 104729) / 104729;
      let x, y;
      if (ev.type === 'storm') { x = (u * W + now * 120 * this.dpr) % W; y = (v * H + now * 60 * this.dpr) % H; }
      else { x = u * W; y = (v * H - now * 25 * this.dpr * (0.5 + u)) % H; if (y < 0) y += H; }
      if (ev.type !== 'storm' && (k + seedT) % 4 === 0) continue;
      ctx.fillRect(Math.round(o.x + x), Math.round(o.y + y), Math.max(1, z), Math.max(1, z));
    }
  }

  drawLabels(o, z) {
    const st = this.state, ctx = this.ctx, d = this.dpr;
    this.updateLabels();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Biggest empires first; skip labels that would overlap one already drawn.
    const order = [...this.labels.keys()].filter(id => st.factions[id]?.alive && id !== this.holdOwner)
      .sort((a, b) => (a === PLAYER ? -1 : b === PLAYER ? 1 : st.factions[b].tiles - st.factions[a].tiles));
    const placed = [];
    for (const id of order) {
      const pos = this.labels.get(id);
      const f = st.factions[id];
      const base = Math.sqrt(f.tiles) * z * 0.2;
      const size = Math.max(10 * d, Math.min(24 * d, base));
      if (id !== PLAYER && base < 6 * d) continue;
      const p = { x: o.x + (pos.x + 0.5) * z, y: o.y + (pos.y + 0.5) * z };
      const name = id === PLAYER ? 'YOU' : f.name;
      const big = id === PLAYER || f.kind === 'enemy';
      ctx.font = `${big ? 700 : 400} ${Math.round(size)}px "Pixelify Sans", monospace`;
      const wHalf = ctx.measureText(name).width / 2 + 4;
      const box = { x0: p.x - wHalf, x1: p.x + wHalf, y0: p.y - size * 1.1, y1: p.y + size * 1.1 };
      if (id !== PLAYER && placed.some(b => b.x0 < box.x1 && b.x1 > box.x0 && b.y0 < box.y1 && b.y1 > box.y0)) continue;
      placed.push(box);
      ctx.lineWidth = Math.max(2, size / 5);
      ctx.strokeStyle = 'rgba(5,4,12,0.85)';
      ctx.fillStyle = id === PLAYER ? '#e6fbff' : '#f2ecff';
      ctx.strokeText(name, p.x, p.y - size * 0.55);
      ctx.fillText(name, p.x, p.y - size * 0.55);
      const troops = fmt(f.troops);
      ctx.font = `700 ${Math.round(size * 0.95)}px "Pixelify Sans", monospace`;
      ctx.strokeText(troops, p.x, p.y + size * 0.5);
      ctx.fillStyle = id === PLAYER ? '#7fe8ff' : f.kind === 'enemy' ? mixHex(f.color, '#ffffff', 0.4) : '#ffffff';
      ctx.fillText(troops, p.x, p.y + size * 0.5);
    }
  }
}
