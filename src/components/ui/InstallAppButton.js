'use client';

import { useState, useSyncExternalStore } from 'react';
import { getInstallState, subscribeInstallState, promptInstall, isIos } from '@/lib/installPrompt';
import Button from './Button';
import styles from './installAppButton.module.css';

function getServerState() {
  return { canInstall: false, isInstalled: false };
}

export default function InstallAppButton({ className = '' }) {
  const { canInstall, isInstalled } = useSyncExternalStore(subscribeInstallState, getInstallState, getServerState);
  const [showIosHint, setShowIosHint] = useState(false);
  const ios = isIos();

  if (isInstalled || (!canInstall && !ios)) return null;

  async function handleClick() {
    if (canInstall) {
      await promptInstall();
      return;
    }
    setShowIosHint(true);
  }

  return (
    <div className={`${styles.wrap} ${className}`}>
      <Button variant="ghost" fullWidth onClick={handleClick}>
        📲 Instalar la app
      </Button>
      {showIosHint && (
        <p className={styles.iosHint}>
          En iPhone/iPad: toca el botón compartir de Safari y elige &quot;Agregar a pantalla de inicio&quot;.
        </p>
      )}
    </div>
  );
}
