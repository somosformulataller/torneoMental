'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { logScreenView } from '@/lib/activity';

// Registra una "visita de pantalla" cada vez que el jugador cambia de ruta
// dentro de la app. Se monta una sola vez en el layout del jugador. No pinta
// nada. La deduplicación evita registrar dos veces la misma pantalla seguida
// (p. ej. por el doble-montaje de React en desarrollo).
export default function ActivityTracker() {
  const pathname = usePathname();
  const lastLogged = useRef(null);

  useEffect(() => {
    if (!pathname) return;
    if (lastLogged.current === pathname) return;
    lastLogged.current = pathname;
    logScreenView(pathname);
  }, [pathname]);

  return null;
}
