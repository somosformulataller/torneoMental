# Plan: Verificación automática de pagos (Pago Móvil / transferencia)

## 1. Objetivo

Hoy, cuando un usuario compra tickets (`src/app/(player)/home/page.js` → `requestTicketsAction` en `src/actions/tickets.js`), el flujo es:

1. El usuario transfiere el monto (Pago Móvil o transferencia) por fuera de la app.
2. Escribe un número de referencia en un campo de texto libre (sin validación de formato/longitud en el código actual).
3. El ticket queda en `payment_status = 'pendiente'`.
4. Un admin revisa manualmente en `/admin/tickets` y aprueba o rechaza (`approve_ticket`/`reject_ticket`, RPCs en Supabase).

El objetivo es reemplazar el paso 4 por una verificación automática: que el sistema confirme por sí mismo, contra el banco o un intermediario confiable, que el pago con esa referencia realmente ocurrió, y apruebe el ticket sin intervención humana (dejando la revisión manual como respaldo, no eliminándola del todo).

## 2. Respuesta corta a "¿nos podemos conectar a cualquier banco de Venezuela con una API?"

**No a "cualquier banco" de forma genérica y gratuita — pero sí es posible, por varias rutas distintas, cada una con trade-offs reales.** No existe una regulación de *open banking* obligatoria en Venezuela (a diferencia de la UE/PSD2) que obligue a todos los bancos a exponer una API pública. Lo que sí existe:

- Algunos bancos grandes (Mercantil, Banesco, Bancaribe) **sí tienen APIs propias para negocios**, pero solo si tu cuenta receptora está en ese banco y estás registrado como cliente empresa.
- Hay **empresas venezolanas especializadas** que ya resolvieron este problema exacto (verificación de Pago Móvil) y lo venden como servicio, sin que tengas que integrarte con el banco directamente.
- Existe una vía para **eliminar el problema de raíz** en vez de verificarlo después: pasarelas de pago con **C2P**, donde el cobro se inicia desde tu sistema y el cliente solo aprueba en su app bancaria — ahí no hay "referencia que verificar", la confirmación es parte del pago mismo.

Detalle de cada ruta abajo.

## 3. Pregunta bloqueante — **respondida, ver sección 10**

Los pagos llegan hoy a una cuenta personal (no de negocio) en Banco de Venezuela. Esto determina directamente cuáles de las opciones de la sección 4 son viables — la respuesta y la recomendación final basada en ella están en la sección 10.

## 4. Rutas investigadas

### Ruta A — API directa del banco receptor (más "oficial", requiere cuenta de negocio en ese banco)

| Banco | Qué ofrece | Requisitos |
|---|---|---|
| **Mercantil** | API "Búsquedas de Pagos Móviles": busca transacciones C2P/P2C por **referencia completa o por los últimos 4, 5 o 6 dígitos** — encaja exacto con el dato que ya le pedimos al usuario hoy. Portal: `apiportal.mercantilbanco.com`. | Ser cliente Mercantil (Banco Universal), estar afiliado a "Mercantil en Línea Empresas", tener `ClientID` + llave de negocio aprobados por el banco. |
| **Banesco** | Portal de APIs para comercios (`Comercio Electrónico` / doc-apis en 3scale), incluye APIs de pagos con tarjeta y conciliación. | Cuenta empresa Banesco. |
| **Bancaribe** | "Open Banking" + "Pago Móvil a Comercio": dashboard "Mi Conexión Bancaribe Jurídica" con conciliación diaria y archivos de liquidación; también ofrecen una API de "Transferencia Inmediata". | Persona jurídica o autónomo con RIF, cuenta corriente/ahorro Bancaribe, afiliación jurídica. **Comisión: 1.5% por transacción (mínimo Bs. 0.92)**. |

**Pros:** dato directo de la fuente, sin depender de un tercero no bancario. **Contras:** solo sirve si tu cuenta receptora ya está (o puede moverse) a uno de estos bancos; el proceso de afiliación como "empresa" con el banco puede tardar semanas y típicamente pide RIF/persona jurídica, no solo cuenta personal.

### Ruta B — Servicios de verificación de terceros (no requieren cambiar de banco)

Empresas venezolanas que ya resolvieron este problema específico y lo venden como servicio:

