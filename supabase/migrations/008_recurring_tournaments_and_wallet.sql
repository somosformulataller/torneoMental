-- ==========================================
-- MIGRACIÓN 008: torneo recurrente + billetera de premios
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones 001 a 007.
--
-- Antes, un torneo se creaba y finalizaba siempre a mano. Ahora un torneo se
-- puede marcar como "recurrente": cuando se vence (o un admin lo pasa a
-- Finalizado), se paga automáticamente a los ganadores según sus posiciones
-- en el ranking (el monto se acumula en profiles.wallet_balance_usd, no se
-- pierde al reiniciarse el ranking) y se crea un nuevo ciclo con la misma
-- configuración, empezando recurring_gap_minutes después.
--
-- Esta migración solo crea el esquema y las funciones. El disparador real
-- (cron) vive fuera de la base de datos (Vercel Cron llamando estas
-- funciones con la service-role key).

-- ------------------------------------------
-- 1. Columnas nuevas en tournaments
-- ------------------------------------------
alter table public.tournaments
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_gap_minutes integer;

alter table public.tournaments drop constraint if exists tournaments_recurring_gap_check;
alter table public.tournaments add constraint tournaments_recurring_gap_check
  check (not is_recurring or recurring_gap_minutes is not null and recurring_gap_minutes >= 0);

-- ------------------------------------------
-- 2. Billetera de premios en profiles
-- ------------------------------------------
alter table public.profiles
  add column if not exists wallet_balance_usd numeric(10,2) not null default 0
    check (wallet_balance_usd >= 0);

-- ------------------------------------------
-- 3. Historial de premios pagados
-- ------------------------------------------
create table if not exists public.wallet_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  amount_usd numeric(10,2) not null check (amount_usd >= 0),
  position integer not null check (position > 0),
  created_at timestamp with time zone default now()
);

create index if not exists wallet_transactions_user_idx on public.wallet_transactions (user_id);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_tx_select_own_or_admin" on public.wallet_transactions;
create policy "wallet_tx_select_own_or_admin" on public.wallet_transactions
  for select using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Sin política de INSERT/UPDATE para el cliente: solo se escribe desde
-- finalize_recurring_tournament(), invocada con la service-role key (que
-- ignora RLS por completo), nunca desde el navegador.

-- ------------------------------------------
-- 4. Paga a los ganadores y, si corresponde, encadena el siguiente ciclo
-- ------------------------------------------
-- A propósito NO se hace `grant execute ... to authenticated`: nadie puede
-- llamar esto desde una sesión normal de jugador o admin. Solo es alcanzable
-- vía la service-role key (que ignora los grants de Postgres), usada
-- exclusivamente por la ruta del cron en el servidor.
create or replace function public.finalize_recurring_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tournaments%rowtype;
  v_winner record;
begin
  select * into v_t from tournaments where id = p_tournament_id for update;
  if not found or v_t.status <> 'activo' then
    return; -- ya procesado (o no corresponde procesarlo) — no hace nada
  end if;

  for v_winner in
    select user_id, posicion from tournament_rankings
    where tournament_id = p_tournament_id and posicion <= v_t.winners_count
  loop
    update profiles set wallet_balance_usd = wallet_balance_usd + v_t.prizes[v_winner.posicion]
      where id = v_winner.user_id;
    insert into wallet_transactions (user_id, tournament_id, amount_usd, position)
      values (v_winner.user_id, p_tournament_id, v_t.prizes[v_winner.posicion], v_winner.posicion);
  end loop;

  update tournaments set status = 'finalizado' where id = p_tournament_id;

  if v_t.is_recurring then
    insert into tournaments (
      nombre, start_time, duration_minutes, card_theme, card_count, winners_count,
      prizes, status, is_recurring, recurring_gap_minutes, created_by
    ) values (
      v_t.nombre,
      now() + make_interval(mins => coalesce(v_t.recurring_gap_minutes, 0)),
      v_t.duration_minutes, v_t.card_theme, v_t.card_count, v_t.winners_count,
      v_t.prizes,
      case when coalesce(v_t.recurring_gap_minutes, 0) <= 0 then 'activo' else 'programado' end,
      true, v_t.recurring_gap_minutes, v_t.created_by
    );
  end if;
end;
$$;

-- ------------------------------------------
-- 5. Activa torneos "Programado" cuya fecha de inicio ya llegó
-- ------------------------------------------
-- Mismo nivel de acceso restringido que la función de arriba: solo vía
-- service-role key desde el cron. Aplica a CUALQUIER torneo Programado (no
-- solo a los recurrentes) — antes esa transición era siempre manual.
create or replace function public.activate_scheduled_tournaments()
returns void
language sql
security definer
set search_path = public
as $$
  update tournaments set status = 'activo'
  where status = 'programado' and start_time <= now();
$$;
