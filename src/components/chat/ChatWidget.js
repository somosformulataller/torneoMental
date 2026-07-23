'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  sendChatMessageAction,
  markChatReadPlayerAction,
} from '@/actions/chat';
import { uploadChatAttachment, validateChatFile, validateChatAudio } from '@/lib/chatUpload';
import ChatAttachment from './ChatAttachment';
import AudioRecorder from './AudioRecorder';
import styles from './chatWidget.module.css';

// Chat flotante del jugador (esquina inferior derecha). Permite escribir a
// atención al cliente, enviar preguntas rápidas y recibir respuestas en vivo.
// Una campana roja sobre el ícono avisa cuántas respuestas hay sin leer.
export default function ChatWidget() {
  const supabase = createClient();
  const pathname = usePathname();
  const [userId, setUserId] = useState(null);
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [quickQuestions, setQuickQuestions] = useState([]);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  const loadMessages = useCallback(async (convId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender, body, created_at, attachment_path, attachment_name, attachment_type')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- carga inicial ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive || !user) return;
      setUserId(user.id);

      const { data: conv } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (conv) {
        setConversationId(conv.id);
        loadMessages(conv.id);
      }

      const { data: qq } = await supabase
        .from('chat_quick_questions')
        .select('id, text')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (alive && qq) setQuickQuestions(qq);

      const { data: u } = await supabase.rpc('chat_player_unread');
      if (alive && typeof u === 'number') setUnread(u);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMessages]);

  // ---- realtime: mensajes nuevos de la conversación ----
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat_player_${conversationId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        if (msg.sender === 'support') {
          if (openRef.current) {
            markChatReadPlayerAction();
          } else {
            setUnread((n) => n + 1);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ---- si el admin INICIA la conversación (el jugador aún no tenía una) ----
  // Captamos su creación en vivo para engancharnos a ella y encender la campana
  // con el primer mensaje de soporte.
  useEffect(() => {
    if (!userId || conversationId) return;
    const channel = supabase
      .channel(`chat_player_newconv_${userId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_conversations',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setConversationId(payload.new.id);
        if (openRef.current) {
          loadMessages(payload.new.id);
          markChatReadPlayerAction();
        } else {
          supabase.rpc('chat_player_unread').then(({ data }) => {
            if (typeof data === 'number') setUnread(data);
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, conversationId]);

  // ---- autoscroll al final cuando entran mensajes o se abre ----
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleOpen() {
    setOpen(true);
    if (unread > 0) {
      setUnread(0);
      await markChatReadPlayerAction();
    }
  }

  async function send(text, attachment = null) {
    const body = (text ?? input).trim();
    if ((!body && !attachment) || sending) return;
    setSending(true);
    if (!attachment) setInput('');
    const res = await sendChatMessageAction(body, attachment);
    if (!res?.error) {
      if (conversationId) {
        loadMessages(conversationId);
      } else {
        // primera vez: la RPC creó la conversación, la buscamos para suscribirnos
        const { data: { user } } = await supabase.auth.getUser();
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (conv) {
          setConversationId(conv.id);
          loadMessages(conv.id);
        }
      }
    } else if (!attachment) {
      setInput(body); // devolver el texto si falló
    }
    setSending(false);
    return res;
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateChatFile(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      const att = await uploadChatAttachment(supabase, userId, file);
      await send('', att);
    } catch (er) {
      alert('No se pudo subir el archivo: ' + er.message);
    } finally {
      setUploading(false);
    }
  }

  // Nota de voz grabada en el widget → se sube como adjunto y se envía.
  async function handleAudio(file) {
    const err = validateChatAudio(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      const att = await uploadChatAttachment(supabase, userId, file);
      await send('', att);
    } catch (er) {
      alert('No se pudo enviar la nota de voz: ' + er.message);
    } finally {
      setUploading(false);
    }
  }

  if (!userId || pathname === '/jugar') return null;

  const onHome = pathname === '/home';

  return (
    <>
      {!open && (
        <button className={`${styles.fab} ${onHome ? styles.fabHome : ''}`} onClick={handleOpen} aria-label="Abrir chat de ayuda">
          <span className={styles.fabIcon}>💬</span>
          {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div>
              <div className={styles.title}>Atención al cliente</div>
              <div className={styles.subtitle}>Escríbenos tu duda 👋</div>
            </div>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Cerrar chat">✕</button>
          </div>

          <div className={styles.messages} ref={listRef}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                ¡Hola! ¿En qué te ayudamos? Puedes tocar una pregunta rápida o escribirnos.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.bubble} ${m.sender === 'player' ? styles.mine : styles.theirs}`}
              >
                {m.attachment_path && (
                  <ChatAttachment path={m.attachment_path} name={m.attachment_name} type={m.attachment_type} />
                )}
                {m.body && <div>{m.body}</div>}
              </div>
            ))}
          </div>

          {quickQuestions.length > 0 && (
            <div className={styles.quickRow}>
              {quickQuestions.map((q) => (
                <button
                  key={q.id}
                  className={styles.quickChip}
                  disabled={sending}
                  onClick={() => send(q.text)}
                >
                  {q.text}
                </button>
              ))}
            </div>
          )}

          <form
            className={styles.inputRow}
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={handleFile}
            />
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => fileRef.current?.click()}
              disabled={uploading || sending}
              aria-label="Adjuntar archivo"
              title="Adjuntar imagen o PDF"
            >
              {uploading ? '…' : '📎'}
            </button>
            <AudioRecorder onRecorded={handleAudio} disabled={uploading || sending} />
            <input
              className={styles.input}
              type="text"
              placeholder="Escribe tu mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
            />
            <button className={styles.sendBtn} type="submit" disabled={sending || !input.trim()}>
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
