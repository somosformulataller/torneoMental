import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BilleteraClient from './BilleteraClient';

// Server Component: los datos iniciales viajan dentro del HTML/RSC de la
// navegación, así la vista aparece ya pintada en vez de mostrar el spinner
// "Cargando billetera..." mientras el navegador consulta Supabase. La
// interactividad (Realtime, eliminar cuenta) vive en BilleteraClient.
export default async function BilleteraPage() {
  const supabase = await createClient();

  // getSession() lee la sesión de las cookies sin viaje de red extra; el
  // proxy ya validó al usuario con getUser() antes de dejar pasar la request,
  // y en última instancia RLS decide qué filas puede ver este token.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect('/login');

  // Perfil, tickets, premios y retiros son independientes entre sí — se piden
  // en paralelo en vez de uno tras otro.
  const [{ data: profile }, { data: tickets }, { data: prizes }, { data: withdrawals }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('tickets')
      .select(`*, tournaments ( nombre )`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('wallet_transactions')
      .select(`*, tournaments ( nombre )`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <BilleteraClient
      userId={user.id}
      initialProfile={profile}
      initialTickets={tickets || []}
      initialPrizes={prizes || []}
      initialWithdrawals={withdrawals || []}
    />
  );
}
