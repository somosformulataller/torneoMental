'use client';

import { useSyncExternalStore } from 'react';
import { isSfxMuted, subscribeSfxMuted, toggleSfxMuted, playClick } from '@/lib/sfx';
import styles from './soundToggle.module.css';

function getServerMuted() {
  return false;
}

export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeSfxMuted, isSfxMuted, getServerMuted);

  function handleClick() {
    const nowMuted = toggleSfxMuted();
    if (!nowMuted) playClick();
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={handleClick}
      aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
      aria-pressed={muted}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
