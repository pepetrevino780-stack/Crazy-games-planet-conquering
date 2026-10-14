// Tiny synthesised retro sound effects (WebAudio, no files to download).
let ctx = null;
let enabled = true;
let suspended = false; // muted while ads play

function ac() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function setSound(on) { enabled = on; }
export function setAdMute(on) { suspended = on; }

// notes: [freq, duration] pairs played in sequence.
function tone(notes, type = 'square', vol = 0.05) {
  if (!enabled || suspended) return;
  const a = ac();
  if (!a) return;
  let t = a.currentTime;
  for (const [f, d] of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + d);
    t += d * 0.9;
  }
}

// A falling pitch sweep with a burst of noise: impacts and explosions.
function boom(f0 = 180, f1 = 40, dur = 0.5, vol = 0.07) {
  if (!enabled || suspended) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur);
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const n = a.createBufferSource();
  const ng = a.createGain();
  n.buffer = buf;
  ng.gain.setValueAtTime(vol * 1.2, t);
  n.connect(ng).connect(a.destination);
  n.start(t);
}

// A short rattle of gunfire: filtered noise with a sharp attack.
function crack(vol = 0.035) {
  if (!enabled || suspended) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime, dur = 0.07 + Math.random() * 0.05;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const n = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  n.buffer = buf;
  f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 1400; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t);
  n.connect(f).connect(g).connect(a.destination);
  n.start(t);
}

let lastTick = 0;

export const sfx = {
  crash: () => boom(180, 40, 0.6, 0.08),
  // Gunfire on the fronts (the caller limits it to about 4 a second).
  skirmish: () => crack(),
  thud: () => boom(140, 50, 0.3, 0.05),
  rumble: () => boom(90, 30, 0.9, 0.06),
  // A quiet tick while your border advances; rate-limited and slightly varied.
  tick: () => {
    const now = globalThis.performance ? performance.now() : Date.now();
    if (now - lastTick < 110) return;
    lastTick = now;
    tone([[1400 + Math.random() * 500, 0.02]], 'square', 0.012);
  },
  fanfare: () => tone([[392, 0.1], [523, 0.1], [659, 0.1], [784, 0.16], [659, 0.08], [784, 0.3]], 'triangle', 0.09),
  click: () => tone([[660, 0.04]], 'square', 0.03),
  attack: () => tone([[220, 0.06], [330, 0.08]], 'sawtooth', 0.04),
  capture: () => tone([[523, 0.08], [659, 0.08], [784, 0.12]]),
  lost: () => tone([[392, 0.1], [311, 0.16]], 'sawtooth', 0.05),
  alarm: () => tone([[880, 0.08], [660, 0.08], [880, 0.08]], 'square', 0.04),
  build: () => tone([[196, 0.05], [392, 0.08]], 'triangle', 0.08),
  objective: () => tone([[784, 0.08], [988, 0.14]], 'triangle', 0.08),
  error: () => tone([[140, 0.12]], 'square', 0.04),
  victory: () => tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]], 'triangle', 0.09),
  defeat: () => tone([[392, 0.2], [330, 0.2], [262, 0.4]], 'sawtooth', 0.05),
  ability: () => tone([[1200, 0.05], [600, 0.1], [300, 0.16]], 'sawtooth', 0.05),
};
