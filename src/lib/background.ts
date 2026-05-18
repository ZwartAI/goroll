import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "background_url";
const CACHE_KEY = "go_roll_bg_url_v1";

/**
 * Returns an optimized variant of a Supabase Storage public URL by rewriting
 * `/object/public/` to `/render/image/public/` with transform params. Leaves
 * non-Supabase URLs untouched.
 */
function optimize(url: string): string {
  if (!url) return url;
  try {
    if (url.includes("/storage/v1/object/public/")) {
      const u = new URL(url);
      u.pathname = u.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );
      u.searchParams.set("width", "1600");
      u.searchParams.set("quality", "70");
      u.searchParams.set("resize", "cover");
      return u.toString();
    }
  } catch {}
  return url;
}

function applyToBody(url: string) {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (url) {
    const opt = optimize(url);
    body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.65)), url("${opt}")`;
    body.style.backgroundSize = "cover";
    body.style.backgroundPosition = "center";
    body.style.backgroundAttachment = "fixed";
    body.style.backgroundRepeat = "no-repeat";
    // Preload hint so browser fetches with high priority.
    try {
      const id = "bg-preload-link";
      let link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.id = id;
        link.rel = "preload";
        link.as = "image";
        (link as any).fetchPriority = "high";
        document.head.appendChild(link);
      }
      if (link.href !== opt) link.href = opt;
    } catch {}
  } else {
    body.style.backgroundImage = "";
  }
}

// Apply cached background synchronously on module load (before React mounts)
// so the user never sees a flash.
if (typeof window !== "undefined") {
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (cached) applyToBody(cached);
  } catch {}
}

export function useGlobalBackground() {
  const [url, setUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(CACHE_KEY) || ""; } catch { return ""; }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      if (cancelled) return;
      const next = (data?.value as string) || "";
      setUrl(next);
      try {
        if (next) window.localStorage.setItem(CACHE_KEY, next);
        else window.localStorage.removeItem(CACHE_KEY);
      } catch {}
    })();
    const channel = (supabase as any)
      .channel("app_settings:bg")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings" },
        (payload: any) => {
          if (payload?.new?.key === KEY) {
            const next = payload.new.value || "";
            setUrl(next);
            try {
              if (next) window.localStorage.setItem(CACHE_KEY, next);
              else window.localStorage.removeItem(CACHE_KEY);
            } catch {}
          }
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      (supabase as any).removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    applyToBody(url);
  }, [url]);

  return url;
}

export async function setGlobalBackground(url: string) {
  await (supabase as any).from("app_settings").upsert(
    { key: KEY, value: url },
    { onConflict: "key" },
  );
  try {
    if (url) window.localStorage.setItem(CACHE_KEY, url);
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {}
}
