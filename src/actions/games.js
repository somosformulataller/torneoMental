'use server';

import { createClient } from '@/lib/supabase/server';

async function currentProfile(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function startGameAction(tournamentId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_game', {
    p_tournament_id: tournamentId,
  });

  if (error) return { error: error.message };

  const profile = await currentProfile(supabase);
  return { game: data, profile };
}

export async function endGameAction({ gameId, pairsMatched, timeMs }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('end_game', {
    p_game_id: gameId,
    p_pairs_matched: pairsMatched,
    p_time_ms: timeMs,
  });

  if (error) return { error: error.message };
  return { game: data };
}
