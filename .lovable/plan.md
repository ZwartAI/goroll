## Objetivo
Reemplazar la tarjeta de login por el asset dorado. La UI de login se vuelve totalmente transparente (sin bordes, sin fondos, sin "card" adicional) y los inputs/PIN/botón se posicionan dentro de los huecos del propio asset. Botón con texto "Entrar →" (ES) / "Join →" (EN), con un efecto luminoso vistoso al pulsarlo.

## Cambios

### 1. Asset
- Copiar `user-uploads://Asset_sin_fondo.png` → `src/assets/login-frame.png` (PNG con transparencia).

### 2. `src/routes/index.tsx` — sólo el bloque `step === "login"`
- Eliminar `ornate-card`, el `<h2>` "Enter the Codex" y el párrafo de hint. El marco ya comunica todo eso visualmente.
- Contenedor cuadrado responsivo: `width: min(92vw, 480px)`, `aspect-ratio: 1/1`, centrado, con `background-image: url(login-frame.png)`, `background-size: 100% 100%`, `no-repeat`. Sin borde, sin fondo extra.
- Hijos posicionados con `position: absolute` y porcentajes:
  - **Username**: input transparente sobre la franja larga superior. Sin `border`, sin `background`, sin `ring`. Texto dorado, `font-display`, padding-left ~14% para esquivar el avatar pintado en el asset.
  - **PIN**: 4 `<input>` independientes alineados con los 4 cuadros del asset:
    - `maxLength={1}`, `inputMode="numeric"`, transparente, sin borde, centrado, font grande dorada.
    - Al teclear un dígito → foco al siguiente.
    - Backspace en uno vacío → foco al anterior y borra ese.
    - Pegar 4 dígitos → llena los 4.
    - Estado `pinDigits: string[4]`; el `pin` para `login()` = `pinDigits.join("")`.
    - Enter en el último → dispara `login()`.
  - **Botón Enter/Join**: `<button>` sobre el rectángulo rojo, transparente (sin fondo, sin borde), texto centrado `font-display` dorado. Texto desde `home.enterCta`.
- Coordenadas iniciales (porcentajes sobre contenedor cuadrado, a afinar tras render):
  - Username: top 36%, left 11%, width 78%, height 11%, paddingLeft ~14%.
  - Fila PIN: top 55%, left 16%, width 68%, height 14%; 4 cajas con `flex justify-between`, cada caja ~12% del ancho.
  - Botón: top 76%, left 11%, width 78%, height 12%.

### 3. Efecto luminoso del botón al pulsar
- Animación CSS dedicada en `src/styles.css`: `@keyframes login-text-glow` que pulsa `text-shadow` y `filter: brightness/drop-shadow` para irradiar luz dorada/blanca cálida desde las letras.
  - Frames: 0% sombra suave → 50% sombra intensa multi-capa (p.ej. `0 0 8px #fff, 0 0 18px var(--gold), 0 0 36px var(--gold), 0 0 60px rgba(255,215,120,0.8)`) + `brightness(1.6)` → 100% vuelta a suave.
  - Duración ~700ms, `ease-out`, sin loop.
- Clase `.login-cta` aplicada al botón con:
  - Estado base: text-shadow tenue dorado para que las letras se vean integradas con el asset.
  - `:active` y mientras `busy`/loading: aplicar `animation: login-text-glow .7s ease-out` y `color` ligeramente más cálido.
  - Se reinicia la animación en cada click usando un truco React: estado `pulseKey` que se incrementa al hacer click y se aplica como `key` al `<span>` interior, forzando re-mount y re-disparo de la animación incluso en clicks rápidos consecutivos.
- Respetar `prefers-reduced-motion`: dentro del media query, la animación se reduce a un simple cambio de brillo sin pulsos largos.

### 4. i18n
- Añadir `home.enterCta`:
  - `src/lib/locales/es.ts`: `"Entrar →"`
  - `src/lib/locales/en.ts`: `"Join →"`
- `home.enter` existente se deja intacto.

### 5. Verificación visual
- Render en viewport 558×867 y comprobar:
  - Inputs sin bordes/fondos propios; sólo se ve el marco del asset.
  - Dígitos del PIN centrados dentro de cada cuadro dorado.
  - Botón rojo del asset limpio, sin rectángulo superpuesto.
  - Al pulsar "Entrar → / Join →" las letras emiten un destello dorado claramente visible y la animación se reinicia en cada pulsación.
- Ajustar porcentajes si algún elemento no calza exactamente en su hueco.

## Archivos tocados
- `src/assets/login-frame.png` (nuevo)
- `src/routes/index.tsx` (sólo bloque `step === "login"`)
- `src/styles.css` (keyframes `login-text-glow` + clase `.login-cta`)
- `src/lib/locales/es.ts`, `src/lib/locales/en.ts`
