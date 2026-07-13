'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { startGameAction, endGameAction } from '@/actions/games';
import { generateCardPairs } from '@/lib/gameLogic';
import Card from '@/components/game/Card';
import GameResultModal from '@/components/game/GameResultModal';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Spinner from '@/components/ui/Spinner';
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
  const [bestPairs, setBestPairs] = useState(0);
  const [position, setPosition] = useState(null);
  const [gameStatus, setGameStatus] = useState('loading'); // loading, no_tournament, no_tickets, playing, finished
  const [resultType, setResultType] = useState(null); // 'match', 'no_match', null
  const [currentTheme, setCurrentTheme] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [finishReason, setFinishReason] = useState(null); // 'completed' | 'timeout'
  const [finishedTimeMs, setFinishedTimeMs] = useState(null);
  const [finishedPairs, setFinishedPairs] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Get personal best (pairs matched) for this tournament
      const { data: games } = await supabase
        .from('games')
        .select('pairs_matched')
        .eq('user_id', user.id)
        .eq('tournament_id', activeTournament.id)
        .eq('status', 'completado')
        .order('pairs_matched', { ascending: false })
        .limit(1);

      if (games?.length > 0) {
        setBestPairs(games[0].pairs_matched);
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

    const { game, profile: updatedProfile, error } = await startGameAction(tourn.id);

    if (error || !game) {
      console.error('Error starting game:', error);
      setErrorMsg(error || 'No se pudo iniciar la partida.');
      setGameStatus('no_tickets');
      return;
    }

    if (updatedProfile) setProfile(updatedProfile);

    const theme = tourn.card_theme === 'aleatorio'
      ? ['tecnologia', 'naturaleza', 'animales'][Math.floor(Math.random() * 3)]
      : tourn.card_theme;

    setCurrentTheme(theme);
    const cardPairs = generateCardPairs(theme, tourn.card_count);
    setCards(cardPairs);

    setGameId(game.id);
    setMatchedPairs([]);
    setFlippedCards([]);
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
        // MATCH: queda revelado, sigue jugando
        setTimeout(() => {
          const newMatched = [...matchedPairs, card1.pairId];
          setMatchedPairs(newMatched);
          setResultType('match');
          setFlippedCards([]);
          setIsProcessing(false);
          setTimeout(() => setResultType(null), 900);

          const totalPairsInBoard = cards.length / 2;
          if (newMatched.length >= totalPairsInBoard) {
            setTimeout(() => finishGame('completed', newMatched.length), 500);
          }
        }, 600);
      } else {
        // NO MATCH: se voltean de nuevo, puede seguir intentando
        setTimeout(() => {
          setResultType('no_match');
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
    setBestPairs(prev => Math.max(prev, registeredPairs));
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
    <div className={styles.container}>
      {/* Game Stats Bar */}
      <div className={styles.gameStats}>
        <div className={styles.gameStat}>
          <span className={styles.gameStatLabel}>MEJOR MARCA</span>
          <span className={styles.gameStatValue} style={{ color: 'var(--accent-cyan)' }}>
            {bestPairs}
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

      {/* Pairs Progress */}
      <div className={styles.streakSection}>
        <span className={styles.streakLabel}>PARES ENCONTRADOS</span>
        <span
          className={`${styles.streakNumber} ${resultType === 'match' ? styles.streakUp : ''}`}
          key={matchedPairs.length}
        >
          {matchedPairs.length}/{totalPairs}
        </span>
      </div>

      {/* Result Indicator */}
      {resultType === 'match' && (
        <div className={styles.resultMatch}>¡PAR ENCONTRADO!</div>
      )}
      {resultType === 'no_match' && (
        <div className={styles.resultNoMatch}>NO ES PAR, SIGUE INTENTANDO</div>
      )}

      {/* Revealed Cards Zone */}
      <div className={styles.revealZone}>
        <div className={`${styles.revealSlot} ${flippedCards.length >= 1 ? styles.revealActive : ''}`}>
          {flippedCards.length >= 1 && cards[flippedCards[0]] && (
            <Image
              src={cards[flippedCards[0]].image}
              alt={cards[flippedCards[0]].name}
              width={70}
              height={90}
              className={styles.revealImage}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
        <span className={styles.vsText}>VS</span>
        <div className={`${styles.revealSlot} ${flippedCards.length >= 2 ? styles.revealActive : ''}`}>
          {flippedCards.length >= 2 && cards[flippedCards[1]] && (
            <Image
              src={cards[flippedCards[1]].image}
              alt={cards[flippedCards[1]].name}
              width={70}
              height={90}
              className={styles.revealImage}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
      </div>

      {/* Theme indicator */}
      <div className={styles.themeIndicator}>
        🎴 {currentTheme}
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
        pairsMatched={finishedPairs}
        totalPairs={totalPairs}
        timeMs={finishedTimeMs}
        onPlayAgain={handlePlayAgain}
        onGoBack={() => router.push('/home')}
        ticketsRemaining={profile?.tickets_balance || 0}
        reason={finishReason}
      />
    </div>
  );
}
