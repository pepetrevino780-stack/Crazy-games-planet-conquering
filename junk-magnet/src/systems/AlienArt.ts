import type Phaser from 'phaser';
import { ARENA } from '../config';
import { Rng } from '../rng';
import { type C, circle, eye, fillOut, make, makeBot, rr, shadow } from './Textures';

/**
 * Mycelion art: the Hive Core, its swarmlings, the human colonists invading it and their
 * machines, and the three worlds. Same texture keys as before, so every system keeps working.
 */
const TAU = Math.PI * 2;
const OUT = '#120F16';
const WHITE = '#F4F1EA';
const HIVE = '#E04FD8';
const HIVE_DEEP = '#8E2FB8';
const ACID = '#7CFF6B';
const ACID_DARK = '#3BA84A';
const SUIT = '#ECE6DA';
const SUIT_SHADE = '#BDB4A6';
const ORANGE = '#FF8A3D';
const VISOR = '#4FC3F7';
const STEEL = '#A7B0BA';
const GOLD = '#F2C14E';
const PINK = '#FF3D7F';

// ---------------------------------------------------------------- the Hive Core (player)

function tendrils(c: C, cx: number, cy: number, r: number, n: number, len: number, color: string, phase = 0): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    const x1 = cx + Math.cos(a) * r * 0.8;
    const y1 = cy + Math.sin(a) * r * 0.8;
    const x2 = cx + Math.cos(a + 0.35) * (r + len);
    const y2 = cy + Math.sin(a + 0.35) * (r + len);
    const mx = cx + Math.cos(a - 0.25) * (r + len * 0.6);
    const my = cy + Math.sin(a - 0.25) * (r + len * 0.6);
    c.beginPath();
    c.moveTo(x1, y1);
    c.quadraticCurveTo(mx, my, x2, y2);
    c.lineWidth = 6;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = color;
    c.stroke();
    circle(c, x2, y2, 2.2);
    c.fillStyle = ACID;
    c.fill();
  }
}

function coreBody(c: C, cx: number, cy: number, r: number, light: string, dark: string, eyeColor = ACID): void {
  const glow = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.6);
  glow.addColorStop(0, 'rgba(124,255,107,0.35)');
  glow.addColorStop(1, 'rgba(124,255,107,0)');
  circle(c, cx, cy, r * 1.6);
  c.fillStyle = glow;
  c.fill();
  const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  circle(c, cx, cy, r);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.stroke();
  // Veins.
  c.strokeStyle = 'rgba(18,15,22,0.35)';
  c.lineWidth = 1.6;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45);
    c.quadraticCurveTo(cx + Math.cos(a + 0.4) * r * 0.75, cy + Math.sin(a + 0.4) * r * 0.75, cx + Math.cos(a + 0.2) * r * 0.95, cy + Math.sin(a + 0.2) * r * 0.95);
    c.stroke();
  }
  // The eye: green iris, slit pupil.
  c.beginPath();
  c.ellipse(cx, cy, r * 0.5, r * 0.38, 0, 0, TAU);
  c.fillStyle = WHITE;
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
  circle(c, cx, cy, r * 0.28);
  c.fillStyle = eyeColor;
  c.fill();
  c.beginPath();
  c.ellipse(cx, cy, r * 0.07, r * 0.24, 0, 0, TAU);
  c.fillStyle = OUT;
  c.fill();
  circle(c, cx - r * 0.12, cy - r * 0.12, r * 0.07);
  c.fillStyle = '#fff';
  c.fill();
}

export function makeHiveCores(scene: Phaser.Scene): void {
  make(scene, 'magnet-horseshoe', 64, 64, (c) => {
    shadow(c, 32, 54, 18, 5);
    tendrils(c, 32, 31, 17, 5, 9, HIVE_DEEP, 0.3);
    coreBody(c, 32, 31, 17, '#FFB3F5', HIVE);
  });
  make(scene, 'magnet-fridge', 64, 64, (c) => {
    shadow(c, 32, 54, 22, 5);
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(32 + side * 12, 31);
      c.bezierCurveTo(32 + side * 22, 20, 32 + side * 26, 42, 32 + side * 30, 30);
      c.lineWidth = 7;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3.5;
      c.strokeStyle = HIVE_DEEP;
      c.stroke();
    }
    c.save();
    c.translate(32, 31);
    c.scale(1.25, 0.85);
    coreBody(c, 0, 0, 15, '#FFB3F5', HIVE);
    c.restore();
  });
  make(scene, 'magnet-electro', 64, 64, (c) => {
    shadow(c, 32, 54, 18, 5);
    tendrils(c, 32, 31, 17, 4, 9, '#2F8FBF', 0.8);
    coreBody(c, 32, 31, 17, '#B3F0FF', '#2F8FBF', ACID);
    for (const [x, y] of [
      [12, 12],
      [50, 14],
    ]) {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 4, y + 6);
      c.lineTo(x - 1, y + 7);
      c.lineTo(x + 3, y + 13);
      c.lineWidth = 3;
      c.strokeStyle = ACID;
      c.stroke();
    }
  });
  make(scene, 'magnet-blackhole', 64, 64, (c) => {
    shadow(c, 32, 54, 18, 5);
    circle(c, 32, 31, 23);
    c.lineWidth = 4;
    c.strokeStyle = ACID;
    c.stroke();
    tendrils(c, 32, 31, 17, 6, 6, '#3B1F5C', 0);
    coreBody(c, 32, 31, 17, '#5B2E8C', '#140A24', ACID);
  });
  make(scene, 'magnet-mega', 64, 64, (c) => {
    shadow(c, 32, 56, 22, 6);
    tendrils(c, 32, 31, 20, 7, 8, HIVE_DEEP, 0.1);
    coreBody(c, 32, 31, 20, '#FFB3F5', HIVE);
    // Armoured scales.
    for (const a of [3.6, 4.4, 5.2, 6.0]) {
      c.beginPath();
      c.arc(32 + Math.cos(a) * 15, 31 + Math.sin(a) * 15, 5, 0, TAU);
      c.fillStyle = 'rgba(142,47,184,0.8)';
      c.fill();
      c.lineWidth = 1.8;
      c.strokeStyle = OUT;
      c.stroke();
    }
  });
  make(scene, 'magnet-repulsor', 64, 64, (c) => {
    shadow(c, 32, 54, 20, 5);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      c.beginPath();
      c.moveTo(32 + Math.cos(a - 0.15) * 19, 31 + Math.sin(a - 0.15) * 19);
      c.lineTo(32 + Math.cos(a) * 28, 31 + Math.sin(a) * 28);
      c.lineTo(32 + Math.cos(a + 0.15) * 19, 31 + Math.sin(a + 0.15) * 19);
      c.closePath();
      fillOut(c, ACID_DARK, 2);
    }
    coreBody(c, 32, 31, 17, '#FFB3F5', HIVE);
  });
}

