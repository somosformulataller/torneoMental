# Chat de atención al cliente

Documenta la función de **chat** entre cada jugador y atención al cliente.
Corresponde a la migración `022_chat.sql`.

## ¿Qué hace?

- El **jugador** ve un **chat flotante** (botón abajo a la derecha) en las
  pantallas de jugador (no aparece dentro de una partida, `/jugar`). Desde ahí
  puede escribir sus dudas, tocar **preguntas rápidas** y chatear en vivo.
- **Atención al cliente** responde desde el panel de administración →
  sección **Chat**. (El compañero de soporte usa una cuenta de administrador.)
- Cuando soporte responde, al jugador le aparece una **campana roja** con el
  número de mensajes sin leer sobre el ícono del chat.
- Se guarda el **historial** completo de cada conversación, visible en ambos
  lados.
- Las **preguntas rápidas** son **editables por el admin** (pestaña "Preguntas
  rápidas" dentro de la sección Chat).

## Base de datos (migración 022)

- **`chat_conversations`**: una conversación por jugador (`user_id` único).
  Guarda `last_message_at` y hasta cuándo leyó cada lado
  (`player_last_read_at`, `admin_last_read_at`) para calcular los no leídos.
- **`chat_messages`**: cada mensaje, con `sender` = `'player'` o `'support'`.
- **`chat_quick_questions`**: preguntas rápidas (`text`, `sort_order`,
  `active`). Trae 5 por defecto.

### Seguridad (RLS)
- El jugador solo ve **su** conversación y sus mensajes; el admin ve **todo**.
- Los mensajes se crean **solo vía funciones** (RPC) `SECURITY DEFINER`, así el
  remitente (`player`/`support`) **no se puede falsear** desde el navegador.
- Preguntas rápidas: todos ven las activas; solo el admin las edita.

### Funciones (RPC)
- `chat_send_message(body)` — jugador envía (crea su conversación la 1ª vez).
- `chat_admin_reply(conversation_id, body)` — soporte responde.
- `chat_player_mark_read()` / `chat_admin_mark_read(conversation_id)` — marcar
  leído (limpia el contador de no leídos del lado correspondiente).
- `chat_player_unread()` — nº de respuestas sin leer (para la campana roja).
- `chat_admin_conversations()` — lista de conversaciones para el admin, con
  datos del jugador, último mensaje y nº de mensajes sin leer.

### Realtime
Las tablas `chat_messages` y `chat_conversations` se agregan a la publicación
`supabase_realtime`, para que los mensajes lleguen **al instante** sin recargar.

## Archivos principales
- Migración: `supabase/migrations/022_chat.sql`.
- Acciones (escrituras): `src/actions/chat.js`.
- Widget del jugador: `src/components/chat/ChatWidget.js` (+ CSS). Montado en
  `src/app/(player)/layout.js`.
- Panel del admin: `src/app/(admin)/admin/chat/page.js` (+ CSS). Enlace en
  `src/components/layout/AdminSidebar.js`.

## Notas / posibles mejoras futuras
- **Aviso**: hoy la campana roja funciona mientras el jugador tiene la app
  abierta. No hay notificación push del sistema (se descartó para no pedir
  permisos ni sumar configuración).
- El historial no se borra solo; si en el futuro crece mucho se podría archivar.
