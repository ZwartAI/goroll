import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { totals, fmtMod, modifier, RARITY_COLOR, type Character, type Item, type Rarity } from "@/lib/game";
import { RarityBadge } from "@/components/app/RarityBadge";
import { ConditionsPanel } from "@/components/app/ConditionsPanel";
import { CoinsAdjuster } from "@/components/app/CoinsAdjuster";
import { NotesEditor } from "@/components/app/NotesEditor";
import { useT } from "@/lib/i18n";
import type { Booster } from "@/components/app/BoosterCard";
import { BoosterPeek } from "@/components/app/BoosterEditor";

type Props = {
  characterId: string;
  campaignId: string;
  /** When provided enables editing (DM viewing a player). */
  editor?: { id: string; name: string; color: string } | null;
  onClose: () => void;
  onPickItem?: (item: Item) => void;
};

const ATTR_KEYS = [["fue","attr.fue"],["des","attr.des"],["con","attr.con"],["int_stat","attr.int"],["wis","attr.wis"],["car","attr.car"]] as const;

export function CharacterSheetModal({ characterId, campaignId, editor, onClose, onPickItem }: Props) {
  const { t } = useT();
  const [character, setCharacter] = useState<Character | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [achievements, setAchievements] = useState<{id:string;label:string;color:string}[]>([]);
  const [boosters, setBoosters] = useState<Booster[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [vaultConfirm, setVaultConfirm] = useState<Booster | null>(null);
  const [peekBooster, setPeekBooster] = useState<Booster | null>(null);

  async function reload() {
    const [a, b, c, d] = await Promise.all([
      supabase.from("characters").select("*").eq("id", characterId).single(),
      supabase.from("items").select("*").eq("owner_character_id", characterId),
      supabase.from("achievements").select("*").eq("character_id", characterId),
      (supabase as any).from("booster_assignments")
        .select("id, uses, max_uses, booster:boosters(*)")
        .eq("character_id", characterId),
    ]);
    if (a.data) setCharacter(a.data as Character);
    setItems((b.data || []) as Item[]);
    setAchievements((c.data || []) as any);
    const list: Booster[] = ((d.data || []) as any[])
      .filter((row: any) => row.booster)
      .map((row: any) => ({
        ...row.booster,
        uses: row.uses,
        max_uses: row.max_uses,
        owner_character_id: characterId,
        in_dm_vault: false,
        _assignmentId: row.id,
      }));
    setBoosters(list);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [characterId]);

  // Realtime: any change in this campaign's items/boosters can affect this view
  // (player unequips & sends to DM → owner_character_id changes away from us).
  useEffect(() => {
    const ch = (supabase as any).channel(`sheet:${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `id=eq.${characterId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "booster_assignments", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "achievements", filter: `character_id=eq.${characterId}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [characterId, campaignId]);

  if (!character) return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <p className="text-muted-foreground">{t("sheet.loading")}</p>
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
      { t: "text", v: t("sheet.adjustedLifeOf") },
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
      { t: "text", v: delta >= 0 ? t("sheet.gave") : t("sheet.took") },
      { t: "coins", v: `${Math.abs(delta)}` },
      { t: "text", v: delta >= 0 ? t("sheet.toWho") : t("sheet.fromWho") },
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
      { t: "text", v: t("sheet.changedAttrOf", { key: key.toUpperCase() }) },
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: t("sheet.toValue", { value: val }) },
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
      { t: "text", v: t("sheet.unequipped") },
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
      { t: "text", v: t("sheet.removedAch", { label: row.label }) },
      { t: "char", v: character!.name, color: character!.color, id: character!.id },
    ], { kind: "achievement.recreate", row: { ...row, character_id: character!.id } });
    reload();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-2 overflow-y-auto" onClick={onClose}>
      <div className="ornate-card p-4 max-w-md w-full max-h-[92vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <h3 className="font-display text-xl rune-glow" style={{ color: character.color }}>{character.name}</h3>
          <p className="text-xs text-muted-foreground">{character.race || "—"} / {character.class || "—"} · {character.role === "dm" ? t("sheet.dungeonMaster") : t("sheet.player")}</p>
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
        <div className="grid grid-cols-6 gap-1.5 text-center text-xs">
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("level.short")}</p><p className="font-display text-sm text-[var(--gold)]">{(character as any).level ?? 1}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("sheet.life")}</p><p className="font-display text-sm">{character.current_hp}/{stats.maxHp}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("sheet.def")}</p><p className="font-display text-sm text-[var(--gold)]">{stats.defense}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("sheet.vel")}</p><p className="font-display text-sm">{character.velocity}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("sheet.damage")}</p><p className="font-display text-sm text-[var(--loss)]">{stats.damage > 0 ? `+${stats.damage}` : stats.damage}</p></div>
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
              <span className="truncate min-w-0 flex-1">{t("sheet.backpackSlots")}</span>
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
                <span>{t(l)}</span>
                {isEdit
                  ? <input type="number" className="w-10 bg-input border border-border rounded px-1 text-right text-xs" defaultValue={v}
                      onBlur={e => { const nv = +e.target.value; if (nv !== v) setAttr(k, nv); }} />
                  : <span className="text-[var(--gold)] font-bold">{v} ({fmtMod(modifier(v))})</span>}
              </div>
            );
          })}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("sheet.equipped")}</p>
          <div className="space-y-1">
            {equipped.length === 0 && <p className="text-[10px] text-muted-foreground">{t("sheet.nothingEquipped")}</p>}
            {equipped.map(it => (
              <div key={it.id} className="flex items-center justify-between text-xs ornate-card px-2 py-1"
                style={{ borderColor: RARITY_COLOR[it.rarity as Rarity] }}>
                <button className="flex-1 text-left" onClick={() => onPickItem?.(it)}
                  style={{ color: RARITY_COLOR[it.rarity as Rarity] }}>
                  {it.name} <span className="text-muted-foreground">· {t(`slots.${it.slot}`)}</span>
                </button>
                {isEdit && <button className="text-[10px] underline opacity-70" onClick={() => unequip(it)}>{t("sheet.quit")}</button>}
              </div>
            ))}
          </div>
        </div>
        <ConditionsPanel character={character} campaignId={campaignId} canEdit={isEdit} />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("sheet.backpack")}</p>
          <div className="space-y-1">
            {items.filter(i => !i.equipped).length === 0 && <p className="text-[10px] text-muted-foreground">{t("sheet.empty")}</p>}
            {items.filter(i => !i.equipped).map(it => (
              <button key={it.id} onClick={() => onPickItem?.(it)} className="w-full flex justify-between text-xs ornate-card px-2 py-1 text-left">
                <span style={it.category === "equipo" ? { color: RARITY_COLOR[it.rarity as Rarity] } : undefined}>{it.name}</span>
                <RarityBadge rarity={it.rarity as Rarity} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("sheet.boosters")}</p>
          <div className="space-y-1">
            {boosters.length === 0 && <p className="text-[10px] text-muted-foreground">{t("sheet.noBoosters")}</p>}
            {boosters.map(b => (
              <div key={b.id} className="flex items-center justify-between text-xs ornate-card px-2 py-1"
                style={{ borderColor: RARITY_COLOR[b.rarity as Rarity] }}>
                <button className="flex-1 text-left" onClick={() => setPeekBooster(b)}>
                  <span style={{ color: RARITY_COLOR[b.rarity as Rarity] }}>🃏 {b.name}</span>
                  <span className="text-muted-foreground"> · {b.uses}/{b.max_uses}</span>
                </button>
                {isEdit && (
                  <div className="flex gap-2">
                    <button className="text-[10px] underline opacity-70" onClick={() => setVaultConfirm(b)}>{t("sheet.toVault")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("sheet.achievements")}</p>
          <div className="flex flex-wrap gap-1">
            {achievements.map(a => (
              <span key={a.id} className="text-[10px] px-2 py-0.5 rounded border" style={{ color: a.color, borderColor: a.color }}>
                {a.label}{isEdit && <button onClick={() => removeAch(a.id)} className="ml-1 opacity-70">✕</button>}
              </span>
            ))}
            {!achievements.length && <p className="text-[10px] text-muted-foreground">{t("sheet.noAchievements")}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={() => setShowNotes(true)}
            style={{ background: "linear-gradient(135deg, oklch(0.45 0.12 220), oklch(0.30 0.10 220))", color: "white" }}>
            {t("sheet.viewNotes")}
          </button>
          <button className="btn-fantasy" onClick={onClose}>{t("sheet.goBack")}</button>
        </div>
        {showNotes && character && (
          <NotesEditor
            characterId={character.id}
            characterName={character.name}
            characterColor={character.color}
            readOnly={!isEdit}
            onClose={() => setShowNotes(false)}
          />
        )}
        {vaultConfirm && (
          <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setVaultConfirm(null); }}>
            <div className="ornate-card bg-card max-w-sm w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm">{t("sheet.toVaultConfirm", { name: vaultConfirm.name })}</p>
              <div className="flex justify-end gap-2">
                <button className="btn-fantasy" onClick={() => setVaultConfirm(null)}>{t("common.cancel")}</button>
                <button className="btn-fantasy" onClick={async () => {
                  const b = vaultConfirm;
                  setVaultConfirm(null);
                  await (supabase as any).from("boosters").update({ owner_character_id: null, in_dm_vault: true, uses: b.max_uses }).eq("id", b.id);
                  reload();
                }}>{t("common.confirm")}</button>
              </div>
            </div>
          </div>
        )}
        {peekBooster && (
          <BoosterPeek
            boosterId={peekBooster.id}
            campaignId={campaignId}
            character={null}
            players={[]}
            hideDiscard
            onClose={() => setPeekBooster(null)}
          />
        )}
      </div>
    </div>
  );
}