/** Tiny hive core, used inside upgrade icons. */
export function miniCore(c: C, cx: number, cy: number, r: number): void {
  tendrils(c, cx, cy, r, 5, r * 0.6, HIVE_DEEP, 0.3);
  coreBody(c, cx, cy, r, '#FFB3F5', HIVE);
}

// ---------------------------------------------------------------- swarmlings (the old junk)

function legs(c: C, cx: number, cy: number, rx: number, n: number, len: number): void {
  c.lineWidth = 1.6;
  c.strokeStyle = OUT;
  for (let i = 0; i < n; i++) {
    const y = cy - rx * 0.5 + (i / Math.max(1, n - 1)) * rx;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * rx * 0.6, y);
      c.lineTo(cx + side * (rx * 0.6 + len), y + (i - (n - 1) / 2) * 1.4);
      c.stroke();
    }
  }
}

function tinyEyes(c: C, x: number, y: number, gap: number, r = 1.2): void {
  for (const s of [-1, 1]) {
    circle(c, x + s * gap, y, r);
    c.fillStyle = OUT;
    c.fill();
  }
}

export function makeSwarmlings(scene: Phaser.Scene): void {
  // spore (was bolt)
  make(scene, 'junk-bolt', 16, 16, (c) => {
    shadow(c, 8, 12, 5, 2);
    const g = c.createRadialGradient(7, 7, 1, 8, 8, 6);
    g.addColorStop(0, '#E2FFD9');
    g.addColorStop(1, ACID);
    circle(c, 8, 8, 4.6);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.2;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 8, 8, 1.4);
    c.fillStyle = ACID_DARK;
    c.fill();
  });
  // grub (was gear)
  make(scene, 'junk-gear', 20, 20, (c) => {
    shadow(c, 10, 15, 6, 2.5);
    c.beginPath();
    c.ellipse(10, 10, 7, 5.2, 0, 0, TAU);
    fillOut(c, '#F07CC8', 2.4);
    c.strokeStyle = 'rgba(18,15,22,0.45)';
    c.lineWidth = 1.4;
    for (const x of [6.5, 10, 13.5]) {
      c.beginPath();
      c.moveTo(x, 6);
      c.lineTo(x, 14);
      c.stroke();
    }
    tinyEyes(c, 4.5, 9, 1.4, 0.9);
  });
  // crawler (was can)
  make(scene, 'junk-can', 22, 22, (c) => {
    shadow(c, 11, 18.5, 6, 2.5);
    legs(c, 11, 11, 7, 3, 4);
    c.beginPath();
    c.ellipse(11, 11, 5.5, 7, 0, 0, TAU);
    fillOut(c, '#9B5CFF', 2.4);
    c.beginPath();
    c.moveTo(11, 5);
    c.lineTo(11, 17);
    c.lineWidth = 1.4;
    c.strokeStyle = 'rgba(18,15,22,0.5)';
    c.stroke();
    tinyEyes(c, 11, 5.5, 1.8);
  });
  // brute (was pipe)
  make(scene, 'junk-pipe', 26, 18, (c) => {
    shadow(c, 13, 14.5, 10, 2.5);
    legs(c, 13, 9, 8, 3, 3);
    c.beginPath();
    c.ellipse(13, 9, 10, 5.5, 0, 0, TAU);
    fillOut(c, '#2FD0B0', 2.4);
    c.beginPath();
    c.moveTo(22, 7);
    c.lineTo(26, 4);
    c.lineTo(23, 10);
    c.closePath();
    fillOut(c, WHITE, 1.6);
    tinyEyes(c, 19, 8, 1.6);
  });
  // royal swarmling (was the rare TV)
  make(scene, 'junk-tv', 30, 30, (c) => {
    shadow(c, 15, 26, 10, 3);
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(15 + s * 8, 11, 7, 4, s * 0.5, 0, TAU);
      c.fillStyle = 'rgba(224,240,255,0.65)';
      c.fill();
      c.lineWidth = 1.6;
      c.strokeStyle = OUT;
      c.stroke();
    }
    c.beginPath();
    c.ellipse(15, 16, 7, 9, 0, 0, TAU);
    const g = c.createLinearGradient(8, 8, 22, 24);
    g.addColorStop(0, '#FFF1B0');
    g.addColorStop(1, GOLD);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2.6;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.moveTo(11, 7);
    c.lineTo(13, 3);
    c.lineTo(15, 6);
    c.lineTo(17, 3);
    c.lineTo(19, 7);
    c.closePath();
    fillOut(c, GOLD, 1.6);
    tinyEyes(c, 15, 11, 2.2, 1.3);
  });
  // titan (was the crushed cube)
  make(scene, 'junk-cube', 26, 26, (c) => {
    shadow(c, 13, 21, 9, 3);
    legs(c, 13, 13, 8, 2, 5);
    rr(c, 4, 4, 18, 18, 6);
    fillOut(c, '#5B2E8C', 2.6);
    c.fillStyle = 'rgba(224,79,216,0.7)';
    for (const [x, y] of [
      [7, 7],
      [14, 7],
      [7, 14],
      [14, 14],
    ]) {
      rr(c, x, y, 5, 5, 1.5);
      c.fill();
    }
    circle(c, 13, 13, 2.4);
    c.fillStyle = ACID;
    c.fill();
  });
  // shock swarmling (was battery)
  make(scene, 'junk-battery', 20, 20, (c) => {
    shadow(c, 10, 16, 6, 2.2);
    circle(c, 10, 10, 6);
    fillOut(c, VISOR, 2.4);
    c.beginPath();
    c.moveTo(11, 4);
    c.lineTo(8, 10);
    c.lineTo(11, 10);
    c.lineTo(9, 16);
    c.lineWidth = 2;
    c.strokeStyle = '#FFFFFF';
    c.stroke();
  });
  // acid swarmling (was fuel)
  make(scene, 'junk-fuel', 20, 22, (c) => {
    shadow(c, 10, 18, 6, 2.4);
    c.beginPath();
    c.moveTo(10, 3);
    c.bezierCurveTo(17, 9, 17, 17, 10, 17);
    c.bezierCurveTo(3, 17, 3, 9, 10, 3);
    fillOut(c, '#B6FF3D', 2.4);
    for (const [x, y, r] of [
      [8, 12, 1.6],
      [12, 10, 1.2],
      [11, 14, 1],
    ]) {
      circle(c, x, y, r);
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fill();
    }
  });
  // bouncer (was spring)
  make(scene, 'junk-spring', 20, 20, (c) => {
    shadow(c, 10, 17, 6, 2.2);
    c.beginPath();
    c.moveTo(6, 15);
    c.lineTo(4, 18);
    c.moveTo(14, 15);
    c.lineTo(16, 18);
    c.lineWidth = 1.8;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.ellipse(10, 10, 6.5, 5.5, 0, 0, TAU);
    fillOut(c, '#7FB8FF', 2.4);
    circle(c, 8, 8, 1.6);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.fill();
  });
  // golden swarmling (was gold)
  make(scene, 'junk-gold', 18, 18, (c) => {
    shadow(c, 9, 15, 6, 2.2);
    c.beginPath();
    c.ellipse(9, 9, 6, 4.6, 0, 0, TAU);
    fillOut(c, GOLD, 2.4);
    c.beginPath();
    c.moveTo(5, 7);
    c.lineTo(9, 6);
    c.lineWidth = 1.6;
    c.strokeStyle = '#FFF3B0';
    c.stroke();
    tinyEyes(c, 12.5, 8.5, 1, 0.8);
  });
}

