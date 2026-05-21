# Rediseño Vista Combate DM

Cambios solo UI/UX + nueva entidad "turn pin". Sin tocar lógica de iniciativa, daño, curación, skills ni bestiario.

## 1. Exploración previa (antes de implementar)
Leer para entender estructura actual:
- `src/routes/campaign.dm.tsx` (zona Escena + bloques Log/Combat)
- `src/components/app/CombatDMPanel.tsx`
- `src/components/app/CombatList.tsx` (tarjetas enemigo + drag&drop actual)
- `src/components/app/EnemyManagerDM.tsx`
- `src/lib/combat.ts` (funciones turn shift, addEnemies, etc.)
- `src/lib/locales/{es,en}.ts`

## 2. Eliminar duplicación Log/Combat ↔ Combat inferior
- En el bloque superior del DM (Escena), quitar la pestaña/tab "Combat" que repite rounds/turnos/lista.
- Mantener **solo Log** arriba.
- El bloque inferior `CombatDMPanel` queda como única zona de gestión: Round, Turno activo, Orden, Añadir enemigo, Bestiario, Active Links, enemigos.
- Si la pestaña superior tenía controles únicos, migrarlos al panel inferior.

## 3. Drag & drop: mover al orden de turnos
- Quitar DnD de la lista interna de enemigos en `CombatList`/`EnemyManagerDM`.
- Activar DnD en la **representación del orden de combate** (turn order list dentro de `CombatDMPanel`): permite reordenar jugadores, enlaces, enemigos y pines.
- Usar `@dnd-kit/core` + `sortable` (ya en el proyecto si existe; si no, instalar).
- Al soltar: recalcular `order_index` de `combat_participants` + `combat_turn_pins`; ajustar `current_turn_index` para no romper el turno activo (mantener el id del participante activo, recalcular su nuevo índice).

## 4. Nueva entidad: Turn Pins (pines de turno)
**Migración DB** — nueva tabla `combat_turn_pins`:
- `id uuid pk`
- `encounter_id uuid`
- `campaign_id uuid`
- `linked_participant_id uuid` (apunta a `combat_participants` del enemigo)
- `label text` (opcional, override)
- `order_index int`
- `initiative int`
- `is_active bool default true`
- `created_at timestamptz default now()`
- RLS `public_all` (consistente con resto del proyecto)

Reglas:
- Sin HP propio. Toda acción (daño/curación/sheet/skills) opera sobre el enemigo enlazado.
- Si enemigo enlazado `is_defeated = true` → pin se renderiza inactivo (gris, no recibe turno) y se salta en `dmShiftTurn`.
- Si se elimina enemigo → eliminar pines (cascade lógico desde código).

Funciones en `src/lib/combat.ts`:
- `addTurnPin(encounterId, linkedParticipantId)`
- `deleteTurnPin(pinId)`
- `reorderTurnSequence(items)` — recibe lista mixta (participantes + pines) con nuevo orden.
- Adaptar `dmShiftTurn` para iterar la secuencia combinada (participantes + pines activos), saltando bloques sin enemigos vivos y pines cuyo enemigo está derrotado. **No cambia la lógica base**, solo extiende el iterable.

## 5. Rediseño tarjeta enemigo (DM)
Nuevo componente `EnemyCombatCardDM` (o refactor en `CombatList.tsx`):

Layout horizontal:
- Izquierda: círculo grande (≈96px) con asset/icono del enemigo (usar `EnemyIconPicker` con `assetScale` ya existente).
- Centro: Nombre (h3), línea `DEF X · SPD Y`, barra HP con `HP/HPmax`.
- Esquina sup. derecha: botón **Open Sheet** (icono pergamino).
- Si en turno: botón amarillo grande **End Enemy Turn** centrado bajo HP.
- Dos filas de 3 botones cuadrados compactos:
  - Fila 1: Damage (rojo, espada) · Heal (verde, cruz) · Open Sheet (dorado, pergamino) *(o mover Sheet aquí en vez de esquina)*
  - Fila 2: Edit (azul, lápiz) · Clone (gris, copy) · Delete (rojo oscuro, papelera)
- Eliminar botones -1/-5/+1/+5 HP de la card.
- Bordes dorados/rojos por tier; fondo `bg-card`/oscuro.
- Estado derrotado: opacidad reducida + badge.

## 6. Pin Card
Componente compacto `TurnPinCard`:
- Etiqueta horizontal slim, icono pequeño del enemigo, texto "Turno de {nombre}" + badge "Turno adicional".
- Borde con color del tier del enemigo.
- Acciones: End Turn (si activo), Delete pin (modal propio).
- Click → abre sheet del enemigo enlazado.

## 7. Confirmaciones
Reemplazar `window.confirm` en acciones de enemigo/pin con `ConfirmDialog` existente.

## 8. i18n
Añadir claves en `es.ts` y `en.ts`:
`damage, heal, openSheet, edit, clone, delete, endEnemyTurn, enemyTurn, turnPin, extraTurn, enemyTurnOf, addTurnPin, deletePin`.

## 9. Validación
- Build limpio.
- Probar: añadir pin, reordenar mediante DnD en turn order, end turn salta pines de enemigos derrotados, daño afecta enemigo enlazado, modal de delete sin window.confirm.

## Notas técnicas
- Realtime: añadir suscripción a `combat_turn_pins` donde se suscribe a `combat_participants`.
- Tipos: regenerados automáticamente tras migración.
- Mantener compatibilidad: encuentros sin pines siguen funcionando idéntico.
