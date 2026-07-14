'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { requestTicketsAction } from '@/actions/tickets';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import FormInput from '@/components/ui/FormInput';
import ParticleBackground from '@/components/ui/ParticleBackground';
import { TicketIcon, LogoutIcon } from '@/components/ui/icons';
import styles from './home.module.css';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const initRef = useRef(false);
  const [profile, setProfile] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [paymentRef, setPaymentRef] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [bcvRate, setBcvRate] = useState(null);
  const [bcvRateDate, setBcvRateDate] = useState(null);

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

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadData();

    fetch('/api/exchange-rate')
      .then((res) => res.json())
      .then((data) => {
        if (data.rate) {
          setBcvRate(data.rate);
          setBcvRateDate(data.updatedAt);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  function formatBs(usdAmount) {
    if (!bcvRate) return null;
    return (usdAmount * bcvRate).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function handlePlay() {
    if (!profile || profile.tickets_balance <= 0) return;
    router.push('/jugar');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <Spinner />
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ParticleBackground />

      <div className={styles.content}>
      {/* Hero */}
      <div className={styles.hero}>
        <button
          className={styles.logoutBtn}
          onClick={handleLogout}
          aria-label="Cerrar sesión"
        >
          <LogoutIcon className={styles.logoutIcon} />
        </button>
        <h1 className={styles.heroTitle}>Bienvenido, {profile?.nombre || 'viajero'}</h1>
      </div>

      {/* Play Card — the visual centerpiece, fills the remaining space */}
      <div className={styles.playCard}>
        <div className={styles.playCardOrbit} />
        {activeTournament && (
          <span className={styles.playCardBadge}>🏆 {activeTournament.nombre}</span>
        )}

        <button
          className={`${styles.playCardBtn} ${(!profile || profile.tickets_balance <= 0) ? styles.disabled : ''}`}
          onClick={handlePlay}
          disabled={!profile || profile.tickets_balance <= 0}
        >
          <div className={styles.playCardArtWrap}>
            <div className={styles.playCardGlow} />
            <Image
              src="/cards/tecnologia/back_tecnologia.png"
              alt=""
              width={120}
              height={160}
              className={styles.playCardArt}
            />
          </div>
          <span className={styles.playCardCta}>▶ JUGAR</span>
        </button>

        {profile?.tickets_balance <= 0 && (
          <span className={styles.playCardWarning}>⚠️ Sin tickets — compra para jugar</span>
        )}
      </div>

      {/* Tickets + Buy, side by side */}
      <div className={styles.bottomRow}>
        <div className={styles.ticketsCard}>
          <div className={styles.ticketsIconWrap}>
            <TicketIcon className={styles.ticketsIcon} />
          </div>
          <div className={styles.ticketsInfo}>
            <span className={styles.ticketsLabel}>Tickets</span>
            <span className={styles.ticketsValue}>{profile?.tickets_balance || 0}</span>
          </div>
        </div>

        <Button variant="accent" onClick={() => setShowPaymentModal(true)} className={styles.buyBtn}>
          <span className={styles.buyBtnContent}>
            <TicketIcon className={styles.buyBtnIcon} />
            Comprar
          </span>
        </Button>
      </div>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Comprar Tickets"
      >
        <div className={styles.paymentForm}>
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

          <div className={styles.priceBreakdown}>
            <div className={styles.priceRow}>
              <span>Precio unitario</span>
              <span>
                $1.00{bcvRate && <span className={styles.priceBs}> (Bs. {formatBs(1)})</span>}
              </span>
            </div>
            <div className={styles.priceRow}>
              <span>Cantidad</span>
              <span>×{ticketQuantity}</span>
            </div>
            <div className={styles.priceDivider} />
            <div className={styles.priceTotal}>
              <span>Total</span>
              <span>
                ${(ticketQuantity * 1.00).toFixed(2)}
                {bcvRate && <span className={styles.priceBs}> (Bs. {formatBs(ticketQuantity)})</span>}
              </span>
            </div>
            {bcvRate && (
              <p className={styles.bcvNote}>
                Tasa BCV: Bs. {formatBs(1)} / USD
                {bcvRateDate && ` — actualizada el ${new Date(bcvRateDate).toLocaleDateString('es-VE')}`}
              </p>
            )}
          </div>

          <p className={styles.paymentInfo}>
            Transfiere <strong>${(ticketQuantity * 1.00).toFixed(2)} USD</strong>
            {bcvRate && <> (<strong>Bs. {formatBs(ticketQuantity)}</strong>)</>} y coloca la referencia del pago
          </p>
          {buyError && <div className={styles.error}>{buyError}</div>}
          <FormInput
            label="Referencia de pago"
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Número de referencia o comprobante"
          />
          <Button
            variant="primary"
            fullWidth
            onClick={handleBuyTickets}
            disabled={buying || !paymentRef.trim()}
            loading={buying}
            loadingText="Enviando..."
          >
            Enviar solicitud de pago
          </Button>
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
          <Button variant="primary" fullWidth onClick={() => setShowConfirmModal(false)}>
            Listo
          </Button>
        </div>
      </Modal>
    </div>
  );
}