// ---------------------------------------------------------------- colonists (the old robots)

/** A human colonist in an environment suit, seen from above-front: helmet, visor, backpack. */
function colonist(c: C, cx: number, cy: number, r: number, accent = ORANGE, suit = SUIT, visor = VISOR): void {
  rr(c, cx - r * 0.8, cy - r * 0.15, r * 1.6, r * 1.05, r * 0.35);
  fillOut(c, '#5B5F6B', 2.4);
  circle(c, cx, cy, r);
  c.fillStyle = suit;
  c.fill();
  c.save();
  circle(c, cx, cy, r);
  c.clip();
  c.beginPath();
  c.ellipse(cx, cy + r * 0.9, r * 1.2, r * 0.5, 0, 0, TAU);
  c.fillStyle = SUIT_SHADE;
  c.fill();
  c.beginPath();
  c.arc(cx, cy, r * 0.82, Math.PI * 0.18, Math.PI * 0.82);
  c.lineWidth = r * 0.26;
  c.strokeStyle = accent;
  c.stroke();
  c.restore();
  circle(c, cx, cy, r);
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.stroke();
  rr(c, cx - r * 0.62, cy - r * 0.6, r * 1.24, r * 0.66, r * 0.32);
  const v = c.createLinearGradient(cx, cy - r * 0.6, cx, cy + r * 0.06);
  v.addColorStop(0, '#B8ECFF');
  v.addColorStop(1, visor);
  c.fillStyle = v;
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
  c.beginPath();
  c.moveTo(cx - r * 0.4, cy - r * 0.42);
  c.lineTo(cx - r * 0.1, cy - r * 0.48);
  c.lineWidth = 1.6;
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.stroke();
}

