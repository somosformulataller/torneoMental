'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './modal.module.css';

export default function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal directo a <body>: si el modal se renderizara anidado dentro del
  // árbol de la página, quedaría atrapado en el contexto de apilamiento de
  // algún ancestro con z-index bajo (ej. .container de home), perdiendo
  // frente al navbar inferior (z-index:100) sin importar el z-index propio
  // del modal.
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
