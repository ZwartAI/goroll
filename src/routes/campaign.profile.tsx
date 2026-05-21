import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { fmtMod, modifier, totals, setSession } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { LogSegments } from "@/components/app/LogSegments";
import { LogList } from "@/components/app/LogList";
import { CharacterSheetModal } from "@/components/app/CharacterSheetModal";
import { ItemModal } from "@/components/app/ItemModal";
import { BoosterPeek } from "@/components/app/BoosterEditor";
import { ConditionsPanel } from "@/components/app/ConditionsPanel";
import { CoinsPurseModal } from "@/components/app/CoinsAdjuster";
import { Escenario } from "@/components/app/Escenario";
import { InitiativeButton } from "@/components/app/InitiativeButton";
import { User, LogOut, Minus, Plus, Camera, Heart, HeartPulse, Sword, Backpack, Trophy, Sparkles, NotebookPen, Coins } from "lucide-react";
import { FullscreenButton } from "@/components/app/AppShell";
import { MailboxButton } from "@/components/app/MailboxButton";
import { MicToggle } from "@/components/app/MicToggle";
import { MicSettingsModal } from "@/components/app/MicSettingsModal";
import { useVoice } from "@/lib/useVoice";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/hooks/useLongPress";

export const Route = createFileRoute("/campaign/profile")({
  component: Profile,
});

