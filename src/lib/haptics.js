'use client';

function canVibrate() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrateMatch() {
  if (canVibrate()) navigator.vibrate(40);
}

export function vibrateMismatch() {
  // Fallo: patrón suave. El motor solo enciende/apaga (no regula fuerza), así
  // que para que se sienta MÁS suave usamos pulsos cortos (toquecitos) con
  // pausas más largas, manteniendo la misma duración total (~1.5s) que antes.
  if (canVibrate()) navigator.vibrate([60, 150, 60, 150, 80, 500, 60, 150, 60, 150, 80]);
}

export function vibrateVictory() {
  if (canVibrate()) navigator.vibrate([60, 40, 60, 40, 120]);
}
