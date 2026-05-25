import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { Plus, Send, Pencil, Undo2, Search, Skull, ScrollText, Hammer, Sparkles, Wand2, Theater, Upload, ChessKnight, Boxes } from "lucide-react";

import { SLOTS, RARITY_BONUS, RARITY_COLOR, ITEM_CATEGORIES, isWeapon, totals, setSession, type Item, type ItemCategory, type Rarity, type Slot, type Character, type LogRow } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog, type UndoAction } from "@/lib/log";
import { clampHpForOwner } from "@/lib/hp";
import { LogSegments } from "@/components/app/LogSegments";
import { LogList } from "@/components/app/LogList";
import { RarityBadge } from "@/components/app/RarityBadge";
import { StatText } from "@/components/app/StatText";
import { ItemEditor } from "@/components/app/ItemEditor";
import { CharacterSheetModal } from "@/components/app/CharacterSheetModal";
import { DMConditionsCreator } from "@/components/app/ConditionsPanel";
import { BoosterEditor } from "@/components/app/BoosterEditor";
import { type Booster } from "@/components/app/BoosterCard";
import { DMRequestGate } from "@/components/app/DMRequestGate";
import { EffectRemoveRequestsPanel } from "@/components/app/EffectRemoveRequestsPanel";
import { SkillsManager, ManualCreate as SkillManualCreate } from "@/components/app/SkillsManager";
import { Escenario } from "@/components/app/Escenario";
import { CharacterImageViewer } from "@/components/app/CharacterImageViewer";
import { CombatDMPanel } from "@/components/app/CombatDMPanel";
import { MicSettingsModal } from "@/components/app/MicSettingsModal";
import { HeaderMenu, MailboxInlineModal, useStandardHeaderItems } from "@/components/app/HeaderMenu";
import { AppSettingsModal } from "@/components/app/AppSettingsModal";
import { useVoice } from "@/lib/useVoice";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/dm")({ component: DM });

