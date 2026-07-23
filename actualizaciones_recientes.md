# Actualizaciones Recientes y Bugs Resueltos

Registro de los cambios más recientes hechos en Copa Mental (producción: copamental.com). Complementa a `plan_del_proyecto.md` e `implementation_plan.md`, que documentan el diseño general del producto.

## Bugs resueltos

### Los botones de acciones en Transacciones se cortaban

Reportado: "los botones no se están adaptando bien horizontalmente al contenedor de las secciones en Transacciones, por ejemplo los botones de sumar y restar tickets se cortan".

- **Diagnóstico**: la celda de acciones (`.actions`) era un `flex` sin `flex-wrap`, así que en filas con varios botones (Aprobar, Rechazar, ＋/− Tickets, Bloquear) estos no bajaban de línea y se cortaban.
- **Fix**: `flex-wrap: wrap` en `.actions` (los botones se acomodan en varias líneas dentro de la celda).
- **Verificado** (navegador automatizado, filtro "Todos"): de 72 botones de acción medidos, ninguno se sale de su celda (antes se cortaban).

### Un pago válido se quedaba en "Pendiente" para siempre (la validación automática no reintentaba)

Reportado: "compré un ticket y se queda en Pendiente en Transacciones; ¿la API no pudo validar mi pago? Debería salir el estado desde el perfil del jugador y sumar el ticket apenas la API valide".

- **Diagnóstico** (verificado consultando la API del banco con la referencia real): el pago **sí era válido** — existía, el monto cuadraba exacto (737,88 Bs) y no estaba reclamado. El problema es que la validación automática contra el banco corría **una sola vez, en el instante de la compra**. Si en ese momento el banco todavía no había reflejado el pago (suele tardar 1–2 min) o su servicio estaba en enfriamiento (la API rechaza consultas por ~48 s tras una reciente), la solicitud caía a `pendiente` **sin ningún reintento**, y ahí se quedaba hasta que un admin la aprobara a mano.
- **Fix**:
  - Nueva acción `recheckMyTicketsAction` (`src/actions/tickets.js`): re-consulta el banco por las compras propias del jugador que siguen en `pendiente`/`validando` y las auto-aprueba si el pago ya aparece. Reutiliza la RPC idempotente `auto_approve_ticket` (solo service-role) — es seguro: solo aprueba si el banco confirma el pago real, no hay forma de forzar tickets gratis.
  - La **Billetera** re-consulta al entrar y cada 60 s mientras haya pagos en revisión; el modal de compra en **Home** y cada compra pendiente tienen un botón "Verificar de nuevo / ahora". No se agregó cron frecuente (plan gratuito de Vercel no lo permite); el jugador, que está en la app tras pagar, dispara la re-validación.
  - **Estado visible para el jugador**: en Home, bajo Ranking/Billetera, aparece un mensajito — "⏳ Tu pago está en revisión…" mientras se valida y "✅ ¡Tu pago fue aprobado!" unos minutos después de aprobarse (luego desaparece solo). En la Billetera, cada compra pendiente muestra la nota "en revisión" y hay un aviso de "pagos en revisión" sobre la tarjeta de tickets.
- **Verificado** (app real, navegador automatizado, contra el banco y la base de datos de producción): con el pago pendiente real, Home mostró el estado "en revisión"; al abrir la Billetera la re-validación aprobó el pago solo (`auto`, con la respuesta del banco guardada), el saldo pasó de 3 → 4 tickets, y Home mostró el estado "aprobado". El ticket que estaba trancado quedó resuelto.

### La app se recargaba sola en medio de una partida (se reiniciaba el juego)

Reportado: "a veces cuando recargo o entro a alguna pantalla se vuelve a recargar sola, hace como un flash; si estoy jugando aparece una nueva partida en vez de respetar que ya estaba en una".

- **Diagnóstico**: el único punto que recarga la app es `ServiceWorkerReload` (recarga una vez cuando un deploy nuevo cambia el service worker, para no quedar con la build vieja). Al desplegar seguido, cada vez que se abre/navega la app detecta el SW nuevo, lo activa, toma control (`controllerchange`) y recarga — ese es el "flash". Si ocurría estando en la pantalla de juego (`/jugar`), la recarga remontaba el componente y arrancaba una partida nueva (en práctica el tablero se pierde por diseño; en torneo se veía el reinicio).
- **Fix**: `ServiceWorkerReload` ahora difiere la recarga mientras el jugador está en `/jugar`. Si llega un SW nuevo en medio de una partida, marca la recarga como pendiente y la ejecuta recién cuando el jugador sale del juego (a Inicio, Ranking, etc.) — un momento seguro. Fuera del juego sigue recargando de inmediato para agarrar la build nueva.
- **Verificado** (build de producción real con PWA + service worker, navegador automatizado, disparando `controllerchange`): en Inicio un SW nuevo recarga como antes; en `/jugar` NO recarga y el tablero queda intacto (12→12 cartas); al salir a Inicio la recarga diferida se ejecuta. Los tres casos OK.

### Flash/rebote al navegar: los elementos aparecían ~1s y la página se recargaba

Reportado tras el deploy de la carga instantánea: al hacer click en cualquier vista, el contenido aparecía un instante y luego "rebotaba" (la página entera se recargaba, comiéndose además el siguiente click).

- **Diagnóstico** (reproducido con navegador automatizado + prueba de marcador `window.__marker` para distinguir navegación suave de recarga): la navegación de Next funcionaba bien; el culpable era `ServiceWorkerReload`, que recargaba la pestaña en el evento `controllerchange`. Ese evento no solo dispara cuando un service worker nuevo reemplaza al viejo (deploy) — también dispara cuando el SW recién instalado **toma control por primera vez** de una pestaña no controlada (primera visita, o tras limpiar datos, o tras cada deploy que cambia el SW). En ese caso la recarga es innecesaria (el documento ya vino fresco de la red) y solo produce el flash + click perdido.
- **Descartados durante el diagnóstico** (con pruebas, no supuestos): el service worker interceptando fetches (bloqueado → mismo síntoma), el proxy/middleware (vaciado y hasta eliminado → mismo síntoma), mismatch de buildId cliente/servidor (coinciden), content-type de las respuestas RSC (correcto: `text/x-component`), y el fetch server-side nuevo (login→registro, páginas nunca tocadas, también lo sufría).
- **Fix**: `ServiceWorkerReload` ahora recuerda si la pestaña ya estaba controlada al montar (`navigator.serviceWorker.controller`); si no lo estaba, la primera toma de control se ignora. Solo se recarga cuando un SW nuevo reemplaza a uno existente — el caso real de deploy con la app abierta que motivó el componente.
- **Verificado**: con la config completa de producción (PWA + proxy), 4 clicks consecutivos entre vistas = 4 navegaciones suaves, URLs correctas, cero recargas, cero clicks perdidos (antes: el primer click causaba recarga y se perdía).
- **Nota para el teléfono**: si tras el deploy el flash persiste en un dispositivo, es el service worker *anterior* aún en control — cerrar todas las pestañas/la app de Copa Mental y volver a abrirla lo entrega al nuevo.

