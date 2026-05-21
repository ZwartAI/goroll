import { useEffect } from "react";

/**
 * Prevents the browser/device back button from leaving the campaign area.
 * Pushes a sentinel history entry; if the user pops, we re-push to stay put.
 * The only way out is via the sidebar "Exit" action.
 */
export function BackNavTrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SENTINEL = { __campaignTrap: true } as const;

    // Seed an extra entry so the first back press has something to consume.
    try {
      window.history.pushState(SENTINEL, "");
    } catch {}

    const onPop = () => {
      // Re-push to keep the user on the current URL.
      try {
        window.history.pushState(SENTINEL, "");
      } catch {}
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  return null;
}
