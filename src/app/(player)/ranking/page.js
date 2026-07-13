'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './ranking.module.css';

export default function RankingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState(null);
  const [activeTournament, setActiveTournament] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myPosition, setMyPosition] = useState(null);

  useEffect(() => {
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
  }, []);

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
        .select('id, nombre')
        .eq('status', 'activo')
        .order('start_time', { ascending: true })
        .limit(1);

      if (!tournaments?.length) {
        setLoading(false);
        return;
      }

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

  function getMedal(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
  }

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p>Cargando posiciones...</p>
      </div>
    );
  }

  if (!activeTournament) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🏆</div>
          <h2>Sin Torneo Activo</h2>
          <p>No hay ningún torneo activo en este momento. El ranking aparecerá aquí cuando inicie uno.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Ranking en Vivo</h1>
        <p className={styles.subtitle}>{activeTournament.nombre}</p>
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
            </div>
            <div className={styles.myRankScore}>
              <div className={styles.scoreValue}>{myPosition.best_streak}</div>
              <div className={styles.scoreLabel}>racha</div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.rankingList}>
        <div className={styles.listHeader}>
          <span>Pos</span>
          <span>Jugador</span>
          <span className={styles.scoreCol}>Racha</span>
        </div>

        {rankings.map((r) => (
          <div 
            key={r.user_id} 
            className={`${styles.rankItem} ${r.user_id === profile?.id ? styles.isMe : ''} ${r.posicion <= 3 ? styles.topThree : ''}`}
          >
            <div className={`${styles.pos} ${r.posicion === 1 ? styles.gold : r.posicion === 2 ? styles.silver : r.posicion === 3 ? styles.bronze : ''}`}>
              {getMedal(r.posicion)}
            </div>
            <div className={styles.playerInfo}>
              <div className={styles.playerName}>
                {r.user_nombre} {r.user_apellido}
                {r.user_id === profile?.id && ' (Tú)'}
              </div>
            </div>
            <div className={styles.score}>
              {r.best_streak}
            </div>
          </div>
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
