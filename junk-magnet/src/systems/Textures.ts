import type Phaser from 'phaser';
import { ARENA } from '../config';

/**
 * Every sprite is drawn in code with the Canvas 2D API: thick dark outlines, flat colours
 * and a soft baked drop shadow. Textures are drawn at 2× and shown at 0.5 scale so they
 * stay crisp when the canvas is scaled up.
 */
export const S = 2;
export const TS = 1 / S;

const OUT = '#120F16';
const TAU = Math.PI * 2;
// Mycelion palette under the old names (these now only feed icons, particles and FX):
// RED = the hive's magenta, CYAN = acid green, STEEL / RUST = swarmling purple / teal,
// LIME = colonist suit white (enemies in icons), LIME_DARK = suit shade.
const RED = '#E04FD8';
const CYAN = '#7CFF6B';
const STEEL = '#9B5CFF';
const RUST = '#2FD0B0';
const BRASS = '#F2C14E';
const LIME = '#ECE6DA';
const LIME_DARK = '#BDB4A6';
const PINK = '#FF3D7F';
const WHITE = '#F4F1EA';

export type C = CanvasRenderingContext2D;
import { drawWorldFloor, makeAlienTextures, makeVentTextures, miniCore } from './AlienArt';

export function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: C) => void, scale = S): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale));
  if (!t) return;
  const c = t.getContext();
  c.save();
  c.scale(scale, scale);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  c.restore();
  t.refresh();
}

export function circle(c: C, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

export function rr(c: C, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function fillOut(c: C, fill: string, lw = 3): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUT;
  c.stroke();
}

export function shadow(c: C, x: number, y: number, rx: number, ry: number): void {
  c.fillStyle = 'rgba(0,0,0,0.33)';
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}

export function eye(c: C, x: number, y: number, r: number): void {
  circle(c, x, y, r);
  fillOut(c, WHITE, 2.2);
  circle(c, x, y + r * 0.15, r * 0.5);
  c.fillStyle = OUT;
  c.fill();
  circle(c, x - r * 0.22, y - r * 0.12, r * 0.18);
  c.fillStyle = '#fff';
  c.fill();
}

export function highlight(c: C, x: number, y: number, r: number, from = 1.1, to = 1.45): void {
  c.beginPath();
  c.arc(x, y, r, Math.PI * from, Math.PI * to);
  c.strokeStyle = 'rgba(255,255,255,0.45)';
  c.lineWidth = 2.5;
  c.stroke();
}

function robotBody(c: C, cx: number, cy: number, r: number): void {
  for (const side of [-1, 1]) {
    c.beginPath();
    c.ellipse(cx + side * r * 0.55, cy + r * 0.85, r * 0.32, r * 0.22, 0, 0, TAU);
    fillOut(c, '#4A4458', 2.5);
  }
  circle(c, cx, cy, r);
  c.fillStyle = LIME;
  c.fill();
  c.save();
  circle(c, cx, cy, r);
  c.clip();
  c.beginPath();
  c.ellipse(cx, cy + r * 0.85, r * 1.15, r * 0.55, 0, 0, TAU);
  c.fillStyle = LIME_DARK;
  c.fill();
  c.restore();
  circle(c, cx, cy, r);
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.stroke();
  highlight(c, cx, cy, r * 0.72);
}

export function heartPath(c: C, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.95);
  c.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.9, y - s * 0.95, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.9, y - s * 0.95, x + s * 1.3, y + s * 0.1, x, y + s * 0.95);
  c.closePath();
}

export function boltShape(c: C, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x + s * 0.15, y - s);
  c.lineTo(x - s * 0.55, y + s * 0.1);
  c.lineTo(x - s * 0.05, y + s * 0.1);
  c.lineTo(x - s * 0.2, y + s);
  c.lineTo(x + s * 0.55, y - s * 0.15);
  c.lineTo(x + s * 0.05, y - s * 0.15);
  c.closePath();
}

export function smile(c: C, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85);
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
}


/**
 * Robots get a bright rim around their dark outline so they pop off the dark floor.
 * The texture is padded so the rim never clips; it stays centred, so origins don't change.
 */
export function makeBot(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  shadowSpec: number[],
  draw: (c: C) => void,
  rimColor = key === 'boss' ? '#FFD6E6' : '#E4FFC8',
  rim = 2,
): void {
  const pad = rim + 1;
  make(scene, key, w + pad * 2, h + pad * 2, (c) => {
    c.translate(pad, pad);
    const [sx, sy, rx, ry] = shadowSpec;
    shadow(c, sx, sy + rim, rx + rim, ry);
    const body = document.createElement('canvas');
    body.width = Math.ceil(w * S);
    body.height = Math.ceil(h * S);
    const b = body.getContext('2d')!;
    b.scale(S, S);
    b.lineJoin = 'round';
    b.lineCap = 'round';
    draw(b);
    const mask = document.createElement('canvas');
    mask.width = body.width;
    mask.height = body.height;
    const m = mask.getContext('2d')!;
    m.drawImage(body, 0, 0);
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = rimColor;
    m.fillRect(0, 0, mask.width, mask.height);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      c.drawImage(mask, Math.cos(a) * rim, Math.sin(a) * rim, w, h);
    }
    c.drawImage(body, 0, 0, w, h);
  });
}

// ---------------------------------------------------------------- magnets

/** Icons used to draw a horseshoe magnet; now a tiny hive core in the same spot. */
function drawHorseshoe(c: C, cx: number, cy: number, R: number, _r: number, _top: number): void {
  miniCore(c, cx, cy - R * 0.1, R * 0.62);
}


// ---------------------------------------------------------------- robots


