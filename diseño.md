# Rediseño: Copa Mental Espiritual 🌌

El objetivo de este plan es transformar la estética de la aplicación, pasando de un estilo "gamer/ciberpunk" a una **experiencia espiritual, realista y profunda**. El nuevo diseño debe evocar la idea de conectar la mente, despertar la memoria y entrar en un estado de alta concentración cognitiva.

## 🎨 Concepto Visual y Estética

1. **Paleta de Colores:** 
   - Fondos: Púrpuras profundos, azules celestiales y negros etéreos (`#0B001A`, `#1A0B2E`).
   - Acentos: Dorados brillantes (iluminación espiritual), blancos puros y destellos violetas.
2. **Tipografía:**
   - Transición de tipografías pesadas a fuentes más elegantes y místicas (ej. `Cinzel` para títulos, `Inter` de peso ligero para lectura).
3. **Estilo Realista y 3D:**
   - Materiales que simulen texturas físicas: cristal esmerilado profundo, bordes dorados metálicos, y sombras realistas que den profundidad.
   - La portada tendrá una imagen generada con IA de una "mente espiritual/universo" en alta resolución y realismo.

## 🃏 Rediseño de las Cartas (Juego)
- **Físicas 3D:** Las cartas dejarán de verse planas. Tendrán un grosor simulado, reflejos dinámicos de luz (efecto holográfico o dorado metálico) al moverse.
- **Dorso de la Carta:** Un diseño de geometría sagrada (como la Flor de la Vida o mandalas sutiles) con relieve realista en oro.
- **Temáticas:** Las imágenes de las cartas serán rediseñadas para verse como objetos físicos o artefactos místicos en 3D (ej. cristales, símbolos cósmicos, animales de poder espirituales).

## 🚀 Cambios a implementar

A continuación, los componentes que serán modificados:

### Sistema de Diseño (Globales)
- **`globals.css`**: Reemplazo completo de variables de color neón por la paleta celestial/espiritual.
- Nuevos keyframes para animaciones de "respiración", "flotación" e iluminación sutil, en lugar de parpadeos y vibraciones intensas.
- Sombras (`box-shadow`) amplias y difusas para dar efecto de levitación a las tarjetas.

### Páginas de Autenticación y Home
- **`login/page.js`** y **`home/page.js`**: Inserción de la nueva imagen principal "Mental Espiritual" como fondo dinámico.
- Reemplazo de los botones sólidos por botones con borde dorado brillante e interior de cristal oscuro.
- Mensajes inspiracionales para incentivar la memoria (ej: "Conecta tu mente", "Despierta tu memoria").

### Componente de Juego
- **`Card.js`** y **`card.module.css`**: Estilización completa de la carta. Se añadirá un contenedor con perspectiva 3D profunda, `box-shadow` dinámico para simular la elevación, y transiciones suaves (`ease-in-out`) que simulen el peso físico de la carta al voltearse.

---

## ❓ Preguntas Abiertas
1. **Imágenes:** ¿Quieres que utilice la generación de imágenes con IA en este momento para crear la portada espiritual realista y un par de ejemplos de cómo se verán las cartas 3D?
2. **Estructura:** ¿Mantenemos la misma ubicación de los botones y la navegación inferior, enfocándonos solo en cambiar su apariencia estética para que luzca espiritual y premium?
