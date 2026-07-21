'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adminSetUserBlockedAction, adminDeleteUserAction } from '@/actions/admin';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import styles from './usuarios.module.css';

export default function AdminUsuariosPage() {
  const supabase = createClient();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.nombre, u.apellido, `${u.nombre} ${u.apellido}`, u.email, u.cedula, u.whatsapp]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, search]);

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  async function handleToggleBlock(u) {
    const next = !u.blocked;
    if (!window.confirm(
      next
        ? `¿Bloquear a ${u.nombre} ${u.apellido}? No podrá jugar, comprar tickets ni retirar hasta que lo desbloquees.`
        : `¿Desbloquear a ${u.nombre} ${u.apellido}?`
    )) return;
    setBusyId(u.id);
    try {
      const { error } = await adminSetUserBlockedAction(u.id, next);
      if (error) throw new Error(error);
      await loadUsers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    if (!window.confirm(
      `¿ELIMINAR permanentemente a ${u.nombre} ${u.apellido}?\n\nSe borra su cuenta y todos sus datos (partidas, tickets, billetera). Esta acción no se puede deshacer.`
    )) return;
    setBusyId(u.id);
    try {
      const { error } = await adminDeleteUserAction(u.id);
      if (error) throw new Error(error);
      await loadUsers();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setBusyId(null);
    }
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

      <div className={styles.searchBar}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Buscar por nombre, cédula, correo o WhatsApp…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Limpiar búsqueda">✕</button>
        )}
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={u.blocked ? styles.blockedRow : ''}>
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
                    <div className={styles.roleCell}>
                      <Badge size="sm" color={u.role === 'admin' ? '#ff6b9d' : '#00f5ff'}>
                        {u.role === 'admin' ? 'Admin' : 'Jugador'}
                      </Badge>
                      {u.blocked && <Badge size="sm" color="#ff3860">Bloqueado</Badge>}
                    </div>
                  </td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className={styles.userEmail}>—</span>
                    ) : (
                      <div className={styles.actions}>
                        <Button
                          variant={u.blocked ? 'success' : 'ghost'}
                          size="sm"
                          disabled={busyId === u.id}
                          onClick={() => handleToggleBlock(u)}
                        >
                          {u.blocked ? '✓ Desbloquear' : '🚫 Bloquear'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          🗑 Eliminar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className={styles.loading} style={{ borderTop: 'none' }}>
              No se encontraron usuarios.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
