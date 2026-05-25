## Cambio

Reemplazar el archivo `src/assets/character-sheet/stats-panel.png` por la imagen recién subida `ADV2.png`.

## Por qué es seguro

- Las dimensiones coinciden: ambos son 1920×980.
- El layout del nuevo asset es idéntico al actual (3 tarjetas: ataque / defensa / velocidad, con iconos en la mitad superior y zona oscura inferior para los valores).
- El componente que lo usa (`src/routes/campaign.profile.tsx`, líneas 223-258) calcula las posiciones de los valores con porcentajes (`leftPct` 16.5 / 50 / 83.5 y `top: 72%`), que siguen cuadrando con la nueva imagen.

## Pasos

1. Copiar `user-uploads://ADV2.png` a `src/assets/character-sheet/stats-panel.png` (sobrescribir).
2. No tocar código: el import y las coordenadas siguen siendo válidos.
3. Verificar visualmente en `/campaign/profile` que los números (daño, defensa, velocidad + sufijo `ft`) quedan centrados en cada tarjeta. Si hace falta micro-ajuste, mover `top: "72%"` un par de puntos.

## Fuera de alcance

- No se modifican textos, lógica, ni i18n.
- No se cambian los assets de cabecera/HP/portrait ni el `preloadCharacterSheetAssets` (la ruta del archivo es la misma).
