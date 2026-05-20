import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Swords, Flag, Play, ChevronLeft, ChevronRight, X, Plus, BookOpen } from "lucide-react";
import { listTemplates, spawnFromTemplate, type EnemyTemplate } from "@/lib/bestiary";
import {
  buildOrderedTurns,
  cancelInitiative,
  dmShiftTurn,
  endCombat,
  requestInitiative,
  startCombat,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
} from "@/lib/combat";
import { CombatList } from "@/components/app/CombatList";
import { EnemyEditorModal } from "@/components/app/EnemyEditorModal";
import { EnemyManagerDM } from "@/components/app/EnemyManagerDM";

type Props = {
  campaignId: string;
  dm: { id: string; name: string; color: string };
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
};

export function CombatDMPanel({ campaignId, dm, encounter, participants, groups }: Props) {
  const { t } = useT();
  const status = encounter?.status ?? null;
  const [addingEnemy, setAddingEnemy] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [templates, setTemplates] = useState<EnemyTemplate[]>([]);

  useEffect(() => {
    if (pickingTemplate) listTemplates(campaignId).then(setTemplates);
  }, [pickingTemplate, campaignId]);

  const canAddEnemy = encounter && status !== "ended";

  return (
    <div className="ornate-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Swords size={16} className="text-[var(--gold)]" />
        <h3 className="font-display text-sm uppercase tracking-widest text-[var(--gold)]">{t("combat.dmTitle")}</h3>
      </div>

      {(!encounter || status === "ended") && (
        <button className="btn-fantasy w-full" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
          onClick={async () => {
            const r = await requestInitiative(campaignId, dm);
            if (!r.ok) toast.error(t("combat.requestError"));
            else toast.success(t("combat.requested"));
          }}>
          <Flag size={14} className="inline mr-1" /> {t("combat.requestInitiative")}
        </button>
      )}

      {canAddEnemy && (
        <button className="btn-fantasy w-full text-xs"
          style={{ background: "color-mix(in oklab, var(--loss) 45%, var(--card))", color: "white" }}
          onClick={() => setAddingEnemy(true)}>
          <Plus size={14} className="inline mr-1" /> {t("combat.addEnemy")}
        </button>
      )}

      {status === "collecting" && encounter && (
        <>
          <p className="text-[11px] text-muted-foreground">{t("combat.collectingHint", { n: participants.length })}</p>
          <CombatList encounter={encounter} participants={participants} groups={groups} />
          <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} dm={dm} />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button className="btn-fantasy" style={{ background: "var(--loss)", color: "white" }}
              onClick={async () => {
                if (!confirm(t("combat.confirmCancel"))) return;
                const r = await cancelInitiative(encounter, dm);
                if (!r.ok) toast.error(t("combat.cancelError"));
              }}>
              <X size={14} className="inline mr-1" /> {t("combat.cancel")}
            </button>
            <button className="btn-fantasy" disabled={participants.length === 0}
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={async () => {
                const r = await startCombat(encounter, participants, groups, dm);
                if (!r.ok) toast.error(t("combat.startError"));
              }}>
              <Play size={14} className="inline mr-1" /> {t("combat.start")}
            </button>
          </div>
        </>
      )}

      {status === "active" && encounter && (
        <>
          <CombatList encounter={encounter} participants={participants} groups={groups} />
          <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} dm={dm} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button className="btn-fantasy text-xs"
              onClick={() => dmShiftTurn(encounter, buildOrderedTurns(participants, groups), -1)}>
              <ChevronLeft size={14} className="inline" /> {t("combat.prevTurn")}
            </button>
            <button className="btn-fantasy text-xs"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => dmShiftTurn(encounter, buildOrderedTurns(participants, groups), 1)}>
              {t("combat.nextTurn")} <ChevronRight size={14} className="inline" />
            </button>
            <button className="btn-fantasy text-xs"
              style={{ background: "var(--loss)", color: "white" }}
              onClick={async () => {
                if (!confirm(t("combat.confirmEnd"))) return;
                const r = await endCombat(encounter, dm);
                if (!r.ok) toast.error(t("combat.endError"));
              }}>
              <X size={14} className="inline mr-1" /> {t("combat.end")}
            </button>
          </div>
        </>
      )}

      {addingEnemy && encounter && (
        <EnemyEditorModal encounter={encounter} dm={dm} onClose={() => setAddingEnemy(false)} />
      )}
    </div>
  );
}
