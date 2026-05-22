import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Swords, Flag, Play, ChevronLeft, ChevronRight, X, Plus, BookOpen } from "lucide-react";
import { BestiaryPickerModal } from "@/components/app/BestiaryPickerModal";
import {
  buildOrderedTurns,
  cancelInitiative,
  dissolveLink,
  dmShiftTurn,
  endActiveTurn,
  endCombat,
  requestInitiative,
  reorderBlockWithAutoInitiative,
  startCombat,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
} from "@/lib/combat";
import { CombatList } from "@/components/app/CombatList";
import { Crown, Link as LinkIcon } from "lucide-react";
import { EnemyEditorModal } from "@/components/app/EnemyEditorModal";
import { EnemyManagerDM } from "@/components/app/EnemyManagerDM";

type Props = {
  campaignId: string;
  dm: { id: string; name: string; color: string };
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
};

export function CombatDMPanel({ campaignId, dm, encounter, participants, groups, pins = [] }: Props) {
  const { t } = useT();
  const status = encounter?.status ?? null;
  const [addingEnemy, setAddingEnemy] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const canAddEnemy = encounter && status !== "ended";

  return (
    <div className="ornate-card p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Swords size={14} className="text-[var(--gold)]" />
        <h3 className="font-display text-xs uppercase tracking-widest text-[var(--gold)]">{t("combat.dmTitle")}</h3>
      </div>

      {(!encounter || status === "ended") && (
        <button className="btn-fantasy w-full text-xs py-1.5" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
          onClick={async () => {
            const r = await requestInitiative(campaignId, dm);
            if (!r.ok) toast.error(t("combat.requestError"));
            else toast.success(t("combat.requested"));
          }}>
          <Flag size={12} className="inline mr-1" /> {t("combat.requestInitiative")}
        </button>
      )}


      {encounter && groups.length > 0 && status !== "ended" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <LinkIcon size={12} className="text-[var(--gold)]" />
            <span className="text-[10px] font-display uppercase tracking-widest text-[var(--gold)]">{t("combat.linkActiveTitle")}</span>
          </div>
          {groups.map(g => {
            const members = participants.filter(p => p.turn_group_id === g.id);
            return (
              <div key={g.id} className="ornate-card !p-2 flex items-center gap-2"
                style={{ borderColor: `color-mix(in oklab, ${g.color || "var(--gold)"} 55%, transparent)` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    {members.map(m => (
                      <span key={m.id} className="text-[11px] flex items-center gap-0.5" style={{ color: m.color || undefined }}>
                        {m.is_leader && <Crown size={10} className="text-[var(--gold)]" />}
                        {m.display_name}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="text-[10px] px-2 py-1 rounded border border-[var(--loss)]/60 text-[var(--loss)]"
                  onClick={() => setConfirmState({
                    message: t("combat.linkConfirmDissolve"),
                    onConfirm: async () => {
                      const r = await dissolveLink(g, dm);
                      if (!r.ok) toast.error(t("combat.linkError"));
                      else toast.success(t("combat.linkDissolved"));
                    },
                  })}>
                  {t("combat.linkDissolve")}
                </button>
              </div>
            );
          })}
        </div>
      )}


      {status === "collecting" && encounter && (
        <>
          <p className="text-[11px] text-muted-foreground">{t("combat.collectingHint", { n: participants.length })}</p>
          <div className="ornate-card !p-2 space-y-1.5">
            <p className="text-[10px] font-display uppercase tracking-widest text-[var(--gold)]">{t("combat.round")}</p>
            <CombatList encounter={encounter} participants={participants} groups={groups} pins={pins}
              onReorder={async (key, toIndex) => {
                const r = await reorderBlockWithAutoInitiative(encounter, buildOrderedTurns(participants, groups, pins), key, toIndex);
                if (!r.ok) toast.error(t("combat.reorderError") || "Reorder failed");
              }} />
          </div>
          <div className="ornate-card !p-2 space-y-2">
            {canAddEnemy && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-fantasy text-xs"
                  style={{ background: "color-mix(in oklab, var(--loss) 45%, var(--card))", color: "white" }}
                  onClick={() => setAddingEnemy(true)}>
                  <Plus size={12} className="inline mr-1" /> {t("combat.addEnemy")}
                </button>
                <button className="btn-fantasy text-xs"
                  style={{ background: "color-mix(in oklab, var(--gold) 35%, var(--card))", color: "white" }}
                  onClick={() => setPickingTemplate(true)}>
                  <BookOpen size={12} className="inline mr-1" /> {t("bestiary.addFromBestiary")}
                </button>
              </div>
            )}
            <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} pins={pins} dm={dm} />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button className="btn-fantasy" style={{ background: "var(--loss)", color: "white" }}
              onClick={() => setConfirmState({
                message: t("combat.confirmCancel"),
                onConfirm: async () => {
                  const r = await cancelInitiative(encounter, dm);
                  if (!r.ok) toast.error(t("combat.cancelError"));
                },
              })}>
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
          <div className="ornate-card !p-2 space-y-1.5">
            <p className="text-[10px] font-display uppercase tracking-widest text-[var(--gold)]">{t("combat.round")}</p>
            <CombatList encounter={encounter} participants={participants} groups={groups} pins={pins}
              onReorder={async (key, toIndex) => {
                const r = await reorderBlockWithAutoInitiative(encounter, buildOrderedTurns(participants, groups, pins), key, toIndex);
                if (!r.ok) toast.error(t("combat.reorderError") || "Reorder failed");
              }} />
          </div>
          <div className="ornate-card !p-2 space-y-2">
            {canAddEnemy && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-fantasy text-xs"
                  style={{ background: "color-mix(in oklab, var(--loss) 45%, var(--card))", color: "white" }}
                  onClick={() => setAddingEnemy(true)}>
                  <Plus size={12} className="inline mr-1" /> {t("combat.addEnemy")}
                </button>
                <button className="btn-fantasy text-xs"
                  style={{ background: "color-mix(in oklab, var(--gold) 35%, var(--card))", color: "white" }}
                  onClick={() => setPickingTemplate(true)}>
                  <BookOpen size={12} className="inline mr-1" /> {t("bestiary.addFromBestiary")}
                </button>
              </div>
            )}
            <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} pins={pins} dm={dm} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button className="btn-fantasy text-xs"
              onClick={() => dmShiftTurn(encounter, buildOrderedTurns(participants, groups, pins), -1)}>
              <ChevronLeft size={14} className="inline" /> {t("combat.prevTurn")}
            </button>
            <button className="btn-fantasy text-xs"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => endActiveTurn(encounter, buildOrderedTurns(participants, groups, pins), dm)}>
              {t("combat.nextTurn")} <ChevronRight size={14} className="inline" />
            </button>
            <button className="btn-fantasy text-xs"
              style={{ background: "var(--loss)", color: "white" }}
              onClick={() => setConfirmState({
                message: t("combat.confirmEnd"),
                onConfirm: async () => {
                  const r = await endCombat(encounter, dm);
                  if (!r.ok) toast.error(t("combat.endError"));
                },
              })}>
              <X size={14} className="inline mr-1" /> {t("combat.end")}
            </button>
          </div>
        </>
      )}


      {addingEnemy && encounter && (
        <EnemyEditorModal encounter={encounter} dm={dm} onClose={() => setAddingEnemy(false)} />
      )}
      {pickingTemplate && encounter && (
        <BestiaryPickerModal
          campaignId={campaignId}
          encounter={encounter}
          dm={dm}
          onClose={() => setPickingTemplate(false)}
        />
      )}

      {confirmState && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3" onClick={() => setConfirmState(null)}>
          <div className="ornate-card max-w-sm w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-foreground">{confirmState.message}</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy text-xs" onClick={() => setConfirmState(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn-fantasy text-xs"
                style={{ background: "var(--loss)", color: "white" }}
                onClick={() => {
                  const fn = confirmState.onConfirm;
                  setConfirmState(null);
                  fn();
                }}>
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
