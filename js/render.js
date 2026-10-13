// Pixel map renderer. One tile = one map pixel, scaled by an integer zoom
// so pixels stay crisp. Terrain is painted once; the ownership layer is
// updated only where tiles changed; everything else is drawn per frame.
import { paintWorld } from './world/paint.js';
import { isLand } from './world/themes.js';
import { SITE_TYPES } from './campaign.js';
import { spriteCanvas, spriteCanvasHi, glyphCanvas, spriteAccent, CAPITAL_SPRITE, mixHex, shadeHex } from './art/sprites.js';
import { backdropCanvas } from './art/backdrop.js';
import { rt, world, siteOwner, isShielded, isPowered, empActive, eventPhase, mapScale, PLAYER } from './sim/core.js';

const NEUTRAL = '#8a8478';
const shadeColor = (c, k) => shadeHex(c, k);
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
    this.marches = [];  // survivors walking home
    this.aims = [];     // short-lived arrows showing where a push is headed
    this.shakeT = 0; this.shakeAmp = 0;
    this.holdOwner = 0; // territory hidden until a landing ship touches down...
    this.landing = 0;   // ...and its capital and label until the impact
    this.reveal = null; // after impact, territory spreads out from the crater
    this.rising = new Map(); // building id -> time its build animation started
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
    this.particles = []; this.fx = []; this.pops = []; this.shakeT = 0; this.holdOwner = 0; this.landing = 0; this.reveal = null;
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

  // Smallest zoom that covers the whole window with map. Zoom is continuous
  // (device pixels per tile); the map is drawn with smoothing off, so pixels
  // stay sharp at in-between zooms.
  minZoom() {
    const d = this.dpr;
    return Math.max((this.cssW * d) / this.W, (this.cssH * d) / this.H);
  }

  maxZoom() {
    return Math.max(this.minZoom(), 8 * this.dpr);
  }

  fit() {
    if (!this.cssW) return;
    this.cam.zoom = this.minZoom();
    this.cam.cx = this.W / 2; this.cam.cy = this.H / 2;
    this.clamp();
    this.target = { zoom: this.cam.zoom, cx: this.cam.cx, cy: this.cam.cy, anchor: null };
  }

  // The map is laid out against the full window; HUD insets only decide
  // where "centre" is (the free area between panels).
  origin() {
    const d = this.dpr;
    return { x: Math.round((this.cssW * d) / 2 - this.cam.cx * this.cam.zoom), y: Math.round((this.cssH * d) / 2 - this.cam.cy * this.cam.zoom) };
  }

  // Keep a camera ({zoom, cx, cy}) inside the map: the space backdrop never
  // shows past its edge.
  clampCam(cam) {
    const { W, H } = this, d = this.dpr;
    cam.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom(), cam.zoom));
    const vw = (this.cssW * d) / cam.zoom, vh = (this.cssH * d) / cam.zoom;
    cam.cx = Math.max(vw / 2, Math.min(W - vw / 2, cam.cx));
    cam.cy = Math.max(vh / 2, Math.min(H - vh / 2, cam.cy));
  }

  clamp() {
    this.clampCam(this.cam);
    if (this.target) this.clampCam(this.target);
  }

  // Zoom toward a target by a factor; the camera eases there over ~150 ms,
  // keeping the point under (sx, sy) fixed when given.
  zoomByFactor(f, sx, sy) {
    if (!this.target) this.fit();
    const t = this.target;
    t.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom(), t.zoom * f));
    if (sx !== undefined) t.anchor = { sx, sy, tile: this.screenToTileF(sx, sy) };
    else t.anchor = { sx: this.cssW / 2, sy: this.cssH / 2, tile: this.screenToTileF(this.cssW / 2, this.cssH / 2) };
  }

  // Step-wise zoom for keys and the landing camera: about a quarter per step.
  zoomBy(dir, sx, sy) {
    this.zoomByFactor(dir > 0 ? 1.25 : 0.8, sx, sy);
  }

  zoomTo(zoom) {
    if (!this.target) this.fit();
    this.zoomByFactor(zoom / this.target.zoom);
  }

  // Move the live camera toward its target (called once per frame).
  ease(dt) {
    const t = this.target;
    if (!t) return;
    const k = 1 - Math.exp(-dt * 14);
    const c = this.cam;
    c.zoom += (t.zoom - c.zoom) * k;
    if (Math.abs(t.zoom - c.zoom) < 0.002) c.zoom = t.zoom;
    if (t.anchor) {
      // Re-anchor every frame so the point under the cursor stays put.
      const d = this.dpr;
      c.cx = t.anchor.tile.x - (t.anchor.sx * d - (this.cssW * d) / 2) / c.zoom;
      c.cy = t.anchor.tile.y - (t.anchor.sy * d - (this.cssH * d) / 2) / c.zoom;
      this.clampCam(c);
      if (c.zoom === t.zoom) { t.cx = c.cx; t.cy = c.cy; t.anchor = null; }
    } else {
      c.cx += (t.cx - c.cx) * k; c.cy += (t.cy - c.cy) * k;
      this.clampCam(c);
    }
  }

  // Dragging moves the camera directly.
  panBy(dxCss, dyCss) {
    const d = this.dpr;
    this.cam.cx -= (dxCss * d) / this.cam.zoom;
    this.cam.cy -= (dyCss * d) / this.cam.zoom;
    this.clampCam(this.cam);
    if (this.target) { this.target.zoom = this.cam.zoom; this.target.cx = this.cam.cx; this.target.cy = this.cam.cy; this.target.anchor = null; }
  }

  // Glide to put a tile in the middle of the free area between the HUD panels.
  centerOn(x, y, instant = false) {
    if (!this.target) this.fit();
    const i = this.insets, d = this.dpr, z = this.target.zoom;
    const t = this.target;
    t.cx = x - ((i.left - i.right) / 2) * d / z;
    t.cy = y - ((i.top - i.bottom) / 2) * d / z;
    t.anchor = null;
    this.clampCam(t);
    if (instant) { this.cam.cx = t.cx; this.cam.cy = t.cy; this.cam.zoom = t.zoom; }
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
      if (!o || !isLand(terrain[i]) || (o === this.holdOwner && !this.revealed(i))) { img[p + 3] = 0; return; }
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
    if (owner) { this.holdOwner = owner; this.landing = owner; this.reveal = null; rt(this.state).allDirty = true; }
  }

  revealed(i) {
    const r = this.reveal;
    if (!r) return false;
    const x = i % this.W, y = (i - x) / this.W;
    return (x - r.x) ** 2 + (y - r.y) ** 2 <= r.r * r.r;
  }

  // Grow the revealed circle and repaint the ring of tiles it just uncovered.
  advanceReveal(dt) {
    const r = this.reveal;
    if (!r) return;
    const st = this.state, c = rt(st), lin = mapScale(st);
    const prev = r.r;
    r.r += dt * 32 * lin;
    const R = Math.ceil(r.r);
    for (let y = Math.max(0, r.y - R); y <= Math.min(this.H - 1, r.y + R); y++) {
      for (let x = Math.max(0, r.x - R); x <= Math.min(this.W - 1, r.x + R); x++) {
        const d2 = (x - r.x) ** 2 + (y - r.y) ** 2;
        if (d2 > prev * prev - 2 * prev && d2 <= r.r * r.r + 2 * r.r) c.dirty.push(y * this.W + x);
      }
    }
    if (r.r > 30 * lin) { this.reveal = null; this.holdOwner = 0; c.allDirty = true; }
  }

  // Zoomed-out structure badge: a fixed-size shape in the owner's colour
  // with a white glyph (pentagon = starport, hexagon = bastion, diamond =
  // spire, square = capital, circle = everything else).
  drawBadge(p, kind, color, accent, level = 1) {
    const ctx = this.ctx, d = this.dpr;
    const site = kind === 'site';
    const R = Math.round((site ? 5.5 : 7.5) * d);
    const sides = { starport: 5, bastion: 6, spire: 4, capital: 4 }[kind] || 0;
    const fill = site && color === NEUTRAL ? accent[0] : color;
    const cx = Math.round(p.x), cy = Math.round(p.y);
    ctx.beginPath();
    if (sides) {
      const rot = kind === 'capital' ? Math.PI / 4 : -Math.PI / 2;
      const rr = kind === 'capital' ? R * 1.25 : R * 1.1;
      for (let k = 0; k < sides; k++) {
        const a = rot + (k / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
    } else ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = shadeColor(fill, 0.78);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 1.5 * d);
    ctx.strokeStyle = '#0a0a14';
    ctx.stroke();
    const g = glyphCanvas(kind);
    const gs = Math.max(1, Math.round((site ? 1.2 : 1.7) * d));
    ctx.drawImage(g, cx - Math.round((g.width * gs) / 2), cy - Math.round((g.height * gs) / 2), g.width * gs, g.height * gs);
    if (level > 1) this.levelTag(cx - R - 2 * d, cy - R - 6 * d, level);
    return { p: { x: cx, y: cy + R }, w: R * 2, h: R * 2 };
  }

  // Small white-on-black level number, as in FrontWars.
  levelTag(x, y, level) {
    const ctx = this.ctx, d = this.dpr;
    const s = Math.round(9 * d);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
    ctx.font = `700 ${Math.round(8 * d)}px "Alien Body", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(level), Math.round(x + s / 2), Math.round(y + s / 2 + d * 0.5));
  }

  // Rails: for every civilization, a minimum spanning tree over its
  // buildings and capital (short links over its own land only), drawn as
  // white sleepers on a dark bed. Recomputed once a second.
  railNetwork() {
    const st = this.state;
    if (this.rails && st.time - this.railsTime < 1) return this.rails;
    this.railsTime = st.time;
    const lin = mapScale(st), maxLen = 45 * lin;
    const byOwner = new Map();
    const add = (o, x, y) => { if (!o) return; if (!byOwner.has(o)) byOwner.set(o, []); byOwner.get(o).push({ x, y }); };
    for (const b of st.buildings) add(st.owner[b.y * st.w + b.x], b.x, b.y);
    for (const s of st.sites) if ((s.type === 'capital' || s.type === 'citadel') && byOwner.has(siteOwner(st, s))) add(siteOwner(st, s), s.x, s.y);
    const segs = [];
    const ownLine = (o, a, b) => {
      for (const f of [0.2, 0.4, 0.5, 0.6, 0.8]) {
        const x = Math.round(a.x + (b.x - a.x) * f), y = Math.round(a.y + (b.y - a.y) * f);
        if (st.owner[y * st.w + x] !== o) return false;
      }
      return true;
    };
    for (const [o, nodes] of byOwner) {
      if (nodes.length < 2) continue;
      const inTree = [nodes[0]], rest = nodes.slice(1);
      while (rest.length) {
        let best = null, bd = Infinity, bi = -1;
        for (let i = 0; i < rest.length; i++) {
          for (const t of inTree) {
            const dd = Math.hypot(rest[i].x - t.x, rest[i].y - t.y);
            if (dd < bd) { bd = dd; best = t; bi = i; }
          }
        }
        const n = rest.splice(bi, 1)[0];
        inTree.push(n);
        if (bd <= maxLen && ownLine(o, best, n)) segs.push({ x0: best.x, y0: best.y, x1: n.x, y1: n.y, len: bd });
      }
    }
    this.rails = segs;
    return segs;
  }

  drawRails(T, z, now, motion, near) {
    const ctx = this.ctx, d = this.dpr;
    const segs = this.railNetwork();
    if (!segs.length) return;
    const bed = near ? Math.max(3 * d, z * 0.55) : 3 * d;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(16,12,24,0.85)';
    ctx.lineWidth = bed;
    ctx.beginPath();
    for (const s of segs) { const a = T(s.x0 + 0.5, s.y0 + 0.5), b = T(s.x1 + 0.5, s.y1 + 0.5); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.stroke();
    ctx.strokeStyle = '#f2ecff';
    ctx.lineWidth = bed * 0.5;
    ctx.setLineDash([bed * 0.6, bed * 0.6]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!near || !motion) return;
    // A little train shuttles along each line.
    for (const s of segs) {
      const u = (now * 6 * mapScale(this.state)) / Math.max(1, s.len) + (s.x0 * 0.37 + s.y1 * 0.11);
      const f = u % 2 < 1 ? u % 2 : 2 - (u % 2);
      const p = T(s.x0 + 0.5 + (s.x1 - s.x0) * f, s.y0 + 0.5 + (s.y1 - s.y0) * f);
      const w = Math.round(bed * 1.6), h = Math.round(bed * 0.9);
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(Math.round(p.x - w / 2) - 1, Math.round(p.y - h / 2) - 1, w + 2, h + 2);
      ctx.fillStyle = '#d8323c'; ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h);
      ctx.fillStyle = '#ffd0d0'; ctx.fillRect(Math.round(p.x - w / 2) + 1, Math.round(p.y - h / 2) + 1, Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
    }
  }

  // Start a building's rise-from-the-ground animation.
  raise(id, now) {
    this.rising.set(id, now);
  }

  shake(seconds, amp) {
    this.shakeT = Math.max(this.shakeT, seconds);
    this.shakeAmp = Math.max(this.shakeT > seconds ? this.shakeAmp : 0, amp);
  }

  // Show for a second which way a new (or re-aimed) attack will push.
  aim(x0, y0, x1, y1, color) {
    this.aims = [{ x0, y0, x1, y1, color, life: 1.2 }];
  }

  // A small column of survivors walking from a front back to the capital.
  march(x0, y0, x1, y1, color) {
    const dur = Math.min(1.8, 0.6 + Math.hypot(x1 - x0, y1 - y0) / (60 * mapScale(this.state)));
    this.marches.push({ x0, y0, x1, y1, color, t: 0, dur });
  }

  drawMarches(T, dt) {
    const ctx = this.ctx, d = this.dpr;
    const u = Math.max(2, Math.round(2 * d));
    this.marches = this.marches.filter(m => (m.t += dt) < m.dur);
    for (const m of this.marches) {
      for (let k = 0; k < 3; k++) {
        const f = Math.max(0, Math.min(1, m.t / m.dur - k * 0.05));
        const p = T(m.x0 + 0.5 + (m.x1 - m.x0) * f, m.y0 + 0.5 + (m.y1 - m.y0) * f);
        ctx.fillStyle = '#0a0a14'; ctx.fillRect(Math.round(p.x) - u, Math.round(p.y) - u, u * 2 + 2, u * 2 + 2);
        ctx.fillStyle = m.color; ctx.fillRect(Math.round(p.x) - u + 1, Math.round(p.y) - u + 1, u * 2, u * 2);
      }
    }
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
    if (f.owner && this.holdOwner === f.owner) { this.landing = 0; this.reveal = { x: f.x, y: f.y, r: 0 }; }
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
    ctx.font = `700 ${Math.round(13 * d)}px "Alien Body", monospace`;
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

  drawIntent(a, b, it, z, now, motion) {
    const ctx = this.ctx, d = this.dpr;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 8 * d) return;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const u = Math.max(2, Math.round(Math.min(z, 3 * d) * it.weight));
    const stepPx = u * 3;
    const shift = motion ? (now * 40 * d) % stepPx : 0;
    // Marching dashes towards the target, outlined so they read on any terrain.
    for (let t = shift; t < len - u * 4; t += stepPx) {
      const x = Math.round(a.x + ux * t), y = Math.round(a.y + uy * t);
      ctx.fillStyle = '#12060a'; ctx.fillRect(x - u, y - u, u * 2 + 1, u * 2 + 1);
      ctx.fillStyle = it.color; ctx.fillRect(x - u / 2, y - u / 2, u, u);
    }
    // Arrowhead.
    const hx = b.x, hy = b.y, s = u * 5;
    const px = -uy, py = ux;
    ctx.beginPath();
    ctx.moveTo(Math.round(hx), Math.round(hy));
    ctx.lineTo(Math.round(hx - ux * s + px * s * 0.6), Math.round(hy - uy * s + py * s * 0.6));
    ctx.lineTo(Math.round(hx - ux * s - px * s * 0.6), Math.round(hy - uy * s - py * s * 0.6));
    ctx.closePath();
    ctx.lineWidth = Math.max(2, u);
    ctx.strokeStyle = '#12060a'; ctx.stroke();
    ctx.fillStyle = it.color; ctx.fill();
    if (it.label) {
      ctx.font = `700 ${Math.round(11 * d)}px "Alien Body", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mx = Math.round((a.x + b.x) / 2), my = Math.round((a.y + b.y) / 2 - 8 * d);
      ctx.lineWidth = Math.max(2, 3 * d); ctx.strokeStyle = 'rgba(5,4,12,0.9)';
      ctx.strokeText(it.label, mx, my);
      ctx.fillStyle = '#ffb4b4'; ctx.fillText(it.label, mx, my);
    }
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
    this.ease(ui.dt || 0.016);
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
    this.advanceReveal(ui.reducedMotion ? 99 : ui.dt || 0.016);
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
      const lin = mapScale(st);
      if (s.type === 'turret' && isPowered(st, s)) this.dotCircle(T(s.x + 0.5, s.y + 0.5), SITE_TYPES.turret.radius * lin * z, ev.type === 'surge' && ev.active ? '#ff6a4a' : '#ff3b3b', z);
      if (s.type === 'hub' && so && !empActive(st, s)) this.dotCircle(T(s.x + 0.5, s.y + 0.5), SITE_TYPES.hub.radius * lin * z, '#b8ff5a', z * 3);
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
        // Snap to whole pixels so neighbouring front tiles never leave gaps.
        const px = Math.floor(o.x + x * z), py = Math.floor(o.y + y * z);
        ctx.fillRect(px, py, Math.floor(o.x + (x + 1) * z) - px, Math.floor(o.y + (y + 1) * z) - py);
      }
    }

    // The player's own aim arrow, fading out.
    this.aims = this.aims.filter(a => (a.life -= ui.dt || 0.016) > 0);
    for (const a of this.aims) {
      ctx.globalAlpha = Math.min(1, a.life / 0.4);
      this.drawIntent(T(a.x0 + 0.5, a.y0 + 0.5), T(a.x1 + 0.5, a.y1 + 0.5), { color: a.color, weight: 1, label: '' }, z, now, motion);
      ctx.globalAlpha = 1;
    }

    // Enemy intent: arrows from attacking empires to where they are pushing into you.
    for (const it of ui.intents || []) this.drawIntent(T(it.x0 + 0.5, it.y0 + 0.5), T(it.x1 + 0.5, it.y1 + 0.5), it, z, now, motion);

    // Structures, with two levels of detail (like FrontWars). Zoomed out,
    // every structure is a fixed-size badge: an owner-coloured shape with a
    // white glyph. Zoomed in, it is a large detailed sprite on a ground
    // shadow. Rails link each civilization's structures at both levels.
    const sc = Math.max(1, Math.round(z / 2));
    const near = z / d >= 2.6;
    const ps = Math.max(1, Math.round(z * 0.38)); // device px per detailed-sprite pixel
    // Lights blink out of step with each other.
    const frameAt = (x, y) => (motion ? Math.floor(now * 2 + ((x * 7 + y * 13) % 10) / 10) % 2 : 0);
    this.drawRails(T, z, now, motion, near);
    const drawStructure = (name, x, y, color, opts = {}) => {
      const p = T(x + 0.5, y + 0.5);
      if (!near) return this.drawBadge(p, opts.badge || 'site', color, spriteAccent(name), opts.level);
      const spr = spriteCanvasHi(name, color, frameAt(x, y));
      const w = spr.width * ps, h = spr.height * ps;
      const base = Math.round(p.y + ps * 2);
      const k = opts.rise ?? 1;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(Math.round(p.x), base, w * 0.55, Math.max(2, ps * 2.2), 0, 0, Math.PI * 2);
      ctx.fill();
      if (k >= 1) ctx.drawImage(spr, Math.round(p.x - w / 2), base - h, w, h);
      else if (k > 0) {
        // Rising out of the ground: the top of the sprite appears first.
        const rows = Math.max(1, Math.round(spr.height * k));
        ctx.drawImage(spr, 0, 0, spr.width, rows, Math.round(p.x - w / 2), base - rows * ps, w, rows * ps);
      }
      if (opts.level > 1) this.levelTag(Math.round(p.x - w / 2), base - h, opts.level);
      return { p: { x: p.x, y: base }, w, h };
    };
    for (const b of st.buildings) {
      const bo = st.owner[b.y * st.w + b.x];
      const lvl = b.level || 1;
      const t0 = this.rising.get(b.id);
      let rise = 1;
      if (t0 !== undefined) {
        rise = motion ? (ui.now - t0) / 700 : 1;
        if (rise >= 1) this.rising.delete(b.id);
      }
      drawStructure(lvl > 1 ? `${b.type}_${lvl}` : b.type, b.x, b.y, bo ? st.factions[bo].color : NEUTRAL, { badge: b.type, rise, level: lvl });
    }
    for (const s of st.sites) {
      const so = siteOwner(st, s);
      const color = so ? st.factions[so].color : NEUTRAL;
      if (this.landing && so === this.landing) continue;
      let name = s.type;
      if (s.type === 'capital') name = s.id === 'enemy-capital' ? CAPITAL_SPRITE[st.theme] : s.id === 'player-capital' ? 'fortress' : 'normal';
      const r = drawStructure(name, s.x, s.y, color, { badge: s.type === 'capital' || s.type === 'citadel' ? 'capital' : 'site' });
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
    const drawSprite = (name, x, y, color) => {
      const spr = spriteCanvas(name, color);
      const p = T(x + 0.5, y + 0.5);
      ctx.drawImage(spr, Math.round(p.x - (spr.width * sc) / 2), Math.round(p.y - (spr.height * sc) / 2), spr.width * sc, spr.height * sc);
    };

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
    if (motion) this.drawMarches(T, dt); else this.marches = [];
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

    if (ui.labels !== false) { this.drawContinents(o, z); this.drawLabels(o, z); }
  }

  // Continent names, large and faint, underneath the nation labels.
  drawContinents(o, z) {
    const ctx = this.ctx, d = this.dpr;
    const list = world(this.state).continents || [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of list) {
      const size = Math.round(Math.max(11 * d, Math.min(26 * d, Math.sqrt(c.size) * z * 0.05)));
      ctx.font = `700 ${size}px "Silkscreen", monospace`;
      const name = c.name.toUpperCase().split('').join(' ');
      const x = o.x + (c.x + 0.5) * z, y = o.y + (c.y + 0.5) * z + size * 1.6;
      ctx.lineWidth = Math.max(2, size / 6);
      ctx.strokeStyle = 'rgba(5,4,12,0.35)';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = 'rgba(255,248,230,0.32)';
      ctx.fillText(name, x, y);
    }
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
    const order = [...this.labels.keys()].filter(id => st.factions[id]?.alive && id !== this.landing)
      .sort((a, b) => (a === PLAYER ? -1 : b === PLAYER ? 1 : st.factions[b].tiles - st.factions[a].tiles));
    const placed = [];
    for (const id of order) {
      const pos = this.labels.get(id);
      const f = st.factions[id];
      const base = Math.sqrt(f.tiles) * z * 0.2;
      const size = Math.max(10 * d, Math.min(24 * d, base));
      if (id !== PLAYER && base < 6 * d) continue;
      const p = { x: o.x + (pos.x + 0.5) * z, y: o.y + (pos.y + 0.5) * z };
      const name = f.name;
      const big = id === PLAYER || f.kind === 'enemy';
      ctx.font = `${big ? 700 : 400} ${Math.round(size)}px "Alien Body", monospace`;
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
      ctx.font = `700 ${Math.round(size * 0.95)}px "Alien Body", monospace`;
      ctx.strokeText(troops, p.x, p.y + size * 0.5);
      ctx.fillStyle = id === PLAYER ? '#7fe8ff' : f.kind === 'enemy' ? mixHex(f.color, '#ffffff', 0.4) : '#ffffff';
      ctx.fillText(troops, p.x, p.y + size * 0.5);
    }
  }
}
