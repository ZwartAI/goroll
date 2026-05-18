import { useEffect, useState, useCallback } from "react";
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
  created_at: string;
};

/**
 * Mounted on the DM page. If the current user is the OWNER of the active
 * campaign and there are pending Co-DM join requests for that campaign,
 * show a blocking modal until they answer Sí / No.
 */
export function DMRequestGate({ campaignId, ownerUserId }: { campaignId: string; ownerUserId: string | null }) {
  const { t } = useT();
  const me = getStoredUser();
  const isOwner = !!me && !!ownerUserId && me.id === ownerUserId;
  const [pending, setPending] = useState<Req[]>([]);


  const reload = useCallback(async () => {
    if (!isOwner) return;
    const { data } = await (supabase as any).from("dm_join_requests")
      .select("*").eq("campaign_id", campaignId).eq("status", "pending")
      .order("created_at", { ascending: true });
    setPending((data || []) as Req[]);
  }, [campaignId, isOwner]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!isOwner) return;
    const ch = (supabase as any).channel(`dmreq:owner:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_join_requests", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [campaignId, isOwner, reload]);

  if (!isOwner || pending.length === 0) return null;
  const req = pending[0];

  async function decide(approve: boolean) {
    const { error } = await (supabase as any).from("dm_join_requests")
      .update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    if (approve) {
      // Grant DM membership
      await (supabase as any).from("campaign_members")
        .upsert({ campaign_id: campaignId, user_id: req.requester_user_id, role: "dm" },
          { onConflict: "campaign_id,user_id" });
      toast.success(t("dmGate.nowCoDM", { name: req.requester_username }));
    } else {
      toast.info(t("dmGate.rejected", { name: req.requester_username }));
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ornate-card p-6 max-w-sm w-full space-y-4 text-center">
        <h2 className="font-display text-lg text-[var(--gold)]">{t("dmGate.title")}</h2>
        <p className="text-sm">
          <span className="font-display text-[var(--gold)]">{req.requester_username}</span>{" "}
          {t("dmGate.body")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("dmGate.hint")}
        </p>
        <div className="flex gap-2">
          <button className="btn-fantasy flex-1" onClick={() => decide(true)}>{t("common.yes")}</button>
          <button className="btn-fantasy flex-1"
            style={{ background: "var(--loss)", color: "white" }}
            onClick={() => decide(false)}>{t("common.no")}</button>
        </div>
        {pending.length > 1 && (
          <p className="text-[10px] text-muted-foreground">{t("dmGate.moreWaiting", { n: pending.length - 1 })}</p>
        )}
      </div>
    </div>
  );
}

