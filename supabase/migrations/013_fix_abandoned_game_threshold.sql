-- ==========================================
-- MIGRACIÓN 013: corregir el límite para considerar una partida abandonada
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 012.
--
-- La migración 012 usaba tournaments.duration_minutes como límite para
-- decidir si una partida 'en_curso' estaba abandonada. Error: ese campo es
-- cuánto dura el TORNEO completo (en Copa Mental hoy está en 5000 minutos,
-- ~3.5 días), no cuánto debería durar una sola partida de memoria. Con ese
-- criterio, ninguna partida vieja se consideraba vencida y siguen quedando
-- 59 filas 'en_curso' zombis sin cerrar.
--
-- Fix: usar un límite fijo y corto (30 minutos) en vez de duration_minutes.
-- Ninguna partida real de memoria (6 a 20 pares) toma más que eso; si una
-- fila en_curso lleva más de 30 minutos sin cerrarse, es abandono, no una
-- sesión real en curso.

update public.games
set status = 'completado',
    pairs_matched = coalesce(jsonb_array_length(matched_pair_ids), 0),
    ended_at = now()
where status = 'en_curso'
  and created_at < now() - interval '30 minutes';

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
    if v_game.created_at < now() - interval '30 minutes' then
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
