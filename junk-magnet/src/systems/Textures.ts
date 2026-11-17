import type Phaser from 'phaser';
import { ARENA } from '../config';
import { Rng } from '../rng';

/**
 * Every sprite is drawn in code with the Canvas 2D API: thick dark outlines, flat colours
 * and a soft baked drop shadow. Textures are drawn at 2× and shown at 0.5 scale so they
 * stay crisp when the canvas is scaled up.
 */
export const S = 2;
export const TS = 1 / S;

const OUT = '#120F16';
const TAU = Math.PI * 2;
const RED = '#E8423F';
const CYAN = '#3EE6F2';
const STEEL = '#A7B0BA';
const RUST = '#D9772B';
const BRASS = '#F2C14E';
const LIME = '#9BE564';
const LIME_DARK = '#6DB33F';
const PINK = '#FF3D7F';
const WHITE = '#F4F1EA';

type C = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: C) => void, scale = S): void {
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

function circle(c: C, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
}

function rr(c: C, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillOut(c: C, fill: string, lw = 3): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = OUT;
  c.stroke();
}

function shadow(c: C, x: number, y: number, rx: number, ry: number): void {
  c.fillStyle = 'rgba(0,0,0,0.33)';
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fill();
}

function eye(c: C, x: number, y: number, r: number): void {
  circle(c, x, y, r);
  fillOut(c, WHITE, 2.2);
  circle(c, x, y + r * 0.15, r * 0.5);
  c.fillStyle = OUT;
  c.fill();
  circle(c, x - r * 0.22, y - r * 0.12, r * 0.18);
  c.fillStyle = '#fff';
  c.fill();
}

function highlight(c: C, x: number, y: number, r: number, from = 1.1, to = 1.45): void {
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

function heartPath(c: C, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.95);
  c.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.9, y - s * 0.95, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.9, y - s * 0.95, x + s * 1.3, y + s * 0.1, x, y + s * 0.95);
  c.closePath();
}

function boltShape(c: C, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x + s * 0.15, y - s);
  c.lineTo(x - s * 0.55, y + s * 0.1);
  c.lineTo(x - s * 0.05, y + s * 0.1);
  c.lineTo(x - s * 0.2, y + s);
  c.lineTo(x + s * 0.55, y - s * 0.15);
  c.lineTo(x + s * 0.05, y - s * 0.15);
  c.closePath();
}

function smile(c: C, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, Math.PI * 0.15, Math.PI * 0.85);
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
}

// ---------------------------------------------------------------- magnets

function drawHorseshoe(c: C, cx: number, cy: number, R: number, r: number, top: number): void {
  c.beginPath();
  c.moveTo(cx - R, top);
  c.lineTo(cx - R, cy);
  c.arc(cx, cy, R, Math.PI, 0, true);
  c.lineTo(cx + R, top);
  c.lineTo(cx + r, top);
  c.lineTo(cx + r, cy);
  c.arc(cx, cy, r, 0, Math.PI, false);
  c.lineTo(cx - r, top);
  c.closePath();
  fillOut(c, RED, 3);
  c.beginPath();
  c.arc(cx, cy, R - 4, Math.PI * 0.92, Math.PI * 0.62, true);
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 3;
  c.stroke();
  c.beginPath();
  c.rect(cx - R, top - 3, R - r, 9);
  fillOut(c, '#DCE2E8', 3);
  c.beginPath();
  c.rect(cx + r, top - 3, R - r, 9);
  fillOut(c, '#DCE2E8', 3);
}

