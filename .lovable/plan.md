## Fase 4 — Fichas y Skills de enemigos en combate

Objetivo: el DM controla enemigos durante su turno con ficha rápida, ficha completa, uso de skills, hablar como enemigo, y pasar turno. Jugadores solo ven lo que el DM publica en el log.

### 1. Datos / Base de datos

Migración nueva: tabla `combat_enemy_skills` (snapshot de skills al añadir enemigo al combate; editar plantilla NO altera enemigos ya activos).

```
combat_enemy_skills
- id uuid pk
- campaign_id uuid
- encounter_id uuid
- combat_participant_id uuid (FK lógico → combat_participants.id)
- template_skill_id uuid nullable
- name text
- rarity item_rarity
- skill_type text
- target_shape text
- targets text
- dice text
- range_text text
- effect text
- visual_brief text
- order_index int
- created_at timestamptz
```

RLS pública (igual que resto de tablas del proyecto). Habilitar realtime.

Modificar `spawnFromTemplate` en `src/lib/bestiary.ts` para que después de insertar el participant, copie las skills del template a `combat_enemy_skills` por cada instancia spawneada.

### 2. Lógica nueva (`src/lib/combat.ts` + helper)

- `listEnemySkills(participantId)` — leer skills snapshot.
- `logEnemySkillUse(...)` — inserta en `logs` con segmentos personalizados (icono enemigo, nombre skill, dados, alcance, objetivos, efecto, visual_brief opcional según nivel de detalle: `nameAndEffect` | `full`).
- `logEnemySpeech(enemy, text)` — log con icono+color+nombre del enemigo y la frase.
- `logEnemyDefeated(enemy)` — log al marcar derrotado (ya parcialmente existe, asegurar formato).
- `logEnemyEndedTurn(enemy)` — se enchufa en `dmEndEnemyTurn` ya existente.
- Validaciones: encounter activo, es DM, enemigo pertenece al encounter, status != ended.

### 3. UI — Ficha rápida del enemigo (DM)

En `EnemyManagerDM.tsx` (o `CombatList` DM view), por cada enemigo:
- Icono circular con color.
- Nombre + badge tier (Normal/Élite/Jefe) si hay `enemy_template_id`.
- HP actual/máx + barra (verde/amarillo/rojo).
- DEF, VEL, iniciativa.
- Botón "Ficha" (también long-press en móvil) → abre `EnemyCombatSheetModal`.
- Si está en turno: zona "Turno activo" con botones Usar skill / Hablar / Ajustar HP / Pasar turno.
- Si no está en turno: botón principal indica "No es su turno" (deshabilitado o secundario).

Long-press: hook `useLongPress(onLongPress, 400ms)` en `src/hooks/`.

### 4. UI — Ficha completa: `EnemyCombatSheetModal.tsx` (nuevo)

Modal scrolleable. Secciones:
1. Header: icono grande, nombre, tier, rol, bioma, estado activo/derrotado.
2. Estadísticas: HP/max + barra, DEF, VEL, daño base, iniciativa.
3. Controles HP: -1, -5, +1, +5, "Daño bruto", "Daño con defensa", "Curar", "Editar HP" (abre `EnemyDamageModal` ya existente).
4. Conducta (privada DM): behavior_notes, description, enemy_notes.
5. Inmunidades: chips. "Sin inmunidades registradas" si vacío.
6. Debilidades: texto. Ocultar sección si vacío.
7. Skills: lista de `EnemySkillCard`. "Sin skills registradas" si vacío.

Tier sólo se muestra si se puede consultar el template (cargar `enemy_templates` por id si hace falta — o copiar tier al participant en spawn; preferible cargar on-demand para no migrar más columnas).

### 5. UI — `EnemySkillCard.tsx` (nuevo)

Card oscura "arcana", distinta a `SkillCard` de jugadores:
- Borde/halo por rareza.
- Icono auto por `skill_type` (sword/shield/sparkles/zap…).
- Dados en dorado, alcance en azul, objetivos en verde/turquesa, efecto blanco, visual_brief violeta/plata.
- Acciones: "Usar" (abre `EnemySkillUseModal`), "Mostrar" (atajo → log directo con detalles completos).

