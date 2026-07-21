-- ==========================================
-- MIGRACIÓN 020: retiros de la billetera de premios
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 019.
--
-- El jugador retira parte (o todo) de su saldo de premios (profiles.
-- wallet_balance_usd). Al solicitar el retiro se le descuenta el monto de la
-- billetera de inmediato y queda un registro 'solicitado' que el admin paga a
-- mano por Pago Móvil y luego marca como 'pagado'.

-- ------------------------------------------
-- 1. Tabla de retiros
-- ------------------------------------------
create table if not exists public.withdrawals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount_usd numeric(10,2) not null check (amount_usd > 0),
  status text not null default 'solicitado' check (status in ('solicitado', 'pagado')),
  created_at timestamp with time zone default now(),
  paid_at timestamp with time zone
);

create index if not exists withdrawals_user_idx on public.withdrawals (user_id);
create index if not exists withdrawals_status_idx on public.withdrawals (status);

alter table public.withdrawals enable row level security;

-- El jugador ve sus retiros; el admin ve todos. No hay política de
-- INSERT/UPDATE: todo pasa por las funciones RPC de abajo.
drop policy if exists "withdrawals_select_own_or_admin" on public.withdrawals;
create policy "withdrawals_select_own_or_admin" on public.withdrawals
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- ------------------------------------------
-- 2. El jugador solicita un retiro (descuenta el saldo al instante)
-- ------------------------------------------
create or replace function public.request_withdrawal(p_amount numeric)
returns withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance numeric;
  v_amount numeric := round(p_amount::numeric, 2);
  v_withdrawal withdrawals%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'El monto a retirar debe ser mayor a cero';
  end if;

  select wallet_balance_usd into v_balance from profiles where id = v_uid for update;
  if v_balance is null or v_amount > v_balance then
    raise exception 'El monto sobrepasa el saldo de tu billetera';
  end if;

  update profiles set wallet_balance_usd = wallet_balance_usd - v_amount
    where id = v_uid;

  insert into withdrawals (user_id, amount_usd, status)
  values (v_uid, v_amount, 'solicitado')
  returning * into v_withdrawal;

  return v_withdrawal;
end;
$$;

-- ------------------------------------------
-- 3. El admin marca un retiro como pagado
-- ------------------------------------------
create or replace function public.mark_withdrawal_paid(p_withdrawal_id uuid)
returns withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_withdrawal withdrawals%rowtype;
begin
  if not public.is_admin(v_uid) then
    raise exception 'No autorizado';
  end if;

  update withdrawals set status = 'pagado', paid_at = now()
  where id = p_withdrawal_id and status = 'solicitado'
  returning * into v_withdrawal;

  if not found then
    raise exception 'Retiro no encontrado o ya pagado';
  end if;

  return v_withdrawal;
end;
$$;

-- ------------------------------------------
-- 4. El admin cancela un retiro y devuelve el monto a la billetera
-- ------------------------------------------
create or replace function public.cancel_withdrawal(p_withdrawal_id uuid)
returns withdrawals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_withdrawal withdrawals%rowtype;
begin
  if not public.is_admin(v_uid) then
    raise exception 'No autorizado';
  end if;

  select * into v_withdrawal from withdrawals where id = p_withdrawal_id for update;
  if not found or v_withdrawal.status <> 'solicitado' then
    raise exception 'Retiro no encontrado o ya procesado';
  end if;

  update profiles set wallet_balance_usd = wallet_balance_usd + v_withdrawal.amount_usd
    where id = v_withdrawal.user_id;
  delete from withdrawals where id = p_withdrawal_id;

  return v_withdrawal;
end;
$$;

grant execute on function public.request_withdrawal(numeric) to authenticated;
grant execute on function public.mark_withdrawal_paid(uuid) to authenticated;
grant execute on function public.cancel_withdrawal(uuid) to authenticated;

-- Realtime para que la Billetera refresque la lista de retiros al instante.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'withdrawals'
  ) then
    alter publication supabase_realtime add table public.withdrawals;
  end if;
end $$;

notify pgrst, 'reload schema';
