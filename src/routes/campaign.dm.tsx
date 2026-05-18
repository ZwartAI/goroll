import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { LogOut, Plus, Send, Trophy, Pencil, Undo2, Search } from "lucide-react";
import { SLOTS, RARITY_BONUS, RARITY_COLOR, RARITY_LABEL, ITEM_CATEGORIES, isWeapon, totals, setSession, type Item, type ItemCategory, type Rarity, type Slot, type Character, type LogRow } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog, type UndoAction } from "@/lib/log";
import { clampHpForOwner } from "@/lib/hp";
import { LogSegments } from "@/components/app/LogSegments";
import { LogList } from "@/components/app/LogList";
import { RarityBadge } from "@/components/app/RarityBadge";
import { ItemEditor } from "@/components/app/ItemEditor";
import { CharacterSheetModal } from "@/components/app/CharacterSheetModal";
import { DMConditionsCreator } from "@/components/app/ConditionsPanel";
import { BoosterEditor } from "@/components/app/BoosterEditor";
import { type Booster } from "@/components/app/BoosterCard";
import { DMRequestGate } from "@/components/app/DMRequestGate";
import { Escenario } from "@/components/app/Escenario";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/dm")({ component: DM });

function DM() {
  const { t } = useT();
  const { character, characters, items, logs, campaign, onlineIds, loading, dmLabels, dmCharacterIds } = useGameData();

  const nav = useNavigate();
  const [tab, setTab] = useState<"log" | "create" | "vault" | "boosters" | "escenario">("log");
  const [selItem, setSelItem] = useState<Item | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [boosters, setBoosters] = useState<Booster[]>([]);
  const [boosterSearch, setBoosterSearch] = useState("");
  const [selBooster, setSelBooster] = useState<Booster | null>(null);
  const [editBooster, setEditBooster] = useState<Booster | null>(null);
  const [creatingBooster, setCreatingBooster] = useState(false);
  const [boosterSel, setBoosterSel] = useState<Set<string>>(new Set());
  const [boosterSelectMode, setBoosterSelectMode] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    const reload = async () => {
      const { data } = await (supabase as any).from("boosters")
        .select("*").eq("campaign_id", campaign.id).order("created_at");
      setBoosters((data || []) as Booster[]);
    };
    reload();
    const ch = (supabase as any).channel(`boosters:dm:${campaign.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${campaign.id}` }, reload)
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [campaign?.id]);

  if (loading || !character || !campaign) return <PageFrame><p className="text-center text-muted-foreground">{t("dm.loading")}</p></PageFrame>;

  const players = characters.filter(c => c.role === "player");
  const vault = items.filter(i => i.in_dm_vault || i.owner_character_id === character.id);

  function logout(){ setSession(null); nav({to:"/"}); }

  const dmCtx = { id: character.id, name: character.name, color: character.color };
  const openItemFromId = (id: string) => {
    const it = items.find(i => i.id === id);
    if (it) setSelItem(it);
  };

  return (
    <PageFrame>
      <DMRequestGate campaignId={campaign.id} ownerUserId={(campaign as any).owner_user_id ?? null} />
      <header className="flex items-start justify-between gap-2 mb-3">
        <button onClick={logout} className="text-muted-foreground"><LogOut size={18}/></button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{campaign.name}</p>
          <h1 className="font-display text-xl rune-glow text-[var(--gold)]">👑 {character.name}</h1>
          <p className="text-xs text-muted-foreground">{t("dm.dungeonMaster")}</p>
        </div>
        <Link to="/campaign/achievements" className="text-muted-foreground"><Trophy size={20}/></Link>
      </header>
      <div className="gem-divider mb-4"/>

      <div className="grid grid-cols-5 gap-1 mb-4">
        {([
          ["log", t("dm.tabLog")],["create", t("dm.tabCreate")],["vault", t("dm.tabVault")],["boosters", t("dm.tabBoosters")],["escenario", t("dm.tabScene")],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`text-[10px] py-2 rounded-md font-display ${tab===k?"bg-[var(--gold)] text-black":"bg-card text-foreground border border-border"}`}>
            {l}
          </button>
        ))}

      </div>

      {tab === "log" && (
        <>
          <button
            className="btn-fantasy w-full text-xs mb-2"
            style={{ background: "var(--gradient-blood, var(--loss))", color: "white" }}
            onClick={async () => {
              if (!confirm("¿Borrar TODO el historial del log de esta campaña? Esta acción no se puede deshacer.")) return;
              const { error } = await supabase.from("logs").delete().eq("campaign_id", campaign.id);
              if (error) toast.error(error.message);
              else {
                toast.success("Historial borrado");
                await pushLog(campaign.id, [
                  { t: "char", v: character.name, color: character.color, id: character.id },
                  { t: "text", v: "limpió el historial del log." },
                ]);
              }
            }}
          >🗑️ Borrar historial</button>
        <LogList rows={logs} initial={20} maxH="max-h-[70vh]"
          renderRow={(l: LogRow) => (
            <div key={l.id} className={`text-sm bg-secondary/40 rounded px-3 py-2 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
              <LogSegments segments={l.segments as any}
                onItem={openItemFromId}
                onChar={(id) => {
                  if (!characters.find(c => c.id === id)) toast.error("Jugador no encontrado");
                  else setOpenChar(id);
                }} />
              <div className="flex justify-between items-center mt-1">
                <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</p>
                {l.undo && !l.undone && (
                  <button className="text-[10px] text-[var(--gold)] inline-flex items-center gap-1 hover:underline"
                    onClick={() => undoLog(l, campaign.id, dmCtx)}>
                    <Undo2 size={11}/> Deshacer
                  </button>
                )}
              </div>
            </div>
          )} />
        </>
      )}

      {tab === "create" && (
        <div className="space-y-4">
          <CreateItem campaignId={campaign.id} dm={dmCtx} players={players} />
          <DMConditionsCreator campaignId={campaign.id} players={players} />
          <div className="ornate-card p-4 space-y-2">
            <h3 className="font-display text-sm uppercase tracking-widest text-[var(--rarity-purple)]">🃏 Crear potenciador</h3>
            <p className="text-xs text-muted-foreground">Define nombre, rareza y usos. Se guarda en el Vault.</p>
            <button className="btn-fantasy w-full"
              style={{ background: "linear-gradient(135deg, var(--rarity-purple), oklch(0.35 0.18 300))", color: "white" }}
              onClick={() => setCreatingBooster(true)}>
              <Plus size={14} className="inline" /> Nuevo potenciador
            </button>
            <BulkBoosterImport campaignId={campaign.id} />
          </div>
        </div>
      )}

      {tab === "boosters" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 ornate-card px-2 py-1">
            <Search size={14} className="text-muted-foreground" />
            <input value={boosterSearch} onChange={e => setBoosterSearch(e.target.value)}
              placeholder="Buscar potenciador..." className="flex-1 bg-transparent outline-none text-sm" />
          </div>
          <button
            className="btn-fantasy w-full text-xs"
            onClick={async () => {
              const norm = (s: string) => s.trim().toLowerCase();
              const seen = new Map<string, Booster>();
              const dupes: string[] = [];
              for (const b of [...boosters].sort((a, c) => a.created_at.localeCompare(c.created_at))) {
                const k = norm(b.name);
                if (seen.has(k)) dupes.push(b.id);
                else seen.set(k, b);
              }
              if (!dupes.length) { toast.info("No hay potenciadores duplicados."); return; }
              if (!confirm(`Se eliminarán ${dupes.length} potenciador(es) duplicado(s). ¿Continuar?`)) return;
              const { error } = await (supabase as any).from("boosters").delete().in("id", dupes);
              if (error) toast.error(error.message);
              else {
                toast.success(`${dupes.length} duplicados eliminados`);
                await pushLog(campaign.id, [
                  { t: "char", v: character.name, color: character.color, id: character.id },
                  { t: "text", v: ` eliminó ${dupes.length} potenciador(es) duplicado(s).` },
                ]);
              }
            }}
          >🧹 Eliminar duplicados</button>

          <div className="flex gap-2">
            <button
              className="flex-1 text-xs px-3 py-2 rounded border border-border"
              onClick={() => { setBoosterSelectMode(!boosterSelectMode); setBoosterSel(new Set()); }}
            >{boosterSelectMode ? "Cancelar selección" : "☑️ Seleccionar"}</button>
            {boosterSelectMode && (
              <>
                <button
                  className="text-xs px-3 py-2 rounded border border-border"
                  onClick={() => {
                    const visible = boosters.filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase()));
                    if (boosterSel.size === visible.length) setBoosterSel(new Set());
                    else setBoosterSel(new Set(visible.map(b => b.id)));
                  }}
                >{boosterSel.size === boosters.filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase())).length && boosterSel.size > 0 ? "Ninguno" : "Todos"}</button>
                <button
                  className="text-xs px-3 py-2 rounded border border-destructive text-destructive disabled:opacity-50"
                  disabled={boosterSel.size === 0}
                  onClick={async () => {
                    const ids = [...boosterSel];
                    if (!confirm(`¿Eliminar ${ids.length} potenciador(es)?`)) return;
                    const { error } = await (supabase as any).from("boosters").delete().in("id", ids);
                    if (error) toast.error(error.message);
                    else {
                      toast.success(`${ids.length} eliminados`);
                      await pushLog(campaign.id, [
                        { t: "char", v: character.name, color: character.color, id: character.id },
                        { t: "text", v: ` eliminó ${ids.length} potenciador(es).` },
                      ]);
                      setBoosterSel(new Set()); setBoosterSelectMode(false);
                    }
                  }}
                >🗑️ Eliminar ({boosterSel.size})</button>
              </>
            )}
          </div>

          {boosters.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Sin potenciadores. Crea uno desde "Crear".</p>}
          {boosters
            .filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase()))
            .map(b => {
              const owner = b.owner_character_id ? characters.find(c => c.id === b.owner_character_id) : null;
              const checked = boosterSel.has(b.id);
              return (
                <button key={b.id} onClick={() => {
                    if (boosterSelectMode) {
                      const next = new Set(boosterSel);
                      if (checked) next.delete(b.id); else next.add(b.id);
                      setBoosterSel(next);
                    } else setSelBooster(b);
                  }}
                  className="w-full ornate-card p-3 flex justify-between items-center text-left gap-2"
                  style={{ borderColor: checked ? "var(--gold)" : RARITY_COLOR[b.rarity as Rarity] }}>
                  {boosterSelectMode && (
                    <input type="checkbox" readOnly checked={checked} className="accent-[var(--gold)]" />
                  )}
                  <div className="flex-1">
                    <p className="font-display" style={{ color: RARITY_COLOR[b.rarity as Rarity] }}>🃏 {b.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.uses}/{b.max_uses} usos · {owner ? `📦 ${owner.name}` : "🏛️ Vault"}
                    </p>
                  </div>
                  <RarityBadge rarity={b.rarity as Rarity} />
                </button>
              );
            })}
        </div>
      )}

      {tab === "vault" && (
        <div className="space-y-2">
          {vault.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Vault vacío. Crea o reclama objetos.</p>}
          {vault.map(it => (
            <button key={it.id} onClick={() => setSelItem(it)}
              className="w-full ornate-card p-3 flex justify-between items-center text-left"
              style={it.category === "equipo" ? { borderColor: RARITY_COLOR[it.rarity as Rarity] } : undefined}>
              <div>
                <p className="font-display" style={it.category === "equipo" ? { color: RARITY_COLOR[it.rarity as Rarity] } : undefined}>{it.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {it.category === "equipo" ? SLOTS.find(s=>s.key===it.slot)?.label : ITEM_CATEGORIES.find(c => c.key === it.category)?.label}
                  {it.category !== "equipo" && (it.uses ?? 0) > 0 && ` · x${it.uses}`}
                </p>
              </div>
              {it.category === "equipo" && <RarityBadge rarity={it.rarity as Rarity} />}
            </button>
          ))}
        </div>
      )}

      {tab === "escenario" && (
        <>
          {!players.length && (
            <p className="text-center text-xs text-muted-foreground py-3">
              Sin jugadores aún. Pídeles que entren a "{campaign.name}".
            </p>
          )}
          <Escenario
            characters={characters}
            onlineIds={onlineIds}
            logs={logs}
            selfId={null}
            dmCharacterIds={dmCharacterIds}
            nameOverrides={dmLabels}
            onOpenChar={(id) => setOpenChar(id)}
            onOpenItem={openItemFromId}
          />
        </>
      )}

      {selItem && (
        <ItemActions item={selItem} players={players} dm={dmCtx} campaignId={campaign.id}
          allItems={items} allCharacters={characters}
          onClose={() => setSelItem(null)}
          onEdit={() => { setEditItem(selItem); setSelItem(null); }} />
      )}
      {editItem && (
        <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-3" onClick={() => setEditItem(null)}>
          <div onClick={e => e.stopPropagation()}>
            <ItemEditor item={editItem} dm={dmCtx} campaignId={campaign.id} onClose={() => setEditItem(null)} />
          </div>
        </div>
      )}
      {openChar && (
        <CharacterSheetModal characterId={openChar} campaignId={campaign.id} editor={dmCtx}
          onClose={() => setOpenChar(null)}
          onPickItem={(it) => setSelItem(it)} />
      )}
      {selBooster && (
        <BoosterEditor booster={selBooster} campaignId={campaign.id}
          players={players} dm={dmCtx}
          onClose={() => setSelBooster(null)} />
      )}
      {(editBooster || creatingBooster) && (
        <BoosterEditor booster={editBooster} campaignId={campaign.id}
          players={players} dm={dmCtx}
          onClose={() => { setEditBooster(null); setCreatingBooster(false); }} />
      )}
    </PageFrame>
  );
}

async function undoLog(l: LogRow, campaignId: string, dm: { id: string; name: string; color: string }) {
  const u = l.undo as unknown as UndoAction | null;
  if (!u) return;
  if (u.kind === "item.update") {
    await supabase.from("items").update(u.prev as any).eq("id", u.id);
  } else if (u.kind === "item.recreate") {
    await supabase.from("items").insert(u.item as any);
  } else if (u.kind === "character.update") {
    await supabase.from("characters").update(u.prev as any).eq("id", u.id);
  } else if (u.kind === "achievement.delete") {
    await supabase.from("achievements").delete().eq("id", u.id);
  } else if (u.kind === "achievement.recreate") {
    await supabase.from("achievements").insert(u.row as any);
  }
  await supabase.from("logs").update({ undone: true } as any).eq("id", l.id);
  await pushLog(campaignId, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: "deshizo una acción del log." },
  ]);
}

function CreateItem({ campaignId, dm, players }: { campaignId: string; dm: { id: string; name: string; color: string }; players: Character[] }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory | "monedas">("equipo");
  const [slot, setSlot] = useState<Slot>("casco");
  const [rarity, setRarity] = useState<Rarity>("white");
  const [damage, setDamage] = useState(0);
  const [uses, setUses] = useState(1);
  const [coins, setCoins] = useState(10);
  const [target, setTarget] = useState<string>("");

  async function create(send: boolean) {
    if (category === "monedas") {
      if (!send || !target) return;
      const t = players.find(p => p.id === target);
      if (!t) return;
      const next = (t.coins || 0) + coins;
      const prev = { coins: t.coins };
      await supabase.from("characters").update({ coins: next }).eq("id", t.id);
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: "envió" },
        { t: "coins", v: `${coins}` },
        { t: "text", v: "a" },
        { t: "char", v: t.name, color: t.color, id: t.id },
      ], { kind: "character.update", id: t.id, prev });
      setCoins(10);
      return;
    }
    if (!name.trim()) return;
    const isEquipo = category === "equipo";
    const bonus = RARITY_BONUS[rarity];
    const weapon = isEquipo && isWeapon(slot);
    const payload: any = {
      campaign_id: campaignId,
      name: name.trim(),
      category,
      slot: isEquipo ? slot : "objeto",
      rarity: isEquipo ? rarity : "white",
      defense_bonus: isEquipo && !weapon ? bonus.def : 0,
      hp_bonus: isEquipo && !weapon ? bonus.hp : 0,
      damage_bonus: weapon ? damage : 0,
      uses: isEquipo ? null : Math.max(1, uses),
      max_uses: isEquipo ? null : Math.max(1, uses),
      owner_character_id: send && target ? target : null,
      in_dm_vault: !send,
    };
    const { data: it } = await supabase.from("items").insert(payload).select().single();
    if (it) {
      const targetChar = players.find(p => p.id === target);
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: send && targetChar ? "entregó a" : "creó" },
        ...(send && targetChar ? [{ t: "char", v: targetChar.name, color: targetChar.color, id: targetChar.id } as const, { t: "text", v: ":" } as const] : []),
        { t: "item", v: it.name, rarity: it.rarity as any, id: it.id },
      ] as any, { kind: "item.recreate", item: it as any });
    }
    setName(""); setDamage(0); setUses(1);
  }

  const isCoins = category === "monedas";

  return (
    <div className="ornate-card p-4 space-y-3">
      <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value as any)}>
        {ITEM_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
        <option value="monedas">🪙 Monedas</option>
      </select>
      {!isCoins && (
        <input className="w-full bg-input border border-border rounded px-3 py-2 text-sm" placeholder="Nombre del objeto" value={name} onChange={e => setName(e.target.value)} />
      )}
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
            <label className="flex items-center justify-between text-sm">Daño permanente
              <input type="number" className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={damage} onChange={e => setDamage(+e.target.value)} />
            </label>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Bonos por rareza: Def +{RARITY_BONUS[rarity].def} · Vida +{RARITY_BONUS[rarity].hp}
            </p>
          )}
        </>
      ) : isCoins ? (
        <label className="flex items-center justify-between text-sm">Cantidad de monedas
          <input type="number" min={1} className="w-24 bg-input border border-border rounded px-2 py-1 text-right" value={coins} onChange={e => setCoins(Math.max(1, +e.target.value))} />
        </label>
      ) : (
        <label className="flex items-center justify-between text-sm">Número de usos
          <input type="number" min={1} className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={uses} onChange={e => setUses(Math.max(1, +e.target.value))} />
        </label>
      )}
      <div className="gem-divider"/>
      <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">{isCoins ? "— elige jugador —" : "— guardar en vault —"}</option>
        {players.map(p => <option key={p.id} value={p.id}>Enviar a {p.name}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        {!isCoins && <button className="btn-fantasy" onClick={() => create(false)}><Plus size={14} className="inline"/> Vault</button>}
        <button className={`btn-fantasy ${isCoins ? "col-span-2" : ""}`} style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} disabled={!target} onClick={() => create(true)}><Send size={14} className="inline"/> Enviar</button>
      </div>
    </div>
  );
}

function ItemActions({ item, players, dm, campaignId, allItems, allCharacters, onClose, onEdit }: {
  item: Item;
  players: Character[];
  dm: { id: string; name: string; color: string };
  campaignId: string;
  allItems: Item[];
  allCharacters: Character[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [target, setTarget] = useState("");
  const isEq = item.category === "equipo" || !item.category;
  function oldMaxFor(ownerId: string | null | undefined): number | undefined {
    if (!ownerId) return undefined;
    const ch = allCharacters.find(c => c.id === ownerId);
    if (!ch) return undefined;
    const eq = allItems.filter(i => i.owner_character_id === ownerId && i.equipped);
    return totals(ch, eq).maxHp;
  }
  async function reclaim() {
    const prev = { owner_character_id: item.owner_character_id, in_dm_vault: item.in_dm_vault, equipped: item.equipped };
    const prevOwner = item.owner_character_id;
    const oldMax = oldMaxFor(prevOwner);
    await supabase.from("items").update({ owner_character_id: dm.id, in_dm_vault: true, equipped: false }).eq("id", item.id);
    await clampHpForOwner(prevOwner, oldMax);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},
      {t:"text",v:"reclamó"},
      {t:"item",v:item.name,rarity:item.rarity as Rarity,id:item.id},
    ], { kind: "item.update", id: item.id, prev });
    onClose();
  }
  async function destroy() {
    await supabase.from("items").delete().eq("id", item.id);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},
      {t:"text",v:"destruyó"},
      {t:"item",v:item.name,rarity:item.rarity as Rarity},
    ], { kind: "item.recreate", item: item as any });
    onClose();
  }
  async function send() {
    if (!target) return;
    const t = players.find(p => p.id === target);
    const prev = { owner_character_id: item.owner_character_id, in_dm_vault: item.in_dm_vault, equipped: item.equipped };
    const prevOwner = item.owner_character_id;
    const oldMax = oldMaxFor(prevOwner);
    await supabase.from("items").update({ owner_character_id: target, in_dm_vault: false, equipped: false }).eq("id", item.id);
    await clampHpForOwner(prevOwner, oldMax);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},{t:"text",v:"entregó"},
      {t:"item",v:item.name,rarity:item.rarity as Rarity,id:item.id},{t:"text",v:"a"},
      {t:"char",v:t?.name||"?",color:t?.color||"#ccc",id:target},
    ], { kind: "item.update", id: item.id, prev });
    onClose();
  }
  return (
    <div className="fixed inset-0 bg-black/80 z-[65] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e=>e.stopPropagation()}>
        <h3 className="font-display text-lg" style={isEq ? { color: RARITY_COLOR[item.rarity as Rarity] } : undefined}>{item.name}</h3>
        <p className="text-xs text-muted-foreground">
          {isEq ? SLOTS.find(s=>s.key===item.slot)?.label : ITEM_CATEGORIES.find(c => c.key === item.category)?.label}
        </p>
        {isEq ? (
          <p className="text-sm">{isWeapon(item.slot as any) ? `Daño +${item.damage_bonus}` : `Def +${item.defense_bonus} · Vida +${item.hp_bonus}`}</p>
        ) : (item.uses ?? 0) > 0 && (
          <p className="text-sm">Usos: {item.uses}{item.max_uses ? `/${item.max_uses}` : ""}</p>
        )}
        {item.description && <p className="text-xs text-muted-foreground italic">"{item.description}"</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy flex items-center justify-center gap-1" onClick={onEdit}><Pencil size={13}/> Editar</button>
          <button className="btn-fantasy" onClick={reclaim}>Reclamar</button>
        </div>
        <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">— enviar a jugador —</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-fantasy w-full" disabled={!target} onClick={send}>Enviar</button>
        <button className="btn-fantasy w-full" style={{ background: "var(--gradient-blood)" }} onClick={destroy}>Destruir</button>
        <button className="text-xs text-muted-foreground underline w-full" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function BulkBoosterImport({ campaignId }: { campaignId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  async function handleFile(file: File) {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const { parseBoosterFile, normalizeName } = await import("@/lib/boosterImport");
      const { rows, errors } = await parseBoosterFile(file);
      if (errors.length) toast.error(`${errors.length} error(es): ${errors.slice(0,2).map(e=>`${e.where}: ${e.message}`).join(" · ")}`);
      if (!rows.length) return;
      setProgress({ done: 0, total: rows.length });

      // Load existing for dedup
      const { data: existing } = await (supabase as any).from("boosters")
        .select("id,external_id,name,uses,max_uses").eq("campaign_id", campaignId);
      const byExt = new Map<string, any>();
      const byName = new Map<string, any>();
      for (const b of (existing || [])) {
        if (b.external_id) byExt.set(String(b.external_id).toLowerCase(), b);
        byName.set(normalizeName(b.name || ""), b);
      }

      let created = 0, updated = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const match = (r.external_id && byExt.get(r.external_id.toLowerCase()))
          || byName.get(normalizeName(r.name));
        const payload: any = {
          campaign_id: campaignId,
          external_id: r.external_id,
          tipo: r.tipo, rarity: r.rarity, name: r.name,
          modo_lanzamiento: r.modo_lanzamiento, distancia: r.distancia,
          objetivos: r.objetivos, dados: r.dados, efecto: r.efecto,
        };
        if (match) {
          // Preserve uses/max_uses already edited by DM.
          await (supabase as any).from("boosters").update(payload).eq("id", match.id);
          updated++;
        } else {
          await (supabase as any).from("boosters").insert({
            ...payload, uses: 1, max_uses: 1,
            in_dm_vault: true, owner_character_id: null,
          });
          created++;
        }
        setProgress({ done: i + 1, total: rows.length });
      }
      toast.success(`Importados: ${created} nuevos · ${updated} actualizados${errors.length ? ` · ${errors.length} con error` : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Error al importar");
    } finally { setBusy(false); setProgress({ done: 0, total: 0 }); }
  }
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-1 pt-2 border-t border-border">
      <p className="text-[10px] text-muted-foreground">
        📥 Importar potenciadores desde <code>.xlsx</code> o <code>.txt</code>.
      </p>
      <p className="text-[10px] text-muted-foreground">
        <b>XLSX:</b> hoja "Extra Skills - DND". Fila 1-2 encabezados (ID, Tipo, Rareza, Nombre, Modo de lanzamiento, Distancia, Objetivos, Dados a tirar, Efecto o Condición). Fila 3 en adelante datos.
      </p>
      <p className="text-[10px] text-muted-foreground">
        <b>TXT:</b> bloques separados por línea en blanco. Cada línea con etiqueta: <code>ID:</code>, <code>Tipo:</code>, <code>Rareza:</code>, <code>Nombre:</code>, <code>Efecto o Condición:</code>...
      </p>
      <input type="file" accept=".xlsx,.xls,.txt" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }}
        className="text-xs text-muted-foreground w-full file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-secondary file:text-foreground file:text-xs" />
      {busy && (
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Creando / Actualizando potenciadores…</span>
            <span>{progress.total ? `${progress.done} / ${progress.total} (${pct}%)` : "Espere un momento…"}</span>
          </div>
          <div className="h-2 w-full rounded bg-secondary overflow-hidden border border-border">
            <div className="h-full transition-all duration-150"
              style={{ width: `${pct}%`, background: "var(--gradient-gold)" }} />
          </div>
        </div>
      )}
    </div>
  );
}