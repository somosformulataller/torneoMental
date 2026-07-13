-- ==========================================
-- SCRIPT DE BASE DE DATOS: TORNEO MENTAL
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (proyecto vacío).
-- Este script reemplaza cualquier versión anterior: crea tablas, vista de
-- ranking, funciones RPC (SECURITY DEFINER) y políticas RLS que impiden que
-- el cliente (navegador) manipule tickets, rachas o aprobaciones directamente.

-- ==========================================
-- 1. TABLAS
-- ==========================================

create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  nombre text not null,
  apellido text not null,
  email text not null,
  whatsapp text not null,
  cedula text not null unique,
  tickets_balance integer not null default 0 check (tickets_balance >= 0),
  role text not null default 'player' check (role in ('player', 'admin')),
  created_at timestamp with time zone default now()
);

create table tournaments (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  start_time timestamp with time zone not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  card_theme text not null default 'aleatorio'
    check (card_theme in ('tecnologia', 'naturaleza', 'animales', 'aleatorio')),
  card_count integer not null default 14
    check (card_count >= 14 and card_count % 2 = 0),
  streak_target integer not null default 5 check (streak_target > 0),
  status text not null default 'programado'
    check (status in ('borrador', 'programado', 'activo', 'finalizado')),
  created_by uuid references profiles(id),
  created_at timestamp with time zone default now()
);

create table tickets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  tournament_id uuid references tournaments(id) on delete set null,
  quantity integer not null check (quantity > 0),
  amount_usd decimal(10,2) not null check (amount_usd >= 0),
  payment_reference text not null,
  payment_status text not null default 'pendiente'
    check (payment_status in ('pendiente', 'validando', 'aprobado', 'rechazado')),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table games (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  tournament_id uuid references tournaments(id) on delete cascade not null,
  best_streak integer not null default 0 check (best_streak >= 0),
  total_pairs_matched integer not null default 0 check (total_pairs_matched >= 0),
  total_time_ms bigint,
  card_layout jsonb,
  status text not null default 'en_curso' check (status in ('en_curso', 'completado', 'perdido')),
  created_at timestamp with time zone default now(),
  ended_at timestamp with time zone
);

create index games_tournament_user_idx on games (tournament_id, user_id);
create index games_status_idx on games (status);
create index tickets_user_idx on tickets (user_id);
create index tickets_status_idx on tickets (payment_status);

-- ==========================================
-- 2. HELPERS
-- ==========================================

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

-- ==========================================
-- 3. VISTA DE RANKING
-- ==========================================
-- Las vistas se ejecutan con los privilegios de su dueño (por defecto el rol
-- que las crea), por lo que no quedan sujetas a las políticas RLS restrictivas
-- de "profiles"/"games" que se definen más abajo. Así, cualquier jugador puede
-- ver el ranking completo (nombre + racha) sin poder leer el resto de columnas
-- sensibles de otros usuarios directamente desde la tabla.

create or replace view tournament_rankings as
select
  g.tournament_id,
  g.user_id,
  p.nombre as user_nombre,
  p.apellido as user_apellido,
  max(g.best_streak) as best_streak,
  min(g.total_time_ms) filter (where g.best_streak = (
    select max(g2.best_streak) from games g2
    where g2.user_id = g.user_id
      and g2.tournament_id = g.tournament_id
      and g2.status in ('completado', 'perdido')
  )) as best_time_ms,
  count(g.id) as partidas_jugadas,
  row_number() over (
    partition by g.tournament_id
    order by max(g.best_streak) desc, min(g.total_time_ms) asc
  ) as posicion
from games g
join profiles p on p.id = g.user_id
where g.status in ('completado', 'perdido')
group by g.tournament_id, g.user_id, p.nombre, p.apellido;

