'use client';

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrateMatch() {
  if (canVibrate()) navigator.vibrate(40);
}

export function vibrateMismatch() {
  if (canVibrate()) navigator.vibrate([80, 60, 80, 60, 120]);
}

export function vibrateVictory() {
  if (canVibrate()) navigator.vibrate([60, 40, 60, 40, 120]);
}
