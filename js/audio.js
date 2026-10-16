// All game audio is synthesised with WebAudio: no files to download.
//
//   effects ─┐
//   music ───┼─> master ─> compressor ─> speakers
//   ambience ┘
//
// - Effects are normalised per waveform and role, so a square-wave click is
//   no louder than a triangle fanfare.
// - Music: a short looping chiptune per world (bass, arpeggio, soft pad,
//   kick and hat), composed from a seed, quieter than the effects.
// - Ambience: a bed per planet (lava rumble, wind, hum...) plus a distant
//   battle noise that rises with the number of fronts you fight on.
// - Master mute follows the Sound setting, ads and CrazyGames' mute setting.

let ctx = null;
let bus = null; // { master, sfx, music, amb }
let enabled = true;   // Sound setting
let adMuted = false;  // an ad is playing
let portalMuted = false; // CrazyGames muteAudio
let hidden = false;   // the tab is in the background
const volumes = { master: 0.8, music: 0.5, sfx: 0.8 };

// ---------- Pure helpers (tested without WebAudio) ----------

// How loud each waveform sounds at the same gain, and how prominent each
// kind of sound should be. Effect gain = BASE x role x wave.
const BASE = 0.075;
export const WAVE_LOUDNESS = { square: 0.55, sawtooth: 0.6, triangle: 1, sine: 1.1, noise: 0.9 };
export const ROLES = { tick: 0.2, ui: 0.45, event: 0.75, big: 1 };
export const effectGain = (wave, role) => BASE * (ROLES[role] ?? 0.75) * (WAVE_LOUDNESS[wave] ?? 1);

// The master level after settings and mutes.
export function masterLevel(v = volumes, flags = { enabled, adMuted, portalMuted, hidden }) {
  if (!flags.enabled || flags.adMuted || flags.portalMuted || flags.hidden) return 0;
  return Math.max(0, Math.min(1, v.master));
}

const SCALES = {
  phrygian: [0, 1, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], harmonic: [0, 2, 3, 5, 7, 8, 11],
};
// Each world: key (MIDI root), scale, tempo, chord degrees per bar, mood.
export const MUSIC_THEMES = {
  menu: { root: 50, scale: 'dorian', bpm: 92, chords: [0, 5, 3, 4, 0, 5, 6, 4], seed: 11, density: 0.55 },
  vulkara: { root: 52, scale: 'phrygian', bpm: 112, chords: [0, 0, 1, 0, 5, 6, 1, 0], seed: 21, density: 0.7 },
  cryonis: { root: 57, scale: 'aeolian', bpm: 84, chords: [0, 5, 2, 6, 0, 3, 5, 4], seed: 31, density: 0.45 },
  mycelion: { root: 48, scale: 'dorian', bpm: 100, chords: [0, 3, 0, 4, 5, 3, 1, 4], seed: 41, density: 0.6 },
  xythera: { root: 53, scale: 'lydian', bpm: 120, chords: [0, 1, 0, 4, 0, 1, 5, 4], seed: 51, density: 0.75 },
  noctyra: { root: 47, scale: 'harmonic', bpm: 104, chords: [0, 5, 3, 4, 0, 5, 1, 4], seed: 61, density: 0.65 },
};
MUSIC_THEMES.tutorial = MUSIC_THEMES.vulkara;

/**
 * Compose an 8-bar, 16-steps-per-bar loop for a theme. Deterministic.
 * Returns { bpm, steps, events: [{ step, voice, midi, len }] }.
 */
