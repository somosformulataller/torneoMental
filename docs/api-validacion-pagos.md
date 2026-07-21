# API de validación de pagos (Bank Automation API) — resumen e implementación

> Continúa el análisis de `docs/plan-verificacion-pagos.md`. Aquella investigación concluyó
> que la mejor ruta inmediata era pagar un verificador de terceros (~$60/mes). Esto cambió:
> un compañero construyó y opera su propia API que hace exactamente ese trabajo, y nos
> ofrece acceso. Este documento la describe y define cómo integrarla a Copa Mental.

## 1. Qué es la API

- **Nombre:** Bank Automation API v1.0.0 (NestJS + Supabase).
- **URL base:** `https://bank-automation-api-production.up.railway.app`
- **Documentación interactiva:** `/docs` (Swagger; el JSON crudo está en `/docs-json`).
- **Qué hace:** entra al portal web de bancos venezolanos (**BDV** —código `vzla`— y **BNC**)
  con las credenciales de la cuenta (guardadas cifradas en su servidor), extrae los
  movimientos y los guarda en su base de datos. Sobre eso ofrece un endpoint que responde
  la pregunta clave: *"¿llegó un pago con esta referencia, esta fecha y este monto?"*.
- **Cómo NO funciona:** no lee SMS ni notificaciones del teléfono (a diferencia de
  Verifica Pago Móvil). Es scraping del portal bancario, operado por el compañero.
- **Estado verificado (2026-07-21):** en producción real — `/health` sano, 2 cuentas
  registradas, transacciones de Pago Móvil BDV del mismo día ya procesadas y marcadas
  como usadas. No es un experimento: otro negocio ya lo usa a diario.

## 2. Endpoints (todos con `Authorization: Bearer <token>`, salvo los públicos)

### Públicos
| Endpoint | Qué hace |
|---|---|
| `GET /` | Nombre y versión del servicio. |
| `GET /health` | Estado del servicio y de su base de datos. Útil para monitoreo. |

### Usuarios (solo relevantes para administrar la API en sí)
| Endpoint | Qué hace |
|---|---|
| `GET /user` | Lista los usuarios de la API (nunca devuelve claves ni tokens). |
| `GET /user/{id}` | Un usuario por id. |
| `POST /user/create` | Crea un usuario con su propio token de acceso (mín. 16 caracteres, se guarda hasheado). Campos: `username`, `password`, `email`, `token`, `admin` (default `false`), `active`. |

### Cuentas bancarias
| Endpoint | Qué hace |
|---|---|
| `GET /account` | Lista las cuentas registradas (nunca devuelve credenciales). |
| `POST /account` | Registra una cuenta: `bank` (`vzla` o `bnc`), `account_name` (etiqueta interna única, ej. `copamental-bdv`), `username` y `password` del portal del banco (cifrados en reposo), `ci` (solo obligatoria para BNC). |

### Transacciones (lo que usaremos)
| Endpoint | Qué hace |
|---|---|
| `GET /transaction` | Lista movimientos guardados. Filtros: `limit` (1–1000), `offset`, `cuenta` (número enmascarado del banco), `account_name` (etiqueta interna), `referencia` (coincidencia por sufijo). |
| `GET /transaction/validate` | **El endpoint estrella.** Ver detalle abajo. |

### `GET /transaction/validate` en detalle

Parámetros:

| Parámetro | Obligatorio | Significado |
|---|---|---|
| `account_name` | Sí | Etiqueta de la cuenta a consultar (y a scrapear si no encuentra el pago). |
| `reference` | Sí | Referencia del pago. **Se compara solo por los últimos 6 dígitos**, porque la referencia que ve el pagador en su comprobante casi nunca coincide completa con la que registra el banco receptor — solo la cola coincide. Se puede pasar completa o solo los 6 últimos dígitos. |
| `date` | Sí | Fecha del pago: `YYYY-MM-DD` o `DD/MM/YYYY`. |
| `monto` | No (pero **siempre pasarlo**) | Monto esperado en Bs. Como la referencia solo compara la cola, el monto cierra la (pequeña) posibilidad de coincidir con la transacción equivocada. |
| `set_used` | Sí | Con `true`, marca la transacción encontrada como **usada** — impide que el mismo comprobante se use dos veces. |
| `get_used` | Sí | Con `true`, solo busca entre transacciones YA usadas (sirve para re-consultar; nosotros usaremos `false`). |

