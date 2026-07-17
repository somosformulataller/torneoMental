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

  // Perfil y torneo activo son independientes entre sí — se piden en
  // paralelo (también en modo práctica, para que el tablero coincida con el
  // card_count del torneo real).
  const [{ data: profile }, { data: tournaments }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'activo')
      .order('start_time', { ascending: true })
      .limit(1),
  ]);

  const activeTournament = tournaments?.length ? tournaments[0] : null;

  let initialPracticeBoard = null;
  if (isPractice) {
    initialPracticeBoard = generatePracticeBoard(
      activeTournament?.card_count || PRACTICE_CARD_COUNT
    );
  }

  return (
    <JugarClient
      key={isPractice ? 'practica' : 'torneo'}
      isPractice={isPractice}
      initialProfile={profile}
      initialTournament={activeTournament}
      initialPracticeBoard={initialPracticeBoard}
    />
  );
}
