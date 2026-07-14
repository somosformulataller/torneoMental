'use client';

const STORAGE_KEY = 'tm_sfx_muted';
const listeners = new Set();

let audioCtx = null;
let muted = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'true';

function getContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone({ freq, duration = 0.15, type = 'sine', gain = 0.18, delay = 0 }) {
  if (muted) return;
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delay;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** 8-bit style flip blip. */
export function playFlip() {
  tone({ freq: 420, duration: 0.08, type: 'triangle', gain: 0.12 });
}

/** Rising two-note "ding" on a correct match. */
export function playMatch() {
  tone({ freq: 660, duration: 0.12, type: 'sine', gain: 0.18 });
  tone({ freq: 880, duration: 0.16, type: 'sine', gain: 0.16, delay: 0.08 });
}

/** Low buzz on a failed match. */
export function playMismatch() {
  tone({ freq: 180, duration: 0.2, type: 'sawtooth', gain: 0.14 });
}

/** Short four-note victory arpeggio. */
export function playVictory() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    tone({ freq, duration: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.12 });
  });
}

/** Neutral UI click/tap. */
export function playClick() {
  tone({ freq: 300, duration: 0.05, type: 'square', gain: 0.08 });
}

/** Countdown warning tick. */
export function playTick() {
  tone({ freq: 900, duration: 0.05, type: 'square', gain: 0.1 });
}

export function isSfxMuted() {
  return muted;
}

export function setSfxMuted(next) {
  muted = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }
  listeners.forEach((fn) => fn(muted));
}

export function toggleSfxMuted() {
  setSfxMuted(!muted);
  return muted;
}

export function subscribeSfxMuted(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
