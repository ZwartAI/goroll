import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Swords, Flag, Play, ChevronLeft, ChevronRight, X, Plus, BookOpen } from "lucide-react";
import { listTemplates, spawnFromTemplate, type EnemyTemplate } from "@/lib/bestiary";
import {
  buildOrderedTurns,
  cancelInitiative,
  dissolveLink,
  dmShiftTurn,
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
  const [templates, setTemplates] = useState<EnemyTemplate[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (pickingTemplate) listTemplates(campaignId).then(setTemplates);
  }, [pickingTemplate, campaignId]);

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
          <CombatList encounter={encounter} participants={participants} groups={groups} pins={pins}
            onReorder={async (key, toIndex) => {
              const r = await reorderBlockWithAutoInitiative(encounter, buildOrderedTurns(participants, groups, pins), key, toIndex);
              if (!r.ok) toast.error(t("combat.reorderError") || "Reorder failed");
            }} />
          <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} pins={pins} dm={dm} />
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
          <CombatList encounter={encounter} participants={participants} groups={groups} pins={pins}
            onReorder={async (key, toIndex) => {
              const r = await reorderBlockWithAutoInitiative(encounter, buildOrderedTurns(participants, groups, pins), key, toIndex);
              if (!r.ok) toast.error(t("combat.reorderError") || "Reorder failed");
            }} />
          <EnemyManagerDM encounter={encounter} participants={participants} groups={groups} pins={pins} dm={dm} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button className="btn-fantasy text-xs"
              onClick={() => dmShiftTurn(encounter, buildOrderedTurns(participants, groups, pins), -1)}>
              <ChevronLeft size={14} className="inline" /> {t("combat.prevTurn")}
            </button>
            <button className="btn-fantasy text-xs"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => dmShiftTurn(encounter, buildOrderedTurns(participants, groups, pins), 1)}>
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => setPickingTemplate(false)}>
          <div className="ornate-card max-w-md w-full max-h-[80vh] overflow-y-auto p-3 space-y-2" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-sm uppercase tracking-widest text-[var(--gold)]">{t("bestiary.addFromBestiary")}</h3>
            {templates.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">{t("bestiary.empty")}</p>}
            {templates.map(tpl => (
              <button key={tpl.id}
                className="w-full ornate-card !p-2 flex items-center gap-2 text-left hover:border-[var(--gold)]"
                onClick={async () => {
                  const r = await spawnFromTemplate(tpl, encounter, { count: 1, initiative: 10, position: "byInitiative" }, dm);
                  if (!r.ok) toast.error(t("bestiary.spawnError"));
                  else { toast.success(t("bestiary.spawned")); setPickingTemplate(false); }
                }}>
                <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center bg-card shrink-0"
                  style={{ borderColor: tpl.color, color: tpl.color }}>★</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display truncate" style={{ color: tpl.color }}>{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground">HP {tpl.max_hp} · DEF {tpl.defense}</p>
                </div>
              </button>
            ))}
            <button className="btn-fantasy w-full text-xs" onClick={() => setPickingTemplate(false)}>{t("common.close")}</button>
          </div>
        </div>
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
