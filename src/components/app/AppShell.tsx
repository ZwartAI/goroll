import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { useT } from "@/lib/i18n";

/** Reusable inline fullscreen toggle. Renders nothing on the server. */
export function FullscreenButton({ className = "" }: { className?: string }) {
  const [fs, setFs] = useState(false);
  const { t } = useT();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggle = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {}
  };
  return (
    <button
      onClick={toggle}
      aria-label={fs ? t("shell.exitFs") : t("shell.enterFs")}
      className={`rounded-md border border-border bg-card/60 backdrop-blur p-1.5 text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold)] transition-colors ${className}`}
    >
      {fs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    </button>
  );
}

/**
 * Top-level shell: global gestures (no-pull-to-refresh, back-block on home)
 * + floating fullscreen toggle ONLY on the home page (/).
 * On /campaign/profile the button is rendered inline by that page itself
 * (next to the logout/back button). On every other route it's hidden.
 */
export function AppShell() {
  const loc = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
    (document.body.style as any).overscrollBehaviorX = "contain";

    const onPop = () => {
      if (window.location.pathname === "/") {
        window.history.pushState(null, "", window.location.href);
      }
    };
    try { window.history.pushState(null, "", window.location.href); } catch {}
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Floating button only on the landing/login screen.
  if (loc.pathname !== "/") return null;
  return <FullscreenButton className="fixed top-1.5 right-1.5 z-[200]" />;
}
