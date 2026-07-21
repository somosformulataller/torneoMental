# Sección "Interacción" (analítica de uso)

Documenta la sección **Interacción** del panel de administración: qué muestra,
de dónde salen los datos y cómo funciona el registro de navegación.
Corresponde a la migración `021_moderation_and_activity.sql`.

## ¿Para qué sirve?

Responder "¿cómo usan la app los jugadores?" para saber qué mejorar:
qué pantallas visitan, en qué parte del recorrido se caen, si juegan hoy,
qué días juegan, si ganan premios y si retiran.

## Cómo se recogen los datos

### 1. Navegación (nuevo)
- Un componente `ActivityTracker` (en el layout del jugador) registra un
  evento **`screen_view`** cada vez que el jugador cambia de pantalla
  (Inicio, Competir/Jugar, Ranking, Billetera).
- Se guardan en la tabla **`activity_events`** (`user_id`, `event_type`,
  `screen`, `path`, `metadata`, `created_at`).
- **Seguridad (RLS)**: cada usuario solo puede insertar filas suyas; solo un
  administrador puede leer la tabla. Un jugador no puede falsear la actividad
  de otro.
- **Importante**: este registro empieza a acumularse **desde que se publicó
  la funcionalidad en adelante**. No hay historial de navegación anterior.
- La actividad de los administradores se **excluye** de las estadísticas
  (para no inflar los números de jugadores reales).

### 2. Datos que ya existían (funcionan hacia atrás)
- **Partidas**: tabla `games` (jugó hoy, días jugados, activo jugando ahora).
- **Premios**: tabla `wallet_transactions`.
- **Retiros**: tabla `withdrawals`.

## Qué muestra la pantalla

Ruta: **Admin → Interacción** (`/admin/interaccion`).

### Filtro de fecha
Botones **Día / Mes / Año** + un selector de fecha. El resumen y las barras
se calculan sobre ese período.

### Resumen del período (tarjetas)
- **Usuarios activos**: cuántos jugadores entraron a la app.
- **Jugaron**: cuántos completaron al menos una partida (y total de partidas).
- **Premios entregados**: cantidad y monto.
- **Retiros**: cantidad y monto.

### Pantallas más visitadas
Barras con cuántas visitas tuvo cada pantalla (Inicio, Competir/Jugar,
Ranking, Billetera) en el período. Muestra dónde pasa el tiempo la gente.

### Recorrido hasta jugar (embudo)
Cuántos usuarios llegan a cada paso y el porcentaje respecto al primero:
1. **Entró al Inicio**
2. **Abrió Competir**
3. **Completó una partida**

La caída entre pasos indica dónde se pierde a la gente (p. ej. muchos entran
al Inicio pero pocos abren Competir → hay que hacer más visible/atractivo
Competir).

### Interacción por jugador
- **Lupa** para buscar un jugador por nombre, nombre completo o correo.
- Al seleccionarlo, su ficha muestra:
  - Etiquetas: **Jugando ahora** / **Jugó hoy** / **Bloqueado**.
  - **Días jugados**, **Partidas**, **Premios** (cantidad y monto),
    **Retiros pagados**.
  - Aviso si tiene retiros pendientes.
  - **Última actividad** (fecha/hora).
  - **Dónde dejó la app**: la última pantalla que vio (útil para saber en qué
    punto abandonó).
  - **Recorrido de hoy**: las pantallas que visitó hoy, en orden, con la hora.
  - **Últimas pantallas visitadas**: historial reciente.

## Notas técnicas
- La página es un componente de cliente que lee vía el cliente de Supabase
  (las políticas RLS permiten al admin leer todo).
- El resumen consulta `activity_events` acotado al período con un tope de
  20.000 eventos (si se supera, se avisa en pantalla). El detalle por jugador
  consulta solo las filas de ese jugador (tope 500), así se mantiene liviano.
- Archivos principales: `src/app/(admin)/admin/interaccion/page.js`,
  `src/lib/activity.js`, `src/components/ui/ActivityTracker.js`,
  `supabase/migrations/021_moderation_and_activity.sql`.