Comportamiento:
1. Busca el pago en su base de datos.
2. Si no lo encuentra, **entra al banco en ese momento** y vuelve a intentar.
3. Límite: máximo un scraping por minuto por cuenta → si se consulta antes responde
   **HTTP 429** ("espera el cooldown"). No es un error: significa "reintenta en ~1 min".

Respuesta al encontrarlo:

```json
{
  "success": true,
  "data": {
    "referencia": "0677249766816",
    "monto": 737.23,
    "tipo_movimieto": "CREDITO",
    "descripcion": "OPERACION PAGOMOVIL BDV",
    "fecha": "2026-07-21T12:48:00+00:00",
    "used": true
  }
}
```

## 3. Advertencias (leer antes de implementar)

1. **Hay que entregar las credenciales del banco.** Para validar pagos a la cuenta BDV de
   Copa Mental, esa cuenta debe registrarse en la API con su usuario y clave del portal
   BDV. Van cifradas, pero es un acto de confianza en el servidor del compañero. Es la
   misma técnica que `plan-verificacion-pagos.md` descartó como Ruta D *para hacerla
   nosotros mismos*; aquí el riesgo operativo (bloqueo de cuenta, cambios del portal) lo
   asume y mantiene el compañero, que ya la opera en producción — pero el riesgo de
   custodia de credenciales existe igual y hay que aceptarlo conscientemente.
2. **El token compartido inicialmente era el de administrador y quedó expuesto en un
   chat.** Antes de integrar: pedirle al compañero que lo regenere y nos cree un usuario
   **no-admin** propio para Copa Mental. Nuestro token vivirá SOLO en variables de
   entorno del servidor (Vercel + `.env.local`), jamás en el navegador ni en este repo.
3. **Dependencia del portal BDV:** si el banco cambia su web o bloquea el acceso
   automatizado, la validación automática se cae hasta que el compañero la repare. Por
   eso la revisión manual del admin **nunca se elimina**: es el respaldo permanente.
4. **Cooldown de 60 s por cuenta:** un pago muy reciente puede no aparecer al primer
   intento. Regla de oro heredada del plan anterior: **nunca auto-rechazar** — si no hay
   match, el ticket queda `pendiente` para el admin, como hoy.
5. **Acordar condiciones:** preguntar al compañero costo (si alguno), disponibilidad
   esperada y a quién avisar si `/health` falla.

## 4. Plan de implementación en Copa Mental

### Fase 0 — Coordinación con el compañero (sin código)

1. Que **regenere el token admin** (quedó expuesto) y cree un usuario no-admin
   `copamental` con token propio (`POST /user/create`).
2. **Registrar la cuenta BDV receptora** (`POST /account`) con `bank: "vzla"` y
   `account_name: "copamental-bdv"`. Ideal: que Estefania escriba sus credenciales
   directamente en el Swagger (`/docs`) para no pasárselas a nadie por chat.
3. Confirmar con un `GET /transaction?account_name=copamental-bdv` que empiezan a
   aparecer movimientos de la cuenta.

### Fase 1 — Preparación en nuestra app

4. **Variables de entorno** (en `.env.local` y en Vercel, entorno Production):
   ```
   BANK_API_URL=https://bank-automation-api-production.up.railway.app
   BANK_API_TOKEN=<token no-admin de copamental>
   BANK_API_ACCOUNT_NAME=copamental-bdv
   ```
