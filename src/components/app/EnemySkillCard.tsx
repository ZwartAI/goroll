import { useT } from "@/lib/i18n";
import { RARITY_COLOR } from "@/lib/game";
import { Sword, Sparkles, Shield, Zap, Wind, Eye, Skull, Heart, type LucideIcon } from "lucide-react";
import type { EnemyTemplateSkill } from "@/lib/bestiary";
import { StatText } from "./StatText";

const TYPE_ICON: Record<string, LucideIcon> = {
  impact: Sword,
  healing: Heart,
  support: Shield,
  terrain: Wind,
  control: Eye,
  debuff: Skull,
  summon: Sparkles,
  reaction: Zap,
};

export type EnemySkillLike = Pick<
  EnemyTemplateSkill,
  "id" | "name" | "rarity" | "skill_type" | "target_shape" | "targets" | "dice" | "range_text" | "effect" | "visual_brief"
>;

export function EnemySkillCard({
  skill, onUse, onShow,
}: { skill: EnemySkillLike; onUse?: () => void; onShow?: () => void }) {
  const { t } = useT();
  const Icon = TYPE_ICON[skill.skill_type || ""] || Sword;
  const rarityColor = (RARITY_COLOR as any)[skill.rarity] || "var(--rarity-white)";

  return (
    <div
      className="rounded-md p-2.5 space-y-1.5 border-2"
      style={{
        background: "linear-gradient(180deg, oklch(0.18 0.02 280), oklch(0.12 0.02 280))",
        borderColor: `color-mix(in oklab, ${rarityColor} 70%, transparent)`,
        boxShadow: `0 0 12px color-mix(in oklab, ${rarityColor} 25%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md flex items-center justify-center border"
          style={{ borderColor: rarityColor, color: rarityColor, background: "rgba(0,0,0,0.35)" }}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm leading-tight truncate" style={{ color: rarityColor }}>
            {skill.name}
          </p>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
            {skill.skill_type ? (t(`bestiary.skillType.${skill.skill_type}` as any) || skill.skill_type) : "—"}
            {skill.target_shape ? ` · ${t(`bestiary.shape.${skill.target_shape}` as any) || skill.target_shape}` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        {skill.dice && (
          <p><span className="text-muted-foreground">{t("bestiary.dice")}: </span><span style={{ color: "var(--gold)" }} className="font-semibold">{skill.dice}</span></p>
        )}
        {skill.range_text && (
          <p><span className="text-muted-foreground">{t("bestiary.range")}: </span><span style={{ color: "#60a5fa" }}>{skill.range_text}</span></p>
        )}
        {skill.targets && (
          <p className="col-span-2"><span className="text-muted-foreground">{t("bestiary.targets")}: </span><span style={{ color: "#34d399" }}>{skill.targets}</span></p>
        )}
      </div>

      {skill.effect && (
        <p className="text-[11px] text-foreground/90 leading-snug">{skill.effect}</p>
      )}
      {skill.visual_brief && (
        <p className="text-[10px] italic" style={{ color: "#c4b5fd" }}>{skill.visual_brief}</p>
      )}

      {(onUse || onShow) && (
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          {onUse && (
            <button className="btn-fantasy text-[10px] py-1"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={onUse}>{t("combat.enemy.useSkill")}</button>
          )}
          {onShow && (
            <button className="btn-fantasy text-[10px] py-1" onClick={onShow}>
              {t("combat.enemy.showSkill")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
