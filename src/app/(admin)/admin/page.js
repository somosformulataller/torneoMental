'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './dashboard.module.css';

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
        <div className={styles.loading}>Cargando dashboard...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Panel de Control</h1>
      <p className={styles.subtitle}>Resumen del Torneo Mental</p>

      <div className={styles.grid}>
        <div className={styles.statCard}>
          <div className={styles.iconBox} style={{ color: 'var(--accent-cyan)' }}>👥</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Usuarios Totales</span>
            <span className={styles.statValue}>{stats.users}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.iconBox} style={{ color: 'var(--accent-orange)' }}>🏆</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Torneos Creados</span>
            <span className={styles.statValue}>{stats.tournaments}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.iconBox} style={{ color: 'var(--accent-green)' }}>🎫</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Tickets Vendidos</span>
            <span className={styles.statValue}>{stats.ticketsSold}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.iconBox} style={{ color: 'var(--accent-gold)' }}>💰</div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Ingresos USD</span>
            <span className={styles.statValue}>${stats.revenue.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
