'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_STATUSES, VENEZUELAN_BANKS } from '@/lib/constants';
import { deleteAccountAction } from '@/actions/account';
import { updatePayoutInfoAction } from '@/actions/profile';
import { requestWithdrawalAction, redeemBalanceForTicketsAction } from '@/actions/wallet';
import { recheckMyTicketsAction } from '@/actions/tickets';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import Modal from '@/components/ui/Modal';
import InstallAppButton from '@/components/ui/InstallAppButton';
import BackToHome from '@/components/ui/BackToHome';
import styles from './billetera.module.css';

// La página (Server Component) ya llega con los datos iniciales en el HTML —
// acá solo queda la interactividad: suscripciones Realtime para refrescar
// saldo/compras al instante y el modal de eliminar cuenta.
export default function BilleteraClient({ userId, initialProfile, initialTickets, initialPrizes, initialWithdrawals = [] }) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(initialProfile);
  const [tickets, setTickets] = useState(initialTickets);
  const [prizes, setPrizes] = useState(initialPrizes);
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);

  // Retiro de la billetera de premios.
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Re-verificación de pagos en revisión contra el banco (sin esperar al admin).
  const [rechecking, setRechecking] = useState(false);

  // Canje de saldo por tickets (1 ticket = $1).
  const [redeemTickets, setRedeemTickets] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState(null);
  const [redeemOk, setRedeemOk] = useState(false);

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
      const [{ data: profileData }, { data: ticketsData }, { data: prizesData }, { data: withdrawalsData }] = await Promise.all([
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
        supabase
          .from('withdrawals')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      ]);

      if (profileData) setProfile(profileData);
      setTickets(ticketsData || []);
      setPrizes(prizesData || []);
      setWithdrawals(withdrawalsData || []);
    } catch (err) {
      console.error('Error refreshing wallet data:', err);
    }
  }

  // Cuántas compras siguen "en revisión" (pendiente o validando). Un ref
  // acompaña al valor para que el temporizador lea siempre el último dato sin
  // reiniciarse en cada render.
  const pendingCount = tickets.filter(
    (t) => t.payment_status === 'pendiente' || t.payment_status === 'validando'
  ).length;
  const pendingRef = useRef(pendingCount);
  useEffect(() => { pendingRef.current = pendingCount; }, [pendingCount]);

  // Vuelve a consultar el banco por los pagos en revisión. Si alguno ya
  // aparece, la RPC del servidor acredita los tickets y refrescamos la vista.
  // Un ref evita que se solapen dos consultas si el temporizador y el botón
  // coinciden.
  const inFlightRef = useRef(false);
  const recheckPayments = useCallback(async () => {
    if (pendingRef.current === 0 || inFlightRef.current) return;
    inFlightRef.current = true;
    setRechecking(true);
    try {
      const res = await recheckMyTicketsAction();
      if (res?.approved > 0) await refreshData();
    } catch {
      // Silencioso: si falla, se reintenta en el próximo ciclo o a mano.
    } finally {
      inFlightRef.current = false;
      setRechecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Al entrar a la Billetera, si hay pagos en revisión, se re-consulta al
    // banco una vez (el pago suele reflejarse 1–2 min después de comprar) y
    // luego cada 60 s mientras sigan pendientes. La API del banco tiene un
    // enfriamiento de ~48 s; 60 s lo respeta sin machacarla.
    if (pendingRef.current > 0) recheckPayments();
    const id = setInterval(() => { recheckPayments(); }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'withdrawals',
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

  const walletBalance = Number(profile?.wallet_balance_usd || 0);
  const parsedWithdraw = parseFloat(withdrawAmount);
  const withdrawExceeds = Number.isFinite(parsedWithdraw) && parsedWithdraw > walletBalance;
  const withdrawValid = Number.isFinite(parsedWithdraw) && parsedWithdraw > 0 && parsedWithdraw <= walletBalance;
  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'solicitado');

  async function handleWithdraw() {
    if (!withdrawValid) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const { error } = await requestWithdrawalAction(parsedWithdraw);
      if (error) {
        setWithdrawError(error);
        return;
      }
      setWithdrawAmount('');
      setShowWithdrawModal(true);
      // Refresco inmediato del saldo y la lista de retiros (no esperamos al
      // Realtime, que puede tardar unos segundos).
      await refreshData();
    } catch {
      setWithdrawError('No se pudo procesar el retiro. Intenta de nuevo.');
    } finally {
      setWithdrawing(false);
    }
  }

  const maxRedeem = Math.floor(walletBalance);
  const parsedRedeem = parseInt(redeemTickets, 10);
  const redeemValid = Number.isInteger(parsedRedeem) && parsedRedeem > 0 && parsedRedeem <= maxRedeem;

  async function handleRedeem() {
    if (!redeemValid) return;
    setRedeeming(true);
    setRedeemError(null);
    setRedeemOk(false);
    try {
      const { error } = await redeemBalanceForTicketsAction(parsedRedeem);
      if (error) {
        setRedeemError(error);
        return;
      }
      setRedeemTickets('');
      setRedeemOk(true);
      await refreshData();
    } catch {
      setRedeemError('No se pudo canjear. Intenta de nuevo.');
    } finally {
      setRedeeming(false);
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
        <BackToHome />
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
        {pendingCount > 0 && (
          <div className={styles.pendingBanner}>
            ⏳ {pendingCount === 1 ? 'Tienes 1 pago en revisión' : `Tienes ${pendingCount} pagos en revisión`}.
            Se acreditarán solos apenas el banco confirme tu pago.
          </div>
        )}
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

        {/* Retirar de la billetera de premios */}
        <div className={styles.withdrawBox}>
          <label className={styles.withdrawLabel}>Retirar dinero</label>
          <div className={styles.withdrawRow}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className={styles.withdrawInput}
              value={withdrawAmount}
              onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawError(null); }}
              placeholder="Monto a retirar ($)"
              disabled={walletBalance <= 0}
            />
            <Button
              variant="primary"
              onClick={handleWithdraw}
              disabled={!withdrawValid || withdrawing}
              loading={withdrawing}
              loadingText="..."
            >
              Retirar
            </Button>
          </div>
          {withdrawExceeds && (
            <p className={styles.withdrawWarn}>El monto sobrepasa el saldo de tu billetera.</p>
          )}
          {withdrawError && !withdrawExceeds && (
            <p className={styles.withdrawWarn}>{withdrawError}</p>
          )}
          {walletBalance <= 0 && (
            <p className={styles.withdrawHint}>No tienes saldo disponible para retirar.</p>
          )}

          {pendingWithdrawals.length > 0 && (
            <div className={styles.withdrawPending}>
              {pendingWithdrawals.map((w) => (
                <div key={w.id} className={styles.withdrawPendingRow}>
                  <span>Retiro solicitado</span>
                  <span>${Number(w.amount_usd).toFixed(2)} · en proceso</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Canjear saldo de premios por tickets (1 ticket = $1) */}
      <div className={styles.redeemCard}>
        <div className={styles.balanceHeader}>
          <span className={styles.balanceLabel}>Canjear saldo por tickets</span>
          <span className={styles.balanceIcon}>🎟️</span>
        </div>

        {walletBalance <= 0 ? (
          <p className={styles.redeemEmpty}>
            Aún no tienes saldo para canjear. ¡Gana el ranking para ganar premios! 🏆
          </p>
        ) : (
          <>
            <p className={styles.redeemHint}>
              Convierte tu saldo de premios en tickets para seguir jugando.
              <strong> 1 ticket = $1.</strong> Tienes ${walletBalance.toFixed(2)} (hasta {maxRedeem} tickets).
            </p>
            <div className={styles.withdrawRow}>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                max={maxRedeem}
                className={styles.withdrawInput}
                value={redeemTickets}
                onChange={(e) => { setRedeemTickets(e.target.value); setRedeemError(null); setRedeemOk(false); }}
                placeholder="¿Cuántos tickets?"
              />
              <Button
                variant="primary"
                onClick={handleRedeem}
                disabled={!redeemValid || redeeming}
                loading={redeeming}
                loadingText="..."
              >
                Canjear
              </Button>
            </div>
            {parsedRedeem > maxRedeem && (
              <p className={styles.withdrawWarn}>No tienes saldo suficiente para {parsedRedeem} tickets.</p>
            )}
            {redeemError && (
              <p className={styles.withdrawWarn}>{redeemError}</p>
            )}
            {redeemOk && (
              <p className={styles.redeemOk}>¡Listo! Tus tickets fueron acreditados. 🎫</p>
            )}
          </>
        )}
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
                  <Badge color="#FBBF24">{p.position}° lugar</Badge>
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

                {(t.payment_status === 'pendiente' || t.payment_status === 'validando') && (
                  <div className={styles.txPending}>
                    <span className={styles.txPendingText}>
                      ⏳ En revisión. Te sumaremos los tickets automáticamente cuando el
                      banco confirme tu pago (suele tardar 1–2 minutos).
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={recheckPayments}
                      loading={rechecking}
                      loadingText="Verificando…"
                      disabled={rechecking}
                    >
                      Verificar ahora
                    </Button>
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
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        title="Retiro solicitado"
      >
        <div className={styles.withdrawModalContent}>
          <div className={styles.withdrawModalIcon}>💸</div>
          <p>Su retiro se hará efectivo en un plazo de 15 a 30 minutos.</p>
          <Button variant="primary" fullWidth onClick={() => setShowWithdrawModal(false)}>
            Entendido
          </Button>
        </div>
      </Modal>

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
