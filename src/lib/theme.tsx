import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeKey =
  | "vino" | "azul" | "rojo" | "rosa" | "verde"
  | "amarillo" | "morado" | "aguamarina" | "cafe" | "blanco" | "negro";

export const THEMES: { key: ThemeKey; label: string; swatch: string }[] = [
  { key: "vino",       label: "Vino (clásico)",  swatch: "oklch(0.35 0.15 25)" },
  { key: "azul",       label: "Azul",            swatch: "oklch(0.40 0.15 250)" },
  { key: "rojo",       label: "Rojo",            swatch: "oklch(0.45 0.20 27)" },
  { key: "rosa",       label: "Rosa",            swatch: "oklch(0.60 0.15 350)" },
  { key: "verde",      label: "Verde",           swatch: "oklch(0.45 0.15 145)" },
  { key: "amarillo",   label: "Amarillo",        swatch: "oklch(0.75 0.16 90)" },
  { key: "morado",     label: "Morado",          swatch: "oklch(0.40 0.18 295)" },
  { key: "aguamarina", label: "Aguamarina",      swatch: "oklch(0.60 0.13 195)" },
  { key: "cafe",       label: "Café",            swatch: "oklch(0.35 0.07 55)" },
  { key: "blanco",     label: "Blanco",          swatch: "oklch(0.96 0.01 80)" },
  { key: "negro",      label: "Negro",           swatch: "oklch(0.10 0 0)" },
];

const KEY = "app:theme";
const ThemeCtx = createContext<{ theme: ThemeKey; setTheme: (t: ThemeKey) => void }>({
  theme: "vino", setTheme: () => {},
});

function apply(t: ThemeKey) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", t);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("vino");
  useEffect(() => {
    try {
      const stored = (localStorage.getItem(KEY) as ThemeKey) || "vino";
      setThemeState(stored);
      apply(stored);
    } catch { apply("vino"); }
  }, []);
  const setTheme = (t: ThemeKey) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch {}
    apply(t);
  };
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() { return useContext(ThemeCtx); }
