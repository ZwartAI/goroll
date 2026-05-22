import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Edit3, Copy, Trash2, FastForward, Sword, Heart, Pin, ChevronDown, X,
} from "lucide-react";
import {
  activeBlock,
  addTurnPin,
  buildOrderedTurns,
  deleteTurnPin,
  dmEndEnemyTurn,
  isEnemy,
  removeEnemy,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
} from "@/lib/combat";
import {
  listEffectsForEnemy,
  tickEnemyEffect,
} from "@/lib/combat-skills";
import { EffectInfoModal } from "@/components/app/EffectInfoModal";
import { HpShieldBar } from "@/components/app/HpShieldBar";
import { useEncounterShields } from "@/hooks/useEncounterShields";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { EnemyEditorModal } from "@/components/app/EnemyEditorModal";
import { EnemyDamageModal } from "@/components/app/EnemyDamageModal";
import { EnemyAttackPlayersModal } from "@/components/app/EnemyAttackPlayersModal";
import { EnemyCombatSheetModal } from "@/components/app/EnemyCombatSheetModal";
import { EnemyDuplicateModal } from "@/components/app/EnemyDuplicateModal";
import { useLongPress } from "@/hooks/useLongPress";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

type EffectRow = Tables<"combat_temporary_effects">;

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  dm: { id: string; name: string; color: string };
};

