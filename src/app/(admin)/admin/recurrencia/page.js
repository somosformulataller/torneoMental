'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createTournamentAction, updateTournamentAction } from '@/actions/tournaments';
import { TOURNAMENT_STATUSES } from '@/lib/constants';
import CountdownTimer from '@/components/ui/CountdownTimer';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import styles from './recurrencia.module.css';

// Ajusta el arreglo de premios al cambiar la cantidad de ganadores,
// preservando los montos ya ingresados en las posiciones que se mantienen.
function resizePrizes(prizes, count) {
  const next = prizes.slice(0, count);
  while (next.length < count) next.push(0);
  return next;
}

const EMPTY_FORM = {
  nombre: 'Copa Mental',
  card_count: 14,
  duration_minutes: 60,
  winners_count: 1,
  prizes: [0],
  recurring_gap_minutes: 10,
};

export default function AdminRecurrenciaPage() {
  const supabase = createClient();
  // Fila más reciente con is_recurring = true: por ahora solo existe un
  // torneo recurrente a la vez, así que esta es "la" configuración actual.
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);

  async function loadCurrent() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_recurring', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      const t = data?.[0] || null;
      setCurrent(t);
      if (t) {
        setFormData({
          nombre: t.nombre,
          card_count: t.card_count,
          duration_minutes: t.duration_minutes,
          winners_count: t.winners_count,
          prizes: resizePrizes(t.prizes || [], t.winners_count),
          recurring_gap_minutes: t.recurring_gap_minutes ?? 10,
        });
      }
    } catch (err) {
      console.error('Error loading recurring tournament:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setProcessing(true);
    setFormError(null);
    setSavedMsg(false);

    try {
      const dataToSave = {
        nombre: formData.nombre,
        card_count: Number(formData.card_count),
        duration_minutes: Number(formData.duration_minutes),
        winners_count: Number(formData.winners_count),
        prizes: formData.prizes.map(Number),
        is_recurring: true,
        recurring_gap_minutes: Number(formData.recurring_gap_minutes),
        start_time: current ? current.start_time : new Date().toISOString(),
        status: current ? current.status : 'activo',
      };

      const { error } = current
        ? await updateTournamentAction(current.id, dataToSave)
        : await createTournamentAction(dataToSave);

      if (error) {
        setFormError(error);
        return;
      }
      setSavedMsg(true);
      await loadCurrent();
    } catch (err) {
      console.error('Error saving recurring tournament:', err);
      setFormError('Error al guardar la configuración.');
    } finally {
      setProcessing(false);
    }
  }

  function getEndTime() {
    if (!current) return null;
    return new Date(
      new Date(current.start_time).getTime() + current.duration_minutes * 60000
    ).toISOString();
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Torneo Recurrente</h1>
      </div>

      {current ? (
        <div className={styles.statusCard}>
          <div className={styles.statusHeader}>
            <Badge color={TOURNAMENT_STATUSES[current.status]?.color}>
              {TOURNAMENT_STATUSES[current.status]?.label}
            </Badge>
            <span className={styles.statusName}>{current.nombre}</span>
          </div>
          {current.status === 'activo' && (
            <CountdownTimer endTime={getEndTime()} label="Termina en" />
          )}
          {current.status === 'programado' && (
            <CountdownTimer endTime={current.start_time} label="Empieza en" />
          )}
          <p className={styles.statusNote}>
            Al terminar este ciclo se paga automáticamente a los ganadores
            (según su posición en el ranking) y se crea el siguiente ciclo{' '}
            {formData.recurring_gap_minutes > 0
              ? `${formData.recurring_gap_minutes} minutos después`
              : 'de inmediato'}
            . Esto lo hace una tarea programada del servidor, no hace falta
            que entres a activarlo manualmente.
          </p>
        </div>
      ) : (
        <div className={styles.emptyState}>
          Todavía no hay un torneo recurrente configurado. Completa el
          formulario y presiona &quot;Iniciar Ciclo Recurrente&quot; para
          arrancar el primero (empieza activo de inmediato).
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        {formError && <div className={styles.error}>{formError}</div>}
        {savedMsg && !formError && (
          <div className={styles.success}>
            Guardado{current ? ' — esto también actualiza el ciclo en curso, no solo los futuros' : ''}.
          </div>
        )}

        <div className={styles.inputGroup}>
          <label>Nombre del Torneo</label>
          <input
            type="text"
            required
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            className={styles.input}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.inputGroup}>
            <label>Cantidad de Cartas</label>
            <input
              type="number"
              required
              min="6"
              step="2"
              max="40"
              value={formData.card_count}
              onChange={(e) => setFormData({ ...formData, card_count: e.target.value })}
              className={styles.input}
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Duración de cada Ciclo (min)</label>
            <input
              type="number"
              required
              min="1"
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.inputGroup}>
          <label>Minutos entre un Ciclo y el Siguiente</label>
          <input
            type="number"
            required
            min="0"
            value={formData.recurring_gap_minutes}
            onChange={(e) => setFormData({ ...formData, recurring_gap_minutes: e.target.value })}
            className={styles.input}
          />
          <p className={styles.hint}>0 = el siguiente ciclo empieza de inmediato al terminar este.</p>
        </div>

        <div className={styles.inputGroup}>
          <label>Cantidad de Ganadores</label>
          <input
            type="number"
            required
            min="1"
            value={formData.winners_count}
            onChange={(e) => {
              const count = Math.max(1, Number(e.target.value) || 1);
              setFormData({
                ...formData,
                winners_count: e.target.value,
                prizes: resizePrizes(formData.prizes, count),
              });
            }}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label>Premio por Posición (USD)</label>
          <div className={styles.prizesGrid}>
            {formData.prizes.map((prize, i) => (
              <div key={i} className={styles.prizeInputWrap}>
                <span className={styles.prizeInputLabel}>{i + 1}°</span>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={prize}
                  onChange={(e) => {
                    const next = [...formData.prizes];
                    next[i] = e.target.value;
                    setFormData({ ...formData, prizes: next });
                  }}
                  className={styles.input}
                />
              </div>
            ))}
          </div>
          <p className={styles.hint}>
            Se acredita a la billetera de premios del ganador (no se pierde al reiniciarse el ranking).
          </p>
        </div>

        <Button type="submit" variant="primary" loading={processing} loadingText="Guardando...">
          {current ? 'Guardar Cambios' : 'Iniciar Ciclo Recurrente'}
        </Button>
      </form>
    </div>
  );
}
