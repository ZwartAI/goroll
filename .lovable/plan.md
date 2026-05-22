## Objetivo

Mejoras incrementales al sistema de efectos de condición en combate, sin tocar visual existente, sin romper turnos/Enlace/escudos/realtime.

## Cambios

### 1. Modal informativo compartido (nuevo)
- Crear `src/components/app/EffectInfoModal.tsx`: modal pequeño RPG, solo lectura.
- Muestra: emoji grande, nombre del efecto, tipo legible (Buff/Debuff/Escudo/Daño persistente/Condición/Nota), turnos restantes, daño por turno (si > 0), valor (si aplica, ej. escudo), fuente (nombre del personaje origen si existe), descripción/etiqueta larga.
- Acepta dos formas de entrada: una fila de `combat_temporary_effects` o una fila de `character_conditions` (normalizado internamente).
- Solo botón "Cerrar". Sin editar, sin eliminar.

### 2. Long-press en chip de efecto del enemigo (DM)
- `EnemyManagerDM.tsx` → `EnemyEffectsStrip`:
  - Mantener tap corto: sigue llamando `tickEnemyEffect` (baja turno + aplica daño).
  - Reemplazar el `onContextMenu`/`longPressRemove` actual por: long-press (500ms) abre `EffectInfoModal`. Ya NO elimina el efecto.
  - Cancelar tap cuando se disparó long-press (no debe disparar `tickEnemyEffect` al soltar).
  - Click derecho desktop también abre el modal informativo.
- Funciona en móvil + desktop.

### 3. Chips de efectos en `CombatList` (pestaña Combate del Character Sheet)
- Extender `CombatList.tsx` con un sub-componente `TurnEffectChips` que se monta en cada `TurnRow`:
  - Enemigo solo: llama `listEffectsForEnemy(participantId)` y se suscribe a `combat_temporary_effects` filtrado por `encounter_id` + `target_enemy_participant_id`.
  - Jugador solo: combina `listEffectsForCharacter(character_id)` (combat_temporary_effects) + `character_conditions` para ese personaje. Suscribe a ambas tablas.
  - Grupo Enlace: una fila pequeña por miembro debajo de cada avatar, mismo chip set.
- Visual: chip compacto `emoji + nº turnos restantes`. Máximo 3 chips; resto se colapsa como `+N`.
- Interacción: long-press abre `EffectInfoModal`. Tap corto NO hace nada (solo lectura en esta vista, también para DM, para evitar accidentes).

### 4. Auto-reducción de efectos al terminar turno de jugador
- En `src/lib/combat.ts` → `passTurn`, después de marcar `has_ended_turn = true` y antes/junto al log final:
  - Determinar `affectedCharacterIds`: si solo, `[character.id]`; si grupo, `block.members.map(m => m.character_id)`.
  - Para cada `character_id`, llamar a una nueva helper `tickPlayerTurnEnd(characterId, campaignId, encounterId)` (en `combat-skills.ts`) que:
    1. Lee `character_conditions` del personaje.
       - Si `damage_per_turn > 0`: aplicar daño con consumo de escudos FIFO (reutiliza la lógica existente en `applyDamageToCharacter`, refactorizada o duplicada de forma segura), log corto: `{label} hizo X de daño a {name}` o `Escudo absorbió X. {name} recibió Y de daño.`
       - Decrementar `turns_left` en 1; si llega a 0 → eliminar y opcionalmente log `{label} expiró sobre {name}.`
    2. Lee `combat_temporary_effects` del personaje (excluyendo `shield` y `note`): si `value > 0` y tipo se considera DOT (`debuff`/`control`/`damage` si existiera), aplicar mismo flujo de daño con escudos. Decrementar `duration_rounds` y eliminar al llegar a 0. Los `shield` y `note` simplemente se decrementan en duración (sin daño).
- Nada toca enemigos ni otros jugadores.
- Realtime se actualiza automáticamente vía suscripciones existentes.

### 5. Helper de daño persistente con escudos
- Exportar `applyDotToCharacter(characterId, amount, encounterId)` en `combat-skills.ts` extraído de la lógica privada actual de `applyDamageToCharacter`. Bypass de defensa (DOT ignora defensa de equipo). Consume `combat_temporary_effects` con `effect_type='shield'` FIFO, luego HP. Devuelve `{ absorbed, applied, defeated? }`.

### 6. i18n (es/en)
Añadir bajo `combat.effects.*`:
- `info.title`, `info.remainingTurns`, `info.damagePerTurn`, `info.value`, `info.source`, `info.description`, `info.close`
- `type.condition`, `type.buff`, `type.debuff`, `type.shield`, `type.dot`, `type.note`, `type.control`
- `tick.damaged`: `"{effect} hizo {amount} de daño a {target}."` / EN
- `tick.shieldAbsorbed`: `"Escudo absorbió {absorbed}. {target} recibió {applied} de daño."`
- `tick.expired`: `"{effect} expiró sobre {target}."`

## Detalles técnicos

- No se modifica el esquema de la BD. Se reutilizan campos existentes:
  - `combat_temporary_effects.value` = daño por turno cuando aplica.
  - `combat_temporary_effects.duration_rounds` = turnos restantes.
  - `character_conditions.damage_per_turn` y `turns_left` (legacy).
- `useLongPress` se mantiene; en EnemyEffectsStrip, el botón usa `onClick={() => { if (!lp.didLongPress()) tick(); }}` y `lp.*` para mousedown/touch. Eliminamos `onContextMenu` ↔ `removeEffect`.
- `EffectInfoModal` resuelve nombre de fuente cargando `characters` por id cuando `source_character_id` esté presente (un solo SELECT al abrir).
- En `CombatList`, los chips se cargan diferidos: una llamada por TurnRow al montar + canal realtime único compartido por `encounter_id` (un canal por instancia de `CombatList`, no por chip).

## Archivos

- `src/components/app/EffectInfoModal.tsx` (nuevo)
- `src/components/app/EnemyManagerDM.tsx` (long-press → modal, sin remove confirm)
- `src/components/app/CombatList.tsx` (chips + long-press)
- `src/lib/combat-skills.ts` (`applyDotToCharacter`, `tickPlayerTurnEnd`)
- `src/lib/combat.ts` (`passTurn` invoca tick)
- `src/lib/locales/es.ts`, `src/lib/locales/en.ts`

## Qué NO se toca

Visual actual del chip en tarjeta del enemigo, tap corto del enemigo, iniciativa, bestiario, skills, skill points, inventario, equipo, notas, potenciadores, importación, sistema base de turnos.