export function makeColonists(scene: Phaser.Scene): void {
  makeBot(scene, 'bot-tin', 44, 44, [22, 37, 14, 5], (c) => {
    c.beginPath();
    c.moveTo(28, 10);
    c.lineTo(31, 3);
    c.lineWidth = 2.5;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 31, 3, 2.2);
    fillOut(c, ORANGE, 1.6);
    colonist(c, 22, 22, 14);
  });
  // Scout Bike: a rider on a hover bike.
  makeBot(scene, 'bot-sprinter', 40, 36, [20, 30, 13, 4], (c) => {
    rr(c, 4, 16, 32, 12, 6);
    fillOut(c, '#3E4452', 2.4);
    rr(c, 2, 19, 7, 6, 2);
    fillOut(c, ORANGE, 2);
    rr(c, 31, 19, 7, 6, 2);
    c.fillStyle = 'rgba(79,195,247,0.9)';
    c.fill();
    colonist(c, 20, 15, 10);
  });
  makeBot(scene, 'bot-shield', 50, 50, [25, 42, 16, 5], (c) => colonist(c, 25, 25, 17, '#5C7CFA', '#D5DCE8'));
  make(scene, 'shield-plate', 44, 24, (c) => {
    c.beginPath();
    c.arc(22, 30, 27, Math.PI * 1.2, Math.PI * 1.8);
    c.arc(22, 30, 20, Math.PI * 1.8, Math.PI * 1.2, true);
    c.closePath();
    c.fillStyle = 'rgba(120,200,255,0.65)';
    c.fill();
    c.lineWidth = 2.6;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.arc(22, 30, 23.5, Math.PI * 1.32, Math.PI * 1.68);
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 2;
    c.stroke();
  });
  // Jammer: a colonist with a jamming dish.
  makeBot(scene, 'bot-antimag', 48, 50, [24, 42, 15, 5], (c) => {
    c.beginPath();
    c.moveTo(24, 12);
    c.lineTo(24, 5);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    c.beginPath();
    c.arc(24, 5, 7, Math.PI * 1.1, Math.PI * 1.9);
    c.lineWidth = 5;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 2.6;
    c.strokeStyle = PINK;
    c.stroke();
    colonist(c, 24, 27, 16, PINK);
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
      c.setLineDash([6, 8, 14, 8]);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,61,127,0.8)';
      circle(c, 120, 120, 115);
      c.stroke();
    },
    1,
  );
  makeBot(scene, 'bot-spitter', 46, 46, [23, 38, 15, 5], (c) => colonist(c, 23, 23, 15, '#D94B4B'));
  // Rifle (rotates toward you).
  make(scene, 'barrel', 32, 14, (c) => {
    rr(c, 2, 4, 26, 6, 2);
    fillOut(c, '#3E4452', 2.4);
    rr(c, 8, 8, 6, 5, 1.5);
    fillOut(c, '#3E4452', 2);
    c.fillStyle = ORANGE;
    c.fillRect(20, 5, 3, 4);
    circle(c, 29, 7, 2);
    c.fillStyle = PINK;
    c.fill();
  });
  for (const full of [false, true]) {
    makeBot(scene, full ? 'bot-thief-full' : 'bot-thief', 44, 44, [20, 37, 13, 4.5], (c) => {
      rr(c, 26, 6, 14, 16, 5);
      fillOut(c, '#7A6248', 2.4);
      if (full) {
        for (const [x, y, col] of [
          [30, 11, ACID],
          [35, 15, '#F07CC8'],
          [31, 17, '#9B5CFF'],
        ] as const) {
          circle(c, x, y, 2.6);
          fillOut(c, col, 1.4);
        }
      }
      colonist(c, 20, 24, 13, '#8BC34A');
    });
  }
  // Squad Pod: a drop capsule that cracks open into three cadets.
  makeBot(scene, 'bot-splitter', 48, 48, [24, 41, 16, 5], (c) => {
    circle(c, 24, 24, 18);
    fillOut(c, '#D5DCE8', 3);
    c.beginPath();
    c.moveTo(24, 6);
    c.lineTo(24, 42);
    c.moveTo(8, 24);
    c.lineTo(40, 24);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(18,15,22,0.4)';
    c.stroke();
    for (const [x, y] of [
      [17, 17],
      [31, 17],
      [24, 32],
    ]) {
      circle(c, x, y, 4);
      fillOut(c, VISOR, 2);
    }
    c.beginPath();
    c.arc(24, 24, 18, Math.PI * 0.15, Math.PI * 0.85);
    c.lineWidth = 3;
    c.strokeStyle = ORANGE;
    c.stroke();
  });
  makeBot(scene, 'bot-splitling', 28, 28, [14, 23, 9, 3], (c) => colonist(c, 14, 14, 9.5));
  make(scene, 'mound', 48, 40, (c) => {
    shadow(c, 24, 26, 20, 7);
    c.beginPath();
    c.ellipse(24, 22, 19, 12, 0, 0, TAU);
    fillOut(c, '#4A3A5C', 3);
    for (const [x, y, r] of [
      [16, 18, 4],
      [30, 16, 5],
      [24, 26, 3.5],
    ]) {
      circle(c, x, y, r);
      c.fillStyle = '#6B5882';
      c.fill();
    }
    circle(c, 24, 20, 3);
    c.fillStyle = 'rgba(255,138,61,0.8)';
    c.fill();
  });
  // Tunneler: a drill helmet.
  makeBot(scene, 'bot-burrower', 46, 50, [23, 43, 15, 5], (c) => {
    c.beginPath();
    c.moveTo(15, 16);
    c.lineTo(23, 2);
    c.lineTo(31, 16);
    c.closePath();
    fillOut(c, STEEL, 2.5);
    c.beginPath();
    c.moveTo(18, 11);
    c.lineTo(28, 8);
    c.moveTo(20, 6);
    c.lineTo(26, 4.5);
    c.lineWidth = 1.6;
    c.strokeStyle = '#5C6570';
    c.stroke();
    colonist(c, 23, 29, 15, '#C97B2F');
  });
  // Harvester: a vacuum pack that sucks swarmlings off you.
  makeBot(scene, 'bot-magnetbot', 52, 50, [26, 43, 16, 5], (c) => {
    rr(c, 34, 8, 12, 22, 5);
    fillOut(c, '#3E4452', 2.4);
    c.beginPath();
    c.moveTo(40, 8);
    c.quadraticCurveTo(44, 0, 30, 2);
    c.lineWidth = 4.5;
    c.strokeStyle = OUT;
    c.stroke();
    c.lineWidth = 2.4;
    c.strokeStyle = PINK;
    c.stroke();
    colonist(c, 24, 28, 16, PINK);
  });
  // Demolisher: hugging an explosive barrel.
  makeBot(scene, 'bot-bomber', 46, 48, [23, 41, 15, 5], (c) => {
    colonist(c, 23, 22, 14, '#D94B4B');
    rr(c, 13, 28, 20, 14, 4);
    fillOut(c, '#D94B4B', 2.6);
    c.fillStyle = '#FFD23F';
    c.fillRect(15, 33, 16, 4);
    c.beginPath();
    c.moveTo(30, 28);
    c.quadraticCurveTo(34, 22, 38, 24);
    c.lineWidth = 2;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 38, 24, 2.2);
    c.fillStyle = GOLD;
    c.fill();
  });
  // Medic Drone.
  makeBot(scene, 'bot-repair', 44, 42, [22, 37, 12, 4], (c) => {
    c.beginPath();
    c.ellipse(22, 6, 16, 3.5, 0, 0, TAU);
    fillOut(c, STEEL, 2.2);
    c.beginPath();
    c.moveTo(22, 9);
    c.lineTo(22, 13);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    circle(c, 22, 24, 12);
    fillOut(c, WHITE, 3);
    c.fillStyle = '#E53935';
    c.fillRect(19.5, 17, 5, 14);
    c.fillRect(15, 21.5, 14, 5);
  });
  // Siege Walker (mini-boss): a four-legged mech.
  makeBot(scene, 'crusher', 108, 108, [54, 96, 42, 9], (c) => {
    for (const [x, y] of [
      [14, 14],
      [94, 14],
      [14, 94],
      [94, 94],
    ]) {
      c.beginPath();
      c.moveTo(54, 54);
      c.lineTo(x, y);
      c.lineWidth = 12;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 7;
      c.strokeStyle = '#5C6570';
      c.stroke();
      circle(c, x, y, 8);
      fillOut(c, '#3E4452', 3);
    }
    rr(c, 22, 22, 64, 64, 16);
    fillOut(c, SUIT, 4);
    c.save();
    rr(c, 22, 22, 64, 64, 16);
    c.clip();
    c.fillStyle = ORANGE;
    for (let x = 14; x < 90; x += 14) {
      c.beginPath();
      c.moveTo(x, 72);
      c.lineTo(x + 7, 72);
      c.lineTo(x + 14, 86);
      c.lineTo(x + 7, 86);
      c.closePath();
      c.fill();
    }
    c.restore();
    rr(c, 36, 32, 36, 20, 8);
    fillOut(c, VISOR, 3);
    c.beginPath();
    c.moveTo(42, 36);
    c.lineTo(52, 34);
    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.stroke();
    rr(c, 48, 58, 12, 24, 3);
    fillOut(c, '#3E4452', 3);
  });
  // Rover (rolls straight at you, bouncing off walls).
  makeBot(scene, 'tyre', 44, 44, [22, 38, 17, 4], (c) => {
    circle(c, 22, 22, 18);
    fillOut(c, '#3E4452', 3);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.beginPath();
      c.moveTo(22 + Math.cos(a) * 13, 22 + Math.sin(a) * 13);
      c.lineTo(22 + Math.cos(a) * 17, 22 + Math.sin(a) * 17);
      c.lineWidth = 2.5;
      c.strokeStyle = '#6E7681';
      c.stroke();
    }
    circle(c, 22, 22, 9);
    fillOut(c, SUIT, 2.5);
    circle(c, 22, 22, 4);
    fillOut(c, VISOR, 2);
  });
  // Pile Driver.
  makeBot(scene, 'bot-press', 48, 52, [24, 45, 16, 5], (c) => {
    for (const x of [16, 32]) {
      c.fillStyle = STEEL;
      c.fillRect(x - 1.5, 8, 3, 10);
    }
    rr(c, 8, 2, 32, 9, 3);
    fillOut(c, '#5C6570', 2.6);
    colonist(c, 24, 30, 16, '#FFD23F');
  });
  // Grav Mine.
  makeBot(scene, 'mine', 44, 44, [22, 37, 13, 4], (c) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.beginPath();
      c.moveTo(22 + Math.cos(a - 0.25) * 11, 22 + Math.sin(a - 0.25) * 11);
      c.lineTo(22 + Math.cos(a) * 19, 22 + Math.sin(a) * 19);
      c.lineTo(22 + Math.cos(a + 0.25) * 11, 22 + Math.sin(a + 0.25) * 11);
      c.closePath();
      fillOut(c, ORANGE, 2.2);
    }
    circle(c, 22, 22, 12);
    fillOut(c, '#3E4452', 3);
    circle(c, 22, 22, 4.5);
    fillOut(c, PINK, 2);
  });
  // VIP Courier (the old Golden Robot).
  makeBot(
    scene,
    'bot-golden',
    40,
    40,
    [20, 34, 13, 4],
    (c) => colonist(c, 20, 20, 13, '#FFFFFF', GOLD, '#FFF1B0'),
    '#FFF3B0',
  );
  // Borer (faces up; rotated toward you).
  makeBot(scene, 'bot-driller', 46, 54, [23, 47, 15, 5], (c) => {
    c.beginPath();
    c.moveTo(12, 22);
    c.lineTo(23, 1);
    c.lineTo(34, 22);
    c.closePath();
    fillOut(c, STEEL, 2.6);
    for (const y of [9, 14, 19]) {
      c.beginPath();
      c.moveTo(23 - (22 - y) * 0.5, y);
      c.lineTo(23 + (22 - y) * 0.5, y - 3);
      c.lineWidth = 1.8;
      c.strokeStyle = '#5C6570';
      c.stroke();
    }
    rr(c, 9, 20, 28, 28, 8);
    fillOut(c, SUIT, 3);
    c.fillStyle = ORANGE;
    c.fillRect(11, 38, 24, 5);
    rr(c, 15, 25, 16, 9, 4);
    fillOut(c, VISOR, 2.2);
  });
  // Drop Carrier (second mini-boss): a hovering transport with engines and a tractor dish.
  makeBot(scene, 'magnetron', 124, 120, [62, 108, 50, 9], (c) => {
    for (const [x, y] of [
      [20, 26],
      [104, 26],
      [20, 92],
      [104, 92],
    ]) {
      circle(c, x, y, 14);
      fillOut(c, '#5C6570', 3);
      circle(c, x, y, 7);
      const g = c.createRadialGradient(x, y, 1, x, y, 7);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(1, VISOR);
      c.fillStyle = g;
      c.fill();
    }
    rr(c, 24, 18, 76, 84, 22);
    fillOut(c, SUIT, 4);
    c.fillStyle = ORANGE;
    c.fillRect(26, 50, 72, 8);
    rr(c, 44, 24, 36, 16, 7);
    fillOut(c, VISOR, 3);
    circle(c, 62, 80, 14);
    fillOut(c, '#3E4452', 3);
    circle(c, 62, 80, 8);
    c.fillStyle = PINK;
    c.fill();
  });
  // The Colony Ship (final boss).
  makeBot(
    scene,
    'boss',
    136,
    136,
    [68, 120, 56, 11],
    (c) => {
      for (const x of [26, 110]) {
        rr(c, x - 14, 84, 28, 36, 8);
        fillOut(c, '#5C6570', 3.5);
        c.beginPath();
        c.ellipse(x, 122, 10, 6, 0, 0, TAU);
        c.fillStyle = 'rgba(79,195,247,0.9)';
        c.fill();
      }
      c.beginPath();
      c.moveTo(68, 6);
      c.bezierCurveTo(118, 20, 126, 80, 112, 110);
      c.lineTo(24, 110);
      c.bezierCurveTo(10, 80, 18, 20, 68, 6);
      c.closePath();
      fillOut(c, SUIT, 4);
      c.save();
      c.clip();
      c.fillStyle = SUIT_SHADE;
      c.fillRect(0, 86, 136, 30);
      c.fillStyle = ORANGE;
      for (let x = 10; x < 130; x += 16) {
        c.beginPath();
        c.moveTo(x, 92);
        c.lineTo(x + 8, 92);
        c.lineTo(x + 16, 104);
        c.lineTo(x + 8, 104);
        c.closePath();
        c.fill();
      }
      c.restore();
      rr(c, 42, 26, 52, 26, 12);
      fillOut(c, VISOR, 3.5);
      c.beginPath();
      c.moveTo(50, 32);
      c.lineTo(66, 30);
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.stroke();
      for (let i = 0; i < 5; i++) {
        circle(c, 36 + i * 16, 66, 4);
        fillOut(c, '#FFE9A8', 2);
      }
      eye(c, 68, 82, 0.01);
    },
    '#FFE0B8',
  );
  make(scene, 'bullet', 30, 30, (c) => {
    const g = c.createRadialGradient(15, 15, 3, 15, 15, 15);
    g.addColorStop(0, 'rgba(255,138,61,0.95)');
    g.addColorStop(1, 'rgba(255,61,127,0)');
    circle(c, 15, 15, 15);
    c.fillStyle = g;
    c.fill();
    circle(c, 15, 15, 7);
    fillOut(c, '#FF6B3D', 3);
    circle(c, 15, 15, 3);
    c.fillStyle = '#FFF1D0';
    c.fill();
  });
}

