'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adminReplyChatAction, markChatReadAdminAction } from '@/actions/chat';
import Spinner from '@/components/ui/Spinner';
import styles from './chat.module.css';

export default function AdminChatPage() {
  const supabase = createClient();
  const [tab, setTab] = useState('chats'); // 'chats' | 'quick'
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null); // objeto de la conversación
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeConv?.conversation_id || null; }, [activeConv]);

  // Preguntas rápidas
  const [quick, setQuick] = useState([]);
  const [newQuick, setNewQuick] = useState('');

  const loadConversations = useCallback(async () => {
    const { data } = await supabase.rpc('chat_admin_conversations');
    setConversations(data || []);
    setLoading(false);
  }, [supabase]);

  const loadQuick = useCallback(async () => {
    const { data } = await supabase
      .from('chat_quick_questions')
      .select('*')
      .order('sort_order', { ascending: true });
    setQuick(data || []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConversations();
    loadQuick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: cualquier mensaje nuevo refresca la lista y, si es de la
  // conversación abierta, lo agrega al hilo.
  useEffect(() => {
    const channel = supabase
      .channel(`chat_admin_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        const msg = payload.new;
        loadConversations();
        if (msg.conversation_id === activeIdRef.current) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender === 'player') markChatReadAdminAction(msg.conversation_id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function loadMessages(convId) {
    const { data } = await supabase
      .from('chat_messages')
      .select('id, sender, body, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function openConversation(conv) {
    setActiveConv(conv);
    await loadMessages(conv.conversation_id);
    await markChatReadAdminAction(conv.conversation_id);
    setConversations((prev) => prev.map((c) =>
      c.conversation_id === conv.conversation_id ? { ...c, unread: 0 } : c
    ));
  }

  async function handleReply(e) {
    e.preventDefault();
    const body = reply.trim();
    if (!body || sending || !activeConv) return;
    setSending(true);
    setReply('');
    const res = await adminReplyChatAction(activeConv.conversation_id, body);
    if (!res?.error) {
      await loadMessages(activeConv.conversation_id);
      loadConversations();
    } else {
      setReply(body);
      alert('Error: ' + res.error);
    }
    setSending(false);
  }

  // ---- CRUD preguntas rápidas ----
  async function addQuick() {
    const text = newQuick.trim();
    if (!text) return;
    const nextOrder = quick.length ? Math.max(...quick.map((q) => q.sort_order)) + 1 : 1;
    const { error } = await supabase.from('chat_quick_questions').insert({ text, sort_order: nextOrder });
    if (error) { alert('Error: ' + error.message); return; }
    setNewQuick('');
    loadQuick();
  }
  async function updateQuickText(id, text) {
    await supabase.from('chat_quick_questions').update({ text }).eq('id', id);
  }
  async function toggleQuickActive(q) {
    await supabase.from('chat_quick_questions').update({ active: !q.active }).eq('id', q.id);
    loadQuick();
  }
  async function deleteQuick(id) {
    if (!window.confirm('¿Eliminar esta pregunta rápida?')) return;
    await supabase.from('chat_quick_questions').delete().eq('id', id);
    loadQuick();
  }
  async function moveQuick(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= quick.length) return;
    const a = quick[index];
    const b = quick[target];
    await Promise.all([
      supabase.from('chat_quick_questions').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('chat_quick_questions').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    loadQuick();
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Chat de atención al cliente</h1>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'chats' ? styles.tabActive : ''}`} onClick={() => setTab('chats')}>
            Conversaciones
          </button>
          <button className={`${styles.tab} ${tab === 'quick' ? styles.tabActive : ''}`} onClick={() => setTab('quick')}>
            Preguntas rápidas
          </button>
        </div>
      </div>

      {tab === 'chats' ? (
        <div className={styles.chatLayout}>
          {/* Lista de conversaciones */}
          <div className={styles.convList}>
            {loading ? (
              <div className={styles.loading}><Spinner /></div>
            ) : conversations.length === 0 ? (
              <div className={styles.emptyList}>Aún no hay conversaciones.</div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.conversation_id}
                  className={`${styles.convItem} ${activeConv?.conversation_id === c.conversation_id ? styles.convActive : ''}`}
                  onClick={() => openConversation(c)}
                >
                  <div className={styles.convTop}>
                    <span className={styles.convName}>{c.nombre} {c.apellido}</span>
                    {c.unread > 0 && <span className={styles.convBadge}>{c.unread}</span>}
                  </div>
                  <div className={styles.convPreview}>
                    {c.last_sender === 'support' ? 'Tú: ' : ''}{c.last_body || '—'}
                  </div>
                  <div className={styles.convTime}>{fmtTime(c.last_message_at)}</div>
                </button>
              ))
            )}
          </div>

          {/* Conversación activa */}
          <div className={styles.thread}>
            {!activeConv ? (
              <div className={styles.threadEmpty}>Selecciona una conversación para ver los mensajes.</div>
            ) : (
              <>
                <div className={styles.threadHeader}>
                  <div>
                    <div className={styles.threadName}>{activeConv.nombre} {activeConv.apellido}</div>
                    <div className={styles.threadEmail}>{activeConv.email}</div>
                  </div>
                </div>
                <div className={styles.threadMessages} ref={listRef}>
                  {messages.map((m) => (
                    <div key={m.id} className={`${styles.bubble} ${m.sender === 'support' ? styles.mine : styles.theirs}`}>
                      <div>{m.body}</div>
                      <div className={styles.bubbleTime}>{fmtTime(m.created_at)}</div>
                    </div>
                  ))}
                </div>
                <form className={styles.replyRow} onSubmit={handleReply}>
                  <input
                    className={styles.replyInput}
                    type="text"
                    placeholder="Escribe tu respuesta…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    maxLength={2000}
                  />
                  <button className={styles.replyBtn} type="submit" disabled={sending || !reply.trim()}>
                    Enviar
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Editor de preguntas rápidas */
        <div className={styles.quickPanel}>
          <p className={styles.quickHelp}>
            Estas son las preguntas que el jugador puede tocar para enviar rápido desde el chat.
            Las inactivas no se le muestran.
          </p>
          <div className={styles.quickAdd}>
            <input
              className={styles.quickAddInput}
              type="text"
              placeholder="Nueva pregunta rápida…"
              value={newQuick}
              onChange={(e) => setNewQuick(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addQuick(); }}
              maxLength={200}
            />
            <button className={styles.quickAddBtn} onClick={addQuick} disabled={!newQuick.trim()}>+ Agregar</button>
          </div>
          <div className={styles.quickItems}>
            {quick.length === 0 && <div className={styles.emptyList}>No hay preguntas rápidas.</div>}
            {quick.map((q, i) => (
              <div key={q.id} className={`${styles.quickItem} ${!q.active ? styles.quickInactive : ''}`}>
                <div className={styles.quickOrder}>
                  <button onClick={() => moveQuick(i, -1)} disabled={i === 0} aria-label="Subir">▲</button>
                  <button onClick={() => moveQuick(i, 1)} disabled={i === quick.length - 1} aria-label="Bajar">▼</button>
                </div>
                <input
                  className={styles.quickText}
                  defaultValue={q.text}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== q.text) updateQuickText(q.id, e.target.value.trim()); }}
                  maxLength={200}
                />
                <button className={styles.quickToggle} onClick={() => toggleQuickActive(q)}>
                  {q.active ? 'Activa' : 'Inactiva'}
                </button>
                <button className={styles.quickDel} onClick={() => deleteQuick(q.id)} aria-label="Eliminar">🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
