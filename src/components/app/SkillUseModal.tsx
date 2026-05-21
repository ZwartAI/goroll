import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import type { Character } from "@/lib/game";
import { RARITY_COLOR } from "@/lib/game";
import { RarityBadge } from "./RarityBadge";
import { SkillIconMedallion } from "./SkillIconMedallion";
import { EnemyIcon } from "./EnemyIconPicker";
import type { CharacterSkill } from "./SkillCard";
import { useSkill, type SkillTarget, type SkillResolution, type CombatSkillUse, RARITY_MAX_USES } from "@/lib/combat-skills";
import type { CombatEncounter, CombatParticipant, CombatTurnGroup } from "@/lib/combat";
import { isEnemy, groupForCharacter } from "@/lib/combat";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  source: Character;
  allCharacters: Character[];
  skill: CharacterSkill;
  use: CombatSkillUse | null;
  onClose: () => void;
  onDone: () => void;
};

export function SkillUseModal({ encounter, participants, groups, source, allCharacters, skill, use, onClose, onDone }: Props) {
  const { t } = useT();
  const color = RARITY_COLOR[skill.rarity];
  const max = RARITY_MAX_USES[skill.rarity];
  const remaining = skill.rarity === "white" ? null : (use?.uses_remaining ?? max);

  const enemies = useMemo(() => participants.filter(p => isEnemy(p) && !p.is_defeated), [participants]);
  const players = useMemo(
    () => participants.filter(p => p.participant_type === "player" && p.character_id && p.character_id !== source.id),
    [participants, source.id],
  );
  const allyChars = useMemo(() => {
    const ids = new Set(players.map(p => p.character_id!));
    return allCharacters.filter(c => ids.has(c.id));
  }, [players, allCharacters]);

  // Link membership of the source character (if any).
  const linkInfo = useMemo(
    () => groupForCharacter(participants, groups, source.id),
    [participants, groups, source.id],
  );
  const linkMates = useMemo(
    () => (linkInfo?.members.filter(m => m.character_id && m.character_id !== source.id) ?? []),
    [linkInfo, source.id],
  );

  const [selectedEnemies, setSelectedEnemies] = useState<Set<string>>(new Set());
  const [selectedAllies, setSelectedAllies] = useState<Set<string>>(new Set());
  const [selfChosen, setSelfChosen] = useState(false);
  const [rollResult, setRollResult] = useState("");
  const [resolution, setResolution] = useState<SkillResolution>("log");
  const [amount, setAmount] = useState<number>(0);
  const [applyDefense, setApplyDefense] = useState(true);
  const [note, setNote] = useState("");
  const [linkBonus, setLinkBonus] = useState<0 | 2 | 3>(0);
  const [linkBonusMembers, setLinkBonusMembers] = useState<Set<string>>(new Set());
  const [linkJust, setLinkJust] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const n = Number(rollResult);
    if (Number.isFinite(n) && (resolution === "damage" || resolution === "heal" || resolution === "shield")) {
      setAmount(Math.max(0, Math.floor(n)));
    }
    // eslint-disable-next-line
  }, [rollResult]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setter(n);
  }

  async function submit() {
    // Validate link synergy if requested.
    const linkSize = linkInfo ? linkInfo.members.length : 0;
    const synergyCount = linkBonusMembers.size; // members other than source
    if (linkBonus === 2 && synergyCount < 1) { toast.error(t("combat.linkBonusNeed2")); return; }
    if (linkBonus === 3) {
      if (linkSize < 3) { toast.error(t("combat.linkMax")); return; }
      if (synergyCount < 2) { toast.error(t("combat.linkBonusNeed3")); return; }
    }
    if ((linkBonus === 2 || linkBonus === 3) && !linkJust.trim()) {
      toast.error(t("combat.linkBonusNeedJust"));
      return;
    }

    setBusy(true);
    const targets: SkillTarget[] = [];
    for (const id of selectedEnemies) {
      const p = enemies.find(e => e.id === id);
      if (p) targets.push({ kind: "enemy", participant: p });
    }
    for (const id of selectedAllies) {
      const c = allyChars.find(a => a.id === id);
      if (c) targets.push({ kind: "ally", character: c });
    }
    if (selfChosen) targets.push({ kind: "self", character: source });
    if (targets.length === 0) targets.push({ kind: "none" });

    // Resolve link member names (source always counts as a participant when bonus > 0).
    const linkMemberNames: string[] = [];
    if (linkBonus > 0 && linkInfo) {
      linkMemberNames.push(source.name);
      for (const m of linkInfo.members) {
        if (m.character_id && m.character_id !== source.id && linkBonusMembers.has(m.character_id)) {
          linkMemberNames.push(m.display_name);
        }
      }
    }

    const r = await useSkill({
      encounter,
      participants,
      groups,
      source,
      skill: {
        id: skill.id,
        name: skill.name,
        rarity: skill.rarity,
        type: skill.type,
        dice: skill.dice,
        range_targets: skill.range_targets,
        effect: skill.effect,
        visual_brief: skill.visual_brief,
        icon_key: skill.icon_key ?? null,
      },
      targets,
      payload: {
        resolution,
        amount,
        applyDefense,
        rollResult: rollResult.trim() || undefined,
        note: note.trim() || undefined,
        linkBonus: linkBonus || undefined,
        linkBonusMembers: linkMemberNames.length ? linkMemberNames : undefined,
        linkBonusJustification: linkJust.trim() || undefined,
      },
    });
    setBusy(false);
    if (!r.ok) {
      const map: Record<string, string> = {
        not_your_turn: t("combat.playerSkill.notYourTurn"),
        no_uses: t("combat.playerSkill.noUses"),
        white_used_this_turn: t("combat.playerSkill.whiteAlreadyUsed"),
        no_enemy_target: t("combat.playerSkill.noEnemyTarget"),
        no_ally_target: t("combat.playerSkill.noAllyTarget"),
        not_unlocked: t("combat.playerSkill.cannotUseNotUnlocked"),
        not_active: t("combat.playerSkill.noActiveCombat"),
      };
      toast.error(map[r.error as string] || t("combat.playerSkill.genericError"));
      return;
    }
    toast.success(t("combat.playerSkill.success"));
    onDone();
    onClose();
  }

  const usesLabel = skill.rarity === "white"
    ? t("combat.playerSkill.free")
    : `${remaining ?? 0}/${max ?? 0}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="ornate-card w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3"
        style={{ borderColor: color, boxShadow: `0 0 24px color-mix(in oklab, ${color} 35%, transparent)` }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <SkillIconMedallion type={skill.type} rarity={skill.rarity} iconKey={skill.icon_key ?? null} size="md" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base leading-tight" style={{ color }}>{skill.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <RarityBadge rarity={skill.rarity} />
              {skill.type && <span className="text-[10px] text-muted-foreground">{skill.type}</span>}
            </div>
          </div>
          <span className="text-[11px] font-display px-2 py-0.5 rounded border" style={{ borderColor: color, color }}>{usesLabel}</span>
          <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
        </div>

        {(skill.dice || skill.range_targets || skill.effect) && (
          <div className="text-[11px] space-y-0.5 border-t border-border/60 pt-2">
            {skill.dice && <p><span className="text-muted-foreground">🎲 </span><span style={{ color: "var(--gold)" }}>{skill.dice}</span></p>}
            {skill.range_targets && <p><span className="text-muted-foreground">🎯 </span>{skill.range_targets}</p>}
            {skill.effect && <p className="text-foreground/85">{skill.effect}</p>}
          </div>
        )}

        {/* Targets */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.playerSkill.selectTarget")}</p>
          {enemies.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--loss)] mb-1">{t("combat.playerSkill.enemies")}</p>
              <div className="flex flex-wrap gap-1.5">
                {enemies.map(e => {
                  const on = selectedEnemies.has(e.id);
                  return (
                    <button key={e.id} type="button"
                      onClick={() => toggle(selectedEnemies, e.id, setSelectedEnemies)}
                      className="flex items-center gap-1 px-2 py-1 rounded border text-[11px]"
                      style={{
                        borderColor: on ? "var(--loss)" : "var(--border)",
                        background: on ? "color-mix(in oklab, var(--loss) 20%, transparent)" : "transparent",
                        color: e.enemy_color || "var(--loss)",
                      }}>
                      <EnemyIcon name={e.enemy_icon} size={12} />
                      <span>{e.display_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {allyChars.length > 0 && (
            <div>
              <p className="text-[10px] text-[var(--gain)] mb-1">{t("combat.playerSkill.allies")}</p>
              <div className="flex flex-wrap gap-1.5">
                {allyChars.map(c => {
                  const on = selectedAllies.has(c.id);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => toggle(selectedAllies, c.id, setSelectedAllies)}
                      className="px-2 py-1 rounded border text-[11px]"
                      style={{
                        borderColor: on ? c.color : "var(--border)",
                        background: on ? `color-mix(in oklab, ${c.color} 20%, transparent)` : "transparent",
                        color: c.color || undefined,
                      }}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={selfChosen} onChange={e => setSelfChosen(e.target.checked)} />
            <span>{t("combat.playerSkill.self")}</span>
          </label>
        </div>

        {/* Roll */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.playerSkill.rollResult")}</label>
          <input className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
            value={rollResult} onChange={e => setRollResult(e.target.value)} placeholder="14" />
        </div>

        {/* Resolution */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.playerSkill.resolution")}</label>
          <select className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
            value={resolution} onChange={e => setResolution(e.target.value as SkillResolution)}>
            <option value="log">{t("combat.playerSkill.onlyLog")}</option>
            <option value="damage">{t("combat.playerSkill.applyDamage")}</option>
            <option value="heal">{t("combat.playerSkill.applyHeal")}</option>
            <option value="shield">{t("combat.playerSkill.applyShield")}</option>
            <option value="narrative">{t("combat.playerSkill.applyNarrative")}</option>
          </select>
        </div>

        {(resolution === "damage" || resolution === "heal" || resolution === "shield") && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {resolution === "damage" ? t("combat.playerSkill.rawDamage")
                  : resolution === "heal" ? t("combat.playerSkill.healAmount")
                  : t("combat.playerSkill.shieldAmount")}
              </label>
              <input type="number" min={0} className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
                value={amount} onChange={e => setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))} />
            </div>
            {resolution === "damage" && (
              <label className="flex items-center gap-1 text-[11px] pb-1.5">
                <input type="checkbox" checked={applyDefense} onChange={e => setApplyDefense(e.target.checked)} />
                <span>{t("combat.playerSkill.applyDefense")}</span>
              </label>
            )}
          </div>
        )}

        {(resolution === "narrative" || resolution === "log") && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.playerSkill.note")}</label>
            <textarea className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm" rows={2}
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        )}

        {/* Link Bonus — only when source is in a link and damage resolution */}
        {linkInfo && resolution === "damage" && (
          <div className="ornate-card !p-2 space-y-1.5" style={{ borderColor: "color-mix(in oklab, var(--gold) 50%, transparent)" }}>
            <p className="text-[11px] font-display uppercase tracking-widest text-[var(--gold)]">
              {t("combat.linkBonusTitle")}
            </p>
            <p className="text-[10px] text-muted-foreground">{t("combat.linkBonusHint")}</p>
            <div className="grid grid-cols-3 gap-1">
              {([0, 2, 3] as const).map(v => {
                const disabled = v === 3 && (linkInfo.members.length < 3);
                const on = linkBonus === v;
                const label = v === 0 ? t("combat.linkBonusNone") : v === 2 ? t("combat.linkBonus2") : t("combat.linkBonus3");
                return (
                  <button key={v} type="button" disabled={disabled}
                    onClick={() => setLinkBonus(v)}
                    className="text-[10px] px-1.5 py-1 rounded border"
                    style={{
                      borderColor: on ? "var(--gold)" : "var(--border)",
                      background: on ? "color-mix(in oklab, var(--gold) 18%, transparent)" : "transparent",
                      color: disabled ? "var(--muted-foreground)" : (on ? "var(--gold)" : undefined),
                      opacity: disabled ? 0.5 : 1,
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {linkBonus > 0 && linkMates.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">{t("combat.linkMembers")}</p>
                <div className="flex flex-wrap gap-1">
                  {linkMates.map(m => {
                    const id = m.character_id!;
                    const on = linkBonusMembers.has(id);
                    return (
                      <button key={id} type="button"
                        onClick={() => {
                          const n = new Set(linkBonusMembers);
                          on ? n.delete(id) : n.add(id);
                          setLinkBonusMembers(n);
                        }}
                        className="px-2 py-1 rounded border text-[11px]"
                        style={{
                          borderColor: on ? (m.color || "var(--gold)") : "var(--border)",
                          background: on ? `color-mix(in oklab, ${m.color || "var(--gold)"} 18%, transparent)` : "transparent",
                          color: m.color || undefined,
                        }}>
                        {m.display_name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {linkBonus > 0 && (
              <div>
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t("combat.linkBonusJustification")}
                </label>
                <textarea className="w-full bg-input border border-border rounded px-2 py-1 text-xs" rows={2}
                  value={linkJust} onChange={e => setLinkJust(e.target.value)} />
              </div>
            )}
          </div>
        )}


        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 btn-ghost">{t("common.cancel")}</button>
          <button type="button" disabled={busy} onClick={submit}
            className="flex-1 btn-fantasy"
            style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, black))`, color: "white" }}>
            {t("combat.playerSkill.confirmUse")}
          </button>
        </div>
      </div>
    </div>
  );
}
