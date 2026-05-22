import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { useGameData } from "@/lib/CampaignProvider";
import {
  applyEnemyAttackToPlayers,
  listEnemySkills,
  type CombatEnemySkill,
  type CombatParticipant,
  type EnemyAttackDistribution,
} from "@/lib/combat";
import { NumberInput } from "@/components/app/NumberInput";
import { EnemySkillUseModal } from "@/components/app/EnemySkillUseModal";
import { RarityBadge } from "@/components/app/RarityBadge";
import type { Rarity } from "@/lib/game";
import { Sparkles } from "lucide-react";

type Props = {
  enemy: CombatParticipant;
  onClose: () => void;
};

/**
 * DM-side modal: an enemy attacks one or more player characters.
 * - Manual damage input (the roll result).
 * - Multi-select player targets via chips.
 * - Distribution: individual (each takes full) or split (divided).
 * - Optional spread to link group: expands targets to any linked teammate.
 * - Defense is applied per-character using their equipped totals.
 */
export function EnemyAttackPlayersModal({ enemy, onClose }: Props) {
  const { t } = useT();
  const { characters, combat } = useGameData();

  // Players present in the encounter (skip DM-controlled, optional).
  const playerParticipants = combat.participants.filter(p => p.participant_type === "player");
  const presentCharIds = new Set(playerParticipants.map(p => p.character_id).filter(Boolean) as string[]);
  const players = characters.filter(c => c.role === "player" && presentCharIds.has(c.id));

  const [damage, setDamage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useDefense, setUseDefense] = useState(true);
  const [distribution, setDistribution] = useState<EnemyAttackDistribution>("individual");
  const [spread, setSpread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skills, setSkills] = useState<CombatEnemySkill[]>([]);
  const [useSkill, setUseSkill] = useState<CombatEnemySkill | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEnemySkills(enemy.id).then(s => { if (!cancelled) setSkills(s); });
    return () => { cancelled = true; };
  }, [enemy.id]);

  const selectedNames = useMemo(() => {
    return Array.from(selected)
      .map(id => characters.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
  }, [selected, characters]);

  const selectedArr = useMemo(() => Array.from(selected), [selected]);

  // Detect if any selected target is in a turn group (so we can offer "spread").
  const anySelectedLinked = selectedArr.some(cid => {
    const p = playerParticipants.find(pp => pp.character_id === cid);
    return !!p?.turn_group_id;
  });

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(players.map(p => p.id)));
  const clearAll = () => setSelected(new Set());

  const apply = async () => {
    if (damage <= 0) { toast.error(t("combat.attack.errDamage")); return; }
    if (selected.size === 0) { toast.error(t("combat.attack.errTargets")); return; }
    setBusy(true);
    const r = await applyEnemyAttackToPlayers(enemy, combat.participants, {
      damage,
      targetCharacterIds: selectedArr,
      useDefense,
      distribution: selected.size > 1 ? distribution : "individual",
      spreadToLinkGroup: spread && anySelectedLinked,
    });
    setBusy(false);
    if (!r.ok) { toast.error(t("combat.saveError")); return; }
    const total = r.results.reduce((a, x) => a + x.applied, 0);
    toast.success(t("combat.attack.done", { n: total, k: r.results.length }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="ornate-card max-w-md w-full p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
            {t("combat.attack.title")}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {enemy.display_name} → {t("combat.attack.subtitle")}
          </p>
        </div>

        {/* Roll result / damage */}
        <div className="space-y-1">
          <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            {t("combat.attack.rollResult")}
          </label>
          <NumberInput min={0} value={damage} onChange={setDamage} />
        </div>

        {/* Defense toggle */}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={useDefense} onChange={e => setUseDefense(e.target.checked)} />
          <span>{t("combat.attack.applyWithDefense")}</span>
        </label>

        {/* Targets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {t("combat.attack.targets")} ({selected.size}/{players.length})
            </label>
            <div className="flex gap-2 text-[10px]">
              <button className="underline text-muted-foreground" onClick={selectAll}>{t("combat.attack.all")}</button>
              <button className="underline text-muted-foreground" onClick={clearAll}>{t("combat.attack.none")}</button>
            </div>
          </div>
          {players.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t("combat.attack.noPlayers")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {players.map(c => {
                const on = selected.has(c.id);
                const p = playerParticipants.find(pp => pp.character_id === c.id);
                const linked = !!p?.turn_group_id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="px-2 py-1 rounded-full border text-[11px] font-display flex items-center gap-1.5 transition"
                    style={{
                      borderColor: on ? (c.color || "var(--gold)") : "var(--border)",
                      background: on
                        ? `color-mix(in oklab, ${c.color || "var(--gold)"} 30%, var(--card))`
                        : "var(--card)",
                      color: on ? "var(--foreground)" : "var(--muted-foreground)",
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: c.color || "var(--gold)" }}
                    />
                    {c.name}
                    {linked && <span className="text-[9px] opacity-70">⛓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Distribution (only when multiple targets) */}
        {selected.size > 1 && (
          <div className="space-y-1">
            <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {t("combat.attack.distribution")}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <DistBtn
                active={distribution === "individual"}
                onClick={() => setDistribution("individual")}
                title={t("combat.attack.individual")}
                hint={t("combat.attack.individualHint")}
              />
              <DistBtn
                active={distribution === "split"}
                onClick={() => setDistribution("split")}
                title={t("combat.attack.split")}
                hint={t("combat.attack.splitHint", { n: Math.max(1, Math.ceil(damage / Math.max(1, selected.size))) })}
              />
            </div>
          </div>
        )}

        {/* Spread to link group */}
        {anySelectedLinked && (
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={spread}
              onChange={e => setSpread(e.target.checked)}
            />
            <span>
              <span className="font-display">{t("combat.attack.spreadLink")}</span>
              <span className="block text-[10px] text-muted-foreground">{t("combat.attack.spreadLinkHint")}</span>
            </span>
          </label>
        )}

        {/* Enemy skills (may be damaging or not) */}
        <div className="space-y-1.5 pt-2 border-t border-border">
          <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Sparkles size={12} /> {t("combat.attack.useSkill")}
          </label>
          {skills.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t("combat.enemy.noSkills")}</p>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">{t("combat.attack.useSkillHint")}</p>
              <div className="flex flex-col gap-1.5">
                {skills.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setUseSkill(s)}
                    className="text-left rounded border border-border bg-card hover:border-[var(--gold)]/50 px-2 py-1.5 transition flex items-center gap-2"
                  >
                    <RarityBadge rarity={(s.rarity as Rarity) || "white"} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-display truncate">{s.name}</p>
                      {(s.dice || s.effect) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {s.dice ? <span className="text-[var(--gold)]">{s.dice}</span> : null}
                          {s.dice && s.effect ? " · " : ""}
                          {s.effect}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <button className="btn-fantasy flex-1" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button
            className="btn-fantasy flex-1"
            style={{ background: "var(--loss)", color: "white" }}
            disabled={busy || damage <= 0 || selected.size === 0}
            onClick={apply}
          >
            {t("combat.attack.apply")}
          </button>
        </div>
      </div>

      {useSkill && (
        <EnemySkillUseModal
          participant={enemy}
          skill={useSkill}
          initialResolvedTargets={selectedNames}
          onClose={() => { setUseSkill(null); onClose(); }}
        />
      )}
    </div>
  );
}

function DistBtn({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded border px-2 py-1.5 transition"
      style={{
        borderColor: active ? "var(--gold)" : "var(--border)",
        background: active ? "color-mix(in oklab, var(--gold) 18%, var(--card))" : "var(--card)",
      }}
    >
      <p className="text-[11px] font-display">{title}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
    </button>
  );
}
