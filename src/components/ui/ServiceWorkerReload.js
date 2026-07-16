'use client';

import { useEffect } from 'react';

// Cada deploy nuevo publica un service worker distinto. next-pwa ya lo
// activa de inmediato (skipWaiting/clientsClaim), pero una pestaña que
// quedó abierta desde ANTES del deploy sigue corriendo el JavaScript viejo,
// que referencia archivos de esa build anterior — ya borrados del servidor
// en cuanto se publica la build nueva. Resultado: "This page couldn't
// load" al navegar. En cuanto el navegador nos avisa que el service worker
// que controla la pestaña cambió, recargamos una sola vez para que la
// pestaña quede con el HTML/JS de la build actual.
export default function ServiceWorkerReload() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let reloaded = false;
    function handleControllerChange() {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
