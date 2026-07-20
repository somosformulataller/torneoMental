'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { startGameAction, endGameAction, recordMatchAction } from '@/actions/games';
import { generateCardPairs } from '@/lib/gameLogic';
import { playFlip, playMatch, playMismatch, startBgMusic, stopBgMusic } from '@/lib/sfx';
import { vibrateMatch, vibrateMismatch } from '@/lib/haptics';
import Card from '@/components/game/Card';
import ScorePopup from '@/components/game/ScorePopup';
import GameResultModal from '@/components/game/GameResultModal';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Spinner from '@/components/ui/Spinner';
import ParticleBackground from '@/components/ui/ParticleBackground';
import { TicketIcon } from '@/components/ui/icons';
import styles from './jugar.module.css';

// Deterministic per-card jitter — purely a `transform` (rotate/x/y), never
// layout (margin/size). The board's column count comes entirely from
// .cardGrid's CSS Grid math (see jugar.module.css), so this jitter can
// visually break up the "rows" look without ever risking pushing a card
// into an extra column that overflows the screen.
const SCATTER_VARIANTS = [
  { rotate: -7, x: -4, y: -8 },
  { rotate: 5, x: 5, y: 6 },
  { rotate: -9, x: -6, y: -5 },
  { rotate: 8, x: 3, y: 9 },
  { rotate: -4, x: 6, y: -7 },
  { rotate: 6, x: -5, y: 4 },
  { rotate: -6, x: 2, y: -9 },
  { rotate: 9, x: -3, y: 7 },
  { rotate: -3, x: 4, y: -4 },
  { rotate: 4, x: -6, y: 8 },
  { rotate: -8, x: 6, y: -6 },
  { rotate: 7, x: -2, y: 5 },
];

function getScatter(index) {
  return SCATTER_VARIANTS[index % SCATTER_VARIANTS.length];
}

// Mensajes del popup: los de fallo avanzan en secuencia con cada error de la
// partida (y vuelven a empezar); los de acierto van rotando como refuerzo.
const MISS_MESSAGES = [
  '✗ ¡Ups! No era pareja',
  '✗ ¡Concéntrate!',
  '✗ ¡Fíjate bien dónde está cada carta!',
  '✗ ¡Respira… y haz memoria!',
  '✗ ¡Cada fallo te cuesta tiempo!',
];
const MATCH_MESSAGES = [
  '¡Excelente!',
  '¡Muy bien!',
  '¡Qué memoria!',
  '¡Genial!',
  '¡Sigue así!',
  '¡Brillante!',
];

// Únicos temas con diseños de carta disponibles. La temática debe cambiar
// siempre entre partidas para que el jugador nunca memorice las cartas.
const ALL_THEMES = ['tecnologia', 'naturaleza', 'animales'];

// Tamaño de tablero para el modo práctica cuando no hay ningún torneo
// activo del cual tomar el card_count (si lo hay, se usa ese en su lugar,
// para que el tablero de práctica coincida con el del torneo real).
const PRACTICE_CARD_COUNT = 14;

