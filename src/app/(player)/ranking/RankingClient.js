'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { createClient } from '@/lib/supabase/client';
import CountdownTimer from '@/components/ui/CountdownTimer';
import BackToHome from '@/components/ui/BackToHome';
import styles from './ranking.module.css';

function formatTime(ms) {
  if (ms == null) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getMedal(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return `#${pos}`;
}

// Agrupa las filas planas de la vista tournament_winners en bloques por
// torneo, conservando el orden (más reciente primero) que ya trae la query.
function groupWinners(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.tournament_id)) {
      map.set(r.tournament_id, {
        tournament_id: r.tournament_id,
        tournament_nombre: r.tournament_nombre,
        tournament_start_time: r.tournament_start_time,
        winners: [],
      });
    }
    map.get(r.tournament_id).winners.push(r);
  }
  return Array.from(map.values()).slice(0, 5);
}

// La página (Server Component) ya llega con el ranking, el torneo y el
// historial de ganadores en el HTML — acá solo queda la actualización en
// vivo: la suscripción Realtime a games y el countdown del torneo.
export default function RankingClient({
  userId,
  initialProfile,
  initialActiveTournament,
  initialUpcomingTournament,
  initialRankings,
  initialWinnerRows,
}) {
  const supabase = createClient();
  const [profile] = useState(initialProfile);
  const [activeTournament, setActiveTournament] = useState(initialActiveTournament);
  const [upcomingTournament, setUpcomingTournament] = useState(initialUpcomingTournament);
  const [rankings, setRankings] = useState(initialRankings);
  const [pastWinners, setPastWinners] = useState(() => groupWinners(initialWinnerRows));
  const [myPosition, setMyPosition] = useState(
    () => initialRankings.find((r) => r.user_id === userId) || null
  );

  async function refreshRanking() {
    try {
      // Historial de ganadores y torneo activo son independientes entre sí —
      // se piden en paralelo.
      const [winnersResult, tournamentsResult] = await Promise.all([
        supabase
          .from('tournament_winners')
          .select('*')
          .order('tournament_start_time', { ascending: false })
          .order('position', { ascending: true })
          .limit(60),
        supabase
          .from('tournaments')
          .select('id, nombre, winners_count, prizes, start_time, duration_minutes')
          .eq('status', 'activo')
          .order('start_time', { ascending: true })
          .limit(1),
      ]);

      setPastWinners(groupWinners(winnersResult.data || []));
      const tournaments = tournamentsResult.data;

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
      setMyPosition(rankingData?.find((r) => r.user_id === userId) || null);
    } catch (err) {
      console.error('Error refreshing ranking:', err);
    }
  }

  useEffect(() => {
    // Realtime solo puede escuchar tablas reales (logical replication), no
    // vistas — tournament_rankings es una vista, así que escuchamos la
    // tabla real games (cualquier partida completada recalcula el
    // ranking) y le damos un nombre único al canal para evitar choques si
    // el efecto llega a montarse dos veces con el mismo nombre fijo.
    const channel = supabase
      .channel(`ranking_updates_${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games'
      }, () => {
        // Reload ranking when there's a change
        refreshRanking();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function prizeForPosition(pos) {
    return Number(activeTournament?.prizes?.[pos - 1] ?? 0);
  }

  const pastWinnersSection = pastWinners.length > 0 ? (
    <div className={styles.pastWinnersSection}>
      <h2 className={styles.pastWinnersTitle}>Historial de Ganadores</h2>
      {pastWinners.map((block, i) => (
        <div key={block.tournament_id} className={styles.winnerBlock}>
          <div className={styles.winnerBlockHeader}>
            🏆 {i === 0 ? 'Ganadores de la copa anterior' : block.tournament_nombre}
          </div>
          {/* suppressHydrationWarning: el formato de fecha del servidor
              (Node) puede diferir en detalles mínimos del navegador; no
              debe romper la hidratación. */}
          <p className={styles.winnerBlockDate} suppressHydrationWarning>
            {i === 0 ? `${block.tournament_nombre} · ` : ''}{formatDate(block.tournament_start_time)}
          </p>
          {block.winners.map((w) => (
            <div key={w.user_id} className={styles.winnerRow}>
              <span className={styles.winnerMedal}>{getMedal(w.position)}</span>
              <span className={styles.winnerName}>{w.user_nombre} {w.user_apellido}</span>
              <span className={styles.winnerAmount}>${Number(w.amount_usd).toFixed(2)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : null;

  if (!activeTournament) {
    return (
      <div className={styles.container}>
        <BackToHome floating />
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
        {pastWinnersSection}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <BackToHome floating />
      <div className={styles.header}>
        <h1 className={styles.title}>Ranking</h1>
        <p className={styles.subtitle}>{activeTournament.nombre}</p>
        <p className={styles.prizeInfo}>
          🏆 Premios: {(activeTournament.prizes || []).map((p, i) => `${i + 1}° $${Number(p).toFixed(2)}`).join(' · ')}
        </p>
        <CountdownTimer
          endTime={new Date(
            new Date(activeTournament.start_time).getTime() + activeTournament.duration_minutes * 60000
          ).toISOString()}
          label="Termina en"
          onComplete={() => refreshRanking()}
        />
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot}></span> EN VIVO
        </div>
        <p className={styles.rankingNotice}>
          ⚠️ Este ranking puede cambiar en el transcurso de la copa. Estar de primero ahora no garantiza el premio hasta que finalice el torneo.
        </p>
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

      {pastWinnersSection}
    </div>
  );
}
