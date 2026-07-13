import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente con la secret key: ignora RLS por completo. Solo debe usarse
// dentro de Server Actions / Route Handlers para operaciones administrativas
// que las funciones RPC (SECURITY DEFINER) del schema no cubran (por
// ejemplo, administración de usuarios vía Supabase Auth Admin API).
// NUNCA importar este archivo desde un componente 'use client'.
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() no debe usarse en el navegador');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el entorno del servidor');
  }

  return createSupabaseClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
