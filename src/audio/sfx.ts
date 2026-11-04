import Phaser from 'phaser';

// Placeholder sound effects synthesised with Web Audio, so the game has audio
// feedback before real SFX files exist. Shares Phaser's AudioContext, which
// Phaser unlocks on the first tap/click (browsers block audio before that).
// Pitch varies ±8% per play so repeats don't sound identical (GDD).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
let charge: { osc: OscillatorNode; gain: GainNode } | null = null;
let lastDrill = 0;

const MUTE_KEY = 'crater-clash:muted';

export function initSfx(sound: Phaser.Sound.BaseSoundManager): void {
  if (ctx || !(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  ctx = sound.context;
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    // storage blocked: default to sound on
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(v: boolean): void {
  muted = v;
  if (v) stopCharge();
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

function ready(): AudioContext | null {
  if (!ctx || !master || muted) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const vary = () => 1 + (Math.random() * 2 - 1) * 0.08;

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A tone gliding from f0 to f1, with a quick attack and exponential decay. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + delay;
  const v = vary();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0 * v, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * v), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master!);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Filtered noise burst: the body of explosions and impacts. */
function burst(dur: number, vol: number, fromHz: number, toHz: number): void {
  const c = ready();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.playbackRate.value = vary();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(fromHz, t);
  f.frequency.exponentialRampToValueAtTime(toHz, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone('triangle', 900, 700, 0.05, 0.15),
  turn: () => {
    tone('triangle', 660, 660, 0.12, 0.2);
    tone('triangle', 990, 990, 0.18, 0.2, 0.1);
  },
  fire: (heavy = false) => {
    tone('sine', heavy ? 110 : 160, 50, heavy ? 0.3 : 0.22, 0.6);
    burst(0.12, 0.35, 3000, 400);
  },
  split: () => tone('square', 700, 1200, 0.08, 0.12),
  bounce: () => tone('triangle', 300, 520, 0.09, 0.22),
  zap: () => tone('sawtooth', 1400, 500, 0.18, 0.12),
  drill: () => {
    const now = performance.now();
    if (now - lastDrill < 90) return; // the drill carves every few frames; don't stack sounds
    lastDrill = now;
    tone('sawtooth', 220, 180, 0.06, 0.06);
  },
  explode: (big: boolean) => {
    burst(big ? 0.9 : 0.55, big ? 1 : 0.7, big ? 1800 : 1400, 120);
    tone('sine', big ? 90 : 120, 35, big ? 0.6 : 0.4, big ? 0.7 : 0.5);
  },
  hurt: () => tone('square', 520, 260, 0.14, 0.1),
  ko: () => [784, 659, 523, 392].forEach((f, i) => tone('triangle', f, f, 0.18, 0.22, i * 0.12)),
  powerUp: () => [523, 659, 784].forEach((f, i) => tone('triangle', f, f * 1.02, 0.12, 0.16, i * 0.07)),
  thud: () => burst(0.3, 0.6, 600, 80),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.16, 0.25, i * 0.13)),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f, i === 3 ? 0.5 : 0.18, 0.2, i * 0.16)),
};

/** Rising whine while charging power (0..100). */
export function setCharge(power: number): void {
  const c = ready();
  if (!c) return;
  if (!charge) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    gain.gain.value = 0.05;
    osc.connect(gain).connect(master!);
    osc.start();
    charge = { osc, gain };
  }
  charge.osc.frequency.setTargetAtTime(200 + power * 6, c.currentTime, 0.03);
}

export function stopCharge(): void {
  if (!charge || !ctx) return;
  const { osc, gain } = charge;
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
  osc.stop(ctx.currentTime + 0.1);
  charge = null;
}
