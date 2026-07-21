'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { requestTicketsAction } from '@/actions/tickets';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import FormInput from '@/components/ui/FormInput';
import ParticleBackground from '@/components/ui/ParticleBackground';
import { TicketIcon, LogoutIcon } from '@/components/ui/icons';
import { TrophyIcon, WalletIcon } from '@/components/layout/NavIcons';
import { compressImage } from '@/lib/image';
import styles from './home.module.css';

// La página (Server Component) ya llega con perfil y torneo en el HTML —
// acá solo queda la interactividad: compra de tickets, tasa BCV y la
// suscripción Realtime que refresca el saldo al aprobarse un pago.
export default function HomeClient({ userId, initialProfile, initialTournament }) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(initialProfile);
  const [activeTournament] = useState(initialTournament);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [paymentRef, setPaymentRef] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Estado del modal de confirmación: validating → approved | pending | error.
  const [confirmState, setConfirmState] = useState('validating');
  const [confirmInfo, setConfirmInfo] = useState({ qty: 0, error: null });
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [bcvRate, setBcvRate] = useState(null);
  const [bcvRateDate, setBcvRateDate] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [compressingProof, setCompressingProof] = useState(false);

  useEffect(() => {
    // La tasa BCV solo se necesita para el modal de compra — se pide desde
    // el cliente para no retrasar el render inicial de la página.
    fetch('/api/exchange-rate')
      .then((res) => res.json())
      .then((data) => {
        if (data.rate) {
          setBcvRate(data.rate);
          setBcvRateDate(data.updatedAt);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Para que el saldo de tickets se actualice solo apenas el admin
    // aprueba/rechaza un pago, sin que el jugador tenga que recargar la
    // página para enterarse. El nombre del canal lleva un sufijo aleatorio
    // (no solo el userId) para que nunca choque con una suscripción
    // anterior del mismo usuario que todavía no haya terminado de
    // limpiarse (remount rápido, navegación de ida y vuelta) — si dos
    // efectos usan el mismo nombre de canal, supabase-js reutiliza el
    // objeto ya suscrito y el segundo .on() revienta con "cannot add
    // postgres_changes callbacks ... after subscribe()".
    const channel = supabase
      .channel(`home_profile_${userId}_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        setProfile(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleProofChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setBuyError('El comprobante debe ser una imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setBuyError('La imagen no puede pesar más de 5MB');
      return;
    }
    setBuyError(null);
    setCompressingProof(true);
    const compressed = await compressImage(file);
    setCompressingProof(false);

    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(compressed);
    setProofPreview(URL.createObjectURL(compressed));
  }

  function handleRemoveProof() {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofFile(null);
    setProofPreview(null);
  }

  async function handleBuyTickets() {
    if (!paymentRef.trim()) return;
    setBuying(true);
    setBuyError(null);
    try {
      let paymentProofPath = null;

      if (proofFile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const path = `${user.id}/${Date.now()}-${proofFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-proofs')
          .upload(path, proofFile);

        if (uploadError) {
          setBuyError('No se pudo subir el comprobante. Intenta de nuevo.');
          return;
        }
        paymentProofPath = path;
      }

      // Se abre el modal en "validando" mientras la solicitud consulta el banco
      // (puede tardar unos segundos). Luego cambia solo a aprobado / en revisión.
      setShowPaymentModal(false);
      setConfirmState('validating');
      setConfirmInfo({ qty: ticketQuantity, error: null });
      setShowConfirmModal(true);

      const { error, status, ticket } = await requestTicketsAction({
        tournamentId: activeTournament?.id || null,
        quantity: ticketQuantity,
        paymentReference: paymentRef,
        paymentProofPath,
      });

      if (error) {
        setConfirmInfo({ qty: ticketQuantity, error });
        setConfirmState('error');
        return;
      }

      setConfirmInfo({ qty: ticket?.quantity ?? ticketQuantity, error: null });
      setConfirmState(status === 'aprobado' ? 'approved' : 'pending');
      setPaymentRef('');
      handleRemoveProof();
    } catch (err) {
      console.error('Error buying tickets:', err);
      setConfirmInfo({ qty: ticketQuantity, error: 'No se pudo enviar la solicitud. Intenta de nuevo.' });
      setConfirmState('error');
    } finally {
      setBuying(false);
    }
  }

  const CONFIRM_TITLES = {
    validating: 'Validando pago',
    approved: '¡Pago aprobado!',
    pending: 'Pago en revisión',
    error: 'No se pudo procesar',
  };

  function formatBs(usdAmount) {
    if (!bcvRate) return null;
    return (usdAmount * bcvRate).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function handlePlay() {
    // No bloqueamos por tickets_balance <= 0 acá: el jugador puede tener una
    // partida en_curso ya pagada esperando por retomar (ej. gastó su último
    // ticket y salió sin terminarla) — es /jugar quien le pregunta al
    // servidor y decide si hay que cobrar, retomar gratis, o mostrar que de
    // verdad no quedan tickets.
    router.push('/jugar');
  }

  function handlePractice() {
    router.push('/jugar?modo=practica');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
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
          className={styles.playCardBtn}
          onClick={handlePlay}
          disabled={!profile}
        >
          <div className={styles.playCardArtWrap}>
            <div className={styles.playCardGlow} />
            <Image
              src="/cards/animales/anim_fox.png"
              alt=""
              width={120}
              height={160}
              className={styles.playCardArt}
            />
          </div>
          <span className={styles.playCardCta}>▶ COMPETIR</span>
        </button>

        {profile?.tickets_balance <= 0 && (
          <span className={styles.playCardWarning}>⚠️ Sin tickets — compra para jugar</span>
        )}

        <button className={styles.practiceBtn} onClick={handlePractice}>
          PRACTICAR
        </button>

        {/* Antes estaban en el menú inferior (ya eliminado); ahora se accede
            desde aquí. Más pequeños y separados de Competir/Practicar. */}
        <div className={styles.secondaryNav}>
          <button className={styles.secondaryNavBtn} onClick={() => router.push('/ranking')}>
            <TrophyIcon className={styles.secondaryNavIcon} />
            Ranking
          </button>
          <button className={styles.secondaryNavBtn} onClick={() => router.push('/billetera')}>
            <WalletIcon className={styles.secondaryNavIcon} />
            Billetera
          </button>
        </div>
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

          <div className={styles.bankDetails}>
            <p className={styles.bankDetailsTitle}>Datos para el pago</p>
            <div className={styles.bankDetailsRow}>
              <span>Banco</span>
              <strong>Banco de Venezuela</strong>
            </div>
            <div className={styles.bankDetailsRow}>
              <span>Teléfono</span>
              <strong>04220165513</strong>
            </div>
            <div className={styles.bankDetailsRow}>
              <span>C.I.</span>
              <strong>26725053</strong>
            </div>
            <div className={styles.bankDetailsRow}>
              <span>Concepto</span>
              <strong>Pago</strong>
            </div>
          </div>

          {buyError && <div className={styles.error}>{buyError}</div>}
          <FormInput
            label="Referencia de pago"
            type="text"
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Número de referencia o comprobante"
          />

          <div className={styles.proofGroup}>
            <label className={styles.proofLabel}>Captura del pago (opcional)</label>
            {compressingProof ? (
              <div className={styles.proofUploadBtn}>Comprimiendo imagen...</div>
            ) : proofPreview ? (
              <div className={styles.proofPreviewWrap}>
                <img src={proofPreview} alt="Comprobante" className={styles.proofPreview} />
                <button type="button" className={styles.proofRemoveBtn} onClick={handleRemoveProof}>
                  Quitar
                </button>
              </div>
            ) : (
              <label className={styles.proofUploadBtn}>
                📎 Adjuntar imagen
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProofChange}
                  className={styles.proofInput}
                />
              </label>
            )}
          </div>

          <Button
            variant="primary"
            fullWidth
            onClick={handleBuyTickets}
            disabled={buying || compressingProof || !paymentRef.trim()}
            loading={buying}
            loadingText="Enviando..."
          >
            Enviar solicitud de pago
          </Button>
        </div>
      </Modal>

      {/* Confirmation Modal — reactivo: validando → aprobado / en revisión */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => { if (confirmState !== 'validating') setShowConfirmModal(false); }}
        title={CONFIRM_TITLES[confirmState]}
      >
        {confirmState === 'validating' && (
          <div className={styles.confirmContent}>
            <Spinner />
            <p>Validando tu pago…</p>
            <p className={styles.confirmNote}>
              Esto puede tardar unos segundos. No cierres esta ventana.
            </p>
          </div>
        )}

        {confirmState === 'approved' && (
          <div className={styles.confirmContent}>
            <div className={styles.confirmIcon}>🎉</div>
            <p>
              ¡Pago aprobado! Se sumaron <strong>{confirmInfo.qty}</strong>{' '}
              {confirmInfo.qty === 1 ? 'ticket' : 'tickets'} a tu cuenta.
            </p>
            <p className={styles.confirmNote}>Ya puedes jugar. ¡Mucha suerte!</p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => { setShowConfirmModal(false); router.push('/jugar'); }}
            >
              ▶ Jugar ahora
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setShowConfirmModal(false)}>
              Cerrar
            </Button>
          </div>
        )}

        {confirmState === 'pending' && (
          <div className={styles.confirmContent}>
            <div className={styles.confirmIcon}>🕒</div>
            <p>Tu pago quedó en revisión.</p>
            <p className={styles.confirmNote}>
              Puede tardar unos minutos. Te sumaremos los tickets apenas se apruebe —
              no necesitas hacer nada, se actualizará solo.
            </p>
            <Button variant="primary" fullWidth onClick={() => setShowConfirmModal(false)}>
              Listo
            </Button>
          </div>
        )}

        {confirmState === 'error' && (
          <div className={styles.confirmContent}>
            <div className={styles.confirmIcon}>⚠️</div>
            <p>{confirmInfo.error}</p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => { setShowConfirmModal(false); setShowPaymentModal(true); }}
            >
              Volver
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
