import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RARITY_COLOR, RARITY_LABEL, RARITY_DICE_BONUS,
  type Rarity, type Character,
} from "@/lib/game";
import { toastSaved } from "@/lib/saved";
import { toast } from "sonner";
import { StatText } from "./StatText";
import type { Booster } from "./BoosterCard";

/* ─────────────────────────────── shared bits ─────────────────────────────── */

function ModalShell({ children, onClose, color }: { children: React.ReactNode; onClose: () => void; color: string }) {
  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="ornate-card max-w-md w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 relative"
        onClick={e => e.stopPropagation()}
        style={{
          borderColor: color,
          boxShadow: `0 0 24px color-mix(in oklab, ${color} 35%, transparent), inset 0 0 30px color-mix(in oklab, ${color} 10%, transparent)`,
          background: `radial-gradient(ellipse at top, color-mix(in oklab, ${color} 10%, transparent), transparent 60%), var(--card)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FancyHeader({ title, name, color }: { title: string; name: string; color: string }) {
  return (
    <div className="text-center space-y-1">
      <p className="font-display tracking-[0.3em] text-sm flex items-center justify-center gap-3" style={{ color: "var(--gold)" }}>
        <span className="opacity-60">◆</span>
        {title}
        <span className="opacity-60">◆</span>
      </p>
      <h2 className="font-display text-2xl leading-tight" style={{ color }}>{name}</h2>
    </div>
  );
}

function MetaChips({
  extId, tipo, rarity,
}: { extId?: string | null; tipo?: string | null; rarity: Rarity }) {
  const rarityColor = RARITY_COLOR[rarity];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {extId && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border"
          style={{ borderColor: "color-mix(in oklab, var(--gold) 40%, transparent)", color: "var(--gold)" }}>
          🏷️ ID: {extId}
        </span>
      )}
      {tipo && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border"
          style={{
            borderColor: "color-mix(in oklab, oklch(0.65 0.20 295) 60%, transparent)",
            background: "color-mix(in oklab, oklch(0.55 0.20 295) 18%, transparent)",
            color: "oklch(0.85 0.15 295)",
          }}>
          ⓘ Tipo: {tipo}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border font-display"
        style={{
          borderColor: rarityColor,
          background: `color-mix(in oklab, ${rarityColor} 18%, transparent)`,
          color: rarityColor,
        }}>
        ✦ Rareza: {RARITY_LABEL[rarity]}
      </span>
    </div>
  );
}

function SectionFrame({
  icon, title, color, children,
}: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-3 space-y-2 relative"
      style={{
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        background: "color-mix(in oklab, var(--card) 80%, black)",
      }}>
      <div className="flex items-center gap-2 font-display text-sm tracking-wider uppercase" style={{ color: "var(--gold)" }}>
        <span>{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--gold))" }} />
        <span className="opacity-70">◆</span>
      </div>
      {children}
    </div>
  );
}

function FieldTile({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  return (
    <div className="rounded-md p-2.5 flex items-start gap-2"
      style={{ border: "1px solid color-mix(in oklab, var(--gold) 18%, transparent)" }}>
      <span className="text-base mt-0.5" style={{ color: "var(--gold)" }}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm break-words">{value || <span className="text-muted-foreground italic">—</span>}</p>
      </div>
    </div>
  );
}

function RarityBonusChip({ rarity }: { rarity: Rarity }) {
  const c = RARITY_COLOR[rarity];
  return (
    <span className="inline-flex flex-col items-center justify-center px-2.5 py-1.5 rounded-md font-display leading-tight whitespace-nowrap"
      style={{
        border: `1px solid ${c}`,
        background: `color-mix(in oklab, ${c} 22%, transparent)`,
        color: c,
        minWidth: "3.25rem",
      }}>
      <span className="text-base font-bold">+{RARITY_DICE_BONUS[rarity]}</span>
      <span className="text-[8px] uppercase tracking-wider opacity-90">por rareza</span>
    </span>
  );
}

/* ───────────────────────── Player / Spectator details ─────────────────────── */

function BoosterDetails({ b }: { b: Booster }) {
  const color = RARITY_COLOR[b.rarity as Rarity];
  return (
    <>
      <SectionFrame icon="✦" title="Resumen del potenciador" color={color}>
        <div className="grid grid-cols-2 gap-2">
          <FieldTile icon="🎯" label="Modo de lanzamiento" value={b.modo_lanzamiento} />
          <FieldTile icon="📏" label="Distancia" value={b.distancia} />
          <FieldTile icon="👤" label="Objetivos" value={b.objetivos} />
          <div className="rounded-md p-2.5 flex items-start gap-2"
            style={{ border: "1px solid color-mix(in oklab, var(--gold) 18%, transparent)" }}>
            <span className="text-base mt-0.5" style={{ color: "var(--gold)" }}>🎲</span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Dados a tirar</p>
              <p className="text-sm break-words">{b.dados || <span className="text-muted-foreground italic">—</span>}</p>
            </div>
            <RarityBonusChip rarity={b.rarity as Rarity} />
          </div>
        </div>
        <div className="rounded-md p-2.5 flex items-center gap-2"
          style={{ border: "1px solid color-mix(in oklab, var(--gold) 18%, transparent)" }}>
          <span className="text-base" style={{ color: "var(--gold)" }}>🧪</span>
          <div className="flex-1">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Usos disponibles</p>
            <p className="text-sm font-display">{b.uses} / {b.max_uses}</p>
          </div>
        </div>
      </SectionFrame>

      {b.efecto && (
        <SectionFrame icon="✒️" title="Efecto o Condición" color={color}>
          <p className="text-sm italic text-center px-2 py-1 leading-relaxed">{b.efecto}</p>
        </SectionFrame>
      )}
    </>
  );
}

/* ───────────────────────────── DM Full Editor ───────────────────────────── */

export function BoosterEditor({
  booster, campaignId, onClose, onSaved,
  /** When provided the editor also exposes Transferir/Retirar buttons inline (DM flow). */
  players, dm,
}: {
  booster: Booster | null;
  campaignId: string;
  onClose: () => void;
  onSaved?: () => void;
  players?: Character[];
  dm?: { id: string; name: string; color: string } | null;
}) {
  const [extId, setExtId] = useState(booster?.external_id || "");
  const [tipo, setTipo] = useState(booster?.tipo || "");
  const [rarity, setRarity] = useState<Rarity>((booster?.rarity as Rarity) || "white");
  const [name, setName] = useState(booster?.name || "");
  const [modo, setModo] = useState(booster?.modo_lanzamiento || "");
  const [dist, setDist] = useState(booster?.distancia || "");
  const [obj, setObj] = useState(booster?.objetivos || "");
  const [dados, setDados] = useState(booster?.dados || "");
  const [efecto, setEfecto] = useState(booster?.efecto || "");
  const [uses, setUses] = useState(booster?.uses ?? 1);
  const [maxUses, setMaxUses] = useState(booster?.max_uses ?? 1);
  const [transferTo, setTransferTo] = useState("");

  const color = RARITY_COLOR[rarity];

  async function save() {
    if (!name.trim()) return toast.error("Pon un nombre");
    const payload: any = {
      campaign_id: campaignId,
      name: name.trim(), rarity,
      external_id: extId.trim() || null,
      tipo: tipo.trim() || null,
      modo_lanzamiento: modo.trim() || null,
      distancia: dist.trim() || null,
      objetivos: obj.trim() || null,
      dados: dados.trim() || null,
      efecto: efecto.trim() || null,
      uses: Math.max(0, uses),
      max_uses: Math.max(1, maxUses),
    };
    if (booster) {
      const { error } = await (supabase as any).from("boosters").update(payload).eq("id", booster.id);
      if (error) return toast.error(error.message);
    } else {
      payload.in_dm_vault = true;
      payload.owner_character_id = null;
      const { error } = await (supabase as any).from("boosters").insert(payload);
      if (error) return toast.error(error.message);
    }
    toastSaved();
    onSaved?.();
    onClose();
  }

  async function transferDM() {
    if (!booster || !transferTo) return;
    const goVault = transferTo === "__vault__";
    await (supabase as any).from("boosters").update({
      owner_character_id: goVault ? null : transferTo,
      in_dm_vault: goVault,
    }).eq("id", booster.id);
    if (dm) {
      const target = (players || []).find(p => p.id === transferTo);
      const { pushLog } = await import("@/lib/log");
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: goVault ? "guardó en el Vault" : "entregó" },
        { t: "item", v: booster.name, rarity },
        ...(target ? [{ t: "text", v: "a" } as const, { t: "char", v: target.name, color: target.color, id: target.id } as const] : []),
      ] as any);
    }
    toastSaved();
    onClose();
  }

  async function reclaim() {
    if (!booster) return;
    await (supabase as any).from("boosters").update({
      owner_character_id: null, in_dm_vault: true,
    }).eq("id", booster.id);
    if (dm) {
      const { pushLog } = await import("@/lib/log");
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: "retiró el potenciador" },
        { t: "item", v: booster.name, rarity },
      ]);
    }
    toastSaved();
    onClose();
  }

  return (
    <ModalShell onClose={onClose} color={color}>
      <FancyHeader title="POTENCIADOR" name={name || "Nuevo potenciador"} color={color} />
      <MetaChips extId={extId} tipo={tipo} rarity={rarity} />

      {/* Datos base */}
      <SectionFrame icon="📜" title="Datos base" color={color}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ID">
            <input className="dm-input" value={extId} onChange={e => setExtId(e.target.value)} placeholder="P-001" />
          </Field>
          <Field label="Tipo">
            <input className="dm-input" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Información, Daño…" />
          </Field>
          <Field label="Rareza">
            <select className="dm-input" value={rarity} onChange={e => setRarity(e.target.value as Rarity)} style={{ color }}>
              {(["white","blue","purple","gold"] as Rarity[]).map(r =>
                <option key={r} value={r} style={{ color: "black" }}>{RARITY_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Nombre">
            <input className="dm-input" value={name} onChange={e => setName(e.target.value)} />
          </Field>
        </div>
      </SectionFrame>

      {/* Uso en juego */}
      <SectionFrame icon="⚔️" title="Uso en juego" color={color}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Modo de lanzamiento">
            <select className="dm-input" value={modo} onChange={e => setModo(e.target.value)}>
              <option value="">— elegir —</option>
              {["[Punto]", "[Entorno]", "[Cono]", "[Línea]", "[Área]", "[Toque]", "[Personal]"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Distancia">
            <input className="dm-input" value={dist} onChange={e => setDist(e.target.value)} placeholder="30 pies (6c)" />
          </Field>
          <Field label="Objetivos / A quién aplica">
            <input className="dm-input" value={obj} onChange={e => setObj(e.target.value)} placeholder="1 criatura" />
          </Field>
          <Field label="Dados a tirar">
            <div className="flex items-center gap-2">
              <input className="dm-input flex-1" value={dados} onChange={e => setDados(e.target.value)} placeholder="1d20 + mod SAB" />
              <RarityBonusChip rarity={rarity} />
            </div>
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-base" style={{ color: "var(--gold)" }}>🧪</span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Usos</span>
          <label className="flex items-center gap-1 text-xs">Actual
            <input type="number" min={0} value={uses} onChange={e => setUses(+e.target.value)} className="dm-input w-16 text-center" />
          </label>
          <label className="flex items-center gap-1 text-xs">Máx.
            <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(+e.target.value)} className="dm-input w-16 text-center" />
          </label>
        </div>
      </SectionFrame>

      {/* Efecto */}
      <SectionFrame icon="✦" title="Efecto o condición" color={color}>
        <div className="flex gap-2 items-start">
          <span className="text-base mt-1" style={{ color: "var(--gold)" }}>✒️</span>
          <textarea className="dm-input flex-1 min-h-20" rows={3} value={efecto} onChange={e => setEfecto(e.target.value)} />
        </div>
      </SectionFrame>

      {/* Gestión / Acciones */}
      <SectionFrame icon="📦" title="Gestión / Acciones" color={color}>
        {booster && dm && (
          <>
            <select value={transferTo} onChange={e => setTransferTo(e.target.value)} className="dm-input w-full">
              <option value="">— transferir a —</option>
              <option value="__vault__">🏛️ Vault del DM</option>
              {(players || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy" disabled={!transferTo} onClick={transferDM}>⇄ Transferir</button>
              <button className="btn-fantasy" onClick={reclaim}>🗄️ Retirar Potenciador</button>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose}>✕ Cancelar</button>
          <button className="btn-fantasy"
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={save}>💾 Guardar Cambios</button>
        </div>
      </SectionFrame>

      <button className="text-sm text-muted-foreground underline w-full" onClick={onClose}>Cerrar</button>

      <style>{`.dm-input{width:100%;background:color-mix(in oklab,var(--input) 90%,black);border:1px solid color-mix(in oklab,var(--gold) 25%,transparent);border-radius:8px;padding:0.45rem 0.65rem;font-size:0.8rem;color:var(--foreground)}`}</style>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--gold)" }}>{label}</span>
      {children}
    </label>
  );
}

/* ───────────────── Player / Spectator action sheet ───────────────── */

export function BoosterActions({
  booster, character, campaignId, players, dm, readOnly, onClose, onEdit,
}: {
  booster: Booster;
  character?: Character | null;
  campaignId: string;
  players: Character[];
  dm?: { id: string; name: string; color: string } | null;
  readOnly?: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const [confirmUse, setConfirmUse] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const isDM = !!dm;
  const color = RARITY_COLOR[booster.rarity as Rarity];

  async function pushBoosterLog(actor: Character, verb: string, trailing?: string) {
    const { pushLog } = await import("@/lib/log");
    const segs: any[] = [
      { t: "char", v: actor.name, color: actor.color, id: actor.id },
      { t: "text", v: verb },
      { t: "item", v: booster.name, rarity: booster.rarity as Rarity },
    ];
    if (trailing) segs.push({ t: "text", v: trailing });
    await pushLog(campaignId, segs);
  }

  async function useBooster() {
    if (!character) return;
    const remaining = booster.uses - 1;
    if (remaining <= 0) {
      await (supabase as any).from("boosters").update({
        uses: booster.max_uses, owner_character_id: null, in_dm_vault: true,
      }).eq("id", booster.id);
      await pushBoosterLog(character, "usó el potenciador", "(último)");
    } else {
      await (supabase as any).from("boosters").update({ uses: remaining }).eq("id", booster.id);
      await pushBoosterLog(character, "usó el potenciador", `(${remaining} restantes)`);
    }
    onClose();
  }

  async function transferPlayer() {
    if (!transferTo || !character) return;
    await (supabase as any).from("boosters").update({
      owner_character_id: transferTo, in_dm_vault: false,
    }).eq("id", booster.id);
    const target = players.find(p => p.id === transferTo);
    await pushBoosterLog(character, `cedió el potenciador a ${target?.name ?? "?"}`);
    toastSaved();
    onClose();
  }

  async function rollBooster() {
    if (!character) return;
    const m = (booster.dados || "").match(/(\d+)\s*d\s*(\d+)/i);
    let detail = "";
    if (m) {
      const n = Math.min(20, +m[1] || 1);
      const f = Math.max(2, +m[2] || 20);
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * f));
      const total = rolls.reduce((a, b) => a + b, 0) + RARITY_DICE_BONUS[booster.rarity as Rarity];
      detail = `→ [${rolls.join(", ")}] +${RARITY_DICE_BONUS[booster.rarity as Rarity]} = ${total}`;
    } else {
      const r = 1 + Math.floor(Math.random() * 20);
      detail = `→ d20 = ${r} (+${RARITY_DICE_BONUS[booster.rarity as Rarity]} rareza = ${r + RARITY_DICE_BONUS[booster.rarity as Rarity]})`;
    }
    await pushBoosterLog(character, `tiró el potenciador ${detail}`);
    toast.success(detail);
  }

  // DM clicking a card opens the full editor instead of this read view.
  // (Kept as fallback for older callers passing dm explicitly here.)
  if (isDM && onEdit) {
    onEdit();
    return null;
  }

  return (
    <ModalShell onClose={onClose} color={color}>
      <FancyHeader title="POTENCIADOR" name={booster.name} color={color} />
      <MetaChips extId={booster.external_id} tipo={booster.tipo} rarity={booster.rarity as Rarity} />
      <BoosterDetails b={booster} />

      {!readOnly && character && (
        <div className="space-y-2">
          {!confirmUse ? (
            <button className="btn-fantasy w-full text-base py-3 flex items-center justify-center gap-2"
              disabled={booster.uses <= 0}
              onClick={() => setConfirmUse(true)}>
              ✦ Usar
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy" onClick={() => setConfirmUse(false)}>Cancelar</button>
              <button className="btn-fantasy"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                onClick={useBooster}>
                Sí, usar
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
                className="w-full bg-input border border-border rounded px-2 py-2 text-xs mb-1">
                <option value="">— a quién —</option>
                {players.filter(p => p.id !== character.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn-fantasy w-full" disabled={!transferTo} onClick={transferPlayer}>⇄ Transferir</button>
            </div>
            <button className="btn-fantasy h-full flex items-center justify-center gap-2" onClick={rollBooster}>
              ➤ Tirar Potenciador
            </button>
          </div>
        </div>
      )}

      <button className="text-sm text-muted-foreground underline w-full" onClick={onClose}>Cerrar</button>
    </ModalShell>
  );
}
