import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import { toastSaved } from "@/lib/saved";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import type { Character } from "@/lib/game";
import { useT } from "@/lib/i18n";

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

function slugifyLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getCatalogLabel(row: Pick<CatalogRow, "key" | "label">, t: (path: string, vars?: Record<string, string | number>) => string) {
  const lookup = row.key || slugifyLabel(row.label);
  const translated = t(`conditionNames.${lookup}`);
  return translated === `conditionNames.${lookup}` ? row.label : translated;
}

export function ConditionsPanel({
  character,
  campaignId,
  canEdit = true,
  viewerIsDm = true,
}: {
  character: Character;
  campaignId: string;
  canEdit?: boolean;
  /** When false, "remove" creates a DM approval request instead of deleting. */
  viewerIsDm?: boolean;
}) {
  const [rows, setRows] = useState<ConditionRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [adding, setAdding] = useState(false);
  const { t } = useT();

  const catalogById = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);

  function getRowLabel(row: ConditionRow) {
    const fromCatalog = row.catalog_id ? catalogById.get(row.catalog_id) : null;
    return fromCatalog ? getCatalogLabel(fromCatalog, t) : row.label;
  }

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

  useEffect(() => { reload(); loadCatalog(); /* eslint-disable-next-line */ }, [character.id, campaignId]);

  useEffect(() => {
    const ch = (supabase as any).channel(`cond:${character.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions", filter: `character_id=eq.${character.id}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [character.id]);

  async function tick(c: ConditionRow) {
    const infinite = c.turns_left === 0;
    const next = infinite ? 0 : c.turns_left - 1;
    const label = getRowLabel(c);
    if (c.damage_per_turn > 0) {
      const newHp = Math.max(0, character.current_hp - c.damage_per_turn);
      const prev = { current_hp: character.current_hp, hp_damage_taken: (character as any).hp_damage_taken };
      const { totals } = await import("@/lib/game");
      const { data: equipped } = await supabase.from("items").select("*").eq("owner_character_id", character.id).eq("equipped", true);
      const maxHp = totals(character as any, (equipped || []) as any).maxHp;
      const { applyHpDelta } = await import("@/lib/hp");
      await applyHpDelta(character.id, newHp, maxHp);
      await pushLog(campaignId, [
        { t: "char", v: character.name, color: character.color, id: character.id },
        { t: "text", v: t("conditions.suffersLog", { icon: c.icon, label }) },
        { t: "loss", v: `-${c.damage_per_turn}` },
        { t: "text", v: `(${newHp})` },
      ], { kind: "character.update", id: character.id, prev });
    }
    if (!infinite && next <= 0) {
      await (supabase as any).from("character_conditions").delete().eq("id", c.id);
      await pushLog(campaignId, [
        { t: "char", v: character.name, color: character.color, id: character.id },
        { t: "text", v: t("conditions.noLonger", { icon: c.icon, label }) },
      ]);
    } else if (!infinite) {
      await (supabase as any).from("character_conditions").update({ turns_left: next }).eq("id", c.id);
    }
    reload();
  }

  async function removeCondition(c: ConditionRow) {
    if (viewerIsDm) {
      await (supabase as any).from("character_conditions").delete().eq("id", c.id);
      reload();
      return;
    }
    const label = getRowLabel(c);
    const { error } = await (supabase as any).from("effect_remove_requests").insert({
      campaign_id: campaignId,
      character_id: character.id,
      condition_id: c.id,
      player_name: character.name,
      effect_label: label,
      effect_icon: c.icon,
      status: "pending",
    });
    if (error) toast.error(error.message);
    else toast.success(t("turnControl.removeRequested"));
  }

  return (
    <div className="ornate-card p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-xs uppercase tracking-widest text-[var(--gold)]">{t("conditions.title")}</h2>
        {canEdit && (
          <button className="text-[10px] text-[var(--gold)] underline inline-flex items-center gap-1"
            onClick={() => setAdding(true)}>
            <Plus size={11} /> {t("conditions.apply")}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {rows.length === 0 && <p className="text-[10px] text-muted-foreground">{t("conditions.none")}</p>}
        {rows.map(c => (
          <div key={c.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1.5">
            <span className="text-base">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display truncate">{getRowLabel(c)}</p>
              {c.damage_per_turn > 0 && (
                <p className="text-[9px] text-[var(--loss)]">{t("conditions.perTurn", { n: c.damage_per_turn })}</p>
              )}
            </div>
            {canEdit && (
              <button onClick={() => removeCondition(c)}
                className="text-muted-foreground hover:text-[var(--loss)]" aria-label={t("conditions.remove")}>
                <X size={12} />
              </button>
            )}
            <button onClick={() => tick(c)}
              className="text-[10px] px-2 py-1 rounded bg-[var(--gold)] text-black font-display min-w-[2.5rem]"
              title={t("conditions.apply")}>
              {c.turns_left === 0 ? "∞" : `${c.turns_left}t`}
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
  const [mode, setMode] = useState<"self" | "enemy">("self");
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [enemies, setEnemies] = useState<Array<{ id: string; name: string; icon: string | null; color: string | null }>>([]);
  const [selectedEnemies, setSelectedEnemies] = useState<Set<string>>(new Set());
  const { t } = useT();

  const picked = catalog.find(c => c.id === pickId);
  useEffect(() => {
    if (!pickId && catalog[0]) setPickId(catalog[0].id);
  }, [catalog, pickId]);
  useEffect(() => { if (picked) setDamage(picked.damage_default); }, [pickId, picked]);

  // Find an active combat for this campaign where this character is a participant.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: encs } = await (supabase as any)
        .from("combat_encounters")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1);
      const enc = (encs || [])[0];
      if (!enc) {
        if (!cancelled) { setActiveEncounterId(null); setEnemies([]); }
        return;
      }
      // Confirm this character is a participant in that encounter.
      const { data: me } = await (supabase as any)
        .from("combat_participants")
        .select("id")
        .eq("encounter_id", enc.id)
        .eq("character_id", characterId)
        .maybeSingle();
      if (!me) {
        if (!cancelled) { setActiveEncounterId(null); setEnemies([]); }
        return;
      }
      const { data: ps } = await (supabase as any)
        .from("combat_participants")
        .select("id, display_name, enemy_icon, enemy_color, participant_type, is_defeated")
        .eq("encounter_id", enc.id)
        .neq("participant_type", "player")
        .eq("is_defeated", false)
        .order("order_index", { ascending: true });
      if (!cancelled) {
        setActiveEncounterId(enc.id);
        setEnemies((ps || []).map((p: any) => ({
          id: p.id, name: p.display_name, icon: p.enemy_icon, color: p.enemy_color,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId, characterId]);

  function toggleEnemy(id: string) {
    const n = new Set(selectedEnemies);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelectedEnemies(n);
  }

  async function apply() {
    if (!picked) return toast.error(t("conditions.pickEffect"));
    if (turns < 0) return toast.error(t("conditions.minTurns"));
    const label = getCatalogLabel(picked, t);

    if (mode === "enemy") {
      if (!activeEncounterId) return toast.error(t("conditions.noActiveCombat"));
      if (selectedEnemies.size === 0) return toast.error(t("conditions.pickEnemy"));
      const rows = Array.from(selectedEnemies).map(pid => ({
        encounter_id: activeEncounterId,
        campaign_id: campaignId,
        target_enemy_participant_id: pid,
        target_character_id: null,
        source_character_id: characterId,
        effect_type: picked.is_damage ? "debuff" : "note",
        value: picked.is_damage ? Math.max(0, damage) : 0,
        label: `${picked.icon} ${label}`,
        duration_rounds: turns,
      }));
      const { error } = await (supabase as any).from("combat_temporary_effects").insert(rows);
      if (error) return toast.error(error.message);
      // Look up character + each enemy name for the log.
      const { data: ch } = await supabase.from("characters").select("name, color").eq("id", characterId).maybeSingle();
      for (const pid of selectedEnemies) {
        const target = enemies.find(e => e.id === pid);
        if (!target) continue;
        await pushLog(campaignId, [
          { t: "char", v: (ch as any)?.name || "", color: (ch as any)?.color || null, id: characterId },
          { t: "text", v: " " + t("conditions.appliedToEnemyLog", { icon: picked.icon, label, target: target.name, turns }) },
        ]);
      }
      toastSaved(t("conditions.appliedToEnemyToast"));
      onApplied?.();
      onClose();
      return;
    }

    await (supabase as any).from("character_conditions").insert({
      character_id: characterId,
      catalog_id: picked.id,
      label,
      icon: picked.icon,
      turns_left: turns,
      damage_per_turn: picked.is_damage ? Math.max(0, damage) : 0,
    });
    const extra = picked.is_damage && damage > 0 ? `, -${damage}/t` : "";
    await pushLog(campaignId, [
      { t: "text", v: t("conditions.appliedLog", { icon: picked.icon, label, turns, extra }) },
    ]);
    toastSaved(t("conditions.appliedToast"));
    onApplied?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center">{t("conditions.modalTitle")}</h3>

        {activeEncounterId && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("conditions.applyToHeading")}</p>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => setMode("self")}
                className={`text-[11px] py-1.5 rounded font-display ${mode === "self" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
                {t("conditions.applyToSelfAlly")}
              </button>
              <button type="button" onClick={() => setMode("enemy")}
                className={`text-[11px] py-1.5 rounded font-display ${mode === "enemy" ? "bg-[var(--loss)] text-black" : "bg-card border border-border"}`}>
                {t("conditions.applyToEnemy")}
              </button>
            </div>
          </div>
        )}

        <select value={pickId} onChange={e => setPickId(e.target.value)}
          className="w-full bg-input border border-border rounded px-2 py-2 text-sm">
          {catalog.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {getCatalogLabel(c, t)}{c.is_damage ? " 🩸" : ""}</option>
          ))}
        </select>
        <label className="flex items-center justify-between text-sm">{t("conditions.turns")}
          <input type="number" min={0} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
            value={turns} onChange={e => setTurns(Math.max(0, +e.target.value))}
            title={t("turnControl.infinite")} placeholder="∞" />
        </label>
        {picked?.is_damage && (
          <label className="flex items-center justify-between text-sm">{t("conditions.damagePerTurn")}
            <input type="number" min={0} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
              value={damage} onChange={e => setDamage(Math.max(0, +e.target.value))} />
          </label>
        )}

        {mode === "enemy" && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("conditions.pickEnemy")}</p>
            {enemies.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">{t("conditions.noEnemiesCombat")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {enemies.map(e => {
                  const on = selectedEnemies.has(e.id);
                  return (
                    <button key={e.id} type="button"
                      onClick={() => toggleEnemy(e.id)}
                      className="px-2 py-1 rounded border text-[11px]"
                      style={{
                        borderColor: on ? "var(--loss)" : "var(--border)",
                        background: on ? "color-mix(in oklab, var(--loss) 20%, transparent)" : "transparent",
                        color: e.color || "var(--loss)",
                      }}>
                      {e.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn-fantasy" style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={apply}>{t("conditions.apply")}</button>
        </div>
      </div>
    </div>
  );
}

export function DMConditionsCreator({
  campaignId, players,
}: {
  campaignId: string;
  players: Character[];
}) {
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [tab, setTab] = useState<"apply" | "new" | "manage">("apply");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("✨");
  const [isDamage, setIsDamage] = useState(false);
  const [damageDefault, setDamageDefault] = useState(0);
  const [pickId, setPickId] = useState("");
  const [turns, setTurns] = useState(3);
  const [damage, setDamage] = useState(0);
  const [targets, setTargets] = useState<string[]>([]);
  const { t } = useT();

  async function loadCat() {
    const { data } = await (supabase as any).from("condition_effects_catalog")
      .select("*").or(`campaign_id.is.null,campaign_id.eq.${campaignId}`).order("label");
    const c = (data || []) as CatalogRow[];
    setCatalog(c);
    if (!pickId && c[0]) setPickId(c[0].id);
  }
  useEffect(() => { loadCat(); /* eslint-disable-next-line */ }, [campaignId]);

  const picked = catalog.find(c => c.id === pickId);
  useEffect(() => { if (picked) setDamage(picked.damage_default); }, [pickId, picked]);

  async function createEffect() {
    if (!label.trim()) return toast.error(t("conditions.putName"));
    const { error } = await (supabase as any).from("condition_effects_catalog").insert({
      campaign_id: campaignId,
      key: slugifyLabel(label),
      label: label.trim(),
      icon: icon || "✨",
      is_damage: isDamage,
      damage_default: isDamage ? Math.max(0, damageDefault) : 0,
    });
    if (error) return toast.error(error.message);
    toastSaved(t("conditions.createdToast"));
    setLabel(""); setIcon("✨"); setIsDamage(false); setDamageDefault(0);
    loadCat();
  }

  async function applyToTargets() {
    if (!picked) return toast.error(t("conditions.pickEffect"));
    if (!targets.length) return toast.error(t("conditions.pickAtLeastOne"));
    const localizedLabel = getCatalogLabel(picked, t);
    const rows = targets.map(charId => ({
      character_id: charId,
      catalog_id: picked.id,
      label: localizedLabel,
      icon: picked.icon,
      turns_left: Math.max(0, turns),
      damage_per_turn: picked.is_damage ? Math.max(0, damage) : 0,
    }));
    const { error } = await (supabase as any).from("character_conditions").insert(rows);
    if (error) return toast.error(error.message);
    for (const id of targets) {
      const ch = players.find(p => p.id === id);
      if (ch) {
        const extra = picked.is_damage && damage > 0 ? `, -${damage}/t` : "";
        await pushLog(campaignId, [
          { t: "char", v: ch.name, color: ch.color, id: ch.id },
          { t: "text", v: t("conditions.receivesLog", { icon: picked.icon, label: localizedLabel, turns, extra }) },
        ]);
      }
    }
    toastSaved(t("conditions.appliedMulti"));
    setTargets([]);
  }

  function toggleTarget(id: string) {
    setTargets(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);
  }

  return (
    <div className="ornate-card p-4 space-y-3">
      <div className="grid grid-cols-3 gap-1">
        <button onClick={() => setTab("apply")}
          className={`text-[10px] py-1.5 rounded font-display ${tab === "apply" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
          {t("conditions.creatorApply")}
        </button>
        <button onClick={() => setTab("new")}
          className={`text-[10px] py-1.5 rounded font-display ${tab === "new" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
          {t("conditions.creatorCreate")}
        </button>
        <button onClick={() => setTab("manage")}
          className={`text-[10px] py-1.5 rounded font-display ${tab === "manage" ? "bg-[var(--gold)] text-black" : "bg-card border border-border"}`}>
          {t("conditions.creatorManage")}
        </button>
      </div>

      {tab === "apply" && (
        <>
          <select value={pickId} onChange={e => setPickId(e.target.value)}
            className="w-full bg-input border border-border rounded px-2 py-2 text-sm">
            {catalog.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {getCatalogLabel(c, t)}{c.is_damage ? " 🩸" : ""}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between text-sm">{t("conditions.turns")}
              <input type="number" min={0} className="w-16 bg-input border border-border rounded px-2 py-1 text-right"
                value={turns} onChange={e => setTurns(Math.max(0, +e.target.value))}
                title={t("turnControl.infinite")} placeholder="∞" />
            </label>
            {picked?.is_damage && (
              <label className="flex items-center justify-between text-sm">{t("conditions.damagePerTurn")}
                <input type="number" min={0} className="w-16 bg-input border border-border rounded px-2 py-1 text-right"
                  value={damage} onChange={e => setDamage(Math.max(0, +e.target.value))} />
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">{t("conditions.applyTo")}</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {players.map(p => (
              <label key={p.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1 text-xs">
                <input type="checkbox" checked={targets.includes(p.id)} onChange={() => toggleTarget(p.id)} />
                <span style={{ color: p.color }} className="font-display">{p.name}</span>
              </label>
            ))}
            {!players.length && <p className="text-xs text-muted-foreground">{t("conditions.noPlayers")}</p>}
          </div>
          <button className="btn-fantasy w-full" disabled={!targets.length}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={applyToTargets}>{t("conditions.apply")}</button>
        </>
      )}

      {tab === "new" && (
        <>
          <div className="flex gap-2">
            <input className="w-16 bg-input border border-border rounded px-2 py-2 text-center text-lg"
              value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} />
            <input className="flex-1 bg-input border border-border rounded px-3 py-2 text-sm"
              placeholder={t("conditions.effectName")} value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <label className="flex items-center justify-between text-sm">
            <span>{t("conditions.reduceHpQ")}</span>
            <input type="checkbox" checked={isDamage} onChange={e => setIsDamage(e.target.checked)} />
          </label>
          {isDamage && (
            <label className="flex items-center justify-between text-sm">{t("conditions.damageDefault")}
              <input type="number" min={0} className="w-20 bg-input border border-border rounded px-2 py-1 text-right"
                value={damageDefault} onChange={e => setDamageDefault(Math.max(0, +e.target.value))} />
            </label>
          )}
          <button className="btn-fantasy w-full" onClick={createEffect}>{t("conditions.createBtn")}</button>
        </>
      )}

      {tab === "manage" && (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {catalog.length === 0 && <p className="text-xs text-muted-foreground">{t("conditions.noEffects")}</p>}
          {catalog.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-secondary/40 rounded px-2 py-1.5 text-xs">
              <span>{c.icon}</span>
              <span className="flex-1 truncate">{getCatalogLabel(c, t)}{c.is_damage ? ` 🩸${c.damage_default}` : ""}</span>
              {c.campaign_id ? (
                <button className="text-[10px] text-[var(--loss)] underline"
                  onClick={async () => {
                    if (!confirm(t("conditions.deleteConfirm", { label: getCatalogLabel(c, t) }))) return;
                    const { error } = await (supabase as any).from("condition_effects_catalog").delete().eq("id", c.id);
                    if (error) toast.error(error.message);
                    else { toastSaved(t("conditions.deletedToast")); loadCat(); }
                  }}>{t("conditions.deleteEffect")}</button>
              ) : <span className="text-[9px] text-muted-foreground">{t("conditions.global")}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
