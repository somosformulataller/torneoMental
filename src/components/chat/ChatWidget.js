'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  sendChatMessageAction,
  markChatReadPlayerAction,
} from '@/actions/chat';
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
  const listRef = useRef(null);
  const openRef = useRef(false);

  useEffect(() => { openRef.current = open; }, [open]);

  const loadMessages = useCallback(async (convId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender, body, created_at')
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

  async function send(text) {
    const body = (text ?? input).trim();
    if (!body || sending) return;
    setSending(true);
    setInput('');
    const res = await sendChatMessageAction(body);
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
    } else {
      setInput(body); // devolver el texto si falló
    }
    setSending(false);
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
                {m.body}
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
