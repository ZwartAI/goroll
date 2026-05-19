import { SLOTS, RARITY_COLOR, RARITY_BONUS, ITEM_CATEGORIES, isWeapon, type Item, type Rarity } from "@/lib/game";
import { RarityBadge } from "@/components/app/RarityBadge";
import { useT } from "@/lib/i18n";

export function ItemView({ item }: { item: Item }) {
  const isEq = item.category === "equipo" || !item.category;
  const { t } = useT();
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-display text-lg" style={isEq ? { color: RARITY_COLOR[item.rarity as Rarity] } : undefined}>{item.name}</h3>
          <p className="text-xs text-muted-foreground">
            {isEq
              ? (SLOTS.find(s => s.key === item.slot) ? t(`slots.${item.slot}`) : "")
              : (ITEM_CATEGORIES.find(c => c.key === item.category) ? t(`categories.${item.category}`) : t("inventory.object"))}
          </p>
        </div>
        {isEq && <RarityBadge rarity={item.rarity as Rarity} />}
      </div>
      {isEq ? (
        <p className="text-sm">
          {isWeapon(item.slot as any)
            ? <>{t("inventory.equipDamage")} <strong className="text-[var(--gold)]">+{item.damage_bonus}</strong></>
            : t("inventory.equipDefHp", { def: item.defense_bonus || RARITY_BONUS[item.rarity as Rarity].def, hp: item.hp_bonus || RARITY_BONUS[item.rarity as Rarity].hp })}
        </p>
      ) : (item.uses ?? 0) > 0 && (
        <p className="text-sm">{t("inventory.usesRemaining")} <strong className="text-[var(--gold)]">{item.uses}{item.max_uses ? `/${item.max_uses}` : ""}</strong></p>
      )}
      {isEq && <p className="text-xs text-muted-foreground">{t("boosters.rarity")}: {t(`rarities.${item.rarity}`)}</p>}
      {item.description && (
        <div className="mt-2 rounded-md border border-[var(--gold)]/30 bg-[var(--card)]/60 p-2">
          <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80 mb-1">{t("itemEditor.description")}</p>
          <p className="text-xs italic text-muted-foreground whitespace-pre-wrap">"{item.description}"</p>
        </div>
      )}
    </div>
  );
}
