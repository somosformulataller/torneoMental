'use client';

import styles from './badge.module.css';

export default function Badge({ color = '#7686A0', size = 'md', children }) {
  return (
    <span
      className={`${styles.badge} ${size === 'sm' ? styles.sm : ''}`}
      style={{
        backgroundColor: `${color}1a`,
        color,
        borderColor: `${color}4d`,
      }}
    >
      {children}
    </span>
  );
}
