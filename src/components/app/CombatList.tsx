import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  activeBlock,
  blockContainsCharacter,
  buildOrderedTurns,
  isEnemy,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type CombatTurnPin,
  type TurnBlock,
} from "@/lib/combat";
import { Crown, GripVertical } from "lucide-react";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useLongPress } from "@/hooks/useLongPress";
import { EffectInfoModal, type EffectInfoInput } from "@/components/app/EffectInfoModal";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins?: CombatTurnPin[];
  selfCharacterId?: string | null;
  onOpenChar?: (id: string) => void;
  /** If provided, the list becomes drag-and-droppable (DM only). */
  onReorder?: (fromKey: string, toIndex: number) => void;
};

export function CombatList({ encounter, participants, groups, pins, selfCharacterId, onOpenChar, onReorder }: Props) {
  const { t } = useT();
  const blocks = buildOrderedTurns(participants, groups, pins || []);
  const active = activeBlock(encounter, blocks);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (blocks.length === 0) {
    return <p className="text-center text-xs text-muted-foreground py-4">{t("combat.empty")}</p>;
  }

  const rows = blocks.map(b => (
    <TurnRow
      key={b.key}
      block={b}
      isActive={!!active && active.key === b.key}
      isSelf={selfCharacterId ? blockContainsCharacter(b, selfCharacterId) : false}
      activeLabel={t("combat.activePlayer")}
      activeEnemyLabel={t("combat.activeEnemy")}
      enlaceLabel={t("combat.linkBadge")}
      enemyLabel={t("combat.enemyLabel")}
      defeatedLabel={t("combat.defeated")}
      extraTurnLabel={t("combat.extraTurn")}
      enemyTurnOfLabel={t("combat.enemyTurnOf")}
      onOpenChar={onOpenChar}
      draggable={!!onReorder}
    />
  ));

  const header = encounter.status === "active" && (
    <p className="text-[10px] text-center text-muted-foreground font-display tracking-widest uppercase">
      {t("combat.round")} {encounter.round_number || 1}
    </p>
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!onReorder) return;
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.key === a.id);
    const newIndex = blocks.findIndex(b => b.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    arrayMove(blocks, oldIndex, newIndex);
    onReorder(String(a.id), newIndex);
  };

  return (
    <div className="space-y-2">
      {header}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map(b => b.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">{rows}</div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function TurnRow({
  block, isActive, isSelf, activeLabel, activeEnemyLabel, enlaceLabel, enemyLabel, defeatedLabel, extraTurnLabel, enemyTurnOfLabel, onOpenChar, draggable,
}: {
  block: TurnBlock; isActive: boolean; isSelf: boolean;
  activeLabel: string; activeEnemyLabel: string; enlaceLabel: string; enemyLabel: string; defeatedLabel: string;
  extraTurnLabel: string; enemyTurnOfLabel: string;
  onOpenChar?: (id: string) => void;
  draggable?: boolean;
}) {
  const sortable = useSortable({ id: block.key, disabled: !draggable });
  const dragStyle = draggable
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.6 : undefined,
      }
    : undefined;
  const setNodeRef = draggable ? sortable.setNodeRef : undefined;
  const dragHandle = draggable ? (
    <button
      type="button"
      ref={sortable.setActivatorNodeRef as any}
      {...sortable.attributes}
      {...sortable.listeners}
      className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground/70 hover:text-foreground flex-shrink-0"
      aria-label="Drag to reorder"
    >
      <GripVertical size={16} />
    </button>
  ) : null;

  const baseColor =
    block.kind === "solo"
      ? (block.participant.enemy_color || block.participant.color || "var(--gold)")
      : block.kind === "group"
      ? (block.group.color || "var(--gold)")
      : (block.linked.enemy_color || "var(--gold)");


  if (block.kind === "solo" && isEnemy(block.participant)) {
    const p = block.participant;
    const defeated = p.is_defeated;
    const containerStyle = {
      borderColor: isActive ? "var(--loss)" : `color-mix(in oklab, ${baseColor} 70%, transparent)`,
      background: `linear-gradient(180deg, color-mix(in oklab, ${baseColor} 18%, var(--card)), var(--card))`,
      boxShadow: isActive ? `0 0 0 1px var(--loss), 0 0 18px color-mix(in oklab, ${baseColor} 50%, transparent)` : undefined,
      opacity: defeated ? 0.55 : 1,
      ...dragStyle,
    } as const;
    const isTierAsset = !!getEnemyAssetUrl(p.enemy_icon);
    return (
      <div ref={setNodeRef as any} className="ornate-card !p-2 flex items-center gap-2 transition-shadow" style={containerStyle}>
        {dragHandle}
        <div className="w-10 h-10 rounded-full border-2 flex-shrink-0 flex items-center justify-center bg-card overflow-hidden relative"
          style={{ borderColor: baseColor, color: baseColor }}>
          <EnemyIcon name={p.enemy_icon} size={20} fill={isTierAsset} assetScale={isTierAsset ? 4 : 1} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate" style={{ color: baseColor }}>
            {p.display_name}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--loss)]/25 text-[var(--loss)]">
              {enemyLabel}
            </span>
            {defeated && (
              <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {defeatedLabel}
              </span>
            )}
            <TurnEffectChips kind="enemy" id={p.id} encounterId={p.encounter_id} />
          </div>
        </div>
        <InitiativeChip n={p.initiative} />
        {isActive && <ActiveBadge label={activeEnemyLabel} tone="enemy" />}
      </div>
    );
  }

  const containerStyle = {
    borderColor: isActive ? "var(--gold)" : `color-mix(in oklab, ${baseColor} 55%, transparent)`,
    background: `linear-gradient(180deg, color-mix(in oklab, ${baseColor} 12%, var(--card)), var(--card))`,
    boxShadow: isActive ? "0 0 0 1px var(--gold), 0 0 18px color-mix(in oklab, var(--gold) 35%, transparent)" : undefined,
    ...dragStyle,
  } as const;

  if (block.kind === "solo") {
    const p = block.participant;
    return (
      <div ref={setNodeRef as any} className="ornate-card !p-2 flex items-center gap-2 transition-shadow" style={containerStyle}>
        {dragHandle}
        <Avatar p={p} onClick={() => p.character_id && onOpenChar?.(p.character_id)} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate" style={{ color: p.color || undefined }}>
            {p.display_name}{isSelf && <span className="text-[10px] text-[var(--gain)] ml-1">●</span>}
          </p>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <p className="text-[10px] text-muted-foreground">{p.has_ended_turn ? "—" : " "}</p>
            {p.character_id && (
              <TurnEffectChips kind="character" id={p.character_id} encounterId={p.encounter_id} />
            )}
          </div>
        </div>
        <InitiativeChip n={p.initiative} />
        {isActive && <ActiveBadge label={activeLabel} />}
      </div>
    );
  }

  if (block.kind === "pin") {
    const l = block.linked;
    const inactive = l.is_defeated;
    return (
      <div ref={setNodeRef as any} className="ornate-card !p-2 flex items-center gap-2 transition-shadow"
        style={{
          ...containerStyle,
          opacity: inactive ? 0.5 : 1,
          borderStyle: "dashed",
        }}>
        {dragHandle}
        <div className="w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center bg-card overflow-hidden relative"
          style={{ borderColor: baseColor, color: baseColor }}>
          <EnemyIcon name={l.enemy_icon} size={14} fill={!!getEnemyAssetUrl(l.enemy_icon)} assetScale={getEnemyAssetUrl(l.enemy_icon) ? 4 : 1} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs truncate" style={{ color: baseColor }}>
            {block.pin.label || `${enemyTurnOfLabel} ${l.display_name}`}
          </p>
          <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--loss)]/25 text-[var(--loss)]">
            {extraTurnLabel}
          </span>
        </div>
        <InitiativeChip n={block.pin.initiative} />
        {isActive && !inactive && <ActiveBadge label={activeEnemyLabel} tone="enemy" />}
      </div>
    );
  }

  return (
    <div ref={setNodeRef as any} className="ornate-card !p-2 transition-shadow" style={containerStyle}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        {dragHandle}
        <span className="text-[10px] font-display uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in oklab, ${baseColor} 25%, transparent)`, color: baseColor }}>
          {enlaceLabel}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <InitiativeChip n={block.group.group_initiative} />
          {isActive && <ActiveBadge label={activeLabel} />}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {block.members.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <Avatar p={m} small onClick={() => m.character_id && onOpenChar?.(m.character_id)} />
            <div className="min-w-0 flex-1 flex items-center gap-1 flex-wrap">
              {m.is_leader && <Crown size={12} className="text-[var(--gold)]" />}
              <p className="font-display text-xs truncate" style={{ color: m.color || undefined }}>
                {m.display_name}
              </p>
              {m.character_id && (
                <TurnEffectChips kind="character" id={m.character_id} encounterId={m.encounter_id} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function Avatar({ p, small, onClick }: { p: CombatParticipant; small?: boolean; onClick?: () => void }) {
  const size = small ? "w-7 h-7" : "w-10 h-10";
  return (
    <button onClick={onClick} type="button"
      className={`${size} rounded-full overflow-hidden border-2 flex-shrink-0`}
      style={{ borderColor: p.color || "var(--gold)" }}>
      {p.image_url ? (
        <img src={p.image_url} alt={p.display_name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[var(--secondary)] flex items-center justify-center text-sm">🧙</div>
      )}
    </button>
  );
}

function InitiativeChip({ n }: { n: number }) {
  return (
    <span className="font-display text-sm px-2 py-0.5 rounded border border-[var(--gold)]/60 text-[var(--gold)] bg-card">
      {n}
    </span>
  );
}

function ActiveBadge({ label, tone }: { label: string; tone?: "enemy" }) {
  const bg = tone === "enemy" ? "var(--loss)" : "var(--gold)";
  const color = tone === "enemy" ? "white" : "black";
  return (
    <span className="text-[9px] font-display uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: bg, color }}>
      {label}
    </span>
  );
}

// ─────────────────── Effect chips (read-only, long-press → info) ───────────────────

type TempEffectRow = Tables<"combat_temporary_effects">;
type CondRow = Tables<"character_conditions">;

function emojiOf(row: TempEffectRow | CondRow, kind: "temp" | "cond"): string {
  if (kind === "cond") return (row as CondRow).icon || "✨";
  const r = row as TempEffectRow;
  const raw = (r.label || "").trim();
  if (raw) {
    const first = raw.split(/\s+/)[0] || "";
    if (first && !/[a-z0-9]/i.test(first)) return first;
  }
  const type = (r.effect_type || "").toLowerCase();
  if (type === "shield") return "🛡️";
  if (type === "note") return "📜";
  if (type === "buff") return "✨";
  if (type === "control") return "💫";
  if (type === "debuff") return "☠️";
  return "✨";
}

function TurnEffectChips({
  kind, id, encounterId,
}: { kind: "enemy" | "character"; id: string; encounterId: string }) {
  const [temp, setTemp] = useState<TempEffectRow[]>([]);
  const [cond, setCond] = useState<CondRow[]>([]);
  const [info, setInfo] = useState<EffectInfoInput | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const tempQ = (supabase as any).from("combat_temporary_effects")
        .select("*").eq("encounter_id", encounterId)
        .eq(kind === "enemy" ? "target_enemy_participant_id" : "target_character_id", id)
        .order("created_at", { ascending: true });
      const condQ = kind === "character"
        ? (supabase as any).from("character_conditions").select("*").eq("character_id", id).order("created_at", { ascending: true })
        : Promise.resolve({ data: [] });
      const [{ data: t1 }, { data: t2 }] = await Promise.all([tempQ, condQ]);
      if (!alive) return;
      setTemp((t1 || []) as TempEffectRow[]);
      setCond((t2 || []) as CondRow[]);
    };
    load();
    const ch = (supabase as any)
      .channel(`fx-${kind}-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_temporary_effects", filter: `encounter_id=eq.${encounterId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions", filter: kind === "character" ? `character_id=eq.${id}` : `character_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { alive = false; (supabase as any).removeChannel(ch); };
  }, [kind, id, encounterId]);

  const items: Array<{ key: string; emoji: string; dur: number | null; payload: EffectInfoInput }> = [
    ...temp.map(r => ({
      key: `t:${r.id}`,
      emoji: emojiOf(r, "temp"),
      dur: typeof r.duration_rounds === "number" ? r.duration_rounds : null,
      payload: { kind: "temporary" as const, row: r },
    })),
    ...cond.map(r => ({
      key: `c:${r.id}`,
      emoji: emojiOf(r, "cond"),
      dur: typeof r.turns_left === "number" ? r.turns_left : null,
      payload: { kind: "condition" as const, row: r },
    })),
  ];

  if (items.length === 0) return null;
  const MAX = 3;
  const shown = items.slice(0, MAX);
  const overflow = items.length - shown.length;

  return (
    <>
      <div className="inline-flex items-center gap-1 ml-1">
        {shown.map(it => (
          <EffectChip key={it.key} emoji={it.emoji} dur={it.dur} onInfo={() => setInfo(it.payload)} />
        ))}
        {overflow > 0 && (
          <span className="text-[9px] font-display px-1 rounded bg-secondary border border-border">+{overflow}</span>
        )}
      </div>
      {info && <EffectInfoModal effect={info} onClose={() => setInfo(null)} />}
    </>
  );
}

function EffectChip({ emoji, dur, onInfo }: { emoji: string; dur: number | null; onInfo: () => void }) {
  const lp = useLongPress(onInfo, 500);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!lp.didLongPress()) onInfo(); }}
      onContextMenu={(e) => { e.preventDefault(); onInfo(); }}
      onMouseDown={lp.onMouseDown}
      onMouseUp={lp.onMouseUp}
      onMouseLeave={lp.onMouseLeave}
      onTouchStart={lp.onTouchStart}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      className="relative inline-flex items-center justify-center w-5 h-5 rounded border border-border bg-card text-[11px] leading-none hover:border-[var(--gold)]/60"
      aria-label="effect"
    >
      <span>{emoji}</span>
      {dur !== null && (
        <span className="absolute -bottom-1 -right-1 min-w-[12px] h-[12px] px-[2px] rounded-full bg-secondary border border-border text-[7px] font-display leading-none flex items-center justify-center">
          {dur}
        </span>
      )}
    </button>
  );
}

