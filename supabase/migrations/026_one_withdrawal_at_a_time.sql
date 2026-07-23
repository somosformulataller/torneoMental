-- ==========================================
-- 026 · UN RETIRO A LA VEZ
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (con 001..025 aplicadas).
-- Idempotente (create or replace).
--
-- Regla nueva: el jugador no puede solicitar un retiro nuevo mientras tenga uno
-- "en proceso" (status 'solicitado'). La sección de retirar se le vuelve a
-- habilitar recién cuando soporte le paga ese retiro (o lo cancela, que borra
-- el registro y le devuelve el saldo).

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

  -- Un solo retiro en proceso a la vez.
  if exists (
    select 1 from withdrawals where user_id = v_uid and status = 'solicitado'
  ) then
    raise exception 'Ya tienes un retiro en proceso. Podrás solicitar otro cuando se apruebe.';
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

notify pgrst, 'reload schema';

-- Fin 026.