// ---------------------------------------------------------------- pickups, weapons, icons

export function makeAlienFx(scene: Phaser.Scene): void {
  // Acid Spit (was the fireball).
  make(scene, 'fireball', 26, 26, (c) => {
    const g = c.createRadialGradient(13, 13, 2, 13, 13, 13);
    g.addColorStop(0, '#F2FFE8');
    g.addColorStop(0.45, ACID);
    g.addColorStop(1, 'rgba(59,168,74,0)');
    circle(c, 13, 13, 13);
    c.fillStyle = g;
    c.fill();
    circle(c, 13, 13, 5.5);
    fillOut(c, '#B6FF3D', 2);
  });
  // Spore Mine (was Magnet Mine).
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
      c.strokeStyle = ACID;
      c.stroke();
    }
    circle(c, 20, 20, 11);
    fillOut(c, HIVE, 3);
    circle(c, 20, 20, 4);
    c.fillStyle = ACID;
    c.fill();
  });
  // Nectar pod (health).
  make(scene, 'health-pack', 44, 44, (c) => {
    shadow(c, 22, 37, 14, 4);
    const g = c.createRadialGradient(22, 22, 4, 22, 22, 22);
    g.addColorStop(0, 'rgba(124,255,107,0.6)');
    g.addColorStop(1, 'rgba(124,255,107,0)');
    circle(c, 22, 22, 22);
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    c.moveTo(22, 6);
    c.bezierCurveTo(36, 16, 34, 34, 22, 34);
    c.bezierCurveTo(10, 34, 8, 16, 22, 6);
    fillOut(c, '#9BFF7A', 3);
    c.fillStyle = WHITE;
    c.fillRect(20, 15, 4, 13);
    c.fillRect(15.5, 19.5, 13, 4);
  });
  // Supply crate (was the treasure chest).
  make(scene, 'chest', 60, 52, (c) => {
    shadow(c, 30, 46, 24, 5);
    rr(c, 6, 10, 48, 34, 5);
    fillOut(c, '#6E7681', 3);
    c.save();
    rr(c, 6, 10, 48, 34, 5);
    c.clip();
    c.fillStyle = ORANGE;
    for (let x = -10; x < 60; x += 12) {
      c.beginPath();
      c.moveTo(x, 10);
      c.lineTo(x + 6, 10);
      c.lineTo(x + 14, 18);
      c.lineTo(x + 8, 18);
      c.closePath();
      c.fill();
    }
    c.restore();
    rr(c, 6, 10, 48, 34, 5);
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    rr(c, 22, 24, 16, 12, 3);
    fillOut(c, GOLD, 2.4);
    circle(c, 30, 30, 2);
    c.fillStyle = OUT;
    c.fill();
  });
  // Biomass (was the scrap coin).
  make(scene, 'coin', 26, 26, (c) => {
    const g = c.createRadialGradient(11, 10, 1, 13, 13, 11);
    g.addColorStop(0, '#E2FFD9');
    g.addColorStop(1, ACID);
    c.beginPath();
    c.moveTo(13, 2);
    c.bezierCurveTo(23, 10, 22, 23, 13, 23);
    c.bezierCurveTo(4, 23, 3, 10, 13, 2);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
  });
  // Spore Burst button icon (was Pulse).
  make(scene, 'pulse-icon', 56, 56, (c) => {
    for (const r of [22, 15]) {
      circle(c, 28, 28, r);
      c.setLineDash([5, 4]);
      c.lineWidth = 6;
      c.strokeStyle = OUT;
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = ACID;
      c.stroke();
    }
    c.setLineDash([]);
    miniCore(c, 28, 28, 7);
  });
}

