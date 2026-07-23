'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import styles from './recargasModal.module.css';

// Historial de recargas (compras de tickets) de un usuario. Reutilizable desde
// Transacciones e Interacción: se abre con { userId, name } y se cierra con
// onClose. Solo lectura.
export default function RecargasModal({ userId, name, onClose }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    const sb = createClient();
    sb.from('tickets')
      .select('id, quantity, amount_usd, amount_ves, payment_reference, payment_status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [userId]);

  const approved = (rows || []).filter((r) => r.payment_status === 'aprobado');
  const ticketsAprob = approved.reduce((s, r) => s + (r.quantity || 0), 0);
  const usdAprob = approved.reduce((s, r) => s + Number(r.amount_usd || 0), 0);

  function fmt(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <Modal isOpen onClose={onClose} title={`Recargas de ${name}`}>
      {rows === null ? (
        <div className={styles.loading}><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>Este jugador no ha hecho recargas.</p>
      ) : (
        <div className={styles.wrap}>
          <div className={styles.summary}>
            <span><strong>{rows.length}</strong> recargas</span>
            <span><strong>{ticketsAprob}</strong> tickets aprobados</span>
            <span><strong>${usdAprob.toFixed(2)}</strong> aprobados</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tickets</th>
                  <th>Monto</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{fmt(r.created_at)}</td>
                    <td>{r.quantity}</td>
                    <td>
                      ${Number(r.amount_usd).toFixed(2)}
                      {r.amount_ves != null && (
                        <span className={styles.ves}> · Bs. {Number(r.amount_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      )}
                    </td>
                    <td><code className={styles.ref}>{r.payment_reference || '—'}</code></td>
                    <td>
                      <Badge color={PAYMENT_STATUSES[r.payment_status]?.color}>
                        {PAYMENT_STATUSES[r.payment_status]?.label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
