# Actualizaciones Recientes y Bugs Resueltos

Registro de los cambios más recientes hechos en Copa Mental (producción: copamental.com). Complementa a `plan_del_proyecto.md` e `implementation_plan.md`, que documentan el diseño general del producto.

## Bugs resueltos

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

## Carga instantánea de las vistas (implementado, pendiente de deploy)

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
