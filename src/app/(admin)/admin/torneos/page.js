'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createTournamentAction, updateTournamentAction, deleteTournamentAction } from '@/actions/tournaments';
import { TOURNAMENT_STATUSES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import CountdownTimer from '@/components/ui/CountdownTimer';
import styles from './torneos.module.css';

// Duración con la que se prellena el formulario de un torneo nuevo — el
// admin siempre puede ajustarla antes de guardar.
const DEFAULT_DURATION_MINUTES = 60;

function nowLocalDatetimeString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

// Ajusta el arreglo de premios al cambiar la cantidad de ganadores,
// preservando los montos ya ingresados en las posiciones que se mantienen.
function resizePrizes(prizes, count) {
  const next = prizes.slice(0, count);
  while (next.length < count) next.push(0);
  return next;
}

export default function AdminTorneosPage() {
  const supabase = createClient();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    id: null,
    nombre: '',
    card_count: 14,
    start_time: nowLocalDatetimeString(),
    duration_minutes: DEFAULT_DURATION_MINUTES,
    winners_count: 1,
    prizes: [0],
    status: 'activo'
  });
  const [formError, setFormError] = useState(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_time', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);
    } catch (err) {
      console.error('Error loading tournaments:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenModal(tournament = null) {
    if (tournament) {
      setIsEditing(true);
      // Format datetime-local string
      const date = new Date(tournament.start_time);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      
      setFormData({
        id: tournament.id,
        nombre: tournament.nombre,
        card_count: tournament.card_count,
        start_time: date.toISOString().slice(0, 16),
        duration_minutes: tournament.duration_minutes,
        winners_count: tournament.winners_count,
        prizes: resizePrizes(tournament.prizes || [], tournament.winners_count),
        status: tournament.status
      });
    } else {
      setIsEditing(false);
      setFormData({
        id: null,
        nombre: '',
        card_count: 14,
        start_time: nowLocalDatetimeString(),
        duration_minutes: DEFAULT_DURATION_MINUTES,
        winners_count: 1,
        prizes: [0],
        status: 'activo'
      });
    }
    setFormError(null);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setProcessing(true);
    setFormError(null);

    try {
      const dataToSave = {
        nombre: formData.nombre,
        card_count: Number(formData.card_count),
        start_time: new Date(formData.start_time).toISOString(),
        duration_minutes: Number(formData.duration_minutes),
        winners_count: Number(formData.winners_count),
        prizes: formData.prizes.map(Number),
        status: formData.status
      };

      const { error } = isEditing
        ? await updateTournamentAction(formData.id, dataToSave)
        : await createTournamentAction(dataToSave);

      if (error) {
        setFormError(error);
        return;
      }

      setShowModal(false);
      loadTournaments();
    } catch (err) {
      console.error('Error saving tournament:', err);
      setFormError('Error al guardar el torneo.');
    } finally {
      setProcessing(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('es-VE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function getEndTime(t) {
    return new Date(new Date(t.start_time).getTime() + t.duration_minutes * 60000).toISOString();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteTournamentAction(deleteTarget.id);
    if (error) {
      setDeleteError(error);
      setDeleting(false);
      return;
    }
    setDeleting(false);
    setDeleteTarget(null);
    loadTournaments();
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Torneos</h1>
        <Button variant="primary" size="sm" onClick={() => handleOpenModal()}>
          + Nuevo Torneo
        </Button>
      </div>

      {loading ? (
        <div className={styles.loading}><Spinner /></div>
      ) : tournaments.length === 0 ? (
        <div className={styles.emptyState}>No hay torneos creados</div>
      ) : (
        <div className={styles.grid}>
          {tournaments.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <Badge color={TOURNAMENT_STATUSES[t.status]?.color}>
                  {TOURNAMENT_STATUSES[t.status]?.label}
                </Badge>
                <div className={styles.cardHeaderActions}>
                  <button className={styles.editBtn} onClick={() => handleOpenModal(t)}>
                    Editar
                  </button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteTarget(t)}>
                    Eliminar
                  </button>
                </div>
              </div>

              <h3 className={styles.tournName}>{t.nombre}</h3>

              {t.status === 'activo' && (
                <div className={styles.cardCountdown}>
                  <CountdownTimer endTime={getEndTime(t)} label="Termina en" />
                </div>
              )}
              {t.status === 'programado' && (
                <div className={styles.cardCountdown}>
                  <CountdownTimer endTime={t.start_time} label="Empieza en" />
                </div>
              )}

              <div className={styles.details}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Inicio</span>
                  <span className={styles.detailValue}>{formatDate(t.start_time)}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Duración</span>
                  <span className={styles.detailValue}>{t.duration_minutes} min</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Cartas</span>
                  <span className={styles.detailValue}>{t.card_count}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Ganadores</span>
                  <span className={styles.detailValue}>{t.winners_count}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Premios</span>
                  <span className={styles.detailValue}>
                    {(t.prizes || []).map((p) => `$${Number(p).toFixed(2)}`).join(' · ')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear/Editar */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? 'Editar Torneo' : 'Nuevo Torneo'}
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          {formError && <div className={styles.error || ''}>{formError}</div>}
          <div className={styles.inputGroup}>
            <label>Nombre del Torneo</label>
            <input
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
              className={styles.input}
              placeholder="Ej: Torneo Relámpago Sabatino"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Fecha y Hora de Inicio</label>
              <input
                type="datetime-local"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                className={styles.input}
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Duración (minutos)</label>
              <input
                type="number"
                required
                min="1"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({...formData, duration_minutes: e.target.value})}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Cantidad de Cartas</label>
            <input
              type="number"
              required
              min="6"
              step="2"
              max="40"
              value={formData.card_count}
              onChange={(e) => setFormData({...formData, card_count: e.target.value})}
              className={styles.input}
            />
            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
              La temática (tecnología, naturaleza o animales) rota automáticamente en cada partida nueva.
            </p>
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
                      setFormData({...formData, prizes: next});
                    }}
                    className={styles.input}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label>Estado del Torneo</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              className={styles.select}
            >
              {Object.entries(TOURNAMENT_STATUSES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
              Debe estar en <strong>Activo</strong> para que los jugadores puedan jugar.
              Al cumplirse la duración indicada, se paga automáticamente a los
              ganadores y pasa a Finalizado — no hace falta hacerlo a mano.
              {formData.status === 'programado' && ' Si lo dejas en Programado, se activa solo al llegar la fecha de inicio.'}
            </p>
          </div>

          <div className={styles.formActions}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={processing} loadingText="Guardando...">
              Guardar Torneo
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Confirmar Eliminación */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        title="¿Eliminar este torneo?"
      >
        <div className={styles.deleteWarning}>
          <p>
            Vas a eliminar <strong>{deleteTarget?.nombre}</strong>. Esta acción
            es permanente y no se puede deshacer. Se eliminarán también todas
            las partidas jugadas en este torneo (su historial de ranking
            desaparece); los tickets y premios ya cobrados por los jugadores
            no se ven afectados.
          </p>
        </div>
        {deleteError && <div className={styles.error}>{deleteError}</div>}
        <div className={styles.formActions}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="dangerSolid"
            size="sm"
            loading={deleting}
            loadingText="Eliminando..."
            onClick={handleConfirmDelete}
          >
            Sí, eliminar torneo
          </Button>
        </div>
      </Modal>
    </div>
  );
}
