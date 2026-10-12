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

export const sfx = {
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
