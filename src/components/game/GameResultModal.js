'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import styles from './gameResultModal.module.css';

function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function GameResultModal({
  isOpen,
  pairsMatched,
  totalPairs,
  timeMs,
  onPlayAgain,
  onGoBack,
  ticketsRemaining,
  reason,
}) {
  const completed = reason === 'completed';

  useEffect(() => {
    if (isOpen && completed) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#00f5ff', '#39ff14', '#ffd700'],
      });
    }
  }, [isOpen, completed]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onGoBack}
      title={completed ? '¡Tablero completado!' : '¡Tiempo agotado!'}
    >
      <div className={styles.body}>
        <div className={styles.streakSection}>
          <span className={styles.streakLabel}>Pares encontrados</span>
          <span className={`${styles.streakValue} ${completed ? styles.greenGlow : styles.redGlow}`}>
            {pairsMatched}/{totalPairs}
          </span>
        </div>

        <p className={styles.pairsInfo}>Tiempo: {formatTime(timeMs)}</p>

        <p className={styles.rankingNote}>
          Tu resultado quedó registrado en el ranking del torneo.
        </p>

        {ticketsRemaining > 0 ? (
          <Button variant="accent" fullWidth onClick={onPlayAgain} className={styles.actionBtn}>
            Jugar de nuevo (tienes {ticketsRemaining})
          </Button>
        ) : (
          <p className={styles.noTickets}>
            No te quedan tickets. ¡Compra más para seguir jugando!
          </p>
        )}

        <Button variant="ghost" fullWidth onClick={onGoBack}>
          Volver
        </Button>
      </div>
    </Modal>
  );
}
