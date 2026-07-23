'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { signedChatUrl } from '@/lib/chatUpload';
import styles from './chatAttachment.module.css';

// Muestra un adjunto de un mensaje: imagen en miniatura (clic para ampliar) o
// un enlace de archivo. Pide una URL firmada temporal al bucket privado.
export default function ChatAttachment({ path, name, type }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    const sb = createClient();
    signedChatUrl(sb, path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);

  const isImage = (type || '').startsWith('image/');
  const isAudio = (type || '').startsWith('audio/');

  if (isAudio) {
    return url ? (
      <audio controls preload="metadata" src={url} className={styles.audio}>
        <a href={url} target="_blank" rel="noreferrer">🎤 nota de voz</a>
      </audio>
    ) : (
      <span className={styles.loading}>🎤 nota de voz…</span>
    );
  }

  if (isImage) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className={styles.imgLink}>
        <img src={url} alt={name || 'imagen'} className={styles.img} />
      </a>
    ) : (
      <span className={styles.loading}>🖼️ {name || 'imagen'}…</span>
    );
  }

  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className={styles.file}>
      📎 {name || 'archivo'}
    </a>
  ) : (
    <span className={styles.loading}>📎 {name || 'archivo'}…</span>
  );
}
