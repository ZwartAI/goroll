import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUser } from "@/lib/game";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

type Req = {
  id: string;
  campaign_id: string;
  requester_user_id: string;
  requester_username: string;
  status: string;
  kind: "codm" | "player_rejoin" | "player_join";
  created_at: string;
};

/**
 * Inbox icon shown next to the fullscreen button.
 * Lists pending Co-DM and player-rejoin requests for campaigns the current
 * user OWNS. A red dot appears whenever there are pending requests.
 */
export function MailboxButton({ className = "text-white" }: { className?: string }) {
  const { t } = useT();
  const me = getStoredUser();
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<Req[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    if (!me) { setRequests([]); return; }
    const { data: owned } = await (supabase as any).from("campaigns")
      .select("id,name").eq("owner_user_id", me.id);
    const ids = (owned || []).map((c: any) => c.id);
    const names: Record<string, string> = {};
    (owned || []).forEach((c: any) => { names[c.id] = c.name; });
    setCampaignNames(names);
    if (!ids.length) { setRequests([]); return; }
    const { data } = await (supabase as any).from("dm_join_requests")
      .select("*").in("campaign_id", ids).eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests((data || []) as Req[]);
  }, [me?.id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!me) return;
    const ch = (supabase as any).channel(`mailbox:${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_join_requests" }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [me?.id, reload]);

  async function decide(r: Req, approve: boolean) {
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
      } else if (r.kind === "player_join") {
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

  if (!me) return null;

  const hasPending = requests.length > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("mailbox.ariaOpen")}
        className={`relative rounded-md border border-border bg-card/60 backdrop-blur p-1.5 text-muted-foreground hover:text-[var(--gold)] hover:border-[var(--gold)] transition-colors ${className}`}
      >
        <Inbox size={14} />
        {hasPending && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--loss)] border border-background animate-pulse" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}>
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
                    {t("mailbox.ofCampaign", { name: campaignNames[r.campaign_id] || "—" })}
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
            <button className="btn-fantasy w-full" onClick={() => setOpen(false)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
