# Ajuste de posición del cuadro de imagen del portrait

## Contexto

En `src/components/app/FramedCharacterPortrait.tsx` el componente está compuesto por dos capas independientes:

1. El **cuadro de imagen** (inner portrait), posicionado con `inset: "9%"` sobre el cuadrado base.
2. El **frame decorativo + número de nivel**, en un wrapper aparte con su propio `scale` y `translate` (constantes `frameScale`, `frameOffsetX`, `frameOffsetY`).

Como son dos capas separadas, podemos mover solo la imagen sin que el frame ni el número de nivel se desplacen.

## Cambio

Agregar dos constantes nuevas al objeto `PORTRAIT_FRAME_LAYOUT` para el offset del cuadro interior:

- `portraitOffsetX: -2` (porcentaje, negativo = izquierda)
- `portraitOffsetY: -2` (porcentaje, negativo = arriba)

Y aplicarlas como `transform: translate(...)` al `<div>` que tiene `inset: "9%"` (la capa de la imagen), dejando intacto el wrapper del frame.

```text
┌──────────────────────────┐
│   frame (sin cambios)    │
│   ┌──────────────────┐   │
│   │  imagen ← ↑      │   │  ← solo esta capa se mueve
│   └──────────────────┘   │
└──────────────────────────┘
```

Valores iniciales sugeridos: `-2%` en X y `-2%` en Y (movimiento sutil hacia arriba-izquierda). Si después se necesita más/menos, basta con ajustar esas dos constantes en un solo lugar.

## Detalles técnicos

Archivo único a modificar: `src/components/app/FramedCharacterPortrait.tsx`.

- Añadir `portraitOffsetX` y `portraitOffsetY` al objeto `PORTRAIT_FRAME_LAYOUT`.
- En el `<div>` de la imagen (actualmente `style={{ inset: "9%", borderRadius: "6%" }}`) añadir `transform: translate(${portraitOffsetX}%, ${portraitOffsetY}%)`.
- No tocar el wrapper del frame ni el posicionamiento del número de nivel.
- No se modifican rutas, tipos, estilos globales ni otros componentes.

## Validación

Revisar visualmente en `/campaign/profile` que:
- La imagen quede pegada al borde interno superior-izquierdo del frame.
- El frame siga exactamente en la misma posición que antes.
- El número de nivel siga centrado en el mismo lugar.
