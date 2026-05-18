## Efecto de pulso al presionar botones (global)

Añadir una animación sutil de "pulso luminoso" + un destello de color más claro al instante de presionar cualquier botón de la app, sin afectar la lógica ni el layout.

### Alcance
- Aplica a todos los botones que usan el componente `Button` (`src/components/ui/button.tsx`), que es el botón base de toda la app (menús, acciones, modales, etc.).
- También cubre elementos con la clase utilitaria `.btn-press` por si hay botones nativos `<button>` sueltos que quieran adoptar el efecto.
- No cambia variantes, tamaños, colores base ni comportamiento de los botones.

### Comportamiento visual
1. **Pulso luminoso por fuera**: anillo suave que se expande desde el borde del botón y se desvanece (~450ms), usando el color primario con baja opacidad. Queda por fuera gracias a `box-shadow` (no recorta el layout, no empuja a otros elementos).
2. **Aclarado instantáneo**: mientras está presionado (`:active`), el botón se aclara levemente mezclando blanco con el color base (`color-mix` con ~15%), volviendo a su tono normal al soltar.
3. **Duración**: el pulso dura solo el instante del click; no se repite ni queda activo.
4. **Accesibilidad**: respeta `prefers-reduced-motion` (sin pulso, solo el cambio leve de tono).

### Cambios técnicos

**1. `src/styles.css`** — agregar:
- Keyframe `button-pulse` (escala 1 → 1.04 del shadow, opacidad 0.6 → 0).
- Clase utilitaria `.btn-press`:
  - `:active` aplica `filter: brightness(1.15)` (o `background: color-mix(in oklch, currentColor 15%, var(--primary))` según variante) y dispara la animación `button-pulse` una vez.
  - `box-shadow` con color `--primary` semitransparente como base del halo.
- Bloque `@media (prefers-reduced-motion: reduce)` que desactiva la animación de pulso.

**2. `src/components/ui/button.tsx`** — añadir `btn-press` a `buttonVariants` base classes (junto a `inline-flex items-center ...`). Una sola línea, sin tocar variantes ni props.

### Diagrama

```text
[ Button ]   ← estado normal
   ↓ click
[ Button ]●●●  ← halo expandiéndose hacia afuera + tono más claro
   ↓ ~450ms
[ Button ]   ← vuelve al estado normal
```

### Notas
- Usa tokens semánticos (`--primary`) — sin colores hardcodeados.
- Sin dependencias nuevas, sin cambios de lógica, sin cambios en rutas ni i18n.
- Funciona automáticamente en todos los botones existentes al estar en el componente base.
