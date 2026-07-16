-- ==========================================
-- MIGRACIÓN 009: guardar el tablero, los pares y el tiempo de la partida
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 008.
--
-- Antes, si el jugador salía de /jugar (cerraba la app o navegaba a Inicio/
-- Ranking/Billetera) y volvía, la migración 005 ya evitaba que le cobraran
-- otro ticket, pero el tablero se regeneraba desde cero (perdía los pares ya
-- encontrados) y el cronómetro reiniciaba en 00:00.
--
-- Ahora start_game() recibe el tablero ya barajado por el cliente y lo
-- guarda en games.card_layout (columna que ya existía sin usarse). Cada vez
-- que el jugador encuentra un par, record_match() lo agrega a
-- games.matched_pair_ids. Al volver a entrar, el cliente reconstruye
-- exactamente el mismo tablero + pares encontrados desde esas columnas, y el
-- cronómetro se calcula como now() - games.created_at (tiempo real
-- transcurrido, sigue corriendo aunque la app esté cerrada — es una
-- competencia por tiempo, no se puede "pausar" saliendo de la app).

alter table public.games
  add column if not exists matched_pair_ids jsonb not null default '[]'::jsonb;

-- start_game ahora acepta el tablero ya barajado (p_card_layout). Se cambia
-- la firma (nuevo parámetro), así que hay que borrar la versión anterior.
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

  -- Si ya hay una partida en_curso para este torneo, se reutiliza tal cual
  -- (mismo tablero, mismos pares ya encontrados) — el layout recién barajado
  -- que mandó el cliente se descarta, no se cobra otro ticket.
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

  insert into games (user_id, tournament_id, status, card_layout)
  values (v_uid, p_tournament_id, 'en_curso', p_card_layout)
  returning * into v_game;

  return v_game;
end;
$$;

-- Registra un par encontrado. Se llama una vez por cada par que el jugador
-- encuentra durante la partida (no espera a end_game), para que sobreviva a
-- que cierre la app a mitad de partida.
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
    return; -- la partida ya se cerró (ej. se acabó el tiempo del torneo)
  end if;

  if not (v_game.matched_pair_ids @> to_jsonb(p_pair_id)) then
    update games set matched_pair_ids = matched_pair_ids || jsonb_build_array(p_pair_id)
    where id = p_game_id;
  end if;
end;
$$;

grant execute on function public.start_game(uuid, jsonb) to authenticated;
grant execute on function public.record_match(uuid, text) to authenticated;
