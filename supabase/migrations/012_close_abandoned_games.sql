-- ==========================================
-- MIGRACIÓN 012: cerrar partidas "en_curso" abandonadas y no revivirlas
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 011.
--
-- Bug: start_game() reutiliza la partida 'en_curso' más reciente del jugador
-- para ese torneo, sin límite de antigüedad. Antes de la migración 011,
-- varias partidas quedaron atascadas en 'en_curso' (el intento de
-- regenerarlas fallaba por la columna matched_pair_ids, que todavía no
-- existía). Como esas filas nunca pasaron a 'completado', cada start_game()
-- posterior las encuentra, les regenera el tablero (mismo id, solo cambia
-- created_at) y devuelve "una partida nueva" al jugador — pero el cobro de
-- ticket solo pasa en la rama de "no había ninguna en_curso". Resultado: un
-- jugador con una fila en_curso vieja puede seguir jugando gratis para
-- siempre, porque esa misma fila se recicla en cada partida.
--
-- Fix en dos partes:
-- 1) Cierra (pasa a 'completado') cualquier partida en_curso que ya lleve
--    más tiempo que la duración del torneo al que pertenece — es imposible
--    que siga siendo una sesión real en curso, sin importar de qué usuario
--    sea.
-- 2) start_game() aplica ese mismo criterio de antigüedad de ahora en
--    adelante: si la partida en_curso encontrada ya venció, la cierra como
--    abandonada y crea una partida nueva cobrando el ticket, en vez de
--    revivirla.

update public.games g
set status = 'completado',
    pairs_matched = coalesce(jsonb_array_length(g.matched_pair_ids), 0),
    ended_at = now()
from public.tournaments t
where g.tournament_id = t.id
  and g.status = 'en_curso'
  and g.created_at < now() - make_interval(mins => t.duration_minutes);

create or replace function public.start_game(p_tournament_id uuid, p_card_layout jsonb default null)
returns games
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
    if v_game.created_at < now() - make_interval(mins => v_tournament.duration_minutes) then
      -- Partida abandonada hace rato: se cierra y se cae al flujo normal de
      -- abajo, que crea una partida nueva y sí cobra el ticket.
      update games
        set status = 'completado',
            pairs_matched = coalesce(jsonb_array_length(v_game.matched_pair_ids), 0),
            ended_at = now()
        where id = v_game.id;
    else
      if jsonb_array_length(coalesce(v_game.card_layout, '[]'::jsonb)) <> v_tournament.card_count then
        update games
          set card_layout = p_card_layout,
              matched_pair_ids = '[]'::jsonb,
              created_at = now()
          where id = v_game.id
          returning * into v_game;
      end if;
      return v_game;
    end if;
  end if;

  select tickets_balance into v_balance from profiles where id = v_uid for update;
  if v_balance is null or v_balance <= 0 then
    raise exception 'No tienes tickets disponibles';
  end if;

  update profiles set tickets_balance = tickets_balance - 1 where id = v_uid;

  insert into games (user_id, tournament_id, status, card_layout)
  values (v_uid, p_tournament_id, 'en_curso', p_card_layout)
  returning * into v_game;

  return v_game;
end;
$$;

grant execute on function public.start_game(uuid, jsonb) to authenticated;
