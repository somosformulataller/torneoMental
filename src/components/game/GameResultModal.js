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
  onViewRanking,
  ticketsRemaining,
  reason,
  maxStreak = 0,
  isPractice = false,
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
      colors: ['#A78BFA', '#34D399', '#FBBF24'],
    });

    // Escalate the celebration for hot streaks.
    if (maxStreak >= 5) {
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 100,
          origin: { y: 0.5 },
          colors: ['#FBBF24', '#A78BFA'],
        });
      }, 250);
    }
    if (maxStreak >= 8) {
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#FBBF24'] });
        confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FBBF24'] });
      }, 500);
    }
  }, [isOpen, completed, maxStreak]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onGoBack}
      title={completed ? '¡Excelente jugada!' : '¡Se acabó el tiempo!'}
    >
      <div className={styles.body}>
        <div className={styles.timeSection}>
          <span className={styles.timeLabel}>Tu tiempo</span>
          <span className={styles.timeValue}>{formatTime(timeMs)}</span>
        </div>

        {isPractice ? (
          <>
            <Button variant="accent" fullWidth onClick={onPlayAgain} className={styles.actionBtn}>
              Practicar de nuevo
            </Button>
            <Button variant="ghost" fullWidth onClick={onGoBack}>
              Volver a home
            </Button>
          </>
        ) : ticketsRemaining > 0 ? (
          <>
            <Button variant="accent" fullWidth onClick={onPlayAgain} className={styles.actionBtn}>
              Jugar de nuevo
            </Button>
            <Button variant="ghost" fullWidth onClick={onViewRanking}>
              Ver ranking
            </Button>
          </>
        ) : (
          <Button variant="accent" fullWidth onClick={onGoBack} className={styles.actionBtn}>
            Comprar tickets
          </Button>
        )}
      </div>
    </Modal>
  );
}
