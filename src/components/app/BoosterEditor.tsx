import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RARITY_COLOR, RARITY_LABEL, type Rarity, type Character } from "@/lib/game";
import { toastSaved } from "@/lib/saved";
import { toast } from "sonner";
import type { Booster } from "./BoosterCard";

/** DM-only modal: edit existing booster (name, rarity, uses, max_uses) or create. */
export function BoosterEditor({
  booster, campaignId, onClose, onSaved,
}: {
  booster: Booster | null;
  campaignId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [name, setName] = useState(booster?.name || "");
  const [rarity, setRarity] = useState<Rarity>((booster?.rarity as Rarity) || "white");
  const [uses, setUses] = useState(booster?.uses ?? 1);
  const [maxUses, setMaxUses] = useState(booster?.max_uses ?? 1);

  async function save() {
    if (!name.trim()) return toast.error("Pon un nombre");
    if (booster) {
      const { error } = await (supabase as any).from("boosters")
        .update({ name: name.trim(), rarity, uses: Math.max(0, uses), max_uses: Math.max(0, maxUses) })
        .eq("id", booster.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await (supabase as any).from("boosters").insert({
        campaign_id: campaignId, name: name.trim(), rarity,
        uses: Math.max(0, uses), max_uses: Math.max(0, maxUses),
        in_dm_vault: true, owner_character_id: null,
      });
      if (error) return toast.error(error.message);
    }
    toastSaved();
    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center">{booster ? "Editar potenciador" : "Nuevo potenciador"}</h3>
        <input className="w-full bg-input border border-border rounded px-3 py-2 text-sm" placeholder="Nombre"
          value={name} onChange={e => setName(e.target.value)} />
        <select className="w-full bg-input border border-border rounded px-2 py-2 text-sm"
          value={rarity} onChange={e => setRarity(e.target.value as Rarity)}
          style={{ color: RARITY_COLOR[rarity] }}>
          {(["white","blue","purple","gold"] as Rarity[]).map(r =>
            <option key={r} value={r} style={{ color: "black" }}>{RARITY_LABEL[r]}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between text-xs">Usos
            <input type="number" min={0} value={uses} onChange={e => setUses(+e.target.value)}
              className="w-16 bg-input border border-border rounded px-2 py-1 text-right" />
          </label>
          <label className="flex items-center justify-between text-xs">Máx.
            <input type="number" min={0} value={maxUses} onChange={e => setMaxUses(+e.target.value)}
              className="w-16 bg-input border border-border rounded px-2 py-1 text-right" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose}>Cancelar</button>
          <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

/** Action sheet for a booster — used by player (Use only) and DM (full controls). */
export function BoosterActions({
  booster, character, campaignId, players, dm, onClose, onEdit,
}: {
  booster: Booster;
  character?: Character | null;          // owner (player view)
  campaignId: string;
  players: Character[];
  dm?: { id: string; name: string; color: string } | null;  // DM controls when set
  onClose: () => void;
  onEdit?: () => void;
}) {
  const [confirmUse, setConfirmUse] = useState(false);
  const [transferTo, setTransferTo] = useState("");
  const isDM = !!dm;
  const color = RARITY_COLOR[booster.rarity as Rarity];

  async function pushBoosterLog(actor: Character, verb: string) {
    const { pushLog } = await import("@/lib/log");
    await pushLog(campaignId, [
      { t: "char", v: actor.name, color: actor.color, id: actor.id },
      { t: "text", v: verb },
      { t: "item", v: booster.name, rarity: booster.rarity as Rarity },
    ]);
  }

  async function useBooster() {
    if (!character) return;
    const remaining = booster.uses - 1;
    if (remaining <= 0) {
      await (supabase as any).from("boosters").delete().eq("id", booster.id);
    } else {
      await (supabase as any).from("boosters").update({ uses: remaining }).eq("id", booster.id);
    }
    await pushBoosterLog(character, "usó el potenciador");
    onClose();
  }

  async function transfer() {
    if (!transferTo) return;
    const goVault = transferTo === "__vault__";
    await (supabase as any).from("boosters").update({
      owner_character_id: goVault ? null : transferTo,
      in_dm_vault: goVault,
    }).eq("id", booster.id);
    if (dm) {
      const target = players.find(p => p.id === transferTo);
      const { pushLog } = await import("@/lib/log");
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: goVault ? "guardó en el Vault" : "entregó" },
        { t: "item", v: booster.name, rarity: booster.rarity as Rarity },
        ...(target ? [{ t: "text", v: "a" } as const, { t: "char", v: target.name, color: target.color, id: target.id } as const] : []),
      ] as any);
    }
    toastSaved();
    onClose();
  }

  async function destroy() {
    if (!confirm("¿Destruir este potenciador?")) return;
    await (supabase as any).from("boosters").delete().eq("id", booster.id);
    if (dm) {
      const { pushLog } = await import("@/lib/log");
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: "destruyó el potenciador" },
        { t: "item", v: booster.name, rarity: booster.rarity as Rarity },
      ]);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-[65] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest" style={{ color }}>{RARITY_LABEL[booster.rarity as Rarity]}</p>
          <h3 className="font-display text-lg" style={{ color }}>🃏 {booster.name}</h3>
          <p className="text-xs text-muted-foreground">{booster.uses}/{booster.max_uses} usos</p>
        </div>

        {!isDM && character && (
          <>
            {!confirmUse ? (
              <button className="btn-fantasy w-full"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                disabled={booster.uses <= 0}
                onClick={() => setConfirmUse(true)}>
                Usar
              </button>
            ) : (
              <div className="space-y-2 text-center bg-secondary/40 p-3 rounded">
                <p className="text-sm">¿Estás seguro que quieres usar este potenciador?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-fantasy" onClick={() => setConfirmUse(false)}>No</button>
                  <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={useBooster}>Sí, usar</button>
                </div>
              </div>
            )}
          </>
        )}

        {isDM && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy" onClick={onEdit}>✏️ Editar</button>
              <button className="btn-fantasy" onClick={destroy}>💥 Destruir</button>
            </div>
            <div className="gem-divider" />
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Transferir a:</p>
            <select value={transferTo} onChange={e => setTransferTo(e.target.value)}
              className="w-full bg-input border border-border rounded px-2 py-2 text-sm">
              <option value="">— elegir —</option>
              <option value="__vault__">🏛️ Vault del DM</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-fantasy w-full" disabled={!transferTo} onClick={transfer}>Transferir</button>
          </>
        )}

        <button className="text-xs text-muted-foreground underline w-full" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
