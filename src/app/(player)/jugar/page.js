import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { generatePracticeBoard } from '@/lib/gameLogic';
import JugarClient from './JugarClient';

// Debe coincidir con la constante de JugarClient.js.
const PRACTICE_CARD_COUNT = 14;

// Server Component: resuelve perfil y torneo activo en el servidor, y en
// modo práctica genera también el tablero inicial — así Practicar abre con
// las cartas ya pintadas en el HTML, sin spinner. En modo torneo NO se
// arranca la partida acá: startGameAction descuenta un ticket y Next puede
// pre-cargar esta página sin que el jugador haya tocado "COMPETIR" — el
// cobro tiene que seguir siendo una acción explícita del cliente
// (JugarClient la dispara al montar).
export default async function JugarPage({ searchParams }) {
  const params = await searchParams;
  const isPractice = params?.modo === 'practica';

  const supabase = await createClient();

  // getSession() lee la sesión de las cookies sin viaje de red extra; el
  // proxy ya validó al usuario con getUser() antes de dejar pasar la request,
  // y en última instancia RLS decide qué filas puede ver este token.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect('/login');

  // Perfil y torneo son independientes entre sí — se piden en paralelo.
  // Se incluyen los "programado" además de los "activo": entre ciclos del
  // torneo recurrente no hay ninguno activo, pero el tablero de práctica
  // igual debe usar el card_count del próximo torneo, no el default.
  const [{ data: profile }, { data: tournaments }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('tournaments')
      .select('*')
      .in('status', ['activo', 'programado'])
      .order('start_time', { ascending: true })
      .limit(5),
  ]);

  // Competir exige un torneo ACTIVO; para el tamaño del tablero de práctica
  // sirve también el próximo programado.
  const activeTournament = tournaments?.find((t) => t.status === 'activo') || null;
  const boardTournament = activeTournament || (tournaments?.length ? tournaments[0] : null);
  // Sin torneo activo: el próximo programado alimenta el cronómetro de
  // "inicia en" de la pantalla de Competir (mismo patrón que Ranking).
  const upcomingTournament = activeTournament
    ? null
    : tournaments?.find((t) => t.status === 'programado') || null;

  let initialPracticeBoard = null;
  if (isPractice) {
    initialPracticeBoard = generatePracticeBoard(
      boardTournament?.card_count || PRACTICE_CARD_COUNT
    );
  }

  return (
    <JugarClient
      key={isPractice ? 'practica' : 'torneo'}
      isPractice={isPractice}
      initialProfile={profile}
      initialTournament={activeTournament}
      initialUpcomingTournament={upcomingTournament}
      initialPracticeBoard={initialPracticeBoard}
    />
  );
}
