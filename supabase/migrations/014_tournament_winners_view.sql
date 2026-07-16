-- ==========================================
-- MIGRACIÓN 014: vista pública de ganadores de torneos finalizados
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 013.
--
-- wallet_transactions (migración 008) guarda quién ganó qué premio en cada
-- torneo, pero su política RLS solo deja ver las propias filas (o al admin
-- ver todas) — correcto para datos de billetera, pero no sirve para mostrar
-- en Ranking "quién ganó la copa anterior" a TODOS los jugadores.
--
-- Igual que tournament_rankings (migración 001), una vista corre con los
-- privilegios de quien la crea, no con las políticas RLS restrictivas de las
-- tablas base — así cualquier jugador puede ver nombre + posición + premio
-- de copas ya finalizadas, sin poder leer el resto de columnas sensibles de
-- wallet_transactions/profiles directamente.

create or replace view public.tournament_winners as
select
  wt.tournament_id,
  t.nombre as tournament_nombre,
  t.start_time as tournament_start_time,
  wt.user_id,
  p.nombre as user_nombre,
  p.apellido as user_apellido,
  wt.position,
  wt.amount_usd
from wallet_transactions wt
join tournaments t on t.id = wt.tournament_id
join profiles p on p.id = wt.user_id
where t.status = 'finalizado'
order by t.start_time desc, wt.position asc;
