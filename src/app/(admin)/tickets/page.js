'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import styles from './tickets.module.css';

export default function AdminTicketsPage() {
  const supabase = createClient();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState('pendiente'); // pendiente, todos

  useEffect(() => {
    loadTickets();
  }, [filter]);

  async function loadTickets() {
    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          profiles ( nombre, apellido, cedula, email ),
          tournaments ( nombre )
        `)
        .order('created_at', { ascending: false });

      if (filter === 'pendiente') {
        query = query.eq('payment_status', 'pendiente');
      }

      const { data, error } = await query;
      if (error) throw error;
      
      setTickets(data || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(ticket) {
    if (!window.confirm(`¿Aprobar recarga de ${ticket.quantity} tickets para ${ticket.profiles.nombre}?`)) return;
    
    setProcessing(true);
    try {
      // 1. Update ticket status
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({ payment_status: 'aprobado' })
        .eq('id', ticket.id);

      if (ticketError) throw ticketError;

      // 2. Add tickets to user balance
      const { data: profile } = await supabase
        .from('profiles')
        .select('tickets_balance')
        .eq('id', ticket.user_id)
        .single();

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ tickets_balance: profile.tickets_balance + ticket.quantity })
        .eq('id', ticket.user_id);

      if (profileError) throw profileError;

      loadTickets();
    } catch (err) {
      console.error('Error approving ticket:', err);
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
      const { error } = await supabase
        .from('tickets')
        .update({ 
          payment_status: 'rechazado',
          notes: rejectReason
        })
        .eq('id', selectedTicket.id);

      if (error) throw error;

      setShowRejectModal(false);
      setRejectReason('');
      setSelectedTicket(null);
      loadTickets();
    } catch (err) {
      console.error('Error rejecting ticket:', err);
      alert('Error al rechazar: ' + err.message);
    } finally {
      setProcessing(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Gestión de Tickets</h1>
        <div className={styles.filters}>
          <button 
            className={`${styles.filterBtn} ${filter === 'pendiente' ? styles.activeFilter : ''}`}
            onClick={() => setFilter('pendiente')}
          >
            Pendientes
          </button>
          <button 
            className={`${styles.filterBtn} ${filter === 'todos' ? styles.activeFilter : ''}`}
            onClick={() => setFilter('todos')}
          >
            Todos
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando solicitudes...</div>
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
                <th>Monto/Tickets</th>
                <th>Estado</th>
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
                    <div className={styles.amountInfo}>
                      <span className={styles.usd}>${t.amount_usd.toFixed(2)}</span>
                      <span className={styles.qty}>{t.quantity} tickets</span>
                    </div>
                  </td>
                  <td>
                    <span 
                      className={styles.badge}
                      style={{ 
                        backgroundColor: `${PAYMENT_STATUSES[t.payment_status]?.color}20`,
                        color: PAYMENT_STATUSES[t.payment_status]?.color,
                        borderColor: `${PAYMENT_STATUSES[t.payment_status]?.color}50`
                      }}
                    >
                      {PAYMENT_STATUSES[t.payment_status]?.label}
                    </span>
                  </td>
                  <td>
                    {t.payment_status === 'pendiente' && (
                      <div className={styles.actions}>
                        <button 
                          className={styles.approveBtn}
                          onClick={() => handleApprove(t)}
                          disabled={processing}
                        >
                          ✓ Aprobar
                        </button>
                        <button 
                          className={styles.rejectBtn}
                          onClick={() => {
                            setSelectedTicket(t);
                            setShowRejectModal(true);
                          }}
                          disabled={processing}
                        >
                          ✕ Rechazar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason('');
          setSelectedTicket(null);
        }}
        title="Rechazar Solicitud"
      >
        <div className={styles.modalContent}>
          <p>Indica el motivo por el cual se rechaza el pago de la referencia <strong>{selectedTicket?.payment_reference}</strong>:</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className={styles.textarea}
            placeholder="Ej: La referencia no coincide con nuestros registros bancarios..."
            rows={4}
          />
          <button 
            className={styles.submitRejectBtn}
            onClick={handleReject}
            disabled={processing || !rejectReason.trim()}
          >
            {processing ? 'Procesando...' : 'Confirmar Rechazo'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
