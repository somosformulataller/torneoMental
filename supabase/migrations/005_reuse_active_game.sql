-- ==========================================
-- MIGRACIÓN 005: no cobrar un ticket nuevo al recargar la pantalla de juego
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 004.
--
-- Bug: start_game() descontaba un ticket y creaba una fila en 'games' cada
-- vez que se llamaba, sin revisar si el jugador ya tenía una partida
-- 'en_curso' para ese torneo. La pantalla /jugar llama a start_game() en
-- cada montaje del componente, así que cada recarga (F5) de la pantalla
-- volvía a cobrar un ticket y dejaba una partida abandonada en curso.
--
-- Fix: si ya existe una partida 'en_curso' del jugador para ese torneo, se
-- reutiliza esa misma fila (sin tocar tickets_balance ni crear una nueva).

create or replace function public.start_game(p_tournament_id uuid)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance integer;
  v_tournament tournaments%rowtype;
  v_game games%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_tournament from tournaments
    where id = p_tournament_id and status = 'activo';
  if not found then
    raise exception 'El torneo no está activo';
  end if;

  select * into v_game from games
    where user_id = v_uid
      and tournament_id = p_tournament_id
      and status = 'en_curso'
    order by created_at desc
    limit 1;
  if found then
    return v_game;
  end if;

  select tickets_balance into v_balance from profiles where id = v_uid for update;
  if v_balance is null or v_balance <= 0 then
    raise exception 'No tienes tickets disponibles';
  end if;

  update profiles set tickets_balance = tickets_balance - 1 where id = v_uid;

  insert into games (user_id, tournament_id, status)
  values (v_uid, p_tournament_id, 'en_curso')
  returning * into v_game;

  return v_game;
end;
$$;
