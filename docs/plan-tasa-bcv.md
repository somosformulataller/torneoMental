# Plan: Mostrar equivalente en Bolívares (tasa oficial) al comprar tickets

## 1. Objetivo

En el modal de compra de tickets (`src/app/(player)/home/page.js`), además del precio en USD, mostrar el equivalente en Bolívares (VES) usando la tasa de cambio oficial, para que el usuario sepa cuánto transferir en Bs.

## 2. Aclaración importante: "Banco de Venezuela" vs "BCV"

El **Banco de Venezuela (BDV)** es un banco comercial (estatal) — no publica una tasa de cambio oficial ni tiene una API de tipo de cambio. La tasa de cambio oficial de USD/VES la publica el **Banco Central de Venezuela (BCV)**, en `bcv.org.ve`, una vez por día hábil. Es casi seguro que a lo que te refieres es a "la tasa del BCV" (así se le dice coloquialmente "tasa del banco"), que es además la única tasa reconocida legalmente en Venezuela para facturación.

**Este plan asume que la tasa a mostrar es la tasa oficial del BCV.** Si en realidad quieres una tasa distinta (paralelo/mercado libre), el mismo mecanismo aplica, solo cambia la fuente (ver sección 4).

## 3. El problema de origen: el BCV no tiene API pública

`bcv.org.ve` solo publica la tasa en su página web (HTML, sin API oficial ni documentada). Conectarnos directo implicaría hacer *web scraping* de su sitio, algo frágil (se rompe si cambian el HTML) y que además ha bloqueado scrapers en el pasado por certificado SSL/headers.

La solución estándar en el ecosistema de desarrolladores venezolanos es usar una **API comunitaria que ya hace ese scraping/agregación por nosotros** y expone la tasa BCV vía JSON. Investigué y probé en vivo las siguientes:

| Fuente | Endpoint | Auth | Notas |
|---|---|---|---|
| **dolarapi.com** (recomendada) | `GET https://ve.dolarapi.com/v1/dolares/oficial` | No requiere key | Probada en vivo, responde `{"moneda":"USD","fuente":"oficial","promedio":723.999,"fechaActualizacion":"2026-07-14T00:00:00-04:00"}`. Coincide exacto con la tasa BCV publicada ese día. Open source, gratis, sin límite documentado. |
| pydolarve.org | `GET https://pydolarve.org/api/v1/dollar?page=bcv` | No requiere key | Proyecto open source (Python), también agrega BCV y otros monitores. Buena opción de *fallback* si dolarapi falla. |
| bcvapi.tech | REST JSON | No requiere key (según su web) | Alternativa adicional, menos conocida/documentada públicamente. |
| cotizave.com | `GET https://api.cotizave.com/v1/fx/rates/reference` | Requiere `X-API-Key` (gratis con registro) | Más "formal" (requiere cuenta), útil solo si las anteriores fallan seguido. |

**Recomendación:** usar `dolarapi.com` como fuente principal. Al implementar, probé `pydolarve.org` como *fallback* pero su dominio no resuelve por DNS (falla consistente desde dos redes distintas) y `bcvapi.tech`/`cotizave.com` no tienen documentación pública clara de sus endpoints — meter una segunda fuente no verificada agrega riesgo en vez de robustez. Por eso el Route Handler usa **solo `dolarapi.com`, con un reintento y timeout de 5s**; si ambos intentos fallan, responde `rate: null` y el frontend simplemente no muestra el equivalente en Bs. Ninguna fuente requiere pagar ni registrar cuenta.

**¿Por qué no scrapear `bcv.org.ve` directo, si el usuario pidió explícitamente que fuera BCV?** Se investigó esa opción: el home de `bcv.org.ve` sí muestra la tasa USD en un bloque HTML estable (`<div id="dolar"><strong class="strong-tb">723,99900000</strong></div>`), y probé extraerla directo. Pero el servidor del BCV no envía la cadena de certificados TLS completa — confirmado con una prueba real: cualquier `fetch()` desde Node.js (tanto en local como el runtime de Vercel en producción) falla con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Funciona en un navegador o en `curl` de Windows porque esos clientes completan la cadena automáticamente (AIA chasing), pero Node no lo hace por defecto. La única forma de "arreglarlo" sería desactivar la verificación de certificado (`rejectUnauthorized: false`), lo cual es un riesgo de seguridad que no se debe hacer solo para ahorrarse un intermediario. Por eso se usa `dolarapi.com`: ya resolvió este mismo problema por nosotros y **expone exactamente el mismo valor oficial** (verificado byte a byte: `723.999` de dolarapi.com == `723,99900000` del HTML del BCV, mismo día).

## 4. Arquitectura propuesta

### Fase 1 — MVP (recomendada para empezar)

No se toca la base de datos. Se agrega una ruta interna que consulta la API externa con caché de Next.js, y el modal de compra la llama.

