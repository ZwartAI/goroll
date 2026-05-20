import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RARITY_COLOR, RARITY_DICE_BONUS,
  type Rarity, type Character,
} from "@/lib/game";
import { toastSaved } from "@/lib/saved";
import { toast } from "sonner";
import { StatText } from "./StatText";
import type { Booster } from "./BoosterCard";
import { useT } from "@/lib/i18n";
import { Trash2, MessageSquare } from "lucide-react";

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
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {extId && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border"
          style={{ borderColor: "color-mix(in oklab, var(--gold) 40%, transparent)", color: "var(--gold)" }}>
          {t("boosters.metaIdLabel")} {extId}
        </span>
      )}
      {tipo && (
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border"
          style={{
            borderColor: "color-mix(in oklab, oklch(0.65 0.20 295) 60%, transparent)",
            background: "color-mix(in oklab, oklch(0.55 0.20 295) 18%, transparent)",
            color: "oklch(0.85 0.15 295)",
          }}>
          {t("boosters.metaTypeLabel")} {tipo}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] border font-display"
        style={{
          borderColor: rarityColor,
          background: `color-mix(in oklab, ${rarityColor} 18%, transparent)`,
          color: rarityColor,
        }}>
        {t("boosters.metaRarityLabel")} {t(`rarities.${rarity}`)}
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
        <p className="text-sm break-words">
          {value ? <StatText>{value}</StatText> : <span className="text-muted-foreground italic">—</span>}
        </p>
      </div>
    </div>
  );
}

function RarityBonusChip({ rarity }: { rarity: Rarity }) {
  const c = RARITY_COLOR[rarity];
  const { t } = useT();
  return (
    <span className="inline-flex flex-col items-center justify-center px-2.5 py-1.5 rounded-md font-display leading-tight whitespace-nowrap"
      style={{
        border: `1px solid ${c}`,
        background: `color-mix(in oklab, ${c} 22%, transparent)`,
        color: c,
        minWidth: "3.25rem",
      }}>
      <span className="text-base font-bold">+{RARITY_DICE_BONUS[rarity]}</span>
      <span className="text-[8px] uppercase tracking-wider opacity-90">{t("boosters.rarityBonusShort")}</span>
    </span>
  );
}

/* ───────────────────────── Player / Spectator details ─────────────────────── */

function Chip({
  children, color,
}: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{
        borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color: `color-mix(in oklab, ${color} 80%, white)`,
      }}
    >
      {children}
    </span>
  );
}

function StatRow({
  icon, label, color, children, isLast,
}: { icon: string; label: string; color: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <div
      className="flex items-center gap-2 py-2 min-h-[44px]"
      style={
        isLast
          ? undefined
          : { borderBottom: "1px solid color-mix(in oklab, var(--gold) 14%, transparent)" }
      }
    >
      <span className="text-sm w-5 text-center shrink-0" aria-hidden>{icon}</span>
      <span
        className="text-[10px] uppercase tracking-widest flex-1 min-w-0 truncate"
        style={{ color: `color-mix(in oklab, ${color} 70%, white)` }}
      >
        {label}
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 max-w-[60%]">
        {children}
      </span>
    </div>
  );
}

function splitDiceChips(dados: string): string[] {
  // Split on `+` while keeping the `+` on subsequent fragments: "1d20 + mod SAB" → ["1d20", "+ mod SAB"]
  const parts = dados.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  return parts.map((p, i) => (i === 0 ? p : `+ ${p}`));
}

// Distinct accent per stat row to avoid the all-gold monotony
const ROW_ACCENTS = {
  cast:     "oklch(0.72 0.18 25)",   // coral/red
  distance: "oklch(0.72 0.14 215)",  // sky blue
  targets:  "oklch(0.72 0.16 295)",  // purple
  dice:     "oklch(0.78 0.16 145)",  // green
  rarity:   "oklch(0.82 0.16 70)",   // amber/gold (kept gold-ish for the bonus)
  uses:     "oklch(0.78 0.14 330)",  // pink
} as const;