-- ==========================================
-- 4. TRIGGER: crear profile al registrarse
-- ==========================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nombre, apellido, email, whatsapp, cedula)
  values (
    new.id,
    new.raw_user_meta_data->>'nombre',
    new.raw_user_meta_data->>'apellido',
    new.email,
    new.raw_user_meta_data->>'whatsapp',
    new.raw_user_meta_data->>'cedula'
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- 5. FUNCIONES RPC (mutaciones sensibles)
-- ==========================================
-- Todas corren como SECURITY DEFINER: validan auth.uid() / rol admin por sí
-- mismas y son la ÚNICA vía para tocar tickets_balance, best_streak y el
-- estado de aprobación de tickets. El cliente nunca escribe esas columnas
-- directamente (no existen políticas RLS de UPDATE para ellas).

-- Inicia una partida: exige tener >=1 ticket disponible pero NO lo consume
-- todavía (según la regla del torneo: el ticket solo se pierde si el
-- jugador falla; si alcanza la racha objetivo, no se descuenta).
create or replace function public.start_game(p_tournament_id uuid)
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

  select tickets_balance into v_balance from profiles where id = v_uid for update;
  if v_balance is null or v_balance <= 0 then
    raise exception 'No tienes tickets disponibles';
  end if;

  insert into games (user_id, tournament_id, status)
  values (v_uid, p_tournament_id, 'en_curso')
  returning * into v_game;

  return v_game;
end;
$$;

-- Finaliza una partida propia. status = 'perdido' consume 1 ticket;
-- status = 'completado' (objetivo de racha alcanzado o corte por tiempo del
-- torneo) no consume ticket. Solo puede llamarse una vez por partida
-- (transición en_curso -> completado/perdido) y valida coherencia básica
-- entre racha, pares y tiempo transcurrido para dificultar el "cheateo".
create or replace function public.end_game(
  p_game_id uuid,
  p_final_streak integer,
  p_total_pairs integer,
  p_time_ms integer,
  p_status text
)
returns games
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

  if p_status not in ('completado', 'perdido') then
    raise exception 'Estado inválido';
  end if;

  select * into v_game from games where id = p_game_id and user_id = v_uid for update;
  if not found then
    raise exception 'Partida no encontrada';
  end if;

  if v_game.status <> 'en_curso' then
    raise exception 'La partida ya fue finalizada';
  end if;

  if p_final_streak < 0 or p_final_streak > greatest(coalesce(p_total_pairs, 0), 0) then
    raise exception 'Racha inválida';
  end if;

  v_min_time := greatest(coalesce(p_total_pairs, 0), 0) * 300; -- 300ms mínimo por par
  if p_time_ms is not null and p_time_ms < v_min_time then
    raise exception 'Tiempo de partida no plausible';
  end if;

  update games set
    best_streak = p_final_streak,
    total_pairs_matched = coalesce(p_total_pairs, 0),
    total_time_ms = p_time_ms,
    status = p_status,
    ended_at = now()
  where id = p_game_id
  returning * into v_game;

  if p_status = 'perdido' then
    update profiles set tickets_balance = greatest(tickets_balance - 1, 0) where id = v_uid;
  end if;

  return v_game;
end;
$$;

-- Aprueba una solicitud de tickets (solo admin): marca la solicitud y
-- acredita el saldo en una sola transacción atómica.
create or replace function public.approve_ticket(p_ticket_id uuid)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
begin
  if not public.is_admin(v_uid) then
    raise exception 'No autorizado';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  if v_ticket.payment_status <> 'pendiente' then
    raise exception 'La solicitud ya fue procesada';
  end if;

  update tickets set payment_status = 'aprobado', updated_at = now()
    where id = p_ticket_id;
  update profiles set tickets_balance = tickets_balance + v_ticket.quantity
    where id = v_ticket.user_id;

  select * into v_ticket from tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

-- Rechaza una solicitud de tickets (solo admin) con nota obligatoria.
create or replace function public.reject_ticket(p_ticket_id uuid, p_reason text)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
begin
  if not public.is_admin(v_uid) then
    raise exception 'No autorizado';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Debe indicar un motivo de rechazo';
  end if;

  update tickets set payment_status = 'rechazado', notes = p_reason, updated_at = now()
  where id = p_ticket_id and payment_status = 'pendiente'
  returning * into v_ticket;

  if not found then
    raise exception 'Solicitud no encontrada o ya procesada';
  end if;

  return v_ticket;
end;
$$;

grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.end_game(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.approve_ticket(uuid) to authenticated;
grant execute on function public.reject_ticket(uuid, text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

-- ==========================================
-- 6. ROW LEVEL SECURITY
-- ==========================================

alter table profiles enable row level security;
alter table tournaments enable row level security;
alter table tickets enable row level security;
alter table games enable row level security;

-- Profiles: cada quien ve su fila; los admins ven todas.
-- NO hay política de UPDATE para el cliente: tickets_balance y role solo
-- cambian vía las funciones RPC de arriba (SECURITY DEFINER).
create policy "profiles_select_own_or_admin" on profiles
  for select using (auth.uid() = id or public.is_admin(auth.uid()));

-- Tournaments: visibles para todos, solo admins escriben (vía Server Actions,
-- que igual pasan por esta política porque usan el cliente con la sesión).
create policy "tournaments_select" on tournaments
  for select using (true);
create policy "tournaments_admin_write" on tournaments
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Tickets: el usuario puede crear su propia solicitud, siempre en estado
-- 'pendiente' (no puede insertarla ya aprobada). Solo puede leer las suyas;
-- los admins leen todas. No hay política de UPDATE: aprobar/rechazar es
-- exclusivamente vía approve_ticket/reject_ticket.
create policy "tickets_select_own_or_admin" on tickets
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
create policy "tickets_insert_own_pending" on tickets
  for insert with check (auth.uid() = user_id and payment_status = 'pendiente');

-- Games: el usuario ve las suyas, los admins ven todas. No hay políticas de
-- INSERT/UPDATE: crear y finalizar partidas es exclusivamente vía
-- start_game/end_game.
create policy "games_select_own_or_admin" on games
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
