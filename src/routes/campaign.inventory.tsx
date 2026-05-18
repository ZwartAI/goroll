import { createFileRoute, Link } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ArrowLeft } from "lucide-react";
import { SLOTS, RARITY_COLOR, RARITY_BONUS, isWeapon, totals, ITEM_CATEGORIES, type Item, type Rarity } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { clampHpForOwner } from "@/lib/hp";
import { RarityBadge } from "@/components/app/RarityBadge";
import { useState } from "react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/inventory")({ component: Inventory });

function Inventory() {
  const { character, items, characters, campaign, loading } = useGameData();
  const [sel, setSel] = useState<Item | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const { t } = useT();

  if (loading || !character || !campaign) return <PageFrame><p className="text-center text-muted-foreground">{t("common.loading")}</p></PageFrame>;

  const owned = items.filter(i => i.owner_character_id === character.id);
  const slotIcon = (it: Item) => {
    if (it.category && it.category !== "equipo") {
      return ITEM_CATEGORIES.find(c => c.key === it.category)?.icon || "📦";
    }
    return SLOTS.find(s => s.key === it.slot)?.icon || "📦";
  };

  async function syncHpAfter(nextEquipped: Item[], isEquipping: boolean) {
    const oldMax = totals(character!, owned.filter(i => i.equipped)).maxHp;
    const newMax = totals(character!, nextEquipped).maxHp;
    const { nextHpOnEquipChange } = await import("@/lib/hp");
    const nextHp = nextHpOnEquipChange(character!.current_hp, oldMax, newMax, isEquipping);
    if (nextHp !== character!.current_hp) {
      await supabase.from("characters").update({ current_hp: nextHp }).eq("id", character!.id);
    }
  }

  async function equip(it: Item) {
    const cur = owned.find(o => o.equipped && o.slot === it.slot);
    if (cur) await supabase.from("items").update({ equipped: false }).eq("id", cur.id);
    await supabase.from("items").update({ equipped: true }).eq("id", it.id);
    const next = owned.filter(i => i.equipped && i.id !== cur?.id && i.id !== it.id).concat([{ ...it, equipped: true }]);
    await syncHpAfter(next, true);
    await pushLog(campaign!.id, [{t:"char",v:character!.name,color:character!.color,id:character!.id},{t:"text",v:t("inventory.logEquipped")},{t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id}]);
    setSel(null);
  }
  async function unequip(it: Item) {
    await supabase.from("items").update({ equipped: false }).eq("id", it.id);
    const next = owned.filter(i => i.equipped && i.id !== it.id);
    await syncHpAfter(next, false);
    await pushLog(campaign!.id, [{t:"char",v:character!.name,color:character!.color,id:character!.id},{t:"text",v:t("inventory.logUnequipped")},{t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id}]);
    setSel(null);
  }
  async function useItem(it: Item) {
    const remaining = (it.uses ?? 1) - 1;
    if (remaining <= 0) {
      await supabase.from("items").update({ owner_character_id: null, in_dm_vault: true, equipped: false, uses: 0 }).eq("id", it.id);
      await pushLog(campaign!.id, [
        {t:"char",v:character!.name,color:character!.color,id:character!.id},
        {t:"text",v:t("inventory.logUsed")},
        {t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id},
        {t:"text",v:t("inventory.logLast")},
      ], { kind: "item.update", id: it.id, prev: { owner_character_id: character!.id, in_dm_vault: false, equipped: it.equipped, uses: it.uses } });
    } else {
      await supabase.from("items").update({ uses: remaining }).eq("id", it.id);
      await pushLog(campaign!.id, [
        {t:"char",v:character!.name,color:character!.color,id:character!.id},
        {t:"text",v:t("inventory.logUsed")},
        {t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id},
        {t:"text",v:t("inventory.logRemaining", { count: remaining })},
      ], { kind: "item.update", id: it.id, prev: { uses: it.uses } });
    }
    setSel(null);
  }
  async function discard(it: Item) {
    const oldMax = totals(character!, owned.filter(i => i.equipped)).maxHp;
    await supabase.from("items").update({ owner_character_id: null, equipped: false, in_dm_vault: true }).eq("id", it.id);
    await clampHpForOwner(character!.id, oldMax);
    await pushLog(campaign!.id, [
      {t:"char",v:character!.name,color:character!.color,id:character!.id},
      {t:"text",v:t("inventory.logDiscarded")},
      {t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id},
    ], { kind: "item.update", id: it.id, prev: { owner_character_id: character!.id, equipped: it.equipped, in_dm_vault: it.in_dm_vault } });
    setSel(null);
  }
  async function transfer(it: Item) {
    if (!transferTo) return;
    const target = characters.find(c => c.id === transferTo);
    const oldMax = totals(character!, owned.filter(i => i.equipped)).maxHp;
    await supabase.from("items").update({ owner_character_id: transferTo, equipped: false }).eq("id", it.id);
    await clampHpForOwner(character!.id, oldMax);
    await pushLog(campaign!.id, [
      {t:"char",v:character!.name,color:character!.color,id:character!.id},{t:"text",v:t("inventory.logGave")},
      {t:"item",v:it.name,rarity:it.rarity as Rarity,id:it.id},{t:"text",v:t("inventory.logTo")},
      {t:"char",v:target?.name||"?",color:target?.color||"#ccc",id:transferTo},
    ], { kind: "item.update", id: it.id, prev: { owner_character_id: character!.id, equipped: it.equipped } });
    setSel(null); setTransferTo("");
  }

  const maxSlots = (character as any).backpack_slots ?? 20;
  const slots = Array.from({ length: maxSlots }, (_, i) => owned[i] ?? null);

  return (
    <PageFrame title={t("inventory.title")} subtitle={t("inventory.slots", { used: owned.length, max: maxSlots })} right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20}/></Link>}>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((it, i) => (
          <button key={i} onClick={() => it && setSel(it)}
            className="aspect-square ornate-card flex flex-col items-center justify-center p-1 relative"
            style={it && it.category === "equipo" ? { borderColor: RARITY_COLOR[it.rarity as Rarity] } : undefined}>
            {it ? <>
              <span className="text-xl">{slotIcon(it)}</span>
              <span className="text-[8px] truncate w-full text-center" style={it.category === "equipo" ? { color: RARITY_COLOR[it.rarity as Rarity] } : undefined}>{it.name}</span>
              {it.category !== "equipo" && (it.uses ?? 0) > 0 && <span className="absolute bottom-0 right-0 text-[8px] bg-secondary px-1 rounded">x{it.uses}</span>}
              {it.equipped && <span className="absolute top-0 right-0 text-[8px] bg-[var(--gold)] text-black px-1 rounded">{t("inventory.equippedTag")}</span>}
            </> : <span className="text-muted-foreground text-xs">·</span>}
          </button>
        ))}
      </div>

      {sel && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSel(null)}>
          <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-lg" style={sel.category === "equipo" ? { color: RARITY_COLOR[sel.rarity as Rarity] } : undefined}>{sel.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {sel.category === "equipo"
                    ? (SLOTS.find(s=>s.key===sel.slot) ? t(`slots.${sel.slot}`) : "")
                    : (ITEM_CATEGORIES.find(c => c.key === sel.category) ? t(`categories.${sel.category}`) : t("inventory.object"))}
                </p>
              </div>
              {sel.category === "equipo" && <RarityBadge rarity={sel.rarity as Rarity} />}
            </div>
            {sel.category === "equipo" ? (
              <p className="text-sm">
                {isWeapon(sel.slot as any)
                  ? <>{t("inventory.equipDamage")} <strong className="text-[var(--gold)]">+{sel.damage_bonus}</strong></>
                  : t("inventory.equipDefHp", { def: sel.defense_bonus || RARITY_BONUS[sel.rarity as Rarity].def, hp: sel.hp_bonus || RARITY_BONUS[sel.rarity as Rarity].hp })}
              </p>
            ) : (
              (sel.uses ?? 0) > 0 && <p className="text-sm">{t("inventory.usesRemaining")} <strong className="text-[var(--gold)]">{sel.uses}{sel.max_uses ? `/${sel.max_uses}` : ""}</strong></p>
            )}
            {sel.description && <p className="text-xs text-muted-foreground italic">"{sel.description}"</p>}
            <div className="grid grid-cols-2 gap-2">
              {sel.category === "equipo" ? (
                sel.equipped
                  ? <button className="btn-fantasy" onClick={() => unequip(sel)}>{t("inventory.unequip")}</button>
                  : <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={() => equip(sel)}>{t("inventory.equip")}</button>
              ) : (
                <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                  disabled={(sel.uses ?? 0) <= 0}
                  onClick={() => useItem(sel)}>{t("inventory.use")}</button>
              )}
              <button className="btn-fantasy" onClick={() => discard(sel)}>{t("inventory.discard")}</button>
            </div>
            <div className="gem-divider"/>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("inventory.transferTo")}</p>
            <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={transferTo} onChange={e => setTransferTo(e.target.value)}>
              <option value="">{t("inventory.pickPlayer")}</option>
              {characters.filter(c => c.id !== character.id).map(c => <option key={c.id} value={c.id}>{c.name} {c.role === "dm" ? t("inventory.dmTag") : ""}</option>)}
            </select>
            <button className="btn-fantasy w-full" disabled={!transferTo} onClick={() => transfer(sel)}>{t("inventory.give")}</button>
            <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setSel(null)}>{t("common.close")}</button>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