export function composeLoop(name) {
  const th = MUSIC_THEMES[name] || MUSIC_THEMES.menu;
  const scale = SCALES[th.scale];
  let r = th.seed;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const note = (deg, oct = 0) => {
    let m = th.root + scale[((deg % 7) + 7) % 7] + 12 * (oct + Math.floor(deg / 7));
    while (m > 86) m -= 12; // keep the lead sweet, never shrill
    return m;
  };
  const events = [];
  th.chords.forEach((deg, bar) => {
    const s0 = bar * 16;
    const chord = [deg, deg + 2, deg + 4];
    // Pad: the chord, held for the bar, very soft.
    for (const d of chord) events.push({ step: s0, voice: 'pad', midi: note(d, 0), len: 16 });
    // Bass: root on the beat, an octave hop on the off-beats now and then.
    for (let b = 0; b < 16; b += 4) events.push({ step: s0 + b, voice: 'bass', midi: note(deg, -1) + (b === 8 && rand() < 0.5 ? 12 : 0), len: 3 });
    // Arpeggio lead over the chord tones, thinner on calm worlds.
    for (let s = 0; s < 16; s += 2) {
      if (rand() > th.density) continue;
      const d = chord[Math.floor(rand() * 3)] + (rand() < 0.25 ? 7 : 0);
      events.push({ step: s0 + s, voice: 'lead', midi: note(d, 1), len: rand() < 0.3 ? 4 : 2 });
    }
    // Drums: kick on 1 and 3, a quiet hat on the off-beats.
    events.push({ step: s0, voice: 'kick', midi: 0, len: 1 }, { step: s0 + 8, voice: 'kick', midi: 0, len: 1 });
    for (let s = 2; s < 16; s += 4) events.push({ step: s0 + s, voice: 'hat', midi: 0, len: 1 });
  });
  return { bpm: th.bpm, steps: th.chords.length * 16, events, scale: th.scale, root: th.root };
}

// ---------- WebAudio plumbing ----------

function ac() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    bus = { master: ctx.createGain(), sfx: ctx.createGain(), music: ctx.createGain(), amb: ctx.createGain() };
    bus.master.connect(comp);
    for (const k of ['sfx', 'music', 'amb']) bus[k].connect(bus.master);
    applyLevels(true);
  }
  if (ctx.state === 'suspended' && !hidden) ctx.resume().catch(() => {});
  return ctx;
}

function applyLevels(instant = false) {
  if (!ctx) return;
  const t = ctx.currentTime, k = instant ? 0.001 : 0.08;
  bus.master.gain.setTargetAtTime(masterLevel(), t, k);
  bus.sfx.gain.setTargetAtTime(volumes.sfx, t, k);
  bus.music.gain.setTargetAtTime(volumes.music * 0.55, t, k);
  bus.amb.gain.setTargetAtTime(volumes.sfx * 0.7, t, k);
}

export function setSound(on) { enabled = on; applyLevels(); if (on) syncMusic(); }
export function setAdMute(on) { adMuted = on; applyLevels(); }
export function setPortalMute(on) { portalMuted = on; applyLevels(); }
export function setHidden(on) {
  hidden = on;
  applyLevels(true);
  if (ctx) (on ? ctx.suspend() : ctx.resume()).catch?.(() => {});
}
export function setVolumes(v) {
  for (const k of ['master', 'music', 'sfx']) if (typeof v?.[k] === 'number') volumes[k] = Math.max(0, Math.min(1, v[k]));
  applyLevels();
}
export const getVolumes = () => ({ ...volumes });

// Browsers start audio only after a user gesture: call this from one.
export function unlockAudio() { if (ac()) syncMusic(); }

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// notes: [freq, duration] pairs played in sequence.
function tone(notes, type = 'square', role = 'event') {
  if (masterLevel() === 0) return;
  const a = ac();
  if (!a) return;
  const vol = effectGain(type, role);
  let t = a.currentTime;
  for (const [f, d] of notes) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(bus.sfx);
    o.start(t);
    o.stop(t + d + 0.02);
    t += d * 0.9;
  }
}

// A falling pitch sweep with a burst of noise: impacts and explosions.
function boom(f0 = 180, f1 = 40, dur = 0.5, role = 'big') {
  if (masterLevel() === 0) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime, vol = effectGain('sawtooth', role);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus.sfx);
  o.start(t); o.stop(t + dur);
  const n = a.createBufferSource();
  const lp = a.createBiquadFilter();
  const ng = a.createGain();
  n.buffer = noise();
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur);
  ng.gain.setValueAtTime(effectGain('noise', role), t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(lp).connect(ng).connect(bus.sfx);
  n.start(t); n.stop(t + dur);
}

