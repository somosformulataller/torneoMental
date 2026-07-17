---
name: verify
description: Cómo compilar, levantar y verificar Copa Mental de punta a punta (SSR con sesión real de Supabase) sin navegador.
---

# Verificar Copa Mental

## Build y arranque

```
npm run lint          # eslint; hay 4 warnings preexistentes (admin/tickets, admin/torneos, jugar, HomeClient <img>)
npm run build         # next build --webpack; usa .env.local
npm run start         # servidor de producción en http://localhost:3000
```

Detener el servidor antes de rebuildeaar (`.next` queda bloqueado en Windows).

## Conseguir una sesión de jugador (sin navegador)

- `credenciales.md` está **desactualizado**: `jugador@torneomental.com` ya no existe en la base real.
- Node local es v20: **no** usar `createClient` de `@supabase/supabase-js` en scripts (su Realtime explota por falta de WebSocket nativo). Usar `fetch` contra la API REST.
- Receta que funciona (todo con valores de `.env.local`):
  1. Listar usuarios: `GET {URL}/auth/v1/admin/users` con `apikey`/`authorization: Bearer {SUPABASE_SECRET_KEY}`.
  2. `POST {URL}/auth/v1/admin/generate_link` body `{type:'magiclink', email}` (service key) → `hashed_token`. No cambia contraseñas ni datos.
  3. `POST {URL}/auth/v1/verify` body `{type:'magiclink', token_hash}` (anon key) → sesión JSON.
  4. Cookie que espera `@supabase/ssr`: `sb-<projectref>-auth-token` = `base64-` + base64url(JSON de la sesión), en trozos de 3180 chars como `.0`, `.1`, ... si no cabe en uno.

## Qué comprobar

- `GET /home`, `/ranking`, `/billetera` con la cookie → 200 y el HTML debe traer los datos ya renderizados (nombre, saldo, historial) y **no** los textos de spinner ("Cargando...", "Cargando posiciones...", "Cargando billetera...").
- `GET /jugar?modo=practica` con cookie → 200 y el HTML trae el tablero (`cardGrid`, cronómetro ⏱, contador 🃏 0/N) **sin** "Preparando el juego...". N debe ser card_count del torneo activo / 2 (o 7 pares si no hay torneo).
- `GET /jugar` (Competir) con cookie → 200 **con** "Preparando el juego..." y **sin** `cardGrid`: correcto y deliberado — el tablero pagado solo puede venir de `startGameAction` (cliente); si aparece un tablero en este HTML, alguien movió el cobro al servidor y el prefetch de Next podría gastar tickets solo.
- Sin cookie → 307 a `/login` (proxy). Cookie corrupta → 307 a `/login`, nunca página rota.
- El flip jugador/admin y el juego en sí requieren navegador; no hay harness para eso.

## Verificación con navegador real (hidratación, navegación, service worker)

Para lo que el HTML no muestra (hidratación, navegación suave, SW): `npm install puppeteer-core --prefix <scratchpad>` (liviano, sin descargar navegador) y lanzar con `executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'`, `headless: 'new'`. Cookie de sesión con `page.setCookie({domain: 'localhost'})`.

- **Soft vs hard navigation** (la prueba definitiva): `page.evaluate(() => { window.__marker = 123 })` antes del click; si tras el click el marker sigue siendo 123 → navegación suave; si es `undefined` → recarga completa. NO fiarse de `framenavigated` de Puppeteer: también dispara en navegaciones same-document (pushState) y da falsos positivos.
- Las peticiones RSC (`?_rsc=`) con status 200 seguidas de `net::ERR_ABORTED` + recarga = el router descartó la respuesta e hizo fallback MPA (ver `fetch-server-response.js` de next para las causas: content-type, buildId/deployment-id, árbol raíz).
- El SW se instala en el primer load y (con clientsClaim) toma control ~1-3s después — dejar `setTimeout(3000)` tras el goto inicial antes de medir clicks, o el resultado mezcla la fase de instalación.
