## Problema 1 — Mostrar a quién está asignado cada potenciador

En `src/routes/campaign.dm.tsx`, la pestaña **Potenciadores** del DM actualmente solo guarda un `Map<boosterId, number>` (`holderCounts`) y pinta `👥 N`. No dice qué personajes.

**Cambio:**
- Sustituir `holderCounts: Map<string, number>` por `holdersByBooster: Map<string, Character[]>`.
- En el `reload()` traer también `character_id` y cruzarlo con `characters` (ya disponible vía `useGameData`) para obtener `{ id, name, color }` de cada holder.
- En la tarjeta de cada booster (líneas ~258-286), debajo del nombre renderizar:
  - Si tiene holders: una fila de "chips" pequeños, uno por personaje, con el color del personaje como borde/fondo suave y su nombre.
  - Si no tiene holders: el indicador actual `🏛️ Vault`.
- Quitar el `usesOwner` con `👥 N`; los usos siguen mostrándose (`b.max_uses/b.max_uses`) pero el "owner" pasa a ser la fila de chips.
- Los chips serán clicables y abrirán la ficha del personaje (`setOpenChar(id)`), reutilizando el modal ya existente.

## Problema 2 — Realtime no refresca el Vault del DM al consumirse un potenciador

La causa raíz no es el código cliente: la subscripción a `booster_assignments` ya existe (`campaign.dm.tsx` líneas 69-73) y la tabla ya está en `supabase_realtime`. El problema es que `booster_assignments` usa REPLICA IDENTITY por defecto (solo PK), así que los eventos **DELETE** llegan sin `campaign_id` y el filtro `campaign_id=eq.<id>` los descarta. Resultado: cuando un jugador consume el último uso y se borra la asignación, el DM no recibe el evento.

**Cambio (migración):**
```sql
ALTER TABLE public.booster_assignments REPLICA IDENTITY FULL;
```

Con esto, los DELETE incluyen el `campaign_id` previo y el filtro de realtime los entrega. Se aplicará lo mismo a `boosters` por consistencia (mismo riesgo si se eliminan filas).

## Archivos afectados

- `src/routes/campaign.dm.tsx` — refactor de holders + render de chips.
- Nueva migración SQL — `REPLICA IDENTITY FULL` para `booster_assignments` (y `boosters`).

## Fuera de alcance

- No se tocan otras vistas (perfil del jugador, modal de ficha) — ya tienen su propio realtime.
- No se cambia la lógica de uso/transferencia ni el esquema de datos más allá del replica identity.
