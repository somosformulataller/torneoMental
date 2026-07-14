# Kit de prompts — arte de cartas (IA)

Cada carta es un render completo tipo "carta coleccionable espiritual", con su propio marco ornamentado, fondo temático y pieza central luminosa — no un ícono aislado. `src/lib/cardThemes.js` usa **9 cartas únicas por temática** (7 se reparten por defecto en cada partida, `tournaments.card_count` default 14 = 7 parejas; tener 9 en la librería da variedad entre partidas).

## Estado: completo ✅

- **Tecnología**: 9/9 (`tech_cpu`, `tech_robot`, `tech_drone`, `tech_vr`, `tech_satellite`, `tech_smartwatch`, `tech_server`, `tech_chip`, `tech_rocket`)
- **Naturaleza**: 9/9 (`nat_leaf`, `nat_lotus`, `nat_oak`, `nat_mountain`, `nat_river`, `nat_sun`, `nat_butterfly`, `nat_cloud`, `nat_waterfall`) — nota: se generó `nat_cloud` en vez de la `nat_moon` originalmente propuesta en este documento; `cardThemes.js` ya refleja ese cambio.
- **Animales**: 9/9 (`anim_lion`, `anim_eagle`, `anim_dolphin`, `anim_fox`, `anim_owl`, `anim_wolf`, `anim_tiger`, `anim_bear`, `anim_turtle`) — nota: se generaron `anim_bear`/`anim_turtle` en vez de `anim_panda`/`anim_elephant` originalmente propuestos; `cardThemes.js` ya refleja ese cambio.
- **Reversos** (`back_tecnologia.png`, `back_naturaleza.png`, `back_animales.png`): completos, conectados en `Card.js`.

Todas las imágenes viven en `public/cards/<tema>/<id>.png`, coincidiendo exacto con las rutas de `src/lib/cardThemes.js`.

## Si en el futuro hace falta regenerar o agregar una carta

Usa el mismo estilo por temática para que combine con el resto del mazo:

- **Formato**: PNG, sin necesidad de transparencia (render de carta completo con su propio fondo y marco).
- **Resolución**: cuadrada, mínimo 1024×1024 px.
- **Ruta**: `public/cards/<tema>/<id>.png`, coincidiendo con el `id`/`image` que le des en `CARD_DATA` dentro de `src/lib/cardThemes.js`.

Composición común: marco ornamentado en los 4 bordes con medallones circulares de geometría sagrada (Flor de la Vida, Cubo de Metatrón, Sri Yantra, espirales), fondo atmosférico de la temática, y un elemento central luminoso con halo de luz. El texto (título/subtítulo) es opcional — varias cartas existentes no llevan texto, solo el arte.

### Tecnología
Marco metálico dorado con motivos de circuitos grabados. Fondo de nebulosa/galaxia estrellada. Elemento central con brillo cian-blanco eléctrico y rayos de luz.

### Naturaleza
Marco de bronce/madera tallada con nudos celtas y roleos de geometría sagrada. Fondo de bosque místico nocturno con musgo, helechos y niebla azul-violeta. Elemento central con halo dorado/violeta suave.

**Prompt base (español):**
```
Carta coleccionable mística "Spiritual Memory Card", formato cuadrado 1024x1024,
marco ornamentado de bronce tallado con nudos celtas y medallones circulares de
geometría sagrada (flor de la vida, espirales) en las cuatro esquinas, esquinas
redondeadas, fondo de bosque místico nocturno con musgo, helechos y niebla
azul-violeta, [SUJETO] como elemento central luminoso con halo de luz dorado y
violeta suave, iluminación cinematográfica, alto nivel de detalle, sin texto,
estilo idéntico a una carta de tarot fantástica premium.
```

### Animales
Marco plateado/obsidiana con motivos tribales de geometría sagrada. Fondo de sabana/cielo crepuscular con aurora sutil. El sujeto representado como un espíritu animal luminoso con halo de energía y partículas brillantes.

**Prompt base (español):**
```
Carta coleccionable mística "Spiritual Memory Card", formato cuadrado 1024x1024,
marco ornamentado plateado/obsidiana con motivos tribales tallados y medallones
circulares de geometría sagrada en las cuatro esquinas, esquinas redondeadas,
fondo de sabana/cielo crepuscular con aurora sutil, [SUJETO] representado como
un espíritu animal luminoso con halo de energía y partículas brillantes
alrededor, iluminación cinematográfica, alto nivel de detalle, sin texto,
estilo idéntico a una carta de tarot fantástica premium.
```

Si generas con una herramienta que soporte imagen de referencia (img2img), sube una carta existente de la misma temática además del prompt de texto — ayuda a mantener consistencia.
