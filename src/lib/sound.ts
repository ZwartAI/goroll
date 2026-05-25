// Button click + notification sounds.
import buttonSoundUrl from "@/assets/sounds/button.ogg";

let ctx: AudioContext | null = null;
const KEY = "codice.clickSound";

// Decoded buffer cache for the button click asset.
let buttonBuffer: AudioBuffer | null = null;
let buttonLoading: Promise<AudioBuffer | null> | null = null;
const sfxBytes = new Map<string, ArrayBuffer>();
const sfxByteLoads = new Map<string, Promise<ArrayBuffer | null>>();
const sfxBuffers = new Map<string, AudioBuffer>();
const sfxBufferLoads = new Map<string, Promise<AudioBuffer | null>>();
const sfxElements = new Map<string, HTMLAudioElement>();

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(KEY) !== "off";
}
export function setSoundOn(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "on" : "off");
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

async function loadButtonBuffer(c: AudioContext): Promise<AudioBuffer | null> {
  if (buttonBuffer) return buttonBuffer;
  if (buttonLoading) return buttonLoading;
  buttonLoading = (async () => {
    try {
      const res = await fetch(buttonSoundUrl);
      const arr = await res.arrayBuffer();
      const buf = await c.decodeAudioData(arr);
      buttonBuffer = buf;
      return buf;
    } catch {
      return null;
    }
  })();
  return buttonLoading;
}

/** Preload the button click sound (call once after first user gesture). */
export function preloadButtonSound() {
  const c = ensureCtx();
  if (!c) return;
  loadButtonBuffer(c);
}

function warmSfxElement(url: string) {
  if (typeof window === "undefined") return null;
  const cached = sfxElements.get(url);
  if (cached) return cached;
  try {
    const a = new Audio();
    a.preload = "auto";
    a.src = url;
    a.load();
    sfxElements.set(url, a);
    return a;
  } catch {
    return null;
  }
}

async function loadSfxBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = sfxBytes.get(url);
  if (cached) return cached.slice(0);
  const loading = sfxByteLoads.get(url);
  if (loading) {
    const bytes = await loading;
    return bytes ? bytes.slice(0) : null;
  }

  const nextLoad = (async () => {
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      sfxBytes.set(url, arr);
      return arr;
    } catch {
      return null;
    } finally {
      sfxByteLoads.delete(url);
    }
  })();

  sfxByteLoads.set(url, nextLoad);
  const bytes = await nextLoad;
  return bytes ? bytes.slice(0) : null;
}

async function loadSfxBuffer(url: string, c: AudioContext): Promise<AudioBuffer | null> {
  const cached = sfxBuffers.get(url);
  if (cached) return cached;
  const loading = sfxBufferLoads.get(url);
  if (loading) return loading;

  const nextLoad = (async () => {
    try {
      const bytes = await loadSfxBytes(url);
      if (!bytes) return null;
      const buf = await c.decodeAudioData(bytes);
      sfxBuffers.set(url, buf);
      return buf;
    } catch {
      return null;
    } finally {
      sfxBufferLoads.delete(url);
    }
  })();

  sfxBufferLoads.set(url, nextLoad);
  return nextLoad;
}

function playDecodedBuffer(c: AudioContext, buffer: AudioBuffer) {
  try {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(c.destination);
    src.start();
    return true;
  } catch {
    return false;
  }
}

function playHtmlSfx(url: string) {
  const warmed = warmSfxElement(url);
  if (!warmed) return;
  try {
    const a = warmed.cloneNode() as HTMLAudioElement;
    a.src = url;
    a.preload = "auto";
    a.volume = 0.9;
    void a.play().catch(() => {});
  } catch { /* ignore */ }
}

export function preloadSfx(urls: string[]) {
  if (typeof window === "undefined") return;
  const c = ensureCtx();
  urls.forEach((url) => {
    if (!url) return;
    warmSfxElement(url);
    void loadSfxBytes(url);
    if (c) void loadSfxBuffer(url, c);
  });
}

export function playClick() {
  if (!isSoundOn()) return;
  const c = ensureCtx();
  if (!c) return;
  if (buttonBuffer) {
    try {
      const src = c.createBufferSource();
      src.buffer = buttonBuffer;
      const g = c.createGain();
      g.gain.value = 0.55;
      src.connect(g).connect(c.destination);
      src.start();
      return;
    } catch { /* ignore */ }
  }
  // Buffer not ready yet: trigger load but stay silent. We no longer emit
  // the synthetic fallback click so the entire app uses a single,
  // consistent button sound across every screen.
  loadButtonBuffer(c);
}

/** Subtle "ding" bell for notifications (synthetic, no asset). */
export function playNotification() {
  if (!isSoundOn()) return;
  const c = ensureCtx();
  if (!c) return;
  try {
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    g.connect(c.destination);

    const tones = [1320, 1760]; // gentle two-tone bell
    tones.forEach((freq, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now + i * 0.06);
      o.connect(g);
      o.start(now + i * 0.06);
      o.stop(now + 0.75);
    });
  } catch { /* ignore */ }
}

/** Mounts a global click listener on <button>, [role=button], <a>. Idempotent. */
let mounted = false;
export function mountGlobalClickSound() {
  if (typeof window === "undefined" || mounted) return;
  mounted = true;
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const el = t.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
    if (!el) return;
    // Skip if this element (or ancestor) opts out via data-sfx (custom SFX handles its own sound).
    if ((el as HTMLElement).closest("[data-sfx]")) return;
    playClick();
  }, true);
}

/**
 * Play a one-shot sound effect from a URL. Each call plays once and survives
 * client-side navigation (detached HTMLAudioElement tied to the document).
 */
export function playSfx(url: string) {
  if (!isSoundOn() || typeof window === "undefined") return;
  warmSfxElement(url);
  const c = ensureCtx();
  if (c) {
    const cached = sfxBuffers.get(url);
    if (cached && playDecodedBuffer(c, cached)) return;
    void loadSfxBuffer(url, c);
  }
  playHtmlSfx(url);
}
