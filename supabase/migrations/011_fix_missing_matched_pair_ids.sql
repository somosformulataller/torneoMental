-- ==========================================
-- MIGRACIÓN 011: aplicar lo que 009 no llegó a aplicar
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Diagnóstico: la migración 009 (guardar tablero/pares/tiempo de la
-- partida) nunca se ejecutó realmente contra esta base de datos, aunque la
-- 010 sí — CREATE OR REPLACE FUNCTION no valida las columnas que referencia
-- en el cuerpo hasta que la función se ejecuta, así que la 010 "tuvo éxito"
-- pero start_game() quedó apuntando a una columna que no existe
-- (games.matched_pair_ids) y record_match() nunca se creó. Efecto real:
-- cada par encontrado fallaba en silencio al guardarse, y si algún jugador
-- quedaba con una partida en_curso desactualizada, el fix de la migración
-- 010 iba a romperse con "column matched_pair_ids does not exist".
--
-- Esta migración dispersa 009 (columna + record_match) y vuelve a dejar
-- start_game() en su versión final correcta (misma lógica de 010), de forma
-- idempotente — se puede correr aunque partes ya existan.

alter table public.games
  add column if not exists matched_pair_ids jsonb not null default '[]'::jsonb;

-- Por si quedó de una migración anterior a la 009 un start_game(uuid) de un
-- solo parámetro (versión vieja, sin p_card_layout).
drop function if exists public.start_game(uuid);

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

create or replace function public.record_match(p_game_id uuid, p_pair_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game games%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_game from games where id = p_game_id and user_id = v_uid for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  if v_game.status <> 'en_curso' then
    return;
  end if;

  if not (v_game.matched_pair_ids @> to_jsonb(p_pair_id)) then
    update games set matched_pair_ids = matched_pair_ids || jsonb_build_array(p_pair_id)
    where id = p_game_id;
  end if;
end;
$$;

grant execute on function public.start_game(uuid, jsonb) to authenticated;
grant execute on function public.record_match(uuid, text) to authenticated;
