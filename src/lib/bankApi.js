// Cliente de la "Bank Automation API" (servicio externo que lee los
// movimientos de la cuenta BDV receptora y responde si un pago existe).
// Documentado en docs/api-validacion-pagos.md. Solo se usa en el servidor:
// el token de acceso vive en variables de entorno y jamás toca el navegador.

const BASE = process.env.BANK_API_URL;
const TOKEN = process.env.BANK_API_TOKEN;
const ACCOUNT = process.env.BANK_API_ACCOUNT_NAME;

export function isBankApiConfigured() {
  return Boolean(BASE && TOKEN && ACCOUNT);
}

// Fecha del pago en formato YYYY-MM-DD, en horario de Venezuela (no UTC): un
// pago a las 8pm de Caracas ya es "mañana" en UTC, y el match por fecha del
// banco fallaría si usáramos la fecha UTC.
export function caracasDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function callValidate({ reference, dateStr, setUsed, monto }) {
  const params = new URLSearchParams({
    account_name: ACCOUNT,
    reference: String(reference),
    date: dateStr,
    set_used: setUsed ? 'true' : 'false',
    get_used: 'false',
  });
  if (monto != null) params.set('monto', String(monto));

  const res = await fetch(`${BASE}/transaction/validate?${params.toString()}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });

  if (res.status === 429) return { ok: false, retryable: true };
  if (!res.ok) return { ok: false, retryable: res.status >= 500 };

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, retryable: false };
  }
  if (body?.success && body?.data) return { ok: true, data: body.data };
  return { ok: false, retryable: false }; // 200 sin match → no encontrado
}

// Valida un pago contra el banco.
//   status: 'approved'    → el pago existe, el monto cuadra y quedó reclamado.
//           'not_found'   → el banco no reporta ese pago (todavía).
//           'amount_mismatch' → existe pero el monto pagado es menor al esperado.
//           'amount_unknown'  → no teníamos monto esperado (sin tasa) → revisar a mano.
//           'retryable'   → cooldown/red/servidor caído → reintentar luego.
//           'error'       → la API no está configurada.
// Nunca lanza: cualquier fallo deja la solicitud en revisión manual.
export async function validatePayment({ reference, dateStr, expectedVes }) {
  if (!isBankApiConfigured()) return { status: 'error' };
  const date = dateStr || caracasDateStr();

  try {
    // Paso 1: buscar el pago SIN reclamarlo, para leer su monto real.
    const found = await callValidate({ reference, dateStr: date, setUsed: false });
    if (!found.ok) {
      return { status: found.retryable ? 'retryable' : 'not_found' };
    }

    const paidVes = Number(found.data.monto);

    // Sin monto esperado (falló la tasa BCV al comprar) no podemos verificar
    // que se pagó lo correcto → no auto-aprobamos, lo revisa el admin.
    if (expectedVes == null || !Number.isFinite(expectedVes)) {
      return { status: 'amount_unknown', data: found.data };
    }

    // Tolerancia: por redondeo de centavos o micro-variación de la tasa. El
    // sobrepago siempre pasa; solo el pago corto (fraude/error) se frena.
    const tolerance = Math.max(0.5, expectedVes * 0.005);
    if (Number.isFinite(paidVes) && paidVes + tolerance < expectedVes) {
      return { status: 'amount_mismatch', data: found.data };
    }

    // Paso 2: reclamar el pago (marcarlo como usado) para que nadie más lo use.
    const claimed = await callValidate({
      reference,
      dateStr: date,
      setUsed: true,
      monto: paidVes,
    });
    if (!claimed.ok) {
      // No se pudo reclamar atómicamente → no aprobar sin marcar usado.
      return { status: 'retryable' };
    }

    return { status: 'approved', data: claimed.data };
  } catch {
    return { status: 'retryable' };
  }
}
