'use client';

import styles from './button.module.css';

export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  loadingText,
  disabled = false,
  children,
  className = '',
  ...props
}) {
  return (
    <button
      className={`${styles.btn} ${styles[variant] || ''} ${size === 'sm' ? styles.sm : ''} ${fullWidth ? styles.fullWidth : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (loadingText || 'Procesando...') : children}
    </button>
  );
}
