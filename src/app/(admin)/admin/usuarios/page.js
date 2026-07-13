'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import styles from './usuarios.module.css';

export default function AdminUsuariosPage() {
  const supabase = createClient();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Usuarios Registrados</h1>
        <div className={styles.stats}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>Total</span>
            <span className={styles.statValue}>{users.length}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}><Spinner /></div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha Registro</th>
                <th>Nombre</th>
                <th>Cédula</th>
                <th>WhatsApp</th>
                <th>Tickets Disponibles</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{formatDate(u.created_at)}</td>
                  <td>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>{u.nombre} {u.apellido}</span>
                      <span className={styles.userEmail}>{u.email}</span>
                    </div>
                  </td>
                  <td>{u.cedula}</td>
                  <td>{u.whatsapp}</td>
                  <td>
                    <Badge color="#39ff14">{u.tickets_balance}</Badge>
                  </td>
                  <td>
                    <Badge size="sm" color={u.role === 'admin' ? '#ff6b9d' : '#00f5ff'}>
                      {u.role === 'admin' ? 'Admin' : 'Jugador'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