// ---------------------------------------------------------------- junk


// ---------------------------------------------------------------- fx + ui

function makeFx(scene: Phaser.Scene): void {
  make(scene, 'p-dot', 10, 10, (c) => {
    circle(c, 5, 5, 4);
    c.fillStyle = '#fff';
    c.fill();
  });
  make(scene, 'p-spark', 16, 6, (c) => {
    c.beginPath();
    c.moveTo(0, 3);
    c.lineTo(8, 0);
    c.lineTo(16, 3);
    c.lineTo(8, 6);
    c.closePath();
    c.fillStyle = '#fff';
    c.fill();
  });
  make(scene, 'p-square', 8, 6, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 8, 6);
  });
  make(scene, 'p-puff', 24, 24, (c) => {
    const g = c.createRadialGradient(12, 12, 1, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    circle(c, 12, 12, 12);
    c.fillStyle = g;
    c.fill();
  });
  make(scene, 'p-ring', 140, 140, (c) => {
    circle(c, 70, 70, 64);
    c.lineWidth = 6;
    c.strokeStyle = '#fff';
    c.stroke();
  });
  make(scene, 'heart', 32, 30, (c) => {
    heartPath(c, 16, 15, 12);
    fillOut(c, RED, 3);
    circle(c, 10, 10, 2.6);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fill();
  });
  make(scene, 'heart-empty', 32, 30, (c) => {
    heartPath(c, 16, 15, 12);
    fillOut(c, '#3A3346', 3);
  });
  make(scene, 'coin', 26, 26, (c) => {
    circle(c, 13, 13, 10);
    fillOut(c, BRASS, 3);
    circle(c, 13, 13, 5.5);
    c.lineWidth = 2;
    c.strokeStyle = '#B88A2A';
    c.stroke();
    circle(c, 9.5, 9.5, 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
  });
  make(scene, 'pause-icon', 40, 40, (c) => {
    rr(c, 10, 8, 7, 24, 2.5);
    fillOut(c, WHITE, 3);
    rr(c, 23, 8, 7, 24, 2.5);
    fillOut(c, WHITE, 3);
  });
  make(scene, 'pulse-icon', 56, 56, (c) => {
    for (const r of [22, 15]) {
      circle(c, 28, 28, r);
      c.lineWidth = 6;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    circle(c, 28, 28, 7);
    fillOut(c, RED, 3);
  });
  make(scene, 'lock', 30, 34, (c) => {
    c.beginPath();
    c.arc(15, 14, 7, Math.PI, 0);
    c.lineWidth = 7;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 3.5;
    c.strokeStyle = STEEL;
    c.stroke();
    rr(c, 5, 14, 20, 16, 4);
    fillOut(c, BRASS, 3);
  });
}

// ---------------------------------------------------------------- upgrade icons

function iconRing(c: C, color: string): void {
  circle(c, 32, 32, 29);
  c.fillStyle = color;
  c.fill();
}

function arrowArc(c: C, cx: number, cy: number, r: number, from: number, to: number, dir: 1 | -1): void {
  c.beginPath();
  c.arc(cx, cy, r, from, to, dir < 0);
  c.lineWidth = 8;
  c.strokeStyle = OUT;
  c.stroke();
  c.lineWidth = 4;
  c.strokeStyle = CYAN;
  c.stroke();
  const ex = cx + Math.cos(to) * r;
  const ey = cy + Math.sin(to) * r;
  const tangent = to + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  c.beginPath();
  c.moveTo(ex + Math.cos(tangent) * 7, ey + Math.sin(tangent) * 7);
  c.lineTo(ex + Math.cos(tangent + 2.4) * 7, ey + Math.sin(tangent + 2.4) * 7);
  c.lineTo(ex + Math.cos(tangent - 2.4) * 7, ey + Math.sin(tangent - 2.4) * 7);
  c.closePath();
  fillOut(c, CYAN, 2.5);
}

const ICONS: Record<string, (c: C) => void> = {
  strongerField(c) {
    for (const r of [26, 19]) {
      c.beginPath();
      c.arc(32, 36, r, Math.PI * 1.15, Math.PI * 1.85);
      c.lineWidth = 7;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3.5;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    drawHorseshoe(c, 32, 38, 13, 5, 28);
  },
  spinCycle(c) {
    arrowArc(c, 32, 32, 18, Math.PI * 0.1, Math.PI * 1.6, 1);
    for (const a of [0.5, 1.2, 1.9]) {
      circle(c, 32 + Math.cos(a * Math.PI) * 18, 32 + Math.sin(a * Math.PI) * 18, 4.5);
      fillOut(c, STEEL, 2.4);
    }
  },
  heavyMetal(c) {
    c.beginPath();
    c.arc(32, 20, 9, Math.PI, 0);
    c.lineWidth = 9;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 5;
    c.strokeStyle = '#5C6570';
    c.stroke();
    rr(c, 14, 20, 36, 30, 10);
    fillOut(c, '#5C6570', 3);
    c.font = '900 13px sans-serif';
    c.fillStyle = WHITE;
    c.textAlign = 'center';
    c.fillText('KG', 32, 40);
  },
  quickCharge(c) {
    boltShape(c, 32, 32, 20);
    fillOut(c, CYAN, 3);
  },
  hotScrap(c) {
    c.beginPath();
    c.moveTo(32, 8);
    c.bezierCurveTo(46, 22, 50, 32, 46, 42);
    c.bezierCurveTo(42, 54, 22, 54, 18, 42);
    c.bezierCurveTo(15, 32, 22, 26, 24, 20);
    c.bezierCurveTo(28, 28, 30, 26, 32, 8);
    fillOut(c, RUST, 3);
    c.beginPath();
    c.moveTo(32, 26);
    c.bezierCurveTo(40, 34, 40, 44, 32, 48);
    c.bezierCurveTo(24, 44, 25, 36, 32, 26);
    c.fillStyle = BRASS;
    c.fill();
  },
  explosiveCans(c) {
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = i % 2 === 0 ? 26 : 15;
      c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    c.closePath();
    fillOut(c, BRASS, 3);
    rr(c, 24, 21, 16, 22, 4);
    fillOut(c, RUST, 3);
    c.fillStyle = STEEL;
    c.fillRect(25.5, 23, 13, 4);
  },
  spareHeart(c) {
    heartPath(c, 32, 32, 20);
    fillOut(c, RED, 3.5);
    c.fillStyle = WHITE;
    c.fillRect(29, 22, 6, 18);
    c.fillRect(23, 28, 18, 6);
  },
  polarityFlip(c) {
    drawHorseshoe(c, 32, 34, 11, 4, 26);
    for (const a of [0, 0.5, 1, 1.5]) {
      const ang = a * Math.PI + Math.PI / 4;
      const x = 32 + Math.cos(ang) * 22;
      const y = 32 + Math.sin(ang) * 22;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - Math.cos(ang) * 8 + Math.cos(ang + 1.6) * 5, y - Math.sin(ang) * 8 + Math.sin(ang + 1.6) * 5);
      c.lineTo(x - Math.cos(ang) * 8 + Math.cos(ang - 1.6) * 5, y - Math.sin(ang) * 8 + Math.sin(ang - 1.6) * 5);
      c.closePath();
      fillOut(c, CYAN, 2.5);
    }
  },
  secondRing(c) {
    arrowArc(c, 32, 32, 24, Math.PI * 1.1, Math.PI * 1.9, 1);
    arrowArc(c, 32, 32, 13, Math.PI * 0.9, Math.PI * 0.1, -1);
    circle(c, 32, 32, 5);
    fillOut(c, RED, 2.5);
  },
  scrapShield(c) {
    c.beginPath();
    c.moveTo(32, 8);
    c.lineTo(50, 15);
    c.bezierCurveTo(50, 36, 44, 48, 32, 56);
    c.bezierCurveTo(20, 48, 14, 36, 14, 15);
    c.closePath();
    fillOut(c, STEEL, 3.5);
    c.beginPath();
    c.moveTo(32, 15);
    c.lineTo(43, 19);
    c.bezierCurveTo(43, 34, 39, 42, 32, 48);
    c.bezierCurveTo(25, 42, 21, 34, 21, 19);
    c.closePath();
    c.fillStyle = CYAN;
    c.fill();
  },
  moltenCore(c) {
    const g = c.createRadialGradient(32, 32, 3, 32, 32, 24);
    g.addColorStop(0, '#FFF3B0');
    g.addColorStop(0.5, BRASS);
    g.addColorStop(1, RUST);
    circle(c, 32, 32, 22);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = OUT;
    c.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25);
      c.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30);
      c.lineWidth = 3;
      c.strokeStyle = BRASS;
      c.stroke();
    }
  },
  buzzsaw(c) {
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.lineTo(32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27);
      c.lineTo(32 + Math.cos(a + 0.26) * 19, 32 + Math.sin(a + 0.26) * 19);
    }
    c.closePath();
    fillOut(c, STEEL, 3);
    circle(c, 32, 32, 7);
    fillOut(c, CYAN, 3);
  },
  bigPulse(c) {
    for (const r of [26, 18, 10]) {
      circle(c, 32, 32, r);
      c.lineWidth = 6;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    circle(c, 32, 32, 4);
    fillOut(c, RED, 2);
  },
  shockwave(c) {
    c.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      const r = i % 2 === 0 ? 27 : 17;
      c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    c.closePath();
    fillOut(c, CYAN, 3);
    circle(c, 32, 32, 9);
    fillOut(c, WHITE, 3);
  },
  quickFeet(c) {
    for (const [y, l] of [
      [22, 18],
      [32, 26],
      [42, 18],
    ]) {
      c.beginPath();
      c.moveTo(12, y);
      c.lineTo(12 + l, y);
      c.lineWidth = 7;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3.5;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    drawHorseshoe(c, 42, 30, 12, 4, 22);
  },
  junkHoarder(c) {
    for (const [x, y, t] of [
      [22, 40, STEEL],
      [42, 40, RUST],
      [32, 24, BRASS],
    ] as const) {
      rr(c, x - 10, y - 10, 20, 20, 4);
      fillOut(c, t, 3);
    }
    c.fillStyle = WHITE;
    c.fillRect(48, 10, 4, 14);
    c.fillRect(43, 15, 14, 4);
  },
  sharpEdges(c) {
    c.beginPath();
    c.moveTo(32, 6);
    c.lineTo(40, 26);
    c.lineTo(58, 32);
    c.lineTo(40, 38);
    c.lineTo(32, 58);
    c.lineTo(24, 38);
    c.lineTo(6, 32);
    c.lineTo(24, 26);
    c.closePath();
    fillOut(c, BRASS, 3);
  },
  scrapCollector(c) {
    ICONS.scrapPile(c);
    c.fillStyle = WHITE;
    c.font = '900 16px sans-serif';
    c.textAlign = 'center';
    c.fillText('+', 52, 18);
  },
  staticCharge(c) {
    robotBody(c, 32, 36, 16);
    boltShape(c, 22, 18, 10);
    fillOut(c, CYAN, 2.5);
    boltShape(c, 44, 16, 9);
    fillOut(c, CYAN, 2.5);
  },
  reinforced(c) {
    rr(c, 12, 14, 40, 36, 6);
    fillOut(c, STEEL, 3.5);
    for (const [x, y] of [
      [18, 20],
      [46, 20],
      [18, 44],
      [46, 44],
    ]) {
      circle(c, x, y, 2.6);
      c.fillStyle = OUT;
      c.fill();
    }
    c.beginPath();
    c.moveTo(32, 18);
    c.lineTo(32, 46);
    c.moveTo(18, 32);
    c.lineTo(46, 32);
    c.lineWidth = 3;
    c.strokeStyle = '#6E7681';
    c.stroke();
  },
  luckyFind(c) {
    rr(c, 12, 18, 40, 30, 6);
    fillOut(c, BRASS, 3);
    rr(c, 17, 23, 24, 20, 4);
    fillOut(c, '#1D4B52', 2.5);
    c.beginPath();
    c.moveTo(22, 18);
    c.lineTo(16, 8);
    c.moveTo(38, 18);
    c.lineTo(44, 8);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 47, 28, 2.5);
    c.fillStyle = OUT;
    c.fill();
  },
  fireRing(c) {
    circle(c, 32, 32, 21);
    c.lineWidth = 11;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 7;
    c.strokeStyle = RUST;
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = BRASS;
    c.stroke();
    ICONS.hotScrap(c);
  },
  megaMagnet(c) {
    for (const r of [28, 22]) {
      c.beginPath();
      c.arc(32, 38, r, Math.PI * 1.1, Math.PI * 1.9);
      c.lineWidth = 6;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = BRASS;
      c.stroke();
    }
    drawHorseshoe(c, 32, 40, 16, 6, 26);
  },
  fireball(c) {
    const g = c.createRadialGradient(30, 34, 3, 32, 32, 22);
    g.addColorStop(0, '#FFF3B0');
    g.addColorStop(0.45, BRASS);
    g.addColorStop(1, RUST);
    c.beginPath();
    c.moveTo(10, 50);
    c.quadraticCurveTo(20, 30, 34, 14);
    c.quadraticCurveTo(54, 26, 50, 42);
    c.quadraticCurveTo(40, 56, 10, 50);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 38, 34, 9);
    fillOut(c, STEEL, 2.5);
  },
  hotterFireballs(c) {
    ICONS.fireball(c);
    c.fillStyle = WHITE;
    c.font = '900 18px sans-serif';
    c.textAlign = 'center';
    c.fillText('+', 52, 18);
  },
  chainLightning(c) {
    c.beginPath();
    c.moveTo(8, 14);
    c.lineTo(28, 26);
    c.lineTo(20, 36);
    c.lineTo(42, 46);
    c.lineTo(36, 54);
    c.lineTo(58, 58);
    c.lineWidth = 9;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 4.5;
    c.strokeStyle = CYAN;
    c.stroke();
    for (const [x, y] of [
      [8, 14],
      [42, 46],
      [58, 58],
    ]) {
      circle(c, x, y, 5);
      fillOut(c, LIME, 2);
    }
  },
  junkShotgun(c) {
    for (let i = 0; i < 5; i++) {
      const a = -0.7 + i * 0.35;
      c.beginPath();
      c.moveTo(14, 46);
      c.lineTo(14 + Math.cos(a) * 40, 46 + Math.sin(a) * 40);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(244,241,234,0.5)';
      c.stroke();
      circle(c, 14 + Math.cos(a) * 42, 46 + Math.sin(a) * 42, 5);
      fillOut(c, i % 2 ? RUST : STEEL, 2);
    }
    drawHorseshoe(c, 16, 46, 10, 4, 38);
  },
  magnetMine(c) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14);
      c.lineTo(32 + Math.cos(a) * 25, 32 + Math.sin(a) * 25);
      c.lineWidth = 6;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    circle(c, 32, 32, 14);
    fillOut(c, '#3A3346', 3);
    drawHorseshoe(c, 32, 33, 8, 3, 26);
  },
  meteorDrop(c) {
    for (const [x, y, w] of [
      [44, 8, 4],
      [52, 14, 3],
      [38, 4, 3],
    ]) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 18, y + 18);
      c.lineWidth = w;
      c.strokeStyle = BRASS;
      c.stroke();
    }
    // A titan swarmling dropping from the sky.
    for (const [x1, y1, x2, y2] of [
      [16, 46, 10, 56],
      [36, 46, 42, 56],
    ]) {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.lineWidth = 3;
      c.strokeStyle = OUT;
      c.stroke();
    }
    rr(c, 12, 24, 28, 28, 8);
    fillOut(c, '#5B2E8C', 3.5);
    c.fillStyle = 'rgba(224,79,216,0.75)';
    for (const [x, y] of [
      [16, 28],
      [27, 28],
      [16, 39],
      [27, 39],
    ]) {
      rr(c, x, y, 9, 9, 2.5);
      c.fill();
    }
    circle(c, 26, 38, 4);
    c.fillStyle = CYAN;
    c.fill();
  },
  inferno(c) {
    for (const [x, y, r] of [
      [16, 48, 9],
      [32, 50, 10],
      [48, 46, 8],
    ]) {
      c.beginPath();
      c.ellipse(x, y, r, r * 0.55, 0, 0, TAU);
      fillOut(c, RUST, 2.5);
    }
    ICONS.fireball(c);
  },
  blackHolePulse(c) {
    circle(c, 32, 32, 25);
    const g = c.createRadialGradient(32, 32, 3, 32, 32, 25);
    g.addColorStop(0, '#05030A');
    g.addColorStop(1, '#4B2A73');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(32, 32, 9 + i * 6, i * 2, i * 2 + 2.6);
      c.lineWidth = 3;
      c.strokeStyle = CYAN;
      c.stroke();
    }
  },
  scrapPile(c) {
    for (const [x, y] of [
      [22, 40],
      [42, 40],
      [32, 26],
    ]) {
      circle(c, x, y, 11);
      fillOut(c, BRASS, 3);
      circle(c, x, y, 5.5);
      c.lineWidth = 2;
      c.strokeStyle = '#B88A2A';
      c.stroke();
    }
  },
  patchUp(c) {
    heartPath(c, 32, 32, 20);
    fillOut(c, RED, 3.5);
    rr(c, 20, 26, 24, 9, 3);
    fillOut(c, STEEL, 2.5);
  },
};

