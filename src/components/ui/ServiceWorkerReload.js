'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Ruta de la pantalla de juego. Mientras el jugador está aquí, una recarga
// automática le borraría el tablero (o, en torneo, provocaría el "flash" de
// reinicio de partida), así que se difiere hasta que salga.
const GAME_PATH = '/jugar';

// Cada deploy nuevo publica un service worker distinto. next-pwa ya lo
// activa de inmediato (skipWaiting/clientsClaim), pero una pestaña que
// quedó abierta desde ANTES del deploy sigue corriendo el JavaScript viejo,
// que referencia archivos de esa build anterior — ya borrados del servidor
// en cuanto se publica la build nueva. Resultado: "This page couldn't
// load" al navegar. En cuanto el navegador nos avisa que el service worker
// que controla la pestaña cambió, recargamos una sola vez para que la
// pestaña quede con el HTML/JS de la build actual.
export default function ServiceWorkerReload() {
  const pathname = usePathname();
  // El listener del service worker se registra UNA sola vez, pero necesita
  // leer la ruta actual cada vez que dispara — de ahí el ref espejo.
  const pathRef = useRef(pathname);
  const pendingReloadRef = useRef(false);

  useEffect(() => {
    pathRef.current = pathname;
    // Si quedó una recarga en espera porque el jugador estaba en una partida,
    // se ejecuta apenas sale de la pantalla de juego (momento seguro).
    if (pendingReloadRef.current && pathname !== GAME_PATH) {
      pendingReloadRef.current = false;
      window.location.reload();
    }
  }, [pathname]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // OJO: controllerchange también dispara cuando el SW recién instalado
    // toma control de una pestaña que NO estaba controlada (primera visita,
    // o justo después de limpiar datos). Ese caso NO amerita recarga — este
    // documento ya vino fresco de la red — y recargar ahí produce un flash
    // visible y se come el primer click del usuario. Solo recargamos cuando
    // un SW nuevo REEMPLAZA a uno que ya controlaba la pestaña (= deploy
    // nuevo con la app abierta, el caso del "This page couldn't load").
    let hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    function handleControllerChange() {
      if (!hadController) {
        hadController = true;
        return;
      }
      if (reloaded) return;
      // Nunca recargar en medio de una partida: se perdería el tablero. Se
      // marca como pendiente y el efecto de arriba la ejecuta cuando el
      // jugador salga de /jugar.
      if (pathRef.current === GAME_PATH) {
        pendingReloadRef.current = true;
        return;
      }
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
