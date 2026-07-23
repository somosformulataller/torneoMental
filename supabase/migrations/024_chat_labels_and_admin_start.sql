-- ==========================================
-- 024 · CHAT: etiquetas/estado + iniciar conversación desde el admin
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (con 001..023 aplicadas).
-- Idempotente (if not exists / create or replace / drop if exists).
--
-- Agrega:
--   1) Etiqueta/estado de cada conversación: 'pendiente' | 'prioridad' | 'resuelto'.
--      Las conversaciones nuevas (incluidas las que el admin aún no abrió) son
--      'pendiente' por defecto.
--   2) Que el admin le ponga la etiqueta a una conversación.
--   3) Que el admin inicie (o recupere) la conversación con cualquier usuario,
--      para escribirle primero (la notificación le llega al jugador al recibir
--      el primer mensaje de soporte, igual que siempre).
--
-- Los audios NO necesitan cambios de base de datos: viajan como un adjunto más
-- (mismo bucket privado 'chat-attachments', mismas columnas attachment_*).

-- ------------------------------------------------------------------
-- 1) Etiqueta/estado de la conversación
-- ------------------------------------------------------------------
alter table chat_conversations
  add column if not exists status text not null default 'pendiente'
    check (status in ('pendiente', 'prioridad', 'resuelto'));

create index if not exists chat_conversations_status_idx on chat_conversations (status);

-- ------------------------------------------------------------------
-- 2) El admin cambia la etiqueta/estado de una conversación
-- ------------------------------------------------------------------
create or replace function public.chat_admin_set_status(p_conversation_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'No autorizado'; end if;
  if p_status not in ('pendiente', 'prioridad', 'resuelto') then
    raise exception 'Estado inválido';
  end if;
  update chat_conversations set status = p_status where id = p_conversation_id;
end;
$$;

-- ------------------------------------------------------------------
-- 3) El admin inicia (o recupera) la conversación con cualquier usuario
-- ------------------------------------------------------------------
-- Devuelve el id de la conversación (la crea si no existía). No escribe ningún
-- mensaje: el admin luego responde con chat_admin_reply, y ESE mensaje es el
-- que enciende la campana del jugador.
create or replace function public.chat_admin_start_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'No autorizado'; end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'Usuario no encontrado';
  end if;

  select id into v_conv from chat_conversations where user_id = p_user_id;
  if v_conv is null then
    insert into chat_conversations (user_id) values (p_user_id) returning id into v_conv;
  end if;
  return v_conv;
end;
$$;

-- ------------------------------------------------------------------
-- 4) Recrear la lista del admin para incluir el estado/etiqueta
-- ------------------------------------------------------------------
-- Cambia el tipo de retorno (agrega columna 'status'), por eso se hace drop
-- antes del create.
drop function if exists public.chat_admin_conversations();
create function public.chat_admin_conversations()
returns table (
  conversation_id uuid,
  user_id uuid,
  nombre text,
  apellido text,
  email text,
  last_message_at timestamptz,
  last_body text,
  last_sender text,
  unread integer,
  status text
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
         and m.created_at > coalesce(c.admin_last_read_at, 'epoch'::timestamptz)),
    c.status
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

grant execute on function public.chat_admin_set_status(uuid, text) to authenticated;
grant execute on function public.chat_admin_start_conversation(uuid) to authenticated;
grant execute on function public.chat_admin_conversations() to authenticated;

notify pgrst, 'reload schema';

-- Fin 024.
