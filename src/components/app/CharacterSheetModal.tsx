import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { totals, fmtMod, modifier, RARITY_COLOR, RARITY_LABEL, SLOTS, type Character, type Item, type Rarity } from "@/lib/game";
import { RarityBadge } from "@/components/app/RarityBadge";
import { ConditionsPanel } from "@/components/app/ConditionsPanel";
import { CoinsAdjuster } from "@/components/app/CoinsAdjuster";
import type { Booster } from "@/components/app/BoosterCard";

type Props = {
  characterId: string;
  campaignId: string;
  /** When provided enables editing (DM viewing a player). */
  editor?: { id: string; name: string; color: string } | null;
  onClose: () => void;
  onPickItem?: (item: Item) => void;
};

const ATTR_KEYS = [["fue","FUE"],["des","DES"],["con","CON"],["int_stat","INT"],["wis","SAB"],["car","CAR"]] as const;

export function CharacterSheetModal({ characterId, campaignId, editor, onClose, onPickItem }: Props) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [achievements, setAchievements] = useState<{id:string;label:string;color:string}[]>([]);
  const [boosters, setBoosters] = useState<Booster[]>([]);

  async function reload() {
    const [a, b, c, d] = await Promise.all([
      supabase.from("characters").select("*").eq("id", characterId).single(),
      supabase.from("items").select("*").eq("owner_character_id", characterId),
      supabase.from("achievements").select("*").eq("character_id", characterId),
      (supabase as any).from("boosters").select("*").eq("owner_character_id", characterId),
    ]);
    if (a.data) setCharacter(a.data as Character);
    setItems((b.data || []) as Item[]);
    setAchievements((c.data || []) as any);
    setBoosters((d.data || []) as Booster[]);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [characterId]);

  // Realtime: any change in this campaign's items/boosters can affect this view
  // (player unequips & sends to DM → owner_character_id changes away from us).
  useEffect(() => {
    const ch = (supabase as any).channel(`sheet:${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `id=eq.${characterId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "achievements", filter: `character_id=eq.${characterId}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [characterId, campaignId]);

  if (!character) return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <p className="text-muted-foreground">Cargando...</p>
    </div>
  );

  const equipped = items.filter(i => i.equipped);
  const stats = totals(character, equipped);
  const isEdit = !!editor;

  async function adjustHp(delta: number) {
    if (!editor || !character) return;
    const next = Math.max(0, Math.min(stats.maxHp, character.current_hp + delta));
    const prev = { current_hp: character.current_hp };
    await supabase.from("characters").update({ current_hp: next }).eq("id", character.id);
    await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: `ajustó vida de` },
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: ":" },
      delta > 0 ? { t: "gain", v: `+${delta}` } : { t: "loss", v: `${delta}` },
      { t: "text", v: `(${next}/${stats.maxHp})` },
    ], { kind: "character.update", id: character.id, prev });
    reload();
  }
  async function adjustCoins(delta: number) {
    if (!editor || !character) return;
    const next = Math.max(0, character.coins + delta);
    const prev = { coins: character.coins };
    await supabase.from("characters").update({ coins: next }).eq("id", character.id);
    await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: delta >= 0 ? "dio" : "quitó" },
      { t: "coins", v: `${Math.abs(delta)}` },
      { t: "text", v: delta >= 0 ? "a" : "de" },
      { t: "char", v: character.name, color: character.color, id: character.id },
    ], { kind: "character.update", id: character.id, prev });
    reload();
  }
  async function setAttr(key: string, val: number) {
    if (!editor || !character) return;
    const prev: any = { [key]: (character as any)[key] };
    await supabase.from("characters").update({ [key]: val } as any).eq("id", character.id);
    await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: `cambió ${key.toUpperCase()} de` },
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: `a ${val}` },
    ], { kind: "character.update", id: character.id, prev });
    reload();
  }
  async function unequip(it: Item) {
    if (!editor) return;
    const prev = { equipped: it.equipped };
    const oldMax = totals(character!, items.filter(i => i.equipped)).maxHp;
    await supabase.from("items").update({ equipped: false }).eq("id", it.id);
    const { clampHpForOwner } = await import("@/lib/hp");
    await clampHpForOwner(character!.id, oldMax);
    await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: "desequipó a" },
      { t: "char", v: character!.name, color: character!.color, id: character!.id },
      { t: "text", v: ":" },
      { t: "item", v: it.name, rarity: it.rarity as Rarity, id: it.id },
    ], { kind: "item.update", id: it.id, prev });
    reload();
  }
  async function removeAch(id: string) {
    if (!editor) return;
    const row = achievements.find(a => a.id === id);
    await supabase.from("achievements").delete().eq("id", id);
    if (row) await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: `quitó logro "${row.label}" a` },
      { t: "char", v: character!.name, color: character!.color, id: character!.id },
    ], { kind: "achievement.recreate", row: { ...row, character_id: character!.id } });
    reload();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-2 overflow-y-auto" onClick={onClose}>
      <div className="ornate-card p-4 max-w-md w-full max-h-[92vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <h3 className="font-display text-xl rune-glow" style={{ color: character.color }}>{character.name}</h3>
          <p className="text-xs text-muted-foreground">{character.race || "—"} / {character.class || "—"} · {character.role === "dm" ? "Dungeon Master" : "Jugador"}</p>
        </div>
        {character.image_url && (
          <div className="mx-auto w-40 aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative">
            <img src={character.image_url} alt={character.name}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transform: `translate(${((character.image_offset_x ?? 50) - 50)}%, ${((character.image_offset_y ?? 50) - 50)}%) scale(${character.image_scale || 1})`,
                transformOrigin: "center center",
              }} />
          </div>
        )}
        <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">Vida</p><p className="font-display text-sm">{character.current_hp}/{stats.maxHp}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">Def</p><p className="font-display text-sm text-[var(--gold)]">{stats.defense}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">Vel</p><p className="font-display text-sm">{character.velocity}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">Daño</p><p className="font-display text-sm text-[var(--loss)]">{stats.damage > 0 ? `+${stats.damage}` : stats.damage}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">🪙</p><p className="font-display text-sm text-[var(--gold)]">{character.coins}</p></div>
        </div>
        {isEdit && (
          <>
            <div className="grid grid-cols-4 gap-1">
              <button className="btn-fantasy text-[10px]" onClick={() => adjustHp(-5)}>−5 ❤️</button>
              <button className="btn-fantasy text-[10px]" onClick={() => adjustHp(-1)}>−1 ❤️</button>
              <button className="btn-fantasy text-[10px]" onClick={() => adjustHp(1)}>+1 ❤️</button>
              <button className="btn-fantasy text-[10px]" onClick={() => adjustHp(5)}>+5 ❤️</button>
            </div>
            <div className="ornate-card p-2 text-center">
              <p className="text-[9px] uppercase text-muted-foreground">🪙 Monedas</p>
              <CoinsAdjuster onApply={adjustCoins} />
            </div>
            <div className="stat-pill !text-xs gap-1">
              <span className="truncate min-w-0 flex-1">🎒 Slots de mochila</span>
              <button className="px-2 rounded bg-secondary border border-border" onClick={async () => {
                const next = Math.max(1, ((character as any).backpack_slots ?? 20) - 1);
                await supabase.from("characters").update({ backpack_slots: next } as any).eq("id", character!.id); reload();
              }}>−</button>
              <span className="w-8 text-center text-[var(--gold)] font-bold">{(character as any).backpack_slots ?? 20}</span>
              <button className="px-2 rounded bg-secondary border border-border" onClick={async () => {
                const next = Math.min(60, ((character as any).backpack_slots ?? 20) + 1);
                await supabase.from("characters").update({ backpack_slots: next } as any).eq("id", character!.id); reload();
              }}>+</button>
            </div>
          </>
        )}
        <div className="grid grid-cols-3 gap-1">
          {ATTR_KEYS.map(([k, l]) => {
            const v = (character as any)[k] as number;
            return (
              <div key={k} className="stat-pill !text-xs">
                <span>{l}</span>
                {isEdit
                  ? <input type="number" className="w-10 bg-input border border-border rounded px-1 text-right text-xs" defaultValue={v}
                      onBlur={e => { const nv = +e.target.value; if (nv !== v) setAttr(k, nv); }} />
                  : <span className="text-[var(--gold)] font-bold">{v} ({fmtMod(modifier(v))})</span>}
              </div>
            );
          })}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Equipado</p>
          <div className="space-y-1">
            {equipped.length === 0 && <p className="text-[10px] text-muted-foreground">Nada equipado.</p>}
            {equipped.map(it => (
              <div key={it.id} className="flex items-center justify-between text-xs ornate-card px-2 py-1"
                style={{ borderColor: RARITY_COLOR[it.rarity as Rarity] }}>
                <button className="flex-1 text-left" onClick={() => onPickItem?.(it)}
                  style={{ color: RARITY_COLOR[it.rarity as Rarity] }}>
                  {it.name} <span className="text-muted-foreground">· {SLOTS.find(s=>s.key===it.slot)?.label}</span>
                </button>
                {isEdit && <button className="text-[10px] underline opacity-70" onClick={() => unequip(it)}>quitar</button>}
              </div>
            ))}
          </div>
        </div>
        <ConditionsPanel character={character} campaignId={campaignId} canEdit={isEdit} />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Mochila</p>
          <div className="space-y-1">
            {items.filter(i => !i.equipped).length === 0 && <p className="text-[10px] text-muted-foreground">Vacía.</p>}
            {items.filter(i => !i.equipped).map(it => (
              <button key={it.id} onClick={() => onPickItem?.(it)} className="w-full flex justify-between text-xs ornate-card px-2 py-1 text-left">
                <span style={it.category === "equipo" ? { color: RARITY_COLOR[it.rarity as Rarity] } : undefined}>{it.name}</span>
                <RarityBadge rarity={it.rarity as Rarity} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">🃏 Potenciadores</p>
          <div className="space-y-1">
            {boosters.length === 0 && <p className="text-[10px] text-muted-foreground">Sin potenciadores.</p>}
            {boosters.map(b => (
              <div key={b.id} className="flex items-center justify-between text-xs ornate-card px-2 py-1"
                style={{ borderColor: RARITY_COLOR[b.rarity as Rarity] }}>
                <div className="flex-1">
                  <span style={{ color: RARITY_COLOR[b.rarity as Rarity] }}>🃏 {b.name}</span>
                  <span className="text-muted-foreground"> · {b.uses}/{b.max_uses}</span>
                </div>
                {isEdit && (
                  <div className="flex gap-2">
                    <button className="text-[10px] underline opacity-70" onClick={async () => {
                      await (supabase as any).from("boosters").update({ owner_character_id: null, in_dm_vault: true, uses: b.max_uses }).eq("id", b.id);
                      reload();
                    }}>al vault</button>
                    <button className="text-[10px] underline opacity-70 text-[var(--loss)]" onClick={async () => {
                      if (!confirm(`¿Eliminar potenciador "${b.name}"?`)) return;
                      await (supabase as any).from("boosters").delete().eq("id", b.id);
                      reload();
                    }}>eliminar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Logros</p>
          <div className="flex flex-wrap gap-1">
            {achievements.map(a => (
              <span key={a.id} className="text-[10px] px-2 py-0.5 rounded border" style={{ color: a.color, borderColor: a.color }}>
                {a.label}{isEdit && <button onClick={() => removeAch(a.id)} className="ml-1 opacity-70">✕</button>}
              </span>
            ))}
            {!achievements.length && <p className="text-[10px] text-muted-foreground">Sin logros.</p>}
          </div>
        </div>
        <button className="btn-fantasy w-full" onClick={onClose}>Regresar</button>
      </div>
    </div>
  );
}