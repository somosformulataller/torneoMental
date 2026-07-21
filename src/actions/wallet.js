'use server';

import { createClient } from '@/lib/supabase/server';

// El jugador solicita retirar parte de su saldo de premios. El RPC descuenta
// el monto de la billetera y crea el registro 'solicitado' de forma atómica.
export async function requestWithdrawalAction(amount) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  // Un usuario bloqueado no puede solicitar retiros.
  const { data: blocked } = await supabase.rpc('is_blocked');
  if (blocked) return { error: 'Tu cuenta está bloqueada.' };

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { error: 'El monto a retirar debe ser mayor a cero' };
  }

  const { data, error } = await supabase.rpc('request_withdrawal', { p_amount: amt });
  if (error) return { error: error.message };
  return { withdrawal: data };
}

// El admin marca un retiro como pagado (ya lo pagó por Pago Móvil a mano).
export async function markWithdrawalPaidAction(withdrawalId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_withdrawal_paid', {
    p_withdrawal_id: withdrawalId,
  });
  if (error) return { error: error.message };
  return { withdrawal: data };
}

// El admin cancela un retiro y devuelve el monto a la billetera del jugador.
export async function cancelWithdrawalAction(withdrawalId) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_withdrawal', {
    p_withdrawal_id: withdrawalId,
  });
  if (error) return { error: error.message };
  return { withdrawal: data };
}