// Mycelion versions of the icons that still showed junk.
function drop(c: C, x: number, y: number, r: number, color = CYAN): void {
  c.beginPath();
  c.moveTo(x, y - r * 1.3);
  c.bezierCurveTo(x + r * 1.1, y - r * 0.2, x + r, y + r, x, y + r);
  c.bezierCurveTo(x - r, y + r, x - r * 1.1, y - r * 0.2, x, y - r * 1.3);
  fillOut(c, color, 3);
  circle(c, x - r * 0.3, y - r * 0.1, r * 0.22);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fill();
}
function bug(c: C, x: number, y: number, rx: number, ry: number, color: string): void {
  c.lineWidth = 2;
  c.strokeStyle = OUT;
  for (const k of [-0.5, 0, 0.5]) {
    c.beginPath();
    c.moveTo(x - rx - 4, y + k * ry);
    c.lineTo(x + rx + 4, y + k * ry);
    c.stroke();
  }
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  fillOut(c, color, 3);
  for (const s of [-1, 1]) {
    circle(c, x + s * rx * 0.3, y - ry * 0.6, 1.8);
    c.fillStyle = OUT;
    c.fill();
  }
}
Object.assign(ICONS, {
  luckyFind(c: C) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(32 + s * 14, 24, 13, 7, s * 0.5, 0, TAU);
      c.fillStyle = 'rgba(224,240,255,0.7)';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = OUT;
      c.stroke();
    }
    c.beginPath();
    c.ellipse(32, 36, 12, 16, 0, 0, TAU);
    fillOut(c, BRASS, 3.5);
    c.beginPath();
    c.moveTo(24, 18);
    c.lineTo(27, 10);
    c.lineTo(32, 16);
    c.lineTo(37, 10);
    c.lineTo(40, 18);
    c.closePath();
    fillOut(c, BRASS, 2.5);
  },
  scrapCollector(c: C) {
    drop(c, 24, 38, 10);
    drop(c, 40, 34, 12);
    c.fillStyle = WHITE;
    c.fillRect(46, 10, 4, 14);
    c.fillRect(41, 15, 14, 4);
  },
  scrapPile(c: C) {
    drop(c, 20, 42, 9);
    drop(c, 44, 42, 9);
    drop(c, 32, 30, 12);
  },
  explosiveCans(c: C) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(32 + Math.cos(a) * 12, 34 + Math.sin(a) * 12);
      c.lineTo(32 + Math.cos(a + 0.2) * 26, 34 + Math.sin(a + 0.2) * 26);
      c.lineTo(32 + Math.cos(a + 0.4) * 12, 34 + Math.sin(a + 0.4) * 12);
      c.fillStyle = BRASS;
      c.fill();
    }
    bug(c, 32, 34, 10, 13, STEEL);
  },
  junkHoarder(c: C) {
    bug(c, 22, 42, 8, 6, '#F07CC8');
    bug(c, 42, 44, 8, 6, RUST);
    bug(c, 30, 26, 9, 7, STEEL);
    c.fillStyle = WHITE;
    c.fillRect(48, 10, 4, 14);
    c.fillRect(43, 15, 14, 4);
  },
});