- **Verifica Pago Móvil** (`verificapago.com`): validas una referencia vía bot de Telegram/web y responde si el pago es válido o no, en segundos. Soporta Banesco, Banco de Venezuela, Mercantil, Provincial, BNC y otros. Según su web, es tecnología de **solo lectura de SMS/notificaciones de pago** — no piden ni guardan credenciales bancarias. Precios: Starter $15/mes (100 verificaciones), Pro $30/mes (ilimitado, 3 cuentas), **Unlimited $60/mes (incluye acceso a API)** — la API para integrarlo a nuestro backend solo viene en el plan más caro.
- **Pabilo** (`pabilo.app`): "sistema de verificación de pagos y conciliación bancaria automática", soporta BDV, Mercantil, Provincial y BNC. No pude confirmar precio ni forma exacta de integración (API vs. dashboard) sin contactarlos directamente — su web no expone esos detalles públicamente.

**Pros:** no dependen de que abras cuenta de negocio en un banco nuevo, se pueden probar rápido, cubren varios bancos a la vez (útil si los clientes pagan desde bancos distintos al tuyo, aunque eso no es un problema real porque el Pago Móvil siempre termina llegando a tu cuenta receptora sin importar de qué banco salió). **Contras:** son terceros no regulados como banco — hay que evaluar su confiabilidad/continuidad como empresa; cuesta una suscripción mensual fija; el mecanismo de "solo lectura de notificaciones" probablemente implica que alguien debe tener la app del banco instalada en un teléfono vinculado al servicio (no pude confirmar el detalle técnico exacto sin una demo).

### Ruta C — Pasarela con C2P real (cambia el flujo de cobro, no solo lo audita después)

Esto es distinto a las rutas A y B: en vez de "el usuario paga por fuera y luego escribe una referencia que puede escribir mal o inventar", el flujo **C2P (Comercio a Persona)** hace que sea el comercio quien inicia el cobro:

1. El usuario da su cédula, banco y teléfono (no transfiere nada manualmente).
2. El sistema le pide el cobro a la red interbancaria a través de la pasarela.
3. Al usuario le llega una notificación/clave dinámica en su app bancaria, la aprueba.
4. El sistema recibe confirmación **inmediata** (webhook) — no hay "referencia" que verificar, la aprobación del banco *es* la confirmación.

Proveedores que ya integran esto en Venezuela: **PagoFlash**, **Sitef** (P2C/C2P), **Megasoft**, **Neerü**, o el "Botón de Pagos C2P" directo de Mercantil/Bancaribe si tu cuenta ya está en uno de esos bancos.

**Pros:** elimina el problema de raíz (no hay fraude posible por referencia inventada, no hay demora ni ambigüedad — la confirmación llega en segundos vía webhook). Es la solución más robusta a mediano plazo. **Contras:** más esfuerzo de integración (checkout distinto, no solo un campo de texto), normalmente cobra comisión por transacción (industria en Venezuela ronda 1-3%), y requiere firmar afiliación comercial con la pasarela (generalmente piden RIF).

### Ruta D — Descartada: automatizar con las credenciales de tu propia banca en línea (RPA/scraping)

Se podría, técnicamente, escribir un script que inicie sesión en la banca en línea con tus propias credenciales y revise el estado de cuenta periódicamente buscando el monto+referencia. **No lo recomiendo:**
- Casi todos los bancos venezolanos prohíben en sus términos de servicio el acceso automatizado/no interactivo a la banca en línea — el riesgo es que te bloqueen la cuenta.
- Es frágil por diseño: cualquier cambio de HTML/2FA/captcha rompe el script (vimos exactamente este tipo de problema al intentar leer `bcv.org.ve` directo para la tasa de cambio — ver `docs/plan-tasa-bcv.md` sección 4 — y ahí el riesgo era solo mostrar mal un precio; aquí el riesgo es con dinero real y la cuenta bancaria del negocio).
- Requeriría guardar credenciales bancarias reales en nuestra infraestructura, lo cual es un riesgo de seguridad serio que hay que evitar.

## 5. Comparación rápida

| Ruta | ¿Requiere cuenta de negocio? | Costo aprox. | Tiempo de implementación | Robustez |
|---|---|---|---|---|
| A — API directa del banco | Sí, en ese banco específico | Gratis o ya incluido (Bancaribe cobra 1.5%) | Semanas (proceso de afiliación del banco) | Alta (fuente oficial) |
| B — Verificador de terceros | No | $15–$60/mes | Días (una vez tengan API/demo) | Media (depende de un tercero no bancario) |
| C — Pasarela C2P | Usualmente sí (RIF) | Comisión ~1–3% por transacción | Semanas (integración de checkout + contrato) | Muy alta (elimina el problema de raíz) |
| D — Scraping con credenciales propias | No | "Gratis" en apariencia | — | **No recomendado** |

