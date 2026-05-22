import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, Minus, Plus, Pin } from "lucide-react";
import {
  buildOrderedTurns,
  duplicateEnemyMulti,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
  type DuplicatePlacement,
} from "@/lib/combat";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";

type Props = {
  enemy: CombatParticipant;
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins: CombatTurnPin[];
  dm: { id: string; name: string; color: string };
  onClose: () => void;
};

export function EnemyDuplicateModal({
  enemy, encounter, participants, groups, pins, dm, onClose,
}: Props) {
  const { t } = useT();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [qty, setQty] = useState(1);
  const [placement, setPlacement] = useState<DuplicatePlacement>("afterOriginal");
  const [busy, setBusy] = useState(false);

  const color = enemy.enemy_color || "var(--loss)";
  const isTierAsset = !!getEnemyAssetUrl(enemy.enemy_icon);

  const setQtySafe = (n: number) => {
    if (!Number.isFinite(n)) return;
    const v = Math.max(1, Math.min(20, Math.floor(n)));
    setQty(v);
  };

  const submit = async () => {
    if (encounter.status === "ended") {
      toast.error(t("combat.duplicate.errEnded"));
      return;
    }
    setBusy(true);
    const blocks = buildOrderedTurns(participants, groups, pins);
    const r = await duplicateEnemyMulti(enemy, encounter, blocks, qty, placement, dm);
    setBusy(false);
    if (!r.ok) {
      toast.error(t("combat.saveError"));
      return;
    }
    toast.success(t("combat.duplicate.createdOk", { n: r.created || qty }));
    onClose();
  };

  const placements: { id: DuplicatePlacement; label: string; desc: string }[] = [
    { id: "afterOriginal", label: t("combat.duplicate.afterOriginal"), desc: t("combat.duplicate.afterOriginalDesc") },
    { id: "atBeginning", label: t("combat.duplicate.atBeginning"), desc: t("combat.duplicate.atBeginningDesc") },
    { id: "atEnd", label: t("combat.duplicate.atEnd"), desc: t("combat.duplicate.atEndDesc") },
    { id: "distributePlayers", label: t("combat.duplicate.distributePlayers"), desc: t("combat.duplicate.distributePlayersDesc") },
    { id: "randomMix", label: t("combat.duplicate.randomMix"), desc: t("combat.duplicate.randomMixDesc") },
    { id: "sameInitiative", label: t("combat.duplicate.sameInitiative"), desc: t("combat.duplicate.sameInitiativeDesc") },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="ornate-card max-w-md w-full p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <Copy size={16} className="text-[var(--gold)]" />
          <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
            {t("combat.duplicate.title")}
          </h3>
          <span className="ml-auto text-[10px] text-muted-foreground font-display uppercase tracking-widest">
            {step}/3
          </span>
        </div>

        {/* Enemy preview */}
        <div className="flex items-center gap-3 rounded border border-border bg-card/40 p-2">
          <div
            className="w-14 h-14 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card shrink-0"
            style={{ borderColor: color, color }}
          >
            <EnemyIcon name={enemy.enemy_icon} size={28} fill={isTierAsset} assetScale={isTierAsset ? 4 : 1} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display truncate" style={{ color }}>{enemy.display_name}</p>
            <p className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">
              HP {enemy.enemy_max_hp || 0} · DEF {enemy.enemy_defense || 0} · SPD {enemy.enemy_speed || "—"}
              {(enemy as any).enemy_role ? ` · ${(enemy as any).enemy_role}` : ""}
            </p>
          </div>
        </div>

        {/* Step 1: confirm */}
        {step === 1 && (
          <>
            <p className="text-sm">{t("combat.duplicate.confirmQ")}</p>
            <div className="text-[10px] text-muted-foreground flex items-start gap-1.5 border border-dashed border-border rounded p-2">
              <Pin size={12} className="mt-0.5 shrink-0" />
              <span>{t("combat.duplicate.pinHint")}</span>
            </div>
            <div className="flex gap-2 pt-1">
              <button className="btn-fantasy flex-1" onClick={onClose} disabled={busy}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-fantasy flex-1"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                onClick={() => setStep(2)}
              >
                {t("common.continue")} <ChevronRight size={14} className="inline -mt-0.5" />
              </button>
            </div>
          </>
        )}

        {/* Step 2: quantity */}
        {step === 2 && (
          <>
            <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">
              {t("combat.duplicate.quantityTitle")}
            </p>
            <div className="flex items-center gap-2 justify-center">
              <button
                className="btn-fantasy aspect-square !p-0 w-10 h-10 flex items-center justify-center"
                onClick={() => setQtySafe(qty - 1)}
                disabled={qty <= 1}
                aria-label="−"
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                min={1}
                max={20}
                value={qty}
                onChange={e => setQtySafe(parseInt(e.target.value, 10))}
                className="w-20 text-center bg-secondary/40 border border-border rounded-md px-2 py-2 text-lg font-display"
              />
              <button
                className="btn-fantasy aspect-square !p-0 w-10 h-10 flex items-center justify-center"
                onClick={() => setQtySafe(qty + 1)}
                disabled={qty >= 20}
                aria-label="+"
              >
                <Plus size={16} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              {t("combat.duplicate.quantityHelp")}
            </p>
            <p className="text-[10px] text-muted-foreground text-center">
              {t("combat.duplicate.quantityRange")}
            </p>

            <div className="flex gap-2 pt-1">
              <button className="btn-fantasy flex-1" onClick={() => setStep(1)} disabled={busy}>
                <ChevronLeft size={14} className="inline -mt-0.5" /> {t("common.back")}
              </button>
              <button
                className="btn-fantasy flex-1"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                onClick={() => setStep(3)}
              >
                {t("common.continue")} <ChevronRight size={14} className="inline -mt-0.5" />
              </button>
            </div>
          </>
        )}

        {/* Step 3: placement */}
        {step === 3 && (
          <>
            <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">
              {t("combat.duplicate.placementTitle")}
            </p>
            <div className="space-y-1.5">
              {placements.map(opt => {
                const active = placement === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPlacement(opt.id)}
                    className="w-full text-left rounded border px-2 py-1.5 transition"
                    style={{
                      borderColor: active ? "var(--gold)" : "var(--border)",
                      background: active
                        ? "color-mix(in oklab, var(--gold) 18%, var(--card))"
                        : "var(--card)",
                    }}
                  >
                    <p className="text-[12px] font-display">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-1">
              <button className="btn-fantasy flex-1" onClick={() => setStep(2)} disabled={busy}>
                <ChevronLeft size={14} className="inline -mt-0.5" /> {t("common.back")}
              </button>
              <button
                className="btn-fantasy flex-1"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                onClick={submit}
                disabled={busy}
              >
                {busy ? "…" : t("combat.duplicate.create")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
