'use client';

import styles from './card.module.css';

export default function Card({ card, isFlipped, isMatched, onClick, disabled }) {
  const handleClick = () => {
    if (disabled || isFlipped || isMatched) return;
    onClick();
  };

  return (
    <div className={styles.scene} onClick={handleClick}>
      <div
        className={`
          ${styles.card}
          ${isFlipped ? styles.flipped : ''}
          ${isMatched ? styles.matched : ''}
          ${disabled && !isFlipped ? styles.disabled : ''}
        `}
      >
        {/* Card Back (face down) */}
        <div className={styles.cardFace + ' ' + styles.cardBack}>
          <div className={styles.cardBackDesign}>
            <span className={styles.cardBackLogo}>TM</span>
            <div className={styles.cardBackPattern}></div>
          </div>
        </div>

        {/* Card Front (face up - shows the image) */}
        <div className={styles.cardFace + ' ' + styles.cardFront}>
          <img
            src={card.image}
            alt={card.name}
            className={styles.cardImage}
            loading="lazy"
          />
          <span className={styles.cardName}>{card.name}</span>
        </div>
      </div>
    </div>
  );
}
