-- ==========================================
-- 022 · CHAT DE ATENCIÓN AL CLIENTE
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (proyecto con migraciones
-- 001..021 aplicadas). Es idempotente (if not exists / create or replace).
--
-- Agrega un chat 1 a 1 entre cada jugador y atención al cliente (que responde
-- desde el panel de admin → sección "Chat"):
--   * chat_conversations : una conversación por jugador.
--   * chat_messages      : cada mensaje (del jugador o de soporte).
--   * chat_quick_questions: preguntas rápidas editables por el admin.
-- Más funciones (RPC) para enviar/responder/marcar leído y contar no leídos,
-- y realtime para que los mensajes lleguen al instante.

-- ------------------------------------------------------------------
-- 1) TABLAS
-- ------------------------------------------------------------------
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  player_last_read_at timestamptz not null default now(), -- hasta cuándo leyó el jugador
  admin_last_read_at timestamptz                          -- hasta cuándo leyó soporte (null = nunca)
);

create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid references chat_conversations(id) on delete cascade not null,
  sender text not null check (sender in ('player', 'support')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_conv_time_idx on chat_messages (conversation_id, created_at);
create index if not exists chat_conversations_last_msg_idx on chat_conversations (last_message_at desc);

create table if not exists chat_quick_questions (
  id bigint generated always as identity primary key,
  text text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Preguntas rápidas por defecto (solo si la tabla está vacía).
insert into chat_quick_questions (text, sort_order)
select * from (values
  ('¿Cómo compro tickets?', 1),
  ('¿Cómo retiro mis premios?', 2),
  ('¿Cuándo empieza el próximo torneo?', 3),
  ('No me llegaron mis tickets', 4),
  ('Tengo un problema con un pago', 5)
) as v(text, sort_order)
where not exists (select 1 from chat_quick_questions);

-- ------------------------------------------------------------------
-- 2) RLS (seguridad por fila)
-- ------------------------------------------------------------------
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;
alter table chat_quick_questions enable row level security;

-- Conversaciones: el jugador ve la suya; el admin ve todas. Las escrituras van
-- por funciones SECURITY DEFINER (abajo), así que no hace falta política de
-- insert/update para usuarios.
drop policy if exists chat_conv_select on chat_conversations;
create policy chat_conv_select on chat_conversations
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Mensajes: el jugador ve los de su conversación; el admin ve todos. (El
-- select también habilita que Realtime les entregue los mensajes nuevos.)
-- No hay política de insert: los mensajes se crean solo vía RPC, garantizando
-- que el remitente ('player'/'support') no se pueda falsear.
drop policy if exists chat_msg_select on chat_messages;
create policy chat_msg_select on chat_messages
  for select using (
    public.is_admin(auth.uid())
    or exists (
      select 1 from chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

-- Preguntas rápidas: cualquiera autenticado ve las activas; el admin ve todas
-- y puede crearlas/editarlas/borrarlas directamente.
drop policy if exists chat_qq_select on chat_quick_questions;
create policy chat_qq_select on chat_quick_questions
  for select using (active = true or public.is_admin(auth.uid()));

drop policy if exists chat_qq_admin_all on chat_quick_questions;
create policy chat_qq_admin_all on chat_quick_questions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ------------------------------------------------------------------
-- 3) FUNCIONES (RPC)
-- ------------------------------------------------------------------

-- Jugador envía un mensaje. Crea su conversación si no existe.
create or replace function public.chat_send_message(p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv uuid;
  v_id bigint;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if v_body = '' then raise exception 'Mensaje vacío'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;

  select id into v_conv from chat_conversations where user_id = v_uid;
  if v_conv is null then
    insert into chat_conversations (user_id) values (v_uid) returning id into v_conv;
  end if;

  insert into chat_messages (conversation_id, sender, body)
  values (v_conv, 'player', v_body) returning id into v_id;

  update chat_conversations set last_message_at = now() where id = v_conv;
  return v_id;
end;
$$;

-- Soporte (admin) responde en una conversación.
create or replace function public.chat_admin_reply(p_conversation_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not public.is_admin(auth.uid()) then raise exception 'No autorizado'; end if;
  if v_body = '' then raise exception 'Mensaje vacío'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;

  insert into chat_messages (conversation_id, sender, body)
  values (p_conversation_id, 'support', v_body) returning id into v_id;

  update chat_conversations
    set last_message_at = now(), admin_last_read_at = now()
    where id = p_conversation_id;
  return v_id;
end;
$$;

-- El jugador marca su conversación como leída (limpia su campana).
create or replace function public.chat_player_mark_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update chat_conversations set player_last_read_at = now() where user_id = auth.uid();
end;
$$;

-- El admin marca una conversación como leída.
create or replace function public.chat_admin_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'No autorizado'; end if;
  update chat_conversations set admin_last_read_at = now() where id = p_conversation_id;
end;
$$;

-- Nº de mensajes de soporte sin leer por el jugador (para la campana roja).
create or replace function public.chat_player_unread()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select count(*)::int
    from chat_messages m
    join chat_conversations c on c.id = m.conversation_id
    where c.user_id = auth.uid()
      and m.sender = 'support'
      and m.created_at > coalesce(c.player_last_read_at, 'epoch'::timestamptz)
  ), 0);
$$;

-- Lista de conversaciones para el admin: datos del jugador, último mensaje y
-- nº de mensajes del jugador sin leer por soporte. Ordenadas por actividad.
create or replace function public.chat_admin_conversations()
returns table (
  conversation_id uuid,
  user_id uuid,
  nombre text,
  apellido text,
  email text,
  last_message_at timestamptz,
  last_body text,
  last_sender text,
  unread integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.user_id,
    p.nombre,
    p.apellido,
    p.email,
    c.last_message_at,
    lm.body,
    lm.sender,
    (select count(*)::int from chat_messages m
       where m.conversation_id = c.id
         and m.sender = 'player'
         and m.created_at > coalesce(c.admin_last_read_at, 'epoch'::timestamptz))
  from chat_conversations c
  join profiles p on p.id = c.user_id
  left join lateral (
    select body, sender from chat_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where public.is_admin(auth.uid())
  order by c.last_message_at desc;
$$;

grant execute on function public.chat_send_message(text) to authenticated;
grant execute on function public.chat_admin_reply(uuid, text) to authenticated;
grant execute on function public.chat_player_mark_read() to authenticated;
grant execute on function public.chat_admin_mark_read(uuid) to authenticated;
grant execute on function public.chat_player_unread() to authenticated;
grant execute on function public.chat_admin_conversations() to authenticated;

-- ------------------------------------------------------------------
-- 4) REALTIME (para que los mensajes lleguen al instante)
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_conversations'
  ) then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;

-- Fin 022.
