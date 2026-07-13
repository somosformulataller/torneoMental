'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { startGameAction, endGameAction } from '@/actions/games';
import { generateCardPairs, getNextTheme } from '@/lib/gameLogic';
import Card from '@/components/game/Card';
import GameResultModal from '@/components/game/GameResultModal';
import CountdownTimer from '@/components/ui/CountdownTimer';
import styles from './jugar.module.css';

export default function GamePage() {
  const router = useRouter();
  const supabase = createClient();
  const gameStartTime = useRef(null);
  const [profile, setProfile] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [cards, setCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [position, setPosition] = useState(null);
  const [gameStatus, setGameStatus] = useState('loading'); // loading, no_tickets, waiting, playing, won, lost
  const [resultType, setResultType] = useState(null); // 'match', 'no_match', 'target', null
  const [currentTheme, setCurrentTheme] = useState(null);
  const [boardsCompleted, setBoardsCompleted] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [totalPairsMatched, setTotalPairsMatched] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [endReason, setEndReason] = useState(null);

  useEffect(() => {
    initGame();
  }, []);

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

      // Get best streak for this tournament
      const { data: games } = await supabase
        .from('games')
        .select('best_streak')
        .eq('user_id', user.id)
        .eq('tournament_id', activeTournament.id)
        .order('best_streak', { ascending: false })
        .limit(1);

      if (games?.length > 0) {
        setBestStreak(games[0].best_streak);
      }

      // Get position
      const { data: ranking } = await supabase
        .from('tournament_rankings')
        .select('posicion')
        .eq('tournament_id', activeTournament.id)
        .eq('user_id', user.id)
        .single();

      if (ranking) {
        setPosition(ranking.posicion);
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

    const { game, error } = await startGameAction(tourn.id);

    if (error || !game) {
      console.error('Error starting game:', error);
      setErrorMsg(error || 'No se pudo iniciar la partida.');
      setGameStatus('no_tickets');
      return;
    }

    const theme = tourn.card_theme === 'aleatorio'
      ? ['tecnologia', 'naturaleza', 'animales'][Math.floor(Math.random() * 3)]
      : tourn.card_theme;

    setCurrentTheme(theme);
    const cardPairs = generateCardPairs(theme, tourn.card_count);
    setCards(cardPairs);

    setGameId(game.id);
    setStreak(0);
    setMatchedPairs([]);
    setFlippedCards([]);
    setTotalPairsMatched(0);
    setBoardsCompleted(0);
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

    if (newFlipped.length === 2) {
      setIsProcessing(true);
      const [first, second] = newFlipped;
      const card1 = cards[first];
      const card2 = cards[second];

      if (card1.pairId === card2.pairId) {
        // MATCH!
        setTimeout(() => {
          const newMatched = [...matchedPairs, card1.pairId];
          const newStreak = streak + 1;
          const newTotalPairs = totalPairsMatched + 1;

          setMatchedPairs(newMatched);
          setStreak(newStreak);
          setTotalPairsMatched(newTotalPairs);
          setResultType('match');
          setFlippedCards([]);
          setIsProcessing(false);

          const target = tournament?.streak_target || Infinity;
          if (newStreak >= target) {
            // Objetivo de racha alcanzado: gana sin perder ticket
            setTimeout(() => {
              setResultType('target');
              setTimeout(() => {
                setEndReason('target');
                endGame('completado', newStreak, newTotalPairs);
              }, 1000);
            }, 400);
            return;
          }

          // Check if all pairs matched - generate new board
          const totalPairsInBoard = cards.length / 2;
          if (newMatched.length >= totalPairsInBoard) {
            setTimeout(() => {
              generateNextBoard();
            }, 800);
          }

          // Clear result indicator after animation
          setTimeout(() => setResultType(null), 1200);
        }, 600);
      } else {
        // NO MATCH - GAME OVER
        setTimeout(() => {
          setResultType('no_match');
          setTimeout(() => {
            endGame('perdido', streak, totalPairsMatched);
          }, 1200);
        }, 800);
      }
    }
  }, [flippedCards, matchedPairs, cards, isProcessing, gameStatus, streak, totalPairsMatched, tournament]);

  function generateNextBoard() {
    const nextTheme = getNextTheme(currentTheme);
    setCurrentTheme(nextTheme);
    const cardCount = tournament?.card_count || 14;
    const newCards = generateCardPairs(nextTheme, cardCount);
    setCards(newCards);
    setMatchedPairs([]);
    setFlippedCards([]);
    setBoardsCompleted(prev => prev + 1);
    setResultType(null);
  }

  async function endGame(status, finalStreak, finalTotalPairs) {
    if (!gameId) return;
    const timeMs = gameStartTime.current ? Date.now() - gameStartTime.current : null;

    const { game, profile: updatedProfile, error } = await endGameAction({
      gameId,
      finalStreak,
      totalPairs: finalTotalPairs,
      timeMs,
      status,
    });

    if (error) {
      console.error('Error ending game:', error);
      setErrorMsg(error);
    }

    if (updatedProfile) setProfile(updatedProfile);
    const registeredStreak = game?.best_streak ?? finalStreak;
    setBestStreak(prev => Math.max(prev, registeredStreak));
    setStreak(registeredStreak);
    setGameStatus(status === 'perdido' ? 'lost' : 'won');
    setShowResult(true);
  }

  function handleTournamentEnd() {
    if (gameStatus === 'playing') {
      setEndReason('timeout');
      endGame('completado', streak, totalPairsMatched);
    }
  }

  async function handlePlayAgain() {
    if (!profile || profile.tickets_balance <= 0 || !tournament) {
      router.push('/home');
      return;
    }
    setShowResult(false);
    setResultType(null);
    setEndReason(null);
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
        <div className={styles.spinner}></div>
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
          ¡Cada par encontrado suma a tu racha!
        </p>
        <div className={styles.alertBox}>
          {errorMsg || '⚠️ No te quedan tickets. ¡Compra más!'}
        </div>
        <button className={styles.backBtn} onClick={() => router.push('/home')}>Volver</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Game Stats Bar */}
      <div className={styles.gameStats}>
        <div className={styles.gameStat}>
          <span className={styles.gameStatLabel}>MEJOR RACHA</span>
          <span className={styles.gameStatValue} style={{ color: 'var(--accent-cyan)' }}>
            {bestStreak}
          </span>
        </div>
        <div className={styles.gameStat}>
          <span className={styles.gameStatLabel}>POSICIÓN</span>
          <span className={styles.gameStatValue} style={{ color: 'var(--accent-orange)' }}>
            #{position || '-'}
          </span>
        </div>
        <div className={styles.gameStat}>
          <span className={styles.gameStatLabel}>TICKETS</span>
          <span className={styles.gameStatValue} style={{ color: 'var(--accent-green)' }}>
            {profile?.tickets_balance || 0}
          </span>
        </div>
      </div>

      {/* Current Streak */}
      <div className={styles.streakSection}>
        <span className={styles.streakLabel}>RACHA</span>
        <span
          className={`${styles.streakNumber} ${resultType === 'match' ? styles.streakUp : ''}`}
          key={streak}
        >
          {streak}
        </span>
        {tournament?.streak_target && (
          <span className={styles.streakLabel} style={{ opacity: 0.6 }}>
            objetivo: {tournament.streak_target}
          </span>
        )}
      </div>

      {/* Result Indicator */}
      {resultType === 'match' && (
        <div className={styles.resultMatch}>¡GANASTE!</div>
      )}
      {resultType === 'no_match' && (
        <div className={styles.resultNoMatch}>PERDISTE</div>
      )}
      {resultType === 'target' && (
        <div className={styles.resultMatch}>¡OBJETIVO ALCANZADO!</div>
      )}

      {/* Revealed Cards Zone */}
      <div className={styles.revealZone}>
        <div className={`${styles.revealSlot} ${flippedCards.length >= 1 ? styles.revealActive : ''}`}>
          {flippedCards.length >= 1 && cards[flippedCards[0]] && (
            <img
              src={cards[flippedCards[0]].image}
              alt={cards[flippedCards[0]].name}
              className={styles.revealImage}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
        <span className={styles.vsText}>VS</span>
        <div className={`${styles.revealSlot} ${flippedCards.length >= 2 ? styles.revealActive : ''}`}>
          {flippedCards.length >= 2 && cards[flippedCards[1]] && (
            <img
              src={cards[flippedCards[1]].image}
              alt={cards[flippedCards[1]].name}
              className={styles.revealImage}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
      </div>

      {/* Theme indicator */}
      <div className={styles.themeIndicator}>
        🎴 {currentTheme} {boardsCompleted > 0 && `(tablero ${boardsCompleted + 1})`}
      </div>

      {/* Card Grid */}
      <div className={styles.cardGrid}>
        {cards.map((card, index) => (
          <Card
            key={`${boardsCompleted}-${card.id}-${index}`}
            card={card}
            isFlipped={flippedCards.includes(index) || matchedPairs.includes(card.pairId)}
            isMatched={matchedPairs.includes(card.pairId)}
            onClick={() => handleCardClick(index)}
            disabled={isProcessing || gameStatus !== 'playing'}
          />
        ))}
      </div>

      {/* Tournament Countdown */}
      {getTournamentEndTime() && (
        <div className={styles.countdownSection}>
          <CountdownTimer
            endTime={getTournamentEndTime()}
            label="TERMINA EN"
            onComplete={handleTournamentEnd}
          />
        </div>
      )}

      {/* Game Result Modal */}
      <GameResultModal
        isOpen={showResult}
        streak={streak}
        totalPairs={totalPairsMatched}
        onPlayAgain={handlePlayAgain}
        onGoBack={() => router.push('/home')}
        ticketsRemaining={profile?.tickets_balance || 0}
        gameStatus={gameStatus}
        reason={endReason}
      />
    </div>
  );
}
