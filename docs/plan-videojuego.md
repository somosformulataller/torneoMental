# Sensación de videojuego: arte real de cartas, sonido, HUD y partículas

## Contexto

El rediseño visual anterior dejó la app pulida (tilt 3D + brillo especular + flip con resorte en `Card.js`, confeti en victoria, tokens de diseño consistentes), pero para que **se sienta un videojuego** faltan dos cosas concretas que el usuario pidió:

1. **Arte real en las cartas**, no el placeholder de letra. Ya existen assets reales en `public/images/cards/` (carpeta plana, hoy completamente huérfana — ningún archivo del código la referencia) con **9 imágenes de tecnología** (`tech_cpu`, `tech_robot`, `tech_drone`, `tech_vr`, `tech_satellite`, `tech_smartwatch`, `tech_server`, `tech_chip`, `tech_rocket`) y **3 reversos temáticos** (`back_tecnologia.png`, `back_naturaleza.png`, `back_animales.png`), más 4 imágenes de naturaleza con naming distinto (`nature_leaf/lotus/oak/mountain` vs. el `nat_*` que espera `cardThemes.js`). `cardThemes.js` hoy define 20 entradas por tema apuntando a `/cards/<tema>/<id>.png`, una ruta que no existe — de ahí el placeholder.
   - Cómo se arma el tablero: `tournaments.card_count` (columna en BD, default **14**, mínimo 14, par) define cuántas cartas se reparten; `generateCardPairs()` en `src/lib/gameLogic.js` baraja `CARD_DATA[tema]` y toma las primeras `card_count/2` parejas. Esto encaja con lo pedido: **9 pares únicos por temática** en la librería de imágenes (variedad para que no sea siempre el mismo set), de los cuales el juego reparte por defecto **7 parejas = 14 cartas** en el tablero (el `card_count` default ya es 14 — no hay que tocar la BD).
   - Faltan por generar: **5 imágenes de naturaleza** (ya hay 4 de 9) y **9 de animales** (hay 0 de 9) — 14 imágenes nuevas en total, con el mismo estilo visual de las 9 de tecnología ya existentes para que el mazo se vea consistente.
2. **Capa de feedback de videojuego** (sonido, háptica, HUD de racha/puntaje, partículas de fondo, transiciones de pantalla) — hoy no existe nada de esto.

Restricción del usuario: **cero costo**, solo herramientas/librerías gratuitas.

## Herramientas gratuitas a incluir

- **Web Audio API nativa (sin librería)**: SFX sintetizados por osciladores (`OscillatorNode`+`GainNode`), estilo chiptune 8-bit — cero dependencias, cero licencias de audio que buscar.
- **`navigator.vibrate` nativo** — háptica en móvil, feature-detected.
- **`@tsparticles/react` + `@tsparticles/slim`** (npm, MIT) — fondo de partículas sutil.
- **`motion`** (ya instalado) — transiciones de pantalla, HUD animado, popups flotantes, shake.
- **`canvas-confetti`** (ya instalado) — tiers de celebración.
- **Google Fonts gratis**: `Orbitron` para HUD (puntaje/racha/temporizador).

## Fases de implementación

### Fase 1 — Arte real de las cartas (prioridad, es la base visual)
- **Reorganizar assets existentes**: copiar/renombrar de `public/images/cards/` a la estructura que espera `cardThemes.js`:
  - `public/cards/tecnologia/tech_{cpu,robot,drone,vr,satellite,smartwatch,server,chip,rocket}.png` (los 9 ya existentes, solo se mueven).
  - `public/cards/naturaleza/nat_{leaf,lotus,oak,mountain}.png` (renombrando `nature_*` → `nat_*`, coincidiendo con la convención de `cardThemes.js`).
- **Reescribir `src/lib/cardThemes.js`**: cada tema pasa de 20 entradas a exactamente **9**, usando los ids/nombres reales ya existentes para tecnología y naturaleza (4 de 9), dejando los 5 de naturaleza y 9 de animales restantes apuntando a las rutas donde irán las imágenes nuevas.
- **Kit de prompts de arte para las 14 imágenes faltantes** (`docs/card-art-prompts.md`, actualizado): antes de escribir los prompts, se inspeccionan 1-2 imágenes `tech_*` existentes para describir con precisión el estilo (iluminación, paleta, ángulo, fondo) y que las nuevas combinen sin desentonar. Un prompt base + 14 variaciones (5 naturaleza + 9 animales), especificando salida exacta `public/cards/<tema>/<id>.png`, fondo transparente, misma resolución que las existentes.
- **Wiring del reverso temático**: hoy `Card.js` dibuja el reverso con CSS puro (texto "TM"). Se cambia para mostrar `back_tecnologia.png`/`back_naturaleza.png`/`back_animales.png` según el tema del torneo (requiere pasar el `theme` del torneo hasta `Card.js`, ya disponible en `jugar/page.js` vía `tourn.card_theme`/`theme` resuelto). El diseño CSS actual del reverso se conserva como *fallback* si la imagen no carga.
- **Robustez menor**: en `generateCardPairs()` (`src/lib/gameLogic.js`), acotar `pairCount` a `Math.min(pairCount, themeCards.length)` — con 9 imágenes por tema en vez de 20, un torneo mal configurado con `card_count` alto ahora sí podría pedir más parejas de las que existen; hoy no hay guarda para eso.

