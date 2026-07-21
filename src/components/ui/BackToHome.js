'use client';

import { useRouter } from 'next/navigation';
import { HomeIcon } from '@/components/layout/NavIcons';
import styles from './backToHome.module.css';

// Botón para regresar al Inicio. Reemplaza al menú inferior (ya eliminado) en
// las pantallas de juego, ranking y billetera.
//   floating: fijo en la esquina superior izquierda (pantalla de juego /
//   ranking, que no tienen una barra de título a la izquierda).
//   sin floating: en línea, para meterlo dentro de un encabezado.
export default function BackToHome({ floating = false, label = 'Inicio' }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`${styles.back} ${floating ? styles.floating : ''}`}
      onClick={() => router.push('/home')}
      aria-label="Volver al inicio"
    >
      <HomeIcon className={styles.icon} />
      {!floating && <span className={styles.label}>{label}</span>}
    </button>
  );
}
