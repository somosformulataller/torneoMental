-- ==========================================
-- MIGRACIÓN 003: temática siempre rotativa + premios configurables
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió
-- 001_initial_schema.sql y 002_game_rules_update.sql.
--
-- Cambio 1: la temática de las cartas ya no se fija por torneo. Cada
-- partida nueva elige automáticamente (en el cliente) una temática distinta
-- a la última jugada por ese usuario, siempre dentro de las tres que tienen
-- diseño de cartas (tecnologia, naturaleza, animales). La columna
-- tournaments.card_theme deja de leerse para esto: se mantiene en la tabla
-- sin uso funcional para no romper filas existentes.
--
-- Cambio 2: el admin ahora puede definir cuántos jugadores ganan un torneo
-- y cuánto premio en USD recibe cada uno de ellos.

alter table public.tournaments
  add column if not exists winners_count integer not null default 1
    check (winners_count > 0),
  add column if not exists prize_usd numeric(10,2) not null default 0
    check (prize_usd >= 0);