### 6. UI — `EnemySkillUseModal.tsx` (nuevo)

- Muestra nombre, enemigo emisor, dados, alcance, objetivos, efecto, visual breve.
- Selector de objetivos (multi): jugadores (de `characters` rol player), grupos Enlace (`combat_turn_groups`), otros enemigos del encounter, "todos", "sin objetivo".
- Inputs: resultado tirada (texto libre), nota DM.
- Radios visibility: `private` | `nameAndEffect` | `full`.
- Confirmar:
  - Si no es `private` → `logEnemySkillUse` con detalles según radio.
  - No aplica daño automático.
- Validación: si effect contiene número y dice está vacío → mostrar warning inline (no bloquea).
- Si enemigo derrotado → confirm "Este enemigo fue derrotado. ¿Seguro?".

### 7. UI — `EnemySpeechModal.tsx` (nuevo)

- Textarea, validar no vacío.
- Confirmar → `logEnemySpeech` con segmentos: `[icon+color name]: "frase"`.

### 8. Integración con CombatDMPanel / EnemyManagerDM

- Añadir botón "Ficha" en cada enemy row.
- Añadir long-press handler.
- Si participant es enemy y `isActive`, mostrar fila "Turno activo" con 4 botones.
- "Pasar turno del enemigo" usa `dmEndEnemyTurn` existente + log.

### 9. Vista pública (jugadores / espectadores)

`CombatList` ya oculta HP/DEF/VEL. Verificar que sigue sin filtrar nada nuevo.
Render de log enemy-skill: crear componente `LogEnemySkillSegment` o aprovechar `segments` JSON. Estilo card con icono enemigo, nombre, dados (si full), alcance, objetivos, efecto. Tipos `segment.kind = "enemy_skill"` y `"enemy_speech"` en `LogSegments.tsx`.

### 10. i18n (`es.ts` / `en.ts`)

Namespace `combat.enemy.*`:
sheet, fullSheet, behavior, immunities, weaknesses, skills, useSkill, showSkill, speakAs, endEnemyTurn, activeTurn, rollResult, dmNote, showInLog, showNameEffectOnly, showFullDetails, keepPrivate, noImmunities, noWeaknesses, noSkills, notInTurn, defeatedWarn, numericNoDiceWarn, tier.normal/elite/boss, role.*.

### 11. Permisos

Helpers ya existentes en `CampaignProvider` (`isDM`, etc.). Todos los botones DM-only gateados. Server side: las acciones se hacen vía supabase desde cliente DM (igual que fase 2/3) — no se cambia modelo de seguridad.

### 12. Realtime

Suscribir a `combat_enemy_skills` cambios (insert al spawnear). Logs ya tienen realtime. Resto sin cambios.

### 13. Out of scope (fases futuras)

- Daño automático a jugadores.
- IA enemiga.
- Recompensas/drops.
- Bloqueo automático de condiciones por inmunidad.
- Edición de skills snapshot (en esta fase solo lectura; si se quiere editar, se edita la plantilla y el siguiente spawn lo refleja).

### Archivos

Nuevos:
- `supabase/migrations/<ts>_combat_enemy_skills.sql`
- `src/components/app/EnemyCombatSheetModal.tsx`
- `src/components/app/EnemySkillCard.tsx`
- `src/components/app/EnemySkillUseModal.tsx`
- `src/components/app/EnemySpeechModal.tsx`
- `src/hooks/useLongPress.ts`

Editados:
- `src/lib/bestiary.ts` (spawn → copia skills snapshot)
- `src/lib/combat.ts` (helpers log + listEnemySkills)
- `src/components/app/EnemyManagerDM.tsx` (botón Ficha, long-press, zona turno activo)
- `src/components/app/CombatList.tsx` (long-press / botón ficha en DM view; render skill enemy en log si aplica)
- `src/components/app/LogSegments.tsx` (renderers `enemy_skill`, `enemy_speech`)
- `src/integrations/supabase/types.ts` (auto tras migración)
- `src/lib/locales/es.ts`, `src/lib/locales/en.ts`

### Validaciones finales

- Encounter activo, DM, participante del encounter, no terminado.
- Warning numerico-sin-dados.
- Confirm si derrotado.
- Todo i18n, sin strings hardcoded.
