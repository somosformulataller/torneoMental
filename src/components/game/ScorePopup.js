'use client';

import { AnimatePresence, motion } from 'motion/react';
import styles from './scorePopup.module.css';

export default function ScorePopup({ popup }) {
  return (
    <AnimatePresence>
      {popup && (
        <motion.div
          key={popup.id}
          className={`${styles.popup} ${popup.variant === 'miss' ? styles.miss : ''}`}
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: -60, scale: 1 }}
          exit={{ opacity: 0, y: -100, scale: 0.9 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          {popup.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