function makeMagnets(scene: Phaser.Scene): void {
  make(scene, 'magnet-horseshoe', 64, 64, (c) => {
    shadow(c, 32, 54, 20, 6);
    drawHorseshoe(c, 32, 28, 22, 8, 9);
    eye(c, 25.5, 40, 3.8);
    eye(c, 38.5, 40, 3.8);
    smile(c, 32, 44, 3.2);
  });
  make(scene, 'magnet-fridge', 64, 64, (c) => {
    shadow(c, 32, 54, 21, 6);
    rr(c, 11, 14, 42, 36, 9);
    fillOut(c, RED, 3);
    rr(c, 15, 18, 34, 6, 3);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fill();
    c.beginPath();
    c.moveTo(47, 26);
    c.lineTo(47, 40);
    c.lineWidth = 3;
    c.strokeStyle = '#DCE2E8';
    c.stroke();
    eye(c, 25, 33, 4.5);
    eye(c, 37, 33, 4.5);
    smile(c, 31, 38, 4);
  });
  make(scene, 'magnet-electro', 64, 64, (c) => {
    shadow(c, 32, 54, 20, 6);
    rr(c, 14, 8, 36, 42, 10);
    fillOut(c, RED, 3);
    for (const y of [16, 24, 32, 40]) {
      c.beginPath();
      c.moveTo(15, y);
      c.lineTo(49, y);
      c.lineWidth = 3;
      c.strokeStyle = '#B5652A';
      c.stroke();
    }
    rr(c, 14, 8, 36, 42, 10);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    boltShape(c, 32, 6, 7);
    fillOut(c, CYAN, 2);
    eye(c, 26, 28, 4.5);
    eye(c, 38, 28, 4.5);
    smile(c, 32, 33, 4);
  });
  make(scene, 'magnet-blackhole', 64, 64, (c) => {
    shadow(c, 32, 54, 20, 6);
    circle(c, 32, 30, 23);
    c.lineWidth = 4;
    c.strokeStyle = CYAN;
    c.stroke();
    circle(c, 32, 30, 20);
    const g = c.createRadialGradient(32, 30, 4, 32, 30, 20);
    g.addColorStop(0, '#05030A');
    g.addColorStop(1, '#4B2A73');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.arc(32, 30, 14, 0.3, 2.2);
    c.strokeStyle = 'rgba(62,230,242,0.6)';
    c.lineWidth = 2;
    c.stroke();
    eye(c, 26, 28, 4.5);
    eye(c, 38, 28, 4.5);
    smile(c, 32, 33, 4);
  });
}

// ---------------------------------------------------------------- robots