// A short rattle of gunfire: band-passed noise with a sharp attack.
function crack() {
  if (masterLevel() === 0) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime, dur = 0.07 + Math.random() * 0.05;
  const n = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  n.buffer = noise();
  f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 1400; f.Q.value = 0.8;
  g.gain.setValueAtTime(effectGain('noise', 'ui'), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(bus.sfx);
  n.start(t, Math.random()); n.stop(t + dur);
}

let lastTick = 0;

export const sfx = {
  crash: () => boom(180, 40, 0.6, 'big'),
  // Gunfire on the fronts (the caller limits it to about 4 a second).
  skirmish: () => crack(),
  thud: () => boom(140, 50, 0.3, 'event'),
  rumble: () => boom(90, 30, 0.9, 'big'),
  // A quiet tick while your border advances; rate-limited and slightly varied.
  tick: () => {
    const now = globalThis.performance ? performance.now() : Date.now();
    if (now - lastTick < 110) return;
    lastTick = now;
    tone([[1400 + Math.random() * 500, 0.02]], 'square', 'tick');
  },
  fanfare: () => tone([[392, 0.1], [523, 0.1], [659, 0.1], [784, 0.16], [659, 0.08], [784, 0.3]], 'triangle', 'big'),
  click: () => tone([[660, 0.04]], 'square', 'ui'),
  attack: () => tone([[220, 0.06], [330, 0.08]], 'sawtooth', 'event'),
  capture: () => tone([[523, 0.08], [659, 0.08], [784, 0.12]], 'square', 'event'),
  lost: () => tone([[392, 0.1], [311, 0.16]], 'sawtooth', 'event'),
  alarm: () => tone([[880, 0.08], [660, 0.08], [880, 0.08]], 'square', 'event'),
  build: () => tone([[196, 0.05], [392, 0.08]], 'triangle', 'event'),
  objective: () => tone([[784, 0.08], [988, 0.14]], 'triangle', 'event'),
  error: () => tone([[140, 0.12]], 'square', 'ui'),
  victory: () => tone([[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]], 'triangle', 'big'),
  defeat: () => tone([[392, 0.2], [330, 0.2], [262, 0.4]], 'sawtooth', 'big'),
  ability: () => tone([[1200, 0.05], [600, 0.1], [300, 0.16]], 'sawtooth', 'event'),
};

// ---------- Music ----------

let musicName = null;   // wanted theme
let playing = null;     // { name, loop, step, next, timer }

function syncMusic() {
  if (!ctx || !enabled) return;
  if (playing && playing.name === musicName) return;
  stopLoop();
  if (musicName) startLoop(musicName);
}

export function playMusic(name) {
  musicName = name;
  syncMusic();
}

function stopLoop() {
  if (!playing) return;
  globalThis.clearInterval(playing.timer);
  playing = null;
}

function startLoop(name) {
  const loop = composeLoop(name);
  const stepDur = 60 / loop.bpm / 4;
  playing = { name, loop, step: 0, next: ctx.currentTime + 0.1, stepDur };
  const byStep = new Map();
  for (const e of loop.events) { if (!byStep.has(e.step)) byStep.set(e.step, []); byStep.get(e.step).push(e); }
  const p = playing;
  // Look-ahead scheduler: queue the next 0.25 s every 60 ms.
  p.timer = globalThis.setInterval(() => {
    if (playing !== p || !ctx) return;
    while (p.next < ctx.currentTime + 0.25) {
      for (const e of byStep.get(p.step) || []) voice(e, p.next, e.len * stepDur);
      p.step = (p.step + 1) % loop.steps;
      p.next += stepDur;
    }
  }, 60);
}

function voice(e, t, dur) {
  const out = bus.music;
  if (e.voice === 'kick') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.16);
    return;
  }
  if (e.voice === 'hat') {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise(); f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(f).connect(g).connect(out); n.start(t, Math.random()); n.stop(t + 0.05);
    return;
  }
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(mtof(e.midi), t);
  let node = o;
  if (e.voice === 'bass') { o.type = 'triangle'; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  else if (e.voice === 'lead') {
    o.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    o.connect(f); node = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
  } else { // pad
    o.type = 'sawtooth'; o.detune.value = (Math.random() - 0.5) * 14;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    o.connect(f); node = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  }
  node.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

// ---------- Ambience ----------

let amb = null; // { name, nodes, battle }

// Each planet's bed: filtered noise and slow oscillators.
const AMBIENCE = {
  vulkara: [{ kind: 'noise', filter: 'lowpass', freq: 160, gain: 0.5, lfo: 0.08, depth: 0.25 }],
  cryonis: [{ kind: 'noise', filter: 'bandpass', freq: 650, q: 0.8, gain: 0.28, lfo: 0.06, sweep: 420 }],
  mycelion: [{ kind: 'noise', filter: 'lowpass', freq: 320, gain: 0.16, lfo: 0.12, depth: 0.08 }, { kind: 'tone', freq: 73, gain: 0.05, lfo: 0.3, depth: 0.03 }],
  xythera: [{ kind: 'tone', freq: 55, gain: 0.06 }, { kind: 'tone', freq: 110.6, gain: 0.035 }, { kind: 'noise', filter: 'highpass', freq: 5000, gain: 0.02 }],
  noctyra: [{ kind: 'tone', freq: 41, gain: 0.08 }, { kind: 'noise', filter: 'lowpass', freq: 120, gain: 0.3, lfo: 0.05, depth: 0.15 }, { kind: 'tone', freq: 1760, gain: 0.006, lfo: 0.7, depth: 0.005 }],
};
AMBIENCE.tutorial = AMBIENCE.vulkara;

export function setAmbience(name) {
  if (amb && amb.name === name) return;
  if (amb) {
    const t = ctx.currentTime, old = amb;
    for (const g of old.gains) g.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(() => old.nodes.forEach(n => { try { n.stop?.(); n.disconnect(); } catch { /* already gone */ } }), 2000);
    amb = null;
  }
  if (!name || !AMBIENCE[name] || !ac()) return;
  const t = ctx.currentTime, nodes = [], gains = [];
  for (const L of AMBIENCE[name]) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(L.gain, t, 1);
    let src;
    if (L.kind === 'noise') {
      src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = L.filter; f.frequency.value = L.freq; if (L.q) f.Q.value = L.q;
      src.connect(f).connect(g); nodes.push(f);
      if (L.sweep) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.lfo; lg.gain.value = L.sweep; lfo.connect(lg).connect(f.frequency); lfo.start(); nodes.push(lfo, lg); }
    } else {
      src = ctx.createOscillator(); src.type = 'sine'; src.frequency.value = L.freq;
      src.connect(g);
    }
    if (L.lfo && L.depth) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = L.lfo; lg.gain.value = L.depth; lfo.connect(lg).connect(g.gain); lfo.start(); nodes.push(lfo, lg); }
    g.connect(bus.amb);
    src.start();
    nodes.push(src, g); gains.push(g);
  }
  // Distant battle: band-passed noise, silent until fronts open.
  const bsrc = ctx.createBufferSource(); bsrc.buffer = noise(); bsrc.loop = true;
  const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 500; bf.Q.value = 0.6;
  const bg = ctx.createGain(); bg.gain.value = 0;
  bsrc.connect(bf).connect(bg).connect(bus.amb); bsrc.start();
  nodes.push(bsrc, bf, bg); gains.push(bg);
  amb = { name, nodes, gains, battle: bg };
}

// Fronts you fight on: the distant battle rises with them.
export const battleBedLevel = fronts => Math.min(0.28, 0.07 * Math.max(0, fronts));
export function setBattleIntensity(fronts) {
  if (!amb || !ctx) return;
  amb.battle.gain.setTargetAtTime(battleBedLevel(fronts), ctx.currentTime, 0.8);
}
