'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { requestTicketsAction } from '@/actions/tickets';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Modal from '@/components/ui/Modal';
import styles from './home.module.css';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [paymentRef, setPaymentRef] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);

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

      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('*')
        .in('status', ['programado', 'activo'])
        .order('start_time', { ascending: true })
        .limit(1);

      if (tournaments?.length > 0) {
        setActiveTournament(tournaments[0]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleBuyTickets() {
    if (!paymentRef.trim()) return;
    setBuying(true);
    setBuyError(null);
    try {
      const { error } = await requestTicketsAction({
        tournamentId: activeTournament?.id || null,
        quantity: ticketQuantity,
        paymentReference: paymentRef,
      });

      if (error) {
        setBuyError(error);
        return;
      }
      setShowPaymentModal(false);
      setShowConfirmModal(true);
      setPaymentRef('');
    } catch (err) {
      console.error('Error buying tickets:', err);
      setBuyError('No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setBuying(false);
    }
  }

  function handlePlay() {
    if (!profile || profile.tickets_balance <= 0) return;
    router.push('/jugar');
  }

  function getTournamentTimeLabel() {
    if (!activeTournament) return null;
    const now = new Date();
    const start = new Date(activeTournament.start_time);
    const end = new Date(start.getTime() + activeTournament.duration_minutes * 60000);

    if (now < start) {
      return { label: 'INICIA EN', time: start.toISOString() };
    } else if (now < end) {
      return { label: 'TERMINA EN', time: end.toISOString() };
    }
    return null;
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p>Cargando...</p>
      </div>
    );
  }

  const tournamentTime = getTournamentTimeLabel();

  return (
    <div className={styles.container}>
      {/* Header Stats */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>🎫 Tickets</span>
          <span className={styles.statValue}>{profile?.tickets_balance || 0}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>💰 Saldo</span>
          <span className={styles.statValue}>${(profile?.tickets_balance * 1.00 || 0).toFixed(2)}</span>
        </div>
      </div>

      {/* Tournament Info */}
      {activeTournament && (
        <div className={styles.tournamentCard}>
          <h3 className={styles.tournamentName}>{activeTournament.nombre}</h3>
          <div className={styles.tournamentTheme}>
            🎴 Temática: {activeTournament.card_theme === 'aleatorio' ? '🎲 Aleatorio' : activeTournament.card_theme}
          </div>
          {tournamentTime && (
            <CountdownTimer
              endTime={tournamentTime.time}
              label={tournamentTime.label}
              onComplete={loadData}
            />
          )}
        </div>
      )}

      {/* Play Button */}
      <button
        className={`${styles.playButton} ${(!profile || profile.tickets_balance <= 0) ? styles.disabled : ''}`}
        onClick={handlePlay}
        disabled={!profile || profile.tickets_balance <= 0}
      >
        <span className={styles.playIcon}>🎮</span>
        <span className={styles.playText}>JUGAR</span>
      </button>

      {profile?.tickets_balance <= 0 && (
        <p className={styles.noTicketsWarning}>
          ⚠️ No te quedan tickets. ¡Compra más para jugar!
        </p>
      )}

      {/* Quick Actions */}
      <div className={styles.quickActions}>
        <button className={styles.actionCard} onClick={() => router.push('/ranking')}>
          <span className={styles.actionIcon}>🏆</span>
          <span>Ranking</span>
        </button>
        <button className={styles.actionCard} onClick={() => router.push('/billetera')}>
          <span className={styles.actionIcon}>💳</span>
          <span>Billetera</span>
        </button>
      </div>

      {/* Buy Tickets Section */}
      <div className={styles.buySection}>
        <h3 className={styles.sectionTitle}>Comprar Tickets</h3>
        <p className={styles.priceInfo}>1 ticket = $1.00 USD</p>

        <div className={styles.ticketSelector}>
          <button
            className={styles.qtyBtn}
            onClick={() => setTicketQuantity(Math.max(1, ticketQuantity - 1))}
          >−</button>
          <span className={styles.qtyValue}>{ticketQuantity}</span>
          <button
            className={styles.qtyBtn}
            onClick={() => setTicketQuantity(ticketQuantity + 1)}
          >+</button>
        </div>

        <div className={styles.totalPrice}>
          Total: <strong>${(ticketQuantity * 1.00).toFixed(2)} USD</strong>
        </div>

        <button
          className={styles.buyButton}
          onClick={() => setShowPaymentModal(true)}
        >
          Comprar {ticketQuantity} {ticketQuantity === 1 ? 'ticket' : 'tickets'}
        </button>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Datos de Pago"
      >
        <div className={styles.paymentForm}>
          <p className={styles.paymentInfo}>
            Transfiere <strong>${(ticketQuantity * 1.00).toFixed(2)} USD</strong> y coloca la referencia del pago
          </p>
          {buyError && <div className={styles.error || ''}>{buyError}</div>}
          <div className={styles.formGroup}>
            <label>Referencia de pago</label>
            <input
              type="text"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="Número de referencia o comprobante"
              className={styles.input}
            />
          </div>
          <div className={styles.formGroup}>
            <label>Cantidad de tickets</label>
            <input
              type="number"
              value={ticketQuantity}
              readOnly
              className={styles.input}
            />
          </div>
          <button
            className={styles.submitPayment}
            onClick={handleBuyTickets}
            disabled={buying || !paymentRef.trim()}
          >
            {buying ? 'Enviando...' : 'Enviar solicitud de pago'}
          </button>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Solicitud enviada"
      >
        <div className={styles.confirmContent}>
          <div className={styles.confirmIcon}>✅</div>
          <p>Solicitud enviada. Estamos validando tu pago en segundo plano...</p>
          <p className={styles.confirmNote}>
            El resultado se reflejará en minutos en tu historial.
          </p>
          <button
            className={styles.confirmBtn}
            onClick={() => setShowConfirmModal(false)}
          >
            Listo
          </button>
        </div>
      </Modal>
    </div>
  );
}
