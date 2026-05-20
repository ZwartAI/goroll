import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Crown, Star } from "lucide-react";
import {
  listTemplateSkills,
  type EnemyTemplate,
  type EnemyTemplateSkill,
} from "@/lib/bestiary";
import { EnemyIcon } from "@/components/app/EnemyIconPicker";
import { RarityBadge } from "@/components/app/RarityBadge";

type Props = {
  template: EnemyTemplate;
  onClose: () => void;
  onEdit?: () => void;
  onAddToCombat?: () => void;
};

export function MonsterSheetModal({ template, onClose, onEdit, onAddToCombat }: Props) {
  const { t } = useT();
  const [skills, setSkills] = useState<EnemyTemplateSkill[]>([]);

  useEffect(() => { listTemplateSkills(template.id).then(setSkills); }, [template.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-xl w-full max-h-[92vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center bg-card shrink-0"
            style={{ borderColor: template.color, color: template.color }}>
            <EnemyIcon name={template.icon_key} size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-base truncate" style={{ color: template.color }}>{template.name}</h3>
            <p className="text-[11px] text-muted-foreground">
              {t(`bestiary.tier_${template.tier}`)} · {t(`bestiary.role_${template.role}`)}
              {template.biome ? ` · ${template.biome}` : ""}
            </p>
            <div className="flex gap-1 mt-1">
              {template.is_elite && <Badge color="#a855f7"><Star size={10} className="inline" /> {t("bestiary.isElite")}</Badge>}
              {template.is_boss && <Badge color="#eab308"><Crown size={10} className="inline" /> {t("bestiary.isBoss")}</Badge>}
            </div>
          </div>
          <button className="text-muted-foreground" onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="HP" value={String(template.max_hp)} />
          <Stat label="DEF" value={String(template.defense)} />
          <Stat label={t("bestiary.speed")} value={template.speed} />
          <Stat label={t("bestiary.baseDamage")} value={template.base_damage || "—"} />
        </div>

        {template.description && (
          <Block title={t("bestiary.description")}>{template.description}</Block>
        )}
        {template.behavior_notes && (
          <Block title={t("bestiary.behavior")}>{template.behavior_notes}</Block>
        )}

        {(template.immunities.length > 0 || template.weaknesses_text) && (
          <div className="grid grid-cols-2 gap-2">
            {template.immunities.length > 0 && (
              <Block title={t("bestiary.immunities")}>
                <div className="flex flex-wrap gap-1">
                  {template.immunities.map(k => (
                    <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/40 border border-border">
                      {t(`bestiary.immunity_${k}`)}
                    </span>
                  ))}
                </div>
              </Block>
            )}
            {template.weaknesses_text && <Block title={t("bestiary.weaknesses")}>{template.weaknesses_text}</Block>}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{t("bestiary.monsterSkills")}</p>
          {skills.length === 0 && <p className="text-xs text-muted-foreground">{t("bestiary.noSkills")}</p>}
          {skills.map(s => (
            <div key={s.id} className="ornate-card !p-2 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-display">{s.name}</p>
                <RarityBadge rarity={s.rarity as any} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {s.skill_type ? t(`bestiary.skillType_${s.skill_type}`) : "—"}
                {s.target_shape ? ` · ${t(`bestiary.shape_${s.target_shape}`)}` : ""}
                {s.dice ? ` · ${s.dice}` : ""}
                {s.range_text ? ` · ${s.range_text}` : ""}
                {s.targets ? ` · ${s.targets}` : ""}
              </p>
              {s.effect && <p className="text-xs">{s.effect}</p>}
              {s.visual_brief && <p className="text-[11px] italic text-muted-foreground">{s.visual_brief}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          {onEdit && <button className="btn-fantasy" onClick={onEdit}>{t("common.edit")}</button>}
          {onAddToCombat && (
            <button className="btn-fantasy"
              style={{ background: "var(--loss)", color: "white" }}
              onClick={onAddToCombat}>
              {t("bestiary.addToCombat")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ornate-card !p-2">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-display">{value}</p>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{title}</p>
      <div className="text-xs whitespace-pre-wrap">{children}</div>
    </div>
  );
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded inline-flex items-center gap-1"
      style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color, border: `1px solid ${color}` }}>
      {children}
    </span>
  );
}
