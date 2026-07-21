'use server';

import { createClient } from '@/lib/supabase/server';

// El jugador guarda sus datos de Pago Móvil (para que el admin le pague los
// premios). Pasa por el RPC update_payout_info (SECURITY DEFINER): no existe
// política RLS de UPDATE sobre profiles, así que esta es la única vía.
export async function updatePayoutInfoAction({ nombre, banco, cedula, telefono }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data, error } = await supabase.rpc('update_payout_info', {
    p_nombre: nombre ?? '',
    p_banco: banco ?? '',
    p_cedula: cedula ?? '',
    p_telefono: telefono ?? '',
  });

  if (error) return { error: error.message };
  return { profile: data };
}
