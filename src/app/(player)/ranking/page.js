import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import RankingClient from './RankingClient';

// Server Component: los datos iniciales viajan dentro del HTML/RSC de la
// navegación, así la vista aparece ya pintada en vez de mostrar el spinner
// "Cargando posiciones..." mientras el navegador consulta Supabase. La
// actualización en vivo (Realtime sobre games, countdown) vive en
// RankingClient.
export default async function RankingPage() {
  const supabase = await createClient();

  // getSession() lee la sesión de las cookies sin viaje de red extra; el
  // proxy ya validó al usuario con getUser() antes de dejar pasar la request,
  // y en última instancia RLS decide qué filas puede ver este token.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect('/login');

  // Perfil, historial de ganadores y torneo activo son independientes entre
  // sí — se piden en paralelo.
  const [{ data: profile }, { data: winnerRows }, { data: tournaments }] = await Promise.all([
    supabase.from('profiles').select('id, nombre, apellido').eq('id', user.id).single(),
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

  const activeTournament = tournaments?.length ? tournaments[0] : null;
  let rankings = [];
  let upcomingTournament = null;

  if (activeTournament) {
    const { data: rankingData } = await supabase
      .from('tournament_rankings')
      .select('*')
      .eq('tournament_id', activeTournament.id)
      .order('posicion', { ascending: true })
      .limit(50); // Top 50
    rankings = rankingData || [];
  } else {
    // Sin torneo activo: si hay uno Programado, mostramos cuándo arranca en
    // vez del empty state genérico.
    const { data: upcoming } = await supabase
      .from('tournaments')
      .select('id, nombre, start_time')
      .eq('status', 'programado')
      .order('start_time', { ascending: true })
      .limit(1);
    upcomingTournament = upcoming?.length ? upcoming[0] : null;
  }

  return (
    <RankingClient
      userId={user.id}
      initialProfile={profile}
      initialActiveTournament={activeTournament}
      initialUpcomingTournament={upcomingTournament}
      initialRankings={rankings}
      initialWinnerRows={winnerRows || []}
    />
  );
}
