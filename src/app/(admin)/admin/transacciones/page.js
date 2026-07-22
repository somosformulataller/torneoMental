'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adminApproveTicketAction, adminRejectTicketAction } from '@/actions/tickets';
import { markWithdrawalPaidAction, cancelWithdrawalAction } from '@/actions/wallet';
import { adminSetUserBlockedAction } from '@/actions/admin';
import { PAYMENT_STATUSES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import styles from './transacciones.module.css';

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

      if (statusFilter !== 'todos') {
        query = query.eq('payment_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTickets(data || []);
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
          .select('id, amount_usd, created_at, paid_at, profiles ( nombre, apellido, email, payout_nombre, payout_banco, payout_cedula, payout_telefono )')
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (section === 'compras') loadTickets();
    else if (section === 'premiados') loadPrizes();
    else loadRetiros();
  }, [section, loadTickets, loadPrizes, loadRetiros]);

  async function handleApprove(ticket) {
    if (!window.confirm(
      `¿Aprobar ${ticket.quantity} tickets para ${ticket.profiles?.nombre || 'el jugador'}?` +
      (ticket.payment_status === 'rechazado' ? '\n\nEsta solicitud estaba rechazada.' : '')
    )) return;

    setProcessing(true);
    try {
      const { error } = await adminApproveTicketAction(ticket.id);
      if (error) throw new Error(error);
      await loadTickets();
    } catch (err) {
      alert('Error al aprobar: ' + err.message);
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

  async function handleMarkPaid(w) {
    if (!window.confirm(`¿Marcar como pagado el retiro de $${Number(w.amount_usd).toFixed(2)}?`)) return;
    setProcessing(true);
    try {
      const { error } = await markWithdrawalPaidAction(w.id);
      if (error) throw new Error(error);
      await loadRetiros();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setProcessing(false);
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
                        </div>
                      </td>
                      <td>{t.profiles?.cedula}</td>
                      <td><code className={styles.ref}>{t.payment_reference}</code></td>
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
                              onClick={() => handleApprove(t)}
                              disabled={processing}
                            >
                              ✓ Aprobar
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
                            <div className={styles.blockBtnRow}>{renderBlockBtn(prof)}</div>
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
      ) : (
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
                              <div className={styles.blockBtnRow}>{renderBlockBtn(p)}</div>
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
                                    <Button variant="success" size="sm" disabled={processing} onClick={() => handleMarkPaid(w)}>
                                      ✓ Pagado ${Number(w.amount_usd).toFixed(2)}
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
      )}

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
    </div>
  );
}
