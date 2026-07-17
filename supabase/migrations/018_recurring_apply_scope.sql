-- ==========================================
-- MIGRACIÓN 018: aplicabilidad de los cambios del torneo recurrente
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase sobre un proyecto que YA corrió las
-- migraciones anteriores (en especial la 008).
--
-- Antes, la configuración del siguiente ciclo era SIEMPRE la fila del ciclo
-- en curso: finalize_recurring_tournament la clonaba tal cual. Por eso todo
-- cambio desde el admin aplicaba obligatoriamente al ciclo actual Y a los
-- siguientes, sin poder separarlos. Ahora la pantalla de Torneo Recurrente
-- ofrece tres opciones ("al torneo actual y los siguientes", "solo al
-- actual", "solo a partir del siguiente"):
--
--   * next_cycle_settings (jsonb, nueva columna) guarda la configuración
--     destinada al PRÓXIMO ciclo cuando difiere de la del actual.
--     - "solo a partir del siguiente": los valores nuevos se guardan acá y
--       la fila del ciclo en curso no se toca.
--     - "solo al actual": la fila se actualiza y acá se preserva la
--       configuración que ya estaba destinada a los siguientes.
--     - "ambos": la fila se actualiza y esta columna se limpia (null).
--   * finalize_recurring_tournament ahora crea el siguiente ciclo tomando
--     cada campo de next_cycle_settings si está presente, o de la fila del
--     ciclo que termina si no. El ciclo nuevo nace con la columna en null:
--     esos valores pasan a ser su configuración base.

alter table public.tournaments
  add column if not exists next_cycle_settings jsonb;

-- Igual que en la 008: sin grant a authenticated — solo alcanzable con la
-- service-role key desde la ruta del cron.
create or replace function public.finalize_recurring_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tournaments%rowtype;
  v_winner record;
  v_next jsonb;
  v_nombre text;
  v_duration integer;
  v_card_count integer;
  v_winners integer;
  v_prizes numeric[];
  v_gap integer;
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
    v_next := coalesce(v_t.next_cycle_settings, '{}'::jsonb);
    v_nombre := coalesce(v_next->>'nombre', v_t.nombre);
    v_duration := coalesce((v_next->>'duration_minutes')::integer, v_t.duration_minutes);
    v_card_count := coalesce((v_next->>'card_count')::integer, v_t.card_count);
    v_winners := coalesce((v_next->>'winners_count')::integer, v_t.winners_count);
    v_gap := coalesce((v_next->>'recurring_gap_minutes')::integer, v_t.recurring_gap_minutes);
    if v_next ? 'prizes' then
      select array_agg(value::numeric) into v_prizes
        from jsonb_array_elements_text(v_next->'prizes');
    else
      v_prizes := v_t.prizes;
    end if;

    insert into tournaments (
      nombre, start_time, duration_minutes, card_theme, card_count, winners_count,
      prizes, status, is_recurring, recurring_gap_minutes, created_by
    ) values (
      v_nombre,
      now() + make_interval(mins => coalesce(v_gap, 0)),
      v_duration, v_t.card_theme, v_card_count, v_winners,
      v_prizes,
      case when coalesce(v_gap, 0) <= 0 then 'activo' else 'programado' end,
      true, v_gap, v_t.created_by
    );
  end if;
end;
$$;