function pickNextTheme(lastTheme) {
  const candidates = lastTheme ? ALL_THEMES.filter((t) => t !== lastTheme) : ALL_THEMES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function formatStopwatch(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// La página (Server Component) ya trae perfil y torneo activo resueltos, y
// en modo práctica también el tablero inicial ya barajado — así la práctica
// arranca sin espera. En modo torneo la única espera que queda es
// startGameAction: la transacción que descuenta el ticket (o retoma una
// partida en_curso ya pagada) TIENE que seguir siendo una acción disparada
// por el cliente al montar — nunca parte del render del servidor, porque
// Next puede pre-cargar la página sin que el jugador haya tocado "COMPETIR"
// y eso cobraría tickets solos.
//
// isPractice llega como prop desde el servidor (no useSearchParams: ese
// hook suspende durante el render en servidor y obligaría a un <Suspense>
// cuyo fallback-spinner es justo lo que queremos eliminar).
export default function JugarClient({ isPractice, initialProfile, initialTournament, initialUpcomingTournament, initialPracticeBoard }) {
  const router = useRouter();
  const gameStartTime = useRef(null);
  const initRef = useRef(false);
  const lastThemeRef = useRef(null);
  const practiceCardCountRef = useRef(null);
  const [profile, setProfile] = useState(initialProfile);
  const [tournament, setTournament] = useState(null);
  const [gameId, setGameId] = useState(null);
  // En práctica el tablero viene del servidor: el HTML llega con las cartas
  // ya pintadas y el estado arranca directamente en 'playing'.
  const [cards, setCards] = useState(initialPracticeBoard || []);
  const [flippedCards, setFlippedCards] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [gameStatus, setGameStatus] = useState(initialPracticeBoard ? 'playing' : 'loading'); // loading, no_tournament, no_tickets, playing, finished
  const [resultType, setResultType] = useState(null); // 'match', 'no_match', null
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [finishReason, setFinishReason] = useState(null); // 'completed' | 'timeout'
  const [finishedTimeMs, setFinishedTimeMs] = useState(null);
  const [finishedPairs, setFinishedPairs] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [shake, setShake] = useState(false);
  const [popup, setPopup] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const missCountRef = useRef(0);

  useEffect(() => {
    // Guard against React Strict Mode's dev-only double-invoke: initGame()
    // calls startGameAction(), which consumes a ticket and creates a game
    // row — it must never run twice for a single page visit.
    if (initRef.current) return;
    initRef.current = true;
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!popup) return;
    // El mensaje de fallo es una frase completa: se le da más tiempo de lectura.
    const t = setTimeout(() => setPopup(null), popup.variant === 'miss' ? 2000 : 900);
    return () => clearTimeout(t);
  }, [popup]);

  useEffect(() => {
    if (gameStatus !== 'playing') return;
    const interval = setInterval(() => {
      if (gameStartTime.current) {
        setElapsedMs(Date.now() - gameStartTime.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameStatus]);

  useEffect(() => {
    if (gameStatus === 'playing') {
      startBgMusic();
    } else {
      stopBgMusic();
    }
    return () => stopBgMusic();
  }, [gameStatus]);

  async function initGame() {
    try {
      if (isPractice) {
        // "Jugar de nuevo" regenera el tablero con el mismo tamaño que el
        // que armó el servidor (que ya consideró torneos activos Y
        // programados); initialTournament solo trae los activos.
        practiceCardCountRef.current =
          initialPracticeBoard?.length || initialTournament?.card_count || null;
        if (initialPracticeBoard?.length) {
          // El tablero ya vino renderizado desde el servidor; solo falta
          // arrancar el cronómetro y recordar el tema para la próxima.
          lastThemeRef.current = initialPracticeBoard[0]?.theme || null;
          gameStartTime.current = Date.now();
          return;
        }
        startPracticeGame(practiceCardCountRef.current);
        return;
      }

      if (!initialTournament) {
        setGameStatus('no_tournament');
        return;
      }

      setTournament(initialTournament);

      // No cortamos acá por tickets_balance <= 0: puede que el jugador ya
      // tenga una partida en_curso pagada (ej. gastó su último ticket,
      // salió a Inicio sin terminarla) que start_game() debe retomar GRATIS.
      // Es el servidor quien decide si hay que cobrar o no; si de verdad no
      // hay tickets ni partida para retomar, startGame() abajo cae al
      // mensaje de "no_tickets" con el error real que devuelve la RPC.
      await startGame(initialTournament);
    } catch (err) {
      console.error('Error initializing game:', err);
      setErrorMsg('No se pudo iniciar el juego. Intenta de nuevo.');
    }
  }

  function startPracticeGame(cardCount) {
    setErrorMsg(null);

    const theme = pickNextTheme(lastThemeRef.current);
    lastThemeRef.current = theme;

    const cardPairs = generateCardPairs(theme, cardCount || PRACTICE_CARD_COUNT);
    setCards(cardPairs);

    setGameId(null);
    setMatchedPairs([]);
    setFlippedCards([]);
    setStreak(0);
    setBestStreak(0);
    setElapsedMs(0);
    gameStartTime.current = Date.now();
    setGameStatus('playing');
  }

  async function startGame(tournamentData) {
    const tourn = tournamentData || tournament;
    setErrorMsg(null);

    // Se genera un tablero por si hace falta una partida NUEVA — start_game()
    // lo descarta y devuelve el guardado si ya había una en_curso (resume).
    const theme = pickNextTheme(lastThemeRef.current);
    const freshLayout = generateCardPairs(theme, tourn.card_count);

    const { game, profile: updatedProfile, error } = await startGameAction(tourn.id, freshLayout);

    if (error || !game) {
      console.error('Error starting game:', error);
      setErrorMsg(error || 'No se pudo iniciar la partida.');
      setGameStatus('no_tickets');
      return;
    }

    if (updatedProfile) setProfile(updatedProfile);

    // El tablero real siempre viene del servidor: en una partida nueva es el
    // recién barajado de arriba; si se retoma una en_curso, es el guardado.
    const cardPairs = game.card_layout || freshLayout;
    lastThemeRef.current = cardPairs[0]?.theme || theme;
    setCards(cardPairs);

    setGameId(game.id);
    setMatchedPairs(game.matched_pair_ids || []);
    setFlippedCards([]);
    setStreak(0);
    setBestStreak(0);
    // El cronómetro arranca en la fecha real de creación de la partida, así
    // que si se retoma una en_curso el tiempo transcurrido sigue corriendo
    // (es una competencia por tiempo, no se "pausa" saliendo de la app).
    gameStartTime.current = new Date(game.created_at).getTime();
    setElapsedMs(Date.now() - gameStartTime.current);
    setGameStatus('playing');
  }

  const handleCardClick = useCallback((index) => {
    if (isProcessing) return;
    if (flippedCards.includes(index)) return;
    if (matchedPairs.includes(cards[index]?.pairId)) return;
    if (gameStatus !== 'playing') return;

    const newFlipped = [...flippedCards, index];
    setFlippedCards(newFlipped);
    playFlip();

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      const [first, second] = newFlipped;
      const card1 = cards[first];
      const card2 = cards[second];

      if (card1.pairId === card2.pairId) {
        // MATCH: queda revelado, sigue jugando
        setTimeout(() => {
          const newMatched = [...matchedPairs, card1.pairId];
          setMatchedPairs(newMatched);
          if (!isPractice && gameId) {
            // Se guarda en segundo plano — si falla, no bloquea el juego;
            // en el peor caso ese par no sobrevive un cierre de la app.
            recordMatchAction(gameId, card1.pairId).catch((err) => {
              console.error('Error recording match:', err);
            });
          }
          setResultType('match');
          setFlippedCards([]);
          setIsProcessing(false);
          setTimeout(() => setResultType(null), 900);

          playMatch();
          vibrateMatch();
          setStreak((s) => {
            const next = s + 1;
            setBestStreak((best) => Math.max(best, next));
            const cheer = MATCH_MESSAGES[(newMatched.length - 1) % MATCH_MESSAGES.length];
            setPopup({
              id: `${Date.now()}-${newMatched.length}`,
              text: next >= 2 ? `+10 🔥 Racha x${next} ${cheer}` : `+10 ${cheer}`,
            });
            return next;
          });

          const totalPairsInBoard = cards.length / 2;
          if (newMatched.length >= totalPairsInBoard) {
            setTimeout(() => finishGame('completed', newMatched.length), 500);
          }
        }, 600);
      } else {
        // NO MATCH: se voltean de nuevo, puede seguir intentando
        setTimeout(() => {
          setResultType('no_match');
          playMismatch();
          vibrateMismatch();
          setStreak(0);
          missCountRef.current += 1;
          setPopup({
            id: `miss-${Date.now()}`,
            text: MISS_MESSAGES[(missCountRef.current - 1) % MISS_MESSAGES.length],
            variant: 'miss',
          });
          setShake(true);
          setTimeout(() => setShake(false), 1800);
          setTimeout(() => {
            setFlippedCards([]);
            setIsProcessing(false);
            setResultType(null);
          }, 1000);
        }, 500);
      }
    }
  }, [flippedCards, matchedPairs, cards, isProcessing, gameStatus, isPractice, gameId]);

  async function finishGame(reason, pairsMatched) {
    const timeMs = gameStartTime.current ? Date.now() - gameStartTime.current : null;

    if (isPractice) {
      setFinishReason(reason);
      setFinishedTimeMs(timeMs);
      setFinishedPairs(pairsMatched);
      setGameStatus('finished');
      setShowResult(true);
      return;
    }

    if (!gameId) return;

    const { game, error } = await endGameAction({
      gameId,
      pairsMatched,
      timeMs,
    });

    if (error) {
      console.error('Error ending game:', error);
      setErrorMsg(error);
    }

    const registeredPairs = game?.pairs_matched ?? pairsMatched;
    setFinishReason(reason);
    setFinishedTimeMs(game?.total_time_ms ?? timeMs);
    setFinishedPairs(registeredPairs);
    setGameStatus('finished');
    setShowResult(true);
  }

  function handleTournamentEnd() {
    if (gameStatus === 'playing') {
      finishGame('timeout', matchedPairs.length);
    }
  }

  async function handlePlayAgain() {
    if (isPractice) {
      setShowResult(false);
      setFinishReason(null);
      startPracticeGame(practiceCardCountRef.current);
      return;
    }
    if (!profile || profile.tickets_balance <= 0 || !tournament) {
      router.push('/home');
      return;
    }
    setShowResult(false);
    setFinishReason(null);
    await startGame(tournament);
  }

  function getTournamentEndTime() {
    if (!tournament) return null;
    const start = new Date(tournament.start_time);
    return new Date(start.getTime() + tournament.duration_minutes * 60000).toISOString();
  }

  // Loading state
  if (gameStatus === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <Spinner size={48} />
        <p>Preparando el juego...</p>
      </div>
    );
  }

  // No tournament — si hay uno programado, se muestra el mismo cronómetro
  // de "inicia en" que usa Ranking en vez del mensaje genérico.
  if (gameStatus === 'no_tournament') {
    return (
      <div className={styles.messageScreen}>
        <div className={styles.messageIcon}>🏆</div>
        {initialUpcomingTournament ? (
          <>
            <h2>El nuevo torneo inicia en:</h2>
            <CountdownTimer endTime={initialUpcomingTournament.start_time} />
            <p>{initialUpcomingTournament.nombre}</p>
          </>
        ) : (
          <>
            <h2>No hay torneo activo</h2>
            <p>Espera a que se inicie un torneo para jugar.</p>
          </>
        )}
        <button className={styles.backBtn} onClick={() => router.push('/home')}>Volver</button>
      </div>
    );
  }

  // No tickets
  if (gameStatus === 'no_tickets') {
    return (
      <div className={styles.messageScreen}>
        <TicketIcon className={styles.messageIconTicket} />
        <h2>Juego de Memoria</h2>
        <p className={styles.gameRule}>
          Voltea cartas y encuentra los pares iguales.<br />
          Gana quien encuentre más pares en menos tiempo.
        </p>
        <div className={styles.alertBox}>
          {errorMsg || '⚠️ No te quedan tickets. ¡Compra más!'}
        </div>
        <button className={styles.backBtn} onClick={() => router.push('/home')}>Volver</button>
      </div>
    );
  }

  const totalPairs = cards.length / 2;

  return (
    <div className={`${styles.container} ${shake ? styles.shake : ''}`}>
      <ParticleBackground />
      <ScorePopup popup={popup} />

      {/* Small elapsed-time stopwatch */}
      <div className={styles.stopwatch}>⏱ {formatStopwatch(elapsedMs)}</div>

      {/* Small pairs-found counter */}
      <div className={styles.pairsChip}>
        🃏{' '}
        <span
          className={resultType === 'match' ? styles.pairsBump : ''}
          key={matchedPairs.length}
        >
          {matchedPairs.length}/{totalPairs}
        </span>
      </div>

      {/* Card Grid — forced to exactly 3 columns; see .cardGrid comment. */}
      <div
        className={styles.cardGrid}
        style={{ '--card-rows': Math.ceil(cards.length / 3) || 1 }}
      >
        {cards.map((card, index) => (
          <Card
            key={`${card.id}-${index}`}
            card={card}
            index={index}
            isFlipped={flippedCards.includes(index) || matchedPairs.includes(card.pairId)}
            isMatched={matchedPairs.includes(card.pairId)}
            onClick={() => handleCardClick(index)}
            disabled={isProcessing || gameStatus !== 'playing'}
            scatter={getScatter(index)}
          />
        ))}
      </div>

      {/* Tournament countdown — kept mounted only to auto-finish the game
          when the tournament ends (onComplete). No visible box on screen
          so it doesn't crowd the scattered board or the stopwatch. */}
      {getTournamentEndTime() && (
        <div className={styles.countdownHidden}>
          <CountdownTimer
            endTime={getTournamentEndTime()}
            onComplete={handleTournamentEnd}
            tickSound
          />
        </div>
      )}

      {/* Game Result Modal */}
      <GameResultModal
        isOpen={showResult}
        pairsMatched={finishedPairs}
        totalPairs={totalPairs}
        timeMs={finishedTimeMs}
        onPlayAgain={handlePlayAgain}
        onGoBack={() => router.push('/home')}
        ticketsRemaining={profile?.tickets_balance || 0}
        reason={finishReason}
        maxStreak={bestStreak}
        isPractice={isPractice}
      />
    </div>
  );
}
