'use client';

import { useState } from 'react';
import styles from './card.module.css';

export default function Card({ card, isFlipped, isMatched, onClick, disabled }) {
  const [imageError, setImageError] = useState(false);

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
          {imageError ? (
            <div className={styles.cardImagePlaceholder}>{card.name?.charAt(0)}</div>
          ) : (
            <img
              src={card.image}
              alt={card.name}
              className={styles.cardImage}
              loading="lazy"
              onError={() => setImageError(true)}
            />
          )}
          <span className={styles.cardName}>{card.name}</span>
        </div>
      </div>
    </div>
  );
}
