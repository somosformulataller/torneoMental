'use client';

import { useRef } from 'react';
import AudioRecorder from '@/components/chat/AudioRecorder';
import styles from './chatComposeFields.module.css';

// Campos reutilizables para redactarle algo al jugador que se enviará a su chat:
// nota escrita + nota de voz + foto/documento. Es controlado (el padre guarda el
// estado). Se usa al aprobar un pago, al pagar un retiro y como acción suelta.
export default function ChatComposeFields({ text, setText, audio, setAudio, doc, setDoc, disabled }) {
  const fileRef = useRef(null);

  function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ok = (f.type || '').startsWith('image/') || f.type === 'application/pdf';
    if (!ok) { alert('Solo se permiten imágenes o PDF.'); return; }
    if (f.size > 5 * 1024 * 1024) { alert('El archivo supera los 5 MB.'); return; }
    setDoc(f);
  }

  return (
    <div className={styles.wrap}>
      <textarea
        className={styles.textarea}
        rows={3}
        placeholder="Escríbele una nota al jugador (opcional)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        maxLength={2000}
      />
      <div className={styles.row}>
        <AudioRecorder onRecorded={setAudio} disabled={disabled} />
        <button type="button" className={styles.attachBtn} onClick={() => fileRef.current?.click()} disabled={disabled}>
          📎 Foto / PDF
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
      </div>
      {audio && (
        <div className={styles.chip}>
          🎤 Nota de voz lista
          <button type="button" onClick={() => setAudio(null)} disabled={disabled} aria-label="Quitar nota de voz">✕</button>
        </div>
      )}
      {doc && (
        <div className={styles.chip}>
          📎 {doc.name}
          <button type="button" onClick={() => setDoc(null)} disabled={disabled} aria-label="Quitar archivo">✕</button>
        </div>
      )}
    </div>
  );
}
