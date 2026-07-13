-- ==========================================
-- MIGRACIÓN 002: nueva mecánica de juego
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió
-- 001_initial_schema.sql (la versión anterior, con racha/pérdida/ticket
-- consumido al fallar). Este script AJUSTA ese estado existente, no lo
-- recrea desde cero.
--
-- Cambio de reglas: ya no existe "perder" al voltear cartas distintas ni
-- objetivo de racha. El ticket se consume al iniciar la partida. La
-- partida termina al completar el tablero o al acabarse el tiempo del
-- torneo. El ranking ordena por pares encontrados (desc) y tiempo total
-- (asc).

-- ------------------------------------------
-- 0. La vista depende de games.best_streak: hay que borrarla antes de
--    poder renombrar esa columna, y recrearla después (paso 3).
-- ------------------------------------------
drop view if exists public.tournament_rankings;

-- ------------------------------------------
-- 1. Tabla tournaments: ya no hay streak_target
-- ------------------------------------------
alter table public.tournaments drop column if exists streak_target;

-- ------------------------------------------
-- 2. Tabla games: best_streak -> pairs_matched,
--    quitar total_pairs_matched (redundante) y el estado 'perdido'
-- ------------------------------------------
update public.games set status = 'completado' where status = 'perdido';

alter table public.games rename column best_streak to pairs_matched;
alter table public.games drop column if exists total_pairs_matched;

alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status in ('en_curso', 'completado'));

-- ------------------------------------------
-- 3. Vista de ranking: más pares, luego menor tiempo
-- ------------------------------------------
create or replace view public.tournament_rankings as
select
  g.tournament_id,
  g.user_id,
  p.nombre as user_nombre,
  p.apellido as user_apellido,
  max(g.pairs_matched) as pairs_matched,
  min(g.total_time_ms) filter (where g.pairs_matched = (
    select max(g2.pairs_matched) from public.games g2
    where g2.user_id = g.user_id
      and g2.tournament_id = g.tournament_id
      and g2.status = 'completado'
  )) as best_time_ms,
  count(g.id) as partidas_jugadas,
  row_number() over (
    partition by g.tournament_id
    order by max(g.pairs_matched) desc, min(g.total_time_ms) asc
  ) as posicion
from public.games g
join public.profiles p on p.id = g.user_id
where g.status = 'completado'
group by g.tournament_id, g.user_id, p.nombre, p.apellido;

-- ------------------------------------------
-- 4. start_game: ahora consume el ticket al iniciar
-- ------------------------------------------
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

-- ------------------------------------------
-- 5. end_game: nueva firma (sin status/racha), ya no toca tickets_balance
-- ------------------------------------------
drop function if exists public.end_game(uuid, integer, integer, integer, text);

create or replace function public.end_game(
  p_game_id uuid,
  p_pairs_matched integer,
  p_time_ms integer
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game games%rowtype;
  v_min_time integer;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_game from games where id = p_game_id and user_id = v_uid for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  if v_game.status <> 'en_curso' then
    raise exception 'La partida ya fue finalizada';
  end if;

  if p_pairs_matched is null or p_pairs_matched < 0 then
    raise exception 'Cantidad de pares inválida';
  end if;

  v_min_time := greatest(p_pairs_matched, 0) * 300;
  if p_time_ms is not null and p_time_ms < v_min_time then
    raise exception 'Tiempo de partida no plausible';
  end if;

  update games set
    pairs_matched = p_pairs_matched,
    total_time_ms = p_time_ms,
    status = 'completado',
    ended_at = now()
  where id = p_game_id
  returning * into v_game;

  return v_game;
end;
$$;

grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.end_game(uuid, integer, integer) to authenticated;
