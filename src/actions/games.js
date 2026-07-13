'use server';

import { createClient } from '@/lib/supabase/server';

export async function startGameAction(tournamentId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_game', {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: error.message };
  return { game: data };
}

export async function endGameAction({ gameId, finalStreak, totalPairs, timeMs, status }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('end_game', {
    p_game_id: gameId,
    p_final_streak: finalStreak,
    p_total_pairs: totalPairs,
    p_time_ms: timeMs,
    p_status: status,
  });

  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { game: data, profile };
}