function makeRobots(scene: Phaser.Scene): void {
  make(scene, 'bot-tin', 44, 44, (c) => {
    shadow(c, 22, 37, 14, 5);
    c.beginPath();
    c.moveTo(22, 9);
    c.lineTo(22, 3.5);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 22, 3.5, 2.6);
    fillOut(c, PINK, 2);
    robotBody(c, 22, 22, 14);
    eye(c, 22, 20, 6.5);
    rr(c, 17, 27.5, 10, 3.5, 1.5);
    c.fillStyle = OUT;
    c.fill();
  });
  make(scene, 'bot-sprinter', 36, 36, (c) => {
    shadow(c, 18, 30, 11, 4);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(18 + side * 6, 10);
      c.lineTo(18 + side * 13, 3);
      c.lineTo(18 + side * 10, 13);
      c.closePath();
      fillOut(c, LIME_DARK, 2.2);
    }
    robotBody(c, 18, 18, 10.5);
    rr(c, 10, 13.5, 16, 7, 3.5);
    fillOut(c, WHITE, 2);
    circle(c, 20, 17, 2.4);
    c.fillStyle = OUT;
    c.fill();
  });
  make(scene, 'bot-shield', 50, 50, (c) => {
    shadow(c, 25, 42, 16, 5);
    robotBody(c, 25, 25, 17);
    eye(c, 25, 22, 7);
    for (const [x, y] of [
      [14, 26],
      [36, 26],
      [25, 35],
    ]) {
      circle(c, x, y, 1.6);
      c.fillStyle = OUT;
      c.fill();
    }
    c.beginPath();
    c.moveTo(16, 13);
    c.lineTo(22, 15);
    c.moveTo(34, 13);
    c.lineTo(28, 15);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
  });
  make(scene, 'shield-plate', 44, 24, (c) => {
    c.beginPath();
    c.arc(22, 30, 27, Math.PI * 1.2, Math.PI * 1.8);
    c.arc(22, 30, 20, Math.PI * 1.8, Math.PI * 1.2, true);
    c.closePath();
    fillOut(c, STEEL, 2.6);
    c.beginPath();
    c.arc(22, 30, 25, Math.PI * 1.3, Math.PI * 1.7);
    c.strokeStyle = PINK;
    c.lineWidth = 2;
    c.stroke();
  });
  make(scene, 'bot-antimag', 48, 48, (c) => {
    shadow(c, 24, 40, 15, 5);
    robotBody(c, 24, 26, 16);
    eye(c, 24, 25, 6.5);
    c.beginPath();
    c.moveTo(18, 4);
    c.lineTo(18, 9);
    c.arc(24, 9, 6, Math.PI, 0, true);
    c.lineTo(30, 4);
    c.lineWidth = 4.5;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 2.5;
    c.strokeStyle = PINK;
    c.stroke();
    c.beginPath();
    c.moveTo(16, 14);
    c.lineTo(32, 2);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
  });
  make(
    scene,
    'aura',
    240,
    240,
    (c) => {
      const g = c.createRadialGradient(120, 120, 20, 120, 120, 116);
      g.addColorStop(0, 'rgba(255,61,127,0)');
      g.addColorStop(1, 'rgba(255,61,127,0.16)');
      circle(c, 120, 120, 116);
      c.fillStyle = g;
      c.fill();
      c.setLineDash([12, 10]);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,61,127,0.75)';
      circle(c, 120, 120, 115);
      c.stroke();
    },
    1,
  );
  make(scene, 'bot-spitter', 46, 46, (c) => {
    shadow(c, 23, 38, 15, 5);
    robotBody(c, 23, 23, 15);
    eye(c, 23, 19, 6);
    circle(c, 23, 30, 3.2);
    fillOut(c, PINK, 2);
  });
  make(scene, 'barrel', 30, 14, (c) => {
    rr(c, 2, 3, 24, 8, 3);
    fillOut(c, STEEL, 2.5);
    rr(c, 20, 1.5, 8, 11, 2);
    fillOut(c, PINK, 2.5);
  });
  make(scene, 'boss', 132, 132, (c) => {
    shadow(c, 66, 116, 54, 11);
    for (const x of [6, 104]) {
      rr(c, x, 30, 22, 72, 6);
      fillOut(c, STEEL, 3.5);
      for (let y = 40; y < 100; y += 12) {
        c.beginPath();
        c.moveTo(x + 4, y);
        c.lineTo(x + 18, y);
        c.lineWidth = 2;
        c.strokeStyle = '#6E7681';
        c.stroke();
      }
    }
    rr(c, 22, 16, 88, 94, 16);
    c.fillStyle = PINK;
    c.fill();
    c.save();
    rr(c, 22, 16, 88, 94, 16);
    c.clip();
    c.fillStyle = '#C92A62';
    c.fillRect(22, 84, 88, 30);
    rr(c, 30, 22, 72, 14, 4);
    c.clip();
    c.fillStyle = BRASS;
    c.fillRect(30, 22, 72, 14);
    c.fillStyle = OUT;
    for (let x = 22; x < 110; x += 14) {
      c.beginPath();
      c.moveTo(x, 36);
      c.lineTo(x + 7, 36);
      c.lineTo(x + 14, 22);
      c.lineTo(x + 7, 22);
      c.closePath();
      c.fill();
    }
    c.restore();
    rr(c, 30, 22, 72, 14, 4);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 22, 16, 88, 94, 16);
    c.lineWidth = 4;
    c.strokeStyle = OUT;
    c.stroke();
    eye(c, 66, 62, 17);
    c.beginPath();
    c.moveTo(46, 40);
    c.lineTo(80, 48);
    c.lineWidth = 6;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 44, 86, 44, 14, 4);
    fillOut(c, OUT, 2);
    for (let x = 48; x < 86; x += 8) {
      c.beginPath();
      c.moveTo(x, 87);
      c.lineTo(x + 4, 93);
      c.lineTo(x + 8, 87);
      c.fillStyle = WHITE;
      c.fill();
    }
  });
  make(scene, 'bullet', 30, 30, (c) => {
    const g = c.createRadialGradient(15, 15, 3, 15, 15, 15);
    g.addColorStop(0, 'rgba(255,61,127,0.9)');
    g.addColorStop(1, 'rgba(255,61,127,0)');
    circle(c, 15, 15, 15);
    c.fillStyle = g;
    c.fill();
    circle(c, 15, 15, 7.5);
    fillOut(c, PINK, 3);
    circle(c, 15, 15, 3.2);
    c.fillStyle = '#FFE3EC';
    c.fill();
  });
}

