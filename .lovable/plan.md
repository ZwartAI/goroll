## Resumen
Implementar 7 mejoras: usernames únicos + rate limiting de login, cuenta Maestra con panel admin, fondo global personalizable, sonido de clic, toast de "Cambios confirmados", fix de z-index en modales, y sistema de Efectos de Condición.

---

## 1. Usernames únicos + bloqueo por intentos fallidos

**DB (migración):**
- Índice único `UNIQUE (lower(username))` en `app_users` para evitar duplicados case-insensitive.
- Nueva tabla `login_attempts` (`ip text`, `username text`, `failed_count int`, `last_failed_at timestamptz`, `blocked_until timestamptz`, `next_try_at timestamptz`).
- Server function `attemptLogin(username, pin)` que:
  - Lee IP del request.
  - Verifica si `blocked_until > now()` → bloqueado hasta el día siguiente.
  - Si `next_try_at > now()` → "espera 15s".
  - Valida pin. Si falla: incrementa `failed_count`, fija `next_try_at = now()+15s`. Al 4º fallo: `blocked_until = mañana 00:00`.
  - Si ok: limpia attempts.

**Cliente:** `src/routes/index.tsx` llama a la server fn en lugar de query directa, y muestra toasts con mensaje del servidor.

---

## 2. Cuenta Maestra `MasterAcc1000` / pin `1234`

- Seed en migración (insert si no existe).
- Detectar en login si `username === "MasterAcc1000"` → marcar sesión con `isMaster: true` (en `Session` localStorage).
- Nueva ruta `/master` (sólo accesible si `isMaster`):
  - Lista de `app_users` con: nombre, fecha, estado (bloqueado/no), botones **Eliminar**, **Quitar bloqueo**, **Entrar como**.
  - "Entrar como" sustituye `getSession`/`StoredUser` por la del usuario seleccionado y navega a `/`.
  - "Eliminar" hace cascade manual (campañas/personajes/items que posea).
- Guardia: si un usuario normal intenta navegar a `/master`, redirige a `/`.

---

## 3. Fondo global personalizable

- Nueva tabla `app_settings` (`key text PK`, `value text`) con fila `background_url`.
- Bucket público `backgrounds` en Supabase Storage.
- En `__root.tsx`: cargar `background_url` y aplicarlo al `<body>` (cover/fixed) — visible en toda la app.
- En `/master`: subir imagen, preview y guardar URL.

---

## 4. Sonido de clic en botones

- Añadir `src/assets/click.mp3` (archivo corto, suave).
- Hook `useClickSound()` que crea un único `Audio` y lo reproduce en cada click global.
- Listener `document.addEventListener('click', …)` montado en `__root.tsx` que dispara el sonido cuando el target o un ancestro es `<button>`, `[role="button"]` o `<a>`. Cubre toda la app sin tocar cada botón.
- Toggle de mute persistente en localStorage (icono pequeño en header).

---

## 5. Toast "Cambios confirmados" tras guardar

- Helper `toastSaved()` con `sonner` que muestra toast 1s con texto "Cambios confirmados" y auto-cierra.
- Llamar en cada handler de "Guardar" existente: `campaign.settings.tsx`, `campaign.profile.tsx`, `ItemEditor.tsx`, achievements, etc.

---

## 6. Z-index de modales sobre la ficha del personaje

- En `CharacterSheetModal` (Dialog) y en `ItemModal`/`ItemEditor`: fijar `z-index` distintos. El editor de ítems debe tener z-index mayor que la hoja de personaje.
- Corregir `DialogContent`/overlays para que el editor abierto desde dentro del sheet quede al frente.

---

## 7. Efectos de Condición

**DB (migración):**
- Tabla `condition_effects_catalog` (catálogo): `id`, `campaign_id` (null = global predefinidos), `key`, `label`, `icon` (emoji), `damage_per_turn_default int`, `is_damage boolean`. Seed con los 27 efectos listados; los 7 que dañan (quemado, envenenado, fracturado, herido, sangrando, ahogado, estrangulamiento) marcados `is_damage=true`.
- Tabla `character_conditions`: `id`, `character_id`, `catalog_id`, `label`, `icon`, `turns_left int`, `damage_per_turn int`, `created_at`. Realtime habilitado.

**UI ficha personaje (`campaign.profile.tsx` o sheet):**
- Sección "Efectos de condición": lista de chips con icono + nombre + botón a la derecha mostrando `turns_left`.
- Botón **+ Aplicar efecto**: modal con select del catálogo, input "turnos" e input "daño por turno" (visible si efecto daña).
- Cada click en el botón de turnos: `turns_left -= 1`. Si efecto daña: `current_hp -= damage_per_turn` y agrega log "X sufre Y de daño por <efecto>". Al llegar a 0 elimina la condición.

**DM "Crear" (`campaign.dm.tsx`):**
- Sección "Efectos de condición":
  - Crear nuevo efecto (campo nombre, icono, default daño, marcar si daña).
  - Aplicar efecto: seleccionar efecto + multi-select de personajes de la campaña (similar a logros) + turnos + daño → inserta una fila en `character_conditions` por cada personaje.

---

## Detalles técnicos

- IP capture: `request.headers.get('cf-connecting-ip') ?? 'x-forwarded-for' ?? 'unknown'` dentro de la server function.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE character_conditions, app_settings;`
- Para "entrar como otra cuenta" desde Master, no se requiere PIN (es el propio admin); se marca el flag `impersonatedBy` para auditoría visible.
- El sonido se sirve como asset estático y se precarga una vez para evitar latencia.

---

## Orden de ejecución
1. Migración DB (todas las tablas/seeds en una sola).
2. Server functions de login/rate-limit.
3. Ruta `/master` + flag de sesión.
4. Fondo global + storage.
5. Sonido + toast global.
6. Fix de z-index.
7. Sistema de condiciones (catálogo + UI personaje + UI DM).

¿Apruebas el plan o quieres recortar/modificar algo? Por el tamaño, sugiero confirmarlo antes de empezar — son ~6-8 archivos nuevos y ~10 modificados.