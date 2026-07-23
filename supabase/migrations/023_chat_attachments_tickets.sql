-- ==========================================
-- 023 · ADJUNTOS EN EL CHAT + AJUSTE DE TICKETS + CANJE DE SALDO
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (con 001..022 aplicadas).
-- Idempotente (if not exists / create or replace / drop if exists).
--
-- Agrega:
--   1) Adjuntar archivos (documentos/imágenes) en el chat (jugador y admin).
--   2) Que el admin sume o reste tickets a un usuario.
--   3) Que el jugador canjee su saldo de premios por tickets (1 ticket = $1).

-- ------------------------------------------------------------------
-- 1) ADJUNTOS EN EL CHAT
-- ------------------------------------------------------------------
alter table chat_messages add column if not exists attachment_path text;
alter table chat_messages add column if not exists attachment_name text;
alter table chat_messages add column if not exists attachment_type text;

-- Bucket privado para los adjuntos del chat. Convención de ruta:
--   <id_del_jugador>/<archivo>  → así el jugador ve los adjuntos de SU
-- conversación (los suyos y los que le manda soporte, guardados en su carpeta)
-- y el admin ve todos. El admin sube a la carpeta del jugador de esa
-- conversación.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists "chat_attach_insert" on storage.objects;
create policy "chat_attach_insert"
on storage.objects for insert
with check (
  bucket_id = 'chat-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "chat_attach_select" on storage.objects;
create policy "chat_attach_select"
on storage.objects for select
using (
  bucket_id = 'chat-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

-- Recrear las funciones de envío para aceptar un adjunto opcional. Se elimina
-- primero la firma vieja (1 arg) para no dejar una sobrecarga ambigua.
drop function if exists public.chat_send_message(text);
create or replace function public.chat_send_message(
  p_body text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null
)
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
  if v_body = '' and p_attachment_path is null then raise exception 'Mensaje vacío'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;

  select id into v_conv from chat_conversations where user_id = v_uid;
  if v_conv is null then
    insert into chat_conversations (user_id) values (v_uid) returning id into v_conv;
  end if;

  insert into chat_messages (conversation_id, sender, body, attachment_path, attachment_name, attachment_type)
  values (v_conv, 'player', v_body, p_attachment_path, p_attachment_name, p_attachment_type)
  returning id into v_id;

  update chat_conversations set last_message_at = now() where id = v_conv;
  return v_id;
end;
$$;

drop function if exists public.chat_admin_reply(uuid, text);
create or replace function public.chat_admin_reply(
  p_conversation_id uuid,
  p_body text,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_type text default null
)
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
  if v_body = '' and p_attachment_path is null then raise exception 'Mensaje vacío'; end if;
  if length(v_body) > 2000 then v_body := left(v_body, 2000); end if;

  insert into chat_messages (conversation_id, sender, body, attachment_path, attachment_name, attachment_type)
  values (p_conversation_id, 'support', v_body, p_attachment_path, p_attachment_name, p_attachment_type)
  returning id into v_id;

  update chat_conversations
    set last_message_at = now(), admin_last_read_at = now()
    where id = p_conversation_id;
  return v_id;
end;
$$;

grant execute on function public.chat_send_message(text, text, text, text) to authenticated;
grant execute on function public.chat_admin_reply(uuid, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------
-- 2) AJUSTE DE TICKETS POR EL ADMIN (sumar / restar)
-- ------------------------------------------------------------------
create or replace function public.admin_adjust_tickets(p_user_id uuid, p_delta integer)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target profiles%rowtype;
  v_new integer;
begin
  if not public.is_admin(auth.uid()) then raise exception 'No autorizado'; end if;
  if p_delta = 0 then raise exception 'La cantidad no puede ser cero'; end if;

  select * into v_target from profiles where id = p_user_id for update;
  if not found then raise exception 'Usuario no encontrado'; end if;

  v_new := v_target.tickets_balance + p_delta;
  if v_new < 0 then
    raise exception 'El usuario tiene % tickets; no se pueden restar %', v_target.tickets_balance, abs(p_delta);
  end if;

  update profiles set tickets_balance = v_new where id = p_user_id returning * into v_target;
  return v_target;
end;
$$;

grant execute on function public.admin_adjust_tickets(uuid, integer) to authenticated;

-- ------------------------------------------------------------------
-- 3) CANJE DE SALDO POR TICKETS (jugador) · 1 ticket = $1.00
-- ------------------------------------------------------------------
-- El jugador convierte parte de su saldo de premios (wallet_balance_usd) en
-- tickets. La tasa ($1 por ticket) debe coincidir con TICKET_PRICE_USD del
-- front (src/lib/constants.js).
create or replace function public.redeem_balance_for_tickets(p_tickets integer)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target profiles%rowtype;
  v_cost numeric(10,2);
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_tickets is null or p_tickets <= 0 then raise exception 'Cantidad inválida'; end if;

  select * into v_target from profiles where id = v_uid for update;
  if not found then raise exception 'Usuario no encontrado'; end if;

  v_cost := (p_tickets * 1.00)::numeric(10,2);
  if v_target.wallet_balance_usd < v_cost then
    raise exception 'Saldo insuficiente: tienes $% y necesitas $%', v_target.wallet_balance_usd, v_cost;
  end if;

  update profiles set
    wallet_balance_usd = wallet_balance_usd - v_cost,
    tickets_balance = tickets_balance + p_tickets
  where id = v_uid
  returning * into v_target;

  return v_target;
end;
$$;

grant execute on function public.redeem_balance_for_tickets(integer) to authenticated;

-- Fin 023.
