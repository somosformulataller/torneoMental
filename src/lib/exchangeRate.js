const DOLARAPI_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

// bcv.org.ve publica la tasa oficial en su propio HTML, pero su servidor no
// envía la cadena de certificados TLS completa: cualquier fetch() desde
// Node.js (local o en Vercel) falla con UNABLE_TO_VERIFY_LEAF_SIGNATURE,
// aunque funcione en un navegador. dolarapi.com replica ese mismo valor
// oficial (verificado: coincide exacto con lo publicado en bcv.org.ve) y sí es
// alcanzable, así que es la fuente que usamos.
//
// Se comparte entre la ruta /api/exchange-rate (la muestra en el modal de
// compra) y la Server Action de compra de tickets (calcula cuántos Bs se le
// pidieron al usuario, para poder comparar contra el monto real del banco).
export async function fetchExchangeRate() {
  const res = await fetch(DOLARAPI_URL, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const data = await res.json();
  if (!data.promedio) throw new Error('dolarapi sin campo promedio');
  return { rate: data.promedio, source: 'bcv', updatedAt: data.fechaActualizacion };
}

// Igual que fetchExchangeRate pero nunca lanza: devuelve la tasa o null. Útil
// en la compra de tickets, donde un fallo de la tasa no debe romper la compra
// (se registra el ticket sin monto en Bs y se valida solo por referencia).
export async function fetchExchangeRateSafe() {
  try {
    return await fetchExchangeRate();
  } catch {
    try {
      return await fetchExchangeRate();
    } catch {
      return null;
    }
  }
}
