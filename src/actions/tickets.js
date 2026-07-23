'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TICKET_PRICE_USD } from '@/lib/constants';
import { fetchExchangeRateSafe } from '@/lib/exchangeRate';
import { validatePayment, caracasDateStr } from '@/lib/bankApi';

export async function requestTicketsAction({ tournamentId, quantity, paymentReference, paymentProofPath }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  // Un usuario bloqueado no puede comprar tickets.
  const { data: blocked } = await supabase.rpc('is_blocked');
  if (blocked) return { error: 'Tu cuenta está bloqueada.' };

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    return { error: 'Cantidad de tickets inválida' };
  }
  if (!paymentReference?.trim()) {
    return { error: 'Debes indicar la referencia de pago' };
  }
  // El archivo se sube directo a Storage desde el navegador (política RLS
  // exige que el path empiece con el uid del usuario autenticado); acá solo
  // validamos que, si vino uno, sea realmente del usuario que hace la
  // solicitud antes de guardarlo.
  if (paymentProofPath && !paymentProofPath.startsWith(`${user.id}/`)) {
    return { error: 'Comprobante de pago inválido' };
  }

  const amountUsd = qty * TICKET_PRICE_USD;

  // La tasa se resuelve en el servidor (no se confía en el número que muestra
  // el navegador) para calcular cuántos Bs se le pidieron al usuario; ese
  // monto es el que después se compara contra el pago real del banco. Si la
  // tasa falla, el ticket se registra sin monto en Bs y se valida solo por
  // referencia (queda en revisión manual, nunca se auto-aprueba a ciegas).
  const rateInfo = await fetchExchangeRateSafe();
  const amountVes = rateInfo?.rate ? Math.round(amountUsd * rateInfo.rate * 100) / 100 : null;

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({
      user_id: user.id,
      tournament_id: tournamentId || null,
      quantity: qty,
      amount_usd: amountUsd,
      amount_ves: amountVes,
      exchange_rate_used: rateInfo?.rate ?? null,
      payment_reference: paymentReference.trim(),
      payment_proof_path: paymentProofPath || null,
      payment_status: 'pendiente',
    })
    .select()
    .single();

  if (error) {
    // 23505 = violación de índice único → referencia ya registrada.
    if (error.code === '23505') {
      return { error: 'Esa referencia de pago ya fue registrada. Verifica el número.' };
    }
    return { error: error.message };
  }

  // Validación automática contra el banco. Corre con la service-role key
  // porque la sesión del jugador no puede aprobar tickets ni cambiar saldos.
  const status = await tryAutoValidate(ticket, amountVes);

  return { ticket, status };
}

// Re-consulta al banco las solicitudes del jugador que siguen sin resolverse
// ('pendiente' o 'validando') y las auto-aprueba si el pago ya aparece. Cubre
// el caso típico: al comprar, el banco todavía no había reportado el pago (o su
// servicio estaba en enfriamiento), así que la validación única de la compra no
// lo encontró y el ticket quedó pendiente. Con esto, el propio jugador (o la
// Billetera cada cierto tiempo) reintenta sin depender de que el admin apruebe
// a mano. Es seguro: solo aprueba si validatePayment confirma el pago real
// contra el banco; no hay forma de forzar tickets gratis.
export async function recheckMyTicketsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  // Solo las solicitudes propias (RLS) que aún no se resolvieron.
  const { data: pending, error } = await supabase
    .from('tickets')
    .select('id, payment_reference, amount_ves, payment_status')
    .eq('user_id', user.id)
    .in('payment_status', ['pendiente', 'validando']);

  if (error) return { error: error.message };
  if (!pending || pending.length === 0) return { approved: 0, pending: 0 };

  let approved = 0;
  for (const t of pending) {
    const status = await tryAutoValidate(t, t.amount_ves);
    if (status === 'aprobado') approved += 1;
  }
  return { approved, pending: pending.length - approved };
}

// Devuelve 'aprobado' si el banco confirmó el pago, 'pendiente' en cualquier
// otro caso (no encontrado, monto no coincide, API caída, etc.). Nunca lanza:
// un fallo de la validación jamás debe romper la compra.
async function tryAutoValidate(ticket, amountVes) {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return 'pendiente'; // sin service-role no auto-validamos
  }

  try {
    await admin.rpc('mark_ticket_validating', { p_ticket_id: ticket.id, p_validating: true });

    const result = await validatePayment({
      reference: ticket.payment_reference,
      dateStr: caracasDateStr(),
      expectedVes: amountVes,
    });

    if (result.status === 'approved') {
      const { error } = await admin.rpc('auto_approve_ticket', {
        p_ticket_id: ticket.id,
        p_provider_response: result.data ?? null,
      });
      if (!error) return 'aprobado';
    }

    // Sin match (o error): devolver la solicitud a 'pendiente' para el admin.
    await admin.rpc('mark_ticket_validating', { p_ticket_id: ticket.id, p_validating: false });
    return 'pendiente';
  } catch (err) {
    console.error('Error validando pago:', err);
    try {
      await admin.rpc('mark_ticket_validating', { p_ticket_id: ticket.id, p_validating: false });
    } catch {}
    return 'pendiente';
  }
}

// --- Aprobación/rechazo desde 'pendiente' (flujo clásico) ---

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

// --- Override manual del admin: aprobar/rechazar desde CUALQUIER estado ---
// (para la pantalla de Transacciones: el admin decide sin importar lo que
// haya respondido la API).

export async function adminApproveTicketAction(ticketId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_approve_ticket', {
    p_ticket_id: ticketId,
  });

  if (error) return { error: error.message };
  return { ticket: data };
}

export async function adminRejectTicketAction(ticketId, reason) {
  if (!reason?.trim()) {
    return { error: 'Debe indicar un motivo de rechazo' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_reject_ticket', {
    p_ticket_id: ticketId,
    p_reason: reason.trim(),
  });

  if (error) return { error: error.message };
  return { ticket: data };
}
