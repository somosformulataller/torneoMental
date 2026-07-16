-- ==========================================
-- MIGRACIÓN 015: habilitar Realtime en profiles y tickets
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 014.
--
-- Hoy, cuando el admin aprueba un pago de tickets (approve_ticket), el
-- jugador no se entera hasta que recarga la página a mano — Inicio y
-- Billetera solo piden el perfil una vez al montar. Para que el saldo de
-- tickets (y el estado "Aprobado"/"Rechazado" del historial de compras) se
-- actualicen solos, el cliente necesita poder suscribirse a cambios de
-- Postgres via Supabase Realtime — que solo entrega eventos de tablas
-- agregadas explícitamente a la publicación `supabase_realtime` (no basta
-- con que la tabla exista).
--
-- Idempotente: si la tabla ya está en la publicación (ej. se agregó antes a
-- mano desde el Dashboard), no falla.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end $$;
