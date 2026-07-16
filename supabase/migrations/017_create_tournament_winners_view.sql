-- ==========================================
-- MIGRACIÓN 017: crear tournament_winners de verdad + arreglos pendientes
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 013 (015 y 016 no hace falta que hayan corrido antes
-- de esta — 016 falló entera porque la vista de 014 nunca se creó, y como
-- el editor corre todo el script como una sola transacción, no quedó nada
-- de esa migración aplicado).
--
-- Este script deja TODO lo que 014 y 016 debían dejar, de una sola vez:
-- 1) Crea la vista tournament_winners (esto es lo que faltaba: el error
--    "relation tournament_winners does not exist" confirma que la 014
--    nunca se llegó a correr contra esta base de datos).
-- 2) Le da grant explícito de SELECT a authenticated/anon.
-- 3) Habilita Realtime en la tabla games (para que Ranking pueda
--    escuchar cambios reales — las vistas no sirven para eso).
-- 4) Fuerza a PostgREST a refrescar su caché de esquema.

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

grant select on public.tournament_winners to authenticated, anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

notify pgrst, 'reload schema';
