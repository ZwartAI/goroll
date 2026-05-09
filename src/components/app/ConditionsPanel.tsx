import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { toastSaved } from "@/lib/saved";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import type { Character } from "@/lib/game";

type CatalogRow = {
  id: string;
  campaign_id: string | null;
  key: string;
  label: string;
  icon: string;
  is_damage: boolean;
  damage_default: number;
};

type ConditionRow = {
  id: string;
  character_id: string;
  catalog_id: string | null;
  label: string;
  icon: string;
  turns_left: number;
  damage_per_turn: number;
};

export function ConditionsPanel({
  character,
  campaignId,
  canEdit = true,
}: {
  character: Character;
  campaignId: string;
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState<ConditionRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [adding, setAdding] = useState(false);

  async function reload() {
    const { data } = await (supabase as any).from("character_conditions")
      .select("*").eq("character_id", character.id).order("created_at");
    setRows((data || []) as ConditionRow[]);
  }
  async function loadCatalog() {
    const { data } = await (supabase as any).from("condition_effects_catalog")
      .select("*").or(`campaign_id.is.null,campaign_id.eq.${campaignId}`).order("label");
    setCatalog((data || []) as CatalogRow[]);
  }

  useEffect(() => { reload(); loadCatalog(); /* eslint-disable-next-line */ }, [character.id]);

  useEffect(() => {
    const ch = (supabase as any).channel(`cond:${character.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions", filter: `character_id=eq.${character.id}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [character.id]);

  async function tick(c: ConditionRow) {
    const next = c.turns_left - 1;
    if (c.damage_per_turn > 0) {
      const newHp = Math.max(0, character.current_hp - c.damage_per_turn);
      const prev = { current_hp: character.current_hp };
      await supabase.from("characters").update({ current_hp: newHp }).eq("id", character.id);
      await pushLog(campaignId, [
        { t: "char", v: character.name, color: character.color, id: character.id },
        { t: "text", v: `sufre ${c.icon} ${c.label}:` },
        { t: "loss", v: `-${c.damage_per_turn}` },
        { t: "text", v: `(${newHp})` },
      ], { kind: "character.update", id: character.id, prev });
    }
    if (next <= 0) {
      await (supabase as any).from("character_conditions").delete().eq("id", c.id);
      await pushLog(campaignId, [
        { t: "char", v: character.name, color: character.color, id: character.id },
        { t: "text", v: `ya no está ${c.icon} ${c.label}.` },
      ]);
    } else {
      await (supabase as any).from("character_conditions").update({ turns_left: next }).eq("id", c.id);
    }
    reload();
  }

  async function removeCondition(c: ConditionRow) {
    await (supabase as any).from("character_conditions").delete().eq("id", c.id);
    reload();
  }

  return (
    <div className="ornate-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xs uppercase tracking-widest text-[var(--gold)]">✨ Efectos de condición</h2>
        {canEdit && (
          <button className="text-[10px] text-[var(--gold)] underline inline-flex items-center gap-1"
            onClick={() => setAdding(true)}>
            <Plus size={11} /> Aplicar
          </button>
        )}
      </div>
      <div className="space-y-1">
        {rows.length === 0 && <p className="text-[10px] text-muted-foreground">Sin efectos activos.</p>}
        {rows.map(c => (
          <div key={c.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1.5">
            <span className="text-base">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display truncate">{c.label}</p>
              {c.damage_per_turn > 0 && (
                <p className="text-[9px] text-[var(--loss)]">−{c.damage_per_turn} ❤️ por turno</p>
              )}
            </div>
            {canEdit && (
              <button onClick={() => removeCondition(c)}
                className="text-muted-foreground hover:text-[var(--loss)]" aria-label="Quitar">
                <X size={12} />
              </button>
            )}
            <button onClick={() => tick(c)}
              className="text-[10px] px-2 py-1 rounded bg-[var(--gold)] text-black font-display min-w-[2.5rem]"
              title="Restar 1 turno">
              {c.turns_left}t
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <ApplyConditionModal
          characterId={character.id}
          campaignId={campaignId}
          catalog={catalog}
          onClose={() => setAdding(false)}
          onApplied={reload}
        />
      )}
    </div>
  );
}

export function ApplyConditionModal({
  characterId, campaignId, catalog, onClose, onApplied,
}: {
  characterId: string;
  campaignId: string;
  catalog: CatalogRow[];
  onClose: () => void;
  onApplied?: () => void;
}) {
  const [pickId, setPickId] = useState<string>(catalog[0]?.id || "");
  const [turns, setTurns] = useState(3);
  const [damage, setDamage] = useState(0);

  const picked = catalog.find(c => c.id === pickId);
  useEffect(() => { if (picked) setDamage(picked.damage_default); }, [pickId]);

  async function apply() {
    if (!picked) return toast.error("Elige un efecto");
    if (turns < 1) return toast.error("Turnos mínimo 1");
    await (supabase as any).from("character_conditions").insert({
      character_id: characterId,
      catalog_id: picked.id,
      label: picked.label,
      icon: picked.icon,
      turns_left: turns,
      damage_per_turn: picked.is_damage ? Math.max(0, damage) : 0,
    });
    await pushLog(campaignId, [
      { t: "text", v: `Aplicado ${picked.icon} ${picked.label} (${turns}t${picked.is_damage && damage > 0 ? `, -${damage}/t` : ""}).` },
    ]);
    toastSaved("Efecto aplicado");
    onApplied?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center">Aplicar efecto</h3>
        <select value={pickId} onChange={e => setPickId(e.target.value)}
          className="w-full bg-input border border-border rounded px-2 py-2 text-sm">
          {catalog.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.label}{c.is_damage ? " 🩸" : ""}</option>
          ))}
        </select>
        <label className="flex items-center justify-between text-sm">Turnos
          <input type="number" min={1} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
            value={turns} onChange={e => setTurns(Math.max(1, +e.target.value))} />
        </label>
        {picked?.is_damage && (
          <label className="flex items-center justify-between text-sm">Daño por turno
            <input type="number" min={0} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
              value={damage} onChange={e => setDamage(Math.max(0, +e.target.value))} />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose}>Cancelar</button>
          <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={apply}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}

/** DM panel: create new effect & apply to multiple players */
export function DMConditionsCreator({
  campaignId, players,
}: {
  campaignId: string;
  players: Character[];
}) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [tab, setTab] = useState<"apply" | "new">("apply");
  // new effect form
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("✨");
  const [isDamage, setIsDamage] = useState(false);
  const [damageDefault, setDamageDefault] = useState(0);
  // apply form
  const [pickId, setPickId] = useState("");
  const [turns, setTurns] = useState(3);
  const [damage, setDamage] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);

  async function loadCat() {
    const { data } = await (supabase as any).from("condition_effects_catalog")
      .select("*").or(`campaign_id.is.null,campaign_id.eq.${campaignId}`).order("label");
    const c = (data || []) as CatalogRow[];
    setCatalog(c);
    if (!pickId && c[0]) setPickId(c[0].id);
  }
  useEffect(() => { loadCat(); /* eslint-disable-next-line */ }, [campaignId]);

  const picked = catalog.find(c => c.id === pickId);
  useEffect(() => { if (picked) setDamage(picked.damage_default); }, [pickId]);

  async function createEffect() {
    if (!label.trim()) return toast.error("Pon un nombre");
    const { error } = await (supabase as any).from("condition_effects_catalog").insert({
      campaign_id: campaignId,
      key: label.toLowerCase().replace(/\s+/g, "_"),
      label: label.trim(),
      icon: icon || "✨",
      is_damage: isDamage,
      damage_default: isDamage ? Math.max(0, damageDefault) : 0,
    });
    if (error) return toast.error(error.message);
    toastSaved("Efecto creado");
    setLabel(""); setIcon("✨"); setIsDamage(false); setDamageDefault(0);
    loadCat();
  }

  async function applyToTargets() {
    if (!picked) return toast.error("Elige un efecto");
    if (!targets.length) return toast.error("Elige al menos un personaje");
    const rows = targets.map(charId => ({
      character_id: charId,
      catalog_id: picked.id,
      label: picked.label,
      icon: picked.icon,
      turns_left: Math.max(1, turns),
      damage_per_turn: picked.is_damage ? Math.max(0, damage) : 0,
    }));
    const { error } = await (supabase as any).from("character_conditions").insert(rows);
    if (error) return toast.error(error.message);
    for (const id of targets) {
      const ch = players.find(p => p.id === id);
      if (ch) {
        await pushLog(campaignId, [
          { t: "char", v: ch.name, color: ch.color, id: ch.id },
          { t: "text", v: `recibe ${picked.icon} ${picked.label} (${turns}t${picked.is_damage && damage > 0 ? `, -${damage}/t` : ""}).` },
        ]);
      }
    }
    toastSaved("Efectos aplicados");
    setTargets([]);
  }

  function toggleTarget(id: string) {
    setTargets(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);
  }

  return (
    <div className="ornate-card p-4 space-y-3">
      <div className="flex gap-1">
        <button onClick={() => setTab("apply")}
          className={`flex-1 text-xs py-1.5 rounded font-display ${tab === "apply" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
          Aplicar a jugadores
        </button>
        <button onClick={() => setTab("new")}
          className={`flex-1 text-xs py-1.5 rounded font-display ${tab === "new" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
          Crear nuevo
        </button>
      </div>

      {tab === "apply" && (
        <>
          <select value={pickId} onChange={e => setPickId(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-2 text-sm">
            {catalog.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}{c.is_damage ? " 🩸" : ""}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between text-sm">Turnos
              <input type="number" min={1} className="w-16 bg-input border border-border rounded px-2 py-1 text-right"
                value={turns} onChange={e => setTurns(Math.max(1, +e.target.value))} />
            </label>
            {picked?.is_damage && (
              <label className="flex items-center justify-between text-sm">Daño/t
                <input type="number" min={0} className="w-16 bg-input border border-border rounded px-2 py-1 text-right"
                  value={damage} onChange={e => setDamage(Math.max(0, +e.target.value))} />
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Aplicar a:</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1 text-xs">
                <input type="checkbox" checked={targets.includes(p.id)} onChange={() => toggleTarget(p.id)} />
                <span style={{ color: p.color }} className="font-display">{p.name}</span>
              </label>
            ))}
            {!players.length && <p className="text-xs text-muted-foreground">Sin jugadores.</p>}
          </div>
          <button className="btn-fantasy w-full" disabled={!targets.length}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={applyToTargets}>Aplicar</button>
        </>
      )}

      {tab === "new" && (
        <>
          <div className="flex gap-2">
            <input className="w-16 bg-input border border-border rounded px-2 py-2 text-center text-lg"
              value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} />
            <input className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
              placeholder="Nombre del efecto" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <label className="flex items-center justify-between text-sm">
            <span>¿Reduce vida por turno?</span>
            <input type="checkbox" checked={isDamage} onChange={e => setIsDamage(e.target.checked)} />
          </label>
          {isDamage && (
            <label className="flex items-center justify-between text-sm">Daño por turno (defecto)
              <input type="number" min={0} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
                value={damageDefault} onChange={e => setDamageDefault(Math.max(0, +e.target.value))} />
            </label>
          )}
          <button className="btn-fantasy w-full" onClick={createEffect}>Crear efecto</button>
        </>
      )}
    </div>
  );
}
