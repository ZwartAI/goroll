import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { FastForward, Heart } from "lucide-react";
import {
  applyEnemyDamage,
  buildOrderedTurns,
  activeBlock,
  dmEndEnemyTurn,
  healEnemy,
  isEnemy,
  listEnemySkills,
  logEnemySkillUse,
  type CombatEncounter,
  type CombatEnemySkill,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
} from "@/lib/combat";
import { loadTemplate, type EnemyTemplate } from "@/lib/bestiary";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { EnemySkillCard } from "@/components/app/EnemySkillCard";
import { EnemySkillUseModal } from "@/components/app/EnemySkillUseModal";
import { EnemySpeechModal } from "@/components/app/EnemySpeechModal";
import { EnemyDamageModal } from "@/components/app/EnemyDamageModal";
import { StatText } from "@/components/app/StatText";

type Props = {
  participant: CombatParticipant;
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  onClose: () => void;
};

export function EnemyCombatSheetModal({ participant, encounter, participants, groups, pins, onClose }: Props) {
  const { t } = useT();
  const [skills, setSkills] = useState<CombatEnemySkill[]>([]);
  const [template, setTemplate] = useState<EnemyTemplate | null>(null);
  const [usingSkill, setUsingSkill] = useState<CombatEnemySkill | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [damaging, setDamaging] = useState(false);

  useEffect(() => {
    listEnemySkills(participant.id).then(setSkills);
    if (participant.enemy_template_id) loadTemplate(participant.enemy_template_id).then(setTemplate);
  }, [participant.id, participant.enemy_template_id]);

  const blocks = buildOrderedTurns(participants, groups, pins || []);
  const active = activeBlock(encounter, blocks);
  const isActive = !!active && active.kind === "solo" && active.participant.id === participant.id;
  const ended = encounter.status === "ended";

  const color = participant.enemy_color || "var(--loss)";
  const max = participant.enemy_max_hp || 1;
  const cur = participant.enemy_hp || 0;
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  const hpBg = pct > 60 ? "var(--gain)" : pct > 30 ? "#eab308" : "var(--loss)";

  const immunities: string[] = Array.isArray((template as any)?.immunities) ? (template as any).immunities : [];
  const tier = template?.tier;
  const role = template?.role;

  const showSkillFull = async (s: CombatEnemySkill) => {
    if (ended) { toast.error(t("combat.enemy.combatEnded")); return; }
    await logEnemySkillUse(participant, s, { visibility: "full" });
    toast.success(t("common.confirm"));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-2 sm:p-3" onClick={onClose}>
      <div className="ornate-card w-full max-w-lg max-h-[92vh] overflow-y-auto p-3 sm:p-4 space-y-3"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card relative"
            style={{ borderColor: color, color }}>
            <EnemyIcon name={participant.enemy_icon} size={28} fill={!!getEnemyAssetUrl(participant.enemy_icon)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg leading-tight truncate" style={{ color }}>
              {participant.display_name}
            </p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {tier && (
                <Chip>{t(`bestiary.tier.${tier}` as any) || tier}</Chip>
              )}
              {role && (
                <Chip>{t(`bestiary.role.${role}` as any) || role}</Chip>
              )}
              {template?.biome && <Chip>{template.biome}</Chip>}
              {participant.is_defeated && (
                <Chip danger>{t("combat.defeated")}</Chip>
              )}
              {isActive && !participant.is_defeated && (
                <Chip gold>{t("combat.enemy.activeTurn")}</Chip>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label={t("combat.defense")} value={participant.enemy_defense || 0} />
          <Stat label={t("combat.speed")} value={participant.enemy_speed || "—"} />
          <Stat label={t("combat.initiative")} value={participant.initiative} />
          <Stat label={t("bestiary.baseDamage")} value={template?.base_damage || "—"} />
        </div>

        <div className="space-y-1">
          <div className="relative h-2.5 rounded-full bg-card border border-border overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: hpBg }} />
          </div>
          <p className="text-[11px] text-center text-muted-foreground">HP {cur} / {max}</p>
        </div>

        {/* Active-turn zone */}
        {isActive && !ended && (
          <div className="rounded-md p-2 space-y-1.5 border border-[var(--gold)]/60"
            style={{ background: "color-mix(in oklab, var(--gold) 12%, transparent)" }}>
            <p className="text-[10px] uppercase tracking-widest text-[var(--gold)] font-display">
              {t("combat.enemy.activeTurn")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button className="btn-fantasy text-[11px]" onClick={() => setSpeaking(true)}>
                💬 {t("combat.enemy.speakAs")}
              </button>
              <button className="btn-fantasy text-[11px]" onClick={() => setDamaging(true)}>
                ❤️ {t("combat.enemy.adjustHp")}
              </button>
              <button className="btn-fantasy text-[11px] col-span-2"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                onClick={async () => { await dmEndEnemyTurn(encounter, blocks); onClose(); }}>
                <FastForward size={12} className="inline mr-1" /> {t("combat.enemy.endEnemyTurn")}
              </button>
            </div>
          </div>
        )}
        {!isActive && !ended && (
          <p className="text-[10px] text-center text-muted-foreground italic">{t("combat.enemy.notInTurn")}</p>
        )}

        {/* HP controls */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">HP</p>
          <div className="grid grid-cols-4 gap-1">
            <button className="btn-fantasy text-[11px] py-1" onClick={() => applyEnemyDamage(participant, 1, { useDefense: false })}>-1</button>
            <button className="btn-fantasy text-[11px] py-1" onClick={() => applyEnemyDamage(participant, 5, { useDefense: false })}>-5</button>
            <button className="btn-fantasy text-[11px] py-1" onClick={() => healEnemy(participant, 1)}>+1</button>
            <button className="btn-fantasy text-[11px] py-1" onClick={() => healEnemy(participant, 5)}>+5</button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button className="btn-fantasy text-[10px] py-1" style={{ background: "var(--loss)", color: "white" }} onClick={() => setDamaging(true)}>{t("combat.applyDamage")}</button>
            <button className="btn-fantasy text-[10px] py-1" onClick={() => setDamaging(true)}>{t("combat.applyWithDefense")}</button>
            <button className="btn-fantasy text-[10px] py-1" style={{ background: "var(--gain)", color: "white" }} onClick={() => setDamaging(true)}><Heart size={11} className="inline" /> {t("combat.heal")}</button>
          </div>
        </div>

        {/* Behavior */}
        {(template?.behavior_notes || template?.description || participant.enemy_notes) && (
          <Section title={t("combat.enemy.behavior")}>
            {template?.description && <p className="text-[11px] text-foreground/85 leading-snug"><StatText>{template.description}</StatText></p>}
            {template?.behavior_notes && <p className="text-[11px] text-foreground/70 leading-snug italic"><StatText>{template.behavior_notes}</StatText></p>}
            {participant.enemy_notes && <p className="text-[11px] text-muted-foreground leading-snug"><StatText>{participant.enemy_notes}</StatText></p>}
          </Section>
        )}

        {/* Immunities */}
        <Section title={t("combat.enemy.immunities")}>
          {immunities.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">{t("combat.enemy.noImmunities")}</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {immunities.map(im => (
                <span key={im} className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--gold)]/40 text-[var(--gold)] bg-[var(--gold)]/10">
                  {t(`bestiary.immunity.${im}` as any) || im}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* Weaknesses */}
        {template?.weaknesses_text && (
          <Section title={t("combat.enemy.weaknesses")}>
            <p className="text-[11px] text-foreground/85">{template.weaknesses_text}</p>
          </Section>
        )}

        {/* Skills */}
        <Section title={t("combat.enemy.skills")}>
          {skills.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic">{t("combat.enemy.noSkills")}</p>
          ) : (
            <div className="space-y-2">
              {skills.map(s => (
                <EnemySkillCard key={s.id} skill={s as any}
                  onUse={!ended ? () => setUsingSkill(s) : undefined}
                  onShow={!ended ? () => showSkillFull(s) : undefined}
                />
              ))}
            </div>
          )}
        </Section>

        <button className="btn-fantasy w-full" onClick={onClose}>{t("common.close")}</button>
      </div>

      {usingSkill && (
        <EnemySkillUseModal participant={participant} skill={usingSkill} onClose={() => setUsingSkill(null)} />
      )}
      {speaking && <EnemySpeechModal participant={participant} onClose={() => setSpeaking(false)} />}
      {damaging && <EnemyDamageModal participant={participant} onClose={() => setDamaging(false)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border border-border bg-card/50 p-1.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display text-sm text-[var(--gold)]">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">{title}</p>
      {children}
    </div>
  );
}

function Chip({ children, danger, gold }: { children: React.ReactNode; danger?: boolean; gold?: boolean }) {
  const style = danger
    ? { background: "color-mix(in oklab, var(--loss) 25%, transparent)", color: "var(--loss)" }
    : gold
      ? { background: "var(--gold)", color: "black" }
      : { background: "color-mix(in oklab, var(--gold) 20%, transparent)", color: "var(--gold)" };
  return (
    <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded" style={style}>
      {children}
    </span>
  );
}
