'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adminApproveTicketAction, adminRejectTicketAction } from '@/actions/tickets';
import { markWithdrawalPaidAction, cancelWithdrawalAction } from '@/actions/wallet';
import { adminSetUserBlockedAction } from '@/actions/admin';
import { adminAdjustTicketsAction } from '@/actions/chat';
import { PAYMENT_STATUSES } from '@/lib/constants';
import { compressImage } from '@/lib/image';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import RecargasModal from '@/components/admin/RecargasModal';
import CopyPayoutButton from '@/components/admin/CopyPayoutButton';
import ChatComposeFields from '@/components/admin/ChatComposeFields';
import { sendComposeToPlayer, composeHasContent } from '@/lib/adminChat';
import styles from './transacciones.module.css';

const REF_TYPE_FILTERS = [
  { key: 'todos', label: 'Todas' },
  { key: 'recibido', label: 'Recibidos (compras)' },
  { key: 'pagado', label: 'Pagados (retiros)' },
];

// Normaliza una referencia para comparar (ignora mayúsculas, espacios y signos):
// así "123-456", "123 456" y "123456" se detectan como la misma.
function normRef(ref) {
  return (ref || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const STATUS_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'validando', label: 'Validando' },
  { key: 'aprobado', label: 'Aprobados' },
  { key: 'rechazado', label: 'Rechazados' },
];

// Estado de premio/retiro de cada jugador (lado admin).
const RETIRO_STATUS = {
  quiere_retirar: { label: (r) => `Quiere retirar $${r.pendSum.toFixed(2)}`, color: '#A78BFA' },
  en_billetera: { label: () => 'En billetera aún sin retirar', color: '#FBBF24' },
  sin_saldo: { label: () => 'Sin saldo pendiente', color: '#7686A0' },
  sin_premio: { label: () => 'No ha ganado premio', color: '#7686A0' },
};

const RETIRO_FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'quiere_retirar', label: 'Quieren retirar' },
  { key: 'en_billetera', label: 'Con saldo' },
  { key: 'sin_premio', label: 'Sin premio' },
  { key: 'pagado', label: 'Pagados' },
];

