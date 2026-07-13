'use client';

import { motion } from 'motion/react';
import styles from './authCard.module.css';

export default function AuthCard({ icon, title, subtitle, children, maxWidth = 420 }) {
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.card}
        style={{ maxWidth }}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      >
        <div className={styles.logoContainer}>
          <span className={styles.logoIcon}>{icon}</span>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
