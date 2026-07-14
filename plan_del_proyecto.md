# Copa Mental - Plan del Proyecto

## 1. Visión General del Producto
**Copa Mental** es una aplicación web progresiva (PWA) de juego de memoria competitivo basado en torneos. Los jugadores invierten "tickets" (comprados previamente) para participar en torneos activos y el objetivo es encontrar todos los pares de cartas correspondientes en el menor tiempo posible y sin equivocarse. La racha más larga sin fallos determina el ranking de los jugadores para llevarse la victoria.

## 2. Pila Tecnológica (Tech Stack)
- **Frontend Framework:** Next.js 15 (App Router)
- **Lenguaje:** JavaScript / React
- **Estilos:** Vanilla CSS (CSS Modules) con sistema de diseño premium, tema oscuro, acentos en neón y animaciones (glassmorphism).
- **Backend / Base de Datos:** Supabase (PostgreSQL, Auth, Realtime)
- **Despliegue (Deploy):** Vercel
- **Características adicionales:** Progressive Web App (PWA) habilitada mediante `@ducanh2912/next-pwa` para permitir la instalación en dispositivos móviles y uso offline.

## 3. Arquitectura de Supabase (Base de Datos)
La base de datos utiliza PostgreSQL con políticas de seguridad (RLS) estrictas para proteger los datos:
1. **profiles:** Extiende de `auth.users`. Guarda nombre, apellido, email, whatsapp, cédula, saldo de tickets (`tickets_balance`) y rol (`admin` o `player`).
2. **tournaments:** Almacena los torneos creados por los administradores. Campos como nombre, fecha de inicio, duración, estado, temática de cartas y cantidad de cartas por tablero.
3. **tickets:** Historial de recargas de tickets solicitadas por los jugadores. Requiere que un admin apruebe el estado (`payment_status = 'aprobado'`) para acreditar el saldo.
4. **games:** Registra la sesión de juego consumiendo 1 ticket. Almacena la `best_streak` (mejor racha), el tiempo total de la partida y el ID del torneo activo.

**Vistas y Realtime:**
- **tournament_rankings (SQL View):** Clasifica a los jugadores en base a su mejor racha (`MAX(best_streak)`) en el menor tiempo. Esta tabla es vigilada por **Supabase Realtime** para actualizar la tabla de posiciones en la app instantáneamente.

## 4. Flujo de Experiencia del Usuario (UX)

### 4.1. Módulo de Autenticación
- **Registro:** El usuario provee sus datos: Nombre, apellido, correo, whatsapp, cédula venezolana, y contraseña (2 veces). Se crea el perfil automáticamente mediante un Trigger SQL en la base de datos.
- **Login:** Autenticación protegida y segura. Redirige a `/home` (si es jugador) o a `/admin` (si es el dueño de la plataforma).

### 4.2. Módulo de Jugador
- **Inicio (Home):** Panel principal donde se ve la tarjeta de Tickets y Dinero Equivalente. Se muestra un temporizador hacia el inicio del próximo torneo o el botón parpadeante para Jugar si el torneo está en curso.
- **Juego (Game):**
  - Al presionar jugar, se descuenta 1 ticket.
  - La pantalla carga el tablero de cartas basado en el torneo (Naturaleza, Tecnología, Animales, o Aleatorio).
  - El jugador voltea 2 cartas: si coinciden, se suma **+1 a la racha**. Si fallan, el juego **termina**.
  - Si logran completar todo el tablero sin fallar, el tablero se renueva con una nueva temática instantáneamente, permitiéndoles seguir sumando rachas.
- **Billetera:** Permite consultar los tickets actuales y ver un historial de compras/solicitudes de recarga pasadas.
- **Ranking:** Una tabla en vivo mostrando el Top 50 del torneo actual con medallas especiales para los tres primeros lugares.

### 4.3. Módulo de Administrador
- **Dashboard:** Resumen en tarjetas: Total de Usuarios, Torneos creados, Tickets Vendidos, e Ingresos en dólares.
- **Torneos:** CRUD (Crear, Editar, Leer). El admin decide cuántas cartas se usan, cuánto dura el torneo, la temática de las imágenes y la fecha de arranque.
- **Gestión de Tickets:** Vista que muestra las referencias bancarias enviadas por los usuarios. El admin puede **aprobar** (lo que suma automáticamente los tickets al usuario) o **rechazar** (dejando una nota aclaratoria).
- **Usuarios:** Listado completo de la base de datos de jugadores, viendo su información de contacto (WhatsApp) y saldo activo.

## 5. Diseño y Estética Visual
- **Colores Principales:** Background oscuro profundo (`#0a0a0f`, `#12121c`). Tarjetas usando transparencia de cristal (`rgba`, `backdrop-filter: blur()`).
- **Acentos:** Cyan Neón (`#00f5ff`), Verde Neón (`#39ff14`) para victorias/rachas, Rojo (`#ff3860`) para peligro/perder.
- **Animaciones:** Se implementaron animaciones avanzadas:
  - Rotación 3D para voltear las cartas (`rotateY(180deg)`).
  - Flash de peligro en el reloj durante el último minuto (`flashDanger`).
  - Efectos visuales al hacer Match (pulsaciones) y al errar (temblor en las cartas).
  - Indicador de estado "En Vivo" simulando una grabación (`pulse`).
- **Tipografía:** Tipografías importadas modernas sin serifas como `Outfit` y monoespaciadas para los marcadores como `JetBrains Mono`.

## 6. Siguientes Pasos
- Completar las variables de entorno de Supabase en `.env.local`.
- Ejecutar el script `supabase_schema.sql` en la consola SQL de Supabase.
- Generar e incorporar las imágenes restantes de las temáticas faltantes (Animales, Naturaleza, etc) en `/public/images/themes/`.
- Conectar la plataforma Vercel con el repositorio de GitHub para obtener la URL en vivo.
