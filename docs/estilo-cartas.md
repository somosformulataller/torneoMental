# Estilo de las cartas (reversos nuevos + prompts para los frentes)

Documenta el rediseño visual de las cartas del juego de memoria: el **concepto
nuevo** (oscuro y moderno, sin estilo místico/tarot), los **reversos** hechos en
código (SVG) y los **prompts para Gemini** para generar los **frentes**.

Relacionado con el cambio de paleta general de la app (violeta como color de
marca) descrito en `actualizaciones_recientes.md`.

---

## 1. Concepto visual

Se abandonó el look "espiritual / carta de tarot". El estilo nuevo es de
**juego/app moderna sobre base oscura**:

- **Base oscura compartida** en todas las cartas, para que combinen entre sí y
  con la app: degradado azul noche `#0F1626 → #0A0E1A`.
- **Un color de acento por temática** (así el jugador distingue el tema de un
  vistazo). Los tres acentos ya viven en la paleta de la app:

| Temática | Acento principal | Acento secundario |
|---|---|---|
| **Tecnología** | Violeta `#A78BFA` | Índigo `#818CF8` |
| **Naturaleza** | Verde esmeralda `#34D399` | Verde lima `#4ADE80` |
| **Animales** | Naranja `#FB923C` | Ámbar `#FBBF24` |

- **Reglas de estilo** (lo que lo saca de "tarot"): ilustración plana y limpia,
  fondo oscuro + patrón geométrico, borde fino. **Nada** de marcos dorados
  ornamentados, mandalas, auras/brillos místicos, fondos cósmicos con estrellas,
  símbolos esotéricos ni texturas de pergamino.

### Reverso vs. frente
- **Reverso** (carta boca abajo) → **unicolor** según el tema (su acento).
- **Frente** (carta volteada) → **multicolor**, con los **colores reales** del
  objeto/animal/elemento. Solo un **borde fino** del color del tema lo "amarra"
  a su temática, sin teñir el dibujo.

---

## 2. Reversos (ya implementados, hechos en código / SVG)

Los reversos **no son imágenes**: se dibujan 100% en código con un componente
React que genera un SVG. Ventajas: nítidos a cualquier resolución (no se
pixelan), pesan unos pocos KB (los PNG anteriores pesaban cientos de KB por
carta) y usan los mismos colores de la app.

- **Componente**: `src/components/game/CardBack.js` — recibe `theme` y dibuja:
  - **Tecnología** → patrón de **circuito** (trazos + nodos brillantes), violeta.
  - **Naturaleza** → **líneas topográficas** (curvas de nivel), verde.
  - **Animales** → malla **low-poly** de triángulos con puntos en los vértices,
    naranja.
- **Uso**: `src/components/game/Card.js` renderiza `<CardBack theme={card.theme} />`
  en la cara trasera (antes usaba un `<Image>` con un PNG).
- **Sin letras**: el diseño no lleva monograma ni texto; el protagonista es el
  patrón (con buena intensidad para que se vea).
- **CSS**: `.cardBack` en `src/components/game/card.module.css` tiene un borde
  neutro para que el SVG mande el color en cada tema.

### Archivos que quedaron sin uso
- Los PNG de reverso anteriores: `public/cards/<tema>/back_<tema>.png`.
- El mapa `CARD_BACKS` en `src/lib/cardThemes.js`.

Se pueden borrar cuando se quiera; ya no se referencian para dibujar.

---

## 3. Frentes (pendientes) — prompts para Gemini

Los **frentes** siguen siendo las ilustraciones PNG actuales. Para renovarlos con
el estilo nuevo se generan en **Gemini** (IA de imágenes) y luego se integran.

Cada prompt es un **molde**: se pega y solo se cambia `[OBJETO]` por cada carta
de la lista. Así las 9 de un mismo tema salen consistentes, y cada objeto con
sus colores reales.

### 🟣 Tecnología (borde violeta `#A78BFA`)

```
Ilustración plana y moderna (estilo flat design vectorial, NO foto realista, NO 3D recargado, NO místico ni estilo tarot) de [OBJETO], un solo objeto centrado y bien reconocible. Formato vertical 3:4, 900x1200 px, imagen a sangre que llena todo el rectángulo hasta las orillas, sin esquinas redondeadas, sin fondo transparente y sin marco decorativo. Fondo liso azul noche oscuro con degradado sutil de #0F1626 a #0A0E1A (para que combine con una app de tema oscuro). El objeto debe tener sus colores reales y variados (metálicos, grises, con toques de color), NO monocromático. Añade un borde fino limpio de color violeta #A78BFA alrededor de la carta y un resplandor violeta muy sutil, sin teñir el objeto. Iluminación suave, aspecto pulcro y consistente. Sin texto ni letras.
```