function Profile() {
  const { campaign, character, characters, items, logs, onlineIds, loading, combat } = useGameData();
  const nav = useNavigate();
  const { t } = useT();
  const [imgModal, setImgModal] = useState(false);
  const [hpModal, setHpModal] = useState(false);
  const [purseOpen, setPurseOpen] = useState(false);
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [openBooster, setOpenBooster] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"personaje" | "escenario">("personaje");
  // When opened from Escenario tab (or from the log), force read-only sheet.
  const [openCharReadOnly, setOpenCharReadOnly] = useState(false);

  const coinsPress = useLongPress(() => setPurseOpen(true), 500);

  const voice = useVoice(campaign?.id, character?.id);
  const [micSettingsOpen, setMicSettingsOpen] = useState(false);

  if (loading || !character || !campaign) return <PageFrame><p className="text-center text-muted-foreground">{t("profile.loading")}</p></PageFrame>;

  const equipped = items.filter(i => i.owner_character_id === character.id && i.equipped);
  const stats = totals(character, equipped);
  const hpPct = Math.max(0, Math.min(100, (character.current_hp / stats.maxHp) * 100));

  async function changeHp(delta: number) {
    if (!character || !campaign) return;
    const next = Math.max(0, Math.min(stats.maxHp, character.current_hp + delta));
    if (next === character.current_hp) return;
    const prev = { current_hp: character.current_hp };
    await supabase.from("characters").update({ current_hp: next }).eq("id", character.id);
    await pushLog(campaign.id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: delta > 0 ? t("profile.healed") : t("profile.tookDmg") },
      delta > 0 ? { t: "gain", v: `+${delta}` } : { t: "loss", v: `${delta}` },
      { t: "text", v: `(${next}/${stats.maxHp})` },
    ], { kind: "character.update", id: character.id, prev });
  }

  async function changeCoins(n: number) {
    if (!n || !character || !campaign) return;
    const next = Math.max(0, character.coins + n);
    const prev = { coins: character.coins };
    await supabase.from("characters").update({ coins: next }).eq("id", character.id);
    await pushLog(campaign.id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: n > 0 ? t("profile.gained") : t("profile.spent") },
      { t: "coins", v: `${Math.abs(n)}` },
      { t: "text", v: `(${next})` },
    ], { kind: "character.update", id: character.id, prev });
  }

  function logout() { setSession(null); nav({ to: "/" }); }

  /** Open a character sheet from any source (log, escenario). Always read-only here. */
  function openCharFromLog(id: string | undefined, readOnly = false) {
    if (!id) { toast.error(t("profile.cantOpenSheetNoChar")); return; }
    const exists = characters.some(c => c.id === id) || character?.id === id;
    if (!exists) { toast.error(t("profile.cantOpenSheetMissing")); return; }
    setOpenCharReadOnly(readOnly);
    setOpenChar(id);
  }

  const ATTR_META: { k: "fue"|"des"|"con"|"int_stat"|"wis"|"car"; label: string; color: string }[] = [
    { k: "fue",      label: t("attr.fue"), color: "oklch(0.65 0.22 25)" },   // red
    { k: "des",      label: t("attr.des"), color: "oklch(0.70 0.17 145)" },  // green
    { k: "con",      label: t("attr.con"), color: "oklch(0.73 0.16 55)" },   // orange
    { k: "int_stat", label: t("attr.int"), color: "oklch(0.65 0.18 250)" },  // blue
    { k: "wis",      label: t("attr.wis"), color: "oklch(0.65 0.20 295)" },  // purple
    { k: "car",      label: t("attr.car"), color: "oklch(0.72 0.18 350)" },  // pink
  ];

  // Players for Escenario view come from the shared component.


  return (
    <PageFrame>
      <header className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <button onClick={logout} className="text-muted-foreground hover:text-foreground" aria-label={t("profile.logoutAria")}><LogOut size={18} /></button>
          <FullscreenButton />
          <MailboxButton />
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{campaign.name}</p>
          <h1 className="font-display text-xl rune-glow">{character.name}</h1>
          <p className="text-xs text-muted-foreground">{character.race || t("profile.defaultRace")} / {character.class || t("profile.defaultClass")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <MicToggle enabled={voice.enabled} onToggle={voice.toggle} onLongPress={() => setMicSettingsOpen(true)} />
          <MicSettingsModal open={micSettingsOpen} onOpenChange={setMicSettingsOpen} />
          <Link to="/campaign/settings" className="text-muted-foreground hover:text-foreground" aria-label={t("profile.statsAria")}><User size={20} /></Link>
        </div>
      </header>
      <div className="gem-divider mb-4" />

      {/* Tabs: Personaje / Escenario */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setActiveTab("personaje")}
          className={`btn-fantasy font-display tracking-wider ${activeTab === "personaje" ? "" : "opacity-50"}`}
          style={activeTab === "personaje"
            ? { background: "linear-gradient(135deg, oklch(0.45 0.16 145), oklch(0.30 0.12 145))", color: "white" }
            : undefined}
        >
          {t("profile.tabCharacter")}
        </button>
        <button
          onClick={() => setActiveTab("escenario")}
          className={`btn-fantasy font-display tracking-wider ${activeTab === "escenario" ? "" : "opacity-50"}`}
          style={activeTab === "escenario"
            ? { background: "linear-gradient(135deg, oklch(0.50 0.15 195), oklch(0.30 0.12 195))", color: "white" }
            : undefined}
        >
          {t("profile.tabScene")}
        </button>
      </div>

      {activeTab === "personaje" && (
        <>
          {/* Top: image (left) + compact stats + initiative (right) */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            <button
              onClick={() => setImgModal(true)}
              className="col-span-2 aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative ornate-card !p-0"
              aria-label={t("profile.editImageAria")}
            >
              {character.image_url ? (
                <img src={character.image_url} alt={character.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{
                    transform: `translate(${((character.image_offset_x ?? 50) - 50)}%, ${((character.image_offset_y ?? 50) - 50)}%) scale(${character.image_scale || 1})`,
                    transformOrigin: "center center",
                  }} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <span className="text-3xl mb-1">🧙</span>
                  <span className="text-[10px] text-center px-1">{t("profile.tapToUpload")}</span>
                </div>
              )}
            </button>

            <div className="col-span-3 flex flex-col gap-1.5">
              {/* Row 1: Level, Defense, Damage */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="ornate-card !p-1.5 text-center">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground leading-tight">{t("level.label")}</p>
                  <p className="font-display text-base leading-tight text-[var(--gold)]">{(character as any).level ?? 1}</p>
                </div>
                <div className="ornate-card !p-1.5 text-center">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground leading-tight">{t("profile.defense")}</p>
                  <p className="font-display text-base leading-tight text-[var(--gold)]">{stats.defense}</p>
                </div>
                <div className="ornate-card !p-1.5 text-center">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground leading-tight">{t("profile.damage")}</p>
                  <p className="font-display text-base leading-tight text-[var(--loss)]">{stats.damage > 0 ? `+${stats.damage}` : stats.damage}</p>
                </div>
              </div>

              {/* Row 2: Velocity (1) + Coins (2) */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="ornate-card !p-1.5 text-center">
                  <p className="text-[8px] uppercase tracking-wide text-muted-foreground leading-tight">{t("profile.velocity")}</p>
                  <p className="font-display text-base leading-tight">{character.velocity}<span className="text-[9px]">ft</span></p>
                </div>
                <button
                  type="button"
                  {...coinsPress}
                  onContextMenu={(e) => { e.preventDefault(); setPurseOpen(true); }}
                  onDoubleClick={() => setPurseOpen(true)}
                  aria-label={t("purse.openHint")}
                  title={t("purse.openHint")}
                  className="ornate-card !p-1.5 col-span-2 flex items-center justify-center gap-2 select-none transition-transform active:scale-95"
                >
                  <Coins size={18} className="text-[var(--gold)] shrink-0" />
                  <span className="font-display text-lg text-[var(--gold)] leading-none">{character.coins}</span>
                  <span className="text-[8px] uppercase tracking-wide text-muted-foreground leading-tight ml-1">{t("profile.coins")}</span>
                </button>
              </div>

              {/* Initiative / Pass Turn — primary combat action */}
              <div className="mt-0.5">
                <InitiativeButton
                  character={character}
                  encounter={combat.encounter}
                  participants={combat.participants}
                  groups={combat.groups}
                  online={characters.filter(c => onlineIds.has(c.id))}
                />
              </div>
            </div>
          </div>


          {/* HP bar */}
          <div className="ornate-card p-2 mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHpModal(true)}
                aria-label={t("profile.modifyHpAria")}
                title={t("profile.modifyHpAria")}
                className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center border border-[var(--gold)]/60 transition-transform active:scale-95"
                style={{
                  background: "linear-gradient(135deg, oklch(0.85 0.10 350), oklch(0.70 0.16 350))",
                  boxShadow: "0 4px 12px -6px oklch(0.55 0.20 350 / 0.7), inset 0 0 8px oklch(1 0 0 / 0.2)",
                }}
              >
                <Heart size={18} fill="oklch(0.55 0.22 25)" color="oklch(0.45 0.22 25)" strokeWidth={2} />
              </button>
              <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden border border-[var(--gold)]/40">
                <div className="h-full transition-all" style={{
                  width: `${hpPct}%`,
                  background: hpPct > 50 ? "var(--gain)" : hpPct > 25 ? "var(--gold)" : "var(--loss)",
                }} />
              </div>
              <span className="font-display text-xs shrink-0">{character.current_hp}/{stats.maxHp}</span>
            </div>
          </div>

          {/* Atributos */}
          <h2 className="font-display text-xs uppercase tracking-widest text-center mb-2 text-[var(--gold)]">{t("profile.attributes")}</h2>
          <div className="grid grid-cols-6 gap-1 mb-3">
            {ATTR_META.map(({ k, label, color }) => {
              const v = (character as any)[k] as number;
              const mod = fmtMod(modifier(v));
              return (
                <div
                  key={k}
                  className="ornate-card !p-1.5 text-center flex flex-col items-center justify-center gap-0.5 transition-shadow"
                  style={{
                    borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
                    background: `linear-gradient(180deg, color-mix(in oklab, ${color} 10%, var(--card)), var(--card))`,
                    boxShadow: `inset 0 0 12px color-mix(in oklab, ${color} 12%, transparent)`,
                  }}
                >
                  <span className="text-[10px] font-display tracking-wide whitespace-nowrap" style={{ color }}>
                    {label}: {v}
                  </span>
                  <span className="font-display font-bold leading-none text-lg" style={{ color, textShadow: `0 0 8px color-mix(in oklab, ${color} 45%, transparent)` }}>
                    {mod}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="stat-pill mb-3 !text-[11px]"><span>{t("profile.initiative")}</span><span className="text-[var(--gold)] font-bold">{fmtMod(character.initiative)}</span></div>

          <ConditionsPanel character={character} campaignId={campaign.id} canEdit={true} />

          {/* Quick links — icon left, text right */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Link to="/campaign/equipment" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2">
              <Sword size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[11px]">{t("profile.quickEquip")}</span>
            </Link>
            <Link to="/campaign/inventory" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2" style={{ background: "linear-gradient(135deg, oklch(0.5 0.15 195), oklch(0.3 0.1 195))" }}>
              <Backpack size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[11px]">{t("profile.quickInv")}</span>
            </Link>
            <Link to="/campaign/achievements" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}>
              <Trophy size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[11px]">{t("profile.quickAch")}</span>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Link to="/campaign/boosters" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2 tracking-normal"
              style={{ background: "linear-gradient(135deg, var(--rarity-purple), oklch(0.35 0.18 300))", color: "white" }}>
              <Sparkles size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[10px]">{t("profile.quickBoost")}</span>
            </Link>
            <Link to="/campaign/skills" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}>
              <Sparkles size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[11px]">{t("skills.title")}</span>
            </Link>
            <Link to="/campaign/notes" className="btn-fantasy flex items-center justify-center gap-1.5 overflow-hidden min-w-0 px-2"
              style={{ background: "linear-gradient(135deg, oklch(0.45 0.12 220), oklch(0.30 0.10 220))", color: "white" }}>
              <NotebookPen size={14} className="shrink-0" /><span className="min-w-0 text-center leading-tight break-words line-clamp-2 text-[11px]">{t("profile.quickNotes")}</span>
            </Link>
          </div>

          {/* Log */}
          <h2 className="font-display text-xs uppercase tracking-widest text-center mb-2 text-[var(--gold)]">{t("profile.sessionLog")}</h2>
          <LogList rows={logs} initial={20} maxH="max-h-[40vh]" empty={t("escenario.noActivity")}
            renderRow={(l: any) => (
              <div key={l.id} className={`text-xs bg-secondary/40 rounded px-2 py-1.5 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
                <LogSegments segments={l.segments as any}
                  onItem={(id) => setOpenItem(id)}
                  onBooster={(id) => setOpenBooster(id)}
                  onChar={(id) => openCharFromLog(id, false)} />
                <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(l.created_at).toLocaleTimeString()}</p>
              </div>
            )} />
        </>
      )}

      {activeTab === "escenario" && (
        <Escenario
          characters={characters}
          items={items}
          onlineIds={onlineIds}
          logs={logs}
          selfId={character.id}
          onOpenChar={(id) => openCharFromLog(id, true)}
          onOpenItem={(id) => setOpenItem(id)}
          onOpenBooster={(id) => setOpenBooster(id)}
          speakingIds={voice.speakingIds}
        />
      )}

      {imgModal && (
        <ImageEditor character={character} onClose={() => setImgModal(false)} />
      )}
      {hpModal && (
        <HpModal
          current={character.current_hp}
          max={stats.maxHp}
          onApply={async (d) => { await changeHp(d); }}
          onClose={() => setHpModal(false)}
        />
      )}
      {openChar && (
        <CharacterSheetModal characterId={openChar} campaignId={campaign.id}
          editor={openCharReadOnly ? null : null}
          onClose={() => { setOpenChar(null); setOpenCharReadOnly(false); }}
          onPickItem={(it) => setOpenItem(it.id)} />
      )}
      {openItem && (
        <ItemModal itemId={openItem} onClose={() => setOpenItem(null)} />
      )}
      {openBooster && (
        <BoosterPeek boosterId={openBooster} character={character} campaignId={campaign.id}
          hideDiscard onClose={() => setOpenBooster(null)} />
      )}
      {purseOpen && (
        <CoinsPurseModal
          current={character.coins}
          onApply={changeCoins}
          onClose={() => setPurseOpen(false)}
        />
      )}
    </PageFrame>
  );
}


function ImageEditor({ character, onClose }: { character: any; onClose: () => void }) {
  const { t } = useT();
  const [url, setUrl] = useState<string>(character.image_url || "");
  const [scale, setScale] = useState<number>(character.image_scale || 1);
  const [ox, setOx] = useState<number>(character.image_offset_x ?? 50);
  const [oy, setOy] = useState<number>(character.image_offset_y ?? 50);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${character.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setUrl(data.publicUrl);
    }
    setUploading(false);
  }

  async function save() {
    await supabase.from("characters").update({
      image_url: url, image_scale: scale, image_offset_x: ox, image_offset_y: oy,
    }).eq("id", character.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center">{t("profile.imgTitle")}</h3>
        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative border border-border">
          {url
            ? <img src={url} alt="preview"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: `translate(${(ox - 50)}%, ${(oy - 50)}%) scale(${scale})`,
                  transformOrigin: "center center",
                }} />
            : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">{t("profile.imgNone")}</div>}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
        <button className="btn-fantasy w-full flex items-center justify-center gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Camera size={14}/> {uploading ? t("profile.uploading") : t("profile.uploadFromGallery")}
        </button>
        <input className="w-full rounded bg-input border border-border px-3 py-2 text-xs"
          placeholder={t("profile.orPasteUrl")} value={url} onChange={e => setUrl(e.target.value)} />

        {url && (
          <>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("profile.zoom")}</span>
              <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={e => setScale(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{scale.toFixed(2)}x</span>
            </label>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("profile.posX")}</span>
              <input type="range" min={-100} max={200} value={ox} onChange={e => setOx(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{ox|0}</span>
            </label>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("profile.posY")}</span>
              <input type="range" min={-100} max={200} value={oy} onChange={e => setOy(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{oy|0}</span>
            </label>
          </>
        )}

        <div className="flex gap-2">
          <button className="btn-fantasy flex-1" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn-fantasy flex-1" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={save}>{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}

function HpModal({
  current, max, onApply, onClose,
}: {
  current: number;
  max: number;
  onApply: (delta: number) => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [subVal, setSubVal] = useState("");
  const [addVal, setAddVal] = useState("");
  const sub = parseInt(subVal, 10);
  const add = parseInt(addVal, 10);

  async function quick(delta: number) {
    await onApply(delta);
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-xs w-full space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center flex items-center justify-center gap-2">
          <HeartPulse size={18} className="text-[oklch(0.72_0.18_350)]" />
          {t("profile.hpModalTitle")}
        </h3>
        <p className="text-center text-xs text-muted-foreground -mt-2">
          {current}/{max}
        </p>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-1">
            {t("profile.hpQuickAdjust")}
          </p>
          <div className="grid grid-cols-4 gap-1">
            <button className="btn-fantasy !py-1.5 !px-2 !text-[11px]" onClick={() => quick(-5)}>
              <Minus size={11} className="inline" />5
            </button>
            <button className="btn-fantasy !py-1.5 !px-2 !text-[11px]" onClick={() => quick(-1)}>
              <Minus size={11} className="inline" />1
            </button>
            <button className="btn-fantasy !py-1.5 !px-2 !text-[11px]"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => quick(1)}>
              <Plus size={11} className="inline" />1
            </button>
            <button className="btn-fantasy !py-1.5 !px-2 !text-[11px]"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => quick(5)}>
              <Plus size={11} className="inline" />5
            </button>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center mb-1">
            {t("profile.hpExact")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <input
                type="number" min={1} inputMode="numeric"
                value={subVal}
                onChange={e => setSubVal(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={t("profile.hpAmountPh")}
                className="w-full bg-input border border-border rounded px-2 py-1.5 text-center text-sm"
              />
              <button
                className="btn-fantasy w-full !py-1 !text-[11px] flex items-center justify-center gap-1"
                style={{ background: "var(--gradient-blood, var(--loss))", color: "white" }}
                disabled={!sub || sub <= 0}
                onClick={async () => {
                  if (!sub || sub <= 0) return;
                  await onApply(-sub);
                  setSubVal("");
                }}
              >
                <Minus size={11} /> {t("profile.hpSubtract")}
              </button>
            </div>
            <div className="space-y-1">
              <input
                type="number" min={1} inputMode="numeric"
                value={addVal}
                onChange={e => setAddVal(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={t("profile.hpAmountPh")}
                className="w-full bg-input border border-border rounded px-2 py-1.5 text-center text-sm"
              />
              <button
                className="btn-fantasy w-full !py-1 !text-[11px] flex items-center justify-center gap-1"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                disabled={!add || add <= 0}
                onClick={async () => {
                  if (!add || add <= 0) return;
                  await onApply(add);
                  setAddVal("");
                }}
              >
                <Plus size={11} /> {t("profile.hpAdd")}
              </button>
            </div>
          </div>
        </div>

        <button className="btn-fantasy w-full" onClick={onClose}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}