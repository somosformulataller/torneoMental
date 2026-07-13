'use client';

import styles from './badge.module.css';

export default function Badge({ color = '#7a7a9e', size = 'md', children }) {
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