export function EnemyManagerDM({ encounter, participants, groups, pins = [], dm }: Props) {
  const { t } = useT();
  const enemies = participants.filter(isEnemy).sort((a, b) => a.order_index - b.order_index);
  const blocks = buildOrderedTurns(participants, groups, pins);
  const active = activeBlock(encounter, blocks);
  const { byEnemyParticipant: shieldByEnemy } = useEncounterShields(encounter.id);

  const [editing, setEditing] = useState<CombatParticipant | null>(null);
  const [attacking, setAttacking] = useState<CombatParticipant | null>(null);
  const [healing, setHealing] = useState<CombatParticipant | null>(null);
  const [sheet, setSheet] = useState<CombatParticipant | null>(null);
  const [duplicating, setDuplicating] = useState<CombatParticipant | null>(null);
  const [removing, setRemoving] = useState<CombatParticipant | null>(null);
  const [removingPin, setRemovingPin] = useState<CombatTurnPin | null>(null);
  // Only one card has the action strip open at a time.
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  if (enemies.length === 0 && pins.length === 0) return null;

  // Pins grouped by linked enemy.
  const pinsByEnemy = new Map<string, CombatTurnPin[]>();
  for (const p of pins) {
    const arr = pinsByEnemy.get(p.linked_participant_id) || [];
    arr.push(p);
    pinsByEnemy.set(p.linked_participant_id, arr);
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
        {t("combat.enemies")}
      </p>
      {enemies.map(p => {
        const isActive = active?.kind === "solo" && active.participant.id === p.id;
        const myPins = pinsByEnemy.get(p.id) || [];
        return (
          <div key={p.id} className="space-y-1">
            <EnemyRow
              p={p}
              isActive={isActive}
              encounter={encounter}
              blocks={blocks}
              actionsOpen={openActionsId === p.id}
              onToggleActions={() => setOpenActionsId(prev => (prev === p.id ? null : p.id))}
              onEdit={() => setEditing(p)}
              onDamage={() => setAttacking(p)}
              onHeal={() => setHealing(p)}
              onSheet={() => setSheet(p)}
              onDuplicate={() => setDuplicating(p)}
              onRemove={() => setRemoving(p)}
              onAddPin={async () => {
                const r = await addTurnPin(encounter, p);
                if (!r.ok) toast.error(t("combat.saveError"));
                else toast.success(t("combat.pinAdded"));
              }}
            />
            {myPins.map(pin => {
              const pinActive = active?.kind === "pin" && active.pin.id === pin.id;
              return (
                <PinRow
                  key={pin.id}
                  pin={pin}
                  linked={p}
                  isActive={pinActive}
                  encounter={encounter}
                  blocks={blocks}
                  onDelete={() => setRemovingPin(pin)}
                  onOpenSheet={() => setSheet(p)}
                />
              );
            })}
          </div>
        );
      })}

      {editing && (
        <EnemyEditorModal encounter={encounter} dm={dm} editing={editing} onClose={() => setEditing(null)} />
      )}
      {attacking && (
        <EnemyAttackPlayersModal enemy={attacking} onClose={() => setAttacking(null)} />
      )}
      {healing && (
        <EnemyDamageModal participant={healing} mode="both" onClose={() => setHealing(null)} />
      )}
      {sheet && (
        <EnemyCombatSheetModal
          participant={sheet}
          encounter={encounter}
          participants={participants}
          groups={groups}
          onClose={() => setSheet(null)}
        />
      )}
      {duplicating && (
        <EnemyDuplicateModal
          enemy={duplicating}
          encounter={encounter}
          participants={participants}
          groups={groups}
          pins={pins}
          dm={dm}
          onClose={() => setDuplicating(null)}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title={t("combat.confirmRemoveEnemyTitle")}
        description={t("combat.confirmRemoveEnemy")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          // Also delete its pins (cascade not declared on DB).
          const myPins = pinsByEnemy.get(removing.id) || [];
          await Promise.all(myPins.map(p => deleteTurnPin(p)));
          const r = await removeEnemy(removing, encounter, dm);
          if (!r.ok) toast.error(t("combat.saveError"));
          else toast.success(t(r.archived ? "combat.enemyArchivedToBestiary" : "combat.enemyRemoved"));
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        open={!!removingPin}
        title={t("combat.confirmDeletePinTitle")}
        description={t("combat.confirmDeletePin")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onCancel={() => setRemovingPin(null)}
        onConfirm={async () => {
          if (!removingPin) return;
          const r = await deleteTurnPin(removingPin);
          if (!r.ok) toast.error(t("combat.saveError"));
          setRemovingPin(null);
        }}
      />
    </div>
  );
}

function EnemyRow({
  p, isActive, encounter, blocks, actionsOpen, onToggleActions,
  onEdit, onDamage, onHeal, onSheet, onDuplicate, onRemove, onAddPin,
}: {
  p: CombatParticipant;
  isActive: boolean;
  encounter: CombatEncounter;
  blocks: ReturnType<typeof buildOrderedTurns>;
  actionsOpen: boolean;
  onToggleActions: () => void;
  onEdit: () => void; onDamage: () => void; onHeal: () => void; onSheet: () => void;
  onDuplicate: () => void; onRemove: () => void; onAddPin: () => void;
}) {
  const { t } = useT();
  const max = p.enemy_max_hp || 1;
  const cur = p.enemy_hp || 0;
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  const hpBg = pct > 60 ? "var(--gain)" : pct > 30 ? "#eab308" : "var(--loss)";
  const baseColor = p.enemy_color || "var(--loss)";
  const lp = useLongPress(onSheet, 450);
  const isTierAsset = !!getEnemyAssetUrl(p.enemy_icon);

  return (
    <div
      className="ornate-card !p-3 transition"
      style={{
        borderColor: isActive ? "var(--loss)" : `color-mix(in oklab, ${baseColor} 55%, transparent)`,
        opacity: p.is_defeated ? 0.55 : 1,
        boxShadow: isActive ? `0 0 0 1px var(--loss), 0 0 18px color-mix(in oklab, ${baseColor} 50%, transparent)` : undefined,
      }}
    >
      <div className="flex items-stretch gap-3">
        {/* Left: large avatar */}
        <div
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card relative shrink-0 self-center cursor-pointer select-none"
          style={{ borderColor: baseColor, color: baseColor }}
          {...{ onMouseDown: lp.onMouseDown, onMouseUp: lp.onMouseUp, onMouseLeave: lp.onMouseLeave, onTouchStart: lp.onTouchStart, onTouchEnd: lp.onTouchEnd, onTouchCancel: lp.onTouchCancel }}
          onClick={() => { if (!lp.didLongPress()) onSheet(); }}
          title={t("combat.enemy.openSheet")}
        >
          <EnemyIcon name={p.enemy_icon} size={56} fill={isTierAsset} assetScale={isTierAsset ? 4 : 1} />
        </div>

        {/* Right: info + actions */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base sm:text-lg leading-tight truncate" style={{ color: baseColor }}>
                {p.display_name}
              </p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-display uppercase tracking-wider">
                DEF {p.enemy_defense || 0} · SPD {p.enemy_speed || "—"} · INI {p.initiative}
              </p>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="relative h-2.5 rounded-full bg-card border border-border overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: hpBg }} />
            </div>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground font-display text-center">
              {cur} / {max} HP
            </p>
          </div>

          {/* Active effects strip (Phase 1) */}
          <EnemyEffectsStrip participantId={p.id} encounterId={encounter.id} />

          {isActive && !p.is_defeated && (
            <button
              className="btn-fantasy w-full text-xs sm:text-sm py-1.5 flex items-center justify-center gap-1.5 font-display"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => dmEndEnemyTurn(encounter, blocks)}>
              <FastForward size={14} /> {t("combat.endEnemyTurn")}
            </button>
          )}

          {/* Compact "Actions" toggle (Phase 1): hidden by default to reduce visual noise */}
          {!actionsOpen ? (
            <button
              type="button"
              className="btn-fantasy w-full text-xs py-1.5 flex items-center justify-center gap-1.5 font-display uppercase tracking-wider"
              style={{
                background: "linear-gradient(180deg, oklch(0.32 0.10 250), oklch(0.22 0.08 250))",
                color: "white",
                borderColor: "oklch(0.45 0.10 240)",
              }}
              onClick={onToggleActions}
              title={t("combat.actions")}
              aria-expanded={false}
            >
              <ChevronDown size={14} /> {t("combat.actions")}
            </button>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-1.5">
                <IconBtn label={t("combat.damage")} icon={<Sword className="w-[55%] h-[55%]" strokeWidth={2.2} />} bg="color-mix(in oklab, var(--loss) 70%, var(--card))" onClick={onDamage} />
                <IconBtn label={t("combat.heal")} icon={<Heart className="w-[55%] h-[55%]" strokeWidth={2.2} />} bg="color-mix(in oklab, var(--gain) 70%, var(--card))" onClick={onHeal} />
                <IconBtn label={t("combat.edit")} icon={<Edit3 className="w-[55%] h-[55%]" strokeWidth={2.2} />} bg="color-mix(in oklab, oklch(0.55 0.12 240) 55%, var(--card))" onClick={onEdit} />
                <IconBtn label={t("combat.duplicate.label")} icon={<Copy className="w-[55%] h-[55%]" strokeWidth={2.2} />} bg="color-mix(in oklab, oklch(0.45 0.10 240) 60%, var(--card))" onClick={onDuplicate} />
                <IconBtn label={t("combat.remove")} icon={<Trash2 className="w-[55%] h-[55%]" strokeWidth={2.2} />} bg="color-mix(in oklab, var(--loss) 55%, black)" onClick={onRemove} />
              </div>
              <button
                type="button"
                className="btn-fantasy w-full text-[10px] py-1 flex items-center justify-center gap-1 font-display uppercase tracking-wider"
                style={{ background: "transparent", borderStyle: "dashed", color: "var(--muted-foreground)" }}
                onClick={onToggleActions}
                title={t("combat.hideActions")}
              >
                <X size={11} /> {t("combat.hideActions")}
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Add turn pin */}
      <button
        className="btn-fantasy w-full text-[10px] py-1 mt-2 flex items-center justify-center gap-1 border border-dashed"
        style={{ background: "transparent", borderColor: `color-mix(in oklab, ${baseColor} 55%, transparent)`, color: baseColor }}
        onClick={onAddPin}
        title={t("combat.addTurnPinHint")}>
        <Pin size={12} /> {t("combat.addTurnPin")}
      </button>
    </div>
  );
}

function PinRow({
  pin, linked, isActive, encounter, blocks, onDelete, onOpenSheet,
}: {
  pin: CombatTurnPin;
  linked: CombatParticipant;
  isActive: boolean;
  encounter: CombatEncounter;
  blocks: ReturnType<typeof buildOrderedTurns>;
  onDelete: () => void;
  onOpenSheet: () => void;
}) {
  const { t } = useT();
  const baseColor = linked.enemy_color || "var(--loss)";
  const isTierAsset = !!getEnemyAssetUrl(linked.enemy_icon);
  const inactive = linked.is_defeated || !pin.is_active;
  return (
    <div
      className="ornate-card !p-2 flex items-center gap-2 ml-3 transition"
      style={{
        borderColor: isActive ? "var(--loss)" : `color-mix(in oklab, ${baseColor} 45%, transparent)`,
        borderStyle: "dashed",
        opacity: inactive ? 0.5 : 1,
      }}
    >
      <button
        onClick={onOpenSheet}
        className="w-8 h-8 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card shrink-0 relative"
        style={{ borderColor: baseColor, color: baseColor }}>
        <EnemyIcon name={linked.enemy_icon} size={16} fill={isTierAsset} assetScale={isTierAsset ? 4 : 1} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs truncate" style={{ color: baseColor }}>
          {pin.label || `${t("combat.enemyTurnOf")} ${linked.display_name}`}
        </p>
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
          {t("combat.extraTurn")}
        </p>
      </div>
      {isActive && !inactive && (
        <button
          className="btn-fantasy text-[10px] py-1 px-2 flex items-center gap-1"
          style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
          onClick={() => dmEndEnemyTurn(encounter, blocks)}>
          <FastForward size={12} /> {t("combat.endEnemyTurn")}
        </button>
      )}
      <button
        className="text-[var(--loss)] hover:opacity-80 p-1"
        onClick={onDelete}
        title={t("combat.deletePin")}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function IconBtn({
  label, icon, bg, color, onClick,
}: { label: string; icon: React.ReactNode; bg: string; color?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn-fantasy aspect-square w-full !p-0 flex items-center justify-center min-h-[34px]"
      style={{ background: bg, color: color || "white" }}
      onClick={onClick}
      title={label}
      aria-label={label}>
      {icon}
    </button>
  );
}

// ─────────────────── Effects strip ───────────────────

/**
 * Effect labels are stored as "{emoji} {localized label}" when applied from
 * ConditionsPanel. Extract the leading emoji (everything before the first
 * space). Fall back to a small map by effect_type, then "✨".
 */
function emojiForEffect(e: EffectRow): string {
  const raw = (e.label || "").trim();
  if (raw) {
    // Take the first whitespace-separated token. It should be the emoji.
    const first = raw.split(/\s+/)[0] || "";
    // Heuristic: if it contains no ASCII letters/digits, treat as the emoji.
    if (first && !/[a-z0-9]/i.test(first)) return first;
  }
  const type = (e.effect_type || "").toLowerCase();
  if (type === "shield") return "🛡️";
  if (type === "note") return "📜";
  if (type === "buff") return "✨";
  if (type === "control") return "💫";
  if (type === "debuff") return "☠️";
  return "✨";
}

/** Strip the leading emoji from a stored label, returning just the text. */
function textOfEffectLabel(e: EffectRow): string {
  const raw = (e.label || "").trim();
  if (!raw) return e.effect_type || "";
  const parts = raw.split(/\s+/);
  if (parts.length > 1 && !/[a-z0-9]/i.test(parts[0])) {
    return parts.slice(1).join(" ");
  }
  return raw;
}

function EnemyEffectsStrip({ participantId, encounterId }: { participantId: string; encounterId: string }) {
  const { t } = useT();
  const [effects, setEffects] = useState<EffectRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<EffectRow | null>(null);

  const load = async () => {
    const rows = await listEffectsForEnemy(participantId);
    setEffects(rows);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`enemy-fx-${participantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "combat_temporary_effects", filter: `encounter_id=eq.${encounterId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, encounterId]);

  if (effects.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {effects.map(e => (
        <EnemyEffectChip
          key={e.id}
          row={e}
          disabled={busy === e.id}
          onTick={async () => {
            if (busy) return;
            setBusy(e.id);
            try { await tickEnemyEffect(e.id); } finally { setBusy(null); load(); }
          }}
          onInfo={() => setInfo(e)}
          tickLabel={t("combat.effects.reduce")}
        />
      ))}
      {info && (
        <EffectInfoModal effect={{ kind: "temporary", row: info }} onClose={() => setInfo(null)} />
      )}
    </div>
  );
}

function EnemyEffectChip({
  row, disabled, onTick, onInfo, tickLabel,
}: {
  row: EffectRow;
  disabled: boolean;
  onTick: () => void;
  onInfo: () => void;
  tickLabel: string;
}) {
  const emoji = emojiForEffect(row);
  const dur = typeof row.duration_rounds === "number" ? row.duration_rounds : null;
  const dmg = Math.max(0, Math.floor(row.value || 0));
  const text = textOfEffectLabel(row);
  const title = `${text}${dmg > 0 ? ` · -${dmg}/t` : ""}${dur !== null ? ` · ${dur}t` : ""} — ${tickLabel}`;
  const lp = useLongPress(onInfo, 500);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!lp.didLongPress()) onTick(); }}
      onContextMenu={(ev) => { ev.preventDefault(); onInfo(); }}
      onMouseDown={lp.onMouseDown}
      onMouseUp={lp.onMouseUp}
      onMouseLeave={lp.onMouseLeave}
      onTouchStart={lp.onTouchStart}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      className="relative w-8 h-8 rounded-md border border-border bg-card hover:border-[var(--gold)]/60 flex items-center justify-center text-base leading-none disabled:opacity-50"
      title={title}
      aria-label={title}
    >
      <span>{emoji}</span>
      {dur !== null && (
        <span className="absolute -bottom-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-secondary border border-border text-[8px] font-display leading-none flex items-center justify-center">
          {dur}
        </span>
      )}
    </button>
  );
}

