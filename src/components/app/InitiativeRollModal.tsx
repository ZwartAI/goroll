import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import type { Character } from "@/lib/game";
import { clampInitiative, createLink, submitInitiative, type CombatEncounter } from "@/lib/combat";

type Props = {
  encounter: CombatEncounter;
  character: Character;
  /** Characters online (and not the self / not DM) — selectable for an Enlace. */
  linkCandidates: Character[];
  onClose: () => void;
};

export function InitiativeRollModal({ encounter, character, linkCandidates, onClose }: Props) {
  const { t } = useT();
  const [value, setValue] = useState<string>("");
  const [link, setLink] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 2) next.add(id);
      else toast.warning(t("combat.linkMax"));
      return next;
    });
  };

  async function confirm() {
    const n = clampInitiative(Number(value));
    if (!n) { toast.error(t("combat.invalidInitiative")); return; }
    setBusy(true);
    if (link && picked.size > 0) {
      const members = linkCandidates.filter(c => picked.has(c.id));
      const res = await createLink(encounter, character, members, n);
      if (!res.ok) { toast.error(t("combat.linkError")); setBusy(false); return; }
    } else {
      const res = await submitInitiative(encounter, character, n);
      if (!res.ok) { toast.error(t("combat.submitError")); setBusy(false); return; }
    }
    toast.success(t("combat.submitted"));
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center text-[var(--gold)]">{t("combat.rollInitiativeTitle")}</h3>
        <p className="text-[11px] text-muted-foreground text-center">{t("combat.rollInitiativeHint")}</p>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.initiative")}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full mt-1 bg-secondary/40 border border-border rounded-md px-3 py-2 text-center font-display text-2xl text-[var(--gold)] outline-none focus:border-[var(--gold)]"
            placeholder="1 - 20"
          />
        </div>

        {linkCandidates.length > 0 && (
          <div className="ornate-card !p-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} />
              <span className="text-xs font-display tracking-wide text-[var(--gold)]">{t("combat.createLink")}</span>
            </label>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t("combat.linkExplain")}</p>
            {link && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {linkCandidates.map(c => {
                  const on = picked.has(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggle(c.id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded border text-left ${on ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-border bg-card"}`}>
                      <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                      <span className="text-[11px] truncate">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.close")}</button>
          <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            disabled={busy || !value} onClick={confirm}>
            {t("combat.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