**Objetos:** CPU · Robot · Drone · Visor VR · Satélite · Smartwatch · Servidor · Chip · Cohete

### 🟢 Naturaleza (borde verde `#34D399`)

```
Ilustración plana y moderna (estilo flat design vectorial, NO foto realista, NO 3D recargado, NO místico ni estilo tarot) de [OBJETO], un solo elemento centrado y bien reconocible. Formato vertical 3:4, 900x1200 px, imagen a sangre que llena todo el rectángulo hasta las orillas, sin esquinas redondeadas, sin fondo transparente y sin marco decorativo. Fondo liso azul noche oscuro con degradado sutil de #0F1626 a #0A0E1A (para que combine con una app de tema oscuro). El elemento debe tener sus colores reales y variados (verdes, azules, tierra, etc.), NO monocromático. Añade un borde fino limpio de color verde esmeralda #34D399 alrededor de la carta y un resplandor verde muy sutil, sin teñir el objeto. Iluminación suave, aspecto pulcro y consistente. Sin texto ni letras.
```

**Objetos:** Hoja · Loto · Roble · Montaña · Río · Sol · Mariposa · Nube · Cascada

### 🟠 Animales (borde naranja `#FB923C`)

```
Ilustración plana y moderna (estilo flat design vectorial, NO foto realista, NO 3D recargado, NO místico ni estilo tarot) de [ANIMAL], un solo animal centrado y bien reconocible. Formato vertical 3:4, 900x1200 px, imagen a sangre que llena todo el rectángulo hasta las orillas, sin esquinas redondeadas, sin fondo transparente y sin marco decorativo. Fondo liso azul noche oscuro con degradado sutil de #0F1626 a #0A0E1A (para que combine con una app de tema oscuro). El animal debe tener sus colores reales y variados (su pelaje/plumaje natural), NO monocromático. Añade un borde fino limpio de color naranja #FB923C alrededor de la carta y un resplandor naranja muy sutil, sin teñir el animal. Iluminación suave, aspecto pulcro y consistente. Sin texto ni letras.
```

**Objetos:** León · Águila · Delfín · Zorro · Búho · Lobo · Tigre · Oso · Tortuga

### Tips para que salgan parejas
1. Generar **primero una carta** de cada tema; cuando el estilo guste, para las
   otras 8 decirle a Gemini *"mismo estilo, misma base oscura y mismo borde que
   esta imagen de referencia, pero ahora [nuevo objeto]"* (adjuntando la primera
   como referencia).
2. Al integrarlas se pueden **optimizar de peso** y ajustar para que encajen con
   los reversos.

---

## 4. Nombres de archivo de los frentes

Para conectarlas directo, conviene respetar los nombres actuales (`src/lib/cardThemes.js`).
Si vienen con otro nombre, se renombran al integrarlas.

**Tecnología** (`public/cards/tecnologia/`):
`tech_cpu.png` · `tech_robot.png` · `tech_drone.png` · `tech_vr.png` ·
`tech_satellite.png` · `tech_smartwatch.png` · `tech_server.png` ·
`tech_chip.png` · `tech_rocket.png`

**Naturaleza** (`public/cards/naturaleza/`):
`nat_leaf.png` · `nat_lotus.png` · `nat_oak.png` · `nat_mountain.png` ·
`nat_river.png` · `nat_sun.png` · `nat_butterfly.png` · `nat_cloud.png` ·
`nat_waterfall.png`

**Animales** (`public/cards/animales/`):
`anim_lion.png` · `anim_eagle.png` · `anim_dolphin.png` · `anim_fox.png` ·
`anim_owl.png` · `anim_wolf.png` · `anim_tiger.png` · `anim_bear.png` ·
`anim_turtle.png`

---

## 5. Especificaciones técnicas (resumen)

- **Proporción**: vertical **3:4** (la app muestra las cartas con `aspect-ratio: 3/4`
  y `object-fit: cover`).
- **Tamaño sugerido**: 900×1200 px (o 1024×1365).
- **A sangre**: la imagen llena todo el rectángulo; **sin** esquinas redondeadas
  ni transparencia (la app redondea las esquinas por CSS).
- **Colores clave**: base `#0F1626`/`#0A0E1A`; acentos violeta `#A78BFA`,
  verde `#34D399`, naranja `#FB923C`. **Sin cian.**
