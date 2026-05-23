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
import { CombatList } from "@/components/app/CombatList";
import { InitiativeButton } from "@/components/app/InitiativeButton";
import { User, Minus, Plus, Camera, Heart, HeartPulse, Coins } from "lucide-react";
import tabActiveBg from "@/assets/tab-active.png";
import hpFrameBg from "@/assets/hp-frame.png";
import hpButtonImg from "@/assets/hp-button.png";
import tabInactiveBg from "@/assets/tab-inactive.png";
import navEquipo from "@/assets/nav/equipo.png";
import navMochila from "@/assets/nav/mochila.png";
import navLogros from "@/assets/nav/logros.png";
import navPotenciadores from "@/assets/nav/potenciadores.png";
import navHabilidades from "@/assets/nav/habilidades.png";
import navNotas from "@/assets/nav/notas.png";
import statsPanelImg from "@/assets/character-sheet/stats-panel.png";
import pursePanelImg from "@/assets/character-sheet/purse-panel.png";
import { MicSettingsModal } from "@/components/app/MicSettingsModal";
import { HeaderMenu, MailboxInlineModal, useStandardHeaderItems } from "@/components/app/HeaderMenu";
import { CharacterImageViewer } from "@/components/app/CharacterImageViewer";
import { useVoice } from "@/lib/useVoice";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { AttributesBar } from "@/components/app/AttributesBar";
import { FramedCharacterPortrait } from "@/components/app/FramedCharacterPortrait";

import { useLongPress } from "@/hooks/useLongPress";


export const Route = createFileRoute("/campaign/profile")({
  component: Profile,
});

