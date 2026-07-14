'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { playVictory } from '@/lib/sfx';
import { vibrateVictory } from '@/lib/haptics';
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
  maxStreak = 0,
}) {
  const completed = reason === 'completed';

  useEffect(() => {
    if (!isOpen || !completed) return;

    playVictory();
    vibrateVictory();

    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#00f5ff', '#39ff14', '#ffd700'],
    });

    // Escalate the celebration for hot streaks.
    if (maxStreak >= 5) {
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#ffd700', '#d869ff'],
        });
      }, 250);
    }
    if (maxStreak >= 8) {
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ffd700'] });
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ffd700'] });
      }, 500);
    }
  }, [isOpen, completed, maxStreak]);

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
        {maxStreak >= 2 && (
          <p className={styles.pairsInfo}>Racha máxima: 🔥{maxStreak}</p>
        )}

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