export default function AdminTransaccionesPage() {
  const supabase = createClient();
  const [section, setSection] = useState('compras'); // compras | premiados

  // --- Compras de tickets ---
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pendiente');
  // Índice de TODAS las referencias (normalizadas) → para detectar repetidas.
  const [refIndex, setRefIndex] = useState({});
  const [viewingProof, setViewingProof] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // --- Jugadores premiados ---
  const [prizes, setPrizes] = useState([]);
  const [loadingPrizes, setLoadingPrizes] = useState(true);

  // --- Retiros / estado de premio por jugador ---
  const [players, setPlayers] = useState([]);
  const [paidWithdrawals, setPaidWithdrawals] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [retiroFilter, setRetiroFilter] = useState('todos');

  // --- Modal para pagar un retiro (referencia + comprobante) ---
  const [payModal, setPayModal] = useState(null); // { withdrawal }
  const [payRef, setPayRef] = useState('');
  const [payProofFile, setPayProofFile] = useState(null);
  const [payProofPreview, setPayProofPreview] = useState(null);

  // --- Buscador / historial de referencias ---
  const [references, setReferences] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [refSearch, setRefSearch] = useState('');
  const [refTypeFilter, setRefTypeFilter] = useState('todos');
  const [viewingWithdrawProof, setViewingWithdrawProof] = useState(null);

  // Historial de recargas (compras de tickets) de un usuario.
  const [recargasUser, setRecargasUser] = useState(null); // { id, name }

  // Redactar algo para el chat del jugador (nota / voz / foto). Compartido por
  // el modal de aprobar pago y el de "nota al jugador".
  const [composeText, setComposeText] = useState('');
  const [composeAudio, setComposeAudio] = useState(null);
  const [composeDoc, setComposeDoc] = useState(null);
  const [approveModal, setApproveModal] = useState(null); // { ticket }
  const [soloAprobar, setSoloAprobar] = useState(false);
  const [chatModal, setChatModal] = useState(null); // { userId, name } — nota suelta
  // Nota al jugador al pagar un retiro (se envía a su chat).
  const [payNote, setPayNote] = useState('');

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          profiles ( id, nombre, apellido, cedula, email, blocked ),
          tournaments ( nombre )
        `)
        .order('created_at', { ascending: false });

      // "Pendientes" ahora incluye también validando y rechazados, para revisar
      // en un solo lugar las solicitudes con problemas o anomalías.
      if (statusFilter === 'pendiente') {
        query = query.in('payment_status', ['pendiente', 'validando', 'rechazado']);
      } else if (statusFilter !== 'todos') {
        query = query.eq('payment_status', statusFilter);
      }

      // En paralelo, TODAS las referencias (livianas) para detectar repetidas.
      const [{ data, error }, { data: allRefs }] = await Promise.all([
        query,
        supabase
          .from('tickets')
          .select('id, payment_reference, payment_status, created_at, profiles ( nombre, apellido )'),
      ]);
      if (error) throw error;
      setTickets(data || []);

      const idx = {};
      (allRefs || []).forEach((r) => {
        const k = normRef(r.payment_reference);
        if (!k) return;
        (idx[k] = idx[k] || []).push({
          id: r.id,
          status: r.payment_status,
          created_at: r.created_at,
          name: `${r.profiles?.nombre || ''} ${r.profiles?.apellido || ''}`.trim() || '—',
        });
      });
      setRefIndex(idx);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoadingTickets(false);
    }
  }, [supabase, statusFilter]);

  const loadPrizes = useCallback(async () => {
    setLoadingPrizes(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select(`
          *,
          profiles ( id, nombre, apellido, cedula, email, blocked, payout_nombre, payout_banco, payout_cedula, payout_telefono, wallet_balance_usd ),
          tournaments ( nombre )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPrizes(data || []);
    } catch (err) {
      console.error('Error loading prizes:', err);
    } finally {
      setLoadingPrizes(false);
    }
  }, [supabase]);

  const loadRetiros = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const [{ data: profs }, { data: awards }, { data: pend }, { data: paid }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, nombre, apellido, email, blocked, payout_nombre, payout_banco, payout_cedula, payout_telefono, wallet_balance_usd'),
        supabase.from('wallet_transactions').select('user_id, amount_usd'),
        supabase.from('withdrawals').select('id, user_id, amount_usd, created_at').eq('status', 'solicitado').order('created_at', { ascending: true }),
        supabase
          .from('withdrawals')
          .select('id, user_id, amount_usd, created_at, paid_at, payment_reference, payment_proof_path, profiles ( nombre, apellido, email, payout_nombre, payout_banco, payout_cedula, payout_telefono )')
          .eq('status', 'pagado')
          .order('paid_at', { ascending: false }),
      ]);
      setPaidWithdrawals(paid || []);

      const wonByUser = {};
      (awards || []).forEach((a) => { wonByUser[a.user_id] = (wonByUser[a.user_id] || 0) + Number(a.amount_usd); });
      const pendByUser = {};
      (pend || []).forEach((w) => { (pendByUser[w.user_id] = pendByUser[w.user_id] || []).push(w); });

      const rows = (profs || []).map((p) => {
        const won = wonByUser[p.id] || 0;
        const pendList = pendByUser[p.id] || [];
        const pendSum = pendList.reduce((s, w) => s + Number(w.amount_usd), 0);
        const balance = Number(p.wallet_balance_usd || 0);
        let status;
        if (pendSum > 0) status = 'quiere_retirar';
        else if (balance > 0) status = 'en_billetera';
        else if (won > 0) status = 'sin_saldo';
        else status = 'sin_premio';
        return { ...p, won, balance, pendList, pendSum, status };
      });

      const order = { quiere_retirar: 0, en_billetera: 1, sin_saldo: 2, sin_premio: 3 };
      rows.sort((a, b) => order[a.status] - order[b.status] || b.pendSum - a.pendSum || b.balance - a.balance);
      setPlayers(rows);
    } catch (err) {
      console.error('Error loading retiros:', err);
    } finally {
      setLoadingPlayers(false);
    }
  }, [supabase]);

  // Historial/búsqueda de referencias: compras recibidas (tickets) + retiros
  // pagados a los jugadores. Se juntan en una sola lista ordenada por fecha.
  const loadReferences = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [{ data: tk }, { data: wd }] = await Promise.all([
        supabase
          .from('tickets')
          .select('id, payment_reference, amount_usd, amount_ves, created_at, payment_status, profiles ( nombre, apellido, email )')
          .not('payment_reference', 'is', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('withdrawals')
          .select('id, payment_reference, amount_usd, paid_at, profiles ( nombre, apellido, email )')
          .eq('status', 'pagado')
          .order('paid_at', { ascending: false }),
      ]);

      const recibidos = (tk || []).map((t) => ({
        id: `t_${t.id}`,
        type: 'recibido',
        ref: t.payment_reference,
        amount: Number(t.amount_usd),
        date: t.created_at,
        name: `${t.profiles?.nombre || ''} ${t.profiles?.apellido || ''}`.trim() || '—',
        email: t.profiles?.email || '',
        status: t.payment_status,
      }));
      const pagados = (wd || [])
        .filter((w) => w.payment_reference)
        .map((w) => ({
          id: `w_${w.id}`,
          type: 'pagado',
          ref: w.payment_reference,
          amount: Number(w.amount_usd),
          date: w.paid_at,
          name: `${w.profiles?.nombre || ''} ${w.profiles?.apellido || ''}`.trim() || '—',
          email: w.profiles?.email || '',
          status: 'pagado',
        }));
      const merged = [...recibidos, ...pagados].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setReferences(merged);
    } catch (err) {
      console.error('Error loading references:', err);
    } finally {
      setLoadingRefs(false);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (section === 'compras') loadTickets();
    else if (section === 'premiados') loadPrizes();
    else if (section === 'retiros') loadRetiros();
    else loadReferences();
  }, [section, loadTickets, loadPrizes, loadRetiros, loadReferences]);

  function resetCompose() {
    setComposeText('');
    setComposeAudio(null);
    setComposeDoc(null);
  }

  // Aprobar pago: abre un modal donde (opcional) se le manda al chat una nota,
  // nota de voz o foto/documento, o se marca "solo aprobar".
  function openApproveModal(ticket) {
    resetCompose();
    setSoloAprobar(false);
    setApproveModal({ ticket });
  }

  async function confirmApprove() {
    const ticket = approveModal?.ticket;
    if (!ticket) return;
    setProcessing(true);
    try {
      const compose = { text: composeText, audio: composeAudio, doc: composeDoc };
      if (!soloAprobar && composeHasContent(compose)) {
        await sendComposeToPlayer(supabase, ticket.user_id, compose);
      }
      const { error } = await adminApproveTicketAction(ticket.id);
      if (error) throw new Error(error);
      setApproveModal(null);
      resetCompose();
      await loadTickets();
    } catch (err) {
      alert('Error al aprobar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Nota al jugador (sin aprobar), en relación a su compra.
  function openChatModal(prof) {
    if (!prof?.id) return;
    resetCompose();
    setChatModal({ userId: prof.id, name: `${prof.nombre || ''} ${prof.apellido || ''}`.trim() || 'el jugador' });
  }

  async function confirmSendChat() {
    if (!chatModal) return;
    const compose = { text: composeText, audio: composeAudio, doc: composeDoc };
    if (!composeHasContent(compose)) { alert('Escribe una nota, graba un audio o adjunta un archivo.'); return; }
    setProcessing(true);
    try {
      await sendComposeToPlayer(supabase, chatModal.userId, compose);
      setChatModal(null);
      resetCompose();
    } catch (err) {
      alert('Error al enviar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      alert('Debe indicar un motivo de rechazo');
      return;
    }
    setProcessing(true);
    try {
      const { error } = await adminRejectTicketAction(selectedTicket.id, rejectReason);
      if (error) throw new Error(error);
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedTicket(null);
      await loadTickets();
    } catch (err) {
      alert('Error al rechazar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleViewProof(ticket) {
    setViewingProof(ticket.id);
    try {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(ticket.payment_proof_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert('No se pudo abrir el comprobante');
    } finally {
      setViewingProof(null);
    }
  }

  // Abrir el modal para pagar un retiro (pedir referencia + comprobante).
  function openPayModal(w, player) {
    if (payProofPreview) URL.revokeObjectURL(payProofPreview);
    const name = `${player?.nombre || ''} ${player?.apellido || ''}`.trim() || 'el jugador';
    setPayModal({ withdrawal: w, name });
    setPayRef('');
    setPayProofFile(null);
    setPayProofPreview(null);
    setPayNote('');
  }

  async function handlePayProofChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('El comprobante debe ser una imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede pesar más de 5 MB.'); return; }
    const compressed = await compressImage(file);
    if (payProofPreview) URL.revokeObjectURL(payProofPreview);
    setPayProofFile(compressed);
    setPayProofPreview(URL.createObjectURL(compressed));
  }

  function closePayModal() {
    if (payProofPreview) URL.revokeObjectURL(payProofPreview);
    setPayModal(null);
    setPayRef('');
    setPayProofFile(null);
    setPayProofPreview(null);
    setPayNote('');
  }

  async function handleConfirmPay() {
    const w = payModal?.withdrawal;
    if (!w) return;
    const ref = payRef.trim();
    if (!ref) { alert('Escribe el número de referencia del pago que hiciste.'); return; }
    setProcessing(true);
    try {
      let proofPath = null;
      if (payProofFile) {
        const safe = (payProofFile.name || 'comprobante.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
        const path = `${w.user_id}/${w.id}_${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage
          .from('withdrawal-proofs')
          .upload(path, payProofFile, { contentType: payProofFile.type, upsert: false });
        if (upErr) throw new Error('No se pudo subir el comprobante: ' + upErr.message);
        proofPath = path;
      }
      const { error } = await markWithdrawalPaidAction(w.id, ref, proofPath);
      if (error) throw new Error(error);
      // Nota opcional al jugador por su chat (avisándole del pago).
      const note = payNote.trim();
      if (note) {
        try { await sendComposeToPlayer(supabase, w.user_id, { text: note }); }
        catch (e) { alert('El retiro se marcó pagado, pero no se pudo enviar la nota al chat: ' + e.message); }
      }
      closePayModal();
      await loadRetiros();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleViewWithdrawalProof(w) {
    if (!w.payment_proof_path) return;
    setViewingWithdrawProof(w.id);
    try {
      const { data, error } = await supabase.storage
        .from('withdrawal-proofs')
        .createSignedUrl(w.payment_proof_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert('No se pudo abrir el comprobante');
    } finally {
      setViewingWithdrawProof(null);
    }
  }

  async function handleCancelWithdrawal(w) {
    if (!window.confirm(`¿Cancelar el retiro de $${Number(w.amount_usd).toFixed(2)}? El monto vuelve a la billetera del jugador.`)) return;
    setProcessing(true);
    try {
      const { error } = await cancelWithdrawalAction(w.id);
      if (error) throw new Error(error);
      await loadRetiros();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function handleToggleBlock(userId, blocked, name) {
    const next = !blocked;
    if (!window.confirm(
      next
        ? `¿Bloquear a ${name}? No podrá jugar, comprar tickets ni retirar hasta que lo desbloquees.`
        : `¿Desbloquear a ${name}?`
    )) return;
    setProcessing(true);
    try {
      const { error } = await adminSetUserBlockedAction(userId, next);
      if (error) throw new Error(error);
      if (section === 'compras') await loadTickets();
      else if (section === 'premiados') await loadPrizes();
      else await loadRetiros();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Suma (signo +1) o resta (-1) tickets a un jugador; pregunta la cantidad.
  async function handleAdjustTickets(userId, sign, name) {
    const raw = window.prompt(
      `¿Cuántos tickets quieres ${sign > 0 ? 'SUMAR a' : 'RESTAR a'} ${name}?`,
      '1'
    );
    if (raw == null) return;
    const qty = parseInt(raw, 10);
    if (!Number.isInteger(qty) || qty <= 0) { alert('Escribe un número entero mayor a 0.'); return; }
    setProcessing(true);
    try {
      const { error } = await adminAdjustTicketsAction(userId, sign * qty);
      if (error) throw new Error(error);
      if (section === 'compras') await loadTickets();
      else if (section === 'premiados') await loadPrizes();
      else await loadRetiros();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Botones +/- tickets para un jugador. `prof` debe traer id, nombre, apellido.
  function renderTicketAdjust(prof) {
    if (!prof?.id) return null;
    const name = `${prof.nombre || ''} ${prof.apellido || ''}`.trim() || 'el jugador';
    return (
      <>
        <Button variant="ghost" size="sm" disabled={processing} onClick={() => handleAdjustTickets(prof.id, 1, name)}>
          ＋ Tickets
        </Button>
        <Button variant="ghost" size="sm" disabled={processing} onClick={() => handleAdjustTickets(prof.id, -1, name)}>
          − Tickets
        </Button>
      </>
    );
  }

  // Botón para ver el historial de recargas (compras de tickets) de un jugador.
  function renderRecargasBtn(prof) {
    if (!prof?.id) return null;
    const name = `${prof.nombre || ''} ${prof.apellido || ''}`.trim() || 'el jugador';
    return (
      <Button variant="ghost" size="sm" onClick={() => setRecargasUser({ id: prof.id, name })}>
        🧾 Recargas
      </Button>
    );
  }

  // Botón de bloquear/desbloquear para un jugador (se reutiliza en los tres
  // bloques). `prof` debe traer id, nombre, apellido y blocked.
  function renderBlockBtn(prof) {
    if (!prof?.id) return null;
    const name = `${prof.nombre || ''} ${prof.apellido || ''}`.trim() || 'el jugador';
    return (
      <Button
        variant={prof.blocked ? 'success' : 'ghost'}
        size="sm"
        disabled={processing}
        onClick={() => handleToggleBlock(prof.id, prof.blocked, name)}
      >
        {prof.blocked ? '✓ Desbloquear' : '🚫 Bloquear'}
      </Button>
    );
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  // Detecta anomalías de una compra y arma su etiqueta + nota. Hoy detecta lo
  // que se puede saber de los datos: referencia repetida/reutilizada (posible
  // pago duplicado) y falta de comprobante. (Si la foto no concuerda con el
  // banco/referencia hay que revisarla a ojo: el sistema no lee la imagen.)
  function ticketAnomalies(t) {
    const list = [];
    const key = normRef(t.payment_reference);
    const others = (refIndex[key] || []).filter((o) => o.id !== t.id);
    if (key && others.length > 0) {
      const rejected = others.some((o) => o.status === 'rechazado');
      const parts = others
        .slice(0, 4)
        .map((o) => `${o.name} · ${PAYMENT_STATUSES[o.status]?.label || o.status} · ${formatDate(o.created_at)}`);
      list.push({
        label: 'Referencia repetida',
        color: '#FB7185',
        note: `Esta misma referencia ya aparece en ${others.length} solicitud(es) más${rejected ? ' (una ya fue rechazada)' : ''}: ${parts.join('  |  ')}${others.length > 4 ? '…' : ''}. Revisa si es un pago duplicado o una referencia reutilizada.`,
      });
    }
    if (!t.payment_proof_path) {
      list.push({
        label: 'Sin comprobante',
        color: '#FBBF24',
        note: 'El jugador no adjuntó foto del pago. Verifica la referencia y el monto directamente contra el banco.',
      });
    }
    return list;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Transacciones</h1>
      </div>

      <div className={styles.sectionTabs}>
        <button
          className={`${styles.sectionTab} ${section === 'compras' ? styles.sectionTabActive : ''}`}
          onClick={() => setSection('compras')}
        >
          🎫 Compra de tickets
        </button>
        <button
          className={`${styles.sectionTab} ${section === 'premiados' ? styles.sectionTabActive : ''}`}
          onClick={() => setSection('premiados')}
        >
          🏆 Jugadores premiados
        </button>
        <button
          className={`${styles.sectionTab} ${section === 'retiros' ? styles.sectionTabActive : ''}`}
          onClick={() => setSection('retiros')}
        >
          💸 Retiros
        </button>
        <button
          className={`${styles.sectionTab} ${section === 'referencias' ? styles.sectionTabActive : ''}`}
          onClick={() => setSection('referencias')}
        >
          🔎 Referencias
        </button>
      </div>

      {section === 'compras' ? (
        <>
          <div className={styles.filters}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`${styles.filterBtn} ${statusFilter === f.key ? styles.activeFilter : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className={styles.hint}>
            Puedes aprobar o rechazar manualmente cualquier solicitud, sin importar el
            resultado de la validación automática. Si el jugador adjuntó comprobante,
            verifica que la <strong>referencia</strong> y el <strong>monto</strong> coincidan
            con la imagen antes de aprobar.
            {statusFilter === 'pendiente' && (
              <> En <strong>Pendientes</strong> también aparecen los <strong>rechazados</strong> y las
              solicitudes con <strong>anomalías</strong> (referencia repetida o reutilizada, sin
              comprobante), marcadas con una etiqueta ⚠ y una nota explicando el caso.</>
            )}
          </p>

          {loadingTickets ? (
            <div className={styles.loading}><Spinner /></div>
          ) : tickets.length === 0 ? (
            <div className={styles.emptyState}>No hay solicitudes para mostrar</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Cédula</th>
                    <th>Referencia</th>
                    <th>Comprobante</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Origen</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td>{formatDate(t.created_at)}</td>
                      <td>
                        <div className={styles.userInfo}>
                          <span className={styles.userName}>{t.profiles?.nombre} {t.profiles?.apellido}</span>
                          <span className={styles.userEmail}>{t.profiles?.email}</span>
                          <div className={styles.blockBtnRow}>{renderRecargasBtn(t.profiles)}</div>
                        </div>
                      </td>
                      <td>{t.profiles?.cedula}</td>
                      <td>
                        <code className={styles.ref}>{t.payment_reference}</code>
                        {ticketAnomalies(t).map((a, i) => (
                          <div key={i} className={styles.anomaly}>
                            <span
                              className={styles.anomalyTag}
                              style={{ color: a.color, borderColor: `${a.color}66`, background: `${a.color}1f` }}
                            >
                              ⚠ {a.label}
                            </span>
                            <span className={styles.anomalyNote}>{a.note}</span>
                          </div>
                        ))}
                      </td>
                      <td>
                        {t.payment_proof_path ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewProof(t)}
                            disabled={viewingProof === t.id}
                            loading={viewingProof === t.id}
                          >
                            Ver
                          </Button>
                        ) : (
                          <span className={styles.userEmail}>—</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.amountInfo}>
                          <span className={styles.usd}>${Number(t.amount_usd).toFixed(2)}</span>
                          {t.amount_ves != null && (
                            <span className={styles.ves}>Bs. {Number(t.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                          <span className={styles.qty}>{t.quantity} tickets</span>
                        </div>
                      </td>
                      <td>
                        <Badge color={PAYMENT_STATUSES[t.payment_status]?.color}>
                          {PAYMENT_STATUSES[t.payment_status]?.label}
                        </Badge>
                        {t.payment_status === 'rechazado' && t.notes && (
                          <div className={styles.rejectNote}>Motivo: {t.notes}</div>
                        )}
                      </td>
                      <td>
                        {t.payment_status === 'aprobado' ? (
                          t.payment_verification_source === 'auto' ? (
                            <span className={styles.autoTag}>Automático</span>
                          ) : (
                            <span className={styles.manualTag}>Manual</span>
                          )
                        ) : (
                          <span className={styles.manualTag}>—</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {t.payment_status !== 'aprobado' && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => openApproveModal(t)}
                              disabled={processing}
                            >
                              ✓ Aprobar pago
                            </Button>
                          )}
                          {t.payment_status !== 'rechazado' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => { setSelectedTicket(t); setShowRejectModal(true); }}
                              disabled={processing}
                            >
                              ✕ Rechazar
                            </Button>
                          )}
                          {renderTicketAdjust(t.profiles)}
                          <Button variant="ghost" size="sm" disabled={processing} onClick={() => openChatModal(t.profiles)}>
                            💬 Nota
                          </Button>
                          {renderBlockBtn(t.profiles)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : section === 'premiados' ? (
        <>
          <p className={styles.hint}>
            Jugadores que quedaron en posiciones premiadas de torneos finalizados. Usa sus
            datos de Pago Móvil para pagarles el premio manualmente. Si un jugador no ha
            cargado sus datos, aparecerá marcado en naranja.
          </p>

          {loadingPrizes ? (
            <div className={styles.loading}><Spinner /></div>
          ) : prizes.length === 0 ? (
            <div className={styles.emptyState}>Aún no hay jugadores premiados</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Torneo</th>
                    <th>Posición</th>
                    <th>Premio</th>
                    <th>Jugador</th>
                    <th>Datos de Pago Móvil</th>
                  </tr>
                </thead>
                <tbody>
                  {prizes.map((p) => {
                    const prof = p.profiles;
                    const hasPayout = prof?.payout_nombre || prof?.payout_banco || prof?.payout_cedula || prof?.payout_telefono;
                    return (
                      <tr key={p.id}>
                        <td>{formatDate(p.created_at)}</td>
                        <td>{p.tournaments?.nombre || '—'}</td>
                        <td><Badge color="#FBBF24">{p.position}° lugar</Badge></td>
                        <td><span className={styles.prize}>${Number(p.amount_usd).toFixed(2)}</span></td>
                        <td>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{prof?.nombre} {prof?.apellido}</span>
                            <span className={styles.userEmail}>{prof?.email}</span>
                            <div className={styles.blockBtnRow}>{renderBlockBtn(prof)} {renderRecargasBtn(prof)}</div>
                          </div>
                        </td>
                        <td>
                          {hasPayout ? (
                            <div className={styles.payoutData}>
                              <span className={styles.payoutRow}>{prof.payout_nombre || '—'}</span>
                              <span className={styles.payoutRow}>{prof.payout_banco || '—'}</span>
                              <span className={styles.payoutRow}>
                                <span className={styles.payoutLabel}>C.I. </span>{prof.payout_cedula || '—'}
                              </span>
                              <span className={styles.payoutRow}>
                                <span className={styles.payoutLabel}>Tel. </span>{prof.payout_telefono || '—'}
                              </span>
                              <CopyPayoutButton data={prof} />
                            </div>
                          ) : (
                            <span className={styles.payoutMissing}>Sin datos cargados</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : section === 'retiros' ? (
        <>
          <div className={styles.filters}>
            {RETIRO_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`${styles.filterBtn} ${retiroFilter === f.key ? styles.activeFilter : ''}`}
                onClick={() => setRetiroFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className={styles.hint}>
            Estado de premio y retiro de cada jugador. Los que <strong>quieren retirar</strong>
            aparecen primero: paga por Pago Móvil a sus datos y luego marca el retiro como pagado.
          </p>

          {loadingPlayers ? (
            <div className={styles.loading}><Spinner /></div>
          ) : retiroFilter === 'pagado' ? (
            paidWithdrawals.length === 0 ? (
              <div className={styles.emptyState}>Aún no hay retiros pagados</div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Fecha de pago</th>
                      <th>Jugador</th>
                      <th>Monto pagado</th>
                      <th>Referencia</th>
                      <th>Comprobante</th>
                      <th>Datos de Pago Móvil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paidWithdrawals.map((w) => {
                      const prof = w.profiles;
                      const hasPayout = prof?.payout_nombre || prof?.payout_banco || prof?.payout_cedula || prof?.payout_telefono;
                      return (
                        <tr key={w.id}>
                          <td>{w.paid_at ? formatDate(w.paid_at) : '—'}</td>
                          <td>
                            <div className={styles.userInfo}>
                              <span className={styles.userName}>{prof?.nombre} {prof?.apellido}</span>
                              <span className={styles.userEmail}>{prof?.email}</span>
                            </div>
                          </td>
                          <td><span className={styles.prize}>${Number(w.amount_usd).toFixed(2)}</span></td>
                          <td>{w.payment_reference ? <code className={styles.ref}>{w.payment_reference}</code> : <span className={styles.userEmail}>—</span>}</td>
                          <td>
                            {w.payment_proof_path ? (
                              <Button variant="ghost" size="sm" disabled={viewingWithdrawProof === w.id} loading={viewingWithdrawProof === w.id} onClick={() => handleViewWithdrawalProof(w)}>
                                Ver
                              </Button>
                            ) : (
                              <span className={styles.userEmail}>—</span>
                            )}
                          </td>
                          <td>
                            {hasPayout ? (
                              <div className={styles.payoutData}>
                                <span className={styles.payoutRow}>{prof.payout_nombre || '—'}</span>
                                <span className={styles.payoutRow}>{prof.payout_banco || '—'}</span>
                                <span className={styles.payoutRow}>
                                  <span className={styles.payoutLabel}>C.I. </span>{prof.payout_cedula || '—'}
                                </span>
                                <span className={styles.payoutRow}>
                                  <span className={styles.payoutLabel}>Tel. </span>{prof.payout_telefono || '—'}
                                </span>
                                <CopyPayoutButton data={prof} />
                              </div>
                            ) : (
                              <span className={styles.payoutMissing}>Sin datos cargados</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (() => {
            const filtered = retiroFilter === 'todos'
              ? players
              : players.filter((p) => p.status === retiroFilter);
            if (filtered.length === 0) {
              return <div className={styles.emptyState}>No hay jugadores para mostrar</div>;
            }
            return (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      <th>Estado</th>
                      <th>Monto a retirar</th>
                      <th>Total en billetera</th>
                      <th>Datos de Pago Móvil</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const st = RETIRO_STATUS[p.status];
                      const hasPayout = p.payout_nombre || p.payout_banco || p.payout_cedula || p.payout_telefono;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className={styles.userInfo}>
                              <span className={styles.userName}>{p.nombre} {p.apellido}</span>
                              <span className={styles.userEmail}>{p.email}</span>
                              <div className={styles.blockBtnRow}>{renderBlockBtn(p)} {renderRecargasBtn(p)}</div>
                            </div>
                          </td>
                          <td><Badge color={st.color}>{st.label(p)}</Badge></td>
                          <td><span className={styles.usd}>${p.pendSum.toFixed(2)}</span></td>
                          <td><span className={styles.ves}>${(p.balance + p.pendSum).toFixed(2)}</span></td>
                          <td>
                            {hasPayout ? (
                              <div className={styles.payoutData}>
                                <span className={styles.payoutRow}>{p.payout_nombre || '—'}</span>
                                <span className={styles.payoutRow}>{p.payout_banco || '—'}</span>
                                <span className={styles.payoutRow}>
                                  <span className={styles.payoutLabel}>C.I. </span>{p.payout_cedula || '—'}
                                </span>
                                <span className={styles.payoutRow}>
                                  <span className={styles.payoutLabel}>Tel. </span>{p.payout_telefono || '—'}
                                </span>
                                <CopyPayoutButton data={p} />
                              </div>
                            ) : (
                              <span className={styles.payoutMissing}>Sin datos cargados</span>
                            )}
                          </td>
                          <td>
                            {p.pendList.length > 0 ? (
                              <div className={styles.actions} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                {p.pendList.map((w) => (
                                  <div key={w.id} className={styles.actions}>
                                    <Button variant="success" size="sm" disabled={processing} onClick={() => openPayModal(w, p)}>
                                      ✓ Pagar ${Number(w.amount_usd).toFixed(2)}
                                    </Button>
                                    <Button variant="danger" size="sm" disabled={processing} onClick={() => handleCancelWithdrawal(w)}>
                                      ✕ Cancelar
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className={styles.manualTag}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      ) : (
        /* ---- Referencias: buscador + historial (recibidos + pagados) ---- */
        <>
          <div className={styles.refToolbar}>
            <input
              className={styles.refSearch}
              type="text"
              placeholder="Buscar por número de referencia…"
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
            />
            <div className={styles.filters}>
              {REF_TYPE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`${styles.filterBtn} ${refTypeFilter === f.key ? styles.activeFilter : ''}`}
                  onClick={() => setRefTypeFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <p className={styles.hint}>
            Historial de referencias: los pagos <strong>recibidos</strong> por compra de tickets y los
            pagos <strong>hechos</strong> a los jugadores por sus retiros. Busca por número de referencia.
          </p>

          {loadingRefs ? (
            <div className={styles.loading}><Spinner /></div>
          ) : (() => {
            const term = refSearch.trim().toLowerCase();
            const filtered = references.filter((r) =>
              (refTypeFilter === 'todos' || r.type === refTypeFilter) &&
              (term === '' || (r.ref || '').toLowerCase().includes(term))
            );
            if (filtered.length === 0) {
              return <div className={styles.emptyState}>No se encontraron referencias.</div>;
            }
            return (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Referencia</th>
                      <th>Tipo</th>
                      <th>Jugador</th>
                      <th>Monto</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td><code className={styles.ref}>{r.ref}</code></td>
                        <td>
                          {r.type === 'recibido'
                            ? <span className={styles.typeIn}>↓ Recibido</span>
                            : <span className={styles.typeOut}>↑ Pagado</span>}
                        </td>
                        <td>
                          <div className={styles.userInfo}>
                            <span className={styles.userName}>{r.name}</span>
                            <span className={styles.userEmail}>{r.email}</span>
                          </div>
                        </td>
                        <td><span className={styles.usd}>${r.amount.toFixed(2)}</span></td>
                        <td>{formatDate(r.date)}</td>
                        <td>
                          {r.type === 'recibido'
                            ? <Badge color={PAYMENT_STATUSES[r.status]?.color}>{PAYMENT_STATUSES[r.status]?.label}</Badge>
                            : <Badge color="#34D399">Pagado</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </>
      )}

      {/* Modal: pagar un retiro (referencia + comprobante) */}
      <Modal
        isOpen={!!payModal}
        onClose={closePayModal}
        title="Registrar pago del retiro"
      >
        <div className={styles.modalContent}>
          <p>
            Retiro de{' '}
            <strong>${payModal ? Number(payModal.withdrawal.amount_usd).toFixed(2) : ''}</strong>
            {' '}a{' '}
            <strong>{payModal?.name}</strong>.
            Escribe el número de referencia del Pago Móvil que hiciste y, si quieres,
            adjunta el comprobante.
          </p>
          <FormInput
            label="Número de referencia"
            type="text"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            placeholder="Ej: 001234567"
          />
          <div>
            <label className={styles.fileLabel}>Comprobante (opcional)</label>
            <input type="file" accept="image/*" onChange={handlePayProofChange} className={styles.fileInput} />
            {payProofPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={payProofPreview} alt="Comprobante" className={styles.proofPreview} />
            )}
          </div>
          <div>
            <label className={styles.fileLabel}>Nota para el jugador (opcional)</label>
            <textarea
              className={styles.textarea}
              rows={2}
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Se le envía a su chat. Ej: ¡Listo! Te pagué tu retiro por Pago Móvil."
            />
          </div>
          <Button
            variant="success"
            fullWidth
            onClick={handleConfirmPay}
            disabled={processing || !payRef.trim()}
            loading={processing}
            loadingText="Guardando..."
          >
            ✓ Marcar como pagado
          </Button>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => { setShowRejectModal(false); setRejectReason(''); setSelectedTicket(null); }}
        title="Rechazar Solicitud"
      >
        <div className={styles.modalContent}>
          <p>
            Indica el motivo por el cual se rechaza el pago de la referencia{' '}
            <strong>{selectedTicket?.payment_reference}</strong>:
          </p>
          {selectedTicket?.payment_status === 'aprobado' && (
            <p className={styles.payoutMissing}>
              Esta solicitud ya estaba aprobada. Al rechazarla se le descontarán los tickets
              acreditados (sin bajar de cero si ya los usó).
            </p>
          )}
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className={styles.textarea}
            placeholder="Ej: La referencia no coincide con nuestros registros bancarios..."
            rows={4}
          />
          <Button
            variant="dangerSolid"
            fullWidth
            onClick={handleReject}
            disabled={processing || !rejectReason.trim()}
            loading={processing}
            loadingText="Procesando..."
          >
            Confirmar Rechazo
          </Button>
        </div>
      </Modal>

      {recargasUser && (
        <RecargasModal
          userId={recargasUser.id}
          name={recargasUser.name}
          onClose={() => setRecargasUser(null)}
        />
      )}

      {/* Modal: aprobar pago (con nota/voz/foto opcional al chat) */}
      <Modal
        isOpen={!!approveModal}
        onClose={() => { if (!processing) { setApproveModal(null); resetCompose(); } }}
        title="Aprobar pago"
      >
        {approveModal && (
          <div className={styles.modalContent}>
            <p>
              Aprobar <strong>{approveModal.ticket.quantity} ticket(s)</strong> de{' '}
              <strong>{approveModal.ticket.profiles?.nombre} {approveModal.ticket.profiles?.apellido}</strong>
              {approveModal.ticket.payment_status === 'rechazado' && ' (esta solicitud estaba rechazada)'}.
            </p>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={soloAprobar} onChange={(e) => setSoloAprobar(e.target.checked)} />
              Solo aprobar (no enviarle nada al jugador)
            </label>
            {!soloAprobar && (
              <ChatComposeFields
                text={composeText} setText={setComposeText}
                audio={composeAudio} setAudio={setComposeAudio}
                doc={composeDoc} setDoc={setComposeDoc}
                disabled={processing}
              />
            )}
            <Button
              variant="success"
              fullWidth
              onClick={confirmApprove}
              disabled={processing}
              loading={processing}
              loadingText="Aprobando..."
            >
              ✓ Aprobar
            </Button>
          </div>
        )}
      </Modal>

      {/* Modal: nota al jugador (sin aprobar) */}
      <Modal
        isOpen={!!chatModal}
        onClose={() => { if (!processing) { setChatModal(null); resetCompose(); } }}
        title={chatModal ? `Nota para ${chatModal.name}` : 'Nota al jugador'}
      >
        <div className={styles.modalContent}>
          <p className={styles.modalHint}>Lo que envíes le llegará al chat del jugador (con su campana de aviso).</p>
          <ChatComposeFields
            text={composeText} setText={setComposeText}
            audio={composeAudio} setAudio={setComposeAudio}
            doc={composeDoc} setDoc={setComposeDoc}
            disabled={processing}
          />
          <Button
            variant="primary"
            fullWidth
            onClick={confirmSendChat}
            disabled={processing}
            loading={processing}
            loadingText="Enviando..."
          >
            Enviar al chat
          </Button>
        </div>
      </Modal>
    </div>
  );
}
