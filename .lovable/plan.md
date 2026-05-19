## Resumen

Implementar 10 mejoras agrupadas en bloques que comparten infraestructura (realtime, i18n, modales reutilizables). Todo respeta el sistema de tokens, traducciones EN/ES y RLS existentes.

---

## 1. HP en tiempo real en Escenario al equipar/desequipar

**Problema:** Al equipar un objeto, el HP máximo y actual se recalcula en BD (`clampHpForOwner`) pero el Escenario solo escucha cambios en `characters`, no en `items`. Si el cambio de HP se hace en el mismo tick que el equip, llega; si no, el HUD del escenario queda desactualizado.

**Solución:**
- En `Escenario.tsx`, además de la suscripción a `characters`, suscribirse al canal de `items` filtrado por `campaign_id` y, ante cualquier INSERT/UPDATE/DELETE, refetchear personajes (o recalcular maxHp con `totals()`).
- Verificar que `clampHpForOwner` se llama tanto en equip como en unequip (ya existe en `hp.ts`).

---

## 2. Menú "Crear" accesible para Jugadores

**Solución:**
- En `campaign.profile.tsx` (vista del personaje del jugador), añadir botón "Crear" que abra los mismos editores (`ItemEditor`, `BoosterEditor`) que usa el DM, pero el resultado va al inventario propio del jugador (owner_character_id = su personaje) en lugar del Vault.
- Reutilizar componentes existentes con prop opcional `defaultOwnerId`.
- i18n keys: `create`, `createItem`, `createBooster`.

---

## 3. Rework vista de Potenciador (jugador)

**Cambios en `BoosterCard` / modal de booster:**
- Quitar el selector "a quién" siempre visible.
- Layout de botones en grid 2x2:
  - Fila 1: `Usar` | `Transferir`
  - Fila 2: `Mostrar en chat` | 🗑️ (transferir a DM)
- Al pulsar `Transferir`, abrir un popover/dialog con la lista de miembros de la campaña (de `campaign_members` join `app_users`, incluye desconectados) suscrita en realtime. Seleccionar destinatario → confirmar → ejecutar transferencia.
- Botones tamaño uniforme (no full-width).

---

## 4. Menú "Skills" para jugadores + administración por DM

**DB (migration):**
```sql
create table public.skill_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id uuid not null,        -- jugador propietario
  external_id text,             -- id del Excel
  name text not null,
  description text,
  tipo text, modo_lanzamiento text, distancia text,
  objetivos text, dados text, efecto text,
  rarity item_rarity not null default 'white',
  unlocked boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.skill_templates enable row level security;
create policy public_all on public.skill_templates for all using (true) with check (true);
alter publication supabase_realtime add table public.skill_templates;
```

**UI:**
- Nueva ruta/tab `campaign.skills.tsx` para jugador → lista en formato igual a Potenciadores, modal con misma estética.
- Botón "Skills" en menú superior entre Potenciadores y Notas (jugador).
- En DM: menú "Skills" (segunda fila, ver punto 5) → seleccionar jugador → subir Excel (reutilizar `boosterImport.ts` adaptado a `skillImport.ts`) → poblar `skill_templates`.

---

## 5. Segunda fila de menús para Dungeon Master

- En el shell del DM, añadir una segunda barra con botones: `Skills` y `Recompensas`.
- i18n: `skills` / `Skills`, `rewards` / `Recompensas`.

---

## 6. Vault clasificado por tópicos

**En `campaign.dm.tsx` (Vault):**
- Entre la fila de acciones y la grilla, añadir tira de botones-icono cuadrados:
  - ⚔️ Equipamiento (sub-filtros: casco, pechera, guantes, botas, arma, escudo, anillo, collar, capa, cinturón, pantalón, hombrera)
  - 🧪 Objetos (sub-filtros por `category`: comida, consumible, otro)
  - ✨ Potenciadores
  - 💰 Monedas (si aplica)
- Filtros visuales con estado local; al seleccionar tópico aparecen sub-chips.

---

## 7. Sistema de recompensas aleatorias

**UI:** Botón "Recompensas" en segunda fila del DM (junto a Skills).