const EPIC_ICONS = ['moltenCore', 'buzzsaw', 'fireRing', 'megaMagnet', 'inferno', 'blackHolePulse'];

function makeIcons(scene: Phaser.Scene): void {
  const bg: Record<string, string> = { common: '#3A3346', rare: '#1B3E46', epic: '#4A3A17' };
  for (const [id, draw] of Object.entries(ICONS)) {
    make(scene, `icon-${id}`, 64, 64, (c) => {
      iconRing(c, bg[EPIC_ICONS.includes(id) ? 'epic' : 'common']);
      draw(c);
    });
  }
}

// ---------------------------------------------------------------- floors

export interface MapLook {
  floor: string;
  detail: string;
  props: string;
}

export function makeFloor(scene: Phaser.Scene, key: string, look: MapLook): void {
  make(scene, key, ARENA.width, ARENA.height, (c) => drawWorldFloor(c, look), 1);
}

export interface ThumbExtras {
  conveyors?: { x: number; y: number; w: number; h: number }[];
  hazards?: { type: string; x?: number; y?: number; w?: number; h?: number; x1?: number; y1?: number; x2?: number; y2?: number }[];
}

/** A small "screenshot" of a map for the Garage: the real floor, props and hazards, scaled down. */
export function makeMapThumb(scene: Phaser.Scene, key: string, look: MapLook, extras: ThumbExtras, w = 150, h = 96): void {
  make(scene, key, w, h, (c) => {
    c.save();
    c.scale(w / ARENA.width, h / ARENA.height);
    drawWorldFloor(c, look);
    c.fillStyle = '#3A1A12';
    for (const b of extras.conveyors ?? []) c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = 'rgba(242,193,78,0.9)';
    for (const b of extras.conveyors ?? []) c.fillRect(b.x, b.y + b.h * 0.4, b.w, b.h * 0.2);
    for (const hz of extras.hazards ?? []) {
      if (hz.type === 'crusher') {
        c.beginPath();
        c.ellipse((hz.x ?? 0) + (hz.w ?? 160) / 2, (hz.y ?? 0) + (hz.h ?? 160) / 2, (hz.w ?? 160) / 2, (hz.h ?? 160) / 2, 0, 0, TAU);
        c.fillStyle = '#4A2F3A';
        c.fill();
        c.beginPath();
        c.ellipse((hz.x ?? 0) + (hz.w ?? 160) / 2, (hz.y ?? 0) + (hz.h ?? 160) / 2, (hz.w ?? 160) * 0.32, (hz.h ?? 160) * 0.32, 0, 0, TAU);
        c.fillStyle = '#FF6B2B';
        c.fill();
      } else {
        c.beginPath();
        c.moveTo(hz.x1 ?? 0, hz.y1 ?? 0);
        c.lineTo(hz.x2 ?? 0, hz.y2 ?? 0);
        c.lineWidth = 30;
        c.strokeStyle = '#3BA84A';
        c.stroke();
      }
    }
    c.restore();
    // A magnet with its junk ball and a few robots, so it reads as gameplay.
    const cx = w * 0.5;
    const cy = h * 0.52;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      circle(c, cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 2.2);
      c.fillStyle = i % 3 ? '#7CFF6B' : '#9B5CFF';
      c.fill();
    }
    circle(c, cx, cy, 5);
    fillOut(c, '#E04FD8', 1.5);
    for (const [x, y] of [
      [0.22, 0.3],
      [0.78, 0.36],
      [0.7, 0.75],
    ]) {
      circle(c, w * x, h * y, 4);
      fillOut(c, '#ECE6DA', 1.5);
    }
    rr(c, 1, 1, w - 2, h - 2, 8);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
  });
}


