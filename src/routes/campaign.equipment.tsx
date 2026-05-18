import { createFileRoute, Link } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ArrowLeft } from "lucide-react";
import { SLOTS, RARITY_COLOR, RARITY_BONUS, isWeapon, totals, type Slot, type Item, type Rarity } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { RarityBadge } from "@/components/app/RarityBadge";
import { useState } from "react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/equipment")({ component: Equipment });

function Equipment() {
  const { character, items, campaign, loading } = useGameData();
  const [picker, setPicker] = useState<Slot | null>(null);
  const { t } = useT();

  if (loading || !character || !campaign) return <PageFrame><p className="text-center text-muted-foreground">{t("common.loading")}</p></PageFrame>;

  const owned = items.filter(i => i.owner_character_id === character.id && (i.category === "equipo" || !i.category));
  const equipped = (slot: Slot) => owned.find(i => i.equipped && i.slot === slot);

  async function syncHpAfter(nextEquipped: Item[], isEquipping: boolean) {
    const oldMax = totals(character!, owned.filter(i => i.equipped)).maxHp;
    const newMax = totals(character!, nextEquipped).maxHp;
    const { nextHpOnEquipChange } = await import("@/lib/hp");
    const nextHp = nextHpOnEquipChange(character!.current_hp, oldMax, newMax, isEquipping);
    if (nextHp !== character!.current_hp) {
      await supabase.from("characters").update({ current_hp: nextHp }).eq("id", character!.id);
    }
  }

  async function unequip(item: Item) {
    await supabase.from("items").update({ equipped: false }).eq("id", item.id);
    const next = owned.filter(i => i.equipped && i.id !== item.id);
    await syncHpAfter(next, false);
    await pushLog(campaign!.id, [
      { t: "char", v: character!.name, color: character!.color, id: character!.id },
      { t: "text", v: t("inventory.logUnequipped") },
      { t: "item", v: item.name, rarity: item.rarity as any, id: item.id },
    ], { kind: "item.update", id: item.id, prev: { equipped: true } });
  }

  async function equipFrom(slot: Slot, item: Item) {
    const cur = equipped(slot); if (cur) await supabase.from("items").update({ equipped: false }).eq("id", cur.id);
    await supabase.from("items").update({ equipped: true }).eq("id", item.id);
    const next = owned.filter(i => i.equipped && i.id !== cur?.id && i.id !== item.id).concat([{ ...item, equipped: true }]);
    await syncHpAfter(next, true);
    await pushLog(campaign!.id, [
      { t: "char", v: character!.name, color: character!.color, id: character!.id },
      { t: "text", v: t("inventory.logEquipped") },
      { t: "item", v: item.name, rarity: item.rarity as any, id: item.id },
    ], { kind: "item.update", id: item.id, prev: { equipped: false } });
    setPicker(null);
  }

  return (
    <PageFrame title={t("equipment.title")} subtitle={character.name} right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20}/></Link>}>
      <div className="grid grid-cols-3 gap-2">
        {SLOTS.map(s => {
          const it = equipped(s.key);
          return (
            <button key={s.key} onClick={() => setPicker(s.key)}
              className={`ornate-card aspect-square flex flex-col items-center justify-center p-2 relative ${it ? "" : "opacity-60"}`}
              style={it
                ? { borderColor: RARITY_COLOR[it.rarity as Rarity], boxShadow: `0 0 12px ${RARITY_COLOR[it.rarity as Rarity]}` }
                : { background: "color-mix(in oklab, black 55%, var(--card))", filter: "saturate(0)" }}>
              <span className={`text-2xl mb-1 ${it ? "" : "grayscale opacity-50"}`}>{s.icon}</span>
              <span className="text-[9px] uppercase text-muted-foreground text-center leading-tight">{s.label}</span>
              {it && <span className="text-[9px] mt-1 text-center font-display truncate w-full" style={{ color: RARITY_COLOR[it.rarity as Rarity] }}>{it.name}</span>}
            </button>
          );
        })}
      </div>

      {picker && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center" onClick={() => setPicker(null)}>
          <div className="ornate-card p-4 w-full max-w-md max-h-[70vh] overflow-y-auto rounded-b-none" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-3 text-center">{SLOTS.find(s => s.key === picker)?.label}</h3>
            {equipped(picker) && (
              <button className="btn-fantasy w-full mb-3" onClick={() => { unequip(equipped(picker)!); setPicker(null); }}>{t("equipment.unequipCurrent")}</button>
            )}
            <p className="text-xs uppercase text-muted-foreground tracking-widest mb-2">{t("equipment.backpack")}</p>
            <div className="space-y-2">
              {owned.filter(i => i.slot === picker && !i.equipped).map(i => (
                <button key={i.id} className="w-full ornate-card p-3 flex justify-between items-center text-left"
                  onClick={() => equipFrom(picker, i)}
                  style={{ borderColor: RARITY_COLOR[i.rarity as Rarity] }}>
                  <div>
                    <p className="font-display" style={{ color: RARITY_COLOR[i.rarity as Rarity] }}>{i.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {isWeapon(i.slot as any)
                        ? t("equipment.damagePlus", { n: i.damage_bonus })
                        : t("equipment.defHpPlus", { def: i.defense_bonus || RARITY_BONUS[i.rarity as Rarity].def, hp: i.hp_bonus || RARITY_BONUS[i.rarity as Rarity].hp })}
                    </p>
                  </div>
                  <RarityBadge rarity={i.rarity as Rarity} />
                </button>
              ))}
              {!owned.filter(i => i.slot === picker && !i.equipped).length && (
                <p className="text-center text-xs text-muted-foreground py-6">{t("equipment.noItemsForSlot")}</p>
              )}
            </div>
            <button className="btn-fantasy w-full mt-4" onClick={() => setPicker(null)}>{t("common.close")}</button>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
