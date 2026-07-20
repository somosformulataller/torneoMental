# Actualizaciones Recientes y Bugs Resueltos

Registro de los cambios más recientes hechos en Copa Mental (producción: copamental.com). Complementa a `plan_del_proyecto.md` e `implementation_plan.md`, que documentan el diseño general del producto.

## Bugs resueltos

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
