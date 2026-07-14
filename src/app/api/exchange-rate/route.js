const DOLARAPI_URL = 'https://ve.dolarapi.com/v1/dolares/oficial';

// bcv.org.ve publica la tasa oficial en su propio HTML, pero su servidor no
// envía la cadena de certificados TLS completa: cualquier fetch() desde
// Node.js (local o en Vercel) falla con UNABLE_TO_VERIFY_LEAF_SIGNATURE,
// aunque funcione en un navegador (confirmado probándolo directo). dolarapi.com
// replica ese mismo valor oficial (verificado: coincide exacto con lo publicado
// en bcv.org.ve) y sí es alcanzable, así que es la fuente que usamos.
async function fetchRate() {
  const res = await fetch(DOLARAPI_URL, {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`dolarapi respondió ${res.status}`);
  const data = await res.json();
  if (!data.promedio) throw new Error('dolarapi sin campo promedio');
  return { rate: data.promedio, source: 'bcv', updatedAt: data.fechaActualizacion };
}

export async function GET() {
  try {
    const result = await fetchRate();
    return Response.json(result);
  } catch {
    try {
      const result = await fetchRate();
      return Response.json(result);
    } catch {
      return Response.json({ rate: null, source: null, updatedAt: null, error: true });
    }
  }
}
