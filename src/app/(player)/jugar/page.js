'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { startGameAction, endGameAction } from '@/actions/games';
import { generateCardPairs } from '@/lib/gameLogic';
import { playFlip, playMatch, playMismatch } from '@/lib/sfx';
import { vibrateMatch, vibrateMismatch } from '@/lib/haptics';
import Card from '@/components/game/Card';
import ScorePopup from '@/components/game/ScorePopup';
import GameResultModal from '@/components/game/GameResultModal';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Spinner from '@/components/ui/Spinner';
import ParticleBackground from '@/components/ui/ParticleBackground';
import styles from './jugar.module.css';

// Deterministic per-card jitter. marginBottom is what actually breaks the
// "rows" look: cards flow into masonry columns (see .cardGrid), so a taller
// gap under one card pushes everything below it down that column — some
// cards end up sitting noticeably higher/lower than their neighbors instead
// of lining up on a shared row baseline.
const SCATTER_VARIANTS = [
  { rotate: -7, x: -4, marginBottom: 4 },
  { rotate: 5, x: 5, marginBottom: 48 },
  { rotate: -9, x: -6, marginBottom: 22 },
  { rotate: 8, x: 3, marginBottom: 60 },
  { rotate: -4, x: 6, marginBottom: 10 },
  { rotate: 6, x: -5, marginBottom: 36 },
  { rotate: -6, x: 2, marginBottom: 52 },
  { rotate: 9, x: -3, marginBottom: 6 },
  { rotate: -3, x: 4, marginBottom: 44 },
  { rotate: 4, x: -6, marginBottom: 18 },
  { rotate: -8, x: 6, marginBottom: 30 },
  { rotate: 7, x: -2, marginBottom: 56 },
];

function getScatter(index) {
  return SCATTER_VARIANTS[index % SCATTER_VARIANTS.length];
}

// Únicos temas con diseños de carta disponibles. La temática debe cambiar
// siempre entre partidas para que el jugador nunca memorice las cartas.
const ALL_THEMES = ['tecnologia', 'naturaleza', 'animales'];

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

export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();
  const gameStartTime = useRef(null);
  const initRef = useRef(false);
  const lastThemeRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [cards, setCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [gameStatus, setGameStatus] = useState('loading'); // loading, no_tournament, no_tickets, playing, finished
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
    const t = setTimeout(() => setPopup(null), 900);
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

  async function initGame() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(profileData);

      // Get active tournament
      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('*')
        .eq('status', 'activo')
        .order('start_time', { ascending: true })
        .limit(1);

      if (!tournaments?.length) {
        setGameStatus('no_tournament');
        return;
      }

      const activeTournament = tournaments[0];
      setTournament(activeTournament);

      if (!profileData || profileData.tickets_balance <= 0) {
        setGameStatus('no_tickets');
        return;
      }

      // Start the game
      await startGame(activeTournament);
    } catch (err) {
      console.error('Error initializing game:', err);
      setErrorMsg('No se pudo iniciar el juego. Intenta de nuevo.');
    }
  }

  async function startGame(tournamentData) {
    const tourn = tournamentData || tournament;
    setErrorMsg(null);

    const { game, profile: updatedProfile, error } = await startGameAction(tourn.id);

    if (error || !game) {
      console.error('Error starting game:', error);
      setErrorMsg(error || 'No se pudo iniciar la partida.');
      setGameStatus('no_tickets');
      return;
    }

    if (updatedProfile) setProfile(updatedProfile);

    const theme = pickNextTheme(lastThemeRef.current);
    lastThemeRef.current = theme;

    const cardPairs = generateCardPairs(theme, tourn.card_count);
    setCards(cardPairs);

    setGameId(game.id);
    setMatchedPairs([]);
    setFlippedCards([]);
    setStreak(0);
    setBestStreak(0);
    setElapsedMs(0);
    gameStartTime.current = Date.now();
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
          setResultType('match');
          setFlippedCards([]);
          setIsProcessing(false);
          setTimeout(() => setResultType(null), 900);

          playMatch();
          vibrateMatch();
          setStreak((s) => {
            const next = s + 1;
            setBestStreak((best) => Math.max(best, next));
            setPopup({
              id: `${Date.now()}-${newMatched.length}`,
              text: next >= 2 ? `+10 🔥 Racha x${next}` : '+10',
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
          setShake(true);
          setTimeout(() => setShake(false), 400);
          setTimeout(() => {
            setFlippedCards([]);
            setIsProcessing(false);
            setResultType(null);
          }, 700);
        }, 500);
      }
    }
  }, [flippedCards, matchedPairs, cards, isProcessing, gameStatus]);

  async function finishGame(reason, pairsMatched) {
    if (!gameId) return;
    const timeMs = gameStartTime.current ? Date.now() - gameStartTime.current : null;

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

  // No tournament
  if (gameStatus === 'no_tournament') {
    return (
      <div className={styles.messageScreen}>
        <div className={styles.messageIcon}>🏆</div>
        <h2>No hay torneo activo</h2>
        <p>Espera a que se inicie un torneo para jugar.</p>
        <button className={styles.backBtn} onClick={() => router.push('/home')}>Volver</button>
      </div>
    );
  }

  // No tickets
  if (gameStatus === 'no_tickets') {
    return (
      <div className={styles.messageScreen}>
        <div className={styles.messageIcon}>🎫</div>
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

      {/* Card Grid */}
      <div className={styles.cardGrid}>
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
      />
    </div>
  );
}
