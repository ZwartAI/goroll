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
import { ConditionsPanel } from "@/components/app/ConditionsPanel";
import { Settings, LogOut, Minus, Plus, Camera } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/campaign/profile")({
  component: Profile,
});

function Profile() {
  const { campaign, character, characters, items, logs, loading } = useGameData();
  const nav = useNavigate();
  const [imgModal, setImgModal] = useState(false);
  const [coinDelta, setCoinDelta] = useState<string>("");
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  if (loading || !character || !campaign) return <PageFrame><p className="text-center text-muted-foreground">Cargando...</p></PageFrame>;

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
      { t: "text", v: delta > 0 ? "se curó" : "recibió daño:" },
      delta > 0 ? { t: "gain", v: `+${delta}` } : { t: "loss", v: `${delta}` },
      { t: "text", v: `(${next}/${stats.maxHp})` },
    ], { kind: "character.update", id: character.id, prev });
  }

  async function applyCoins() {
    const n = parseInt(coinDelta, 10);
    if (!n || !character || !campaign) return;
    const next = Math.max(0, character.coins + n);
    const prev = { coins: character.coins };
    await supabase.from("characters").update({ coins: next }).eq("id", character.id);
    await pushLog(campaign.id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: n > 0 ? "ganó" : "gastó" },
      { t: "coins", v: `${Math.abs(n)}` },
      { t: "text", v: `(${next})` },
    ], { kind: "character.update", id: character.id, prev });
    setCoinDelta("");
  }

  function logout() { setSession(null); nav({ to: "/" }); }

  const stat = (k: "fue"|"des"|"con"|"int_stat"|"wis"|"car", label: string) => {
    const v = (character as any)[k] as number;
    return (
      <div className="stat-pill !text-[11px]">
        <span>{label}: {v}</span>
        <span className="text-[var(--gold)] font-bold">{fmtMod(modifier(v))}</span>
      </div>
    );
  };

  return (
    <PageFrame>
      <header className="flex items-start justify-between gap-2 mb-3">
        <button onClick={logout} className="text-muted-foreground hover:text-foreground" aria-label="Salir"><LogOut size={18} /></button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{campaign.name}</p>
          <h1 className="font-display text-xl rune-glow">{character.name}</h1>
          <p className="text-xs text-muted-foreground">{character.race || "Humano"} / {character.class || "Aventurero"}</p>
        </div>
        <Link to="/campaign/settings" className="text-muted-foreground hover:text-foreground" aria-label="Ajustes"><Settings size={20} /></Link>
      </header>
      <div className="gem-divider mb-4" />

      {/* Top: image (left) + key stats (right) */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <button
          onClick={() => setImgModal(true)}
          className="col-span-2 aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative ornate-card !p-0"
          aria-label="Editar imagen"
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
              <span className="text-[10px] text-center px-1">Toca para subir</span>
            </div>
          )}
        </button>

        <div className="col-span-3 grid grid-cols-2 gap-2">
          <div className="ornate-card p-2 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Vida</p>
            <p className="font-display text-sm">{character.current_hp}/{stats.maxHp}</p>
          </div>
          <div className="ornate-card p-2 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Defensa</p>
            <p className="font-display text-sm text-[var(--gold)]">{stats.defense}</p>
          </div>
          <div className="ornate-card p-2 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Velocidad</p>
            <p className="font-display text-sm">{character.velocity}<span className="text-[9px]">ft</span></p>
          </div>
          <div className="ornate-card p-2 text-center">
            <p className="text-[9px] uppercase text-muted-foreground">Daño</p>
            <p className="font-display text-sm text-[var(--loss)]">{stats.damage > 0 ? `+${stats.damage}` : stats.damage}</p>
          </div>
          <div className="ornate-card p-2 text-center col-span-2">
            <p className="text-[9px] uppercase text-muted-foreground">🪙 Monedas</p>
            <p className="font-display text-base text-[var(--gold)]">{character.coins}</p>
            <div className="flex gap-1 mt-1">
              <input value={coinDelta} onChange={e => setCoinDelta(e.target.value.replace(/[^\-0-9]/g, ""))}
                placeholder="±" inputMode="numeric"
                className="flex-1 bg-input border border-border rounded px-1 py-0.5 text-[11px] text-center w-0" />
              <button onClick={applyCoins} className="text-[10px] px-2 rounded bg-[var(--gold)] text-black font-display">OK</button>
            </div>
          </div>
        </div>
      </div>

      {/* HP bar */}
      <div className="ornate-card p-2 mb-3">
        <div className="flex items-center gap-2">
          <span>❤️</span>
          <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden border border-[var(--gold)]/40">
            <div className="h-full transition-all" style={{
              width: `${hpPct}%`,
              background: hpPct > 50 ? "var(--gain)" : hpPct > 25 ? "var(--gold)" : "var(--loss)",
            }} />
          </div>
          <span className="font-display text-xs">{character.current_hp}/{stats.maxHp}</span>
        </div>
        <div className="flex gap-1 mt-2 justify-center">
          <button className="btn-fantasy !py-1 !px-2 !text-[10px]" onClick={() => changeHp(-5)}><Minus size={10} className="inline"/>5</button>
          <button className="btn-fantasy !py-1 !px-2 !text-[10px]" onClick={() => changeHp(-1)}><Minus size={10} className="inline"/>1</button>
          <button className="btn-fantasy !py-1 !px-2 !text-[10px]" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={() => changeHp(1)}><Plus size={10} className="inline"/>1</button>
          <button className="btn-fantasy !py-1 !px-2 !text-[10px]" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={() => changeHp(5)}><Plus size={10} className="inline"/>5</button>
        </div>
      </div>

      {/* Atributos */}
      <h2 className="font-display text-xs uppercase tracking-widest text-center mb-1 text-[var(--gold)]">Atributos</h2>
      <div className="grid grid-cols-3 gap-1 mb-3">
        {stat("fue", "FUE")}
        {stat("des", "DES")}
        {stat("con", "CON")}
        {stat("int_stat", "INT")}
        {stat("wis", "SAB")}
        {stat("car", "CAR")}
      </div>
      <div className="stat-pill mb-3 !text-[11px]"><span>Iniciativa</span><span className="text-[var(--gold)] font-bold">{fmtMod(character.initiative)}</span></div>

      <ConditionsPanel character={character} campaignId={campaign.id} canEdit={true} />

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Link to="/campaign/equipment" className="btn-fantasy text-center">⚔️ Equipo</Link>
        <Link to="/campaign/inventory" className="btn-fantasy text-center" style={{ background: "linear-gradient(135deg, oklch(0.5 0.15 195), oklch(0.3 0.1 195))" }}>🎒 Mochila</Link>
        <Link to="/campaign/achievements" className="btn-fantasy text-center" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}>🏆 Logros</Link>
      </div>
      <div className="grid grid-cols-1 gap-2 mb-4">
        <Link to="/campaign/boosters" className="btn-fantasy text-center"
          style={{ background: "linear-gradient(135deg, var(--rarity-purple), oklch(0.35 0.18 300))", color: "white" }}>
          🃏 Potenciadores
        </Link>
      </div>

      {/* Log */}
      <h2 className="font-display text-xs uppercase tracking-widest text-center mb-2 text-[var(--gold)]">📜 Log de la partida</h2>
      <LogList rows={logs} initial={20} maxH="max-h-[40vh]" empty="Sin actividad aún."
        renderRow={(l: any) => (
          <div key={l.id} className={`text-xs bg-secondary/40 rounded px-2 py-1.5 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
            <LogSegments segments={l.segments as any}
              onItem={(id) => setOpenItem(id)}
              onChar={(id) => {
                if (!characters.find(c => c.id === id)) toast.error("Jugador no encontrado");
                else setOpenChar(id);
              }} />
            <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(l.created_at).toLocaleTimeString()}</p>
          </div>
        )} />

      {imgModal && (
        <ImageEditor character={character} onClose={() => setImgModal(false)} />
      )}
      {openChar && (
        <CharacterSheetModal characterId={openChar} campaignId={campaign.id} editor={null}
          onClose={() => setOpenChar(null)}
          onPickItem={(it) => setOpenItem(it.id)} />
      )}
      {openItem && (
        <ItemModal itemId={openItem} onClose={() => setOpenItem(null)} />
      )}
    </PageFrame>
  );
}

function ImageEditor({ character, onClose }: { character: any; onClose: () => void }) {
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
        <h3 className="font-display text-lg text-center">Imagen del personaje</h3>
        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-[var(--secondary)] relative border border-border">
          {url
            ? <img src={url} alt="preview"
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: `translate(${(ox - 50)}%, ${(oy - 50)}%) scale(${scale})`,
                  transformOrigin: "center center",
                }} />
            : <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">Sin imagen</div>}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
        <button className="btn-fantasy w-full flex items-center justify-center gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Camera size={14}/> {uploading ? "Subiendo..." : "Subir desde galería"}
        </button>
        <input className="w-full rounded bg-input border border-border px-3 py-2 text-xs"
          placeholder="o pega una URL https://..." value={url} onChange={e => setUrl(e.target.value)} />

        {url && (
          <>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Zoom</span>
              <input type="range" min={0.5} max={3} step={0.05} value={scale} onChange={e => setScale(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{scale.toFixed(2)}x</span>
            </label>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">↔ Pos X</span>
              <input type="range" min={-100} max={200} value={ox} onChange={e => setOx(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{ox|0}</span>
            </label>
            <label className="text-xs flex items-center justify-between gap-2">
              <span className="text-muted-foreground">↕ Pos Y</span>
              <input type="range" min={-100} max={200} value={oy} onChange={e => setOy(+e.target.value)} className="flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{oy|0}</span>
            </label>
          </>
        )}

        <div className="flex gap-2">
          <button className="btn-fantasy flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-fantasy flex-1" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}