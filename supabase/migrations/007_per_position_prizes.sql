-- ==========================================
-- MIGRACIÓN 007: premio distinto para cada posición ganadora
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 006.
--
-- Antes: prize_usd era un solo monto igual para todos los ganadores.
-- Ahora: prizes es un arreglo con un monto por posición (prizes[1] = premio
-- del 1er lugar, prizes[2] = 2do lugar, etc.), length == winners_count.

alter table public.tournaments add column if not exists prizes numeric(10,2)[] not null default '{}';

-- Migra los torneos existentes: repite su prize_usd actual en cada posición,
-- para no perder el valor que ya tenían configurado.
update public.tournaments t
set prizes = (select array_agg(t.prize_usd) from generate_series(1, t.winners_count))
where t.prizes = '{}';

alter table public.tournaments drop column if exists prize_usd;

alter table public.tournaments drop constraint if exists tournaments_prizes_length_check;
alter table public.tournaments add constraint tournaments_prizes_length_check
  check (array_length(prizes, 1) = winners_count);