## 6. Recomendación según escenario

- **Si el negocio ya tiene o puede abrir cuenta de negocio (RIF) en Mercantil, Banesco o Bancaribe:** ir por la Ruta A. Es la más económica a largo plazo (sin comisión de terceros, salvo Bancaribe) y la fuente es el banco mismo. Vale la pena iniciar el trámite en paralelo aunque tarde, porque es la base más sólida.
- **Si se quiere algo funcionando pronto, sin trámites bancarios, y el volumen de tickets es bajo/medio:** empezar con la Ruta B (ej. Verifica Pago Móvil, plan Unlimited $60/mes para tener acceso a API) como solución puente. Rápido de validar, sin comprometerse a largo plazo.
- **Si el negocio va a crecer y se quiere resolver el problema de fondo (no solo automatizar la revisión sino quitar la posibilidad de fraude/error humano en el pago):** planear migrar el checkout a una pasarela C2P (Ruta C) a mediano plazo.

Sin la respuesta a la pregunta de la sección 3, no puedo reducir esto a una sola recomendación firme — pero **mi sugerencia por defecto, si no hay una cuenta de negocio ya abierta en Mercantil/Banesco/Bancaribe, es empezar con la Ruta B** porque no bloquea nada del lado bancario y se puede probar en días, mientras se evalúa si vale la pena el esfuerzo de la Ruta A o C más adelante.

## 7. Cómo encajaría en el código actual (agnóstico al proveedor elegido)

- El estado `pendiente` de `tickets.payment_status` se mantiene igual.
- Al crear el ticket (`requestTicketsAction`), además de insertarlo como hoy, se dispara una verificación automática:
  - Si el proveedor es de **consulta** (Ruta A o B): un Route Handler o Server Action llama a la API del proveedor con la referencia (y el monto esperado) apenas se crea el ticket, y reintenta un par de veces en los minutos siguientes (el pago puede tardar en aparecer). Si hay match exacto de referencia + monto → llama automáticamente al RPC `approve_ticket` que ya existe. Si no hay match tras varios intentos, se deja en `pendiente` para revisión manual — **nunca auto-rechazar solo por no encontrar el match todavía**, podría ser demora del banco.
  - Si el proveedor es una **pasarela C2P** (Ruta C): se agrega un nuevo Route Handler `/api/webhooks/pagos` que recibe la confirmación del proveedor (con verificación de firma), y aprueba el ticket correspondiente en cuanto llega el webhook — ahí no hace falta ni siquiera el campo de referencia manual, se reemplaza el formulario actual por el flujo de checkout C2P.
- Se agregarían columnas de auditoría a `tickets` para trazabilidad: `payment_verification_source` (`'manual'` | `'auto'`), `payment_verified_at`, `payment_provider_response` (jsonb con la respuesta cruda del proveedor, útil para disputas).
- **Dependencia con el plan de tasa BCV** (`docs/plan-tasa-bcv.md`): para poder comparar el monto recibido (en Bs) contra el monto esperado, el ticket necesita guardar cuánto en Bs se le pidió al usuario al momento de la compra — hoy solo se guarda `amount_usd`. Esto activa la extensión opcional que quedó pendiente en la Fase 2 de ese plan (`amount_ves`/`exchange_rate_used` por ticket), que ahora deja de ser "opcional" y pasa a ser un requisito para que la verificación automática por monto funcione con precisión.
- El panel de admin (`/admin/tickets`) se mantiene como respaldo manual siempre — para los casos que el sistema no pueda verificar automáticamente.

## 8. Riesgos y salvaguardas

- **Nunca auto-aprobar sin match exacto** de referencia + monto (con una tolerancia pequeña razonable, ej. redondeo de centavos). Un match parcial se deja para revisión manual, no se aprueba "por si acaso".
- **Referencias duplicadas**: dos usuarios no deben poder reclamar la misma referencia — agregar una restricción única a nivel de base de datos sobre `payment_reference` sería razonable independientemente de qué ruta se elija.
- **El proveedor externo puede fallar o estar lento**: el flujo nunca debe bloquear al usuario ni marcar el ticket como rechazado por un error del proveedor — se queda en `pendiente` y el admin lo revisa como hoy.
- **No guardar credenciales bancarias** en la app bajo ninguna circunstancia (descarta por completo la Ruta D).

## 9. Preguntas abiertas para decidir e implementar

