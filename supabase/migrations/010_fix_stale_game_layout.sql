-- ==========================================
-- MIGRACIÓN 010: regenerar tablero si el torneo cambió de tamaño
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 009.
--
-- Bug: si un jugador ya tenía una partida "en_curso" (card_layout guardado
-- con el card_count viejo del torneo) y el admin después editó ese mismo
-- torneo para cambiar la cantidad de cartas, start_game() seguía
-- devolviendo el tablero viejo (migración 005/009: reutiliza la partida
-- en_curso tal cual). Resultado: el jugador ve, por ejemplo, 7 pares aunque
-- el torneo ahora diga 12 cartas (6 pares).
--
-- Fix: si el tablero guardado no tiene la misma cantidad de cartas que
-- indica tournaments.card_count ahora mismo, se regenera con el layout
-- recién barajado que mandó el cliente (sin cobrar otro ticket ni perder el
-- progreso real, porque ese tablero viejo de todas formas ya no es válido
-- contra la config actual) y se reinicia el cronómetro de esa partida.

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
