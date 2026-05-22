import { useMemo, useState } from "react";
import { Sparkles, ShieldPlus, Skull, Zap, ScrollText, X, Check, Users } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { dmApplyEffectsToTargets, type DMEffectKind } from "@/lib/combat-skills";
import type { CombatEncounter, CombatParticipant } from "@/lib/combat";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  dm: { id: string; name: string; color: string };
  onClose: () => void;
};

type KindOption = { kind: DMEffectKind; emoji: string; icon: typeof Sparkles; tone: string };

const KIND_OPTIONS: KindOption[] = [
  { kind: "shield", emoji: "🛡️", icon: ShieldPlus, tone: "var(--gain)" },
  { kind: "buff", emoji: "✨", icon: Sparkles, tone: "var(--gold)" },
  { kind: "debuff", emoji: "☠️", icon: Skull, tone: "var(--loss)" },
  { kind: "control", emoji: "💫", icon: Zap, tone: "#a78bfa" },
  { kind: "note", emoji: "📜", icon: ScrollText, tone: "var(--muted-foreground)" },
];

export function DMApplyEffectModal({ encounter, participants, dm, onClose }: Props) {
  const { t } = useT();
  const [kind, setKind] = useState<DMEffectKind>("buff");
  const [emoji, setEmoji] = useState<string>("✨");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState<number>(0);
  const [duration, setDuration] = useState<number>(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const alive = useMemo(() => participants.filter(p => !p.is_defeated), [participants]);
  const players = useMemo(() => alive.filter(p => p.participant_type === "player"), [alive]);
  const enemies = useMemo(() => alive.filter(p => p.participant_type === "enemy"), [alive]);

  const selectedIds = useMemo(() => Object.keys(selected).filter(k => selected[k]), [selected]);

  function pickKind(k: DMEffectKind) {
    setKind(k);
    const opt = KIND_OPTIONS.find(o => o.kind === k);
    if (opt && (!emoji || KIND_OPTIONS.some(o => o.emoji === emoji))) setEmoji(opt.emoji);
  }

  function toggle(id: string) {
    setSelected(s => ({ ...s, [id]: !s[id] }));
  }
  function setAll(list: CombatParticipant[], on: boolean) {
    setSelected(s => {
      const next = { ...s };
      for (const p of list) next[p.id] = on;
      return next;
    });
  }

  async function apply() {
    if (selectedIds.length === 0) {
      toast.error(t("combat.dmEffects.errorNoTargets"));
      return;
    }
    if (kind !== "note" && (!label.trim() && !emoji.trim())) {
      toast.error(t("combat.dmEffects.errorLabel"));
      return;
    }
    setSaving(true);
    const targets = selectedIds
      .map(id => participants.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({
        characterId: p!.participant_type === "player" ? p!.character_id : null,
        enemyParticipantId: p!.participant_type === "enemy" ? p!.id : null,
        displayName: p!.display_name,
        color: p!.color,
      }));

    const r = await dmApplyEffectsToTargets({
      encounter,
      dm,
      kind,
      label: label.trim(),
      emoji: emoji.trim(),
      value,
      durationRounds: kind === "note" ? null : duration,
      targets,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(t("combat.dmEffects.errorApply"));
      return;
    }
    toast.success(t("combat.dmEffects.applied", { n: targets.length }));
    onClose();
  }

  const valueLabel =
    kind === "shield"
      ? t("combat.dmEffects.valueShield")
      : kind === "note"
      ? null
      : t("combat.dmEffects.valueDot");

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="ornate-card w-full max-w-md p-3 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ borderColor: "var(--gold)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-[var(--gold)]" />
            <h3 className="font-display text-sm uppercase tracking-widest text-[var(--gold)]">
              {t("combat.dmEffects.title")}
            </h3>
          </div>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Kind selector */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {t("combat.dmEffects.kind")}
          </p>
          <div className="grid grid-cols-5 gap-1">
            {KIND_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = kind === opt.kind;
              return (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => pickKind(opt.kind)}
                  className="ornate-card !p-1.5 flex flex-col items-center gap-0.5 transition-colors"
                  style={{
                    borderColor: active ? opt.tone : undefined,
                    background: active ? `color-mix(in oklab, ${opt.tone} 22%, transparent)` : undefined,
                  }}
                >
                  <Icon size={14} style={{ color: opt.tone }} />
                  <span className="text-[9px] uppercase tracking-wider">
                    {t(`combat.effects.types.${opt.kind === "debuff" || opt.kind === "control" ? opt.kind : opt.kind}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Label + emoji */}
        <div className="grid grid-cols-[64px_1fr] gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {t("combat.dmEffects.emoji")}
            </p>
            <input
              type="text"
              value={emoji}
              onChange={e => setEmoji(e.target.value.slice(0, 4))}
              className="w-full h-9 text-center text-xl rounded border border-border bg-card"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {t("combat.dmEffects.label")}
            </p>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={t("combat.dmEffects.labelPh")}
              className="w-full h-9 px-2 text-sm rounded border border-border bg-card"
            />
          </div>
        </div>

        {/* Value + duration */}
        <div className="grid grid-cols-2 gap-2">
          {valueLabel && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{valueLabel}</p>
              <input
                type="number"
                min={0}
                value={value}
                onChange={e => setValue(parseInt(e.target.value || "0", 10) || 0)}
                className="w-full h-9 px-2 text-sm rounded border border-border bg-card"
              />
            </div>
          )}
          {kind !== "note" && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {t("combat.dmEffects.duration")}
              </p>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value || "1", 10) || 1)}
                className="w-full h-9 px-2 text-sm rounded border border-border bg-card"
              />
            </div>
          )}
        </div>

        {/* Targets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              <Users size={11} /> {t("combat.dmEffects.targets")} ({selectedIds.length})
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-border"
                onClick={() => setAll(alive, true)}
              >
                {t("combat.dmEffects.allActive")}
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-border"
                onClick={() => setSelected({})}
              >
                {t("combat.dmEffects.clear")}
              </button>
            </div>
          </div>

          {players.length > 0 && (
            <TargetGroup
              title={t("combat.dmEffects.players")}
              list={players}
              selected={selected}
              onToggle={toggle}
              onAll={() => setAll(players, true)}
              allLabel={t("combat.dmEffects.selectAll")}
            />
          )}
          {enemies.length > 0 && (
            <TargetGroup
              title={t("combat.dmEffects.enemies")}
              list={enemies}
              selected={selected}
              onToggle={toggle}
              onAll={() => setAll(enemies, true)}
              allLabel={t("combat.dmEffects.selectAll")}
            />
          )}
          {alive.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">{t("combat.dmEffects.noTargets")}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button type="button" className="btn-fantasy text-xs py-2" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={saving || selectedIds.length === 0}
            className="btn-fantasy text-xs py-2 disabled:opacity-50"
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={apply}
          >
            <Check size={12} className="inline mr-1" />
            {t("combat.dmEffects.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TargetGroup({
  title,
  list,
  selected,
  onToggle,
  onAll,
  allLabel,
}: {
  title: string;
  list: CombatParticipant[];
  selected: Record<string, boolean>;
  onToggle: (id: string) => void;
  onAll: () => void;
  allLabel: string;
}) {
  return (
    <div className="ornate-card !p-1.5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{title}</span>
        <button type="button" className="text-[10px] underline text-muted-foreground" onClick={onAll}>
          {allLabel}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {list.map(p => {
          const on = !!selected[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-left transition-colors"
              style={{
                borderColor: on ? (p.color || "var(--gold)") : "var(--border)",
                background: on ? `color-mix(in oklab, ${p.color || "var(--gold)"} 20%, transparent)` : undefined,
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: p.color || "var(--muted-foreground)" }}
              />
              <span className="text-[11px] truncate flex-1" style={{ color: p.color || undefined }}>
                {p.display_name}
              </span>
              {on && <Check size={11} className="text-[var(--gold)] flex-shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
