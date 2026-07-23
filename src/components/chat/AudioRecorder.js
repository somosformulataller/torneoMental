'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './audioRecorder.module.css';

// Elige un formato de audio que el navegador sepa grabar (opus en Chrome/Firefox,
// mp4 en Safari/iOS). '' = usar el del navegador por defecto.
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  for (const c of cands) {
    try { if (MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return '';
}

const MAX_SECONDS = 120; // tope de 2 minutos por nota de voz

// Botón de micrófono para grabar una nota de voz. Al soltar (parar), entrega el
// audio como File a onRecorded. Se oculta solo si el dispositivo no soporta
// grabación (ej. navegadores viejos). Lo usan tanto el chat del jugador como el
// del administrador.
export default function AudioRecorder({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [supported, setSupported] = useState(true);
  const mrRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined'
      && typeof MediaRecorder !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(ok);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stopTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function stop() {
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
  }

  function cancel() {
    cancelRef.current = true;
    stop();
  }

  async function start() {
    if (disabled || recording) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('No pudimos usar el micrófono. Revisa que le hayas dado permiso.');
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    chunksRef.current = [];
    cancelRef.current = false;

    let mr;
    try {
      mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      mr = new MediaRecorder(stream);
    }
    mrRef.current = mr;

    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      stopTracks();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const type = mr.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      setRecording(false);
      setSecs(0);
      if (!cancelRef.current && blob.size > 0) {
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type });
        onRecorded(file);
      }
    };

    mr.start();
    setRecording(true);
    setSecs(0);
    timerRef.current = setInterval(() => {
      setSecs((s) => {
        const n = s + 1;
        if (n >= MAX_SECONDS) setTimeout(() => stop(), 0); // corta solo a los 2 min
        return n;
      });
    }, 1000);
  }

  if (!supported) return null;

  const mmss = `${String(Math.floor(secs / 60)).padStart(1, '0')}:${String(secs % 60).padStart(2, '0')}`;

  if (recording) {
    return (
      <div className={styles.recording}>
        <button type="button" className={styles.cancelBtn} onClick={cancel} title="Descartar" aria-label="Descartar grabación">✕</button>
        <span className={styles.dot} />
        <span className={styles.timer}>{mmss}</span>
        <button type="button" className={styles.sendBtn} onClick={stop} title="Enviar nota de voz" aria-label="Enviar nota de voz">➤</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.micBtn}
      onClick={start}
      disabled={disabled}
      title="Grabar nota de voz"
      aria-label="Grabar nota de voz"
    >
      🎤
    </button>
  );
}
