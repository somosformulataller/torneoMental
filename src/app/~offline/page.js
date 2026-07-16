'use client';

import styles from './offline.module.css';

// Workbox sirve esta página como respaldo cuando una navegación falla y no
// hay nada útil en caché (ver `fallbacks.document` en next.config.mjs) — en
// vez del error crudo del navegador ("This page couldn't load"), el
// jugador ve un mensaje propio con un botón para reintentar.
export default function OfflinePage() {
  return (
    <div className={styles.container}>
      <div className={styles.icon}>📡</div>
      <h1 className={styles.title}>No se pudo cargar esta pantalla</h1>
      <p className={styles.text}>
        Puede ser tu conexión, o que la app se acaba de actualizar. Intenta de nuevo.
      </p>
      <button className={styles.button} onClick={() => window.location.reload()}>
        Reintentar
      </button>
    </div>
  );
}
