'use client';

// Módulo singleton (fuera de React) para capturar el evento
// beforeinstallprompt apenas el navegador lo dispare, sin importar en qué
// página esté montado el botón — así funciona igual si el usuario entra
// primero a /login o a /registro.

let deferredPrompt = null;
let installed = false;
let snapshot = { canInstall: false, isInstalled: false };
const listeners = new Set();

function updateSnapshot() {
  const next = { canInstall: !!deferredPrompt, isInstalled: installed };
  if (next.canInstall !== snapshot.canInstall || next.isInstalled !== snapshot.isInstalled) {
    snapshot = next;
    listeners.forEach((fn) => fn());
  }
}

if (typeof window !== 'undefined') {
  if (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone) {
    installed = true;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateSnapshot();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    updateSnapshot();
  });
}

export function getInstallState() {
  return snapshot;
}

export function subscribeInstallState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return null;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  updateSnapshot();
  return choice;
}

export function isIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}
