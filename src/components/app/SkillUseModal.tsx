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
import {
  useSkill,
  type SkillTarget,
  type SkillResolution,
  type SkillDistribution,
  type CombatSkillUse,
  RARITY_MAX_USES,
} from "@/lib/combat-skills";
import type { CombatEncounter, CombatParticipant, CombatTurnGroup, CombatTurnPin } from "@/lib/combat";
import { isEnemy, groupForCharacter } from "@/lib/combat";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  source: Character;
  allCharacters: Character[];
  skill: CharacterSkill;
  use: CombatSkillUse | null;
  onClose: () => void;
  onDone: () => void;
};

/**
 * Bloque "Uso de Skill" — modal donde un jugador resuelve el uso de una skill
 * sobre personajes (incluido él mismo) y/o enemigos del combate activo.
 */
export function SkillUseModal({ encounter, participants: initialParticipants, groups, pins, source, allCharacters, skill, use, onClose, onDone }: Props) {
  const { t } = useT();
  const color = RARITY_COLOR[skill.rarity];
  const max = RARITY_MAX_USES[skill.rarity];
  const remaining = skill.rarity === "white" ? null : (use?.uses_remaining ?? max);

  // Live participant list — refresh while the modal is open.
  const [participants, setParticipants] = useState<CombatParticipant[]>(initialParticipants);
  useEffect(() => setParticipants(initialParticipants), [initialParticipants]);
  useEffect(() => {
    const ch = (supabase as any)
      .channel(`skill-use:${encounter.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "combat_participants", filter: `encounter_id=eq.${encounter.id}` },
        async () => {
          const { data } = await (supabase as any)
            .from("combat_participants")
            .select("*")
            .eq("encounter_id", encounter.id)
            .order("order_index", { ascending: true });
          setParticipants((data as any) || []);
        },
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [encounter.id]);

  const enemies = useMemo(() => participants.filter(p => isEnemy(p) && !p.is_defeated), [participants]);
  const playerParticipants = useMemo(
    () => participants.filter(p => p.participant_type === "player" && p.character_id),
    [participants],
  );
  // All in-combat characters (self + allies) — keep self first.
  const inCombatCharacters = useMemo(() => {
    const ids = new Set(playerParticipants.map(p => p.character_id!));
    const list = allCharacters.filter(c => ids.has(c.id));
    return [source, ...list.filter(c => c.id !== source.id)];
  }, [playerParticipants, allCharacters, source]);

  const linkInfo = useMemo(
    () => groupForCharacter(participants, groups, source.id),
    [participants, groups, source.id],
  );
  const linkMates = useMemo(
    () => (linkInfo?.members.filter(m => m.character_id && m.character_id !== source.id) ?? []),
    [linkInfo, source.id],
  );

  const [selectedEnemies, setSelectedEnemies] = useState<Set<string>>(new Set());
  // Characters now include self via this set (toggling source.id == self target).
  const [selectedCharacters, setSelectedCharacters] = useState<Set<string>>(new Set());
  const [rollResult, setRollResult] = useState("");
  const [resolution, setResolution] = useState<SkillResolution>("log");
  const [amount, setAmount] = useState<number>(0);
  const [distribution, setDistribution] = useState<SkillDistribution>("defense");
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

  function toggleEnemy(id: string) {
    const n = new Set(selectedEnemies);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedEnemies(n);
  }
  function toggleCharacter(id: string) {
    const n = new Set(selectedCharacters);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedCharacters(n);
  }

  const totalSelected = selectedEnemies.size + selectedCharacters.size;
  const showDistribution =
    (resolution === "damage" || resolution === "heal" || resolution === "shield") &&
    (totalSelected > 1 || !!linkInfo);

  async function submit() {
    const linkSize = linkInfo ? linkInfo.members.length : 0;
    const synergyCount = linkBonusMembers.size;
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
    for (const id of selectedCharacters) {
      if (id === source.id) {
        targets.push({ kind: "self", character: source });
      } else {
        const c = inCombatCharacters.find(a => a.id === id);
        if (c) targets.push({ kind: "ally", character: c });
      }
    }
    if (targets.length === 0) targets.push({ kind: "none" });

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
      pins,
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
        applyDefense: showDistribution ? distribution !== "direct" : true,
        distribution: showDistribution ? distribution : undefined,
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
        <p className="text-[10px] uppercase tracking-widest text-[var(--gold)] font-display">
          {t("combat.playerSkill.blockTitle")}
        </p>
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

        {/* Targets — Characters */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-[var(--gain)]">{t("combat.playerSkill.charactersHeading")}</p>
          {inCombatCharacters.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">{t("combat.playerSkill.noCharacters")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {inCombatCharacters.map(c => {
                const on = selectedCharacters.has(c.id);
                const isSelf = c.id === source.id;
                return (
                  <button key={c.id} type="button"
                    onClick={() => toggleCharacter(c.id)}
                    className="px-2 py-1 rounded border text-[11px]"
                    style={{
                      borderColor: on ? (c.color || "var(--gold)") : "var(--border)",
                      background: on ? `color-mix(in oklab, ${c.color || "var(--gold)"} 20%, transparent)` : "transparent",
                      color: c.color || undefined,
                    }}>
                    {c.name}{isSelf ? ` ${t("combat.playerSkill.youTag")}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Targets — Enemies */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-[var(--loss)]">{t("combat.playerSkill.enemiesHeading")}</p>
          {enemies.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">{t("combat.playerSkill.noEnemies")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {enemies.map(e => {
                const on = selectedEnemies.has(e.id);
                return (
                  <button key={e.id} type="button"
                    onClick={() => toggleEnemy(e.id)}
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
          )}
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
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {resolution === "damage" ? t("combat.playerSkill.rawDamage")
                : resolution === "heal" ? t("combat.playerSkill.healAmount")
                : t("combat.playerSkill.shieldAmount")}
            </label>
            <input type="number" min={0} className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
              value={amount} onChange={e => setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))} />
          </div>
        )}

        {/* Distribution mode */}
        {showDistribution && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.playerSkill.distributionLabel")}</label>
            <select className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm"
              value={distribution} onChange={e => setDistribution(e.target.value as SkillDistribution)}>
              {resolution === "damage" && <option value="defense">{t("combat.playerSkill.distWithDefense")}</option>}
              <option value="direct">{t("combat.playerSkill.distDirect")}</option>
              <option value="split">{t("combat.playerSkill.distSplit")}</option>
              {linkInfo && <option value="linkGroup">{t("combat.playerSkill.distLinkGroup")}</option>}
            </select>
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