// ---------------------------------------------------------------- junk

function makeJunk(scene: Phaser.Scene): void {
  make(scene, 'junk-bolt', 16, 16, (c) => {
    shadow(c, 8, 12, 5, 2);
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      c.lineTo(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5);
    }
    c.closePath();
    fillOut(c, STEEL, 2.4);
    circle(c, 8, 8, 1.7);
    c.fillStyle = '#5C6570';
    c.fill();
  });
  make(scene, 'junk-gear', 20, 20, (c) => {
    shadow(c, 10, 15, 6, 2.5);
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * TAU;
      const a1 = ((i + 1) / 16) * TAU;
      const r = i % 2 === 0 ? 7.6 : 5.6;
      c.lineTo(10 + Math.cos(a0) * r, 10 + Math.sin(a0) * r);
      c.lineTo(10 + Math.cos(a1) * r, 10 + Math.sin(a1) * r);
    }
    c.closePath();
    fillOut(c, RUST, 2.4);
    circle(c, 10, 10, 2.2);
    fillOut(c, '#1E1B24', 1.6);
  });
  make(scene, 'junk-can', 20, 22, (c) => {
    shadow(c, 10, 18.5, 6, 2.5);
    rr(c, 4, 3, 12, 15, 3);
    fillOut(c, RUST, 2.4);
    c.fillStyle = STEEL;
    c.fillRect(5.2, 4.2, 9.6, 3);
    c.fillRect(5.2, 14, 9.6, 2.8);
    rr(c, 4, 3, 12, 15, 3);
    c.lineWidth = 2.4;
    c.strokeStyle = OUT;
    c.stroke();
  });
  make(scene, 'junk-pipe', 24, 16, (c) => {
    shadow(c, 12, 12.5, 10, 2.5);
    rr(c, 2, 4, 20, 8, 4);
    fillOut(c, RUST, 2.4);
    for (const x of [7, 17]) {
      c.beginPath();
      c.moveTo(x, 4.5);
      c.lineTo(x, 11.5);
      c.lineWidth = 2;
      c.strokeStyle = '#8F4A1A';
      c.stroke();
    }
  });
  make(scene, 'junk-tv', 30, 30, (c) => {
    shadow(c, 15, 26, 11, 3);
    c.beginPath();
    c.moveTo(11, 7);
    c.lineTo(7, 1.5);
    c.moveTo(19, 7);
    c.lineTo(23, 1.5);
    c.lineWidth = 2;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 3, 6, 24, 18, 4);
    fillOut(c, BRASS, 2.6);
    rr(c, 6, 9, 14, 12, 3);
    fillOut(c, '#1D4B52', 2);
    c.beginPath();
    c.moveTo(9, 12);
    c.lineTo(12, 11);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 1.6;
    c.stroke();
    circle(c, 23.5, 12, 1.6);
    c.fillStyle = OUT;
    c.fill();
    circle(c, 23.5, 17.5, 1.6);
    c.fill();
  });
  make(scene, 'junk-cube', 24, 24, (c) => {
    shadow(c, 12, 20, 9, 3);
    rr(c, 3, 3, 18, 18, 3);
    fillOut(c, STEEL, 2.6);
    c.fillStyle = RUST;
    c.fillRect(6, 6, 5, 4);
    c.fillRect(13, 13, 5, 5);
    c.beginPath();
    c.moveTo(5, 12);
    c.lineTo(19, 10);
    c.moveTo(11, 4);
    c.lineTo(12, 20);
    c.strokeStyle = '#5C6570';
    c.lineWidth = 1.5;
    c.stroke();
  });
}

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

