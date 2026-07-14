'use client';

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrateMatch() {
  if (canVibrate()) navigator.vibrate(40);
}

export function vibrateMismatch() {
  if (canVibrate()) navigator.vibrate([30, 40, 30]);
}

export function vibrateVictory() {
  if (canVibrate()) navigator.vibrate([60, 40, 60, 40, 120]);
}