1. **`src/app/api/exchange-rate/route.js`** (nuevo, Route Handler):
   - `GET` que llama a `https://ve.dolarapi.com/v1/dolares/oficial` con `fetch(url, { next: { revalidate: 3600 } })` (caché de 1 hora — el BCV solo actualiza 1 vez al día, así que ni siquiera hace falta refrescar más seguido) y timeout de 5s.
   - Si falla o da timeout, reintenta una vez más contra la misma fuente (no hay un segundo proveedor verificado disponible — ver sección 3/4 sobre por qué se descartaron `pydolarve.org`/`bcvapi.tech`/`cotizave.com` y el scraping directo al BCV).
   - Si ambos intentos fallan, responde `{ rate: null, updatedAt: null, error: true }` (nunca un 500 — el frontend debe poder seguir mostrando solo USD).
   - Devuelve `{ rate: 723.999, source: 'bcv', updatedAt: '2026-07-14T00:00:00-04:00' }`.

2. **Frontend** (`src/app/(player)/home/page.js`):
   - Al montar la página (junto a `loadData()`), hacer `fetch('/api/exchange-rate')` una vez y guardar el resultado en estado, para que ya esté disponible apenas se abra el modal de compra.
   - Nuevo estado `const [bcvRate, setBcvRate] = useState(null)` y `const [bcvRateDate, setBcvRateDate] = useState(null)`.
   - En `priceBreakdown`, junto a cada línea en USD (precio unitario y total), mostrar el equivalente: `Bs. ${(usd * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.
   - Si `bcvRate` es `null` (API caída), simplemente no se muestra la línea en Bs — no se bloquea la compra.
   - Debajo del total, en texto pequeño: "Tasa BCV: Bs. X,XX / USD — actualizada el dd/mm/yyyy" para que quede claro que es referencial y de qué día es.
   - El texto "Transfiere $X USD y coloca la referencia de pago" también muestra el equivalente en Bs entre paréntesis.

Esto resuelve el pedido con cambios mínimos: 1 archivo nuevo + edits en `page.js`/`home.module.css`. Sin migraciones de base de datos, sin cron jobs.

### Fase 2 — Robustez (opcional, recomendada si el negocio crece o si quieres histórico)

Si más adelante quieres:
- Que el admin vea, al validar un pago, a cuánto equivalía el ticket en Bs **en el momento exacto de la compra** (útil porque la tasa cambia día a día y un pago de "hace 3 días" pudo ser a otra tasa),
- Independencia total de que la API externa esté arriba en el momento exacto en que un usuario compra,
- Histórico de tasas para reportes,

entonces conviene agregar una tabla en Supabase con el valor cacheado y un cron que la actualice, en vez de depender de una llamada en vivo cada vez:

1. **Tabla `exchange_rates`** (migración SQL):
   ```sql
   create table exchange_rates (
     id bigint generated always as identity primary key,
     rate numeric(10,4) not null,
     source text not null,
     fetched_at timestamptz not null default now()
   );
   -- lectura pública (es solo una tasa, no dato sensible)
   alter table exchange_rates enable row level security;
   create policy "public read" on exchange_rates for select using (true);
   ```
2. **`src/app/api/cron/exchange-rate/route.js`** — Route Handler protegido con el header que envía Vercel Cron (`Authorization: Bearer ${CRON_SECRET}`), consulta dolarapi (con fallback a pydolarve), inserta una fila en `exchange_rates`.
3. **`vercel.json`** — agregar:
   ```json
   {
     "crons": [{ "path": "/api/cron/exchange-rate", "schedule": "0 17,21 * * 1-5" }]
   }
   ```
   (dos corridas al día en horario laboral venezolano, lunes a viernes — el BCV no publica fines de semana, así que no hace falta correr el cron esos días).
4. El endpoint `/api/exchange-rate` de la Fase 1 pasa a leer la última fila de `exchange_rates` en vez de llamar a la API externa en vivo (más rápido y no depende de que dolarapi esté arriba justo cuando el usuario abre el modal).
5. **Opcional:** al crear el ticket en `requestTicketsAction` (`src/actions/tickets.js`), guardar también `amount_ves` y `exchange_rate_used` en la fila de `tickets`, tomando el último valor de `exchange_rates`. Esto requiere una migración agregando esas dos columnas a la tabla `tickets`. Le da al admin panel (`src/app/(admin)/admin/tickets/page.js`) la posibilidad de mostrar "el usuario debía transferir Bs. X" al momento de validar el pago — probablemente muy útil dado que las transferencias reales se hacen en Bs, pero **no lo incluyo en el alcance por defecto**, es una extensión natural si la quieres.

## 5. Manejo de errores / casos borde

- **API externa caída**: fallback a la segunda fuente; si ambas fallan, el modal muestra solo USD (no bloquea la compra — el precio en Bs es informativo, no crítico para el flujo).
- **Fin de semana / feriado**: el BCV no publica tasa esos días; tanto dolarapi como pydolarve devuelven automáticamente la última tasa publicada (comportamiento correcto, es lo que hace el BCV también).
- **Tasa desactualizada**: siempre mostrar la fecha de actualización junto al monto en Bs, para que quede claro que es un valor de referencia y no algo en tiempo real al segundo.

## 6. Consideración de negocio (a confirmar contigo)

El monto en Bs que se muestre es **puramente informativo** para ayudar al usuario a saber cuánto transferir — el precio "real"/contable del ticket sigue siendo en USD (`TICKET_PRICE_USD` en `src/lib/constants.js`), tal como ya funciona hoy. Este plan no cambia el flujo de pago ni la moneda en la que se registra el ticket, salvo que decidas incluir la extensión opcional de la Fase 2 (guardar `amount_ves`/`exchange_rate_used` por ticket).

## 7. Archivos a tocar (Fase 1)

- `src/app/api/exchange-rate/route.js` (nuevo)
- `src/app/(player)/home/page.js` (fetch de la tasa + nuevo estado `bcvRate`)
- `src/app/(player)/home/home.module.css` (estilos para la línea "Bs." y el texto de fecha de actualización)

## 8. Checklist de implementación

- [x] Crear `src/app/api/exchange-rate/route.js` con fetch a dolarapi.com + reintento + manejo de error sin 500
- [x] Agregar estado `bcvRate`/`bcvRateDate` en `home/page.js` y hacer el fetch al montar
- [x] Mostrar líneas "Bs." junto a precio unitario y total en `priceBreakdown`
- [x] Mostrar leyenda de fecha de actualización de la tasa
- [x] `npm run lint` y `npm run build` — ambos pasan limpio (solo warnings preexistentes no relacionados)
- [ ] Probar con la API externa simulando caída (bloquear el dominio o forzar error) para confirmar que el modal sigue funcionando solo con USD — pendiente de probar manualmente
- [ ] (Opcional, Fase 2) Migración `exchange_rates`, cron en `vercel.json`, columnas `amount_ves`/`exchange_rate_used` en `tickets`

## 9. Verificación

- Abrir el modal de compra en `/home`, confirmar que aparece el monto en Bs junto a cada línea en USD y que coincide con la tasa BCV del día (comparar contra `bcv.org.ve` o `tcambio.app`).
- Cambiar la cantidad de tickets y confirmar que el monto en Bs se recalcula igual que el de USD.
- Simular que la API externa no responde y confirmar que el modal no se rompe (solo deja de mostrar la línea en Bs).

## 10. Estado de implementación

**Fase 1 completada.** Archivos creados/editados:

- `src/app/api/exchange-rate/route.js` (nuevo) — consulta `dolarapi.com` con reintento y timeout de 5s.
- `src/app/(player)/home/page.js` — fetch de la tasa al montar, estados `bcvRate`/`bcvRateDate`, función `formatBs()`, líneas en Bs en el modal de compra.
- `src/app/(player)/home/home.module.css` — clases `.priceBs` y `.bcvNote`.

**Validado:**
- `npm run lint` → 0 errores (solo 3 warnings preexistentes de otros archivos, no relacionados).
- `npm run build` → compila limpio; `/api/exchange-rate` queda registrada como ruta dinámica (`ƒ`).
- Prueba end-to-end en el dev server: `GET /api/exchange-rate` devolvió `{"rate":723.999,"source":"bcv","updatedAt":"2026-07-14T00:00:00-04:00"}`, coincidiendo exacto con el valor publicado ese día en el HTML de `bcv.org.ve`.

**Hallazgo de la investigación (por qué no se scrapea `bcv.org.ve` directo):** se probó con un script de Node aislado (`fetch('https://www.bcv.org.ve/')`) y falló de forma reproducible con:
```
ERR_MESSAGE fetch failed
ERR_CAUSE Error: unable to verify the first certificate
code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
```
El servidor del BCV no envía la cadena de certificados TLS intermedia completa. Los navegadores y `curl` en Windows lo resuelven solos (completan la cadena automáticamente vía AIA chasing), pero `fetch()` de Node.js no — y ese es el mismo runtime que usa Vercel en producción, así que el problema no es local, se repetiría igual en producción. La alternativa segura sería agregar el certificado intermedio faltante a mano a un `https.Agent` personalizado (posible, pero mucho más complejo para lo que aporta) o desactivar la verificación TLS (`rejectUnauthorized: false`), que se descartó por ser un riesgo de seguridad. Por eso la fuente usada es `dolarapi.com`, que ya resolvió ese problema y expone el mismo valor oficial del BCV verificado byte a byte.

**Pendiente:** probar manualmente el caso de la API caída (para confirmar que el modal se degrada a solo-USD sin romperse), y decidir si se quiere la Fase 2 (histórico en Supabase + cron + monto en Bs guardado por ticket).
