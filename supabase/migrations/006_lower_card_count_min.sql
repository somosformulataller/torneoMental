-- ==========================================
-- MIGRACIÓN 006: permitir torneos con menos de 14 cartas (7 pares)
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 005.
--
-- El mínimo de 14 cartas era arbitrario. Se baja a 4 (2 pares) para permitir
-- tableros más pequeños, como 12 cartas (6 pares).

alter table public.tournaments drop constraint if exists tournaments_card_count_check;
alter table public.tournaments add constraint tournaments_card_count_check
  check (card_count >= 4 and card_count % 2 = 0);