5. **Migración en Supabase** — columnas nuevas en `tickets` (auditoría ya prevista en el
   plan anterior, sección 7):
   - `amount_ves numeric` y `exchange_rate_used numeric` — cuánto se le pidió al usuario
     en Bs y a qué tasa. **Requisito**: `validate` compara montos en Bs y hoy solo
     guardamos `amount_usd`.
   - `payment_verification_source text default 'manual'` (`'manual'` | `'auto'`).
   - `payment_verified_at timestamptz`.
   - `payment_provider_response jsonb` — respuesta cruda de la API, para disputas.
   - Índice único sobre los **últimos 6 dígitos** de `payment_reference` en tickets no
     rechazados (la API compara por esa cola; `set_used=true` ya protege del doble uso
     del lado del banco, esto lo refuerza de nuestro lado).
6. **Guardar el monto en Bs al crear el ticket**: en `requestTicketsAction`
   (`src/actions/tickets.js`), calcular `amount_ves` con la misma fuente de tasa que ya
   usa la app (`src/app/api/exchange-rate/route.js` — dolarapi/BCV; extraer `fetchRate`
   a `src/lib/exchangeRate.js` para reutilizarla desde el server action).

### Fase 2 — Verificación automática

7. **Nuevo módulo servidor** `src/lib/bankApi.js` (solo servidor, nunca cliente):
   - `validatePayment({ reference, dateISO, amountVes })` → llama
     `GET ${BANK_API_URL}/transaction/validate` con `set_used=true`, `get_used=false`,
     `account_name`, `reference`, `date`, `monto`, header `Authorization: Bearer` y
     `AbortSignal.timeout(15000)` (el scraping en vivo puede tardar varios segundos).
   - Devuelve `{ found: true, data }`, `{ found: false }` o
     `{ found: false, retryable: true }` (para 429/timeout/errores de red).
   - La fecha se calcula en **zona horaria de Venezuela** (`America/Caracas`), no UTC —
     un pago a las 8 pm de Caracas ya es "mañana" en UTC y el match por fecha fallaría.
8. **Enganchar en `requestTicketsAction`**: tras insertar el ticket `pendiente`, llamar
   `validatePayment`:
   - **Match** → llamar el RPC `approve_ticket` existente y actualizar
     `payment_verification_source='auto'`, `payment_verified_at=now()`,
     `payment_provider_response`.
   - **Sin match o error** → el ticket queda `pendiente` exactamente como hoy. El
     usuario ve el mismo mensaje de siempre ("en revisión"); si hubo match ve sus
     tickets aprobados al instante.
   - La llamada nunca debe romper la compra: cualquier excepción se captura y se sigue
     con el flujo actual.
9. **Reintento simple** (elegir uno al implementar):
   - a) Botón "Verificar de nuevo" en la billetera del usuario para tickets pendientes
     (reusa `validatePayment`; el cooldown de 60 s de la API ya evita abuso), o
   - b) Reintento automático al cargar `/billetera` si hay tickets pendientes con menos
     de 24 h.
10. **Panel admin sin cambios de fondo**: sigue siendo el respaldo. Mejora opcional:
    mostrar en `/admin/tickets` una insignia "aprobado automático" vs "manual" usando
    `payment_verification_source`.

### Fase 3 — Pruebas antes de anunciar

11. Pago Móvil real de monto pequeño a la cuenta registrada → comprar ticket con esa
    referencia → debe aprobarse solo (medir cuánto tarda).
12. Intentar usar **la misma referencia** en una segunda compra → debe quedar
    `pendiente` (la transacción ya está `used`).
13. Referencia inventada → debe quedar `pendiente`, **nunca** rechazada.
14. Simular API caída (token inválido / URL mala en local) → la compra debe completarse
    igual en `pendiente`.

## 5. Qué cambia respecto al plan anterior

| | Plan anterior (`plan-verificacion-pagos.md`) | Con esta API |
|---|---|---|
| Ruta elegida | B — Verifica Pago Móvil, $60/mes | API del compañero |
| Costo | $60/mes fijo | A acordar (posiblemente $0) |
| Mecanismo | Lectura de SMS/notificaciones en un teléfono | Scraping del portal BDV desde su servidor |
| Credenciales bancarias | No se entregan | Sí, cifradas, al servidor del compañero |
| Anti-doble-uso de referencia | A construir nosotros | Incluido (`set_used`) |
| Dependencia externa | Empresa comercial | El compañero y su servidor en Railway |
