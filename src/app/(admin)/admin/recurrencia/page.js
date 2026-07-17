'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createTournamentAction, updateRecurringTournamentAction } from '@/actions/tournaments';
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

// A qué aplican los cambios al guardar (ver updateRecurringTournamentAction).
const APPLY_OPTIONS = [
  {
    value: 'ambos',
    label: 'Al torneo actual y a los siguientes',
    saved: 'Guardado — aplicado al torneo actual y a los siguientes ciclos.',
  },
  {
    value: 'actual',
    label: 'Solo al torneo actual',
    saved: 'Guardado — aplicado solo al torneo actual; los siguientes ciclos mantienen su configuración.',
  },
  {
    value: 'siguiente',
    label: 'Solo a partir del siguiente torneo',
    saved: 'Guardado — el torneo actual queda igual; los cambios se aplicarán desde el siguiente ciclo.',
  },
];

// Resume, solo con lo que difiere del ciclo en curso, los cambios pendientes
// guardados en next_cycle_settings (se aplican al crear el siguiente ciclo).
function pendingChangesSummary(pending, current) {
  if (!pending) return null;
  const parts = [];
  if (pending.nombre != null && pending.nombre !== current.nombre) {
    parts.push(`nombre «${pending.nombre}»`);
  }
  if (pending.card_count != null && pending.card_count !== current.card_count) {
    parts.push(`${pending.card_count} cartas`);
  }
  if (pending.duration_minutes != null && pending.duration_minutes !== current.duration_minutes) {
    parts.push(`${pending.duration_minutes} min de duración`);
  }
  if (pending.winners_count != null && pending.winners_count !== current.winners_count) {
    parts.push(`${pending.winners_count} ganador(es)`);
  }
  if (
    pending.prizes &&
    JSON.stringify(pending.prizes.map(Number)) !== JSON.stringify((current.prizes || []).map(Number))
  ) {
    parts.push(`premios ${pending.prizes.map((p) => `$${Number(p).toFixed(2)}`).join(' · ')}`);
  }
  if (
    pending.recurring_gap_minutes != null &&
    pending.recurring_gap_minutes !== (current.recurring_gap_minutes ?? 10)
  ) {
    parts.push(`${pending.recurring_gap_minutes} min entre ciclos`);
  }
  return parts.length ? parts.join(', ') : null;
}

export default function AdminRecurrenciaPage() {
  const supabase = createClient();
  // Fila más reciente con is_recurring = true: por ahora solo existe un
  // torneo recurrente a la vez, así que esta es "la" configuración actual.
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [applyTo, setApplyTo] = useState('ambos');
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

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
    setSavedMsg(null);

    try {
      const settings = {
        nombre: formData.nombre,
        card_count: Number(formData.card_count),
        duration_minutes: Number(formData.duration_minutes),
        winners_count: Number(formData.winners_count),
        prizes: formData.prizes.map(Number),
        recurring_gap_minutes: Number(formData.recurring_gap_minutes),
      };

      const { error } = current
        ? await updateRecurringTournamentAction(current.id, settings, applyTo)
        : await createTournamentAction({
            ...settings,
            is_recurring: true,
            start_time: new Date().toISOString(),
            status: 'activo',
          });

      if (error) {
        setFormError(error);
        return;
      }
      setSavedMsg(
        current
          ? APPLY_OPTIONS.find((o) => o.value === applyTo)?.saved || 'Guardado.'
          : 'Guardado.'
      );
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
          {pendingChangesSummary(current.next_cycle_settings, current) && (
            <p className={styles.pendingNote}>
              📋 Cambios pendientes para el siguiente ciclo:{' '}
              {pendingChangesSummary(current.next_cycle_settings, current)}. El torneo
              actual sigue con su configuración de siempre.
            </p>
          )}
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
          <div className={styles.success}>{savedMsg}</div>
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

        {current && (
          <div className={styles.inputGroup}>
            <label>¿A qué se aplican los cambios?</label>
            <div className={styles.applyOptions}>
              {APPLY_OPTIONS.map((opt) => (
                <label key={opt.value} className={styles.applyOption}>
                  <input
                    type="radio"
                    name="applyTo"
                    value={opt.value}
                    checked={applyTo === opt.value}
                    onChange={() => setApplyTo(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className={styles.hint}>
              Si el torneo actual ya está en curso, las partidas que ya empezaron no
              cambian — la configuración nueva aplica a las partidas siguientes.
            </p>
          </div>
        )}

        <Button type="submit" variant="primary" loading={processing} loadingText="Guardando...">
          {current ? 'Guardar Cambios' : 'Iniciar Ciclo Recurrente'}
        </Button>
      </form>
    </div>
  );
}
