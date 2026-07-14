'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import Spinner from '@/components/ui/Spinner';
import styles from './dashboard.module.css';

const STAT_CARDS = [
  { key: 'users', label: 'Usuarios Totales', icon: '👥', color: 'var(--accent-cyan)', format: (v) => v },
  { key: 'tournaments', label: 'Torneos Creados', icon: '🏆', color: 'var(--accent-orange)', format: (v) => v },
  { key: 'ticketsSold', label: 'Tickets Vendidos', icon: '🎫', color: 'var(--accent-green)', format: (v) => v },
  { key: 'revenue', label: 'Ingresos USD', icon: '💰', color: 'var(--accent-gold)', format: (v) => `$${v.toFixed(2)}` },
];

export default function AdminDashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    users: 0,
    tournaments: 0,
    ticketsSold: 0,
    revenue: 0
  });
  const [loading, setLoading] = useState(true);

  async function loadStats() {
    try {
      // Users count
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Tournaments count
      const { count: tournCount } = await supabase
        .from('tournaments')
        .select('*', { count: 'exact', head: true });

      // Tickets & Revenue (Approved)
      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('quantity, amount_usd')
        .eq('payment_status', 'aprobado');

      let sold = 0;
      let rev = 0;
      
      if (ticketsData) {
        ticketsData.forEach(t => {
          sold += t.quantity;
          rev += t.amount_usd;
        });
      }

      setStats({
        users: usersCount || 0,
        tournaments: tournCount || 0,
        ticketsSold: sold,
        revenue: rev
      });

    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}><Spinner /></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Panel de Control</h1>
      <p className={styles.subtitle}>Resumen de Copa Mental</p>

      <div className={styles.grid}>
        {STAT_CARDS.map((s, i) => (
          <motion.div
            key={s.key}
            className={styles.statCard}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
          >
            <div className={styles.iconBox} style={{ color: s.color }}>{s.icon}</div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.format(stats[s.key])}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