### Practicar mostraba 14 cartas en vez de las 12 del torneo, y el tablero podía requerir scroll

- **Causa 1**: el tamaño del tablero de práctica solo miraba torneos `activo`. Entre ciclos del torneo recurrente el torneo está `programado`, así que caía al default de 14 cartas. Ahora considera también el próximo `programado` (Competir sigue exigiendo uno `activo`).
- **Causa 2**: las cartas tenían ancho fijo por breakpoint; con más filas de las que caben en la pantalla, el tablero hacía scroll. Ahora el ancho de columna es `min(tamaño fijo, tamaño que hace caber todas las filas en el viewport)` — con pocas cartas se ven igual que siempre, con más cartas encogen lo justo para que el tablero completo entre sin scroll. También se amplió el padding vertical del grid para absorber el jitter decorativo (rotate/x/y) que asomaba ~9px y creaba un mini-scroll.
- **Verificado** (navegador real, 4 tamaños de pantalla: 430x900, 430x660, 360x640, 800x700): 12 cartas siempre, cero scroll en grid y en body, captura visual del tablero correcta.

Un segundo rebote (menor) que quedaba después del fix anterior: `PageTransition` usaba `AnimatePresence` con animación de salida. En App Router, `children` es el LayoutRouter — un elemento estable que siempre pinta la vista *actual* — así que el "clon saliente" renderizaba la vista nueva **duplicada**: dos páginas apiladas durante ~150ms, la altura del documento se duplicaba (medido: 900px → 2496px) y el layout saltaba en cada navegación. Se quitó `AnimatePresence`/exit y quedó solo el fade-in de entrada (sin animación en el primer render, para que el HTML del servidor llegue visible). Verificado: una sola vista montada en todo momento, navegación suave intacta.

### "This page couldn't load" al navegar entre vistas
El error más grave del último tramo: el navegador mostraba "This page couldn't load. Reload to try again, or go back." al cambiar de vista, de forma frecuente.

- **Causa raíz confirmada**: los canales de Supabase Realtime en Inicio, Ranking y Billetera usaban nombres fijos (ej. `home_profile_${userId}`). Si el usuario navegaba rápido entre vistas, un montaje nuevo del componente podía crear un canal con el mismo nombre que uno anterior aún no limpiado del todo, y el navegador lanzaba `Uncaught Error: cannot add postgres_changes callbacks ... after subscribe()` en bucle, dejando la página rota.
- **Causa adicional en Ranking**: su canal escuchaba la *vista* `tournament_rankings` en vez de una tabla real — Realtime (replicación lógica) solo funciona sobre tablas reales, nunca vistas.
- **Fix**: todos los canales ahora tienen un sufijo aleatorio único por montaje (`Math.random().toString(36).slice(2)`), y Ranking escucha la tabla real `games` en vez de la vista.
- **Confirmado por la usuaria**: "ya no sale el error de carga".

Refuerzos adicionales aplicados en paralelo (no se puede aislar al 100% cuál pesó más, pero todos quedaron):
- `src/proxy.js` (middleware) ahora tiene try/catch + timeout de 5s alrededor de la verificación de sesión, y falla "abierto" (deja pasar la navegación) si Supabase Auth no responde, en vez de romper la página.
- Se vació `workboxOptions.runtimeCaching` en `next.config.mjs` para que el service worker no sirva chunks JS desactualizados tras cada deploy.
- Se agregó `ServiceWorkerReload` (recarga la pestaña una vez cuando el service worker cambia de versión) y una página de fallback offline (`/~offline`).

### Vista `tournament_winners` daba 404
La migración que debía crear la vista de "ganadores de copas anteriores" nunca llegó a ejecutarse contra la base de datos real (a pesar de que una migración posterior asumía que sí). Se creó la migración `017_create_tournament_winners_view.sql`, autocontenida, que crea la vista, da los grants necesarios, habilita Realtime en `games` y fuerza el refresco del schema cache de PostgREST. Confirmada con una llamada REST directa (status 200).

### Tickets no se descontaban en partidas nuevas
Partidas `en_curso` "zombie" (abandonadas sin cerrar) se reutilizaban indefinidamente, permitiendo jugar gratis. Corregido con un corte fijo de 30 minutos (migraciones 012/013) para considerar una partida abandonada y cerrarla.

### Se perdía la partida en curso al ir a Inicio
Navegar a Inicio durante una partida activa la daba por perdida sin terminarla, dejando al jugador en 0 tickets sin haber jugado. Corregido revisando el estado del lado del servidor en vez de asumir en el cliente.

### Perfil no se actualizaba solo tras aprobar un pago
Si el admin aprobaba una recarga de tickets, el jugador tenía que recargar la página manualmente para ver el nuevo saldo. Se agregaron suscripciones Realtime a `profiles` y `tickets` en Inicio y Billetera para reflejar el cambio al instante.

## Funcionalidades nuevas

