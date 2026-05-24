import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { pushLog } from "@/lib/log";

type RequestRow = {
  id: string;
  campaign_id: string;
  character_id: string;
  condition_id: string;
  player_name: string;
  effect_label: string;
  effect_icon: string;
  status: string;
  created_at: string;
};

/**
 * DM-side inbox showing pending player requests to end a condition early.
 * Approve → deletes the condition. Reject → just resolves the request.
 */
export function EffectRemoveRequestsPanel({ campaignId }: { campaignId: string }) {
  const { t } = useT();
  const [rows, setRows] = useState<RequestRow[]>([]);

  async function reload() {
    const { data } = await (supabase as any)
      .from("effect_remove_requests")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setRows((data || []) as RequestRow[]);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [campaignId]);

  useEffect(() => {
    const ch = (supabase as any)
      .channel(`err:${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "effect_remove_requests", filter: `campaign_id=eq.${campaignId}` },
        () => reload(),
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [campaignId]);

  async function approve(r: RequestRow) {
    await (supabase as any).from("character_conditions").delete().eq("id", r.condition_id);
    await (supabase as any).from("effect_remove_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString() }).eq("id", r.id);
    await pushLog(campaignId, [
      { t: "text", v: `${r.effect_icon} ${r.effect_label} · ${r.player_name}` },
      { t: "text", v: t("turnControl.approve") },
    ]);
    toast.success(t("turnControl.approve"));
  }

  async function reject(r: RequestRow) {
    await (supabase as any).from("effect_remove_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", r.id);
    toast(t("turnControl.reject"));
  }

  if (rows.length === 0) return null;

  return (
    <div className="ornate-card p-3 mb-3 border-[var(--gold)]">
      <h3 className="font-display text-xs uppercase tracking-widest text-[var(--gold)] mb-2">
        {t("turnControl.requestRemove")}
      </h3>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1.5">
            <span className="text-base">{r.effect_icon}</span>
            <p className="flex-1 text-[11px] leading-tight">
              {t("turnControl.requestRemoveBody", { player: r.player_name, effect: r.effect_label })}
            </p>
            <button onClick={() => approve(r)} className="p-1.5 rounded bg-[var(--gold)] text-black" aria-label={t("turnControl.approve")}>
              <Check size={12} />
            </button>
            <button onClick={() => reject(r)} className="p-1.5 rounded bg-secondary text-[var(--loss)]" aria-label={t("turnControl.reject")}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
