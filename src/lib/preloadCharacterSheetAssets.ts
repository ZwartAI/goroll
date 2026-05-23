// Centralized list + preloader for character-sheet visual assets.
// Imported by both the home/role-selection screen (to warm the cache early)
// and the /campaign/profile route (as a fallback when entered directly).
import tabActiveBg from "@/assets/tab-active.png";
import tabInactiveBg from "@/assets/tab-inactive.png";
import hpFrameBg from "@/assets/hp-frame.png";
import hpButtonImg from "@/assets/hp-button.png";
import statsPanelImg from "@/assets/character-sheet/stats-panel.png";
import pursePanelImg from "@/assets/character-sheet/purse-panel.png";
import portraitFrameDefault from "@/assets/character-sheet/portrait-frame-default.png";
import navEquipo from "@/assets/nav/equipo.png";
import navMochila from "@/assets/nav/mochila.png";
import navLogros from "@/assets/nav/logros.png";
import navPotenciadores from "@/assets/nav/potenciadores.png";
import navHabilidades from "@/assets/nav/habilidades.png";
import navNotas from "@/assets/nav/notas.png";

export const CHARACTER_SHEET_ASSETS: readonly string[] = [
  tabActiveBg,
  tabInactiveBg,
  hpFrameBg,
  hpButtonImg,
  statsPanelImg,
  pursePanelImg,
  portraitFrameDefault,
  navEquipo,
  navMochila,
  navLogros,
  navPotenciadores,
  navHabilidades,
  navNotas,
];

let preloaded = false;

/** Eagerly download all character-sheet assets in parallel. Idempotent. */
export function preloadCharacterSheetAssets() {
  if (preloaded || typeof window === "undefined") return;
  preloaded = true;
  for (const src of CHARACTER_SHEET_ASSETS) {
    const img = new Image();
    img.decoding = "async";
    (img as any).fetchPriority = "high";
    img.src = src;
  }
}
