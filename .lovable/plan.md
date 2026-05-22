# Plan: compactar tarjetas de enemigos y sistema de efectos/escudos

Esta solicitud cubre 14 partes muy heterogéneas (UI, base de datos, escudos, panel DM, realtime, i18n). Hacerlo todo en un solo turno me obligaría a tocar casi todo el módulo de combate de golpe, con alto riesgo de romper iniciativa, turnos, daño, curación o realtime. Propongo dividirlo en **3 fases independientes y entregables por separado**. Cada fase queda funcional y no rompe lo anterior.

> Aviso: para responder a tu memoria de i18n, todos los textos nuevos pasan por `t(...)` con claves en `es.ts` y `en.ts`. Nada hardcodeado.

---

## Fase 1 — UI: botón "Actions" y efectos compactos en tarjeta de enemigo

Sólo UI sobre la tarjeta de enemigo del DM. Ya existe la tabla `combat_temporary_effects`, la reusamos para mostrar lo que haya, aunque la creación todavía no exista para enemigos (queda vacío hasta Fase 2).

### Cambios

- `EnemyManagerDM.tsx`:
  - Estado local `openActionsId: string | null` para que sólo una tarjeta tenga acciones abiertas a la vez.
  - Siempre visibles: icono/asset, nombre, DEF, SPD, INI, barra HP, HP actual/máx, "End Enemy Turn" (si está en turno), "Add Turn Pin".
  - Por defecto, debajo de la barra HP (o debajo del botón amarillo si está en turno): botón ancho `Actions` con estilo azul oscuro.
  - Al pulsar, oculta el botón y muestra la fila actual con los 6 botones cuadrados (Damage, Heal, Sheet, Edit, Clone, Delete) + un botón pequeño `×` para volver a colapsar.
- Nuevo subcomponente `EnemyEffectsStrip`:
  - Fila de chips: emoji grande + un botoncito debajo `[N]` con turnos restantes.
  - Click en `[N]`: decrementa duración (`combat_temporary_effects.duration_rounds`); si llega a 0, elimina la fila.
  - Long-press / segundo tap en el emoji: abre `EffectDetailModal` (nombre, tipo, valor, duración, fuente, botón eliminar).
- `combat-skills.ts`: añadir helpers `listEffectsForEnemy(participantId)`, `decrementEffectDuration(id)`, `removeEffect(id)`. (Hoy sólo hay flujos parciales).
- i18n: `combat.actions`, `combat.hideActions`, `combat.effects.reduce`, `combat.effects.remove`, `combat.effects.detail`.

### No toca

Lógica de daño, curación, sheet, edit, clone, delete, turnos, iniciativa, logs.

---

## Fase 2 — Sistema de efectos aplicables (jugadores + enemigos + entidades)

Esta fase introduce el modelo de datos completo y los modales para crearlos.

### Migración DB

Extender `combat_temporary_effects` (ya existe) con columnas que faltan:

- `kind` text (`condition` | `buff` | `debuff` | `shield` | `extra_def` | `extra_dmg` | `extra_max_hp` | `control` | `note`).
- `name` text, `icon` text (emoji), `description` text.
- `remaining_value` int (para escudos).
- `visibility` text (`public` | `dm`).
- `is_manual` bool (no auto-decrementa).
- `source_label` text.

Más índices por `encounter_id` y `target_*`. Realtime ya disponible vía publicación o se añade.

### UI / lógica

- En `ConditionsPanel` (Character Sheet), si hay combate activo, botón `Apply effect to…`.
- Nuevo `ApplyEffectModal`:
  1. **Target picker**: jugadores activos + enemigos activos (pin → enemigo original). Multi-select.
  2. **Type picker**: los 9 tipos listados (`Negative condition`, `Buff`, etc.).
  3. **Preset picker** con presets emoji (Veneno, Quemadura, …) + opción `Custom` (nombre + emoji + descripción).
  4. **Value** (condicional según tipo).
  5. **Duration** (mínimo 1, opción "manual" / "until end of combat").
  6. **Visibility** (public / dm-private).
- Validaciones de la Parte 13.
- Permisos de la Parte 11 (jugador → sus efectos + propuestas; DM → todo).
- Aplicación a múltiples targets crea una fila por target (instancia independiente).

### i18n

Todas las claves listadas en la Parte 12 entran en `es.ts` y `en.ts`.

---

## Fase 3 — Escudos, defensa extra y panel global de efectos

Lógica numérica + panel del DM. Depende de Fase 2.

### Escudos (Parte 4, 5, 7)

- Cada aplicación de escudo = una fila `kind = "shield"` con `remaining_value` y `duration_rounds` propios.
- Helper `applyDamageWithShields(targetType, targetId, dmg)`:
  1. Calcular daño bruto.
  2. Restar `extra_def` activa si la fuente lo pide.
  3. Consumir escudos por orden de menor `duration_rounds` (FIFO entre empates), restando `remaining_value`.
  4. Sobrante baja HP (sin pasar de 0).
  5. Log: `Shield absorbed X` y `Y to HP`.
- Reglas: valores se suman en la vista total pero duraciones NUNCA se combinan; un nuevo escudo no renueva los anteriores.
- Distribución grupal (Parte 7) en `ApplyEffectModal`: opciones `Same`, `Split total`, `Manual` con preview antes de aplicar.

### Defensa extra (Parte 6)

- Filas `kind = "extra_def"` con `value` positivo o negativo.
- Helper `effectiveDefense(target)` = DEF base + suma de buffs - debuffs activos.
- Daño con defensa pasa por `effectiveDefense`.

### Panel global del DM (Parte 9)

- Nuevo bloque colapsable `Active Effects` en `CombatDMPanel`:
  - Lista plana de efectos del encuentro: target | emoji | name | type | value | duration | source | botones reducir/eliminar.

### Realtime (Parte 10)

- Suscripción `postgres_changes` sobre `combat_temporary_effects` filtrada por `encounter_id` para refrescar tarjetas, sheet y panel DM.

### Integración con flujos existentes

- `EnemyDamageModal`: usar `applyDamageWithShields` para enemigos (no rompe DEF actual: añade escudos como una capa nueva).
- `applyEnemyDamage` sobre jugadores: idem.

---

## Detalles técnicos (referencia)

```text
combat_temporary_effects (existente, se amplía)
 ├── kind            text
 ├── icon            text   -- emoji
 ├── name            text
 ├── description     text
 ├── value           int    -- escudo: total inicial; def: bonus; etc.
 ├── remaining_value int    -- sólo escudos
 ├── duration_rounds int    -- ya existe
 ├── is_manual       bool
 ├── visibility      text   -- 'public' | 'dm'
 └── source_label    text
```

Orden de cálculo de daño:

```text
raw -> (− effective_def si aplica) -> hits shields FIFO -> remainder hits HP
```

---

## ¿Cómo procedemos?

Por tamaño no es realista entregar las 3 fases en un solo turno sin romper algo. Te propongo:

- **Empezar por Fase 1** (UI compacta + visualización de efectos existentes). Es la que más impacto visual te da y no toca lógica de combate.
- Confirmar que todo sigue funcionando.
- Pasar a Fase 2 (modelo de datos + `ApplyEffectModal`).
- Cerrar con Fase 3 (escudos, defensa extra, panel DM, realtime).

Dime si arranco con la Fase 1 tal cual está descrita, o si quieres reordenar (por ejemplo, hacer escudos antes que el panel DM).
