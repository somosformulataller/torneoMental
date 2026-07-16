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
