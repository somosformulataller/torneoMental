'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES, VENEZUELAN_BANKS } from '@/lib/constants';
import { deleteAccountAction } from '@/actions/account';
import { updatePayoutInfoAction } from '@/actions/profile';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import Modal from '@/components/ui/Modal';
import InstallAppButton from '@/components/ui/InstallAppButton';
import styles from './billetera.module.css';

// La página (Server Component) ya llega con los datos iniciales en el HTML —
// acá solo queda la interactividad: suscripciones Realtime para refrescar
// saldo/compras al instante y el modal de eliminar cuenta.
export default function BilleteraClient({ userId, initialProfile, initialTickets, initialPrizes }) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(initialProfile);
  const [tickets, setTickets] = useState(initialTickets);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Datos de Pago Móvil (para recibir premios). Prefill con lo ya guardado.
  const [payout, setPayout] = useState({
    nombre: initialProfile?.payout_nombre || '',
    banco: initialProfile?.payout_banco || '',
    cedula: initialProfile?.payout_cedula || '',
    telefono: initialProfile?.payout_telefono || '',
  });
  const [savingPayout, setSavingPayout] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState(null); // { ok: bool, text }

  async function refreshData() {
    try {
      // Perfil, tickets y premios son independientes entre sí — se piden en
      // paralelo en vez de uno tras otro.
      const [{ data: profileData }, { data: ticketsData }, { data: prizesData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase
          .from('tickets')
          .select(`*, tournaments ( nombre )`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('wallet_transactions')
          .select(`*, tournaments ( nombre )`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      if (profileData) setProfile(profileData);
      setTickets(ticketsData || []);
      setPrizes(prizesData || []);
    } catch (err) {
      console.error('Error refreshing wallet data:', err);
    }
  }

  useEffect(() => {
    // Para que el saldo de tickets y el estado de cada compra ("Pendiente" →
    // "Aprobado"/"Rechazado") se actualicen solos apenas el admin los
    // procesa, sin que el jugador tenga que recargar la página. Sufijo
    // aleatorio en el nombre del canal (no solo el userId): evita el choque
    // "cannot add postgres_changes callbacks ... after subscribe()" si el
    // efecto se reinicia rápido y reutiliza el mismo nombre de canal antes
    // de que la suscripción anterior termine de limpiarse.
    const channel = supabase
      .channel(`billetera_updates_${userId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, () => refreshData())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tickets',
        filter: `user_id=eq.${userId}`,
      }, () => refreshData())
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

  async function handleSavePayout() {
    setSavingPayout(true);
    setPayoutMsg(null);
    try {
      const { error } = await updatePayoutInfoAction(payout);
      if (error) {
        setPayoutMsg({ ok: false, text: error });
        return;
      }
      setPayoutMsg({ ok: true, text: 'Datos guardados correctamente.' });
    } catch {
      setPayoutMsg({ ok: false, text: 'No se pudieron guardar los datos. Intenta de nuevo.' });
    } finally {
      setSavingPayout(false);
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

      {/* Datos de Pago Móvil — para recibir el pago de los premios */}
      <div className={styles.payoutCard}>
        <div className={styles.payoutTitle}>Datos para recibir tus premios</div>
        <p className={styles.payoutSubtitle}>
          Si ganas un torneo, te pagamos por Pago Móvil a estos datos. Complétalos para
          que podamos pagarte sin demoras.
        </p>

        <div className={styles.payoutForm}>
          <FormInput
            label="Nombre completo"
            type="text"
            value={payout.nombre}
            onChange={(e) => setPayout({ ...payout, nombre: e.target.value })}
            placeholder="Como aparece en tu cuenta"
          />

          <div className={styles.payoutField}>
            <label className={styles.payoutLabel}>Banco</label>
            <select
              className={styles.payoutSelect}
              value={payout.banco}
              onChange={(e) => setPayout({ ...payout, banco: e.target.value })}
            >
              <option value="">Selecciona tu banco</option>
              {VENEZUELAN_BANKS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <FormInput
            label="Cédula"
            type="text"
            value={payout.cedula}
            onChange={(e) => setPayout({ ...payout, cedula: e.target.value })}
            placeholder="Ej: V-12345678"
          />

          <FormInput
            label="Teléfono"
            type="tel"
            value={payout.telefono}
            onChange={(e) => setPayout({ ...payout, telefono: e.target.value })}
            placeholder="Ej: 04121234567"
          />

          {payoutMsg && (
            <p className={payoutMsg.ok ? styles.payoutSuccess : styles.payoutError}>
              {payoutMsg.text}
            </p>
          )}

          <Button
            variant="primary"
            fullWidth
            onClick={handleSavePayout}
            loading={savingPayout}
            loadingText="Guardando..."
          >
            Guardar datos de pago
          </Button>
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
                  {/* suppressHydrationWarning: el formato de fecha del
                      servidor (Node) puede diferir en detalles mínimos del
                      navegador; no debe romper la hidratación. */}
                  <div className={styles.txDate} suppressHydrationWarning>{formatDate(p.created_at)}</div>
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
                  <div className={styles.txDate} suppressHydrationWarning>{formatDate(t.created_at)}</div>
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
