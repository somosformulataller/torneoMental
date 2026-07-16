-- ==========================================
-- MIGRACIÓN 016: arreglar tournament_winners (404) y Realtime de games
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 015.
--
-- Bug 1: la vista tournament_winners (migración 014) responde 404 desde la
-- API — probablemente porque no tiene el grant explícito de SELECT para
-- authenticated/anon (tournament_rankings tampoco lo tiene, pero puede
-- haber quedado con privilegios por defecto distintos), y/o porque el
-- caché de esquema de PostgREST no se refrescó tras crearla. Este bloque
-- deja el grant explícito y fuerza el refresco del caché.
--
-- Bug 2: el canal Realtime de Ranking escuchaba cambios en
-- 'tournament_rankings', que es una VISTA — Realtime (basado en logical
-- replication) solo puede escuchar TABLAS reales, nunca vistas. El server
-- rechaza esa suscripción y el cliente queda reintentando sin parar,
-- lanzando "cannot add postgres_changes callbacks... after subscribe()" en
-- bucle (visto en la consola del navegador). El fix de código (siguiente
-- commit) escucha la tabla real `games` en su lugar; acá solo falta
-- habilitarla en la publicación de Realtime.

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
