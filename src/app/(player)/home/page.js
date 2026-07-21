import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import HomeClient from './HomeClient';

// La compra de tickets (Server Action en HomeClient) valida el pago contra el
// banco en línea, lo que puede tardar varios segundos si el proveedor tiene que
// "scrapear". Subimos el límite por defecto (10s en Vercel) para esta ruta y
// todas sus Server Actions, y así la validación no se corta a mitad.
export const maxDuration = 30;

// Server Component: los datos iniciales viajan dentro del HTML/RSC de la
// navegación, así la vista aparece ya pintada en vez de mostrar el spinner
// "Cargando..." mientras el navegador consulta Supabase. La interactividad
// (compra de tickets, Realtime, tasa BCV) vive en HomeClient.
export default async function HomePage() {
  const supabase = await createClient();

  // getSession() lee la sesión de las cookies sin viaje de red extra; el
  // proxy ya validó al usuario con getUser() antes de dejar pasar la request,
  // y en última instancia RLS decide qué filas puede ver este token.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect('/login');

  const [{ data: profile }, { data: tournaments }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('tournaments')
      .select('*')
      .in('status', ['programado', 'activo'])
      .order('start_time', { ascending: true })
      .limit(1),
  ]);

  return (
    <HomeClient
      userId={user.id}
      initialProfile={profile}
      initialTournament={tournaments?.length > 0 ? tournaments[0] : null}
    />
  );
}
