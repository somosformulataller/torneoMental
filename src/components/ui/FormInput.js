'use client';

import { useState } from 'react';
import styles from './formInput.module.css';

export default function FormInput({ id, label, type = 'text', className = '', ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;

  return (
    <div className={`${styles.inputGroup} ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className={styles.wrapper}>
        <input id={id} type={inputType} className={styles.input} {...props} />
        {isPassword && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {show ? '🙈' : '👁️'}
          </button>
        )}
      </div>
    </div>
  );
}
