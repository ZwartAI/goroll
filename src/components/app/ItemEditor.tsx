import { useState } from "react";
import { SLOTS, RARITY_COLOR, RARITY_LABEL, RARITY_BONUS, ITEM_CATEGORIES, isWeapon, type Item, type Rarity, type Slot, type ItemCategory } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { toastSaved } from "@/lib/saved";
import { useT } from "@/lib/i18n";

export function ItemEditor({ item, dm, campaignId, onClose }: {
  item: Item;
  dm: { id: string; name: string; color: string };
  campaignId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<ItemCategory>((item.category as ItemCategory) || "equipo");
  const [slot, setSlot] = useState<Slot>((item.slot as Slot) || "casco");
  const [rarity, setRarity] = useState<Rarity>((item.rarity as Rarity) || "white");
  const [defense, setDefense] = useState<number>(item.defense_bonus || 0);
  const [hp, setHp] = useState<number>(item.hp_bonus || 0);
  const [damage, setDamage] = useState<number>(item.damage_bonus || 0);
  const [uses, setUses] = useState<number>(item.uses ?? 1);
  const [description, setDescription] = useState<string>(item.description || "");
  const { t } = useT();

  async function save() {
    const isEq = category === "equipo";
    const wpn = isEq && isWeapon(slot);
    const prev = {
      name: item.name, category: item.category, slot: item.slot, rarity: item.rarity,
      defense_bonus: item.defense_bonus, hp_bonus: item.hp_bonus, damage_bonus: item.damage_bonus,
      uses: item.uses, max_uses: item.max_uses, description: item.description,
    };
    const next: any = {
      name: name.trim() || item.name,
      category,
      slot: isEq ? slot : "objeto",
      rarity: isEq ? rarity : "white",
      defense_bonus: isEq && !wpn ? defense : 0,
      hp_bonus: isEq && !wpn ? hp : 0,
      damage_bonus: wpn ? damage : 0,
      uses: isEq ? null : Math.max(1, uses),
      max_uses: isEq ? null : Math.max(1, uses),
      description,
    };
    await supabase.from("items").update(next).eq("id", item.id);
    await pushLog(campaignId, [
      { t: "char", v: dm.name, color: dm.color, id: dm.id },
      { t: "text", v: t("itemEditor.editedLog") },
      { t: "item", v: next.name, rarity: next.rarity as Rarity, id: item.id },
    ], { kind: "item.update", id: item.id, prev });
    toastSaved();
    onClose();
  }

  return (
    <div className="ornate-card p-4 space-y-3 max-w-sm w-full max-h-[85vh] overflow-y-auto">
      <h3 className="font-display text-center text-lg">{t("itemEditor.title")}</h3>
      <input className="w-full bg-input border border-border rounded px-3 py-2 text-sm" placeholder={t("itemEditor.name")} value={name} onChange={e => setName(e.target.value)} />
      <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value as ItemCategory)}>
        {ITEM_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
      </select>
      {category === "equipo" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select className="bg-input border border-border rounded px-2 py-2 text-sm" value={slot} onChange={e => setSlot(e.target.value as Slot)}>
              {SLOTS.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
            </select>
            <select className="bg-input border border-border rounded px-2 py-2 text-sm" value={rarity} onChange={e => setRarity(e.target.value as Rarity)}
              style={{ color: RARITY_COLOR[rarity] }}>
              {(["white","blue","purple","gold"] as Rarity[]).map(r => <option key={r} value={r} style={{ color: "black" }}>{RARITY_LABEL[r]}</option>)}
            </select>
          </div>
          {isWeapon(slot) ? (
            <label className="flex items-center justify-between text-sm">{t("itemEditor.damagePermanent")}
              <input type="number" className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={damage} onChange={e => setDamage(+e.target.value)} />
            </label>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground text-center">{t("itemEditor.suggested", { def: RARITY_BONUS[rarity].def, hp: RARITY_BONUS[rarity].hp })}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between text-sm">{t("itemEditor.defense")}
                  <input type="number" className="w-16 bg-input border border-border rounded px-2 py-1 text-right" value={defense} onChange={e => setDefense(+e.target.value)} />
                </label>
                <label className="flex items-center justify-between text-sm">{t("itemEditor.hp")}
                  <input type="number" className="w-16 bg-input border border-border rounded px-2 py-1 text-right" value={hp} onChange={e => setHp(+e.target.value)} />
                </label>
              </div>
            </>
          )}
        </>
      ) : (
        <label className="flex items-center justify-between text-sm">{t("itemEditor.numberUses")}
          <input type="number" min={1} className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={uses} onChange={e => setUses(Math.max(1, +e.target.value))} />
        </label>
      )}
      <textarea className="w-full bg-input border border-border rounded px-3 py-2 text-sm" rows={2} placeholder={t("itemEditor.description")} value={description} onChange={e => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-fantasy" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={save}>{t("common.save")}</button>
      </div>
    </div>
  );
}
