/**
 * All sound is synthesised with Web Audio: no audio files to download, and the
 * context is only created after the first click/tap (browser autoplay rules).
 */
type Track = 'menu' | 'main' | 'boss' | null;

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private adMuted = false;
  private settingsMuted = false;
  private clinkStep = 0;
  private lastClink = -1;
  private lastTimes: Record<string, number> = {};

  private track: Track = null;
  private intensity = 0;
  private step = 0;
  private nextStepTime = 0;
  private timer: number | null = null;

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture. Safe to call many times. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.connect(comp);
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      if (this.track) this.startSequencer();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  setAdMuted(muted: boolean): void {
    this.adMuted = muted;
    this.applyVolumes();
  }

  setSettingsMuted(muted: boolean): void {
    this.settingsMuted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const mute = this.adMuted || this.settingsMuted ? 0 : 1;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(mute, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.5, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.02);
  }

  /** Rate-limit a sound so 50 hits in one frame don't become a wall of noise. */
  private gate(name: string, gapSeconds: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.lastTimes[name] ?? -1) < gapSeconds) return false;
    this.lastTimes[name] = now;
    return true;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    opts: { when?: number; slideTo?: number; bus?: GainNode; attack?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const attack = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(
    dur: number,
    gain: number,
    filter: BiquadFilterType,
    freq: number,
    opts: { when?: number; sweepTo?: number; q?: number; bus?: GainNode } = {},
  ): void {
    const ctx = this.ctx!;
    const t = opts.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------- SFX ----------

  /** Signature sound: each attach clinks a little higher; the chain resets after 0.5 s. */
  clink(): void {
    if (!this.ctx || !this.gate('clink', 0.028)) return;
    const now = this.ctx.currentTime;
    if (now - this.lastClink > 0.5) this.clinkStep = 0;
    this.lastClink = now;
    const semis = Math.min(this.clinkStep, 24);
    this.clinkStep++;
    // A wet "bloop" as a swarmling latches on: a water-drop pitch flick plus a tiny squelch.
    const f = 520 * Math.pow(2, semis / 12);
    this.tone(f * 0.75, 0.09, 'sine', 0.2, { slideTo: f * 1.5 });
    this.tone(f * 1.5, 0.05, 'triangle', 0.05, { when: this.ctx.currentTime + 0.02, slideTo: f * 1.1 });
    this.noiseBurst(0.04, 0.07, 'bandpass', Math.min(9000, f * 3), { q: 5 });
  }

  hit(): void {
    if (!this.ctx || !this.gate('hit', 0.04)) return;
    // Squelch: a soft wet thud.
    this.tone(240 + Math.random() * 80, 0.07, 'sine', 0.1, { slideTo: 110 });
    this.noiseBurst(0.07, 0.16, 'lowpass', 2600, { sweepTo: 500 });
  }

  /** A piece fusing into a heavier one once the ball is full. */
  fuse(): void {
    if (!this.ctx || !this.gate('fuse', 0.06)) return;
    // Gurgle as swarmlings merge into a bigger one.
    this.tone(260, 0.16, 'sine', 0.14, { slideTo: 520 });
    this.tone(180, 0.12, 'triangle', 0.08, { when: this.ctx.currentTime + 0.05, slideTo: 120 });
    this.noiseBurst(0.1, 0.06, 'bandpass', 900, { q: 4 });
  }

  clank(): void {
    if (!this.ctx || !this.gate('clank', 0.08)) return;
    // Chitter: three quick clicks.
    for (let i = 0; i < 3; i++) this.noiseBurst(0.018, 0.12, 'bandpass', 3200 + i * 500, { when: this.ctx.currentTime + i * 0.035, q: 8 });
  }

  pop(big = false): void {
    if (!this.ctx || !this.gate('pop', 0.035)) return;
    // Splat: a colonist falls and is infected.
    this.tone(big ? 220 : 380 + Math.random() * 120, big ? 0.24 : 0.12, 'sine', 0.12, { slideTo: big ? 60 : 120 });
    this.noiseBurst(big ? 0.28 : 0.11, big ? 0.3 : 0.18, 'lowpass', big ? 1400 : 2400, { sweepTo: 300 });
  }

  boom(): void {
    if (!this.ctx || !this.gate('boom', 0.07)) return;
    this.tone(140, 0.3, 'sine', 0.3, { slideTo: 40 });
    this.noiseBurst(0.35, 0.35, 'lowpass', 1800, { sweepTo: 200 });
  }

  pulse(): void {
    if (!this.ctx) return;
    this.tone(130, 0.45, 'sine', 0.55, { slideTo: 38 });
    this.tone(65, 0.4, 'triangle', 0.3, { slideTo: 30 });
    this.noiseBurst(0.3, 0.14, 'highpass', 3000, { sweepTo: 7000 });
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(0.02, 0.15, 'bandpass', 4000 + Math.random() * 3000, { when: this.ctx.currentTime + 0.03 + i * 0.045, q: 6 });
    }
  }

  levelUp(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(NOTE(3 + s), 0.22, 'square', 0.07, { when: t + i * 0.06 }));
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(NOTE(15 + s), 0.18, 'triangle', 0.05, { when: t + i * 0.06 }));
  }

  pick(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(NOTE(10), 0.1, 'square', 0.07, { when: t });
    this.tone(NOTE(17), 0.18, 'square', 0.07, { when: t + 0.07 });
  }

  hurt(): void {
    if (!this.ctx) return;
    this.noiseBurst(0.35, 0.45, 'bandpass', 2400, { sweepTo: 500, q: 2 });
    this.tone(180, 0.25, 'sawtooth', 0.12, { slideTo: 60 });
  }

  heartbeat(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(70, 0.12, 'sine', 0.5, { when: t, slideTo: 45 });
    this.tone(64, 0.12, 'sine', 0.35, { when: t + 0.18, slideTo: 42 });
  }

  /** A short bright chime when a rare card shows up. */
  rare(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [12, 19, 24].forEach((s, i) => this.tone(NOTE(3 + s), 0.35, 'triangle', 0.08, { when: t + i * 0.07 }));
    this.tone(NOTE(39), 0.5, 'sine', 0.04, { when: t + 0.2 });
  }

  fireball(): void {
    if (!this.ctx || !this.gate('fireball', 0.05)) return;
    this.noiseBurst(0.18, 0.18, 'bandpass', 900, { sweepTo: 2400, q: 1.2 });
    this.tone(260, 0.12, 'sawtooth', 0.04, { slideTo: 520 });
  }

  zap(): void {
    if (!this.ctx || !this.gate('zap', 0.08)) return;
    for (let i = 0; i < 4; i++) this.noiseBurst(0.03, 0.2, 'bandpass', 3000 + Math.random() * 4000, { when: this.ctx.currentTime + i * 0.03, q: 8 });
    this.tone(1200, 0.15, 'square', 0.04, { slideTo: 300 });
  }

  shotgun(): void {
    if (!this.ctx) return;
    this.noiseBurst(0.2, 0.4, 'lowpass', 2500, { sweepTo: 400 });
    this.tone(160, 0.15, 'square', 0.1, { slideTo: 60 });
  }

  /** Music gets heavier as the robots get angrier. */
  setIntensity(level: number): void {
    this.intensity = level;
  }

  heartLost(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(NOTE(-2), 0.18, 'square', 0.1, { when: t });
    this.tone(NOTE(-9), 0.3, 'square', 0.1, { when: t + 0.12 });
  }

  thunk(): void {
    if (!this.ctx) return;
    this.tone(110, 0.25, 'sine', 0.6, { slideTo: 45 });
    this.noiseBurst(0.12, 0.3, 'lowpass', 900);
  }

  shot(): void {
    if (!this.ctx || !this.gate('shot', 0.05)) return;
    this.tone(900, 0.12, 'square', 0.04, { slideTo: 300 });
  }

  coin(): void {
    if (!this.ctx || !this.gate('coin', 0.05)) return;
    const t = this.ctx.currentTime;
    this.tone(NOTE(14), 0.07, 'square', 0.05, { when: t });
    this.tone(NOTE(19), 0.14, 'square', 0.05, { when: t + 0.06 });
  }

  click(): void {
    if (!this.ctx) return;
    this.tone(700, 0.05, 'square', 0.05, { slideTo: 500 });
  }

  alarm(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.tone(NOTE(2), 0.28, 'sawtooth', 0.08, { when: t + i * 0.55 });
      this.tone(NOTE(-3), 0.25, 'sawtooth', 0.08, { when: t + i * 0.55 + 0.28 });
    }
  }

  crush(): void {
    if (!this.ctx) return;
    this.tone(90, 0.4, 'sawtooth', 0.2, { slideTo: 35 });
    this.noiseBurst(0.4, 0.4, 'lowpass', 1200, { sweepTo: 150 });
  }

  victory(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => this.tone(NOTE(3 + s), 0.3, 'square', 0.07, { when: t + i * 0.11 }));
  }

  // ---------- Music: a tiny 16-step chiptune sequencer ----------

  music(track: Track): void {
    if (track === 'main' || track === 'menu') this.intensity = 0;
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    if (!this.ctx) return;
    if (track) this.startSequencer();
    else this.stopSequencer();
  }

  private startSequencer(): void {
    if (this.timer !== null || !this.ctx) return;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private stopSequencer(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.ctx || !this.track) return;
    // Suspended context (tab hidden): don't pile up notes.
    if (this.ctx.state !== 'running') {
      this.nextStepTime = this.ctx.currentTime + 0.05;
      return;
    }
    const bpm = this.track === 'boss' ? 140 : 120 + this.intensity * 5;
    const stepDur = 60 / bpm / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += stepDur;
    }
  }

  private playStep(step: number, t: number): void {
    const bus = this.musicBus;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // The hive hum: a low, slowly beating drone under every track.
    if (s === 0) {
      this.tone(55, 2.2, 'sine', 0.07, { when: t, bus, attack: 0.5 });
      this.tone(55 * 1.505, 2.2, 'sine', 0.025, { when: t, bus, attack: 0.6 });
    }
    if (this.track === 'boss') {
      const roots = [-17, -17, -15, -20]; // E, E, F#, C#-ish: heavy minor riff
      const root = roots[bar];
      if (s % 4 === 0) this.kick(t, 0.9);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 1) this.hat(t, 0.05);
      const riff = [0, 0, 12, 0, 0, 10, 0, 7, 0, 0, 12, 0, 3, 0, 5, 7];
      this.tone(NOTE(root + riff[s] - 12), 0.13, 'sawtooth', 0.09, { when: t, bus });
      if (s % 8 === 0) this.tone(NOTE(root + 24), 0.5, 'square', 0.03, { when: t, bus });
      return;
    }
    const chords = [
      [0, 3, 7],
      [-4, 0, 3],
      [3, 7, 10],
      [-2, 2, 5],
    ]; // Am F C G
    const chord = chords[bar];
    const rootNote = chord[0] - 24;
    const menu = this.track === 'menu';
    if (s === 0 || s === 8 || (!menu && (s === 10 || s === 3))) this.kick(t, menu ? 0.5 : 0.8);
    if (!menu && (s === 4 || s === 12)) this.snare(t);
    if (s % 2 === 0 || (!menu && this.intensity >= 2)) this.hat(t, menu ? 0.025 : 0.04);
    if (!menu && this.intensity >= 3 && (s === 6 || s === 14)) this.kick(t, 0.6);
    if (!menu && this.intensity >= 4 && s % 4 === 2) this.tone(NOTE(chord[0] + 12), 0.08, 'sawtooth', 0.02, { when: t, bus: this.musicBus });
    const bassSteps = [0, 3, 6, 8, 10, 14];
    if (bassSteps.includes(s)) {
      const octave = s === 6 || s === 14 ? 12 : 0;
      this.tone(NOTE(rootNote + octave), 0.16, 'triangle', 0.22, { when: t, bus });
      this.tone(NOTE(rootNote + octave), 0.12, 'square', 0.03, { when: t, bus });
    }
    if (!menu || bar % 2 === 1) {
      const arp = chord[s % 3] + (s % 6 < 3 ? 0 : 12);
      if (s % 2 === 0 || bar === 3) this.tone(NOTE(arp), 0.1, 'square', menu ? 0.02 : 0.028, { when: t, bus });
    }
  }

  private kick(t: number, gain: number): void {
    this.tone(150, 0.16, 'sine', gain * 0.6, { when: t, slideTo: 42, bus: this.musicBus });
  }

  private snare(t: number): void {
    this.noiseBurst(0.12, 0.2, 'bandpass', 1800, { when: t, q: 0.7, bus: this.musicBus });
    this.tone(220, 0.06, 'triangle', 0.08, { when: t, bus: this.musicBus });
  }

  private hat(t: number, gain: number): void {
    this.noiseBurst(0.03, gain * 2, 'highpass', 7000, { when: t, bus: this.musicBus });
  }
}

export const Audio = new AudioManagerImpl();