**Modal:**
1. Seleccionar jugador (de `campaign_members`).
2. Elegir tipo: `Potenciador | Equipamiento | Objeto | Skill | Monedas`.
3. Algoritmo de aleatoriedad fuerte: `crypto.getRandomValues()` (no `Math.random`) para evitar sesgos.
4. Reglas:
   - **Potenciador:** uniforme entre todos los `boosters` plantilla → clona y asigna a jugador.
   - **Equipamiento:** primero rareza por pesos `{white:0.45, blue:0.35, purple:0.15, gold:0.05}`, luego uniforme entre items que cumplan rareza; clona y entrega.
   - **Objeto:** uniforme entre objetos no-equipamiento.
   - **Skill:** uniforme entre skills de su personaje aún no desbloqueadas (o de catálogo).
   - **Monedas:** rango configurable (ej. 10-100).
5. Toast + log de recompensa.

---

## 8. Ocultar botón eliminar en booster desde perfil jugador

- En el modal de booster cuando se abre desde `campaign.profile.tsx` (vista DM del jugador), ocultar el botón "Eliminar". Mantenerlo solo en la lista global de Potenciadores del DM.

---

## 9. Panel Maestro: IPs bloqueadas en realtime + username

**En `master.tsx`:**
- Suscribirse a `postgres_changes` de `login_attempts` filtrado por `blocked_until is not null`.
- Para cada IP bloqueada, hacer lookup en `app_users` por intentos previos (necesitamos columna `username` en `login_attempts` o LEFT JOIN). Añadir columna `username` (nullable) a `login_attempts` y registrarla al fallar el login.
- Mostrar columnas: IP, Usuario, Bloqueado hasta, Intentos.

---

## 10. Lore/descripción en equipamiento

**DB:** la tabla `items` ya tiene `description`. Solo falta usarla.

**UI:**
- `ItemEditor`: añadir `<textarea>` "Nota / Lore" enlazado a `description` (solo para slots de equipamiento; ya existe para otros tipos, validar).
- `ItemModal` / `ItemView`: mostrar un cuadro con la `description` si existe, estilo "lore" (tipografía itálica, borde sutil).

---

## Orden de implementación

1. Migración SQL (skills + columna `username` en login_attempts) → esperar aprobación.
2. Backend/realtime: Escenario items, master.tsx, skill_templates.
3. UI: rework Booster (3+8), Crear para jugador (2), Skills (4), segunda fila DM (5), Recompensas (7), Vault filtros (6), descripción equipamiento (10), HP realtime (1).
4. i18n EN/ES en cada paso.

---

## Detalles técnicos

- **Aleatoriedad:** util `secureRandomChoice<T>(arr: T[]): T` y `weightedChoice<T>(items: {value:T, weight:number}[])` usando `crypto.getRandomValues(new Uint32Array(1))[0] / 2**32`.
- **Realtime items en Escenario:** un canal compartido `escenario:${campaignId}` con dos `.on('postgres_changes', { table: 'characters' })` y `{ table: 'items' }`.
- **Lista de miembros para transferir:** query `campaign_members` join `app_users` por `campaign_id`; suscripción `postgres_changes` a `campaign_members`.
- **Excel skills:** mismo flujo que boosters (mismas columnas + `unlocked`).
- **Filtros Vault:** estado `{ topic: 'equipment'|'items'|'boosters'|null, subtopic: string|null }`.

---

## Archivos a tocar (estimado)

- `supabase/migrations/...` (nueva)
- `src/components/app/Escenario.tsx`
- `src/components/app/BoosterCard.tsx`, `BoosterEditor.tsx`
- `src/components/app/ItemEditor.tsx`, `ItemModal.tsx`, `ItemView.tsx`
- `src/components/app/CampaignActionsModal.tsx` o nuevo `RewardsModal.tsx`
- `src/components/app/SkillsImport.tsx` (nuevo), `SkillCard.tsx` (nuevo), `SkillModal.tsx` (nuevo)
- `src/routes/campaign.profile.tsx`, `campaign.dm.tsx`, `campaign.boosters.tsx`, `campaign.tsx`, `master.tsx`
- `src/routes/campaign.skills.tsx` (nuevo), `campaign.rewards.tsx` (nuevo, modal o route)
- `src/lib/locales/en.ts`, `es.ts`
- `src/lib/random.ts` (nuevo)
- `src/lib/skillImport.ts` (nuevo)
- `src/integrations/supabase/types.ts` (auto)

Confirma y procedo.
