'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES } from '@/lib/constants';
import styles from './billetera.module.css';

export default function BilleteraPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(profileData);

      const { data: ticketsData } = await supabase
        .from('tickets')
        .select(`
          *,
          tournaments ( nombre )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      setTickets(ticketsData || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p>Cargando billetera...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mi Billetera</h1>
      </div>

      {/* Balance Card */}
      <div className={styles.balanceCard}>
        <div className={styles.balanceHeader}>
          <span className={styles.balanceLabel}>Tickets Disponibles</span>
          <span className={styles.balanceIcon}>🎫</span>
        </div>
        <div className={styles.balanceValue}>
          {profile?.tickets_balance || 0}
        </div>
        <div className={styles.balanceSub}>
          Valor estimado: ${(profile?.tickets_balance * 1.00 || 0).toFixed(2)} USD
        </div>
        <button 
          className={styles.buyBtn}
          onClick={() => router.push('/home')}
        >
          Comprar más tickets
        </button>
      </div>

      {/* Transactions History */}
      <div className={styles.historySection}>
        <h2 className={styles.sectionTitle}>Historial de Compras</h2>
        
        {tickets.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📝</span>
            <p>No tienes compras registradas aún.</p>
          </div>
        ) : (
          <div className={styles.transactionList}>
            {tickets.map((t) => (
              <div key={t.id} className={styles.transactionCard}>
                <div className={styles.txHeader}>
                  <div className={styles.txDate}>{formatDate(t.created_at)}</div>
                  <span 
                    className={styles.statusBadge}
                    style={{ 
                      backgroundColor: `${PAYMENT_STATUSES[t.payment_status].color}20`,
                      color: PAYMENT_STATUSES[t.payment_status].color,
                      borderColor: `${PAYMENT_STATUSES[t.payment_status].color}50`
                    }}
                  >
                    {PAYMENT_STATUSES[t.payment_status].label}
                  </span>
                </div>
                
                <div className={styles.txBody}>
                  <div className={styles.txDetails}>
                    <div className={styles.txQty}>+{t.quantity} Tickets</div>
                    <div className={styles.txRef}>Ref: {t.payment_reference}</div>
                    {t.tournaments && (
                      <div className={styles.txTourn}>
                        Torneo: {t.tournaments.nombre}
                      </div>
                    )}
                  </div>
                  <div className={styles.txAmount}>
                    ${t.amount_usd.toFixed(2)}
                  </div>
                </div>
                
                {t.payment_status === 'rechazado' && t.notes && (
                  <div className={styles.txNotes}>
                    <strong>Nota:</strong> {t.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