function makeIcons(scene: Phaser.Scene): void {
  const bg: Record<string, string> = { common: '#3A3346', rare: '#1B3E46', epic: '#4A3A17' };
  for (const [id, draw] of Object.entries(ICONS)) {
    make(scene, `icon-${id}`, 64, 64, (c) => {
      iconRing(c, bg[id === 'moltenCore' || id === 'buzzsaw' ? 'epic' : 'common']);
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
  make(
    scene,
    key,
    ARENA.width,
    ARENA.height,
    (c) => {
      const W = ARENA.width;
      const H = ARENA.height;
      const rng = new Rng(1234);
      c.fillStyle = look.floor;
      c.fillRect(0, 0, W, H);
      c.fillStyle = look.detail;
      c.strokeStyle = look.detail;

      if (look.props === 'station') {
        for (let i = 0; i < 260; i++) {
          circle(c, rng.range(0, W), rng.range(0, H), rng.range(0.8, 2.4));
          c.fillStyle = i % 9 === 0 ? 'rgba(62,230,242,0.6)' : 'rgba(244,241,234,0.45)';
          c.fill();
        }
        c.lineWidth = 2;
        c.strokeStyle = look.detail;
        for (let x = 0; x < W; x += 200) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, H);
          c.stroke();
        }
        for (let y = 0; y < H; y += 200) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(W, y);
          c.stroke();
        }
      } else if (look.props === 'factory') {
        c.lineWidth = 3;
        for (let x = 0; x < W; x += 160) {
          c.beginPath();
          c.moveTo(x, 0);
          c.lineTo(x, H);
          c.stroke();
        }
        for (let y = 0; y < H; y += 160) {
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(W, y);
          c.stroke();
        }
        c.fillStyle = look.detail;
        for (let x = 0; x < W; x += 160) {
          for (let y = 0; y < H; y += 160) {
            for (const [dx, dy] of [
              [12, 12],
              [148, 12],
              [12, 148],
              [148, 148],
            ]) {
              circle(c, x + dx, y + dy, 3.5);
              c.fill();
            }
          }
        }
      } else {
        // Junkyard: oil stains, patches and cracks on old asphalt.
        for (let i = 0; i < 70; i++) {
          c.beginPath();
          c.ellipse(rng.range(0, W), rng.range(0, H), rng.range(30, 110), rng.range(20, 70), rng.range(0, 3), 0, TAU);
          c.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,0.14)' : look.detail;
          c.globalAlpha = i % 3 === 0 ? 1 : 0.32;
          c.fill();
        }
        c.globalAlpha = 0.7;
        c.lineWidth = 2;
        c.strokeStyle = look.detail;
        for (let i = 0; i < 40; i++) {
          let x = rng.range(0, W);
          let y = rng.range(0, H);
          c.beginPath();
          c.moveTo(x, y);
          for (let j = 0; j < 5; j++) {
            x += rng.range(-60, 60);
            y += rng.range(-60, 60);
            c.lineTo(x, y);
          }
          c.stroke();
        }
        c.globalAlpha = 1;
      }

      drawEdgeProps(c, look, rng);
    },
    1,
  );
}

