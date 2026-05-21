import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Edit3, Copy, Trash2, FastForward, FileText, GripVertical,
} from "lucide-react";
import {
  activeBlock,
  applyEnemyDamage,
  buildOrderedTurns,
  dmEndEnemyTurn,
  duplicateEnemy,
  healEnemy,
  isEnemy,
  removeEnemy,
  reorderParticipantTo,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
} from "@/lib/combat";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { EnemyEditorModal } from "@/components/app/EnemyEditorModal";
import { EnemyDamageModal } from "@/components/app/EnemyDamageModal";
import { EnemyCombatSheetModal } from "@/components/app/EnemyCombatSheetModal";
import { useLongPress } from "@/hooks/useLongPress";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  dm: { id: string; name: string; color: string };
};

export function EnemyManagerDM({ encounter, participants, groups, dm }: Props) {
  const { t } = useT();
  const enemies = participants.filter(isEnemy).sort((a, b) => a.order_index - b.order_index);
  const blocks = buildOrderedTurns(participants, groups);
  const active = activeBlock(encounter, blocks);

  const [editing, setEditing] = useState<CombatParticipant | null>(null);
  const [damaging, setDamaging] = useState<CombatParticipant | null>(null);
  const [sheet, setSheet] = useState<CombatParticipant | null>(null);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  if (enemies.length === 0) return null;

  const onDrop = async (toEnemy: CombatParticipant) => {
    if (!dragKey) return;
    const toBlockKey = `s:${toEnemy.id}`;
    if (toBlockKey === dragKey) { setDragKey(null); setOverKey(null); return; }
    const toIdx = blocks.findIndex(b => b.key === toBlockKey);
    setDragKey(null);
    setOverKey(null);
    if (toIdx < 0) return;
    const r = await reorderParticipantTo(encounter, blocks, dragKey, toIdx);
    if (!r.ok) toast.error(t("combat.saveError"));
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
        {t("combat.enemies")}
      </p>
      {enemies.map(p => {
        const key = `s:${p.id}`;
        return (
          <EnemyRow
            key={p.id}
            p={p}
            isActive={active?.kind === "solo" && active.participant.id === p.id}
            encounter={encounter}
            blocks={blocks}
            isDragging={dragKey === key}
            isDragOver={overKey === key && dragKey !== key}
            onDragStart={() => setDragKey(key)}
            onDragOver={() => setOverKey(key)}
            onDragEnd={() => { setDragKey(null); setOverKey(null); }}
            onDropOn={() => onDrop(p)}
            onEdit={() => setEditing(p)}
            onDamage={() => setDamaging(p)}
            onSheet={() => setSheet(p)}
            onDuplicate={async () => {
              const r = await duplicateEnemy(p, encounter, dm);
              if (!r.ok) toast.error(t("combat.saveError"));
            }}
            onRemove={async () => {
              if (!confirm(t("combat.confirmRemoveEnemy"))) return;
              const r = await removeEnemy(p, encounter, dm);
              if (!r.ok) toast.error(t("combat.saveError"));
            }}
          />
        );
      })}

      {editing && (
        <EnemyEditorModal encounter={encounter} dm={dm} editing={editing} onClose={() => setEditing(null)} />
      )}
      {damaging && (
        <EnemyDamageModal participant={damaging} onClose={() => setDamaging(null)} />
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
    </div>
  );
}

function EnemyRow({
  p, isActive, encounter, blocks,
  isDragging, isDragOver, onDragStart, onDragOver, onDragEnd, onDropOn,
  onEdit, onDamage, onSheet, onDuplicate, onRemove,
}: {
  p: CombatParticipant;
  isActive: boolean;
  encounter: CombatEncounter;
  blocks: ReturnType<typeof buildOrderedTurns>;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  onEdit: () => void; onDamage: () => void; onSheet: () => void;
  onDuplicate: () => void; onRemove: () => void;
}) {
  const { t } = useT();
  const max = p.enemy_max_hp || 1;
  const cur = p.enemy_hp || 0;
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  const hpBg = pct > 60 ? "var(--gain)" : pct > 30 ? "#eab308" : "var(--loss)";
  const baseColor = p.enemy_color || "var(--loss)";
  const lp = useLongPress(onSheet, 450);
  const blueBg = "color-mix(in oklab, oklch(0.55 0.18 240) 60%, var(--card))";

  return (
    <div
      className="ornate-card !p-2 space-y-1.5 transition"
      style={{
        borderColor: isDragOver
          ? "var(--gold)"
          : isActive ? "var(--loss)" : `color-mix(in oklab, ${baseColor} 55%, transparent)`,
        opacity: isDragging ? 0.5 : (p.is_defeated ? 0.55 : 1),
        boxShadow: isDragOver ? "0 0 0 2px var(--gold)" : undefined,
      }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
    >
      <div className="flex items-center gap-2 select-none cursor-pointer"
        {...{ onMouseDown: lp.onMouseDown, onMouseUp: lp.onMouseUp, onMouseLeave: lp.onMouseLeave, onTouchStart: lp.onTouchStart, onTouchEnd: lp.onTouchEnd, onTouchCancel: lp.onTouchCancel }}
        onClick={() => { if (!lp.didLongPress()) onSheet(); }}
        title={t("combat.enemy.openSheet")}>
        <span
          className="text-muted-foreground hover:text-[var(--gold)] cursor-grab active:cursor-grabbing px-0.5"
          draggable
          onDragStart={(e) => { e.stopPropagation(); onDragStart(); try { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; } catch {} }}
          onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
          onClick={(e) => e.stopPropagation()}
          title={t("combat.reorderHint")}
        >
          <GripVertical size={14} />
        </span>
        <div className="w-9 h-9 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card relative"
          style={{ borderColor: baseColor, color: baseColor }}>
          <EnemyIcon name={p.enemy_icon} size={18} fill={!!getEnemyAssetUrl(p.enemy_icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate" style={{ color: baseColor }}>{p.display_name}</p>
          <p className="text-[10px] text-muted-foreground">
            {t("combat.initiative")} {p.initiative} · DEF {p.enemy_defense || 0} · {p.enemy_speed || "—"}
          </p>
        </div>
        {p.is_defeated && (
          <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {t("combat.defeated")}
          </span>
        )}
      </div>

      <div className="relative h-2 rounded-full bg-card border border-border overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: hpBg }} />
      </div>
      <p className="text-[10px] text-center text-muted-foreground">{cur} / {max}</p>

      <div className="grid grid-cols-5 gap-1">
        <HpBtn label="-1" onClick={() => applyEnemyDamage(p, 1, { useDefense: false })} />
        <HpBtn label="-5" onClick={() => applyEnemyDamage(p, 5, { useDefense: false })} />
        <HpBtn label="+1" onClick={() => healEnemy(p, 1)} positive />
        <HpBtn label="+5" onClick={() => healEnemy(p, 5)} positive />
        <button className="btn-fantasy text-[10px] py-1 flex items-center justify-center gap-0.5"
          style={{ background: "color-mix(in oklab, var(--gold) 35%, var(--card))" }}
          onClick={onSheet} title={t("combat.enemy.openSheet")}>
          <FileText size={11} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button className="btn-fantasy text-[10px] py-1"
          style={{ background: "var(--loss)", color: "white" }}
          onClick={onDamage}>
          {t("combat.damage")}
        </button>
        <button className="btn-fantasy text-[10px] py-1"
          style={{ background: "var(--gain)", color: "white" }}
          onClick={onDamage}>
          {t("combat.heal")}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1">
        <IconBtn icon={<Edit3 size={12} />} onClick={onEdit} bg={blueBg} />
        <IconBtn icon={<Copy size={12} />} onClick={onDuplicate} bg={blueBg} />
        <IconBtn icon={<Trash2 size={12} />} danger onClick={onRemove} />
        {isActive ? (
          <button className="btn-fantasy text-[10px] py-1"
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={() => dmEndEnemyTurn(encounter, blocks)}
            title={t("combat.endEnemyTurn")}>
            <FastForward size={12} />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function HpBtn({ label, onClick, positive }: { label: string; onClick: () => void; positive?: boolean }) {
  return (
    <button className="btn-fantasy text-[10px] py-1"
      style={{ background: positive ? "color-mix(in oklab, var(--gain) 35%, var(--card))" : "color-mix(in oklab, var(--loss) 35%, var(--card))" }}
      onClick={onClick}>
      {label}
    </button>
  );
}

function IconBtn({ icon, onClick, danger, bg }: { icon: React.ReactNode; onClick: () => void; danger?: boolean; bg?: string }) {
  const background = danger ? "color-mix(in oklab, var(--loss) 35%, var(--card))" : bg;
  return (
    <button className="btn-fantasy text-[10px] py-1 flex items-center justify-center"
      style={background ? { background, color: "white" } : undefined}
      onClick={onClick}>
      {icon}
    </button>
  );
}
