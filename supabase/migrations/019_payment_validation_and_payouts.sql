-- ==========================================
-- MIGRACIÓN 019: validación automática de pagos + datos de cobro del jugador
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 018.
--
-- Agrega:
-- 1. Columnas de auditoría en tickets para la validación automática contra la
--    Bank Automation API (monto en Bs, tasa usada, origen de la verificación,
--    fecha de verificación y respuesta cruda del proveedor).
-- 2. Referencia de pago ÚNICA (un mismo número de referencia no se puede
--    registrar dos veces, salvo que la solicitud previa haya sido rechazada).
-- 3. Datos de Pago Móvil del jugador en profiles (para pagarle los premios).
-- 4. Funciones RPC para: auto-aprobar (solo service-role, tras validar contra
--    el banco), y aprobar/rechazar manualmente desde cualquier estado (admin),
--    y guardar los datos de cobro del propio jugador.

-- ------------------------------------------
-- 1. Columnas de auditoría de pago en tickets
-- ------------------------------------------
alter table public.tickets
  add column if not exists amount_ves numeric(14,2),
  add column if not exists exchange_rate_used numeric(14,4),
  add column if not exists payment_verification_source text not null default 'manual'
    check (payment_verification_source in ('manual', 'auto')),
  add column if not exists payment_verified_at timestamp with time zone,
  add column if not exists payment_provider_response jsonb;

-- ------------------------------------------
-- 2. Referencia de pago única (entre solicitudes no rechazadas)
-- ------------------------------------------
-- Se normaliza a minúsculas/sin espacios para que "ABC 123" y "abc123" no se
-- consideren distintas. Una solicitud rechazada libera la referencia (por si
-- el jugador la escribió mal y debe reintentar con la correcta).
create unique index if not exists tickets_payment_reference_unique
  on public.tickets (lower(replace(payment_reference, ' ', '')))
  where payment_status <> 'rechazado';

-- ------------------------------------------
-- 3. Datos de Pago Móvil del jugador (para pagarle premios)
-- ------------------------------------------
alter table public.profiles
  add column if not exists payout_nombre text,
  add column if not exists payout_banco text,
  add column if not exists payout_cedula text,
  add column if not exists payout_telefono text;

-- ------------------------------------------
-- 4a. Auto-aprobación (SOLO service-role, tras validar contra el banco)
-- ------------------------------------------
-- A propósito NO se hace `grant execute ... to authenticated`: solo se alcanza
-- con la service-role key desde el servidor (la Server Action que ya consultó
-- la Bank Automation API y confirmó el pago). Nunca desde el navegador.
create or replace function public.auto_approve_ticket(
  p_ticket_id uuid,
  p_provider_response jsonb
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket tickets%rowtype;
begin
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;
  -- Idempotente: si ya está aprobada, no se acredita dos veces.
  if v_ticket.payment_status = 'aprobado' then
    return v_ticket;
  end if;

  update tickets set
    payment_status = 'aprobado',
    payment_verification_source = 'auto',
    payment_verified_at = now(),
    payment_provider_response = p_provider_response,
    updated_at = now()
  where id = p_ticket_id;
  update profiles set tickets_balance = tickets_balance + v_ticket.quantity
    where id = v_ticket.user_id;

  select * into v_ticket from tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

-- ------------------------------------------
-- 4b. Marca una solicitud como "validando" (solo service-role)
-- ------------------------------------------
-- Estado transitorio mientras la Server Action consulta el banco. Vuelve a
-- 'pendiente' si no hubo match. Solo cambia solicitudes que hoy están
-- pendientes (no toca aprobadas/rechazadas).
create or replace function public.mark_ticket_validating(p_ticket_id uuid, p_validating boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_validating then
    update tickets set payment_status = 'validando', updated_at = now()
      where id = p_ticket_id and payment_status = 'pendiente';
  else
    update tickets set payment_status = 'pendiente', updated_at = now()
      where id = p_ticket_id and payment_status = 'validando';
  end if;
end;
$$;

-- ------------------------------------------
-- 4c. Aprobación MANUAL del admin (desde cualquier estado no aprobado)
-- ------------------------------------------
-- A diferencia de approve_ticket (migración 001, solo desde 'pendiente'), el
-- admin puede forzar la aprobación aunque la API haya fallado o el estado sea
-- 'validando' o 'rechazado'. Idempotente: no acredita dos veces.
create or replace function public.admin_approve_ticket(p_ticket_id uuid)
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
  if v_ticket.payment_status = 'aprobado' then
    return v_ticket; -- ya estaba aprobada, no acreditar de nuevo
  end if;

  update tickets set
    payment_status = 'aprobado',
    payment_verification_source = 'manual',
    payment_verified_at = now(),
    updated_at = now()
  where id = p_ticket_id;
  update profiles set tickets_balance = tickets_balance + v_ticket.quantity
    where id = v_ticket.user_id;

  select * into v_ticket from tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

-- ------------------------------------------
-- 4d. Rechazo MANUAL del admin (desde cualquier estado)
-- ------------------------------------------
-- Si la solicitud ya estaba aprobada, revierte los tickets acreditados (sin
-- dejar el saldo negativo: si el jugador ya los gastó, baja hasta 0).
create or replace function public.admin_reject_ticket(p_ticket_id uuid, p_reason text)
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

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Solicitud no encontrada';
  end if;

  if v_ticket.payment_status = 'aprobado' then
    update profiles set
      tickets_balance = greatest(0, tickets_balance - v_ticket.quantity)
    where id = v_ticket.user_id;
  end if;

  update tickets set
    payment_status = 'rechazado',
    notes = p_reason,
    updated_at = now()
  where id = p_ticket_id;

  select * into v_ticket from tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

-- ------------------------------------------
-- 4e. El jugador guarda sus propios datos de Pago Móvil
-- ------------------------------------------
create or replace function public.update_payout_info(
  p_nombre text,
  p_banco text,
  p_cedula text,
  p_telefono text
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  update profiles set
    payout_nombre = nullif(trim(p_nombre), ''),
    payout_banco = nullif(trim(p_banco), ''),
    payout_cedula = nullif(trim(p_cedula), ''),
    payout_telefono = nullif(trim(p_telefono), '')
  where id = v_uid
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.admin_approve_ticket(uuid) to authenticated;
grant execute on function public.admin_reject_ticket(uuid, text) to authenticated;
grant execute on function public.update_payout_info(text, text, text, text) to authenticated;
-- auto_approve_ticket y mark_ticket_validating NO reciben grant: solo service-role.

notify pgrst, 'reload schema';
