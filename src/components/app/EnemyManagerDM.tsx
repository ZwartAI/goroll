import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Edit3, Copy, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, FastForward,
} from "lucide-react";
import {
  activeBlock,
  applyEnemyDamage,
  buildOrderedTurns,
  dmEndEnemyTurn,
  duplicateEnemy,
  healEnemy,
  isEnemy,
  moveParticipant,
  removeEnemy,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
} from "@/lib/combat";
import { EnemyIcon } from "@/components/app/EnemyIconPicker";
import { EnemyEditorModal } from "@/components/app/EnemyEditorModal";
import { EnemyDamageModal } from "@/components/app/EnemyDamageModal";

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

  if (enemies.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
        {t("combat.enemies")}
      </p>
      {enemies.map(p => {
        const isActiveP = active?.kind === "solo" && active.participant.id === p.id;
        const max = p.enemy_max_hp || 1;
        const cur = p.enemy_hp || 0;
        const pct = Math.max(0, Math.min(100, (cur / max) * 100));
        const hpBg = pct > 60 ? "var(--gain)" : pct > 30 ? "#eab308" : "var(--loss)";
        const baseColor = p.enemy_color || "var(--loss)";
        const blockKey = `s:${p.id}`;

        return (
          <div key={p.id}
            className="ornate-card !p-2 space-y-1.5"
            style={{
              borderColor: isActiveP ? "var(--loss)" : `color-mix(in oklab, ${baseColor} 55%, transparent)`,
              opacity: p.is_defeated ? 0.55 : 1,
            }}>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center bg-card"
                style={{ borderColor: baseColor, color: baseColor }}>
                <EnemyIcon name={p.enemy_icon} size={18} />
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

            <div className="grid grid-cols-4 gap-1">
              <HpBtn label="-1" onClick={() => applyEnemyDamage(p, 1, { useDefense: false })} />
              <HpBtn label="-5" onClick={() => applyEnemyDamage(p, 5, { useDefense: false })} />
              <HpBtn label="+1" onClick={() => healEnemy(p, 1)} positive />
              <HpBtn label="+5" onClick={() => healEnemy(p, 5)} positive />
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button className="btn-fantasy text-[10px] py-1"
                style={{ background: "var(--loss)", color: "white" }}
                onClick={() => setDamaging(p)}>
                {t("combat.damage")}
              </button>
              <button className="btn-fantasy text-[10px] py-1"
                style={{ background: "var(--gain)", color: "white" }}
                onClick={() => setDamaging(p)}>
                {t("combat.heal")}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1">
              <IconBtn icon={<Edit3 size={12} />} onClick={() => setEditing(p)} />
              <IconBtn icon={<Copy size={12} />} onClick={async () => {
                const r = await duplicateEnemy(p, encounter, dm);
                if (!r.ok) toast.error(t("combat.saveError"));
              }} />
              <IconBtn icon={<Trash2 size={12} />} danger onClick={async () => {
                if (!confirm(t("combat.confirmRemoveEnemy"))) return;
                const r = await removeEnemy(p, encounter, dm);
                if (!r.ok) toast.error(t("combat.saveError"));
              }} />
              {isActiveP && (
                <button className="btn-fantasy text-[10px] py-1"
                  style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                  onClick={() => dmEndEnemyTurn(encounter, blocks)}
                  title={t("combat.endEnemyTurn")}>
                  <FastForward size={12} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1">
              <IconBtn icon={<ChevronsUp size={12} />} onClick={() => moveParticipant(encounter, blocks, blockKey, "first")} />
              <IconBtn icon={<ArrowUp size={12} />} onClick={() => moveParticipant(encounter, blocks, blockKey, "up")} />
              <IconBtn icon={<ArrowDown size={12} />} onClick={() => moveParticipant(encounter, blocks, blockKey, "down")} />
              <IconBtn icon={<ChevronsDown size={12} />} onClick={() => moveParticipant(encounter, blocks, blockKey, "last")} />
            </div>
          </div>
        );
      })}

      {editing && (
        <EnemyEditorModal encounter={encounter} dm={dm} editing={editing} onClose={() => setEditing(null)} />
      )}
      {damaging && (
        <EnemyDamageModal participant={damaging} onClose={() => setDamaging(null)} />
      )}
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

function IconBtn({ icon, onClick, danger }: { icon: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button className="btn-fantasy text-[10px] py-1 flex items-center justify-center"
      style={danger ? { background: "color-mix(in oklab, var(--loss) 35%, var(--card))" } : undefined}
      onClick={onClick}>
      {icon}
    </button>
  );
}
