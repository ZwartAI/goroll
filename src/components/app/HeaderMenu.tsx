import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, X,
  Mail, Trophy, Skull, Mic, MicOff, Maximize2, Minimize2, LogOut,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUser } from "@/lib/game";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export type HeaderMenuItem = {
  key: string;
  label: string;
  /** Lucide-style icon component. */
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: any }>;
  /** Optional accent color for the icon (subtle). */
  color?: string;
  /** Navigate to a route, or run an action. */
  to?: string;
  onClick?: () => void;
  /** Optional right-side adornment (e.g. a badge/dot or status text). */
  trailing?: ReactNode;
  /** When the action also closes the drawer (default true). */
  keepOpen?: boolean;
};

/**
 * Trigger button + slide-in side drawer that hosts header utility actions
 * (mailbox, achievements, bestiary, mic, fullscreen, exit). Keeps the page
 * header uncluttered as more icons are added over time.
 */
export function HeaderMenu({ items }: { items: HeaderMenuItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // Lock body scroll while open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("headerMenu.open")}
        title={t("headerMenu.open")}
        className="inline-flex items-center gap-1 rounded-l-md border border-r-0 border-border bg-card/70 backdrop-blur px-1.5 py-1 text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold)] transition-colors -mr-4"
        style={{ borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }}
      >
        <ChevronLeft size={16} />
      </button>

      {open && <MailboxBadgeWatcher />}

      {open && (
        <div className="fixed inset-0 z-[220]">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-label={t("headerMenu.title")}
            className="absolute right-0 top-0 h-full w-[78%] max-w-[320px] bg-[var(--card)] border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          >
            <header className="flex items-center justify-between px-3 py-2 border-b border-border">
              <h2 className="font-display text-sm text-[var(--gold)] tracking-wider">
                {t("headerMenu.title")}
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("common.close")}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </header>
            <nav className="flex-1 overflow-y-auto py-2">
              {items.map((it, idx) => {
                const isExit = it.key === "exit";
                const cls =
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-[var(--secondary)]/60 transition-colors";
                const wrapperCls = isExit ? "mt-4 pt-3 border-t border-border/60" : "";
                const iconStyle = it.color ? { color: it.color } : undefined;
                const inner = (
                  <>
                    <it.icon size={20} strokeWidth={1.75} className="shrink-0" style={iconStyle as any} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.trailing}
                    <ChevronRight size={14} className="text-muted-foreground/60" />
                  </>
                );
                if (it.to) {
                  return (
                    <div key={it.key} className={wrapperCls}>
                      <Link
                        to={it.to as any}
                        onClick={() => setOpen(false)}
                        className={cls}
                      >
                        {inner}
                      </Link>
                    </div>
                  );
                }
                return (
                  <div key={it.key} className={wrapperCls}>
                    <button
                      type="button"
                      onClick={() => {
                        it.onClick?.();
                        if (!it.keepOpen) setOpen(false);
                      }}
                      className={cls}
                    >
                      {inner}
                    </button>
                  </div>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers / hooks
// ---------------------------------------------------------------------------

/** Subscribes to pending mailbox requests for campaigns the user owns. */
export function usePendingMailboxCount() {
  const me = getStoredUser();
  const [count, setCount] = useState(0);

  const reload = useCallback(async () => {
    if (!me) { setCount(0); return; }
    const { data: owned } = await (supabase as any).from("campaigns")
      .select("id").eq("owner_user_id", me.id);
    const ids = (owned || []).map((c: any) => c.id);
    if (!ids.length) { setCount(0); return; }
    const { data } = await (supabase as any).from("dm_join_requests")
      .select("id", { count: "exact", head: false }).in("campaign_id", ids).eq("status", "pending");
    setCount((data || []).length);
  }, [me?.id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!me) return;
    const channelName = `mailbox-count:${me.id}:${Math.random().toString(36).slice(2)}`;
    const ch = (supabase as any).channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_join_requests" }, () => reload());
    ch.subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [me?.id, reload]);

  return count;
}

// Silent component used to trigger initial subscription warming if needed.
function MailboxBadgeWatcher() { usePendingMailboxCount(); return null; }

// ---------------------------------------------------------------------------
// Embedded actions: Mailbox modal trigger reused by the menu
// ---------------------------------------------------------------------------

/** Imperatively-opened mailbox list, used by header menu entries. */
export function MailboxInlineModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const me = getStoredUser();
  const [requests, setRequests] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!me) { setRequests([]); return; }
    const { data: owned } = await (supabase as any).from("campaigns")
      .select("id,name").eq("owner_user_id", me.id);
    const ids = (owned || []).map((c: any) => c.id);
    const map: Record<string, string> = {};
    (owned || []).forEach((c: any) => { map[c.id] = c.name; });
    setNames(map);
    if (!ids.length) { setRequests([]); return; }
    const { data } = await (supabase as any).from("dm_join_requests")
      .select("*").in("campaign_id", ids).eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests(data || []);
  }, [me?.id]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  if (!open) return null;
  async function decide(r: any, approve: boolean) {
    const { error } = await (supabase as any).from("dm_join_requests")
      .update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    if (approve) {
      if (r.kind === "player_rejoin") {
        await (supabase as any).from("campaign_bans")
          .delete().eq("campaign_id", r.campaign_id).eq("user_id", r.requester_user_id);
        await (supabase as any).from("campaign_members")
          .upsert({ campaign_id: r.campaign_id, user_id: r.requester_user_id, role: "player" },
            { onConflict: "campaign_id,user_id" });
      } else {
        await (supabase as any).from("campaign_members")
          .upsert({ campaign_id: r.campaign_id, user_id: r.requester_user_id, role: "dm" },
            { onConflict: "campaign_id,user_id" });
      }
      toast.success(t("mailbox.acceptedToast"));
    } else {
      toast.info(t("mailbox.rejectedToast"));
    }
    reload();
  }

  return (
    <div className="fixed inset-0 z-[260] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg text-center text-[var(--gold)]">{t("mailbox.title")}</h2>
        {requests.length === 0 && (
          <p className="text-xs text-center text-muted-foreground py-3">{t("mailbox.empty")}</p>
        )}
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="ornate-card p-3 space-y-2">
              <p className="text-sm">
                <span className="font-display text-[var(--gold)]">{r.requester_username}</span>{" "}
                {r.kind === "player_rejoin" ? t("mailbox.reqRejoin") : t("mailbox.reqCoDM")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {t("mailbox.ofCampaign", { name: names[r.campaign_id] || "—" })}
              </p>
              <div className="flex gap-2">
                <button className="btn-fantasy flex-1 text-xs"
                  style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                  onClick={() => decide(r, true)}>{t("mailbox.accept")}</button>
                <button className="btn-fantasy flex-1 text-xs"
                  style={{ background: "var(--loss)", color: "white" }}
                  onClick={() => decide(r, false)}>{t("mailbox.reject")}</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn-fantasy w-full" onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience builder: standard items shared by all roles
// ---------------------------------------------------------------------------

export function useStandardHeaderItems(opts: {
  /** Show achievements? (Yes for DM/Player/Spectator) */
  achievements?: boolean;
  bestiary?: boolean;
  mailbox?: { onOpen: () => void };
  mic?: { enabled: boolean; toggle: () => void };
  fullscreen?: boolean;
  exit: { onExit: () => void };
}): HeaderMenuItem[] {
  const { t } = useT();
  const pending = usePendingMailboxCount();
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setIsFs(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  return useMemo(() => {
    const items: HeaderMenuItem[] = [];
    if (opts.achievements) {
      items.push({
        key: "achievements", label: t("headerMenu.achievements"),
        icon: Trophy, to: "/campaign/achievements", color: "oklch(0.75 0.12 90)",
      });
    }
    if (opts.bestiary) {
      items.push({
        key: "bestiary", label: t("headerMenu.bestiary"),
        icon: Skull, to: "/campaign/bestiary", color: "oklch(0.72 0.18 50)",
      });
    }
    if (opts.mailbox) {
      const hasPending = pending > 0;
      items.push({
        key: "mailbox", label: t("mailbox.title"),
        icon: Mail, onClick: opts.mailbox.onOpen,
        color: hasPending ? "#ffffff" : "oklch(0.65 0.02 260)",
        trailing: hasPending ? (
          <span
            className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--loss)] text-white text-[10px] font-bold flex items-center justify-center"
            style={{ boxShadow: "0 0 10px 1px rgba(255,255,255,0.55)" }}
          >
            {pending}
          </span>
        ) : undefined,
      });
    }
    if (opts.mic) {
      const enabled = opts.mic.enabled;
      items.push({
        key: "mic", label: enabled ? t("micSettings.muteMic") : t("micSettings.enableMic"),
        icon: enabled ? Mic : MicOff,
        color: enabled ? "var(--gain)" : "oklch(0.65 0.05 260)",
        onClick: opts.mic.toggle,
        keepOpen: true,
      });
    }
    if (opts.fullscreen) {
      items.push({
        key: "fs", label: isFs ? t("shell.exitFs") : t("shell.enterFs"),
        icon: isFs ? Minimize2 : Maximize2,
        color: "oklch(0.70 0.05 220)",
        keepOpen: true,
        onClick: async () => {
          try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
            else await document.exitFullscreen?.();
          } catch {}
        },
      });
    }
    items.push({
      key: "exit", label: t("headerMenu.exit"),
      icon: LogOut, color: "oklch(0.65 0.12 25)",
      onClick: opts.exit.onExit,
    });
    return items;
  }, [t, pending, isFs, opts.achievements, opts.bestiary, opts.mailbox, opts.mic?.enabled, opts.fullscreen, opts.exit]);
}
