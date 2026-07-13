'use client';

import styles from './spinner.module.css';

export default function Spinner({ size = 40 }) {
  return (
    <div
      className={styles.spinner}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 13)) }}
    />
  );
}
