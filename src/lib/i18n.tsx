import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { es } from "./locales/es";
import { en } from "./locales/en";
import type { Dict } from "./locales/es";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUser } from "./game";

export type Lang = "es" | "en";

const DICTS: Record<Lang, Dict> = { es, en };
const LS_KEY = "app:lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (path: string, vars?: Record<string, string | number>) => string };
const I18nCtx = createContext<Ctx>({ lang: "es", setLang: () => {}, t: (p) => p });

function pick(dict: any, path: string): string {
  const parts = path.split(".");
  let cur: any = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return path;
  }
  return typeof cur === "string" ? cur : path;
}

function format(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  // Hydrate from localStorage, then from app_users.language (if logged in)
  useEffect(() => {
    try {
      const stored = (localStorage.getItem(LS_KEY) as Lang | null);
      if (stored === "es" || stored === "en") setLangState(stored);
    } catch {}
    const u = getStoredUser();
    if (u) {
      (async () => {
        const { data } = await (supabase as any).from("app_users").select("language").eq("id", u.id).maybeSingle();
        const remote = data?.language as Lang | undefined;
        if (remote === "es" || remote === "en") {
          setLangState(remote);
          try { localStorage.setItem(LS_KEY, remote); } catch {}
        }
      })();
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LS_KEY, l); } catch {}
    const u = getStoredUser();
    if (u) {
      (supabase as any).from("app_users").update({ language: l }).eq("id", u.id).then(() => {});
    }
  }, []);

  const t = useCallback((path: string, vars?: Record<string, string | number>) => {
    const dict = DICTS[lang] ?? es;
    const fallback = pick(es, path);
    const value = pick(dict, path);
    return format(value === path ? fallback : value, vars);
  }, [lang]);

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  return useContext(I18nCtx);
}
