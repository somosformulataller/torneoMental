'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES } from '@/lib/constants';
import { deleteAccountAction } from '@/actions/account';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import InstallAppButton from '@/components/ui/InstallAppButton';
import styles from './billetera.module.css';

export default function BilleteraPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [userId, setUserId] = useState(null);

  async function loadData(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      // Perfil, tickets y premios son independientes entre sí — se piden en
      // paralelo en vez de uno tras otro.
      const [{ data: profileData }, { data: ticketsData }, { data: prizesData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('tickets')
          .select(`*, tournaments ( nombre )`)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('wallet_transactions')
          .select(`*, tournaments ( nombre )`)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      setProfile(profileData);
      setTickets(ticketsData || []);
      setPrizes(prizesData || []);
    } catch (err) {
      console.error('Error loading tickets:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Para que el saldo de tickets y el estado de cada compra ("Pendiente" →
    // "Aprobado"/"Rechazado") se actualicen solos apenas el admin los
    // procesa, sin que el jugador tenga que recargar la página.
    const channel = supabase
      .channel(`billetera_updates_${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, () => loadData(false))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tickets',
        filter: `user_id=eq.${userId}`,
      }, () => loadData(false))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);

    const { error, success } = await deleteAccountAction();

    if (error) {
      setDeleteError(error);
      setDeleting(false);
      return;
    }

    if (success) {
      await supabase.auth.signOut();
      router.push('/login');
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
        <Spinner />
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
        <Button variant="ghost" fullWidth className={styles.buyBtn} onClick={() => router.push('/home')}>
          Comprar más tickets
        </Button>
      </div>

      {/* Prize Wallet Card */}
      <div className={styles.prizeCard}>
        <div className={styles.balanceHeader}>
          <span className={styles.balanceLabel}>Premios Ganados</span>
          <span className={styles.balanceIcon}>🏆</span>
        </div>
        <div className={styles.prizeValue}>
          ${Number(profile?.wallet_balance_usd || 0).toFixed(2)}
        </div>
        <div className={styles.balanceSub}>
          Se acumula con cada torneo ganado, no se pierde al reiniciarse el ranking.
        </div>
      </div>

      <InstallAppButton />

      {/* Prize History */}
      <div className={styles.historySection}>
        <h2 className={styles.sectionTitle}>Historial de Premios</h2>

        {prizes.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>🏆</span>
            <p>Aún no has ganado ningún premio.</p>
          </div>
        ) : (
          <div className={styles.transactionList}>
            {prizes.map((p) => (
              <div key={p.id} className={styles.transactionCard}>
                <div className={styles.txHeader}>
                  <div className={styles.txDate}>{formatDate(p.created_at)}</div>
                  <Badge color="#ffd700">{p.position}° lugar</Badge>
                </div>

                <div className={styles.txBody}>
                  <div className={styles.txDetails}>
                    {p.tournaments && (
                      <div className={styles.txTourn}>
                        Torneo: {p.tournaments.nombre}
                      </div>
                    )}
                  </div>
                  <div className={styles.txAmount}>
                    +${Number(p.amount_usd).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
                  <Badge color={PAYMENT_STATUSES[t.payment_status].color}>
                    {PAYMENT_STATUSES[t.payment_status].label}
                  </Badge>
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

      <div className={styles.dangerZone}>
        <Button
          variant="danger"
          size="sm"
          className={styles.deleteAccountBtn}
          onClick={() => setShowDeleteModal(true)}
        >
          Eliminar cuenta
        </Button>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setDeleteError(null); }}
        title="¿Eliminar tu cuenta?"
      >
        <div className={styles.deleteWarning}>
          <p>Esta acción es permanente y no se puede deshacer. Se eliminará:</p>
          <ul>
            <li>Tu cuenta y datos de perfil</li>
            <li>Tus tickets disponibles</li>
            <li>Tu historial de partidas</li>
            <li>Tu saldo y historial de premios en la billetera</li>
          </ul>
        </div>

        {deleteError && <div className={styles.deleteError}>{deleteError}</div>}

        <div className={styles.deleteActions}>
          <Button
            variant="dangerSolid"
            fullWidth
            loading={deleting}
            loadingText="Eliminando..."
            onClick={handleDeleteAccount}
          >
            Sí, eliminar mi cuenta
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={deleting}
            onClick={() => { setShowDeleteModal(false); setDeleteError(null); }}
          >
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
