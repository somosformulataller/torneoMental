'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import Spinner from '@/components/ui/Spinner';
import ParticleBackground from '@/components/ui/ParticleBackground';
import CountdownTimer from '@/components/ui/CountdownTimer';
import styles from './ranking.module.css';

function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function RankingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [upcomingTournament, setUpcomingTournament] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPosition, setMyPosition] = useState(null);

  async function loadRanking(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Get profile
      if (!profile) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, nombre, apellido')
          .eq('id', user.id)
          .single();
        setProfile(profileData);
      }

      // Get active tournament
      const { data: tournaments } = await supabase
        .from('tournaments')
        .select('id, nombre, winners_count, prizes, start_time, duration_minutes')
        .eq('status', 'activo')
        .order('start_time', { ascending: true })
        .limit(1);

      if (!tournaments?.length) {
        setActiveTournament(null);

        // Sin torneo activo: si hay uno Programado, mostramos cuándo arranca
        // en vez del empty state genérico.
        const { data: upcoming } = await supabase
          .from('tournaments')
          .select('id, nombre, start_time')
          .eq('status', 'programado')
          .order('start_time', { ascending: true })
          .limit(1);
        setUpcomingTournament(upcoming?.length ? upcoming[0] : null);

        setLoading(false);
        return;
      }

      setUpcomingTournament(null);
      setActiveTournament(tournaments[0]);

      // Get rankings using the DB view
      const { data: rankingData } = await supabase
        .from('tournament_rankings')
        .select('*')
        .eq('tournament_id', tournaments[0].id)
        .order('posicion', { ascending: true })
        .limit(50); // Top 50
      
      setRankings(rankingData || []);

      // Find my position
      const myRank = rankingData?.find(r => r.user_id === user.id);
      if (myRank) {
        setMyPosition(myRank);
      }

    } catch (err) {
      console.error('Error loading ranking:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRanking();

    // Set up Realtime subscription for live ranking updates
    const channel = supabase
      .channel('ranking_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tournament_rankings'
      }, () => {
        // Reload ranking when there's a change
        loadRanking(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getMedal(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
  }

  function prizeForPosition(pos) {
    return Number(activeTournament?.prizes?.[pos - 1] ?? 0);
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <Spinner />
        <p>Cargando posiciones...</p>
      </div>
    );
  }

  if (!activeTournament) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏆</div>
          {upcomingTournament ? (
            <>
              <h2>El nuevo torneo inicia en:</h2>
              <CountdownTimer endTime={upcomingTournament.start_time} />
              <p>{upcomingTournament.nombre}</p>
            </>
          ) : (
            <>
              <h2>Sin Torneo Activo</h2>
              <p>No hay ningún torneo activo en este momento. El ranking aparecerá aquí cuando inicie uno.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ParticleBackground />
      <div className={styles.header}>
        <h1 className={styles.title}>Ranking en Vivo</h1>
        <p className={styles.subtitle}>{activeTournament.nombre}</p>
        <p className={styles.prizeInfo}>
          🏆 Premios: {(activeTournament.prizes || []).map((p, i) => `${i + 1}° $${Number(p).toFixed(2)}`).join(' · ')}
        </p>
        <CountdownTimer
          endTime={new Date(
            new Date(activeTournament.start_time).getTime() + activeTournament.duration_minutes * 60000
          ).toISOString()}
          label="Termina en"
          onComplete={() => loadRanking(false)}
        />
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot}></span> EN VIVO
        </div>
      </div>

      {myPosition && (
        <div className={styles.myRankCard}>
          <div className={styles.myRankHeader}>Tu Posición Actual</div>
          <div className={styles.myRankRow}>
            <div className={styles.myRankPos}>{getMedal(myPosition.posicion)}</div>
            <div className={styles.myRankDetails}>
              <div className={styles.myName}>Tú</div>
              {myPosition.posicion <= activeTournament.winners_count && (
                <div className={styles.winnerTag}>🏆 Ganando ${prizeForPosition(myPosition.posicion).toFixed(2)}</div>
              )}
            </div>
            <div className={styles.myRankScore}>
              <div className={styles.scoreValue}>{myPosition.pairs_matched}</div>
              <div className={styles.scoreLabel}>pares · {formatTime(myPosition.best_time_ms)}</div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.rankingList}>
        <div className={styles.listHeader}>
          <span>Pos</span>
          <span>Jugador</span>
          <span className={styles.scoreCol}>Pares</span>
          <span className={styles.scoreCol}>Tiempo</span>
        </div>

        {rankings.map((r) => (
          <motion.div
            key={r.user_id}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`${styles.rankItem} ${r.user_id === profile?.id ? styles.isMe : ''} ${r.posicion <= 3 ? styles.topThree : ''} ${r.posicion <= activeTournament.winners_count ? styles.isWinner : ''}`}
          >
            <div className={`${styles.pos} ${r.posicion === 1 ? styles.gold : r.posicion === 2 ? styles.silver : r.posicion === 3 ? styles.bronze : ''}`}>
              {getMedal(r.posicion)}
            </div>
            <div className={styles.playerInfo}>
              <div className={styles.playerName}>
                {r.user_nombre} {r.user_apellido}
                {r.user_id === profile?.id && ' (Tú)'}
              </div>
              {r.posicion <= activeTournament.winners_count && (
                <div className={styles.winnerTag}>🏆 ${prizeForPosition(r.posicion).toFixed(2)}</div>
              )}
            </div>
            <div className={styles.score}>
              {r.pairs_matched}
            </div>
            <div className={styles.timeScore}>
              {formatTime(r.best_time_ms)}
            </div>
          </motion.div>
        ))}

        {rankings.length === 0 && (
          <div className={styles.noPlayers}>
            Aún no hay jugadores en este torneo. ¡Sé el primero en jugar!
          </div>
        )}
      </div>
    </div>
  );
}
