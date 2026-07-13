'use client';

import { useState, useEffect } from 'react';
import styles from './countdown.module.css';

export default function CountdownTimer({ endTime, label, onComplete }) {
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    isDanger: false,
    isOver: false,
  });

  useEffect(() => {
    if (!endTime) return;

    const targetDate = new Date(endTime).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance <= 0) {
        clearInterval(interval);
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isDanger: true, isOver: true });
        if (onComplete) onComplete();
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      const isDanger = distance <= 60000; // Último minuto en rojo

      setTimeLeft({ hours, minutes, seconds, isDanger, isOver: false });
    }, 100); // 100ms update for smooth feeling

    return () => clearInterval(interval);
  }, [endTime, onComplete]);

  if (timeLeft.isOver) {
    return (
      <div className={styles.container}>
        {label && <span className={styles.label}>{label}</span>}
        <div className={`${styles.timer} ${styles.danger}`}>00:00:00</div>
      </div>
    );
  }

  const format = (num) => num.toString().padStart(2, '0');

  return (
    <div className={styles.container}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={`${styles.timer} ${timeLeft.isDanger ? styles.danger : ''}`}>
        {format(timeLeft.hours)}:{format(timeLeft.minutes)}:{format(timeLeft.seconds)}
      </div>
    </div>
  );
}