// ---------------------------------------------------------------- worlds

export interface WorldLook {
  floor: string;
  detail: string;
  props: string;
}

/** Mycelion (purple jungle), Vulkara (volcanic) or Cryonis (ice). Keyed by the old map ids. */
export function drawWorldFloor(c: C, look: WorldLook): void {
  const W = ARENA.width;
  const H = ARENA.height;
  const rng = new Rng(1234);
  c.fillStyle = look.floor;
  c.fillRect(0, 0, W, H);
  if (look.props === 'factory') {
    // Vulkara: dark rock plates split by faintly glowing lava cracks.
    c.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.ellipse(rng.range(0, W), rng.range(0, H), rng.range(60, 160), rng.range(40, 110), rng.range(0, 3), 0, TAU);
      c.fillStyle = look.detail;
      c.fill();
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 30; i++) {
      let x = rng.range(0, W);
      let y = rng.range(0, H);
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += rng.range(-80, 80);
        y += rng.range(-80, 80);
        c.lineTo(x, y);
      }
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(255,107,43,0.10)';
      c.stroke();
      c.lineWidth = 1.6;
      c.strokeStyle = 'rgba(255,138,61,0.35)';
      c.stroke();
    }
  } else if (look.props === 'station') {
    // Cryonis: frozen ground with frost cracks and ice crystals.
    c.globalAlpha = 0.45;
    for (let i = 0; i < 24; i++) {
      c.beginPath();
      c.ellipse(rng.range(0, W), rng.range(0, H), rng.range(60, 170), rng.range(40, 110), rng.range(0, 3), 0, TAU);
      c.fillStyle = look.detail;
      c.fill();
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(180,230,255,0.18)';
    c.lineWidth = 1.6;
    for (let i = 0; i < 40; i++) {
      let x = rng.range(0, W);
      let y = rng.range(0, H);
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += rng.range(-50, 50);
        y += rng.range(-50, 50);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 160; i++) {
      circle(c, rng.range(0, W), rng.range(0, H), rng.range(0.8, 2));
      c.fillStyle = 'rgba(220,245,255,0.35)';
      c.fill();
    }
  } else {
    // Mycelion: a glowing purple jungle floor of moss, roots and spores.
    for (let i = 0; i < 18; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H);
      const r = rng.range(90, 200);
      const g = c.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, i % 3 === 0 ? 'rgba(224,79,216,0.10)' : 'rgba(124,255,107,0.07)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) {
      c.beginPath();
      c.ellipse(rng.range(0, W), rng.range(0, H), rng.range(50, 140), rng.range(35, 90), rng.range(0, 3), 0, TAU);
      c.fillStyle = look.detail;
      c.fill();
    }
    c.globalAlpha = 1;
    c.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      let x = rng.range(0, W);
      let y = rng.range(0, H);
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += rng.range(-70, 70);
        y += rng.range(-70, 70);
        c.quadraticCurveTo(x + rng.range(-20, 20), y + rng.range(-20, 20), x, y);
      }
      c.strokeStyle = 'rgba(124,255,107,0.07)';
      c.stroke();
    }
    for (let i = 0; i < 220; i++) {
      circle(c, rng.range(0, W), rng.range(0, H), rng.range(0.8, 2.2));
      c.fillStyle = i % 4 === 0 ? 'rgba(224,79,216,0.35)' : 'rgba(124,255,107,0.28)';
      c.fill();
    }
  }
  drawWorldEdge(c, look, rng);
}