### Fase 2 — Motor de sonido y háptica (utilidades base)
- `src/lib/sfx.js`: audio sintetizado, lazy-init de `AudioContext` en el primer gesto del usuario. Funciones `playFlip()`, `playMatch()`, `playMismatch()`, `playVictory()`, `playClick()`, `playTick()`. Mute persistido en `localStorage`.
- `src/lib/haptics.js`: wrapper de `navigator.vibrate` con feature detection (`vibrateMatch()`, `vibrateMismatch()`, `vibrateVictory()`).
- `src/components/ui/SoundToggle.js` (+ css): botón flotante 🔊/🔇.

### Fase 3 — HUD y "juice" en el juego
- Contador de **racha** (aciertos consecutivos) en `jugar/page.js` (hoy no existe, solo pares encontrados) — se resetea en cada fallo.
- HUD con `Orbitron`, count-up animado (`motion`) al subir puntaje/racha.
- Popup flotante "+10 🔥 Racha x3" sobre el tablero al acertar.
- Shake sutil de pantalla al fallar.
- `Card.js`: `playFlip()`/`playMatch()`+`vibrateMatch()`/`playMismatch()`+`vibrateMismatch()` en cada evento.
- Barra de tiempo del torneo restilizada como barra de energía (verde→dorado→rojo), `playTick()` en los últimos segundos.

### Fase 4 — Celebración por tiers (`GameResultModal.js`)
- `playVictory()` + `vibrateVictory()` sincronizados con el confeti existente.
- Intensidad del confeti/sonido escalada según la racha máxima alcanzada.

### Fase 5 — Atmósfera de fondo y transiciones de pantalla
- `src/components/ui/ParticleBackground.js` (`@tsparticles/slim`, paleta dorado/violeta, densidad baja, respeta `prefers-reduced-motion`) en `home`, `jugar`, `ranking`.
- Transiciones de pantalla con `motion` `AnimatePresence` entre rutas de `(player)`.

### Fase 6 — Tipografía HUD y accesibilidad
- `Orbitron` en el `@import` de `globals.css`, token `--font-display`, solo para HUD.
- `prefers-reduced-motion` desactiva shake/partículas/stagger agresivo.

### Fase 7 — Verificación
- `npm run dev` (webpack): `/jugar` con las 9 cartas reales de tecnología visibles (y naturaleza/animales una vez generadas las imágenes faltantes), reverso temático, sonido/háptica/racha/popup/shake/barra de energía, `/home` y `/ranking` con partículas y transición de pantalla, victoria con confeti+sonido+háptica combinados, mute persistente.
- `npm run lint` y `npm run build` (webpack).

## Archivos principales a tocar
- `public/cards/tecnologia/`, `public/cards/naturaleza/` — mover/renombrar assets existentes desde `public/images/cards/`
- `src/lib/cardThemes.js` — reducir a 9 entradas por tema con ids reales
- `src/lib/gameLogic.js` — clamp de `pairCount` a las imágenes disponibles
- `src/components/game/Card.js` — reverso temático con imagen real + hooks de sonido/háptica
- Nuevo/actualizado: `docs/card-art-prompts.md` — 14 prompts (5 naturaleza + 9 animales) con estilo calcado de las imágenes tech existentes
- Nuevo: `src/lib/sfx.js`, `src/lib/haptics.js`
- Nuevo: `src/components/ui/SoundToggle.js` (+ css), `src/components/ui/ParticleBackground.js`
- Nuevo: `src/components/game/ScorePopup.js` (+ css)
- `src/app/(player)/jugar/page.js` — racha, HUD, shake, barra de energía, `ParticleBackground`
- `src/components/game/GameResultModal.js` — sonido/háptica de victoria, tiers de confeti
- `src/app/(player)/home/page.js`, `ranking/page.js` — `ParticleBackground`
- `src/app/(player)/layout.js` — `AnimatePresence`, `SoundToggle` global
- `src/app/globals.css` — fuente `Orbitron`, token `--font-display`, keyframe de shake, media query `prefers-reduced-motion`
- `package.json` — agregar `@tsparticles/react`, `@tsparticles/slim`

## Verificación
Recorrido manual en navegador de cada pantalla listada en la Fase 7, más `npm run lint` y `npm run build`. Las 14 imágenes de naturaleza/animales faltantes quedan como tarea del usuario (generarlas con el prompt kit) — el código queda listo para tomarlas en cuanto existan en `public/cards/<tema>/`.
