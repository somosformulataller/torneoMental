'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  adminReplyChatAction,
  markChatReadAdminAction,
  adminAdjustTicketsAction,
  adminStartConversationAction,
  adminSetChatStatusAction,
} from '@/actions/chat';
import { adminSetUserBlockedAction } from '@/actions/admin';
import { uploadChatAttachment, validateChatFile, validateChatAudio } from '@/lib/chatUpload';
import ChatAttachment from '@/components/chat/ChatAttachment';
import AudioRecorder from '@/components/chat/AudioRecorder';
import Spinner from '@/components/ui/Spinner';
import styles from './chat.module.css';

// Etiquetas/estado de una conversación (color por estado).
const STATUS_META = {
  pendiente: { label: 'Pendiente', color: '#FBBF24' },
  prioridad: { label: 'Prioridad', color: '#FB7185' },
  resuelto: { label: 'Resuelto', color: '#34D399' },
};
const STATUS_ORDER = ['pendiente', 'prioridad', 'resuelto'];

export default function AdminChatPage() {
  const supabase = createClient();
  const [tab, setTab] = useState('chats'); // 'chats' | 'quick'
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null); // objeto de la conversación
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [playerProfile, setPlayerProfile] = useState(null); // { id, tickets_balance, blocked }
  const [acting, setActing] = useState(false);
  // Filtro por etiqueta y buscador para iniciar chat con cualquier usuario.
  const [filter, setFilter] = useState('todos'); // 'todos' | 'pendiente' | 'prioridad' | 'resuelto'
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);
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
      .select('id, sender, body, created_at, attachment_path, attachment_name, attachment_type')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  async function loadPlayerProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, tickets_balance, blocked, role')
      .eq('id', userId)
      .single();
    setPlayerProfile(data || null);
  }

  async function openConversation(conv) {
    setActiveConv(conv);
    setPlayerProfile(null);
    await loadMessages(conv.conversation_id);
    loadPlayerProfile(conv.user_id);
    await markChatReadAdminAction(conv.conversation_id);
    setConversations((prev) => prev.map((c) =>
      c.conversation_id === conv.conversation_id ? { ...c, unread: 0 } : c
    ));
  }

  async function sendReply(body, attachment = null) {
    if (!activeConv) return { error: 'Sin conversación' };
    const res = await adminReplyChatAction(activeConv.conversation_id, body, attachment);
    if (!res?.error) {
      await loadMessages(activeConv.conversation_id);
      loadConversations();
    }
    return res;
  }

  async function handleReply(e) {
    e.preventDefault();
    const body = reply.trim();
    if (!body || sending || !activeConv) return;
    setSending(true);
    setReply('');
    const res = await sendReply(body);
    if (res?.error) { setReply(body); alert('Error: ' + res.error); }
    setSending(false);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeConv) return;
    const err = validateChatFile(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      // Se guarda en la carpeta del jugador de esta conversación.
      const att = await uploadChatAttachment(supabase, activeConv.user_id, file);
      const res = await sendReply('', att);
      if (res?.error) alert('Error: ' + res.error);
    } catch (er) {
      alert('No se pudo subir el archivo: ' + er.message);
    } finally {
      setUploading(false);
    }
  }

  // Nota de voz del admin → se sube a la carpeta del jugador de la conversación.
  async function handleAudioReply(file) {
    if (!activeConv) return;
    const err = validateChatAudio(file);
    if (err) { alert(err); return; }
    setUploading(true);
    try {
      const att = await uploadChatAttachment(supabase, activeConv.user_id, file);
      const res = await sendReply('', att);
      if (res?.error) alert('Error: ' + res.error);
    } catch (er) {
      alert('No se pudo enviar la nota de voz: ' + er.message);
    } finally {
      setUploading(false);
    }
  }

  // ---- etiqueta/estado de la conversación ----
  async function handleSetStatus(status) {
    if (!activeConv || activeConv.status === status) return;
    const convId = activeConv.conversation_id;
    // Optimista: se refleja al instante y se revierte si la RPC falla.
    setActiveConv((c) => (c ? { ...c, status } : c));
    setConversations((prev) => prev.map((c) => (c.conversation_id === convId ? { ...c, status } : c)));
    const { error } = await adminSetChatStatusAction(convId, status);
    if (error) { alert('Error: ' + error); loadConversations(); }
  }

  // ---- buscador de usuarios para iniciar una conversación ----
  async function handleUserSearch(term) {
    setUserSearch(term);
    // Se quitan caracteres que rompen la sintaxis del filtro .or() de PostgREST.
    const q = term.trim().replace(/[,()*]/g, ' ').trim();
    if (q.length < 2) { setUserResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido, email, cedula')
        .eq('role', 'player')
        .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,email.ilike.%${q}%,cedula.ilike.%${q}%`)
        .order('nombre', { ascending: true })
        .limit(15);
      setUserResults(data || []);
    } finally {
      setSearching(false);
    }
  }

  async function startConversationWith(prof) {
    const { conversationId, error } = await adminStartConversationAction(prof.id);
    if (error) { alert('Error: ' + error); return; }
    // Puede que ya existiera: si está en la lista, la abrimos; si no, armamos
    // el objeto y recargamos la lista para que aparezca.
    const existing = conversations.find((c) => c.conversation_id === conversationId);
    const conv = existing || {
      conversation_id: conversationId,
      user_id: prof.id,
      nombre: prof.nombre,
      apellido: prof.apellido,
      email: prof.email,
      last_message_at: new Date().toISOString(),
      last_body: null,
      last_sender: null,
      unread: 0,
      status: 'pendiente',
    };
    setShowNewChat(false);
    setUserSearch('');
    setUserResults([]);
    await openConversation(conv);
    loadConversations();
  }

  // ---- acciones sobre el jugador desde el chat ----
  async function handleAdjustTickets(sign) {
    if (!playerProfile) return;
    const raw = window.prompt(`¿Cuántos tickets quieres ${sign > 0 ? 'SUMAR' : 'RESTAR'}?`, '1');
    if (raw == null) return;
    const qty = parseInt(raw, 10);
    if (!Number.isInteger(qty) || qty <= 0) { alert('Escribe un número entero mayor a 0.'); return; }
    setActing(true);
    try {
      const { error, profile } = await adminAdjustTicketsAction(playerProfile.id, sign * qty);
      if (error) throw new Error(error);
      if (profile) setPlayerProfile((p) => ({ ...p, tickets_balance: profile.tickets_balance }));
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActing(false);
    }
  }

  async function handleToggleBlock() {
    if (!playerProfile) return;
    const next = !playerProfile.blocked;
    const who = activeConv ? `${activeConv.nombre} ${activeConv.apellido}` : 'este jugador';
    if (!window.confirm(next ? `¿Bloquear a ${who}?` : `¿Desbloquear a ${who}?`)) return;
    setActing(true);
    try {
      const { error } = await adminSetUserBlockedAction(playerProfile.id, next);
      if (error) throw new Error(error);
      setPlayerProfile((p) => ({ ...p, blocked: next }));
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setActing(false);
    }
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

  const filteredConversations = filter === 'todos'
    ? conversations
    : conversations.filter((c) => (c.status || 'pendiente') === filter);

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
          {/* Columna izquierda: filtros + buscador + lista */}
          <div className={styles.convCol}>
            <div className={styles.convToolbar}>
              <div className={styles.filterChips}>
                {['todos', ...STATUS_ORDER].map((f) => (
                  <button
                    key={f}
                    className={`${styles.filterChip} ${filter === f ? styles.filterChipActive : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'todos' ? 'Todos' : STATUS_META[f].label}
                  </button>
                ))}
              </div>
              <button className={styles.newChatBtn} onClick={() => setShowNewChat((v) => !v)}>
                {showNewChat ? '✕ Cerrar' : '＋ Nuevo chat'}
              </button>
            </div>

            {showNewChat && (
              <div className={styles.searchPanel}>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder="Buscar usuario por nombre, correo o cédula…"
                  value={userSearch}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  autoFocus
                />
                <div className={styles.searchResults}>
                  {searching && <div className={styles.searchHint}>Buscando…</div>}
                  {!searching && userSearch.trim().length >= 2 && userResults.length === 0 && (
                    <div className={styles.searchHint}>Sin resultados.</div>
                  )}
                  {!searching && userSearch.trim().length < 2 && (
                    <div className={styles.searchHint}>Escribe al menos 2 letras.</div>
                  )}
                  {userResults.map((u) => (
                    <button key={u.id} className={styles.searchItem} onClick={() => startConversationWith(u)}>
                      <span className={styles.searchName}>{u.nombre} {u.apellido}</span>
                      <span className={styles.searchMeta}>{u.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.convList}>
              {loading ? (
                <div className={styles.loading}><Spinner /></div>
              ) : filteredConversations.length === 0 ? (
                <div className={styles.emptyList}>
                  {conversations.length === 0 ? 'Aún no hay conversaciones.' : 'No hay chats con esta etiqueta.'}
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const st = STATUS_META[c.status] || STATUS_META.pendiente;
                  return (
                    <button
                      key={c.conversation_id}
                      className={`${styles.convItem} ${activeConv?.conversation_id === c.conversation_id ? styles.convActive : ''}`}
                      onClick={() => openConversation(c)}
                    >
                      <div className={styles.convTop}>
                        <span className={styles.convName}>{c.nombre} {c.apellido}</span>
                        <div className={styles.convTopRight}>
                          <span className={styles.statusTag} style={{ color: st.color, borderColor: `${st.color}66` }}>
                            {st.label}
                          </span>
                          {c.unread > 0 && <span className={styles.convBadge}>{c.unread}</span>}
                        </div>
                      </div>
                      <div className={styles.convPreview}>
                        {c.last_body
                          ? `${c.last_sender === 'support' ? 'Tú: ' : ''}${c.last_body}`
                          : (c.last_sender ? '📎 Adjunto' : 'Conversación nueva')}
                      </div>
                      <div className={styles.convTime}>{fmtTime(c.last_message_at)}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Conversación activa */}
          <div className={styles.thread}>
            {!activeConv ? (
              <div className={styles.threadEmpty}>Selecciona una conversación para ver los mensajes.</div>
            ) : (
              <>
                <div className={styles.threadHeader}>
                  <div>
                    <div className={styles.threadName}>
                      {activeConv.nombre} {activeConv.apellido}
                      {playerProfile?.blocked && <span className={styles.blockedTag}>Bloqueado</span>}
                    </div>
                    <div className={styles.threadEmail}>
                      {activeConv.email}
                      {playerProfile && <> · 🎫 {playerProfile.tickets_balance} tickets</>}
                    </div>
                    <div className={styles.statusRow}>
                      <span className={styles.statusRowLabel}>Etiqueta:</span>
                      {STATUS_ORDER.map((s) => {
                        const active = (activeConv.status || 'pendiente') === s;
                        const meta = STATUS_META[s];
                        return (
                          <button
                            key={s}
                            className={`${styles.statusChip} ${active ? styles.statusChipActive : ''}`}
                            style={active ? { background: `${meta.color}22`, borderColor: meta.color, color: meta.color } : undefined}
                            onClick={() => handleSetStatus(s)}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {playerProfile && playerProfile.role !== 'admin' && (
                    <div className={styles.threadActions}>
                      <button className={styles.actBtn} disabled={acting} onClick={() => handleAdjustTickets(1)}>＋ Tickets</button>
                      <button className={styles.actBtn} disabled={acting} onClick={() => handleAdjustTickets(-1)}>− Tickets</button>
                      <button
                        className={`${styles.actBtn} ${playerProfile.blocked ? styles.actUnblock : styles.actBlock}`}
                        disabled={acting}
                        onClick={handleToggleBlock}
                      >
                        {playerProfile.blocked ? '✓ Desbloquear' : '🚫 Bloquear'}
                      </button>
                    </div>
                  )}
                </div>
                <div className={styles.threadMessages} ref={listRef}>
                  {messages.map((m) => (
                    <div key={m.id} className={`${styles.bubble} ${m.sender === 'support' ? styles.mine : styles.theirs}`}>
                      {m.attachment_path && (
                        <ChatAttachment path={m.attachment_path} name={m.attachment_name} type={m.attachment_type} />
                      )}
                      {m.body && <div>{m.body}</div>}
                      <div className={styles.bubbleTime}>{fmtTime(m.created_at)}</div>
                    </div>
                  ))}
                </div>
                <form className={styles.replyRow} onSubmit={handleReply}>
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
                    title="Adjuntar imagen o PDF"
                  >
                    {uploading ? '…' : '📎'}
                  </button>
                  <AudioRecorder onRecorded={handleAudioReply} disabled={uploading || sending} />
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
