# Kit de prompts — arte de cartas (IA)

Este documento tiene los 60 prompts listos para generar las imágenes de las cartas del juego de memoria. Cada carta debe generarse por separado (una imagen por prompt) para máxima calidad y consistencia.

No genero las imágenes yo mismo — este es el kit para que las produzcas con la herramienta que prefieras: **Bing Image Creator / Microsoft Copilot** (gratis, con límites diarios), **ChatGPT/DALL·E**, **Midjourney** o **Stable Diffusion** (de pago o autoalojado). El mismo prompt base funciona en cualquiera de ellas.

## Especificación de salida (obligatoria para que la app las reconozca)

- **Formato**: PNG con **fondo transparente**.
- **Resolución mínima**: 512×512 px (cuadrada). Si la herramienta no genera fondo transparente nativo, quita el fondo después con una herramienta gratuita como remove.bg o el editor de Bing.
- **Ruta y nombre de archivo**: deben coincidir EXACTO con lo ya definido en `src/lib/cardThemes.js`. Guarda cada imagen en:
  ```
  public/cards/<tema>/<id>.png
  ```
  Ejemplo: la carta "Laptop" del tema tecnología va en `public/cards/tecnologia/tech_laptop.png`.
- Mientras una imagen no exista, la app muestra automáticamente un placeholder con la inicial del nombre — no rompe nada, así que puedes ir subiendo las 60 de a poco.

## Prompt base (estilo consistente para las 60 cartas)

Usa esta plantilla, reemplazando `[SUJETO]` por el sujeto de cada carta (ver listas abajo). Mantén el resto del texto igual en las 60 generaciones para que todas las cartas se vean como parte del mismo mazo.

```
Icono aislado de [SUJETO], estilo isométrico neón-glass, iluminación de borde
cian (#00f5ff) y verde neón (#39ff14), fondo completamente transparente,
composición centrada, sin texto, sin marco, sin sombra proyectada en el
suelo, alto contraste, superficies pulidas tipo cristal oscuro con brillos
de neón, look futurista premium, renderizado 3D limpio tipo videojuego,
diseño simétrico, 512x512, PNG con fondo transparente.
```

En inglés (mejor resultado en la mayoría de herramientas):

```
Isolated icon of a [SUBJECT], isometric neon-glass style, cyan (#00f5ff)
and neon green (#39ff14) rim lighting, fully transparent background,
centered composition, no text, no frame, no ground shadow, high contrast,
dark glass surfaces with neon glow accents, premium futuristic look, clean
3D game-icon render, symmetrical design, 512x512, transparent PNG.
```

## Tema: Tecnología (`public/cards/tecnologia/`)

| Archivo | Sujeto a reemplazar |
|---|---|
| tech_laptop.png | a laptop computer |
| tech_smartphone.png | a smartphone |
| tech_cpu.png | a computer CPU chip |
| tech_robot.png | a small robot |
| tech_drone.png | a flying drone |
| tech_vr.png | a VR headset |
| tech_satellite.png | a satellite |
| tech_smartwatch.png | a smartwatch |
| tech_server.png | a server rack |
| tech_chip.png | a microchip |
| tech_rocket.png | a rocket ship |
| tech_hologram.png | a floating hologram projection |
| tech_ai_brain.png | a glowing artificial-intelligence brain |
| tech_circuit.png | a circuit board pattern icon |
| tech_antenna.png | a signal antenna |
| tech_camera.png | a digital camera |
| tech_printer3d.png | a 3D printer |
| tech_code.png | a floating code/brackets symbol |
| tech_gamepad.png | a game controller |
| tech_headphones.png | over-ear headphones |

## Tema: Naturaleza (`public/cards/naturaleza/`)

| Archivo | Sujeto a reemplazar |
|---|---|
| nat_leaf.png | a single leaf |
| nat_lotus.png | a lotus flower |
| nat_oak.png | an oak tree |
| nat_mountain.png | a mountain peak |
| nat_river.png | a winding river |
| nat_sun.png | a sun |
| nat_butterfly.png | a butterfly |
| nat_cloud.png | a cloud |
| nat_waterfall.png | a waterfall |
| nat_cactus.png | a cactus |
| nat_coral.png | a coral reef branch |
| nat_moss.png | a patch of moss |
| nat_waterdrop.png | a water droplet |
| nat_moon.png | a crescent moon |
| nat_volcano.png | a volcano |
| nat_rainbow.png | a rainbow |
| nat_star.png | a shining star |
| nat_crystal.png | a crystal gem |
| nat_mushroom.png | a mushroom |
| nat_feather.png | a feather |

## Tema: Animales (`public/cards/animales/`)

| Archivo | Sujeto a reemplazar |
|---|---|
| anim_lion.png | a lion head |
| anim_eagle.png | an eagle |
| anim_dolphin.png | a dolphin |
| anim_fox.png | a fox |
| anim_owl.png | an owl |
| anim_wolf.png | a wolf head |
| anim_turtle.png | a turtle |
| anim_hummingbird.png | a hummingbird |
| anim_tiger.png | a tiger head |
| anim_bear.png | a bear |
| anim_snake.png | a coiled snake |
| anim_horse.png | a horse head |
| anim_panda.png | a panda |
| anim_elephant.png | an elephant |
| anim_shark.png | a shark |
| anim_chameleon.png | a chameleon |
| anim_penguin.png | a penguin |
| anim_octopus.png | an octopus |
| anim_phoenix.png | a mythical phoenix bird |
| anim_parrot.png | a parrot |

## Reverso de carta (opcional)

El reverso actual ya está resuelto con CSS (logo "TM" + patrón geométrico animado, sin necesitar imagen). Si más adelante quieres reemplazarlo por una imagen, usa el mismo prompt base con `[SUJETO]` = *"an abstract letter 'TM' monogram emblem"* y guárdalo aparte; avísame y lo conecto en `Card.js`.