function DM() {
  const { t } = useT();
  const { character, characters, items, logs, campaign, onlineIds, loading, dmLabels, dmCharacterIds, combat } = useGameData();

  const nav = useNavigate();
  const [tab, setTab] = useState<"log" | "create" | "vault" | "boosters" | "skills" | "escenario">("log");
  const [selItem, setSelItem] = useState<Item | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [imageViewerCharId, setImageViewerCharId] = useState<string | null>(null);
  const [boosters, setBoosters] = useState<Booster[]>([]);
  const [holdersByBooster, setHoldersByBooster] = useState<Map<string, string[]>>(new Map());
  const [boosterSearch, setBoosterSearch] = useState("");
  const [selBooster, setSelBooster] = useState<Booster | null>(null);
  const [editBooster, setEditBooster] = useState<Booster | null>(null);
  const [creatingBooster, setCreatingBooster] = useState(false);
  const [boosterSel, setBoosterSel] = useState<Set<string>>(new Set());
  const [boosterSelectMode, setBoosterSelectMode] = useState(false);
  const [vaultTopic, setVaultTopic] = useState<"all" | "equip" | "objects">("all");
  const [vaultSub, setVaultSub] = useState<string>("all");
  const voice = useVoice(campaign?.id, character?.id);
  const [micSettingsOpen, setMicSettingsOpen] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    const reload = async () => {
      const [{ data: bs }, { data: assigns }] = await Promise.all([
        (supabase as any).from("boosters")
          .select("*").eq("campaign_id", campaign.id)
          .is("owner_character_id", null)
          .order("created_at"),
        (supabase as any).from("booster_assignments")
          .select("booster_id, character_id").eq("campaign_id", campaign.id),
      ]);
      setBoosters((bs || []) as Booster[]);
      const map = new Map<string, string[]>();
      for (const a of (assigns || []) as any[]) {
        const arr = map.get(a.booster_id) || [];
        arr.push(a.character_id);
        map.set(a.booster_id, arr);
      }
      setHoldersByBooster(map);
    };
    reload();
    const ch = (supabase as any).channel(`boosters:dm:${campaign.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${campaign.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "booster_assignments", filter: `campaign_id=eq.${campaign.id}` }, reload)
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
  const openBoosterFromId = (id: string) => {
    const b = boosters.find(x => x.id === id);
    if (b) setSelBooster(b);
    else toast.error(t("dm.playerNotFound"));
  };

  return (
    <PageFrame>
      <DMRequestGate campaignId={campaign.id} ownerUserId={(campaign as any).owner_user_id ?? null} />
      <DMHeader
        campaignName={campaign.name}
        characterName={character.name}
        dmLabel={t("dm.dungeonMaster")}
        voice={voice}
        onMicSettings={() => setMicSettingsOpen(true)}
        onLogout={logout}
      />
      <MicSettingsModal open={micSettingsOpen} onOpenChange={setMicSettingsOpen} />

      <div className="gem-divider mb-4"/>

      <div className="grid grid-cols-6 gap-1 mb-4">
        {([
          ["log", t("dm.tabLog"), ScrollText, "oklch(0.72 0.10 95)"],
          ["create", t("dm.tabCreate"), Hammer, "oklch(0.70 0.10 40)"],
          ["vault", t("dm.tabVault"), Boxes, "oklch(0.65 0.09 60)"],
          ["boosters", t("dm.tabBoosters"), Sparkles, "oklch(0.70 0.11 305)"],
          ["skills", t("skills.title"), Wand2, "oklch(0.70 0.10 220)"],
          ["escenario", t("dm.tabScene"), Theater, "oklch(0.68 0.10 160)"],
        ] as const).map(([k, l, Icon, color]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md font-display transition-colors ${tab===k?"bg-[var(--gold)] text-black":"bg-card text-foreground border border-border"}`}
          >
            <Icon size={26} strokeWidth={1.75} color={tab===k ? undefined : color} />
            <span className="text-[9px] leading-tight uppercase tracking-wide truncate max-w-full">{l}</span>
          </button>
        ))}

      </div>

      {tab === "log" && (
        <>
          <EffectRemoveRequestsPanel campaignId={campaign.id} />
          <LogList rows={logs} initial={20} maxH="max-h-[70vh]"
            renderRow={(l: LogRow) => (
              <div key={l.id} className={`text-sm bg-secondary/40 rounded px-3 py-2 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
                <LogSegments segments={l.segments as any}
                  onItem={openItemFromId}
                  onBooster={openBoosterFromId}
                  onChar={(id) => {
                    if (!characters.find(c => c.id === id)) toast.error(t("dm.playerNotFound"));
                    else setOpenChar(id);
                  }} />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</p>
                  {l.undo && !l.undone && (
                    <button className="text-[10px] text-[var(--gold)] inline-flex items-center gap-1 hover:underline"
                      onClick={() => undoLog(l, campaign.id, dmCtx, t)}>
                      <Undo2 size={11}/> {t("dm.undo")}

                    </button>
                  )}
                </div>
              </div>
            )} />

          <button
            className="btn-fantasy w-full text-xs mt-3"
            style={{ background: "var(--gradient-blood, var(--loss))", color: "white" }}
            onClick={async () => {
              if (!confirm(t("dm.wipeConfirm"))) return;
              const { error } = await supabase.from("logs").delete().eq("campaign_id", campaign.id);
              if (error) toast.error(error.message);
              else {
                toast.success(t("dm.wipedToast"));
                await pushLog(campaign.id, [
                  { t: "char", v: character.name, color: character.color, id: character.id },
                  { t: "text", v: t("dm.wipedLog") },
                ]);
              }
            }}
          >{t("dm.wipeLog")}</button>
        </>
      )}

      {tab === "create" && (
        <div className="space-y-4">
          <CreateItem campaignId={campaign.id} dm={dmCtx} players={players} />
          <DMConditionsCreator campaignId={campaign.id} players={players} />
          <div className="ornate-card p-4 space-y-2">
            <h3 className="font-display text-sm uppercase tracking-widest text-[var(--rarity-purple)]">{t("dm.createBoosterTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("dm.createBoosterHint")}</p>
            <button className="btn-fantasy w-full"
              style={{ background: "linear-gradient(135deg, var(--rarity-purple), oklch(0.35 0.18 300))", color: "white" }}
              onClick={() => setCreatingBooster(true)}>
              <Plus size={14} className="inline" /> {t("dm.newBooster")}
            </button>

            <BulkBoosterImport campaignId={campaign.id} />
          </div>

          {players[0] && (
            <div className="ornate-card p-4 space-y-2">
              <h3 className="font-display text-sm uppercase tracking-widest text-[var(--rarity-purple)]">{t("skills.createSkillSectionTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("skills.createSkillSectionHint")}</p>
              <SkillManualCreate
                campaignId={campaign.id}
                target={players[0]}
                dm={dmCtx}
                players={players}
              />
            </div>
          )}

          <div className="ornate-card p-4 space-y-2">
            <h3 className="font-display text-sm uppercase tracking-widest text-[var(--loss)] flex items-center gap-2"><Skull size={16} /> {t("dm.createEnemyOrMonsterTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("dm.createEnemyOrMonsterHint")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/campaign/bestiary" className="btn-fantasy inline-flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, oklch(0.45 0.18 25), oklch(0.30 0.14 25))", color: "white" }}>
                <Plus size={14} /> {t("dm.openBestiary")}
              </Link>
              <a href="/campaign/bestiary?import=1" className="btn-fantasy inline-flex items-center justify-center gap-1.5">
                <Upload size={14} /> {t("bestiary.importExcelShort")}
              </a>
            </div>
          </div>
        </div>
      )}

      {tab === "boosters" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 ornate-card px-2 py-1">
            <Search size={14} className="text-muted-foreground" />
            <input value={boosterSearch} onChange={e => setBoosterSearch(e.target.value)}
              placeholder={t("dm.searchBooster")} className="flex-1 bg-transparent outline-none text-sm" />
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
              if (!dupes.length) { toast.info(t("dm.noDupes")); return; }
              if (!confirm(t("dm.dedupeConfirm", { n: dupes.length }))) return;
              const { error } = await (supabase as any).from("boosters").delete().in("id", dupes);
              if (error) toast.error(error.message);
              else {
                toast.success(t("dm.dedupedToast", { n: dupes.length }));
                await pushLog(campaign.id, [
                  { t: "char", v: character.name, color: character.color, id: character.id },
                  { t: "text", v: t("dm.dedupedLog", { n: dupes.length }) },
                ]);
              }
            }}
          >{t("dm.dedupeBoosters")}</button>


          <div className="flex gap-2">
            <button
              className="flex-1 text-xs px-3 py-2 rounded border border-border"
              onClick={() => { setBoosterSelectMode(!boosterSelectMode); setBoosterSel(new Set()); }}
            >{boosterSelectMode ? t("dm.cancelSelect") : t("dm.selectMode")}</button>
            {boosterSelectMode && (
              <>
                <button
                  className="text-xs px-3 py-2 rounded border border-border"
                  onClick={() => {
                    const visible = boosters.filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase()));
                    if (boosterSel.size === visible.length) setBoosterSel(new Set());
                    else setBoosterSel(new Set(visible.map(b => b.id)));
                  }}
                >{boosterSel.size === boosters.filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase())).length && boosterSel.size > 0 ? t("dm.none") : t("dm.all")}</button>
                <button
                  className="text-xs px-3 py-2 rounded border border-destructive text-destructive disabled:opacity-50"
                  disabled={boosterSel.size === 0}
                  onClick={async () => {
                    const ids = [...boosterSel];
                    if (!confirm(t("dm.deleteBoostersConfirm", { n: ids.length }))) return;
                    const { error } = await (supabase as any).from("boosters").delete().in("id", ids);
                    if (error) toast.error(error.message);
                    else {
                      toast.success(t("dm.deletedN", { n: ids.length }));
                      await pushLog(campaign.id, [
                        { t: "char", v: character.name, color: character.color, id: character.id },
                        { t: "text", v: t("dm.deletedBoostersLog", { n: ids.length }) },
                      ]);
                      setBoosterSel(new Set()); setBoosterSelectMode(false);
                    }
                  }}
                >{t("dm.deleteN", { n: boosterSel.size })}</button>

              </>
            )}
          </div>

          {boosters.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">{t("dm.noBoosters")}</p>}
          {boosters
            .filter(b => !boosterSearch || b.name.toLowerCase().includes(boosterSearch.toLowerCase()))
            .map(b => {
              const holderIds = holdersByBooster.get(b.id) || [];
              const holders = holderIds
                .map(id => characters.find(c => c.id === id))
                .filter((c): c is Character => !!c);
              const checked = boosterSel.has(b.id);
              return (
                <button key={b.id} onClick={() => {
                    if (boosterSelectMode) {
                      const next = new Set(boosterSel);
                      if (checked) next.delete(b.id); else next.add(b.id);
                      setBoosterSel(next);
                    } else setSelBooster(b);
                  }}
                  className="w-full ornate-card p-3 flex justify-between items-start text-left gap-2"
                  style={{ borderColor: checked ? "var(--gold)" : RARITY_COLOR[b.rarity as Rarity] }}>
                  {boosterSelectMode && (
                    <input type="checkbox" readOnly checked={checked} className="accent-[var(--gold)] mt-1" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-display" style={{ color: RARITY_COLOR[b.rarity as Rarity] }}>🃏 {b.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.max_uses}/{b.max_uses} {t("boosters.uses").toLowerCase()}
                    </p>
                    {holders.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {holders.map(h => (
                          <span
                            key={h.id}
                            onClick={(e) => { e.stopPropagation(); setOpenChar(h.id); }}
                            className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border font-display cursor-pointer hover:opacity-80"
                            style={{
                              borderColor: h.color,
                              color: h.color,
                              background: `color-mix(in oklab, ${h.color} 15%, transparent)`,
                            }}
                          >
                            {h.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground mt-1">🏛️ Vault</p>
                    )}
                  </div>
                  <RarityBadge rarity={b.rarity as Rarity} />
                </button>
              );
            })}
        </div>
      )}

      {tab === "vault" && (() => {
        const filtered = vault.filter(it => {
          if (vaultTopic === "equip") {
            if (it.category !== "equipo") return false;
            if (vaultSub !== "all" && it.slot !== vaultSub) return false;
            return true;
          }
          if (vaultTopic === "objects") {
            if (it.category === "equipo") return false;
            if (vaultSub !== "all" && it.category !== vaultSub) return false;
            return true;
          }
          return true;
        });
        return (
        <div className="space-y-2">
          {/* Topic chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {([
              ["all", t("dm.vaultFilterAll"), "🏛️"],
              ["equip", t("dm.vaultFilterEquip"), "⚔️"],
              ["objects", t("dm.vaultFilterObjects"), "🧪"],
            ] as const).map(([k, l, icon]) => (
              <button key={k}
                onClick={() => { setVaultTopic(k as any); setVaultSub("all"); }}
                className={`flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border font-display tracking-wide ${vaultTopic === k ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "bg-card border-border text-foreground"}`}>
                <span>{icon}</span><span>{l}</span>
              </button>
            ))}
          </div>
          {/* Sub-chips */}
          {vaultTopic === "equip" && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button onClick={() => setVaultSub("all")}
                className={`flex-shrink-0 text-[10px] px-2 py-1 rounded border ${vaultSub === "all" ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "bg-card border-border"}`}>
                {t("dm.vaultFilterAllSub")}
              </button>
              {SLOTS.map(s => (
                <button key={s.key} onClick={() => setVaultSub(s.key)}
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${vaultSub === s.key ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "bg-card border-border"}`}>
                  <span>{s.icon}</span><span>{t(`slots.${s.key}`)}</span>
                </button>
              ))}
            </div>
          )}
          {vaultTopic === "objects" && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button onClick={() => setVaultSub("all")}
                className={`flex-shrink-0 text-[10px] px-2 py-1 rounded border ${vaultSub === "all" ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "bg-card border-border"}`}>
                {t("dm.vaultFilterAllSub")}
              </button>
              {ITEM_CATEGORIES.filter(c => c.key !== "equipo").map(c => (
                <button key={c.key} onClick={() => setVaultSub(c.key)}
                  className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${vaultSub === c.key ? "bg-[var(--gold)] text-black border-[var(--gold)]" : "bg-card border-border"}`}>
                  <span>{c.icon}</span><span>{t(`categories.${c.key}`)}</span>
                </button>
              ))}
            </div>
          )}

          {vault.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">{t("dm.vaultEmpty")}</p>}
          {vault.length > 0 && filtered.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">{t("dm.vaultNoMatch")}</p>
          )}
          {filtered.map(it => (
            <button key={it.id} onClick={() => setSelItem(it)}
              className="w-full ornate-card p-3 flex justify-between items-center text-left"
              style={it.category === "equipo" ? { borderColor: RARITY_COLOR[it.rarity as Rarity] } : undefined}>
              <div>
                <p className="font-display" style={it.category === "equipo" ? { color: RARITY_COLOR[it.rarity as Rarity] } : undefined}>{it.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {it.category === "equipo" ? t(`slots.${it.slot}`) : t(`categories.${it.category}`)}
                  {it.category !== "equipo" && (it.uses ?? 0) > 0 && ` · x${it.uses}`}
                </p>
              </div>
              {it.category === "equipo" && <RarityBadge rarity={it.rarity as Rarity} />}
            </button>
          ))}
        </div>
        );
      })()}

      {tab === "skills" && (
        <SkillsManager campaignId={campaign.id} dm={dmCtx} players={players} onlineIds={onlineIds} />
      )}

      {tab === "escenario" && (
        <>
          {!players.length && (
            <p className="text-center text-xs text-muted-foreground py-3">
              {t("dm.noPlayersYet", { name: campaign.name })}
            </p>
          )}

          <Escenario
            characters={characters}
            items={items}
            onlineIds={onlineIds}
            logs={logs}
            selfId={null}
            dmCharacterIds={dmCharacterIds}
            nameOverrides={dmLabels}
            onOpenChar={(id) => setOpenChar(id)}
            onOpenImage={(id) => setImageViewerCharId(id)}
            onOpenItem={openItemFromId}
            onOpenBooster={openBoosterFromId}
            speakingIds={voice.speakingIds}
            hideCombatTab
          />

          <div className="mt-3">
            <CombatDMPanel
              campaignId={campaign.id}
              dm={dmCtx}
              encounter={combat.encounter}
              participants={combat.participants}
              groups={combat.groups}
              pins={combat.pins}
            />
          </div>
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
      {imageViewerCharId && (() => {
        const c = characters.find(ch => ch.id === imageViewerCharId);
        if (!c) return null;
        return (
          <CharacterImageViewer
            character={c}
            canEdit={false}
            canDelete={true}
            onClose={() => setImageViewerCharId(null)}
            onEditFace={() => {}}
            onEditBody={() => {}}
          />
        );
      })()}
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

async function undoLog(l: LogRow, campaignId: string, dm: { id: string; name: string; color: string }, t: (k: string, v?: any) => string) {
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
  } else if (u.kind === "combat.duplicate.remove") {
    const ids = u.participantIds || [];
    if (ids.length) {
      await supabase.from("combat_enemy_skills").delete().in("combat_participant_id", ids);
      await supabase.from("combat_participants").delete().in("id", ids);
    }
  }
  await supabase.from("logs").update({ undone: true } as any).eq("id", l.id);
  await pushLog(campaignId, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: t("dm.undoneLog") },
  ]);
}


function CreateItem({ campaignId, dm, players }: { campaignId: string; dm: { id: string; name: string; color: string }; players: Character[] }) {
  const { t: tr } = useT();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemCategory | "monedas">("equipo");
  const [slot, setSlot] = useState<Slot>("casco");
  const [rarity, setRarity] = useState<Rarity>("white");
  const [damage, setDamage] = useState(0);
  const [uses, setUses] = useState(1);
  const [coins, setCoins] = useState(10);
  const [description, setDescription] = useState("");
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
        { t: "text", v: tr("dm.sentLog") },
        { t: "coins", v: `${coins}` },
        { t: "text", v: tr("dm.sentTo") },
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
      description: description.trim() || null,
    };
    const { data: it } = await supabase.from("items").insert(payload).select().single();
    if (it) {
      const targetChar = players.find(p => p.id === target);
      const handed = send && !!targetChar;
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: handed ? tr("dm.handedLog") : tr("dm.createdLog") },
        ...(handed ? [{ t: "char", v: targetChar!.name, color: targetChar!.color, id: targetChar!.id } as const, { t: "text", v: ":" } as const] : []),
        { t: "item", v: it.name, rarity: it.rarity as any, id: it.id },
      ] as any, { kind: "item.recreate", item: it as any }, { dmOnly: !handed });
    }

    setName(""); setDamage(0); setUses(1); setDescription("");
  }

  const isCoins = category === "monedas";

  return (
    <div className="ornate-card p-4 space-y-3">
      <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value as any)}>
        {ITEM_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {tr(`categories.${c.key}`)}</option>)}
        <option value="monedas">{tr("dm.coins")}</option>
      </select>
      {!isCoins && (
        <input className="w-full bg-input border border-border rounded px-3 py-2 text-sm" placeholder={tr("dm.itemNamePh")} value={name} onChange={e => setName(e.target.value)} />
      )}
      {category === "equipo" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <select className="bg-input border border-border rounded px-2 py-2 text-sm" value={slot} onChange={e => setSlot(e.target.value as Slot)}>
              {SLOTS.map(s => <option key={s.key} value={s.key}>{s.icon} {tr(`slots.${s.key}`)}</option>)}
            </select>
            <select className="bg-input border border-border rounded px-2 py-2 text-sm" value={rarity} onChange={e => setRarity(e.target.value as Rarity)}
              style={{ color: RARITY_COLOR[rarity] }}>
              {(["white","blue","purple","gold"] as Rarity[]).map(r => <option key={r} value={r} style={{ color: "black" }}>{tr(`rarities.${r}`)}</option>)}
            </select>
          </div>
          {isWeapon(slot) ? (
            <label className="flex items-center justify-between text-sm">{tr("dm.damagePermanent")}
              <input type="number" className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={damage} onChange={e => setDamage(+e.target.value)} />
            </label>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              {tr("dm.rarityHint", { def: RARITY_BONUS[rarity].def, hp: RARITY_BONUS[rarity].hp })}
            </p>
          )}
        </>
      ) : isCoins ? (
        <label className="flex items-center justify-between text-sm">{tr("dm.coinsAmount")}
          <input type="number" min={1} className="w-24 bg-input border border-border rounded px-2 py-1 text-right" value={coins} onChange={e => setCoins(Math.max(1, +e.target.value))} />
        </label>
      ) : (
        <label className="flex items-center justify-between text-sm">{tr("dm.usesAmount")}
          <input type="number" min={1} className="w-20 bg-input border border-border rounded px-2 py-1 text-right" value={uses} onChange={e => setUses(Math.max(1, +e.target.value))} />
        </label>
      )}
      {!isCoins && (
        <textarea
          className="w-full bg-input border border-border rounded px-3 py-2 text-sm"
          rows={2}
          placeholder={tr("itemEditor.description")}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      )}
      <div className="gem-divider"/>
      <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">{isCoins ? tr("dm.pickPlayer") : tr("dm.keepVault")}</option>
        {players.map(p => <option key={p.id} value={p.id}>{tr("dm.sendTo", { name: p.name })}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        {!isCoins && <button className="btn-fantasy" onClick={() => create(false)}><Plus size={14} className="inline"/> {tr("dm.vault")}</button>}
        <button className={`btn-fantasy ${isCoins ? "col-span-2" : ""}`} style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} disabled={!target} onClick={() => create(true)}><Send size={14} className="inline"/> {tr("dm.send")}</button>
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
  const { t: tr } = useT();
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
    await supabase.from("items").update({ owner_character_id: dm.id, in_dm_vault: true, equipped: false, inventory_slot_type: "normal" } as any).eq("id", item.id);
    await clampHpForOwner(prevOwner, oldMax);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},
      {t:"text",v:tr("dm.reclaimedLog")},
      {t:"item",v:item.name,rarity:item.rarity as Rarity,id:item.id},
    ], { kind: "item.update", id: item.id, prev });
    onClose();
  }
  async function destroy() {
    await supabase.from("items").delete().eq("id", item.id);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},
      {t:"text",v:tr("dm.destroyedLog")},
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
    await supabase.from("items").update({ owner_character_id: target, in_dm_vault: false, equipped: false, inventory_slot_type: "normal" } as any).eq("id", item.id);
    await clampHpForOwner(prevOwner, oldMax);
    await pushLog(campaignId, [
      {t:"char",v:dm.name,color:dm.color,id:dm.id},{t:"text",v:tr("dm.handedItem")},
      {t:"item",v:item.name,rarity:item.rarity as Rarity,id:item.id},{t:"text",v:tr("dm.sentTo")},
      {t:"char",v:t?.name||"?",color:t?.color||"#ccc",id:target},

    ], { kind: "item.update", id: item.id, prev });
    onClose();
  }
  return (
    <div className="fixed inset-0 bg-black/80 z-[65] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e=>e.stopPropagation()}>
        <h3 className="font-display text-lg" style={isEq ? { color: RARITY_COLOR[item.rarity as Rarity] } : undefined}>{item.name}</h3>
        <p className="text-xs text-muted-foreground">
          {isEq ? tr(`slots.${item.slot}`) : tr(`categories.${item.category}`)}
        </p>
        {isEq ? (
          <p className="text-sm">{isWeapon(item.slot as any) ? tr("equipment.damagePlus", { n: item.damage_bonus }) : tr("equipment.defHpPlus", { def: item.defense_bonus, hp: item.hp_bonus })}</p>
        ) : (item.uses ?? 0) > 0 && (
          <p className="text-sm">{tr("inventory.usesRemaining")} {item.uses}{item.max_uses ? `/${item.max_uses}` : ""}</p>
        )}
        {item.description && <p className="text-xs text-muted-foreground italic">"<StatText>{item.description}</StatText>"</p>}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy flex items-center justify-center gap-1" onClick={onEdit}><Pencil size={13}/> {tr("common.edit")}</button>
          <button className="btn-fantasy" onClick={reclaim}>{tr("dm.reclaim")}</button>
        </div>
        <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm" value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{tr("dm.sendToPlayer")}</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-fantasy w-full" disabled={!target} onClick={send}>{tr("dm.send")}</button>
        <button className="btn-fantasy w-full" style={{ background: "var(--gradient-blood)" }} onClick={destroy}>{tr("dm.destroy")}</button>
        <button className="text-xs text-muted-foreground underline w-full" onClick={onClose}>{tr("common.close")}</button>

      </div>
    </div>
  );
}

function BulkBoosterImport({ campaignId }: { campaignId: string }) {
  const { t: tr } = useT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  async function handleFile(file: File) {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const { parseBoosterFile, normalizeName } = await import("@/lib/boosterImport");
      const { rows, errors } = await parseBoosterFile(file);
      if (errors.length) toast.error(tr("dm.importErrors", { n: errors.length, detail: errors.slice(0,2).map(e=>`${e.where}: ${e.message}`).join(" · ") }));
      if (!rows.length) return;
      setProgress({ done: 0, total: rows.length });

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
      toast.success(tr("dm.importDone", { created, updated }) + (errors.length ? tr("dm.importDoneErr", { n: errors.length }) : ""));
    } catch (e: any) {
      toast.error(e?.message || tr("dm.importFailed"));
    } finally { setBusy(false); setProgress({ done: 0, total: 0 }); }
  }
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-1 pt-2 border-t border-border">
      <p className="text-[10px] text-muted-foreground">{tr("dm.importHint")}</p>
      <p className="text-[10px] text-muted-foreground">{tr("dm.importXlsx")}</p>
      <p className="text-[10px] text-muted-foreground">{tr("dm.importTxt")}</p>
      <input type="file" accept=".xlsx,.xls,.txt" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }}
        className="text-xs text-muted-foreground w-full file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-secondary file:text-foreground file:text-xs" />
      {busy && (
        <div className="space-y-1 pt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{tr("dm.importing")}</span>
            <span>{progress.total ? tr("dm.importProgress", { done: progress.done, total: progress.total, pct }) : tr("dm.pleaseWait")}</span>
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

function DMHeader({
  campaignName, characterName, dmLabel, voice, onLogout,
}: {
  campaignName: string;
  characterName: string;
  dmLabel: string;
  voice: { enabled: boolean; toggle: () => void };
  onMicSettings: () => void;
  onLogout: () => void;
}) {
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const items = useStandardHeaderItems({
    achievements: true,
    bestiary: true,
    mailbox: { onOpen: () => setMailboxOpen(true) },
    mic: { enabled: voice.enabled, toggle: voice.toggle },
    fullscreen: true,
    settings: { onOpen: () => setAppSettingsOpen(true) },
    exit: { onExit: onLogout },
  });
  return (
    <header className="relative mb-3 min-h-[64px]">
      <div className="text-center px-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{campaignName}</p>
        <h1 className="font-display text-xl rune-glow text-[var(--gold)] truncate">👑 {characterName}</h1>
        <p className="text-xs text-muted-foreground">{dmLabel}</p>
      </div>
      <div className="absolute right-0 top-1 flex items-center">
        <HeaderMenu items={items} />
      </div>
      <MailboxInlineModal open={mailboxOpen} onClose={() => setMailboxOpen(false)} />
      {appSettingsOpen && <AppSettingsModal onClose={() => setAppSettingsOpen(false)} />}
    </header>
  );
}