function makeNewRobots(scene: Phaser.Scene): void {
  const sack = (c: C, x: number, y: number, r: number, full: boolean) => {
    circle(c, x, y, r);
    fillOut(c, '#8A6A3A', 2.5);
    c.beginPath();
    c.moveTo(x - r * 0.4, y - r * 0.9);
    c.lineTo(x + r * 0.4, y - r * 0.9);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
    if (full) {
      circle(c, x - r * 0.3, y - r * 0.2, r * 0.32);
      fillOut(c, STEEL, 1.6);
      circle(c, x + r * 0.35, y + r * 0.1, r * 0.3);
      fillOut(c, RUST, 1.6);
    }
  };
  for (const full of [false, true]) {
    makeBot(scene, full ? 'bot-thief-full' : 'bot-thief', 44, 44, [20, 37, 13, 4.5], (c) => {
      sack(c, 32, 14, full ? 10 : 7, full);
      robotBody(c, 20, 23, 13);
      rr(c, 9, 17, 22, 8, 4);
      c.fillStyle = OUT;
      c.fill();
      circle(c, 20, 21, 3.4);
      c.fillStyle = WHITE;
      c.fill();
      circle(c, 20.6, 21.4, 1.6);
      c.fillStyle = OUT;
      c.fill();
    });
  }
  makeBot(scene, 'bot-splitter', 48, 48, [24, 41, 16, 5], (c) => {
    robotBody(c, 24, 24, 18);
    c.beginPath();
    c.moveTo(24, 24);
    c.lineTo(24, 7);
    c.moveTo(24, 24);
    c.lineTo(9, 33);
    c.moveTo(24, 24);
    c.lineTo(39, 33);
    c.lineWidth = 2.5;
    c.strokeStyle = '#4E8A2E';
    c.stroke();
    eye(c, 24, 22, 6.5);
  });
  makeBot(scene, 'bot-splitling', 28, 28, [14, 23, 9, 3], (c) => {
    robotBody(c, 14, 14, 9.5);
    eye(c, 14, 13, 4);
  });
  make(scene, 'mound', 48, 40, (c) => {
    shadow(c, 24, 26, 20, 7);
    c.beginPath();
    c.ellipse(24, 22, 19, 12, 0, 0, TAU);
    fillOut(c, '#6B5A48', 3);
    for (const [x, y, r] of [
      [16, 18, 4],
      [30, 16, 5],
      [24, 26, 3.5],
    ]) {
      circle(c, x, y, r);
      c.fillStyle = '#8A7560';
      c.fill();
    }
    c.beginPath();
    c.moveTo(10, 24);
    c.lineTo(4, 30);
    c.moveTo(38, 24);
    c.lineTo(45, 29);
    c.lineWidth = 2;
    c.strokeStyle = OUT;
    c.stroke();
  });
  makeBot(scene, 'bot-burrower', 46, 48, [23, 41, 15, 5], (c) => {
    c.beginPath();
    c.moveTo(15, 14);
    c.lineTo(23, 1.5);
    c.lineTo(31, 14);
    c.closePath();
    fillOut(c, STEEL, 2.5);
    c.beginPath();
    c.moveTo(18, 10);
    c.lineTo(28, 7);
    c.moveTo(20, 5.5);
    c.lineTo(26, 3.8);
    c.lineWidth = 1.6;
    c.strokeStyle = '#5C6570';
    c.stroke();
    robotBody(c, 23, 26, 15);
    eye(c, 23, 25, 6);
  });
  makeBot(scene, 'bot-magnetbot', 50, 50, [25, 43, 16, 5], (c) => {
    c.beginPath();
    c.moveTo(14, 3);
    c.lineTo(14, 11);
    c.arc(25, 11, 11, Math.PI, 0, true);
    c.lineTo(36, 3);
    c.lineWidth = 8;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 4.5;
    c.strokeStyle = PINK;
    c.stroke();
    robotBody(c, 25, 28, 16);
    eye(c, 25, 27, 6.5);
  });
  makeBot(scene, 'bot-bomber', 46, 48, [23, 41, 15, 5], (c) => {
    c.beginPath();
    c.moveTo(23, 12);
    c.quadraticCurveTo(26, 4, 33, 4);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 34, 4, 2.6);
    fillOut(c, BRASS, 1.6);
    robotBody(c, 23, 26, 15);
    eye(c, 23, 24, 6);
    c.beginPath();
    c.moveTo(16, 17);
    c.lineTo(21, 19);
    c.moveTo(30, 17);
    c.lineTo(25, 19);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 19, 32, 8, 5, 2);
    fillOut(c, PINK, 1.6);
  });
  makeBot(scene, 'bot-repair', 44, 42, [22, 37, 12, 4], (c) => {
    c.beginPath();
    c.ellipse(22, 6, 15, 3.5, 0, 0, TAU);
    fillOut(c, STEEL, 2.4);
    c.beginPath();
    c.moveTo(22, 9);
    c.lineTo(22, 12);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    robotBody(c, 22, 23, 12);
    eye(c, 22, 21, 4.8);
    c.fillStyle = WHITE;
    c.fillRect(20.2, 27, 3.6, 8);
    c.fillRect(18, 29.2, 8, 3.6);
  });
  makeBot(scene, 'crusher', 104, 104, [52, 92, 42, 9], (c) => {
    rr(c, 14, 14, 76, 72, 14);
    c.fillStyle = LIME;
    c.fill();
    c.save();
    rr(c, 14, 14, 76, 72, 14);
    c.clip();
    c.fillStyle = LIME_DARK;
    c.fillRect(14, 64, 76, 30);
    c.restore();
    rr(c, 14, 14, 76, 72, 14);
    c.lineWidth = 4;
    c.strokeStyle = OUT;
    c.stroke();
    for (const x of [4, 84]) {
      rr(c, x, 26, 16, 50, 5);
      fillOut(c, STEEL, 3.5);
    }
    rr(c, 26, 6, 52, 14, 5);
    fillOut(c, STEEL, 3.5);
    eye(c, 52, 44, 14);
    c.beginPath();
    c.moveTo(34, 26);
    c.lineTo(48, 32);
    c.moveTo(70, 26);
    c.lineTo(56, 32);
    c.lineWidth = 5;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 36, 64, 32, 10, 3);
    fillOut(c, OUT, 2);
  });
  makeBot(scene, 'tyre', 44, 44, [22, 38, 17, 4], (c) => {
    circle(c, 22, 22, 18);
    fillOut(c, '#2B2730', 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(22 + Math.cos(a) * 13, 22 + Math.sin(a) * 13);
      c.lineTo(22 + Math.cos(a) * 17, 22 + Math.sin(a) * 17);
      c.lineWidth = 2.5;
      c.strokeStyle = '#4A4458';
      c.stroke();
    }
    circle(c, 22, 22, 9);
    fillOut(c, LIME, 2.5);
    eye(c, 22, 22, 5);
  });
  makeBot(scene, 'bot-press', 48, 50, [24, 43, 16, 5], (c) => {
    for (const x of [16, 32]) {
      c.fillStyle = STEEL;
      c.fillRect(x - 1.5, 8, 3, 10);
    }
    rr(c, 8, 2, 32, 9, 3);
    fillOut(c, STEEL, 2.6);
    robotBody(c, 24, 28, 16);
    eye(c, 24, 27, 6.5);
  });
  makeBot(scene, 'mine', 44, 44, [22, 37, 13, 4], (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(22 + Math.cos(a - 0.25) * 11, 22 + Math.sin(a - 0.25) * 11);
      c.lineTo(22 + Math.cos(a) * 19, 22 + Math.sin(a) * 19);
      c.lineTo(22 + Math.cos(a + 0.25) * 11, 22 + Math.sin(a + 0.25) * 11);
      c.closePath();
      fillOut(c, STEEL, 2.2);
    }
    circle(c, 22, 22, 12);
    fillOut(c, LIME, 3);
    circle(c, 22, 22, 4.5);
    fillOut(c, PINK, 2);
  });
  make(scene, 'fireball', 26, 26, (c) => {
    const g = c.createRadialGradient(13, 13, 2, 13, 13, 13);
    g.addColorStop(0, '#FFF6C8');
    g.addColorStop(0.4, BRASS);
    g.addColorStop(0.75, 'rgba(217,119,43,0.9)');
    g.addColorStop(1, 'rgba(217,119,43,0)');
    circle(c, 13, 13, 13);
    c.fillStyle = g;
    c.fill();
    circle(c, 13, 13, 6);
    fillOut(c, STEEL, 2);
    circle(c, 11.5, 11.5, 2);
    c.fillStyle = '#fff';
    c.fill();
  });
  make(scene, 'magnet-mine', 40, 40, (c) => {
    shadow(c, 20, 32, 13, 4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      c.beginPath();
      c.moveTo(20 + Math.cos(a) * 10, 20 + Math.sin(a) * 10);
      c.lineTo(20 + Math.cos(a) * 18, 20 + Math.sin(a) * 18);
      c.lineWidth = 5;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 2.5;
      c.strokeStyle = CYAN;
      c.stroke();
    }
    circle(c, 20, 20, 11);
    fillOut(c, RED, 3);
    circle(c, 20, 20, 4);
    c.fillStyle = CYAN;
    c.fill();
  });
  make(scene, 'lava', 52, 40, (c) => {
    const g = c.createRadialGradient(26, 20, 3, 26, 20, 24);
    g.addColorStop(0, 'rgba(255,233,140,0.95)');
    g.addColorStop(0.5, 'rgba(217,119,43,0.85)');
    g.addColorStop(1, 'rgba(160,50,20,0)');
    c.beginPath();
    c.ellipse(26, 20, 25, 18, 0, 0, TAU);
    c.fillStyle = g;
    c.fill();
  });
  make(scene, 'health-pack', 44, 44, (c) => {
    shadow(c, 22, 36, 15, 4);
    const g = c.createRadialGradient(22, 21, 6, 22, 21, 22);
    g.addColorStop(0, 'rgba(155,229,100,0.55)');
    g.addColorStop(1, 'rgba(155,229,100,0)');
    circle(c, 22, 21, 22);
    c.fillStyle = g;
    c.fill();
    rr(c, 8, 8, 28, 26, 6);
    fillOut(c, WHITE, 3);
    c.fillStyle = RED;
    c.fillRect(19, 12, 6, 18);
    c.fillRect(13, 18, 18, 6);
  });
  makeBot(scene, 'bot-driller', 46, 52, [23, 45, 15, 5], (c) => {
    // Faces up; the game rotates it toward you.
    c.beginPath();
    c.moveTo(13, 20);
    c.lineTo(23, 1);
    c.lineTo(33, 20);
    c.closePath();
    fillOut(c, STEEL, 2.6);
    for (const y of [8, 13, 18]) {
      c.beginPath();
      c.moveTo(23 - (20 - y) * 0.45, y);
      c.lineTo(23 + (20 - y) * 0.45, y - 3);
      c.lineWidth = 1.8;
      c.strokeStyle = '#5C6570';
      c.stroke();
    }
    robotBody(c, 23, 31, 15);
    eye(c, 23, 31, 6);
    c.beginPath();
    c.moveTo(14, 25);
    c.lineTo(20, 27);
    c.moveTo(32, 25);
    c.lineTo(26, 27);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
  });
  makeBot(scene, 'magnetron', 120, 120, [60, 106, 46, 10], (c) => {
    circle(c, 60, 62, 42);
    c.fillStyle = LIME;
    c.fill();
    c.save();
    circle(c, 60, 62, 42);
    c.clip();
    c.fillStyle = LIME_DARK;
    c.fillRect(10, 78, 100, 40);
    c.restore();
    circle(c, 60, 62, 42);
    c.lineWidth = 4;
    c.strokeStyle = OUT;
    c.stroke();
    // A giant pink horseshoe crown.
    c.beginPath();
    c.moveTo(28, 6);
    c.lineTo(28, 26);
    c.arc(60, 26, 32, Math.PI, 0, true);
    c.lineTo(92, 6);
    c.lineWidth = 14;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 9;
    c.strokeStyle = PINK;
    c.stroke();
    for (const x of [28, 92]) {
      rr(c, x - 7, 2, 14, 8, 2);
      fillOut(c, '#DCE2E8', 2.5);
    }
    eye(c, 60, 60, 16);
    rr(c, 42, 82, 36, 10, 3);
    fillOut(c, OUT, 2);
  });
  make(scene, 'chest', 60, 52, (c) => {
    shadow(c, 30, 46, 24, 5);
    rr(c, 6, 18, 48, 28, 5);
    fillOut(c, '#8A5A2B', 3);
    c.beginPath();
    c.moveTo(6, 22);
    c.quadraticCurveTo(30, 0, 54, 22);
    c.closePath();
    fillOut(c, '#A86E35', 3);
    c.fillStyle = BRASS;
    for (const x of [12, 44]) c.fillRect(x, 10, 5, 36);
    rr(c, 24, 20, 12, 14, 3);
    fillOut(c, BRASS, 2.5);
    circle(c, 30, 27, 2);
    c.fillStyle = OUT;
    c.fill();
  });
  makeBot(
    scene,
    'bot-golden',
    40,
    40,
    [20, 34, 13, 4],
    (c) => {
      circle(c, 20, 20, 13);
      const g = c.createRadialGradient(16, 15, 2, 20, 20, 14);
      g.addColorStop(0, '#FFF3B0');
      g.addColorStop(1, BRASS);
      c.fillStyle = g;
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = OUT;
      c.stroke();
      eye(c, 20, 18, 5.5);
      c.beginPath();
      c.moveTo(14, 27);
      c.quadraticCurveTo(20, 31, 26, 27);
      c.lineWidth = 2;
      c.strokeStyle = OUT;
      c.stroke();
    },
    '#FFF3B0',
  );
  make(scene, 'elite-glow', 80, 80, (c) => {
    const g = c.createRadialGradient(40, 40, 14, 40, 40, 40);
    g.addColorStop(0, 'rgba(242,193,78,0.7)');
    g.addColorStop(0.6, 'rgba(242,193,78,0.35)');
    g.addColorStop(1, 'rgba(242,193,78,0)');
    circle(c, 40, 40, 40);
    c.fillStyle = g;
    c.fill();
  });
}

export function makeAllTextures(scene: Phaser.Scene): void {
  // Mycelion art first; make() skips keys that already exist, so the old drawings only fill gaps.
  makeAlienTextures(scene);
  makeNewRobots(scene);
  makeFx(scene);
  makeIcons(scene);
}

/** Lava vent hazard (the old car crusher slot). */
export function makeCrusherTextures(scene: Phaser.Scene, w: number, h: number): { base: string; plate: string } {
  return makeVentTextures(scene, w, h);
}