function mushroom(c: C, x: number, y: number, s: number, cap: string): void {
  rr(c, x - s * 0.18, y - s * 0.1, s * 0.36, s * 0.7, s * 0.12);
  fillOut(c, '#D8C7E8', 3);
  c.beginPath();
  c.ellipse(x, y - s * 0.15, s * 0.6, s * 0.38, 0, Math.PI, 0);
  c.closePath();
  fillOut(c, cap, 3);
  for (const [dx, dy] of [
    [-0.25, -0.3],
    [0.15, -0.38],
    [0.3, -0.22],
  ]) {
    circle(c, x + dx * s, y + dy * s, s * 0.07);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fill();
  }
}

function drawWorldEdge(c: C, look: WorldLook, rng: Rng): void {
  const W = ARENA.width;
  const H = ARENA.height;
  const m = ARENA.margin;
  c.fillStyle = 'rgba(8,4,14,0.55)';
  c.fillRect(0, 0, W, m);
  c.fillRect(0, H - m, W, m);
  c.fillRect(0, 0, m, H);
  c.fillRect(W - m, 0, m, H);

  // The arena wall: a living thorn hedge (Mycelion), rock ridge (Vulkara) or ice wall (Cryonis).
  const band = 14;
  const wall = look.props === 'factory' ? '#5A2A1E' : look.props === 'station' ? '#7FB3D9' : '#3B1F5C';
  const accent = look.props === 'factory' ? '#FF8A3D' : look.props === 'station' ? '#E0F6FF' : '#7CFF6B';
  c.save();
  c.beginPath();
  c.rect(m - band, m - band, W - (m - band) * 2, H - (m - band) * 2);
  c.rect(m, m, W - m * 2, H - m * 2);
  c.clip('evenodd');
  c.fillStyle = wall;
  c.fillRect(0, 0, W, H);
  c.fillStyle = accent;
  c.globalAlpha = 0.7;
  for (let x = m; x < W - m; x += 26) {
    for (const y of [m - band, H - m]) {
      c.beginPath();
      c.moveTo(x, y + band / 2);
      c.lineTo(x + 6, y + (y < H / 2 ? band : 0));
      c.lineTo(x + 12, y + band / 2);
      c.fill();
    }
  }
  for (let y = m; y < H - m; y += 26) {
    for (const x of [m - band, W - m]) {
      c.beginPath();
      c.moveTo(x + band / 2, y);
      c.lineTo(x + (x < W / 2 ? band : 0), y + 6);
      c.lineTo(x + band / 2, y + 12);
      c.fill();
    }
  }
  c.restore();
  c.lineWidth = 4;
  c.strokeStyle = OUT;
  c.strokeRect(m - band, m - band, W - (m - band) * 2, H - (m - band) * 2);
  c.strokeRect(m, m, W - m * 2, H - m * 2);

  const spots: [number, number][] = [];
  for (let x = 60; x < W; x += rng.range(150, 260)) {
    spots.push([x, rng.range(20, m - 16)]);
    spots.push([x + 70, H - rng.range(20, m - 16)]);
  }
  for (let y = 60; y < H; y += rng.range(150, 260)) {
    spots.push([rng.range(20, m - 16), y]);
    spots.push([W - rng.range(20, m - 16), y + 70]);
  }
  for (const [x, y] of spots) {
    const kind = rng.int(0, 2);
    if (look.props === 'factory') {
      if (kind === 0) {
        c.beginPath();
        c.ellipse(x, y, 26, 18, rng.range(0, 3), 0, TAU);
        fillOut(c, '#4A2A22', 4);
      } else {
        c.beginPath();
        c.ellipse(x, y, 22, 14, 0, 0, TAU);
        const g = c.createRadialGradient(x, y, 2, x, y, 22);
        g.addColorStop(0, '#FFE08A');
        g.addColorStop(0.6, '#FF6B2B');
        g.addColorStop(1, '#7A2A12');
        c.fillStyle = g;
        c.fill();
        c.lineWidth = 4;
        c.strokeStyle = OUT;
        c.stroke();
      }
    } else if (look.props === 'station') {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.5;
        c.beginPath();
        c.moveTo(x - 7 + i * 7, y + 12);
        c.lineTo(x - 7 + i * 7 + Math.cos(a) * 26, y + 12 + Math.sin(a) * 26);
        c.lineTo(x + i * 7, y + 12);
        c.closePath();
        fillOut(c, kind === 0 ? '#9FD8FF' : '#C9ECFF', 3);
      }
    } else if (kind === 0) {
      mushroom(c, x, y + 10, 40, '#B23CC8');
    } else if (kind === 1) {
      mushroom(c, x, y + 8, 30, '#3BA84A');
    } else {
      for (const [dx, dy] of [
        [-10, 4],
        [8, -2],
        [0, 10],
      ]) {
        circle(c, x + dx, y + dy, 9);
        fillOut(c, '#E04FD8', 3);
        circle(c, x + dx - 2, y + dy - 2, 2.4);
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.fill();
      }
    }
  }
}

