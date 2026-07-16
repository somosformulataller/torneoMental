import { createAdminClient } from '@/lib/supabase/admin';

// Llamado por Vercel Cron (ver vercel.json) cada pocos minutos. Hace dos
// cosas, en este orden:
// 1. Cierra cualquier torneo Activo cuyo tiempo ya se cumplió: paga a los
//    ganadores y, si es recurrente, encadena el siguiente ciclo
//    (finalize_recurring_tournament, ver migración 008).
// 2. Activa cualquier torneo Programado cuya fecha de inicio ya llegó
//    (activate_scheduled_tournaments) — incluye tanto los ciclos recién
//    encadenados como torneos sueltos no recurrentes.
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: activeTournaments, error: fetchError } = await supabase
    .from('tournaments')
    .select('id, start_time, duration_minutes')
    .eq('status', 'activo');

  if (fetchError) {
    return Response.json({ error: fetchError.message }, { status: 500 });
  }

  const now = Date.now();
  const expired = (activeTournaments || []).filter((t) => {
    const endTime = new Date(t.start_time).getTime() + t.duration_minutes * 60000;
    return endTime <= now;
  });

  for (const t of expired) {
    const { error } = await supabase.rpc('finalize_recurring_tournament', {
      p_tournament_id: t.id,
    });
    if (error) {
      return Response.json({ error: `finalize_recurring_tournament(${t.id}): ${error.message}` }, { status: 500 });
    }
  }

  const { error: activateError } = await supabase.rpc('activate_scheduled_tournaments');
  if (activateError) {
    return Response.json({ error: activateError.message }, { status: 500 });
  }

  return Response.json({ ok: true, finalized: expired.map((t) => t.id) });
}
