'use server';

import { createClient } from '@/lib/supabase/server';
import { TICKET_PRICE_USD } from '@/lib/constants';

export async function requestTicketsAction({ tournamentId, quantity, paymentReference }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    return { error: 'Cantidad de tickets inválida' };
  }
  if (!paymentReference?.trim()) {
    return { error: 'Debes indicar la referencia de pago' };
  }

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      user_id: user.id,
      tournament_id: tournamentId || null,
      quantity: qty,
      amount_usd: qty * TICKET_PRICE_USD,
      payment_reference: paymentReference.trim(),
      payment_status: 'pendiente',
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { ticket: data };
}

export async function approveTicketAction(ticketId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('approve_ticket', {
    p_ticket_id: ticketId,
  });

  if (error) return { error: error.message };
  return { ticket: data };
}

export async function rejectTicketAction(ticketId, reason) {
  if (!reason?.trim()) {
    return { error: 'Debe indicar un motivo de rechazo' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reject_ticket', {
    p_ticket_id: ticketId,
    p_reason: reason.trim(),
  });

  if (error) return { error: error.message };
  return { ticket: data };
}