1. ¿A qué banco y número (Pago Móvil) o cuenta llegan hoy los pagos? ¿Es cuenta personal o de negocio (con RIF)?
2. ¿Volumen aproximado de compras de tickets por día/semana? (para saber si $15–60/mes de un verificador de terceros se paga solo, o si conviene esperar a la API directa del banco)
3. ¿Están dispuestos a abrir o mover la cuenta receptora a Mercantil, Banesco o Bancaribe si eso desbloquea la API directa del banco (Ruta A)?
4. ¿Prefieren solo automatizar la verificación manteniendo el flujo actual (usuario transfiere y escribe referencia), o están abiertos a cambiar el flujo de compra a C2P (Ruta C), que es más robusto pero requiere más integración y un contrato con la pasarela?

## 10. Datos confirmados y recomendación final

**Cuenta receptora actual:** Banco de Venezuela (BDV), Pago Móvil vinculado a la cédula de identidad V-26.725.053 y ese mismo número como teléfono asociado. Es decir, **es una cuenta personal (persona natural), no una cuenta de negocio con RIF empresarial**.

Esto descarta la Ruta A tal como está hoy:
- El "Botón de Pago BDV" que ofrece el Banco de Venezuela existe, pero es para **pagos con tarjeta de débito en e-commerce**, no para Pago Móvil, y exige afiliación como comercio/persona jurídica (`atencion_clientejuridico@banvenez.com`) — no aplica a una cuenta personal.
- No encontré ninguna API pública de BDV para consultar/conciliar Pago Móvil P2C recibido en una cuenta personal (a diferencia de Mercantil/Banesco/Bancaribe, que si tienen ese producto pero solo para clientes empresa en *su propio* banco).
- Mover la cuenta receptora a Mercantil/Banesco/Bancaribe activaría la Ruta A, pero implica abrir cuenta de negocio (RIF) en un banco distinto, un cambio operativo grande solo para esto.

**Recomendación: Ruta B (verificador de terceros) como camino inmediato.**

Tanto **Verifica Pago Móvil** como **Pabilo** listan explícitamente Banco de Venezuela entre los bancos soportados, y ninguno de los dos exige mover la cuenta ni tener RIF — funcionan leyendo las notificaciones de pago de la cuenta actual tal como está. Es la única ruta de las investigadas que sirve *hoy*, con la cuenta que ya tienen, sin trámites bancarios:

- Empezar con **Verifica Pago Móvil**, plan Unlimited ($60/mes) porque es el único que incluye acceso a API — los planes más baratos ($15/$30) son solo para consulta manual vía Telegram/web, no sirven para automatizar desde el backend.
- En paralelo, escribir a **Pabilo** para comparar precio real de su API (su web pública no lo expone), por si resulta más barato o mejor soportado para BDV específicamente.

**Camino a mediano plazo (opcional, si el negocio crece):** evaluar **PagoFlash**, que se anuncia como "la primera API pública en Venezuela para Verificación de Pago Móvil, envío de vuelto digital y verificación de transferencias" — es decir, ofrecen tanto verificación standalone (similar a la Ruta B) como checkout C2P completo (Ruta C). Para darse de alta piden cédula + RIF digitalizados; en Venezuela toda persona natural con actividad económica puede sacar un RIF personal (no hace falta constituir una empresa), así que esto es alcanzable sin abrir una cuenta de negocio — vale la pena escribirles para confirmar si su producto de solo-verificación funciona con una cuenta BDV personal como la actual, y a qué precio, como alternativa o complemento a Verifica Pago Móvil/Pabilo.

## 11. Próximo paso sugerido (sin comprometer código todavía)

Validar factibilidad real en paralelo, sin necesidad de decidir ya:
- Contactar a **Verifica Pago Móvil** o **Pabilo** pidiendo detalles concretos de integración por API y precio real (sus webs públicas no exponen todo).
- Preguntar en el banco donde reciben los pagos hoy si ofrecen API para negocios (aunque no sea Mercantil/Banesco/Bancaribe, vale la pena confirmar — la lista de la sección 4 no es exhaustiva, son solo los que tienen API pública y documentada que encontré).

Con esas respuestas más las de la sección 9, se puede convertir este plan en un plan de implementación concreto (como se hizo con `docs/plan-tasa-bcv.md`).

## 12. Actualización (2026-07-21): apareció una opción mejor

Un compañero de Estefania construyó y opera su propia API de verificación (scraping del
portal BDV/BNC, en producción real) y ofrece acceso. Eso desplaza la recomendación de la
sección 10 (Verifica Pago Móvil $60/mes). El análisis de esa API y el plan de
implementación concreto están en **`docs/api-validacion-pagos.md`** — este documento
queda como registro de la investigación de rutas.
