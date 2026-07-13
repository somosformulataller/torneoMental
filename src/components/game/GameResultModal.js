'use client';

import styles from './gameResultModal.module.css';

export default function GameResultModal({
  isOpen,
  streak,
  totalPairs,
  onPlayAgain,
  onGoBack,
  ticketsRemaining,
  gameStatus,
}) {
  if (!isOpen) return null;

  const isWin = gameStatus === 'won';

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={isWin ? styles.titleWin : styles.titleLose}>
          {isWin ? '¡Tiempo terminado!' : 'Perdiste'}
        </h2>

        <div className={styles.streakSection}>
          <span className={styles.streakLabel}>Racha final</span>
          <span className={`${styles.streakValue} ${isWin ? styles.greenGlow : styles.redGlow}`}>
            {streak}
          </span>
        </div>

        {totalPairs > 0 && (
          <p className={styles.pairsInfo}>
            Pares encontrados: {totalPairs}
          </p>
        )}

        <p className={styles.rankingNote}>
          Tu racha quedó registrada en el ranking de la sesión.
        </p>

        {ticketsRemaining > 0 ? (
          <button className={styles.playAgainBtn} onClick={onPlayAgain}>
            Jugar de nuevo (tienes {ticketsRemaining})
          </button>
        ) : (
          <p className={styles.noTickets}>
            No te quedan tickets. ¡Compra más para seguir jugando!
          </p>
        )}

        <button className={styles.backBtn} onClick={onGoBack}>
          Volver
        </button>
      </div>
    </div>
  );
}