function Profile() {
  const { campaign, character, characters, items, logs, onlineIds, loading, combat } = useGameData();
  const nav = useNavigate();
  const { t } = useT();
  const [imgModal, setImgModal] = useState<null | "face" | "body">(null);
  const [imgViewer, setImgViewer] = useState(false);
  const [imgViewerCharId, setImgViewerCharId] = useState<string | null>(null);

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
    const prev = { current_hp: character.current_hp, hp_damage_taken: (character as any).hp_damage_taken };
    const { applyHpDelta } = await import("@/lib/hp");
    await applyHpDelta(character.id, next, stats.maxHp);
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
    { k: "fue",      label: t("attr.fue"), color: "var(--stat-fue)" },  // rojo
    { k: "des",      label: t("attr.des"), color: "var(--stat-des)" },  // verde
    { k: "con",      label: t("attr.con"), color: "var(--stat-con)" },  // azul
    { k: "int_stat", label: t("attr.int"), color: "var(--stat-int)" },  // morado
    { k: "wis",      label: t("attr.wis"), color: "var(--stat-sab)" },  // amarillo
    { k: "car",      label: t("attr.car"), color: "var(--stat-car)" },  // rosa
  ];

  // Players for Escenario view come from the shared component.


  return (
    <PageFrame>
      <ProfileHeader
        campaignName={campaign.name}
        characterName={character.name}
        subtitle={`${character.race || t("profile.defaultRace")} / ${character.class || t("profile.defaultClass")}`}
        voice={voice}
        onLogout={logout}
        settingsAria={t("profile.statsAria")}
      />
      <MicSettingsModal open={micSettingsOpen} onOpenChange={setMicSettingsOpen} />

      <div className="gem-divider mb-4" />

      {/* Tabs: Personaje / Escenario */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(["personaje", "escenario"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative aspect-[3.6/1] w-full bg-no-repeat bg-center bg-contain font-display tracking-wider text-sm flex items-center justify-center transition-transform active:scale-[0.98]"
              style={{
                backgroundImage: `url(${isActive ? tabActiveBg : tabInactiveBg})`,
                color: isActive ? "oklch(0.96 0.04 95)" : "oklch(0.75 0.05 30)",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              <span className="relative z-10">
                {tab === "personaje" ? t("profile.tabCharacter") : t("profile.tabScene")}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "personaje" && (
        <>
          {/* Top: framed portrait (left) + right column with 3 stat assets above, purse/initiative below */}
          <div className="grid grid-cols-2 gap-2 mb-3 items-start pl-0 border-none border-0 ml-0" style={{ overflow: "visible" }}>
            <div style={{ overflow: "visible" }}>
              <FramedCharacterPortrait
                character={character}
                level={(character as any).level ?? 1}
                ariaLabel={t("profile.editImageAria")}
                onClick={() => {
                  if (character.image_url || (character as any).body_image_url) {
                    setImgViewer(true);
                  } else {
                    setImgModal("face");
                  }
                }}
              />
            </div>


            <div className="flex flex-col gap-1.5">
              {/* Combined stats panel: attack / defense / speed in a single asset */}
              <div
                className="relative w-full select-none"
                style={{ aspectRatio: "1920 / 980" }}
                aria-label={`${t("profile.damage")} ${stats.damage}, ${t("profile.defense")} ${stats.defense}, ${t("profile.velocity")} ${character.velocity}`}
              >
                <img
                  src={statsPanelImg}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
                {[
                  { leftPct: 16.5, value: stats.damage > 0 ? `+${stats.damage}` : `${stats.damage}`, color: "#ffb3b3" },
                  { leftPct: 50,   value: `${stats.defense}`, color: "#b3d1ff" },
                  { leftPct: 83.5, value: <>{character.velocity}<span className="text-[0.55em] ml-0.5">ft</span></>, color: "#fff2b3" },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="absolute flex items-center justify-center pointer-events-none"
                    style={{ left: `${s.leftPct}%`, top: "72%", transform: "translate(-50%, -50%)" }}
                  >
                    <span
                      className="font-display font-bold leading-none text-xl sm:text-2xl"
                      style={{
                        color: s.color,
                        textShadow: `0 0 10px color-mix(in oklab, ${s.color} 55%, transparent), 0 0 2px color-mix(in oklab, ${s.color} 80%, transparent), 0 1px 2px rgba(0,0,0,0.9)`,
                      }}
                    >
                      {s.value}
                    </span>
                  </div>
                ))}

              </div>


              {/* Purse OR Initiative (initiative temporarily replaces purse while combat is active) */}
              {combat.encounter?.status && combat.encounter.status !== "ended" ? (
                <InitiativeButton
                  character={character}
                  encounter={combat.encounter}
                  participants={combat.participants}
                  groups={combat.groups}
                  pins={combat.pins}
                  online={characters.filter(c => onlineIds.has(c.id))}
                />
              ) : (
                <button
                  type="button"
                  {...coinsPress}
                  onContextMenu={(e) => { e.preventDefault(); setPurseOpen(true); }}
                  onDoubleClick={() => setPurseOpen(true)}
                  aria-label={`${t("purse.openHint")} — ${t("profile.coins")} ${character.coins}`}
                  title={t("purse.openHint")}
                  className="relative w-full block p-0 bg-transparent border-0 select-none transition-transform active:scale-[0.96]"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <img
                    src={pursePanelImg}
                    alt=""
                    className="block w-full h-auto pointer-events-none"
                    draggable={false}
                  />
                  <div
                    className="absolute pointer-events-none flex items-center justify-center"
                    style={{ left: "55%", top: "50%", transform: "translate(-50%, -50%)", lineHeight: 1 }}
                  >
                    <span
                      className="font-display font-bold leading-none text-[var(--gold)] text-2xl sm:text-3xl"
                      style={{
                        textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
                      }}
                    >
                      {character.coins}
                    </span>
                  </div>
                </button>

              )}
            </div>
          </div>



          {/* HP bar — bigger heart icon, integrated with frame */}
          <div
            className="mb-3"
            style={{
              backgroundImage: `url(${hpFrameBg})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
              padding: "0 18px 0 6px",
              aspectRatio: "7 / 1",
            }}
          >
            <div className="flex items-center gap-2 h-full">
              <button
                type="button"
                onClick={() => setHpModal(true)}
                aria-label={`${t("profile.modifyHpAria")} (${character.current_hp}/${stats.maxHp})`}
                title={t("profile.modifyHpAria")}
                className="shrink-0 flex items-center justify-center transition-transform active:scale-95 bg-transparent border-0 p-0 -ml-2"
                style={{ height: "140%", aspectRatio: "1 / 1" }}
              >
                <img src={hpButtonImg} alt="" className="h-full w-full object-contain pointer-events-none select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]" draggable={false} />
              </button>
              <div className="flex-1 h-3 rounded-full bg-black/40 overflow-hidden border border-[var(--gold)]/40">
                <div className="h-full transition-all" style={{
                  width: `${hpPct}%`,
                  background: hpPct > 50 ? "var(--gain)" : hpPct > 25 ? "var(--gold)" : "var(--loss)",
                }} />
              </div>
              <span className="font-display text-xs shrink-0 tabular-nums w-[7ch] text-center mr-[2px]">{character.current_hp}/{stats.maxHp}</span>
            </div>
          </div>


          {/* Atributos */}
          <AttributesBar character={character} />

          

          <ConditionsPanel character={character} campaignId={campaign.id} canEdit={true} />

          {/* Quick links — single row of 6 vertical asset buttons */}
          <div className="grid grid-cols-6 gap-1 mb-4">
            {[
              { to: "/campaign/equipment", src: navEquipo, label: t("profile.quickEquip") },
              { to: "/campaign/inventory", src: navMochila, label: t("profile.quickInv") },
              { to: "/campaign/achievements", src: navLogros, label: t("profile.quickAch") },
              { to: "/campaign/boosters", src: navPotenciadores, label: t("profile.quickBoost") },
              { to: "/campaign/skills", src: navHabilidades, label: t("skills.title") },
              { to: "/campaign/notes", src: navNotas, label: t("profile.quickNotes") },
            ].map((b) => (
              <Link
                key={b.to}
                to={b.to}
                aria-label={b.label}
                className="block min-w-0 transition-transform duration-150 ease-out active:scale-[0.94]"
                style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
              >
                <img
                  src={b.src}
                  alt={b.label}
                  className="w-full h-auto object-contain select-none pointer-events-none"
                  draggable={false}
                />
              </Link>
            ))}
          </div>

          {/* Log + Combat tab (mirrors Escenario behavior) */}
          <ProfileLogPanel
            logs={logs}
            combat={combat}
            selfId={character.id}
            onOpenChar={(id) => openCharFromLog(id, false)}
            onOpenItem={(id) => setOpenItem(id)}
            onOpenBooster={(id) => setOpenBooster(id)}
            t={t}
          />
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
          onOpenImage={(id) => { if (id === character.id) setImgViewer(true); else setImgViewerCharId(id); }}
          onOpenItem={(id) => setOpenItem(id)}
          onOpenBooster={(id) => setOpenBooster(id)}
          speakingIds={voice.speakingIds}
        />
      )}

      {imgModal && (
        <ImageEditor
          character={character}
          mode={imgModal}
          onClose={() => setImgModal(null)}
        />
      )}
      {imgViewer && (
        <CharacterImageViewer
          character={character}
          canEdit={true}
          onClose={() => setImgViewer(false)}
          onEditFace={() => { setImgViewer(false); setImgModal("face"); }}
          onEditBody={() => { setImgViewer(false); setImgModal("body"); }}
        />
      )}
      {imgViewerCharId && (() => {
        const c = characters.find(ch => ch.id === imgViewerCharId);
        if (!c) return null;
        return (
          <CharacterImageViewer
            character={c}
            canEdit={false}
            onClose={() => setImgViewerCharId(null)}
            onEditFace={() => {}}
            onEditBody={() => {}}
          />
        );
      })()}

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


function ImageEditor({
  character,
  mode,
  onClose,
}: {
  character: any;
  mode: "face" | "body";
  onClose: () => void;
}) {
  const { t } = useT();
  const isFace = mode === "face";

  const initialUrl = isFace
    ? (character.image_url || "")
    : (character.body_image_url || character.image_url || "");
  const initialScale = isFace
    ? (character.image_scale || 1)
    : (character.body_image_scale || character.image_scale || 1);
  const initialOx = isFace
    ? (character.image_offset_x ?? 50)
    : (character.body_image_offset_x ?? character.image_offset_x ?? 50);
  const initialOy = isFace
    ? (character.image_offset_y ?? 50)
    : (character.body_image_offset_y ?? character.image_offset_y ?? 50);

  const [url, setUrl] = useState<string>(initialUrl);
  const [scale, setScale] = useState<number>(initialScale);
  const [ox, setOx] = useState<number>(initialOx);
  const [oy, setOy] = useState<number>(initialOy);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const zoomMax = isFace ? 6 : 3;
  const zoomMin = 0.5;

  // Touch/mouse drag + pinch-zoom + wheel-zoom on the preview.
  // Translation in the CSS transform uses % of the image's own size (= container
  // width/height), then scale multiplies it. So a pixel delta dx maps to
  // (dx / (W * scale)) * 100 on ox.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ startDist: number; startScale: number; startOx: number; startOy: number; startMidX: number; startMidY: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  function clampScale(s: number) { return Math.min(zoomMax, Math.max(zoomMin, s)); }
  function clampOffset(v: number) { return Math.min(200, Math.max(-100, v)); }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!url) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, ox, oy };
      gestureRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      gestureRef.current = {
        startDist: Math.hypot(dx, dy) || 1,
        startScale: scale,
        startOx: ox,
        startOy: oy,
        startMidX: (pts[0].x + pts[1].x) / 2,
        startMidY: (pts[0].y + pts[1].y) / 2,
      };
      dragRef.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const newScale = clampScale(gestureRef.current.startScale * (dist / gestureRef.current.startDist));
      setScale(newScale);
      // Pan with midpoint movement for natural feel
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const ddx = midX - gestureRef.current.startMidX;
      const ddy = midY - gestureRef.current.startMidY;
      setOx(clampOffset(gestureRef.current.startOx + (ddx / (rect.width * newScale)) * 100));
      setOy(clampOffset(gestureRef.current.startOy + (ddy / (rect.height * newScale)) * 100));
    } else if (dragRef.current) {
      const ddx = e.clientX - dragRef.current.x;
      const ddy = e.clientY - dragRef.current.y;
      setOx(clampOffset(dragRef.current.ox + (ddx / (rect.width * scale)) * 100));
      setOy(clampOffset(dragRef.current.oy + (ddy / (rect.height * scale)) * 100));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!url) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    setScale(s => clampScale(s * factor));
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${character.id}/${mode}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setUrl(data.publicUrl);
    }
    setUploading(false);
  }

  async function save() {
    const patch: any = {};
    if (isFace) {
      patch.image_url = url;
      patch.image_scale = scale;
      patch.image_offset_x = ox;
      patch.image_offset_y = oy;
      patch.image_rotation = 0;
      // Auto-mirror to body if user has no body image yet (saves duplicate uploads)
      if (!character.body_image_url && url) {
        patch.body_image_url = url;
        patch.body_image_scale = 1;
        patch.body_image_offset_x = 50;
        patch.body_image_offset_y = 50;
        patch.body_image_rotation = 0;
      }
    } else {
      patch.body_image_url = url;
      patch.body_image_scale = scale;
      patch.body_image_offset_x = ox;
      patch.body_image_offset_y = oy;
      patch.body_image_rotation = 0;
    }
    await supabase.from("characters").update(patch).eq("id", character.id);
    onClose();
  }

  const previewAspect = isFace ? "aspect-square" : "aspect-[3/4]";
  const title = isFace ? t("profile.imgFaceTitle") : t("profile.imgBodyTitle");
  const hint = isFace ? t("profile.imgFaceHint") : t("profile.imgBodyHint");

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {isFace && <h3 className="font-display text-lg text-center">{title}</h3>}
        {isFace && <p className="text-[11px] text-muted-foreground text-center -mt-1">{hint}</p>}
        <div
          ref={previewRef}
          className={`${previewAspect} rounded-lg overflow-hidden bg-[var(--secondary)] relative border border-border ${url ? "cursor-grab active:cursor-grabbing" : ""}`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {url
            ? <img src={url} alt="preview"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                style={{
                  transform: `translate(${(ox - 50)}%, ${(oy - 50)}%) scale(${scale})`,
                  transformOrigin: "center center",
                }} />
            : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">{t("profile.imgNone")}</div>}
        </div>
        {url && <p className="text-[10px] text-muted-foreground text-center -mt-1">{t("profile.imgGestureHint")}</p>}

        {isFace && <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />}
        {isFace && <button className="btn-fantasy w-full flex items-center justify-center gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Camera size={14}/> {uploading ? t("profile.uploading") : t("profile.uploadFromGallery")}
        </button>}
        {isFace && <input className="w-full rounded bg-input border border-border px-3 py-2 text-xs"
          placeholder={t("profile.orPasteUrl")} value={url} onChange={e => setUrl(e.target.value)} />}

        {url && (
          <>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("profile.zoom")}</span>
              <input type="range" min={zoomMin} max={zoomMax} step={0.05} value={scale} onChange={e => setScale(+e.target.value)} className="flex-1" />
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

function ProfileLogPanel({ logs, combat, selfId, onOpenChar, onOpenItem, onOpenBooster, t }: {
  logs: any[];
  combat: ReturnType<typeof useGameData>["combat"];
  selfId: string;
  onOpenChar: (id: string) => void;
  onOpenItem: (id: string) => void;
  onOpenBooster: (id: string) => void;
  t: (k: string, p?: any) => string;
}) {
  const combatActive = combat.encounter?.status === "active";
  const [tab, setTab] = useState<"log" | "combat">(combatActive ? "combat" : "log");

  return (
    <>
      {combatActive ? (
        <div className="grid grid-cols-2 gap-1 mb-2">
          <button onClick={() => setTab("log")}
            className={`text-[10px] py-1.5 rounded-md font-display uppercase tracking-widest ${tab === "log" ? "bg-[var(--gold)] text-black" : "bg-card border border-border text-foreground"}`}>
            {t("combat.tabLog")}
          </button>
          <button onClick={() => setTab("combat")}
            className={`text-[10px] py-1.5 rounded-md font-display uppercase tracking-widest ${tab === "combat" ? "bg-[var(--gold)] text-black" : "bg-card border border-border text-foreground"}`}>
            {t("combat.tabCombat")}
          </button>
        </div>
      ) : (
        <h2 className="font-display text-xs uppercase tracking-widest text-center mb-2 text-[var(--gold)]">{t("profile.sessionLog")}</h2>
      )}
      {tab === "combat" && combat.encounter ? (
        <CombatList
          encounter={combat.encounter}
          participants={combat.participants}
          groups={combat.groups}
          pins={combat.pins}
          selfCharacterId={selfId}
          onOpenChar={onOpenChar}
        />
      ) : (
        <LogList rows={logs} initial={20} maxH="max-h-[40vh]" empty={t("escenario.noActivity")} collapsible collapsedRows={2}
          renderRow={(l: any) => (
            <div key={l.id} className={`text-xs bg-secondary/40 rounded px-2 py-1.5 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
              <LogSegments segments={l.segments as any}
                onItem={(id) => onOpenItem(id)}
                onBooster={(id) => onOpenBooster(id)}
                onChar={(id) => onOpenChar(id)} />
              <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(l.created_at).toLocaleTimeString()}</p>
            </div>
          )} />
      )}
    </>
  );
}

function ProfileHeader({
  campaignName, characterName, subtitle, voice, onLogout, settingsAria,
}: {
  campaignName: string;
  characterName: string;
  subtitle: string;
  voice: { enabled: boolean; toggle: () => void };
  onLogout: () => void;
  settingsAria: string;
}) {
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const items = useStandardHeaderItems({
    achievements: true,
    mic: { enabled: voice.enabled, toggle: voice.toggle },
    fullscreen: true,
    exit: { onExit: onLogout },
  });
  return (
    <header className="relative mb-3 min-h-[64px]">
      <div className="text-center px-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">{campaignName}</p>
        <h1 className="font-display text-xl rune-glow truncate">{characterName}</h1>
        <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div className="absolute right-0 top-1 flex items-center gap-1">
        <Link to="/campaign/settings" className="text-muted-foreground hover:text-foreground p-1" aria-label={settingsAria}>
          <User size={20} />
        </Link>
        <HeaderMenu items={items} />
      </div>
      <MailboxInlineModal open={mailboxOpen} onClose={() => setMailboxOpen(false)} />
    </header>
  );
}