/** Vulkara's magma currents (the conveyor belts). */
export function makeMagmaBelt(scene: Phaser.Scene): void {
  make(
    scene,
    'belt',
    64,
    64,
    (c) => {
      c.fillStyle = '#3A1A12';
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = 'rgba(255,107,43,0.8)';
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

/** Lava vent hazard (was the car crusher): a rocky crater, and the eruption that bursts out of it. */
export function makeVentTextures(scene: Phaser.Scene, w: number, h: number): { base: string; plate: string } {
  const base = `vent-base-${w}x${h}`;
  const plate = `vent-burst-${w}x${h}`;
  make(scene, base, w + 16, h + 16, (c) => {
    c.translate(8, 8);
    c.beginPath();
    c.ellipse(w / 2 + 3, h / 2 + 6, w / 2, h / 2, 0, 0, TAU);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fill();
    // Rock rim.
    c.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const k = i % 2 ? 0.92 : 1;
      c.lineTo(w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k);
    }
    c.closePath();
    fillOut(c, '#4A2F3A', 4);
    // Magma pool.
    c.beginPath();
    c.ellipse(w / 2, h / 2, w * 0.32, h * 0.32, 0, 0, TAU);
    const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.32);
    g.addColorStop(0, '#FFE08A');
    g.addColorStop(0.5, '#FF6B2B');
    g.addColorStop(1, '#7A1F12');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = OUT;
    c.stroke();
    for (const [dx, dy, r] of [
      [-0.1, -0.05, 4],
      [0.12, 0.08, 3],
      [0.02, 0.14, 2.5],
    ]) {
      circle(c, w / 2 + dx * w, h / 2 + dy * h, r);
      c.fillStyle = 'rgba(255,241,176,0.8)';
      c.fill();
    }
  });
  make(scene, plate, w + 16, h + 24, (c) => {
    c.translate(8, 4);
    const cx = w / 2;
    const cy = h / 2 + 4;
    const g = c.createRadialGradient(cx, cy, 6, cx, cy, w / 2);
    g.addColorStop(0, 'rgba(255,248,200,1)');
    g.addColorStop(0.4, 'rgba(255,160,60,0.95)');
    g.addColorStop(1, 'rgba(255,61,43,0)');
    c.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const r = (i % 2 ? 0.62 : 0.95) * (w / 2);
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * (h / w));
    }
    c.closePath();
    c.fillStyle = g;
    c.fill();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      rr(c, cx + Math.cos(a) * w * 0.3 - 5, cy + Math.sin(a) * h * 0.3 - 5, 10, 10, 3);
      fillOut(c, '#4A2F3A', 2.4);
    }
  });
  return { base, plate };
}

export function makeAlienTextures(scene: Phaser.Scene): void {
  makeHiveCores(scene);
  makeSwarmlings(scene);
  makeColonists(scene);
  makeAlienFx(scene);
  makeMagmaBelt(scene);
}
