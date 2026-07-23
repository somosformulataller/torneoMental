'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SCREEN_LABELS } from '@/lib/activity';
import Spinner from '@/components/ui/Spinner';
import Badge from '@/components/ui/Badge';
import RecargasModal from '@/components/admin/RecargasModal';
import styles from './interaccion.module.css';

const GRANULARITIES = [
  { key: 'dia', label: 'Día' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
];

const SCREEN_ORDER = ['inicio', 'jugar', 'ranking', 'billetera'];
const EVENT_LIMIT = 20000;

// Fecha local en formato yyyy-mm-dd para el <input type="date"> por defecto.
function todayInputValue() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// A partir de una fecha (yyyy-mm-dd) y la granularidad, calcula el rango
// [from, to) en hora local.
function computeRange(dateStr, granularity) {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  if (granularity === 'dia') return { from: new Date(y, m, d), to: new Date(y, m, d + 1) };
  if (granularity === 'mes') return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
  return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
}

function localDayKey(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminInteraccionPage() {
  const supabase = createClient();

  const [granularity, setGranularity] = useState('dia');
  const [dateValue, setDateValue] = useState(todayInputValue());

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [players, setPlayers] = useState([]);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [recargasUser, setRecargasUser] = useState(null); // { id, name }

  const range = useMemo(() => computeRange(dateValue, granularity), [dateValue, granularity]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const [{ data: events }, { data: games }, { data: prizes }, { data: wds }, { data: profs }] =
        await Promise.all([
          supabase.from('activity_events').select('user_id, screen, created_at')
            .gte('created_at', fromISO).lt('created_at', toISO)
            .order('created_at', { ascending: false }).limit(EVENT_LIMIT),
          supabase.from('games').select('user_id, status, created_at')
            .gte('created_at', fromISO).lt('created_at', toISO),
          supabase.from('wallet_transactions').select('user_id, amount_usd, created_at')
            .gte('created_at', fromISO).lt('created_at', toISO),
          supabase.from('withdrawals').select('user_id, amount_usd, status, created_at')
            .gte('created_at', fromISO).lt('created_at', toISO),
          supabase.from('profiles').select('id, nombre, apellido, email, blocked, role')
            .order('created_at', { ascending: false }),
        ]);

      // Los administradores también pueden navegar las pantallas del jugador;
      // se excluyen para que no inflen las estadísticas de jugadores reales.
      const adminIds = new Set((profs || []).filter((p) => p.role === 'admin').map((p) => p.id));
      const ev = (events || []).filter((e) => !adminIds.has(e.user_id));
      const gm = (games || []).filter((g) => !adminIds.has(g.user_id));
      const completed = gm.filter((g) => g.status === 'completado');

      const screenCounts = {};
      const usersByScreen = {};
      SCREEN_ORDER.forEach((s) => { screenCounts[s] = 0; usersByScreen[s] = new Set(); });
      const activeUsers = new Set();
      ev.forEach((e) => {
        activeUsers.add(e.user_id);
        if (e.screen in screenCounts) {
          screenCounts[e.screen] += 1;
          usersByScreen[e.screen].add(e.user_id);
        }
      });

      const playedUsers = new Set(completed.map((g) => g.user_id));
      const prizeSum = (prizes || []).reduce((s, p) => s + Number(p.amount_usd || 0), 0);
      const wdSum = (wds || []).reduce((s, w) => s + Number(w.amount_usd || 0), 0);

      setOverview({
        activeUsers: activeUsers.size,
        totalEvents: ev.length,
        eventsCapped: ev.length >= EVENT_LIMIT,
        playedUsers: playedUsers.size,
        partidas: completed.length,
        screenCounts,
        funnel: {
          inicio: usersByScreen.inicio.size,
          jugar: usersByScreen.jugar.size,
          partida: playedUsers.size,
        },
        prizeCount: (prizes || []).length,
        prizeSum,
        wdCount: (wds || []).length,
        wdSum,
      });
      setPlayers((profs || []).filter((p) => p.role !== 'admin'));
    } catch (err) {
      console.error('Error cargando interacción:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
  }, [loadOverview]);

  const loadDetail = useCallback(async (userId) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const [{ data: events }, { data: games }, { data: prizes }, { data: wds }] = await Promise.all([
        supabase.from('activity_events').select('screen, path, created_at, event_type')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
        supabase.from('games').select('status, created_at, ended_at, pairs_matched')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
        supabase.from('wallet_transactions').select('amount_usd, created_at')
          .eq('user_id', userId),
        supabase.from('withdrawals').select('amount_usd, status, created_at, paid_at')
          .eq('user_id', userId),
      ]);

      const ev = events || [];
      const gm = games || [];
      const now = Date.now();
      const todayKey = localDayKey(new Date().toISOString());

      const completed = gm.filter((g) => g.status === 'completado');
      const playedDays = new Set(completed.map((g) => localDayKey(g.created_at)));
      const playedToday = completed.some((g) => localDayKey(g.created_at) === todayKey);
      const activeNow = gm.some(
        (g) => g.status === 'en_curso' && now - new Date(g.created_at).getTime() < 15 * 60 * 1000
      );

      const lastEvent = ev[0] || null;
      // Recorrido de hoy: eventos de pantalla de hoy, en orden cronológico.
      const todayJourney = ev
        .filter((e) => e.event_type === 'screen_view' && localDayKey(e.created_at) === todayKey)
        .reverse();

      const prizeSum = (prizes || []).reduce((s, p) => s + Number(p.amount_usd || 0), 0);
      const wdPaid = (wds || []).filter((w) => w.status === 'pagado');
      const wdPending = (wds || []).filter((w) => w.status === 'solicitado');

      setDetail({
        activeNow,
        playedToday,
        playedDaysCount: playedDays.size,
        totalPartidas: completed.length,
        lastEvent,
        lastSeen: ev[0]?.created_at || (gm[0]?.created_at ?? null),
        todayJourney,
        recentScreens: ev.filter((e) => e.event_type === 'screen_view').slice(0, 25),
        prizeCount: (prizes || []).length,
        prizeSum,
        wdPaidSum: wdPaid.reduce((s, w) => s + Number(w.amount_usd || 0), 0),
        wdPaidCount: wdPaid.length,
        wdPendingSum: wdPending.reduce((s, w) => s + Number(w.amount_usd || 0), 0),
        wdPendingCount: wdPending.length,
      });
    } catch (err) {
      console.error('Error cargando detalle:', err);
    } finally {
      setLoadingDetail(false);
    }
  }, [supabase]);

  function selectPlayer(p) {
    setSelectedId(p.id);
    loadDetail(p.id);
  }

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      [p.nombre, p.apellido, `${p.nombre} ${p.apellido}`, p.email]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [players, search]);

  const selectedPlayer = players.find((p) => p.id === selectedId) || null;
  const maxScreen = overview ? Math.max(1, ...SCREEN_ORDER.map((s) => overview.screenCounts[s] || 0)) : 1;

  function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Interacción</h1>
        <p className={styles.subtitle}>Cómo usan la app los jugadores. Sirve para saber qué mejorar.</p>
      </div>

      {/* Filtro de fecha */}
      <div className={styles.filterBar}>
        <div className={styles.granButtons}>
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              className={`${styles.granBtn} ${granularity === g.key ? styles.granActive : ''}`}
              onClick={() => setGranularity(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          className={styles.dateInput}
          value={dateValue}
          onChange={(e) => setDateValue(e.target.value)}
        />
      </div>

      {loading || !overview ? (
        <div className={styles.loading}><Spinner /></div>
      ) : (
        <>
          {/* Resumen del rango */}
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Usuarios activos</span>
              <span className={styles.statValue}>{overview.activeUsers}</span>
              <span className={styles.statHint}>entraron a la app</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Jugaron</span>
              <span className={styles.statValue}>{overview.playedUsers}</span>
              <span className={styles.statHint}>{overview.partidas} partidas</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Premios entregados</span>
              <span className={styles.statValue}>{overview.prizeCount}</span>
              <span className={styles.statHint}>${overview.prizeSum.toFixed(2)}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Retiros</span>
              <span className={styles.statValue}>{overview.wdCount}</span>
              <span className={styles.statHint}>${overview.wdSum.toFixed(2)}</span>
            </div>
          </div>

          <div className={styles.twoCol}>
            {/* Pantallas más visitadas */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Pantallas más visitadas</h2>
              {overview.totalEvents === 0 ? (
                <p className={styles.empty}>Sin visitas registradas en este período.</p>
              ) : (
                <div className={styles.barList}>
                  {SCREEN_ORDER.map((s) => (
                    <div key={s} className={styles.barRow}>
                      <span className={styles.barLabel}>{SCREEN_LABELS[s]}</span>
                      <div className={styles.barTrack}>
                        <div
                          className={styles.barFill}
                          style={{ width: `${((overview.screenCounts[s] || 0) / maxScreen) * 100}%` }}
                        />
                      </div>
                      <span className={styles.barValue}>{overview.screenCounts[s] || 0}</span>
                    </div>
                  ))}
                </div>
              )}
              {overview.eventsCapped && (
                <p className={styles.warn}>Mostrando las primeras {EVENT_LIMIT.toLocaleString('es-VE')} visitas del período.</p>
              )}
            </div>

            {/* Embudo: dónde se cae la gente */}
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Recorrido hasta jugar</h2>
              <p className={styles.panelHint}>Cuántos usuarios llegan a cada paso (y dónde se caen).</p>
              <div className={styles.funnel}>
                <FunnelStep label="Entró al Inicio" value={overview.funnel.inicio} base={overview.funnel.inicio} />
                <FunnelStep label="Abrió Competir" value={overview.funnel.jugar} base={overview.funnel.inicio} />
                <FunnelStep label="Completó una partida" value={overview.funnel.partida} base={overview.funnel.inicio} />
              </div>
            </div>
          </div>

          {/* Buscar jugador */}
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Interacción por jugador</h2>
            <div className={styles.searchBar}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                className={styles.searchInput}
                placeholder="Buscar jugador por nombre o correo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className={styles.searchClear} onClick={() => setSearch('')} aria-label="Limpiar">✕</button>
              )}
            </div>

            <div className={styles.playerLayout}>
              <div className={styles.playerList}>
                {filteredPlayers.length === 0 ? (
                  <p className={styles.empty}>Sin jugadores.</p>
                ) : (
                  filteredPlayers.slice(0, 100).map((p) => (
                    <button
                      key={p.id}
                      className={`${styles.playerItem} ${selectedId === p.id ? styles.playerItemActive : ''}`}
                      onClick={() => selectPlayer(p)}
                    >
                      <span className={styles.playerName}>
                        {p.nombre} {p.apellido}
                        {p.blocked && <span className={styles.blockedDot} title="Bloqueado"> 🚫</span>}
                      </span>
                      <span className={styles.playerEmail}>{p.email}</span>
                    </button>
                  ))
                )}
              </div>

              <div className={styles.detailBox}>
                {!selectedId ? (
                  <p className={styles.empty}>Selecciona un jugador para ver su interacción.</p>
                ) : loadingDetail || !detail ? (
                  <div className={styles.loading}><Spinner /></div>
                ) : (
                  <div className={styles.detail}>
                    <div className={styles.detailHeader}>
                      <span className={styles.detailName}>
                        {selectedPlayer?.nombre} {selectedPlayer?.apellido}
                      </span>
                      <div className={styles.detailBadges}>
                        {detail.activeNow && <Badge color="#34D399">Jugando ahora</Badge>}
                        {detail.playedToday && <Badge color="#A78BFA">Jugó hoy</Badge>}
                        {selectedPlayer?.blocked && <Badge color="#FB7185">Bloqueado</Badge>}
                      </div>
                    </div>

                    <div className={styles.detailStats}>
                      <DetailStat label="Días jugados" value={detail.playedDaysCount} />
                      <DetailStat label="Partidas" value={detail.totalPartidas} />
                      <DetailStat label="Premios" value={`${detail.prizeCount} · $${detail.prizeSum.toFixed(2)}`} />
                      <DetailStat label="Retiros pagados" value={`${detail.wdPaidCount} · $${detail.wdPaidSum.toFixed(2)}`} />
                    </div>

                    {selectedPlayer && (
                      <button
                        className={styles.recargasBtn}
                        onClick={() => setRecargasUser({ id: selectedPlayer.id, name: `${selectedPlayer.nombre} ${selectedPlayer.apellido}` })}
                      >
                        🧾 Ver historial de recargas
                      </button>
                    )}

                    {detail.wdPendingCount > 0 && (
                      <p className={styles.pendingNote}>
                        Tiene {detail.wdPendingCount} retiro(s) pendiente(s) por ${detail.wdPendingSum.toFixed(2)}.
                      </p>
                    )}

                    <div className={styles.detailRow}>
                      <span className={styles.detailRowLabel}>Última actividad</span>
                      <span className={styles.detailRowValue}>
                        {detail.lastSeen ? fmtDateTime(detail.lastSeen) : 'Sin registro'}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailRowLabel}>Dónde dejó la app</span>
                      <span className={styles.detailRowValue}>
                        {detail.lastEvent
                          ? `${SCREEN_LABELS[detail.lastEvent.screen] || detail.lastEvent.path || '—'} (${fmtDateTime(detail.lastEvent.created_at)})`
                          : 'Sin registro de navegación'}
                      </span>
                    </div>

                    <div className={styles.journey}>
                      <span className={styles.journeyTitle}>Recorrido de hoy</span>
                      {detail.todayJourney.length === 0 ? (
                        <p className={styles.empty}>No ha entrado hoy.</p>
                      ) : (
                        <div className={styles.journeyChips}>
                          {detail.todayJourney.map((e, i) => (
                            <span key={i} className={styles.journeyChip}>
                              {SCREEN_LABELS[e.screen] || e.path}
                              <span className={styles.journeyTime}>{fmtTime(e.created_at)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.journey}>
                      <span className={styles.journeyTitle}>Últimas pantallas visitadas</span>
                      {detail.recentScreens.length === 0 ? (
                        <p className={styles.empty}>Sin registro de navegación todavía.</p>
                      ) : (
                        <ul className={styles.historyList}>
                          {detail.recentScreens.map((e, i) => (
                            <li key={i} className={styles.historyItem}>
                              <span>{SCREEN_LABELS[e.screen] || e.path}</span>
                              <span className={styles.historyTime}>{fmtDateTime(e.created_at)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {recargasUser && (
        <RecargasModal
          userId={recargasUser.id}
          name={recargasUser.name}
          onClose={() => setRecargasUser(null)}
        />
      )}
    </div>
  );
}

function FunnelStep({ label, value, base }) {
  const p = base ? Math.round((value / base) * 100) : 0;
  return (
    <div className={styles.funnelStep}>
      <div className={styles.funnelBar} style={{ width: `${base ? (value / base) * 100 : 0}%` }} />
      <div className={styles.funnelText}>
        <span>{label}</span>
        <span className={styles.funnelValue}>{value} {base ? `· ${p}%` : ''}</span>
      </div>
    </div>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className={styles.detailStat}>
      <span className={styles.detailStatLabel}>{label}</span>
      <span className={styles.detailStatValue}>{value}</span>
    </div>
  );
}
