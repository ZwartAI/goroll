import { useT } from "@/lib/i18n";
import {
  activeBlock,
  blockContainsCharacter,
  buildOrderedTurns,
  isEnemy,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
  type TurnBlock,
} from "@/lib/combat";
import { Crown } from "lucide-react";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";

type Props = {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  selfCharacterId?: string | null;
  onOpenChar?: (id: string) => void;
};

export function CombatList({ encounter, participants, groups, selfCharacterId, onOpenChar }: Props) {
  const { t } = useT();
  const blocks = buildOrderedTurns(participants, groups);
  const active = activeBlock(encounter, blocks);

  if (blocks.length === 0) {
    return <p className="text-center text-xs text-muted-foreground py-4">{t("combat.empty")}</p>;
  }

  return (
    <div className="space-y-2">
      {encounter.status === "active" && (
        <p className="text-[10px] text-center text-muted-foreground font-display tracking-widest uppercase">
          {t("combat.round")} {encounter.round_number || 1}
        </p>
      )}
      {blocks.map(b => (
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
          onOpenChar={onOpenChar}
        />
      ))}
    </div>
  );
}

function TurnRow({
  block, isActive, isSelf, activeLabel, activeEnemyLabel, enlaceLabel, enemyLabel, defeatedLabel, onOpenChar,
}: {
  block: TurnBlock; isActive: boolean; isSelf: boolean;
  activeLabel: string; activeEnemyLabel: string; enlaceLabel: string; enemyLabel: string; defeatedLabel: string;
  onOpenChar?: (id: string) => void;
}) {
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
    } as const;
    const isTierAsset = !!getEnemyAssetUrl(p.enemy_icon);
    return (
      <div className="ornate-card !p-2 flex items-center gap-3 transition-shadow" style={containerStyle}>
        <div className="w-10 h-10 rounded-full border-2 flex-shrink-0 flex items-center justify-center bg-card overflow-hidden relative"
          style={{ borderColor: baseColor, color: baseColor }}>
          <EnemyIcon name={p.enemy_icon} size={20} fill={isTierAsset} assetScale={isTierAsset ? 4 : 1} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate" style={{ color: baseColor }}>
            {p.display_name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-[var(--loss)]/25 text-[var(--loss)]">
              {enemyLabel}
            </span>
            {defeated && (
              <span className="text-[9px] font-display uppercase tracking-widest px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {defeatedLabel}
              </span>
            )}
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
  } as const;

  if (block.kind === "solo") {
    const p = block.participant;
    return (
      <div className="ornate-card !p-2 flex items-center gap-3 transition-shadow" style={containerStyle}>
        <Avatar p={p} onClick={() => p.character_id && onOpenChar?.(p.character_id)} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm truncate" style={{ color: p.color || undefined }}>
            {p.display_name}{isSelf && <span className="text-[10px] text-[var(--gain)] ml-1">●</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">{p.has_ended_turn ? "—" : " "}</p>
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
      <div className="ornate-card !p-2 flex items-center gap-2 transition-shadow"
        style={{
          ...containerStyle,
          opacity: inactive ? 0.5 : 1,
          borderStyle: "dashed",
        }}>
        <div className="w-7 h-7 rounded-full border-2 flex-shrink-0 flex items-center justify-center bg-card overflow-hidden"
          style={{ borderColor: baseColor, color: baseColor }}>
          <EnemyIcon name={l.enemy_icon} size={14} fill={!!getEnemyAssetUrl(l.enemy_icon)} assetScale={getEnemyAssetUrl(l.enemy_icon) ? 4 : 1} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs truncate" style={{ color: baseColor }}>
            {block.pin.label || `${enemyLabel}: ${l.display_name}`}
          </p>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{activeEnemyLabel}</p>
        </div>
        <InitiativeChip n={block.pin.initiative} />
        {isActive && !inactive && <ActiveBadge label={activeEnemyLabel} tone="enemy" />}
      </div>
    );
  }

  return (
    <div className="ornate-card !p-2 transition-shadow" style={containerStyle}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-display uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: `color-mix(in oklab, ${baseColor} 25%, transparent)`, color: baseColor }}>
          {enlaceLabel}
        </span>
        <div className="flex items-center gap-2">
          <InitiativeChip n={block.group.group_initiative} />
          {isActive && <ActiveBadge label={activeLabel} />}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {block.members.map(m => (
          <div key={m.id} className="flex items-center gap-2">
            <Avatar p={m} small onClick={() => m.character_id && onOpenChar?.(m.character_id)} />
            <div className="min-w-0 flex-1 flex items-center gap-1">
              {m.is_leader && <Crown size={12} className="text-[var(--gold)]" />}
              <p className="font-display text-xs truncate" style={{ color: m.color || undefined }}>
                {m.display_name}
              </p>
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
