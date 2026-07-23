-- ==========================================
-- 025 · RETIROS: número de referencia + comprobante del pago
-- ==========================================
-- Ejecutar completo en el SQL Editor de Supabase (con 001..024 aplicadas).
-- Idempotente (if not exists / create or replace / drop if exists).
--
-- Cuando el admin marca un retiro como PAGADO, ahora puede guardar:
--   * el número de referencia del Pago Móvil que hizo, y
--   * una captura/comprobante de ese pago.
-- Sirve además para el buscador de referencias en Transacciones (los pagos
-- HECHOS a los jugadores, junto a los pagos RECIBIDOS por compra de tickets).

-- ------------------------------------------------------------------
-- 1) Columnas de referencia + comprobante en withdrawals
-- ------------------------------------------------------------------
alter table public.withdrawals
  add column if not exists payment_reference text,
  add column if not exists payment_proof_path text;

-- ------------------------------------------------------------------
-- 2) Bucket privado para el comprobante del retiro (lo sube el admin)
-- ------------------------------------------------------------------
-- Convención de ruta: <id_del_jugador>/<archivo> → así el admin ve todos y el
-- jugador podría ver el comprobante de SU retiro (misma idea que los otros
-- buckets privados de la app).
insert into storage.buckets (id, name, public)
values ('withdrawal-proofs', 'withdrawal-proofs', false)
on conflict (id) do nothing;

drop policy if exists "withdrawal_proofs_admin_insert" on storage.objects;
create policy "withdrawal_proofs_admin_insert"
on storage.objects for insert
with check (
  bucket_id = 'withdrawal-proofs'
  and public.is_admin(auth.uid())
);

drop policy if exists "withdrawal_proofs_select_own_or_admin" on storage.objects;
create policy "withdrawal_proofs_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'withdrawal-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

-- ------------------------------------------------------------------
-- 3) Recrear mark_withdrawal_paid para aceptar referencia + comprobante
-- ------------------------------------------------------------------
-- Cambia la lista de argumentos (agrega dos opcionales), por eso se elimina la
-- firma vieja de 1 argumento antes de recrearla.
drop function if exists public.mark_withdrawal_paid(uuid);
create or replace function public.mark_withdrawal_paid(
  p_withdrawal_id uuid,
  p_reference text default null,
  p_proof_path text default null
)
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

  update withdrawals set
    status = 'pagado',
    paid_at = now(),
    payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
    payment_proof_path = p_proof_path
  where id = p_withdrawal_id and status = 'solicitado'
  returning * into v_withdrawal;

  if not found then
    raise exception 'Retiro no encontrado o ya pagado';
  end if;

  return v_withdrawal;
end;
$$;

grant execute on function public.mark_withdrawal_paid(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- Fin 025.