- **Pendientes con anomalías + rechazados** (2026-07-23, sin migración): en Transacciones → Compra de tickets → filtro **Pendientes** ahora también salen los **validando** y **rechazados** (con su motivo), y cada compra muestra etiquetas ⚠ + nota cuando el sistema detecta una anomalía: **Referencia repetida** (la misma referencia normalizada —ignorando mayúsculas/espacios/signos— aparece en otra solicitud; nota que lista las otras y avisa si una fue rechazada → posible pago duplicado o referencia reutilizada) y **Sin comprobante** (no adjuntó foto). Detección 100% del lado del cliente sobre los tickets (índice de todas las referencias). Limitación honesta: si la foto concuerda o no con el banco/referencia, y el banco emisor, NO se pueden autodetectar (el jugador solo ingresa la referencia; no hay OCR) → siguen siendo revisión manual, pero la referencia repetida y el comprobante quedan a la vista. Verificado end-to-end.
- **Un retiro a la vez** (2026-07-23, migración 026): el jugador no puede solicitar otro retiro mientras tenga uno en proceso; la sección de retirar se le re-habilita cuando soporte le aprueba (paga) el retiro. Enforced en la RPC `request_withdrawal` (servidor) y reflejado en la Billetera (input/botón deshabilitados + aviso). Verificado el bloqueo en pantalla.
- **Historial de recargas por usuario** (2026-07-23, sin migración): componente reutilizable `RecargasModal` que muestra las compras de tickets de un jugador (fecha, cantidad, monto, referencia, estado + resumen). Accesible desde **Transacciones** (botón "🧾 Recargas" en las filas de usuario de Compras, Premiados y Retiros) y desde **Interacción** (botón en el detalle del jugador). Verificado end-to-end.
- **Copiar datos de Pago Móvil** (2026-07-23, sin migración): botón "📋 Copiar datos" (`CopyPayoutButton`) junto a los datos de Pago Móvil del jugador en Transacciones (Premiados y Retiros), para pegarlos al hacer el pago. Copia nombre/banco/cédula/teléfono al portapapeles.
- **Chat — notas de voz, iniciar chat desde el admin, etiquetas y filtros** (2026-07-23, migración 024): (1) Notas de voz en el chat del jugador y del admin (componente `AudioRecorder` con `MediaRecorder`, tope 2 min; viajan como un adjunto más en el bucket `chat-attachments` y se reproducen con `<audio>`). (2) El admin puede buscar cualquier usuario (nombre/correo/cédula) e iniciarle una conversación (`chat_admin_start_conversation`); el primer mensaje de soporte le enciende la campana al jugador, aunque nunca hubiera abierto el chat (el `ChatWidget` se suscribe a la creación de su conversación). (3) Etiquetas por conversación — **pendiente / prioridad / resuelto** (`chat_admin_set_status`, default pendiente) — con filtros por etiqueta y un chip de color en cada chat. Verificado end-to-end: búsqueda, inicio de conversación, mensaje de soporte, cambio de etiqueta, filtro y campana del jugador.
- **Retiros — referencia + comprobante del pago** (2026-07-23, migración 025): al marcar un retiro como pagado, el admin guarda el número de referencia del Pago Móvil y (opcional) una captura del comprobante (bucket privado `withdrawal-proofs`; `mark_withdrawal_paid` ahora recibe referencia y ruta del comprobante). En la lista de "Pagados" se ven la referencia y un botón "Ver".
- **Transacciones — buscador/historial de referencias** (2026-07-23): nueva pestaña "🔎 Referencias" que junta los pagos **recibidos** (referencias de compras de tickets, ↓ Recibido) y los pagos **hechos** (referencias de retiros pagados, ↑ Pagado), con búsqueda por número de referencia y filtro por tipo. Verificado end-to-end.
- **Música de fondo durante la partida**: antes solo había efectos de sonido puntuales; ahora hay un loop musical (osciladores Web Audio) mientras `gameStatus === 'playing'`.
- **Botón de instalar la app (PWA)**: nuevo componente `InstallAppButton`, visible en login, registro y billetera, usando el evento `beforeinstallprompt`. Se generaron los íconos `icon-192x192.png` / `icon-512x512.png` que faltaban en el manifest.
- **Historial de ganadores de copas anteriores**: nueva sección en Ranking que agrupa por torneo los pagos de `tournament_winners`, mostrando medallas y montos.
- **Compresión de comprobantes de pago**: las imágenes de comprobante se comprimen en el navegador (canvas, máx. 1600px, JPEG calidad 0.75) antes de subirse, para no depender de que el usuario suba fotos pesadas.
- **Admin — Torneos**: los campos de fecha/hora/duración ahora son siempre visibles (antes solo si el estado era "programado"); se agregó cuenta regresiva (mismo componente que ya se usaba en Recurrencia) y un botón para eliminar un torneo, que antes no existía.
- **Color de acento**: se reemplazó el rosado (#EC4899) por el mismo azul/cian usado en Ranking, en toda la app.
- **Ícono de tickets**: se cambió el emoji 🎫 (que en algunos sistemas se renderiza como una entrada de concierto) por un ícono genérico de ticket.
- **Texto del botón "Jugar de nuevo"**: simplificado, ya no muestra el conteo de tickets restantes en el propio botón.

## Mejoras de rendimiento

- `supabase.auth.getSession()` (local) en vez de `getUser()` (siempre revalida por red) en las páginas que ya pasaron por el middleware, evitando una llamada de red redundante en cada navegación.
- Peticiones de perfil/tickets/torneo en paralelo (`Promise.all`) en vez de en cadena, en Inicio, Billetera y Ranking.
- Se quitó `AnimatePresence mode="wait"` de las transiciones de página, que forzaba a esperar a que la vista saliente terminara su animación antes de mostrar la entrante.

## Documentación

- `plan_del_proyecto.md` e `implementation_plan.md` actualizados con la lógica del torneo recurrente y la billetera de premios en USD (el esquema SQL original de esos documentos quedó desactualizado/superado por las migraciones reales).

## Carga instantánea de las vistas (implementado y pusheado; falta confirmar en producción)

**Motivación**: comparando con apps de compañeros, las vistas de Copa Mental mostraban un spinner ("Cargando billetera...", etc.) notorio al navegar, mientras que otras apps cargan sin ese hueco en blanco.

**Causa**: `home`, `billetera` y `ranking` (en `src/app/(player)/`) eran componentes `'use client'` que arrancaban vacíos y recién dentro de un `useEffect` pedían sesión y datos a Supabase desde el navegador. Fetch client-side clásico: shell vacío → JS hidrata → efecto corre → red → recién ahí se pinta contenido real.

**Solución aplicada** (el híbrido servidor + cliente):
- Cada `page.js` de las tres vistas es ahora un **Server Component**: crea el cliente de Supabase del servidor (`@/lib/supabase/server`), lee la sesión de las cookies con `getSession()` (sin viaje de red; el proxy ya validó con `getUser()` y RLS protege los datos), hace las queries en `Promise.all` **en el servidor** (Vercel ↔ Supabase, milisegundos) y entrega el HTML ya con los datos.
- La interactividad quedó en componentes cliente nuevos que reciben los datos iniciales por props: `home/HomeClient.js` (compra de tickets, tasa BCV, Realtime de perfil), `ranking/RankingClient.js` (Realtime sobre `games`, countdown, re-fetch en vivo), `billetera/BilleteraClient.js` (Realtime de perfil/tickets, eliminar cuenta). Ya no existe el estado `loading` ni el spinner de pantalla completa en ninguna de las tres.
- Las fechas formateadas con `toLocaleDateString` llevan `suppressHydrationWarning` (el formato de Node puede diferir en detalles mínimos del navegador).
- Se consultó la documentación real de Next 16 en `node_modules/next/dist/docs/` antes de elegir el patrón. Existe una alternativa nueva (`unstable_instant` + `cacheComponents`) pero requiere activar Cache Components en todo el proyecto y con datos por-usuario seguiría mostrando fallbacks — se descartó por invasiva.

**Verificación hecha** (local, build de producción): `npm run lint` y `npm run build` en verde (`/home`, `/ranking`, `/billetera` ahora son rutas dinámicas ƒ). Con una sesión real de jugador, el HTML de las tres vistas llega con nombre, saldo de tickets, historial de compras y ranking ya renderizados y sin los textos de spinner; sin sesión (o con cookie corrupta) las tres redirigen 307 a `/login`. La receta completa quedó en `.claude/skills/verify/SKILL.md`. Falta confirmar visualmente en producción tras el próximo deploy.

**También `/jugar` (Competir y Practicar, misma ruta con `?modo=practica`)**:
- La página es ahora Server Component: perfil y torneo activo se resuelven en el servidor, y en modo práctica el tablero inicial se genera también en el servidor (`generatePracticeBoard` en `gameLogic.js`) — **Practicar abre con las cartas ya pintadas en el HTML, sin spinner**. Se quitó `useSearchParams` del componente de juego (el modo llega como prop del servidor), eliminando el `<Suspense>` cuyo fallback era otro spinner.
- En modo Competir queda una única espera corta ("Preparando el juego..."): la llamada a `startGameAction`, que descuenta el ticket o retoma la partida en_curso pagada. Eso es **intencional y no debe moverse al servidor de la página**: Next pre-carga las páginas al ver los links, y si el cobro viviera en el render del servidor se podrían gastar tickets sin que el jugador toque "COMPETIR".
- Verificado igual que las otras vistas: `/jugar?modo=practica` responde el HTML con el tablero completo (cartas + cronómetro + contador de pares, sin texto de spinner) y del tamaño del torneo activo; `/jugar` responde con el estado de preparación esperado; ambas redirigen a `/login` sin sesión.

**Nota**: `credenciales.md` está desactualizado — las cuentas `admin@torneomental.com` / `jugador@torneomental.com` ya no existen en la base real.

### Resumen final de la sesión (2026-07-16)

Qué quedó y por qué, vista por vista:

- **Inicio, Ranking y Billetera**: abren con los datos ya renderizados en el HTML (nombre, saldo, historial, posiciones). Los spinners "Cargando...", "Cargando posiciones..." y "Cargando billetera..." desaparecieron por completo.
- **Practicar** (`/jugar?modo=practica`): abre **sin ninguna espera** — el servidor genera el tablero (temática al azar, mismo tamaño que el torneo activo; verificado: llegó con 12 cartas, igual que el torneo actual) y el HTML llega con las cartas, el cronómetro y el contador de pares ya pintados. Se eliminó incluso el spinner técnico del `<Suspense>` de `useSearchParams` — cero parpadeos.
- **Competir** (`/jugar`): perfil y torneo llegan resueltos del servidor; la única espera restante ("Preparando el juego...", <1s) es la llamada que registra la partida y descuenta el ticket (o retoma una en curso ya pagada). Esa espera **debe existir aunque los tickets ya estén confirmados a la vista**: es el servidor confirmando "esta partida existe, está pagada y este es tu tablero oficial" — lo que impide jugar gratis o manipular el tablero. Y **no puede moverse al render del servidor**: Next pre-carga las páginas al ver los links, y el prefetch gastaría tickets sin que el jugador toque COMPETIR. Quedó documentado en el código y en `.claude/skills/verify/SKILL.md` para que nunca se cambie por accidente.

**Verificación final: PASS** — build de producción local, sesión real de jugador: las 4 vistas responden 200 con su contenido server-renderizado; sin sesión (o cookie corrupta) todas redirigen a `/login`; `lint` y `build` en verde.

**Deploy**: pusheado a `master` en dos commits — `b144b97` (todo el trabajo de vistas + documentación) y `ffbbdf7` (imágenes de `img/` que estaban pendientes en la carpeta de trabajo). Vercel despliega automático desde GitHub. Pendiente: abrir copamental.com en el teléfono y confirmar que la navegación se siente instantánea, especialmente Practicar.

## Cronómetro del próximo torneo en Competir (2026-07-17)

Cuando no hay torneo activo, la pantalla de Competir mostraba solo "No hay torneo activo. Espera a que se inicie un torneo para jugar", mientras que Ranking sí mostraba el cronómetro de "El nuevo torneo inicia en:". Ahora Competir usa el mismo patrón: `jugar/page.js` (que ya consultaba los torneos `programado` para el tamaño del tablero de práctica) pasa el próximo torneo programado como prop `initialUpcomingTournament`, y `JugarClient` renderiza el `CountdownTimer` con el nombre del torneo en la pantalla de "sin torneo". Si no hay ni activo ni programado, se mantiene el mensaje genérico.

**Verificado** (build de producción local + navegador real con sesión de jugadora): `/jugar` sin torneo activo muestra "El nuevo torneo inicia en:" con el conteo avanzando en vivo y el nombre "Copa Mental"; el HTML sigue **sin** tablero (`cardGrid`) en Competir — el cobro del ticket sigue siendo acción del cliente. `lint` y `build` en verde.

## Aplicabilidad de los cambios del torneo recurrente (2026-07-17)

**Contexto**: en el modelo recurrente cada ciclo es una fila de `tournaments`, y al terminar un ciclo `finalize_recurring_tournament` clonaba esa fila tal cual para crear el siguiente. Consecuencia: guardar en Admin → Recurrencia aplicaba SIEMPRE al ciclo en curso y a los siguientes a la vez, sin poder separarlos. Estefania pidió poder elegir.

**Qué se hizo**:
- **Migración `018_recurring_apply_scope.sql`** (aplicada en producción el 2026-07-17): columna nueva `tournaments.next_cycle_settings` (jsonb) con la configuración destinada al próximo ciclo, y `finalize_recurring_tournament` ahora toma cada campo de ahí si está presente (si no, de la fila que termina). El ciclo nuevo nace con la columna en null.
- **Acción nueva `updateRecurringTournamentAction(id, data, applyTo)`** en `src/actions/tournaments.js`:
  - `ambos`: actualiza la fila y limpia `next_cycle_settings` (comportamiento de siempre).
  - `actual`: actualiza la fila, pero preserva en `next_cycle_settings` la configuración que ya estaba destinada a los siguientes (la pendiente si había, o la anterior de la fila).
  - `siguiente`: no toca la fila; guarda los valores como pendientes.
- **Pantalla Admin → Recurrencia**: selector "¿A qué se aplican los cambios?" con las 3 opciones (por defecto "Al torneo actual y a los siguientes"), mensaje de guardado específico por opción, y un aviso azul "Cambios pendientes para el siguiente ciclo: ..." (solo los campos que difieren del actual) mientras exista un pendiente.

**Verificado** (build de producción local + navegador real con la sesión admin, contra la base real, restaurando todo al terminar): "siguiente" deja la fila intacta y guarda el pendiente (el aviso azul aparece); "actual" actualiza la fila y preserva la config previa para los siguientes; "ambos" actualiza y limpia el pendiente. `lint` y `build` en verde.

**Dato útil descubierto en el camino**: la actualización que Estefania hizo antes de este cambio SÍ se aplicó al torneo en curso (duración 2880 min, 3 ganadores, $50/$30/$20) — el comportamiento viejo siempre fue "ambos".

## Dorsos nuevos de las cartas por temática (2026-07-20)

Estefania subió los dorsos nuevos (diseño de foto con la carta sobre un escritorio) a `public/images/cards/back_*.png`, pero el juego lee los dorsos de `public/cards/<tema>/back_<tema>.png` — por eso seguían viéndose los viejos. Además las fotos nuevas traían todo el entorno alrededor de la carta (escritorio, teclado), y el CSS del juego (`object-fit: cover`) solo recorta para llenar el marco 3:4, no sabe dónde está la carta dentro de la foto.

**Qué se hizo**: se recortó cada foto al borde físico de la carta (con un pequeño margen interno; en naturaleza hizo falta un segundo ajuste porque la carta estaba levemente inclinada y asomaba fondo gris por la derecha) y el resultado se guardó sobre `public/cards/tecnologia/back_tecnologia.png`, `public/cards/naturaleza/back_naturaleza.png` y `public/cards/animales/back_animales.png`, que son las rutas que usa `CARD_BACKS` en `src/lib/cardThemes.js`. Los originales sin recortar quedan intactos en `public/images/cards/` por si se necesitan de nuevo. No hubo cambios de código.

**Verificado** (servidor local + navegador real con sesión, tablero de Practicar): capturas de los 3 temas — tecnología (neón cian), naturaleza (marco verde) y animales (marco dorado sobre vinotinto) — 12 dorsos por tablero, cero imágenes rotas, nada del fondo de las fotos visible, esquinas redondeadas correctas.

## Fallo de pareja más contundente: sacudida y vibración más largas (2026-07-20)

Estefania pidió que al voltear dos cartas distintas los efectos duren más, para que el jugador sienta que equivocarse cuesta tiempo y debe concentrarse.

- **Sacudida de pantalla** (`shakeScreen` en `jugar.module.css`): de 0.4s a **0.9s**, con más oscilaciones y amplitud decreciente para que el final sea suave. Sigue respetando `prefers-reduced-motion`.
- **Vibración del teléfono** (`vibrateMismatch` en `src/lib/haptics.js`): de `[30,40,30]` (~0.1s) a `[80,60,80,60,120]` (~0.4s, tres pulsos con el último más largo).
- **Bloqueo del tablero** (`JugarClient.js`): tras el fallo, las cartas se voltean de nuevo y se libera el tablero a los **1000ms** (antes 700ms), alineado con el final de la sacudida — el error ahora cuesta ~0.3s más de reloj.

**Verificado** (navegador real, Practicar, espiando `navigator.vibrate` y la clase `shake` con MutationObserver): al voltear "Delfín" y "Tigre", la clase `shake` estuvo activa 905ms, la vibración pedida fue exactamente `[80,60,80,60,120]`, y 2.1s después del fallo no quedaba ninguna carta volteada (el tablero se libera bien).

## Mensaje rojo al fallar + efectos aún más fuertes (2026-07-20, segunda ronda)

Estefania notó que no salía ningún mensaje en rojo al fallar. Investigado en el historial: los letreros "¡GANASTE!"/"PERDISTE" del diseño original se quitaron en el rediseño visual (commit `9895fc3`), que dejó solo el popup dorado "+10 / Racha" para los aciertos — el mensaje de error llevaba semanas sin existir, no se perdió en el cambio de ayer.

- **Popup rojo nuevo al fallar**: "✗ ¡Concéntrate!" (rojo `--accent-red`, mismo mecanismo `ScorePopup` con variante `miss`, visible 1.2s; el dorado de acierto sigue igual).
- **Bug pre-existente corregido**: el popup salía descentrado (la animación de motion pisa `transform`, que era quien centraba con `translateX(-50%)`); ahora centra con `left/right: 0` + `text-align: center`. Con "+10" casi no se notaba; con el texto largo del rojo sí.
- **Sacudida más fuerte**: amplitud inicial de 9px → 16px (misma duración 0.9s, decae hasta 0).
- **Vibración más larga**: `[120,80,120,80,220]` (~0.62s en total).

**Verificado** (navegador real, Practicar): fallo → popup "✗ ¡Concéntrate!" en rojo centrado + shake 900ms + vibración `[120,80,120,80,220]`, tablero libre después; acierto → popup "+10" dorado centrado intacto.

**Nota para el teléfono**: si tras el deploy los efectos se sienten "viejos", es el service worker de la PWA sirviendo la versión anterior — cerrar TODAS las pestañas/la app de Copa Mental y volver a abrirla. Y en iPhone la vibración web no existe (limitación de Apple, ningún sitio web puede vibrar un iPhone): allí el fallo se comunica con la sacudida visual, el mensaje rojo y el sonido.

## Mensajes variados: secuencia al fallar y frases motivadoras al acertar (2026-07-20)

Estefania pidió que no fuera siempre el mismo mensaje: cada fallo debe traer uno distinto, y los aciertos frases motivadoras.

- **Fallos** (`MISS_MESSAGES` en `JugarClient.js`): secuencia de 5 mensajes que sube de tono con cada error de la partida y vuelve a empezar — "✗ ¡Ups! No era pareja" → "✗ ¡Concéntrate!" → "✗ ¡Fíjate bien dónde está cada carta!" → "✗ ¡Respira… y haz memoria!" → "✗ ¡Cada fallo te cuesta tiempo!". El contador (`missCountRef`) es por visita a la pantalla.
- **Aciertos** (`MATCH_MESSAGES`): 6 frases que rotan según cuántas parejas van — "+10 ¡Excelente!", "+10 ¡Muy bien!", "¡Qué memoria!", "¡Genial!", "¡Sigue así!", "¡Brillante!". Con racha se combinan: "+10 🔥 Racha x2 ¡Muy bien!".
- El popup ya no está limitado a una línea (`white-space: nowrap` → padding lateral): los mensajes largos se parten en dos líneas centradas en pantallas angostas en vez de salirse.

**Verificado** (navegador real 360px de ancho, Practicar): 2 fallos seguidos mostraron los 2 primeros mensajes en orden y en rojo; 2 aciertos mostraron "+10 ¡Excelente!" y "+10 🔥 Racha x2 ¡Muy bien!" en dorado; todos los popups dentro de la pantalla (rect medido), el de racha en dos líneas limpias.

**Ajuste posterior (mismo día)**: el mensaje rojo dura más para poder leerlo — 2s fijos en vez de 1.2s (con la animación de salida queda ~2.8s visible en total, medido en navegador real). El dorado de acierto sigue en 0.9s.

**Ajuste posterior 2 (mismo día)**: sacudida y vibración se repiten dos veces. La animación `shakeScreen` corre 2 ciclos (`animation: ... 2` → 1.8s, clase activa medida: 1805ms) y el patrón de vibración se duplica con una pausa de 260ms en medio (`[120,80,120,80,220,260,120,80,120,80,220]` ≈ 1.5s). El tablero se sigue liberando a los 1000ms — la segunda ronda de sacudida acompaña a las cartas volteándose de regreso, sin castigar con más tiempo de bloqueo.

## Validación automática de pagos + Transacciones del admin (2026-07-21)

Se integró la **Bank Automation API** (servicio de un tercero que lee los movimientos de la cuenta BDV receptora — ver `docs/api-validacion-pagos.md`) para aprobar solos los pagos de tickets, y se agregó toda la gestión de transacciones del lado del admin.

**Compra de tickets con validación automática:**
- Al enviar la solicitud, el modal muestra "Validando tu pago…" con spinner y luego cambia solo a **¡Pago aprobado!** (se suman los tickets al instante) o a **En revisión** si el banco todavía no refleja el pago. Nunca se auto-rechaza: si no encuentra el pago, queda pendiente para el admin.
- La validación corre en el servidor con la service-role key (`auto_approve_ticket`); la sesión del jugador nunca aprueba tickets. Compara **referencia + monto en Bs** (con tolerancia por redondeo; el sobrepago pasa, el pago corto se frena). Marca el pago como "usado" para que nadie reutilice la misma referencia.
- El monto en Bs se calcula en el servidor con la tasa BCV (`amount_ves`, `exchange_rate_used`), no se confía en el número del navegador.
- La referencia de pago ahora es **única**: un jugador no puede registrar dos veces el mismo número (salvo que la solicitud previa fuera rechazada). Si la repite, ve el aviso "Esa referencia ya fue registrada".
- Se subió el límite de tiempo de la ruta `/home` a 30s (`maxDuration`) porque validar contra el banco puede tardar unos segundos.

**Nueva pantalla "Transacciones" en el menú del admin** (reemplaza a "Tickets"), con dos filtros:
- **Compra de tickets**: todas las solicitudes con su estado (pendiente, validando, aprobado, rechazado) y de dónde salió la aprobación (automática o manual). El admin puede **aprobar o rechazar manualmente cualquier solicitud, sin importar lo que diga la API**. Rechazar una ya aprobada le descuenta los tickets (sin bajar de cero). Muestra referencia, monto en USD y Bs, y el comprobante adjunto para verificar que coincidan.
- **Jugadores premiados**: lista quiénes quedaron en posiciones premiadas de torneos finalizados, con sus **datos de Pago Móvil** para pagarles a mano. Si un jugador no cargó sus datos, sale marcado en naranja.

**Formulario de datos de cobro en la Billetera del jugador:** el jugador guarda su Nombre completo, Banco (lista de bancos venezolanos), Cédula y Teléfono para recibir premios. Esos datos son los que ve el admin en "Jugadores premiados".

**Paso manual pendiente:** hay que correr la migración `019_payment_validation_and_payouts.sql` en el SQL Editor de Supabase (agrega columnas, la referencia única y las funciones nuevas). Hasta que se corra, estas funciones no operan.

## Retiros de la billetera de premios (2026-07-21)

El jugador ahora puede retirar su dinero de premios y el admin gestiona los retiros.

**Lado del jugador (Billetera):** dentro de la tarjeta de Premios Ganados hay un campo para escribir cuánto retirar y un botón "Retirar".
- El botón solo se activa si el monto es mayor a cero y **menor o igual** al saldo disponible.
- Si escriben un monto mayor al saldo, aparece debajo del campo: "El monto sobrepasa el saldo de tu billetera".
- Al retirar, se descuenta el monto de la billetera al instante y sale un modal: **"Su retiro se hará efectivo en un plazo de 15 a 30 minutos."**
- Los retiros en proceso se muestran listados en la misma tarjeta.

**Lado del admin (Transacciones → nueva pestaña "Retiros"):** una fila por jugador con su estado:
- **"Quiere retirar $X"** — solicitó un retiro (aparecen primero); con botones "Pagado" (marca el retiro como pagado) y "Cancelar" (devuelve el monto a su billetera).
- **"En billetera aún sin retirar"** (etiqueta amarilla) — tiene saldo de premios sin retirar.
- **"Sin saldo pendiente"** — ganó pero ya no tiene saldo ni retiros en proceso.
- **"No ha ganado premio"** — nunca ganó.
Cada fila muestra los datos de Pago Móvil del jugador para pagarle. Filtros arriba para ver solo los que quieren retirar, los que tienen saldo, o los sin premio.

Descuento y devolución son atómicos en la base de datos (funciones `request_withdrawal`, `mark_withdrawal_paid`, `cancel_withdrawal`).

**Paso manual pendiente:** correr la migración `020_wallet_withdrawals.sql` en el SQL Editor de Supabase antes de desplegar.

## Navegación del jugador rediseñada (2026-07-21)

Se eliminó el menú inferior y se reorganizó la navegación.

- **Se quitó el menú inferior** de todas las pantallas del jugador.
- **Inicio**: debajo de "Practicar" se agregaron dos botones más pequeños y separados — **Ranking** y **Billetera**. A Competir se entra desde el botón grande de siempre. Se recuperó el espacio del menú para que todo entre sin scroll (verificado en 390×844 y 360×640).
- **Botón de volver al Inicio** en cada pantalla: flotante (círculo con icono de casa, arriba a la izquierda) en Juego y Ranking; en línea en el encabezado de Billetera ("🏠 Inicio").
- En la pantalla de juego el cronómetro bajó al borde inferior y el tablero recuperó ese espacio (sigue entrando sin scroll).

## Moderación de usuarios + sección Interacción (2026-07-21)

Requiere la migración `021_moderation_and_activity.sql` (columna `profiles.blocked`, RPC `admin_set_user_blocked`/`is_blocked`, tabla `activity_events`).

- **Usuarios registrados**: lupa de búsqueda (nombre, nombre completo, cédula, correo, WhatsApp) y columna **Acciones** con **Bloquear/Desbloquear** y **Eliminar**. Los bloqueados se marcan en rojo. No se puede bloquear/eliminar a un administrador ni a uno mismo (validado en el RPC y en la acción de servidor).
- **Transacciones**: botón **Bloquear** en cada bloque de jugador (Compra de tickets, Jugadores premiados, Retiros).
- **Bloqueo real**: el proxy saca a un usuario bloqueado de las pantallas del jugador hacia `/bloqueado` (pantalla "Cuenta bloqueada" con solo cerrar sesión); además `jugar`, `comprar tickets` y `retirar` lo rechazan vía `is_blocked()` (defensa en profundidad).
- **Nueva sección del menú: Interacción** 📈. Filtro por día/mes/año. Resumen del período (usuarios activos, jugaron, premios, retiros), **pantallas más visitadas** (barras) y **embudo** Inicio → Competir → Partida completada. Buscador de jugador con ficha de detalle: jugando ahora / jugó hoy, días jugados, partidas, premios, retiros, última actividad, **dónde dejó la app** y su **recorrido de hoy** + historial de pantallas.
- **Registro de navegación**: un `ActivityTracker` en el layout del jugador inserta un evento `screen_view` al cambiar de pantalla (RLS: cada quien solo inserta lo suyo; solo el admin lee). Se acumula desde el deploy en adelante; no hay historial previo. Los eventos de administradores se excluyen de las estadísticas.
- **Verificado** de punta a punta (dev + Supabase real, navegador automatizado con jugador de prueba): se registran las visitas (inicio/ranking/billetera), la página Interacción renderiza con datos reales, el bloqueo desde el panel escribe `blocked=true` y redirige al jugador a `/bloqueado`, y Eliminar borra la cuenta. Datos de prueba limpiados por cascada.
- Documentación: `docs/interaccion.md`.

## Modal de fin de partida simplificado + uniformidad de colores + sin partículas (2026-07-21)

- **Modal de fin de partida** (`GameResultModal`): el título ahora es **"¡Excelente jugada!"** (antes "Tablero completado"). Se quitaron el conteo de pares y la "Racha máxima"; lo único en grande es **el tiempo**. Botones: en **práctica** → *Practicar de nuevo* + *Volver a home*; en **competir** → *Jugar de nuevo* + *Ver ranking* si le quedan tickets, o *Comprar tickets* si no. Verificado completando una partida de práctica en navegador automatizado.
- **Efecto de partículas/burbujas eliminado** de todas las pantallas (`ParticleBackground` quitado de Inicio, Competir, Ranking, login y registro).
- **Uniformidad de colores**: Inicio usa la paleta del sistema (variables CSS: cian `#06B6D4`, verde `#10B981`, dorado `#F59E0B`, rojo `#EF4444`, violeta `#7c3aed`), pero el resto de pantallas y los modales tenían hardcodeada la paleta neón vieja (`#00f5ff`, `#39ff14`, `#ffd700`, `#ff6b9d`…) que desentonaba. Se reemplazó la paleta vieja por la nueva en todo `src` (CSS y JS: badges, confetti, `constants.js`, `themeColor`), dejando toda la app con los colores de Inicio. Verificado visualmente en Inicio, Ranking, Billetera, Interacción y el modal.

## Paleta de colores mejorada en toda la app (2026-07-21)

A pedido: hacer la app más atractiva visualmente, incluyendo Inicio.

- **Fondos más profundos** para dar más contraste y sensación premium: `--bg-primary` de `#0F172A` a `#0A0E1A`, `--bg-secondary` a `#141B2E`, tarjetas un poco más azuladas.
- **Acentos más vivos pero refinados** (nivel Tailwind "400", sin volver al neón chillón): cian `#06B6D4→#22D3EE` (color primario), violeta `#7c3aed→#A78BFA` (secundario), oro `#F59E0B→#FBBF24` (premios), verde `#10B981→#34D399`, naranja `#F97316→#FB923C`, rojo `#EF4444→#FB7185` (rosado, más moderno). Glows y `::selection` actualizados a juego.
- **Cómo**: se actualizaron las variables del sistema en `globals.css` y se barrió la paleta anterior hardcodeada (hex y `rgba`) en todo `src`, incluyendo fondos sueltos de un tema viejo (`#1a1a2e`, `#0a0a0f`, `#2a2a4a`). Toda la app referencia la misma paleta, así que futuros ajustes se hacen en un solo lugar.
- **Verificado** visualmente (navegador automatizado): Inicio, Ranking, Billetera, Interacción y el modal de fin de partida con la paleta nueva, coherentes entre sí.

## Cian reemplazado por violeta en toda la app (2026-07-22)

A pedido: "aún me parece un carnaval de colores, son pocas pantallas para usar tantos; reemplaza todo lo cian por violeta". La idea es tener **un solo color de marca (violeta)** y dejar los demás colores solo para funciones concretas (oro = premios, verde = éxito/pares, rojo = alerta).

- **Todo el cian pasó a violeta** (`#22D3EE → #A78BFA`, y su versión `rgba`). Como casi toda la app usaba el cian a través de la variable `--accent-cyan`, bastó apuntarla al violeta; los pocos lugares con el cian escrito directo (hex y `rgba`) se barrieron en todo `src`.
- **Usuarios**: el rol Admin queda en violeta (resalta) y el rol Jugador en gris neutro, para que sigan distinguiéndose sin sumar otro color.
- **Resultado**: la app queda en violeta + oro + grises, con verde/rojo solo como señales. Menos "carnaval", más identidad.
- **Verificado** visualmente (navegador automatizado): Inicio, Ranking, Billetera, Usuarios e Interacción — sin cian, coherentes.

## Ranking sin "EN VIVO", botón "Inicio" unificado y cronómetro grande (2026-07-22)

- **Ranking**: se quitó la etiqueta roja **"EN VIVO"** del encabezado.
- **Botón de volver al Inicio unificado**: Ranking usaba solo el icono de casa flotante en la esquina; Billetera usaba el icono + la palabra **"Inicio"**. Ahora Ranking usa el mismo componente que Billetera (icono + "Inicio"), ubicado arriba a la izquierda dentro del contenido.
- **Cronómetro más visible en el juego** (Competir y Practicar): el cronómetro fijo en la parte inferior de la pantalla de juego pasó de `0.85rem` a `1.25rem`, con un leve resplandor violeta, para que el tiempo se lea mejor sin ocupar demasiado. Se le quitó el icono de reloj; queda **solo el número**. (Nota: una primera versión a `1.9rem` quedó demasiado grande y molestaba, se ajustó a `1.25rem`.)
- **Verificado** visualmente (navegador automatizado): Ranking con el botón "Inicio" y sin "EN VIVO"; pantalla de juego con el cronómetro grande abajo.

## Reversos de cartas rediseñados en código (SVG), sin estilo místico (2026-07-22)

Los reversos (cartas boca abajo) tenían un borde **cian** que ya no combinaba con la app, y venían de imágenes PNG pesadas (hasta ~750 KB) de tamaños dispares. Se rediseñaron con un **concepto nuevo, oscuro y moderno** (no "tarot"): base oscura compartida, **un color de acento por temática**, patrón sutil y monograma "CM".

- **Nuevo componente `src/components/game/CardBack.js`**: dibuja el reverso **100% en código (SVG)**, según la temática:
  - **Tecnología** → violeta `#A78BFA` / índigo `#818CF8`, patrón de circuito.
  - **Naturaleza** → verde `#34D399` / `#4ADE80`, patrón de líneas topográficas.
  - **Animales** → naranja `#FB923C` / ámbar `#FBBF24`, malla low-poly de triángulos.
- **`Card.js`** ahora usa `<CardBack theme={card.theme} />` en lugar de `<Image>` con el PNG; se quitó el estado `backImageError` (ya no hay imagen que falle). El borde del `.cardBack` se volvió neutro para que el SVG mande en cada tema.
- **Ventajas**: nítido a cualquier resolución (no se pixela), pesa unos pocos KB (antes cientos de KB por carta → carga más rápida), y los colores salen de la misma paleta de la app.
- Los PNG anteriores (`public/cards/*/back_*.png`) y el mapa `CARD_BACKS` quedan **sin uso** (se pueden borrar más adelante).
- **Pendiente (aparte)**: los **frentes** de las cartas siguen siendo las ilustraciones PNG actuales; su rediseño multicolor es un trabajo separado.
- **Verificado** en el juego real (navegador automatizado): se cargaron partidas hasta ver las tres temáticas; los reversos se renderizan con su color, patrón y el "CM", sin cian.
- **Ajuste posterior (mismo día)**: se **quitaron las letras "CM"** de los reversos y se **subió la intensidad** de los patrones y nodos (antes se veían muy tenues). Ahora el protagonista es el patrón, bien visible.

## Vibración de fallo más suave en el juego (2026-07-22)

A pedido: al voltear dos cartas incorrectas (en Competir y Practicar) la vibración se sentía muy fuerte.

- **Dato clave**: el motor de vibración del teléfono solo enciende/apaga, **no regula la fuerza**. Para que se sienta más suave se usan **pulsos cortos** (toquecitos) con **pausas más largas**, en vez de zumbidos prolongados.
- **Cambio** en `src/lib/haptics.js` (`vibrateMismatch`): el patrón pasó de `[120,80,120,80,220,260,120,80,120,80,220]` a `[60,150,60,150,80,500,60,150,60,150,80]`.
- **Resultado**: la **duración total se mantiene en ~1.5s** (igual que antes, como se pidió), pero el tiempo que realmente vibra bajó de **920 ms a 400 ms** (~57% menos) → se siente notablemente más suave. Un solo cambio cubre Competir y Practicar (usan el mismo componente de juego).
- **Verificado** en el juego real (navegador automatizado): se interceptó `navigator.vibrate` al provocar un fallo; se confirmó el patrón nuevo y la duración total de 1500 ms.

## Temblor de pantalla al fallar: una sola vez y más suave (2026-07-22)

A pedido: al fallar, la pantalla temblaba **dos veces** y el movimiento mareaba. (La vibración del teléfono sí se deja repetida/larga; esto es solo el efecto visual.)

- **Una sola vez**: `.shake` en `src/app/(player)/jugar/jugar.module.css` pasó de `animation: shakeScreen 0.9s ease 2` (dos ciclos) a `shakeScreen 0.7s ease-in-out` (un solo ciclo). En `JugarClient.js` el temporizador que mantiene la clase bajó de `1800 ms` a `700 ms`.
- **Más suave**: el keyframe `shakeScreen` se rehízo con **menos amplitud** (pico de `16px` → `7px`) y **menos rebotes** (de 9 pasos rápidos a 3 vaivenes suaves), con curva `ease-in-out`.
- **Verificado** en el juego real (navegador automatizado): al provocar un fallo, la animación corre **1 sola iteración** (0.7s, ease-in-out), amplitud máxima **7px**, y la pantalla hace **un único movimiento** que vuelve a su sitio y se queda quieto (sin segundo temblor).

## Chat de atención al cliente (2026-07-22)

Nueva función: chat entre cada jugador y atención al cliente. **Requiere correr la migración `022_chat.sql` en Supabase antes de subir a producción.**

- **Jugador**: chat flotante (botón abajo a la derecha) en las pantallas de jugador (oculto dentro de una partida). Puede escribir, tocar **preguntas rápidas** y chatear en vivo. Una **campana roja** con el número de mensajes sin leer aparece sobre el ícono cuando soporte responde.
- **Admin**: nueva sección **Chat** en el menú lateral, con lista de conversaciones por jugador (con contador de no leídos), el hilo de mensajes, caja para responder, e historial guardado. Pestaña **Preguntas rápidas** para crear/editar/activar/ordenar/borrar las preguntas que ve el jugador.
- **Soporte = cuenta de administrador** (decisión de la dueña); **aviso = campana roja dentro de la app** (sin push del sistema).
- **Tiempo real**: los mensajes llegan al instante (Supabase Realtime) sin recargar. **Seguridad**: cada quien ve solo lo suyo (RLS); los mensajes se crean vía funciones `SECURITY DEFINER` para que no se pueda falsear el remitente.
- **Archivos**: `supabase/migrations/022_chat.sql`, `src/actions/chat.js`, `src/components/chat/ChatWidget.js` (+CSS, montado en el layout del jugador), `src/app/(admin)/admin/chat/page.js` (+CSS), enlace en `AdminSidebar.js`. Detalle en `docs/chat.md`.
- **Estado**: código listo y probado que la interfaz se renderiza (widget del jugador y panel del admin). Pendiente: correr la migración y verificar el flujo completo antes de subir a producción.

## Adjuntos en el chat, tickets desde admin, canje de saldo y ajustes de menú (2026-07-22)

Paquete grande. **Requiere correr la migración `023_chat_attachments_tickets.sql` en Supabase antes de subir a producción** (excepto los cambios de menú, que son solo de interfaz).

- **Adjuntar archivos en el chat** (jugador y admin): botón 📎 para enviar una imagen o PDF (máx. 5 MB). Se suben a un bucket privado `chat-attachments` con RLS (cada quien ve solo lo de su conversación; admin ve todo). Las imágenes se muestran en miniatura; los PDF como enlace. Componente `ChatAttachment` + `src/lib/chatUpload.js`.
- **Acciones del admin desde el chat**: en la cabecera de cada conversación, botones para **sumar/restar tickets** y **bloquear/desbloquear** al jugador, mostrando su saldo de tickets y estado.
- **Tickets +/- en Transacciones**: en "Compra de tickets", cada jugador tiene botones **＋/− Tickets** (además del de bloquear que ya existía).
- **Canjear saldo por tickets (Billetera)**: nueva tarjeta donde el jugador convierte su saldo de premios en tickets (**1 ticket = $1**). Si no tiene saldo, muestra "Aún no tienes saldo para canjear. ¡Gana el ranking para ganar premios!".
- **Menú del admin** (solo interfaz, sin migración): se **ocultó el botón "+ Nuevo Torneo"** en Torneos (basta con el torneo recurrente editable en su sección); "Torneos" pasó a llamarse **"Historial de Torneos"** y "Recurrencia" a **"Torneo recurrente"**.
- **Base de datos** (migración 023): columnas de adjunto en `chat_messages`; bucket `chat-attachments` + políticas; `chat_send_message`/`chat_admin_reply` aceptan adjunto; RPC `admin_adjust_tickets` (sumar/restar, no deja negativo); RPC `redeem_balance_for_tickets` (canje 1:1). Server actions en `src/actions/chat.js` y `src/actions/wallet.js`.
- **Estado**: código listo, lint limpio. Pendiente: correr la migración 023 y verificar el flujo completo antes de pushear.
