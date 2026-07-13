'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TOURNAMENT_STATUSES, THEMES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import styles from './torneos.module.css';

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
    card_theme: 'aleatorio',
    card_count: 14,
    start_time: '',
    duration_minutes: 60,
    status: 'programado'
  });

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
        card_theme: tournament.card_theme,
        card_count: tournament.card_count,
        start_time: date.toISOString().slice(0, 16),
        duration_minutes: tournament.duration_minutes,
        status: tournament.status
      });
    } else {
      setIsEditing(false);
      setFormData({
        id: null,
        nombre: '',
        card_theme: 'aleatorio',
        card_count: 14,
        start_time: '',
        duration_minutes: 60,
        status: 'programado'
      });
    }
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setProcessing(true);

    try {
      const dataToSave = {
        nombre: formData.nombre,
        card_theme: formData.card_theme,
        card_count: Number(formData.card_count),
        start_time: new Date(formData.start_time).toISOString(),
        duration_minutes: Number(formData.duration_minutes),
        status: formData.status
      };

      if (isEditing) {
        const { error } = await supabase
          .from('tournaments')
          .update(dataToSave)
          .eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tournaments')
          .insert(dataToSave);
        if (error) throw error;
      }

      setShowModal(false);
      loadTournaments();
    } catch (err) {
      console.error('Error saving tournament:', err);
      alert('Error al guardar: ' + err.message);
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Torneos</h1>
        <button className={styles.createBtn} onClick={() => handleOpenModal()}>
          + Nuevo Torneo
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Cargando torneos...</div>
      ) : tournaments.length === 0 ? (
        <div className={styles.emptyState}>No hay torneos creados</div>
      ) : (
        <div className={styles.grid}>
          {tournaments.map((t) => (
            <div key={t.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span 
                  className={styles.statusBadge}
                  style={{
                    backgroundColor: `${TOURNAMENT_STATUSES[t.status]?.color}20`,
                    color: TOURNAMENT_STATUSES[t.status]?.color,
                    borderColor: `${TOURNAMENT_STATUSES[t.status]?.color}50`
                  }}
                >
                  {TOURNAMENT_STATUSES[t.status]?.label}
                </span>
                <button className={styles.editBtn} onClick={() => handleOpenModal(t)}>
                  Editar
                </button>
              </div>
              
              <h3 className={styles.tournName}>{t.nombre}</h3>
              
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
                  <span className={styles.detailLabel}>Temática</span>
                  <span className={styles.detailValue} style={{textTransform: 'capitalize'}}>
                    {t.card_theme}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Cartas</span>
                  <span className={styles.detailValue}>{t.card_count}</span>
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

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label>Temática de Cartas</label>
              <select
                value={formData.card_theme}
                onChange={(e) => setFormData({...formData, card_theme: e.target.value})}
                className={styles.select}
              >
                <option value="aleatorio">Aleatorio</option>
                {Object.values(THEMES).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.inputGroup}>
              <label>Cantidad de Cartas</label>
              <input
                type="number"
                required
                min="14"
                step="2"
                max="40"
                value={formData.card_count}
                onChange={(e) => setFormData({...formData, card_count: e.target.value})}
                className={styles.input}
              />
            </div>
          </div>

          {isEditing && (
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
            </div>
          )}

          <div className={styles.formActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
              Cancelar
            </button>
            <button type="submit" className={styles.saveBtn} disabled={processing}>
              {processing ? 'Guardando...' : 'Guardar Torneo'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