function drawEdgeProps(c: C, look: MapLook, rng: Rng): void {
  const W = ARENA.width;
  const H = ARENA.height;
  const m = ARENA.margin;
  // Border band so the playfield edge reads clearly.
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fillRect(0, 0, W, m);
  c.fillRect(0, H - m, W, m);
  c.fillRect(0, 0, m, H);
  c.fillRect(W - m, 0, m, H);
  c.lineWidth = 4;
  c.strokeStyle = OUT;
  c.strokeRect(m, m, W - m * 2, H - m * 2);

  const spots: [number, number][] = [];
  for (let x = 60; x < W; x += rng.range(150, 260)) {
    spots.push([x, rng.range(20, m - 10)]);
    spots.push([x + 70, H - rng.range(20, m - 10)]);
  }
  for (let y = 60; y < H; y += rng.range(150, 260)) {
    spots.push([rng.range(20, m - 10), y]);
    spots.push([W - rng.range(20, m - 10), y + 70]);
  }

  for (const [x, y] of spots) {
    const kind = rng.int(0, 2);
    if (look.props === 'junkyard') {
      if (kind === 0) {
        for (const [dx, dy] of [
          [-14, 6],
          [14, 6],
          [0, -10],
        ]) {
          circle(c, x + dx, y + dy, 15);
          fillOut(c, '#2B2730', 4);
          circle(c, x + dx, y + dy, 6);
          c.fillStyle = '#14111A';
          c.fill();
        }
      } else if (kind === 1) {
        rr(c, x - 38, y - 20, 76, 40, 12);
        fillOut(c, rng.next() < 0.5 ? '#7A3E26' : '#4E5965', 4);
        rr(c, x - 18, y - 13, 36, 16, 5);
        fillOut(c, '#26343B', 3);
      } else {
        for (let i = -2; i <= 2; i++) {
          c.beginPath();
          c.moveTo(x + i * 14, y - 26);
          c.lineTo(x + i * 14, y + 26);
          c.lineWidth = 5;
          c.strokeStyle = OUT;
          c.stroke();
          c.lineWidth = 2.5;
          c.strokeStyle = '#5A5266';
          c.stroke();
        }
      }
    } else if (look.props === 'factory') {
      if (kind === 0) {
        rr(c, x - 24, y - 24, 48, 48, 4);
        fillOut(c, '#8A6A3A', 4);
        c.beginPath();
        c.moveTo(x - 24, y - 24);
        c.lineTo(x + 24, y + 24);
        c.moveTo(x + 24, y - 24);
        c.lineTo(x - 24, y + 24);
        c.lineWidth = 3;
        c.strokeStyle = '#5E4626';
        c.stroke();
      } else {
        circle(c, x, y, 20);
        fillOut(c, kind === 1 ? '#2E6B73' : '#B5452F', 4);
        circle(c, x, y, 12);
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.stroke();
      }
    } else {
      if (kind === 0) {
        rr(c, x - 30, y - 16, 60, 32, 8);
        fillOut(c, '#2A3561', 4);
        c.fillStyle = 'rgba(62,230,242,0.5)';
        c.fillRect(x - 22, y - 8, 44, 6);
      } else if (kind === 1) {
        c.beginPath();
        c.moveTo(x, y + 20);
        c.lineTo(x, y - 18);
        c.lineWidth = 5;
        c.strokeStyle = OUT;
        c.stroke();
        c.lineWidth = 2.5;
        c.strokeStyle = STEEL;
        c.stroke();
        circle(c, x, y - 20, 6);
        fillOut(c, PINK, 3);
      } else {
        rr(c, x - 22, y - 22, 44, 44, 6);
        fillOut(c, '#3B4470', 4);
        circle(c, x, y, 9);
        fillOut(c, '#141A33', 3);
      }
    }
  }
}

export function makeBelt(scene: Phaser.Scene): void {
  make(
    scene,
    'belt',
    64,
    64,
    (c) => {
      c.fillStyle = '#2A3236';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = 'rgba(242,193,78,0.55)';
      for (const y of [0, 32]) {
        c.beginPath();
        c.moveTo(14, y + 4);
        c.lineTo(34, y + 16);
        c.lineTo(14, y + 28);
        c.lineTo(22, y + 28);
        c.lineTo(42, y + 16);
        c.lineTo(22, y + 4);
        c.closePath();
        c.fill();
      }
    },
    1,
  );
}

export function makeAllTextures(scene: Phaser.Scene): void {
  makeMagnets(scene);
  makeRobots(scene);
  makeJunk(scene);
  makeFx(scene);
  makeIcons(scene);
  makeBelt(scene);
}
