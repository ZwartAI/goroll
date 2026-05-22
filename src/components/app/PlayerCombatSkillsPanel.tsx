import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import type { Character, Rarity } from "@/lib/game";
import { RARITY_COLOR } from "@/lib/game";
import type { CharacterSkill } from "./SkillCard";
import { SkillUseModal } from "./SkillUseModal";
import { computeTurnState, RARITY_MAX_USES, type CombatSkillUse } from "@/lib/combat-skills";
import type { CombatEncounter, CombatParticipant, CombatTurnGroup, CombatTurnPin } from "@/lib/combat";
import { Swords } from "lucide-react";

type Props = {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  character: Character;
  allCharacters: Character[];
  skills: CharacterSkill[];
};

export function PlayerCombatSkillsPanel({ encounter, participants, groups, pins, character, allCharacters, skills }: Props) {
  const { t } = useT();
  const [uses, setUses] = useState<CombatSkillUse[]>([]);
  const [open, setOpen] = useState<CharacterSkill | null>(null);

  const active = encounter && encounter.status === "active";
  const turn = computeTurnState(encounter, participants, groups, character.id, pins || []);

  async function reload() {
    if (!encounter) { setUses([]); return; }
    const { data } = await (supabase as any).from("combat_skill_uses")
      .select("*").eq("encounter_id", encounter.id).eq("character_id", character.id);
    setUses((data as any) || []);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [encounter?.id, character.id]);
  useEffect(() => {
    if (!encounter) return;
    const ch = (supabase as any).channel(`skill-uses:${encounter.id}:${character.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_skill_uses", filter: `encounter_id=eq.${encounter.id}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [encounter?.id, character.id]);

  if (!active) return null;

  const unlocked = skills.filter(s => s.is_unlocked);
  if (unlocked.length === 0) return null;

  const whiteUsed = uses.some(u => u.rarity === "white" && u.used_this_turn);

  return (
    <div className="ornate-card p-3 space-y-2"
      style={{ borderColor: turn.isYourTurn ? "var(--gold)" : "var(--border)" }}>
      <div className="flex items-center gap-2">
        <Swords size={14} className={turn.isYourTurn ? "text-[var(--gold)]" : "text-muted-foreground"} />
        <span className="text-[11px] font-display uppercase tracking-widest"
          style={{ color: turn.isYourTurn ? "var(--gold)" : undefined }}>
          {turn.isYourTurn ? t("combat.playerSkill.yourTurn") : t("combat.playerSkill.waitTurn")}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {unlocked.map(s => {
          const rarity = s.rarity as Rarity;
          const use = uses.find(u => u.character_skill_id === s.id);
          const max = RARITY_MAX_USES[rarity];
          const remaining = rarity === "white" ? null : (use?.uses_remaining ?? max);
          const noUses = rarity !== "white" && remaining !== null && (remaining ?? 0) <= 0;
          const blockedWhite = rarity === "white" && whiteUsed;
          const disabled = !turn.isYourTurn || noUses || blockedWhite;
          const color = RARITY_COLOR[rarity];
          const label = rarity === "white"
            ? (blockedWhite ? t("combat.playerSkill.whiteAlreadyUsed") : t("combat.playerSkill.free"))
            : `${remaining ?? 0}/${max ?? 0}`;
          return (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded border"
              style={{ borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }}>
              <span className="font-display text-xs flex-1 truncate" style={{ color }}>{s.name}</span>
              <span className="text-[10px] font-display px-1.5 py-0.5 rounded" style={{ color, border: `1px solid ${color}` }}>{label}</span>
              <button type="button" disabled={disabled} onClick={() => setOpen(s)}
                className="text-[11px] px-2 py-1 rounded font-display"
                style={{
                  background: disabled ? "transparent" : `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 60%, black))`,
                  color: disabled ? "var(--muted-foreground)" : "white",
                  border: `1px solid ${disabled ? "var(--border)" : color}`,
                  opacity: disabled ? 0.55 : 1,
                }}>
                {disabled
                  ? (!turn.isYourTurn ? t("combat.playerSkill.notYourTurn") : noUses ? t("combat.playerSkill.noUses") : t("combat.playerSkill.useSkill"))
                  : t("combat.playerSkill.useSkill")}
              </button>
            </div>
          );
        })}
      </div>
      {open && encounter && (
        <SkillUseModal
          encounter={encounter}
          participants={participants}
          groups={groups}
          pins={pins}
          source={character}
          allCharacters={allCharacters}
          skill={open}
          use={uses.find(u => u.character_skill_id === open.id) || null}
          onClose={() => setOpen(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}
