-- ==========================================
-- MIGRACIÓN 004: adjuntar captura de pago
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 003.
--
-- Permite que el jugador adjunte una captura/comprobante del pago al
-- solicitar tickets. El archivo se sube directo desde el navegador al
-- bucket privado 'payment-proofs' (no pasa por servidor), respetando las
-- mismas políticas de RLS que ya protegen el resto de la app: cada usuario
-- solo puede subir/ver sus propios archivos, los admins ven todos.

alter table public.tickets
  add column if not exists payment_proof_path text;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- storage.objects ya trae RLS habilitado por defecto en Supabase y esa
-- tabla la administra el rol supabase_storage_admin (no el rol del SQL
-- Editor), por eso no se puede ni hace falta un ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY acá.

drop policy if exists "payment_proofs_insert_own" on storage.objects;
create policy "payment_proofs_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "payment_proofs_select_own_or_admin" on storage.objects;
create policy "payment_proofs_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'payment-proofs'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);
