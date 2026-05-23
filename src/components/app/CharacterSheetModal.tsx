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
import { SkillCard, type CharacterSkill } from "@/components/app/SkillCard";
import { SkillDetailModal } from "@/components/app/SkillDetailModal";

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
  const [skills, setSkills] = useState<CharacterSkill[]>([]);
  const [skillPeek, setSkillPeek] = useState<CharacterSkill | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [vaultConfirm, setVaultConfirm] = useState<Booster | null>(null);
  const [peekBooster, setPeekBooster] = useState<Booster | null>(null);

  async function reload() {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from("characters").select("*").eq("id", characterId).single(),
      supabase.from("items").select("*").eq("owner_character_id", characterId),
      supabase.from("achievements").select("*").eq("character_id", characterId),
      (supabase as any).from("booster_assignments")
        .select("id, uses, max_uses, booster:boosters(*)")
        .eq("character_id", characterId),
      (supabase as any).from("character_skills")
        .select("*").eq("character_id", characterId).order("order_index", { ascending: true }),
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
    setSkills((e.data || []) as CharacterSkill[]);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "character_skills", filter: `character_id=eq.${characterId}` }, () => reload())
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
    const prev = { current_hp: character.current_hp, hp_damage_taken: (character as any).hp_damage_taken };
    const { applyHpDelta } = await import("@/lib/hp");
    await applyHpDelta(character.id, next, stats.maxHp);
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
    if (!editor || !character) return;
    const prev = { equipped: it.equipped };
    const { unequipItem } = await import("@/lib/inventory");
    await unequipItem(it, character, items);
    await pushLog(campaignId, [
      { t: "char", v: editor.name, color: editor.color, id: editor.id },
      { t: "text", v: t("sheet.unequipped") },
      { t: "char", v: character.name, color: character.color, id: character.id },
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
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-2" onClick={onClose}>
      <div className="ornate-card max-w-md w-full max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 space-y-3 max-h-[92vh] overflow-y-auto">

        <div className="text-center">
          <h3 className="font-display text-xl rune-glow" style={{ color: character.color }}>{character.name}</h3>
          <p className="text-xs text-muted-foreground">{character.race || "—"} / {character.class || "—"} · {character.role === "dm" ? t("sheet.dungeonMaster") : t("sheet.player")}</p>
        </div>
        {(() => {
          const anyChar = character as any;
          const hasBody = !!anyChar.body_image_url;
          const url: string = hasBody ? anyChar.body_image_url : (character.image_url || "");
          if (!url) return null;
          const ox = hasBody ? (anyChar.body_image_offset_x ?? 50) : (character.image_offset_x ?? 50);
          const oy = hasBody ? (anyChar.body_image_offset_y ?? 50) : (character.image_offset_y ?? 50);
          const scale = hasBody ? (anyChar.body_image_scale || 1) : (character.image_scale || 1);
          const rot = hasBody ? (anyChar.body_image_rotation || 0) : (anyChar.image_rotation || 0);
          return (
            <div className="mx-auto w-40 aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative">
              <img src={url} alt={character.name}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: `translate(${ox - 50}%, ${oy - 50}%) scale(${scale})`,
                  transformOrigin: "center center",
                }} />
            </div>
          );
        })()}
        <div className="grid grid-cols-6 gap-1.5 text-center text-xs">
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("level.short")}</p><p className="font-display text-sm text-[var(--gold)]">{(character as any).level ?? 1}</p></div>
          <div className="ornate-card p-2"><p className="text-muted-foreground text-[9px] uppercase">{t("sheet.life")}</p><p className="font-display text-[11px] sm:text-sm leading-[1.05] tabular-nums text-center"><span className="block">{character.current_hp}</span><span className="block opacity-70">/{stats.maxHp}</span></p></div>
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
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("skills.skillsList")}</p>
            {isEdit && (
              <span className="text-[10px] text-[var(--gold)]">SP: {(character as any).skill_points ?? 0}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {skills.length === 0 && <p className="text-[10px] text-muted-foreground col-span-2">{t("skills.charHasNone")}</p>}
            {skills.map(s => (
              <SkillCard key={s.id} s={s} compact locked={!s.is_unlocked} onClick={() => setSkillPeek(s)} />
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
                  const aid = (b as any)._assignmentId;
                  if (aid) {
                    await (supabase as any).from("booster_assignments").delete().eq("id", aid);
                  }
                  reload();
                }}>{t("common.confirm")}</button>
              </div>
            </div>
          </div>
        )}
        {skillPeek && character && (
          <SkillDetailModal
            skill={skillPeek}
            onClose={() => setSkillPeek(null)}
            dmActions={isEdit ? {
              onUnlockFree: async () => {
                await (supabase as any).from("character_skills")
                  .update({ is_unlocked: true, unlocked_at: new Date().toISOString() })
                  .eq("id", skillPeek.id);
                if (editor) await pushLog(campaignId, [
                  { t: "char", v: editor.name, color: editor.color, id: editor.id },
                  { t: "text", v: t("skills.logDmUnlocked") },
                  { t: "char", v: character.name, color: character.color, id: character.id },
                  { t: "text", v: ":" },
                  { t: "item", v: skillPeek.name, rarity: skillPeek.rarity, id: skillPeek.id },
                ]);
                setSkillPeek(null);
                reload();
              },
              onDelete: async () => {
                if (!confirm(t("skills.deleteConfirm", { name: skillPeek.name }))) return;
                await (supabase as any).from("character_skills").delete().eq("id", skillPeek.id);
                setSkillPeek(null);
                reload();
              },
            } : undefined}
          />
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
    </div>
  );

}