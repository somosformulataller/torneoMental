import { createClient } from '@/lib/supabase/client';

// Nombre legible de cada pantalla del jugador, a partir de la ruta. Sirve para
// las estadísticas de Interacción (qué pantallas visita el usuario).
export function screenNameFromPath(pathname) {
  if (!pathname) return null;
  if (pathname === '/home') return 'inicio';
  if (pathname.startsWith('/jugar')) return 'jugar';
  if (pathname.startsWith('/ranking')) return 'ranking';
  if (pathname.startsWith('/billetera')) return 'billetera';
  return null;
}

// Etiquetas para mostrar en el admin.
export const SCREEN_LABELS = {
  inicio: 'Inicio',
  jugar: 'Competir / Jugar',
  ranking: 'Ranking',
  billetera: 'Billetera',
};

// Registra un evento de actividad del jugador. Es "fire and forget": nunca
// lanza ni bloquea la UI — si falla (sin sesión, red caída), simplemente se
// pierde ese evento. La política RLS solo deja insertar filas del propio
// usuario, así que un usuario no puede falsear actividad de otro.
export async function logActivity(eventType, { screen = null, path = null, metadata = null } = {}) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('activity_events').insert({
      user_id: user.id,
      event_type: eventType,
      screen,
      path,
      metadata,
    });
  } catch {
    // Silencioso a propósito: el registro de actividad nunca debe afectar al jugador.
  }
}

// Atajo para el evento más común: "vio una pantalla".
export function logScreenView(pathname) {
  const screen = screenNameFromPath(pathname);
  if (!screen) return;
  return logActivity('screen_view', { screen, path: pathname });
}
