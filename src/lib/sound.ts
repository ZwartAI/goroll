// Tiny click sound using Web Audio API (no asset needed).
let ctx: AudioContext | null = null;
const KEY = "codice.clickSound";

export function isSoundOn(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(KEY) !== "off";
}
export function setSoundOn(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, on ? "on" : "off");
}

export function playClick() {
  if (typeof window === "undefined") return;
  if (!isSoundOn()) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const c = ctx!;
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(680, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(320, c.currentTime + 0.07);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.1);
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
    if (el) playClick();
  }, true);
}