function BoosterHolders({ boosterId, campaignId, excludeId }: { boosterId?: string | null; campaignId: string; excludeId?: string }) {
  const { t } = useT();
  const [owners, setOwners] = useState<{ id: string; name: string; color: string }[]>([]);
  useEffect(() => {
    if (!boosterId) return;
    let live = true;
    async function load() {
      const { data: assigns } = await (supabase as any)
        .from("booster_assignments")
        .select("character_id")
        .eq("booster_id", boosterId);
      const ids = Array.from(new Set(((assigns || []) as any[]).map(r => r.character_id).filter(Boolean)));
      if (ids.length === 0) { if (live) setOwners([]); return; }
      const { data: chars } = await supabase.from("characters").select("id,name,color").in("id", ids);
      if (!live) return;
      setOwners(((chars || []) as any[]).filter(c => c.id !== excludeId));
    }
    load();
    const ch = (supabase as any).channel(`bx:holders:${boosterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "booster_assignments", filter: `campaign_id=eq.${campaignId}` }, load)
      .subscribe();
    return () => { live = false; (supabase as any).removeChannel(ch); };
  }, [boosterId, campaignId, excludeId]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">{t("boosters.holders")}:</span>
      {owners.length === 0 && <span className="text-[10px] italic text-muted-foreground">{t("boosters.noHolders")}</span>}
      {owners.map(o => (
        <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
          style={{ borderColor: o.color, color: o.color, background: `color-mix(in oklab, ${o.color} 12%, transparent)` }}>
          <span className="w-2 h-2 rounded-full" style={{ background: o.color }} />
          {o.name}
        </span>
      ))}
    </div>
  );
}

function BoosterDetails({ b }: { b: Booster }) {
  const color = RARITY_COLOR[b.rarity as Rarity];
  const { t } = useT();
  const diceChips = b.dados ? splitDiceChips(b.dados) : [];
  return (
    <>
      <SectionFrame icon="✦" title={t("boosters.summary")} color={color}>
        <div className="px-1">
          <StatRow icon="🎯" label={t("boosters.castMode")} color={ROW_ACCENTS.cast}>
            {b.modo_lanzamiento
              ? <Chip color={ROW_ACCENTS.cast}>{b.modo_lanzamiento}</Chip>
              : <span className="text-muted-foreground italic text-xs">—</span>}
          </StatRow>
          <StatRow icon="📏" label={t("boosters.distance")} color={ROW_ACCENTS.distance}>
            {b.distancia
              ? b.distancia.split(/\s+(?=\()|(?<=\))\s+/).filter(Boolean).map((seg, i) => (
                  <Chip key={i} color={ROW_ACCENTS.distance}>{seg}</Chip>
                ))
              : <span className="text-muted-foreground italic text-xs">—</span>}
          </StatRow>
          <StatRow icon="👤" label={t("boosters.targets")} color={ROW_ACCENTS.targets}>
            {b.objetivos
              ? <Chip color={ROW_ACCENTS.targets}>{b.objetivos}</Chip>
              : <span className="text-muted-foreground italic text-xs">—</span>}
          </StatRow>
          <StatRow icon="🎲" label={t("boosters.diceToRoll")} color={ROW_ACCENTS.dice}>
            {diceChips.length > 0
              ? diceChips.map((c, i) => (
                  <Chip key={i} color={ROW_ACCENTS.dice}><StatText>{c}</StatText></Chip>
                ))
              : <span className="text-muted-foreground italic text-xs">—</span>}
            <Chip color={ROW_ACCENTS.rarity}>+{RARITY_DICE_BONUS[b.rarity as Rarity]} {t("boosters.rarityBonus")}</Chip>
          </StatRow>
          <StatRow icon="🧪" label={t("boosters.usesAvailable")} color={ROW_ACCENTS.uses} isLast>
            <Chip color={ROW_ACCENTS.uses}>{b.uses} / {b.max_uses}</Chip>
          </StatRow>
        </div>
      </SectionFrame>

      {b.template_id && (
        <SectionFrame icon="👥" title={t("boosters.holders")} color={color}>
          <BoosterHolders templateId={b.template_id} campaignId={b.campaign_id} excludeId={b.owner_character_id || undefined} />
        </SectionFrame>
      )}

      {b.efecto && (
        <SectionFrame icon="✒️" title={t("boosters.effect")} color={color}>
          <p className="text-sm italic text-center px-2 py-1 leading-relaxed"><StatText>{b.efecto}</StatText></p>
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
  const [showTransferPick, setShowTransferPick] = useState(false);
  const { t } = useT();

  const color = RARITY_COLOR[rarity];

  async function save() {
    if (!name.trim()) return toast.error(t("boosters.putName"));
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

  async function moveToVault() {
    if (!booster) return;
    await (supabase as any).from("boosters").update({
      owner_character_id: null,
      in_dm_vault: true,
    }).eq("id", booster.id);
    if (dm) {
      const { pushLog } = await import("@/lib/log");
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: t("boosters.savedToVault") },
        { t: "item", v: booster.name, rarity },
      ] as any);
    }
    toastSaved();
    onClose();
  }

  async function distributeCopies(targetIds: string[]) {
    if (!booster || targetIds.length === 0) return;
    const templateId = (booster as any).template_id || booster.id;
    const baseRow = {
      campaign_id: campaignId,
      template_id: templateId,
      name: booster.name,
      rarity: booster.rarity,
      uses: booster.max_uses,
      max_uses: booster.max_uses,
      in_dm_vault: false,
      external_id: booster.external_id ?? null,
      tipo: booster.tipo ?? null,
      modo_lanzamiento: booster.modo_lanzamiento ?? null,
      distancia: booster.distancia ?? null,
      objetivos: booster.objetivos ?? null,
      dados: booster.dados ?? null,
      efecto: booster.efecto ?? null,
    };
    const rows = targetIds.map(id => ({ ...baseRow, owner_character_id: id }));
    const { error } = await (supabase as any).from("boosters").insert(rows);
    if (error) { toast.error(error.message); return; }
    if (dm) {
      const targets = (players || []).filter(p => targetIds.includes(p.id));
      const { pushLog } = await import("@/lib/log");
      const segs: any[] = [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: t("boosters.handed") },
        { t: "item", v: booster.name, rarity },
        { t: "text", v: "→" },
      ];
      targets.forEach((tgt, i) => {
        if (i > 0) segs.push({ t: "text", v: "," });
        segs.push({ t: "char", v: tgt.name, color: tgt.color, id: tgt.id });
      });
      await pushLog(campaignId, segs);
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
        { t: "text", v: t("boosters.reclaimedLog") },
        { t: "item", v: booster.name, rarity },
      ]);
    }
    toastSaved();
    onClose();
  }

  return (
    <ModalShell onClose={onClose} color={color}>
      <FancyHeader title={t("boosters.boosterLabel")} name={name || t("boosters.newBooster")} color={color} />
      <MetaChips extId={extId} tipo={tipo} rarity={rarity} />

      {/* Datos base */}
      <SectionFrame icon="📜" title={t("boosters.baseData")} color={color}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("boosters.id")}>
            <input className="dm-input" value={extId} onChange={e => setExtId(e.target.value)} placeholder={t("boosters.idPh")} />
          </Field>
          <Field label={t("boosters.type")}>
            <input className="dm-input" value={tipo} onChange={e => setTipo(e.target.value)} placeholder={t("boosters.typePh")} />
          </Field>
          <Field label={t("boosters.rarity")}>
            <select className="dm-input" value={rarity} onChange={e => setRarity(e.target.value as Rarity)} style={{ color }}>
              {(["white","blue","purple","gold"] as Rarity[]).map(r =>
                <option key={r} value={r} style={{ color: "black" }}>{t(`rarities.${r}`)}</option>)}
            </select>
          </Field>
          <Field label={t("boosters.name")}>
            <input className="dm-input" value={name} onChange={e => setName(e.target.value)} />
          </Field>
        </div>
      </SectionFrame>

      {/* Uso en juego */}
      <SectionFrame icon="⚔️" title={t("boosters.inGameUse")} color={color}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("boosters.castMode")}>
            <select className="dm-input" value={modo} onChange={e => setModo(e.target.value)}>
              <option value="">{t("boosters.chooseOption")}</option>
              {["[Punto]", "[Entorno]", "[Cono]", "[Línea]", "[Área]", "[Toque]", "[Personal]"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label={t("boosters.distance")}>
            <input className="dm-input" value={dist} onChange={e => setDist(e.target.value)} placeholder={t("boosters.distancePh")} />
          </Field>
          <Field label={t("boosters.targetsApply")}>
            <input className="dm-input" value={obj} onChange={e => setObj(e.target.value)} placeholder={t("boosters.targetsPh")} />
          </Field>
          <Field label={t("boosters.diceToRoll")}>
            <div className="flex items-center gap-2">
              <input className="dm-input flex-1" value={dados} onChange={e => setDados(e.target.value)} placeholder={t("boosters.dicePh")} />
              <RarityBonusChip rarity={rarity} />
            </div>
          </Field>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-base" style={{ color: "var(--gold)" }}>🧪</span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">{t("boosters.uses")}</span>
          <label className="flex items-center gap-1 text-xs">{t("boosters.current")}
            <input type="number" min={0} value={uses} onChange={e => setUses(+e.target.value)} className="dm-input w-16 text-center" />
          </label>
          <label className="flex items-center gap-1 text-xs">{t("boosters.max")}
            <input type="number" min={1} value={maxUses} onChange={e => setMaxUses(+e.target.value)} className="dm-input w-16 text-center" />
          </label>
        </div>
      </SectionFrame>

      {/* Efecto */}
      <SectionFrame icon="✦" title={t("boosters.effectTitle")} color={color}>
        <div className="flex gap-2 items-start">
          <span className="text-base mt-1" style={{ color: "var(--gold)" }}>✒️</span>
          <textarea className="dm-input flex-1 min-h-20" rows={3} value={efecto} onChange={e => setEfecto(e.target.value)} />
        </div>
      </SectionFrame>

      {/* Gestión / Acciones */}
      <SectionFrame icon="📦" title={t("boosters.management")} color={color}>
        {booster && dm && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-fantasy" onClick={() => setShowTransferPick(true)}>{t("boosters.transfer")}</button>
            <button className="btn-fantasy" onClick={reclaim}>{t("boosters.reclaim")}</button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose}>{t("boosters.cancel")}</button>
          <button className="btn-fantasy"
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={save}>{t("boosters.saveChanges")}</button>
        </div>
      </SectionFrame>

      <button className="text-sm text-muted-foreground underline w-full" onClick={onClose}>{t("boosters.close")}</button>

      {showTransferPick && (
        <TransferPickModal
          players={players || []}
          onClose={() => setShowTransferPick(false)}
          onDistribute={(ids) => { setShowTransferPick(false); distributeCopies(ids); }}
          onSendToVault={() => { setShowTransferPick(false); moveToVault(); }}
        />
      )}


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

function TransferPickModal({
  players, onClose, onDistribute, onSendToVault,
}: {
  players: Character[];
  onClose: () => void;
  onDistribute: (ids: string[]) => void;
  onSendToVault: () => void;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return (
    <div className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card bg-card max-w-sm w-full p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <p className="text-xs uppercase tracking-widest text-muted-foreground text-center">{t("boosters.distributeCopies")}</p>
        <p className="text-[11px] text-muted-foreground text-center">{t("boosters.distributeHint")}</p>
        {players.length === 0 && <p className="text-center text-xs text-muted-foreground py-3">—</p>}
        <div className="space-y-1.5">
          {players.map(p => {
            const checked = selected.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-3 ornate-card px-3 py-2 text-left"
                style={{ borderColor: checked ? p.color : undefined, background: checked ? `color-mix(in oklab, ${p.color} 14%, transparent)` : undefined }}>
                <span className="w-5 h-5 rounded border flex items-center justify-center text-[12px] font-bold"
                  style={{ borderColor: p.color, color: p.color, background: checked ? p.color : "transparent" }}>
                  {checked ? <span style={{ color: "white" }}>✓</span> : null}
                </span>
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 truncate" style={{ color: p.color }}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <button className="btn-fantasy w-full"
          style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
          disabled={selected.size === 0}
          onClick={() => onDistribute(Array.from(selected))}>
          {t("boosters.distributeConfirm")} ({selected.size})
        </button>
        <button className="btn-fantasy w-full text-left" onClick={onSendToVault}>
          {t("boosters.movedToVault")}
        </button>
        <button className="text-xs text-muted-foreground underline w-full pt-1" onClick={onClose}>{t("boosters.cancel")}</button>
      </div>
    </div>
  );
}

/* ───────────────── Player / Spectator action sheet ───────────────── */

export function BoosterActions({
  booster, character, campaignId, players, dm, readOnly, hideDiscard, onClose, onEdit,
}: {
  booster: Booster;
  character?: Character | null;
  campaignId: string;
  players: Character[];
  dm?: { id: string; name: string; color: string } | null;
  readOnly?: boolean;
  hideDiscard?: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {

  const [confirmUse, setConfirmUse] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [members, setMembers] = useState<Character[]>(players);
  const isDM = !!dm;
  const color = RARITY_COLOR[booster.rarity as Rarity];
  const { t } = useT();

  // Live list of campaign members (online/offline) when the transfer popover opens.
  useEffect(() => {
    if (!showTransfer) return;
    let live = true;
    async function load() {
      const { data: chars } = await supabase
        .from("characters").select("*").eq("campaign_id", campaignId);
      if (!live) return;
      setMembers(((chars || []) as Character[]).filter(c => c.role === "player" && c.id !== character?.id));
    }
    load();
    const ch = (supabase as any).channel(`bx:members:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${campaignId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_members", filter: `campaign_id=eq.${campaignId}` }, load)
      .subscribe();
    return () => { live = false; (supabase as any).removeChannel(ch); };
  }, [showTransfer, campaignId, character?.id]);

  async function pushBoosterLog(actor: Character, verb: string, trailing?: string) {
    const { pushLog } = await import("@/lib/log");
    const segs: any[] = [
      { t: "char", v: actor.name, color: actor.color, id: actor.id },
      { t: "text", v: verb },
      { t: "item", v: booster.name, rarity: booster.rarity as Rarity, id: booster.id, kind: "booster" },
    ];
    if (trailing) segs.push({ t: "text", v: trailing });
    await pushLog(campaignId, segs);
  }

  async function useBooster() {
    if (!character) return;
    const remaining = booster.uses - 1;
    if (remaining <= 0) {
      // Final use: remove this copy from the player's vault.
      await (supabase as any).from("boosters").delete().eq("id", booster.id);
      await pushBoosterLog(character, t("boosters.usedBoosterLog"), t("boosters.lastSuffix"));
    } else {
      await (supabase as any).from("boosters").update({ uses: remaining }).eq("id", booster.id);
      await pushBoosterLog(character, t("boosters.usedBoosterLog"), t("boosters.remainingSuffix", { n: remaining }));
    }
    onClose();
  }

  async function transferTo(targetId: string) {
    if (!character) return;
    await (supabase as any).from("boosters").update({
      owner_character_id: targetId, in_dm_vault: false,
    }).eq("id", booster.id);
    const target = members.find(p => p.id === targetId);
    await pushBoosterLog(character, t("boosters.yieldedLog", { name: target?.name ?? "?" }));
    toastSaved();
    onClose();
  }

  async function showInChat() {
    if (!character) return;
    await pushBoosterLog(character, t("boosters.showedLog"));
    toastSaved();
    onClose();
  }

  async function discardToVault() {
    if (!character) return;
    if (!confirm(t("boosters.discardConfirm"))) return;
    await (supabase as any).from("boosters").update({
      owner_character_id: null, in_dm_vault: true,
    }).eq("id", booster.id);
    await pushBoosterLog(character, t("boosters.discardedLog"));
    toastSaved();
    onClose();
  }

  if (isDM && onEdit) { onEdit(); return null; }

  return (
    <ModalShell onClose={onClose} color={color}>
      <FancyHeader title={t("boosters.boosterLabel")} name={booster.name} color={color} />
      <MetaChips extId={booster.external_id} tipo={booster.tipo} rarity={booster.rarity as Rarity} />
      <BoosterDetails b={booster} />

      {(() => {
        const isOwner = !!character && booster.owner_character_id === character.id;
        if (readOnly || !character || !isOwner) return null;
        return (
          <div className="space-y-2">
            {confirmUse ? (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-fantasy" onClick={() => setConfirmUse(false)}>{t("boosters.cancelPlain")}</button>
                <button className="btn-fantasy"
                  style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                  onClick={useBooster}>{t("boosters.confirmUse")}</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-fantasy" disabled={booster.uses <= 0}
                  onClick={() => setConfirmUse(true)}>{t("boosters.use")}</button>
                <button className="btn-fantasy" onClick={() => setShowTransfer(true)}>{t("boosters.transfer")}</button>
                <button className="btn-fantasy flex items-center justify-center gap-2" onClick={showInChat}>
                  <MessageSquare size={14} />
                  <span className="truncate">{t("boosters.showInChat")}</span>
                </button>
                {!hideDiscard && (
                  <button className="btn-fantasy flex items-center justify-center"
                    style={{ background: "color-mix(in oklab, var(--loss) 30%, transparent)", borderColor: "var(--loss)" }}
                    onClick={discardToVault} title={t("boosters.discardTitle")} aria-label={t("boosters.discardTitle")}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
            {showTransfer && (
              <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-3" onClick={() => setShowTransfer(false)}>
                <div className="ornate-card p-4 max-w-sm w-full max-h-[80vh] overflow-y-auto space-y-2" onClick={e => e.stopPropagation()}>
                  <h3 className="font-display text-center text-base text-[var(--gold)]">{t("boosters.pickRecipient")}</h3>
                  {members.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground py-4">—</p>
                  )}
                  <div className="grid grid-cols-1 gap-1.5">
                    {members.map(p => (
                      <button key={p.id} className="btn-fantasy flex items-center gap-2 justify-start"
                        onClick={() => transferTo(p.id)}>
                        <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                  <button className="text-xs text-muted-foreground underline w-full" onClick={() => setShowTransfer(false)}>{t("common.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <button className="text-sm text-muted-foreground underline w-full" onClick={onClose}>{t("boosters.close")}</button>
    </ModalShell>
  );
}

/* ─────────── BoosterPeek: open a booster by id (from log click) ─────────── */


export function BoosterPeek({
  boosterId, character, campaignId, players, hideDiscard, onClose,
}: {
  boosterId: string;
  character?: Character | null;
  campaignId: string;
  players?: Character[];
  hideDiscard?: boolean;
  onClose: () => void;
}) {
  const [b, setB] = useState<Booster | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await (supabase as any).from("boosters").select("*").eq("id", boosterId).maybeSingle();
      if (!live) return;
      if (!data) setMissing(true);
      else setB(data as Booster);
    })();
    return () => { live = false; };
  }, [boosterId]);
  if (missing) { onClose(); return null; }
  if (!b) return null;
  return (
    <BoosterActions
      booster={b}
      character={character ?? null}
      campaignId={campaignId}
      players={players || []}
      hideDiscard={hideDiscard}
      onClose={onClose}
    />
  );
}

