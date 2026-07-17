'use server';

import { createClient } from '@/lib/supabase/server';

function validateTournamentData(data) {
  if (!data.nombre?.trim()) {
    return 'El nombre del torneo es obligatorio';
  }
  if (!Number.isInteger(data.card_count) || data.card_count < 4 || data.card_count % 2 !== 0) {
    return 'La cantidad de cartas debe ser un número par de al menos 4';
  }
  if (!data.start_time || Number.isNaN(new Date(data.start_time).getTime())) {
    return 'La fecha de inicio es inválida';
  }
  if (!Number.isInteger(data.duration_minutes) || data.duration_minutes < 1) {
    return 'La duración debe ser mayor a 0 minutos';
  }
  if (!Number.isInteger(data.winners_count) || data.winners_count < 1) {
    return 'La cantidad de ganadores debe ser al menos 1';
  }
  if (
    !Array.isArray(data.prizes) ||
    data.prizes.length !== data.winners_count ||
    data.prizes.some((p) => typeof p !== 'number' || Number.isNaN(p) || p < 0)
  ) {
    return 'Debes indicar un premio válido (mayor o igual a 0) para cada ganador';
  }
  if (
    data.is_recurring &&
    (!Number.isInteger(data.recurring_gap_minutes) || data.recurring_gap_minutes < 0)
  ) {
    return 'Debes indicar cuántos minutos pasan entre un ciclo y el siguiente';
  }
  return null;
}

export async function createTournamentAction(data) {
  const validationError = validateTournamentData(data);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from('tournaments')
    .insert({ ...data, created_by: user?.id })
    .select()
    .single();

  if (error) return { error: error.message };
  return { tournament: row };
}

export async function deleteTournamentAction(id) {
  const supabase = await createClient();
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) return { error: error.message };
  return { success: true };
}

// Campos que forman la "configuración" del torneo recurrente — los únicos
// que tiene sentido diferir al siguiente ciclo vía next_cycle_settings.
const RECURRING_SETTINGS_FIELDS = [
  'nombre',
  'card_count',
  'duration_minutes',
  'winners_count',
  'prizes',
  'recurring_gap_minutes',
];

function pickRecurringSettings(source) {
  const out = {};
  for (const field of RECURRING_SETTINGS_FIELDS) out[field] = source[field];
  return out;
}

// Actualiza el torneo recurrente según a qué deben aplicar los cambios:
// - 'ambos': actualiza la fila del ciclo en curso (que es también la
//   plantilla de los siguientes) y limpia cualquier cambio pendiente.
// - 'actual': actualiza la fila, pero preserva en next_cycle_settings la
//   configuración que ya estaba destinada a los siguientes ciclos (la
//   pendiente si había, o la que tenía la fila antes de este cambio).
// - 'siguiente': no toca el ciclo en curso; guarda los valores nuevos en
//   next_cycle_settings, que finalize_recurring_tournament (migración 018)
//   aplica al crear el próximo ciclo.
export async function updateRecurringTournamentAction(id, data, applyTo) {
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) return { error: fetchError.message };

  const settings = pickRecurringSettings(data);
  const validationError = validateTournamentData({
    ...settings,
    is_recurring: true,
    start_time: current.start_time,
  });
  if (validationError) return { error: validationError };

  let update;
  if (applyTo === 'actual') {
    update = {
      ...settings,
      next_cycle_settings: current.next_cycle_settings || pickRecurringSettings(current),
    };
  } else if (applyTo === 'siguiente') {
    update = { next_cycle_settings: settings };
  } else {
    update = { ...settings, next_cycle_settings: null };
  }

  const { data: row, error } = await supabase
    .from('tournaments')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { tournament: row };
}

export async function updateTournamentAction(id, data) {
  const validationError = validateTournamentData(data);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('tournaments')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) return { error: error.message };
  return { tournament: row };
}
