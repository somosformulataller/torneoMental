-- ==========================================
-- 021 · MODERACIÓN DE USUARIOS + REGISTRO DE ACTIVIDAD
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase.
-- Agrega:
--   1) Bloqueo de usuarios (columna profiles.blocked + RPC admin).
--   2) Tabla activity_events: registra la navegación del jugador (qué
--      pantallas visita) para poder analizar cómo usa la app.
-- Ambas partes son idempotentes (if not exists / create or replace).

-- ------------------------------------------------------------------
-- 1) BLOQUEO DE USUARIOS
-- ------------------------------------------------------------------
alter table profiles add column if not exists blocked boolean not null default false;
alter table profiles add column if not exists blocked_at timestamptz;

-- El admin bloquea/desbloquea a un jugador. No puede bloquearse a sí mismo ni
-- a otro administrador. Un usuario bloqueado no puede usar la app (el proxy lo
-- saca de las pantallas de jugador y las acciones sensibles lo rechazan).
create or replace function public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target profiles%rowtype;
begin
  if not public.is_admin(v_uid) then
    raise exception 'No autorizado';
  end if;
  if p_user_id = v_uid then
    raise exception 'No puedes bloquearte a ti mismo';
  end if;

  select * into v_target from profiles where id = p_user_id for update;
  if not found then
    raise exception 'Usuario no encontrado';
  end if;
  if v_target.role = 'admin' then
    raise exception 'No puedes bloquear a un administrador';
  end if;

  update profiles set
    blocked = p_blocked,
    blocked_at = case when p_blocked then now() else null end
  where id = p_user_id
  returning * into v_target;

  return v_target;
end;
$$;

grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated;

-- Helper para que las acciones sensibles (jugar, comprar, retirar) rechacen a
-- un usuario bloqueado sin depender solo del proxy. Sin argumentos usa el
-- usuario autenticado (auth.uid()).
create or replace function public.is_blocked(uid uuid default null)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select blocked from public.profiles where id = coalesce(uid, auth.uid())),
    false
  );
$$;

grant execute on function public.is_blocked(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 2) REGISTRO DE ACTIVIDAD (navegación del jugador)
-- ------------------------------------------------------------------
-- Cada fila = un evento del jugador (por ahora, principalmente "vio una
-- pantalla"). El navegador la inserta (RLS: solo puede insertar filas suyas);
-- solo los admins pueden leerla, para las estadísticas de Interacción.
create table if not exists activity_events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  event_type text not null check (event_type in (
    'screen_view', 'game_start', 'game_finish', 'ticket_request', 'withdrawal_request'
  )),
  screen text,           -- nombre legible de la pantalla (home, jugar, ranking, billetera)
  path text,             -- ruta real visitada (/home, /jugar, ...)
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_user_time_idx on activity_events (user_id, created_at desc);
create index if not exists activity_events_type_time_idx on activity_events (event_type, created_at desc);
create index if not exists activity_events_time_idx on activity_events (created_at desc);

alter table activity_events enable row level security;

drop policy if exists activity_insert_own on activity_events;
create policy activity_insert_own on activity_events
  for insert with check (auth.uid() = user_id);

drop policy if exists activity_select_admin on activity_events;
create policy activity_select_admin on activity_events
  for select using (public.is_admin(auth.uid()));

-- Fin 021.
