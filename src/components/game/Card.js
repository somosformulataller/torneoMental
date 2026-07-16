'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import Image from 'next/image';
import { CARD_BACKS } from '@/lib/cardThemes';
import styles from './card.module.css';

const NO_SCATTER = { rotate: 0, x: 0, y: 0 };

export default function Card({ card, index = 0, isFlipped, isMatched, onClick, disabled, scatter = NO_SCATTER }) {
  const [imageError, setImageError] = useState(false);
  const [backImageError, setBackImageError] = useState(false);
  const sceneRef = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50, active: false });

  const canTilt = !disabled && !isFlipped && !isMatched;

  function handlePointerMove(e) {
    if (!canTilt || !sceneRef.current) return;
    const rect = sceneRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - py) * 18,
      ry: (px - 0.5) * 18,
      mx: px * 100,
      my: py * 100,
      active: true,
    });
  }

  function handlePointerLeave() {
    setTilt((t) => ({ ...t, rx: 0, ry: 0, active: false }));
  }

  const handleClick = () => {
    if (disabled || isFlipped || isMatched) return;
    onClick();
  };

  return (
    <motion.div
      className={styles.entrance}
      initial={{ opacity: 0, y: 24, x: 0, scale: 0.85, rotate: 0 }}
      animate={{ opacity: 1, y: scatter.y, x: scatter.x, scale: 1, rotate: scatter.rotate }}
      transition={{ delay: Math.min(index, 20) * 0.035, type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div
        ref={sceneRef}
        className={`${styles.scene} ${tilt.active ? styles.lifted : ''}`}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${tilt.active ? 1.04 : 1})`,
          transition: tilt.active ? 'none' : 'transform 0.5s var(--ease-spring)',
        }}
      >
        <motion.div
          className={`${styles.card} ${isMatched ? styles.matched : ''} ${disabled && !isFlipped ? styles.disabled : ''}`}
          animate={{ rotateY: isFlipped || isMatched ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          {/* Card Back (face down) */}
          <div className={styles.cardFace + ' ' + styles.cardBack}>
            {backImageError ? (
              <div className={styles.cardBackDesign}>
                <span className={styles.cardBackLogo}>TM</span>
                <div className={styles.cardBackPattern}></div>
              </div>
            ) : (
              <Image
                src={CARD_BACKS[card.theme] || CARD_BACKS.tecnologia}
                alt="Reverso"
                width={400}
                height={400}
                className={styles.cardArt}
                loading="lazy"
                onError={() => setBackImageError(true)}
              />
            )}
          </div>

          {/* Card Front (face up - shows the image) */}
          <div className={styles.cardFace + ' ' + styles.cardFront}>
            {imageError ? (
              <div className={styles.cardImagePlaceholder}>
                <span>{card.name?.charAt(0)}</span>
                <span className={styles.cardName}>{card.name}</span>
              </div>
            ) : (
              <Image
                src={card.image}
                alt={card.name}
                width={400}
                height={400}
                className={styles.cardArt}
                loading="lazy"
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </motion.div>

        {canTilt && (
          <div
            className={styles.glare}
            style={{
              opacity: tilt.active ? 1 : 0,
              background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.35), transparent 55%)`,
            }}
          />
        )}
      </div>
    </motion.div>
  );
}
