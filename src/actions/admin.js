'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Verifica que quien llama esté autenticado y sea admin. Devuelve el user o
// un objeto { error } listo para retornar desde la acción.
async function requireAdmin(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') return { error: 'No autorizado' };
  return { user };
}

// Bloquea o desbloquea a un jugador. El RPC (SECURITY DEFINER) revalida el rol
// admin y evita bloquear administradores o a uno mismo.
export async function adminSetUserBlockedAction(userId, blocked) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_set_user_blocked', {
    p_user_id: userId,
    p_blocked: !!blocked,
  });
  if (error) return { error: error.message };
  return { profile: data };
}

// Elimina permanentemente a un usuario (borra su cuenta de Auth; el perfil y
// sus datos caen por ON DELETE CASCADE). Solo admin. Usa la service-role key
// vía la Admin API porque borrar de auth.users no es posible desde una RPC.
export async function adminDeleteUserAction(userId) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return { error: auth.error };
  if (userId === auth.user.id) return { error: 'No puedes eliminar tu propia cuenta desde aquí' };

  // No permitir borrar a otro administrador.
  const { data: target } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (target?.role === 'admin') return { error: 'No puedes eliminar a un administrador' };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  return { success: true };
}
