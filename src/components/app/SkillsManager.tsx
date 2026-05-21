import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { pushLog } from "@/lib/log";
import { type Character, RARITY_COLOR, type Rarity } from "@/lib/game";
import { RarityBadge } from "./RarityBadge";
import { SkillDetailModal } from "./SkillDetailModal";
import type { CharacterSkill } from "./SkillCard";
import { SKILL_RARITY_COST, skillNameKey, parseSkillFile } from "@/lib/skillImport";
import {
  Sparkles, Upload, Plus, Trophy, Dices, AlertTriangle,
  ChevronDown, X, Search, Gem, Zap, FileSpreadsheet, Settings2,
} from "lucide-react";
import { SkillIconMedallion, SKILL_ICON_OPTIONS } from "./SkillIconMedallion";

type Props = {
  campaignId: string;
  dm: { id: string; name: string; color: string };
  players: Character[];
  onlineIds: Set<string>;
};

const FREE_UNLOCK_THRESHOLD = 8;

export function SkillsManager({ campaignId, dm, players, onlineIds }: Props) {
  const { t } = useT();
  const [targetId, setTargetId] = useState<string>(players[0]?.id ?? "");
  const [skills, setSkills] = useState<CharacterSkill[]>([]);
  const [sel, setSel] = useState<CharacterSkill | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const target = players.find(p => p.id === targetId) ?? null;

  async function reload() {
    if (!targetId) { setSkills([]); return; }
    const { data } = await (supabase as any).from("character_skills")
      .select("*").eq("character_id", targetId)
      .order("order_index").order("created_at");
    setSkills((data || []) as CharacterSkill[]);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [targetId]);
  useEffect(() => {
    if (!campaignId) return;
    const ch = (supabase as any).channel(`skills:dm:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_skills", filter: `campaign_id=eq.${campaignId}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [campaignId, targetId]);

  useEffect(() => {
    if (!targetId && players[0]?.id) setTargetId(players[0].id);
    // eslint-disable-next-line
  }, [players]);

  const unlocked = skills.filter(s => s.is_unlocked).length;
  const total = skills.length;
  const available = total - unlocked;
  const sp = target ? ((target as any).skill_points ?? 0) : 0;

  return (
    <div className="space-y-4">
      {/* Section header */}
      <header className="text-center px-2">
        <div className="flex items-center justify-center gap-3">
          <span className="text-[var(--gold)]/60 text-lg">❖</span>
          <h2 className="font-display text-3xl rune-glow text-[var(--gold)]">{t("skills.title")}</h2>
          <span className="text-[var(--gold)]/60 text-lg">❖</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("skills.dmIntro")}</p>
      </header>

      {/* Main premium panel */}
      <div
        className="ornate-card p-4 sm:p-5 space-y-4"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--loss) 18%, var(--card)) 0%, var(--card) 100%)",
          borderColor: "var(--gold)",
          boxShadow: "0 0 24px color-mix(in oklab, var(--gold) 16%, transparent), inset 0 0 24px color-mix(in oklab, var(--loss) 12%, transparent)",
        }}
      >
        <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80 flex items-center gap-2">
          <Sparkles size={12} /> {t("skills.selectedCharacter")}
        </p>

        {!target ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            {t("skills.pickPlayer")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 items-center">
            {/* A. Avatar + name + dropdown */}
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="relative group"
                aria-label={t("skills.selectCharacter")}
              >
                <div
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    border: "2px solid var(--gold)",
                    boxShadow: "0 0 0 3px color-mix(in oklab, var(--gold) 18%, transparent), 0 0 18px color-mix(in oklab, var(--gold) 35%, transparent)",
                    background: "color-mix(in oklab, var(--background) 60%, transparent)",
                  }}
                >
                  {(target as any).image_url ? (
                    <img
                      src={(target as any).image_url}
                      alt={target.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-2xl" style={{ color: target.color }}>
                      {target.name.charAt(0)}
                    </span>
                  )}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1 font-display text-lg leading-tight max-w-[10rem] truncate"
                style={{ color: target.color }}
              >
                {target.name}
                <ChevronDown size={14} className="opacity-70" />
              </button>
            </div>

            {/* B. SP + counters */}
            <div className="flex flex-col items-center text-center">
              <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
                {t("skills.spAvailable")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Gem size={22} className="text-[var(--gold)] drop-shadow-[0_0_8px_color-mix(in_oklab,var(--gold)_60%,transparent)]" />
                <span
                  className="font-display text-4xl sm:text-5xl leading-none"
                  style={{
                    color: "var(--gold)",
                    textShadow: "0 0 14px color-mix(in oklab, var(--gold) 55%, transparent)",
                  }}
                >
                  {sp}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3 text-center">
                <Counter label={t("skills.unlockedCount")} value={unlocked} color="var(--gain)" />
                <Counter label={t("skills.availableCount")} value={available} color="var(--gold)" />
                <Counter label={t("skills.totalCount")} value={total} color="oklch(0.95 0.02 80)" />
              </div>
            </div>

            {/* C. Actions */}
            <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
              <PanelAction
                icon={<FileSpreadsheet size={16} />}
                label={t("skills.importExcelShort")}
                onClick={() => setImportOpen(true)}
                accent="oklch(0.65 0.16 145)"
              />
              <PanelAction
                icon={<Zap size={16} />}
                label={t("skills.manageSp")}
                onClick={() => setManageOpen(true)}
                accent="var(--gold)"
              />
            </div>
          </div>
        )}
      </div>

      {/* Skills list for the selected character */}
      {target && (
        <SkillsListPanel
          characterName={target.name}
          skills={skills}
          onPick={setSel}
        />
      )}

      {/* Character picker modal */}
      {pickerOpen && (
        <CharacterPickerModal
          players={players}
          targetId={targetId}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => { setTargetId(id); setPickerOpen(false); }}
        />
      )}

      {/* Import modal */}
      {importOpen && target && (
        <Modal onClose={() => setImportOpen(false)} title={t("skills.importTitle")}>
          <ImportSection
            campaignId={campaignId}
            target={target}
            dm={dm}
            existingCount={skills.filter(s => s.is_unlocked).length}
            onDone={() => { reload(); }}
          />
        </Modal>
      )}

      {/* Manage SP modal (individual + mass) */}
      {manageOpen && (
        <Modal onClose={() => setManageOpen(false)} title={t("skills.manageSp")}>
          <div className="space-y-3">
            {target && <GrantSp campaignId={campaignId} target={target} dm={dm} />}
            <MassGrant campaignId={campaignId} dm={dm} players={players} onlineIds={onlineIds} />
          </div>
        </Modal>
      )}

      {sel && target && (
        <SkillDetailModal skill={sel}
          onClose={() => setSel(null)}
          dmActions={{
            onUnlockFree: async () => {
              await (supabase as any).from("character_skills")
                .update({ is_unlocked: true, unlocked_at: new Date().toISOString() })
                .eq("id", sel.id);
              await pushLog(campaignId, [
                { t: "char", v: dm.name, color: dm.color, id: dm.id },
                { t: "text", v: t("skills.logDmUnlocked") },
                { t: "char", v: target.name, color: target.color, id: target.id },
                { t: "text", v: `: ✨ ${sel.name}` },
              ]);
              setSel(null);
              reload();
            },
            onDelete: async () => {
              if (!confirm(t("skills.deleteConfirm", { name: sel.name }))) return;
              await (supabase as any).from("character_skills").delete().eq("id", sel.id);
              setSel(null);
              reload();
            },
          }} />
      )}
    </div>
  );
}

/* ─────────── Helpers ─────────── */

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground leading-tight">{label}</span>
      <span className="font-display text-xl leading-none mt-0.5" style={{ color }}>{value}</span>
    </div>
  );
}

function PanelAction({ icon, label, onClick, accent }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 sm:flex-initial flex items-center gap-2 px-3 py-2 rounded-md font-display text-xs uppercase tracking-wider transition-transform active:scale-[0.98]"
      style={{
        border: `1.5px solid ${accent}`,
        background: `color-mix(in oklab, ${accent} 12%, transparent)`,
        color: accent,
        boxShadow: `inset 0 0 12px color-mix(in oklab, ${accent} 10%, transparent)`,
        minWidth: 132,
      }}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-left leading-tight">{label}</span>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="ornate-card w-full max-w-md max-h-[88vh] overflow-y-auto p-4"
        style={{ borderColor: "var(--gold)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-[var(--gold)] text-base">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CharacterPickerModal({
  players, targetId, onClose, onPick,
}: { players: Character[]; targetId: string; onClose: () => void; onPick: (id: string) => void }) {
  const { t } = useT();
  return (
    <Modal onClose={onClose} title={t("skills.selectCharacter")}>
      <div className="space-y-1.5">
        {players.map(p => {
          const isSel = p.id === targetId;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition"
              style={{
                border: `1.5px solid ${isSel ? p.color : "var(--border)"}`,
                background: isSel ? `color-mix(in oklab, ${p.color} 18%, transparent)` : "transparent",
              }}
            >
              <div
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                style={{ border: `1.5px solid ${p.color}` }}
              >
                {(p as any).image_url ? (
                  <img src={(p as any).image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-sm" style={{ color: p.color }}>{p.name.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm truncate" style={{ color: p.color }}>{p.name}</p>
                <p className="text-[10px] text-muted-foreground">SP: {(p as any).skill_points ?? 0}</p>
              </div>
            </button>
          );
        })}
        {!players.length && (
          <p className="text-center text-xs text-muted-foreground py-4">{t("skills.pickPlayer")}</p>
        )}
      </div>
    </Modal>
  );
}

function SkillsListPanel({
  characterName, skills, onPick,
}: { characterName: string; skills: CharacterSkill[]; onPick: (s: CharacterSkill) => void }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unlocked" | "available">("all");
  const [rarity, setRarity] = useState<"all" | Rarity>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter(s => {
      if (filter === "unlocked" && !s.is_unlocked) return false;
      if (filter === "available" && s.is_unlocked) return false;
      if (rarity !== "all" && s.rarity !== rarity) return false;
      if (q && !(s.name.toLowerCase().includes(q) || (s.type ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [skills, query, filter, rarity]);

  return (
    <div className="ornate-card p-3 space-y-2.5">
      <p className="font-display text-sm text-[var(--gold)]">
        {t("skills.characterSkills", { character: characterName })}{" "}
        <span className="text-muted-foreground text-xs">({skills.length})</span>
      </p>

      <div className="flex items-center gap-2 bg-input border border-border rounded px-2 py-1.5">
        <Search size={14} className="text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t("skills.searchSkill")}
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {(["all", "unlocked", "available"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="text-[10px] px-2 py-1 rounded border font-display"
            style={{
              borderColor: filter === f ? "var(--gold)" : "var(--border)",
              color: filter === f ? "var(--gold)" : undefined,
              background: filter === f ? "color-mix(in oklab, var(--gold) 12%, transparent)" : "transparent",
            }}
          >
            {t(f === "all" ? "skills.filterAll" : f === "unlocked" ? "skills.filterUnlocked" : "skills.filterAvailable")}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        {(["all", "white", "blue", "purple", "gold"] as const).map(r => (
          <button key={r} onClick={() => setRarity(r)}
            className="text-[10px] px-2 py-1 rounded border font-display"
            style={{
              borderColor: rarity === r ? (r === "all" ? "var(--gold)" : RARITY_COLOR[r as Rarity]) : "var(--border)",
              color: rarity === r ? (r === "all" ? "var(--gold)" : RARITY_COLOR[r as Rarity]) : undefined,
              background: rarity === r
                ? `color-mix(in oklab, ${r === "all" ? "var(--gold)" : RARITY_COLOR[r as Rarity]} 12%, transparent)`
                : "transparent",
            }}
          >
            {r === "all" ? t("skills.filterAllRarities") : t(`rarities.${r}`)}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {!filtered.length && (
          <p className="text-center text-[11px] text-muted-foreground py-4">
            {skills.length ? t("skills.noMatches") : t("skills.charHasNone")}
          </p>
        )}
        {filtered.map(s => (
          <CollapsibleSkillRow key={s.id} s={s} onAdmin={() => onPick(s)} />
        ))}
      </div>
    </div>
  );
}

function CollapsibleSkillRow({ s, onAdmin }: { s: CharacterSkill; onAdmin: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const color = RARITY_COLOR[s.rarity as Rarity];
  return (
    <div className="ornate-card overflow-hidden" style={{ borderColor: color }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 p-2 text-left"
      >
        <SkillIconMedallion type={s.type} rarity={s.rarity as Rarity} iconKey={(s as any).icon_key ?? null} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm leading-tight truncate" style={{ color }}>{s.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {s.is_unlocked ? t("skills.unlockedTag") : `${s.cost} SP`}{s.type ? ` · ${s.type}` : ""}
          </p>
        </div>
        <RarityBadge rarity={s.rarity as Rarity} />
        <ChevronDown size={14} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 text-xs border-t border-border/50">
          {s.effect && (
            <p><span className="text-[var(--gold)]/80">{t("skills.effect")}: </span><span className="text-muted-foreground">{s.effect}</span></p>
          )}
          {s.dice && (
            <p><span className="text-[var(--gold)]/80">{t("skills.dice")}: </span><span className="text-muted-foreground">{s.dice}</span></p>
          )}
          {s.range_targets && (
            <p><span className="text-[var(--gold)]/80">{t("skills.rangeTargets")}: </span><span className="text-muted-foreground">{s.range_targets}</span></p>
          )}
          {s.visual_brief && (
            <p><span className="text-[var(--gold)]/80">{t("skills.visualBrief")}: </span><span className="text-muted-foreground">{s.visual_brief}</span></p>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAdmin(); }}
              className="text-[10px] px-2 py-1 rounded border border-border inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Settings2 size={11} /> {t("skills.adminActions")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────── Sub-components (logic preserved) ─────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80 border-b border-border/60 pb-1">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ImportSection({ campaignId, target, dm, existingCount, onDone }: {
  campaignId: string; target: Character; dm: { id: string; name: string; color: string }; existingCount: number; onDone: () => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function handle(file: File) {
    setBusy(true);
    setProgress({ done: 0, total: 0 });
    try {
      const { rows, warnings, errors } = await parseSkillFile(file);
      if (errors.length) { toast.error(errors[0].message); return; }
      if (!rows.length) { toast.error(t("skills.importEmpty")); return; }

      const { data: existing } = await (supabase as any).from("character_skills")
        .select("name_key, order_index").eq("character_id", target.id);
      const existingKeys = new Set<string>(((existing || []) as any[]).map(r => r.name_key));
      const maxOrder = ((existing || []) as any[]).reduce((m: number, r: any) => Math.max(m, r.order_index ?? 0), 0);

      let unlockedSoFar = existingCount;
      const toInsert: any[] = [];
      let order = maxOrder;
      let skipped = 0;
      for (const r of rows) {
        const key = skillNameKey(r.name);
        if (existingKeys.has(key)) { skipped++; continue; }
        existingKeys.add(key);
        const shouldUnlock = unlockedSoFar < FREE_UNLOCK_THRESHOLD;
        if (shouldUnlock) unlockedSoFar++;
        order++;
        toInsert.push({
          campaign_id: campaignId,
          character_id: target.id,
          name: r.name,
          name_key: key,
          rarity: r.rarity,
          type: r.type,
          effect: r.effect,
          dice: r.dice,
          range_targets: r.range_targets,
          visual_brief: r.visual_brief,
          cost: SKILL_RARITY_COST[r.rarity],
          is_unlocked: shouldUnlock,
          source: "excel",
          order_index: order,
          imported_row_index: r.imported_row_index,
          unlocked_at: shouldUnlock ? new Date().toISOString() : null,
        });
      }

      setProgress({ done: 0, total: toInsert.length });
      let created = 0;
      for (let i = 0; i < toInsert.length; i += 50) {
        const slice = toInsert.slice(i, i + 50);
        const { error } = await (supabase as any).from("character_skills").insert(slice);
        if (error) { toast.error(error.message); break; }
        created += slice.length;
        setProgress({ done: created, total: toInsert.length });
      }

      if (created) {
        await pushLog(campaignId, [
          { t: "char", v: dm.name, color: dm.color, id: dm.id },
          { t: "text", v: t("skills.logImported", { n: created }) },
          { t: "char", v: target.name, color: target.color, id: target.id },
        ]);
      }
      toast.success(t("skills.importDone", { created, skipped }) + (warnings.length ? ` · ${warnings.length} ⚠️` : ""));
      onDone();
    } catch (e: any) {
      toast.error(e?.message || t("skills.importFailed"));
    } finally { setBusy(false); setProgress({ done: 0, total: 0 }); }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-2">
      <p className="text-xs">
        <span className="text-muted-foreground">{t("skills.targetCharacter")}: </span>
        <span className="font-display" style={{ color: target.color }}>{target.name}</span>
      </p>
      <p className="text-[11px] text-muted-foreground flex items-start gap-1">
        <Upload size={12} className="mt-0.5 shrink-0" />
        {t("skills.importHint")}
      </p>
      <input type="file" accept=".xlsx,.xls" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) { handle(f); e.target.value = ""; } }}
        className="text-xs text-muted-foreground w-full file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-secondary file:text-foreground file:text-xs" />
      {busy && (
        <div className="h-2 w-full rounded bg-secondary overflow-hidden border border-border">
          <div className="h-full transition-all duration-150" style={{ width: `${pct}%`, background: "var(--gradient-gold)" }} />
        </div>
      )}
    </div>
  );
}

export function ManualCreate({ campaignId, target, dm, players, onDone }: {
  campaignId: string; target: Character; dm: { id: string; name: string; color: string }; players: Character[]; onDone?: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [rarity, setRarity] = useState<Rarity>("white");
  const [type, setType] = useState("");

  const [effect, setEffect] = useState("");
  const [dice, setDice] = useState("");
  const [range, setRange] = useState("");
  const [targets, setTargets] = useState("");

  const [visualBrief, setVisualBrief] = useState("");
  const [iconKey, setIconKey] = useState<string | null>(null);

  const [mode, setMode] = useState<"unlock" | "acquirable">("unlock");
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set([target.id]));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTargetIds(prev => (prev.size === 0 ? new Set([target.id]) : prev));
    // eslint-disable-next-line
  }, [target.id]);

  const QUICK_TYPES = [
    "typeOpts.healing","typeOpts.groupHealing","typeOpts.offensiveImpact",
    "typeOpts.protection","typeOpts.shieldSupport","typeOpts.cleanseSupport",
    "typeOpts.control","typeOpts.debuff","typeOpts.mobility",
    "typeOpts.terrain","typeOpts.summon","typeOpts.utility","typeOpts.role",
  ];

  const NUMERIC_HINT = /(daño|dano|damage|cura|curaci|heal|escudo|shield|reduc|control|ronda|round|duraci|duration|desventaja|ventaja|advant|disadv)/i;
  const showDiceWarning = !!effect.trim() && !dice.trim() && NUMERIC_HINT.test(effect);

  function toggleTarget(id: string) {
    const next = new Set(targetIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTargetIds(next);
  }

  function buildRangeTargets(): string | null {
    const r = range.trim(); const o = targets.trim();
    if (r && o) return `${r} / ${o}`;
    return r || o || null;
  }

  function reset() {
    setName(""); setEffect(""); setType(""); setDice("");
    setRange(""); setTargets(""); setVisualBrief(""); setIconKey(null);
    setMode("unlock"); setRarity("white");
  }

  async function create() {
    if (!name.trim()) { toast.error(t("skills.namePh")); return; }
    if (targetIds.size === 0) { toast.error(t("skills.needTargets")); return; }
    setSubmitting(true);
    try {
      const key = skillNameKey(name);
      const cost = SKILL_RARITY_COST[rarity];
      const unlock = mode === "unlock";
      const rt = buildRangeTargets();
      const baseFields = {
        name: name.trim(),
        name_key: key,
        rarity,
        type: type.trim() || null,
        effect: effect.trim() || null,
        dice: dice.trim() || null,
        range_targets: rt,
        visual_brief: visualBrief.trim() || null,
        icon_key: iconKey,
        cost,
      };
      const chosen = players.filter(p => targetIds.has(p.id));

      const groups: { unlocked: typeof chosen; acquirable: typeof chosen } =
        { unlocked: [], acquirable: [] };

      for (const ch of chosen) {
        const { data: existing } = await (supabase as any).from("character_skills")
          .select("id, is_unlocked, order_index")
          .eq("character_id", ch.id).eq("name_key", key).maybeSingle();
        if (existing) {
          const patch: any = { ...baseFields };
          if (existing.is_unlocked) {
            delete patch.is_unlocked;
          } else if (unlock) {
            patch.is_unlocked = true;
            patch.unlocked_at = new Date().toISOString();
          }
          await (supabase as any).from("character_skills").update(patch).eq("id", existing.id);
          if (unlock || existing.is_unlocked) groups.unlocked.push(ch); else groups.acquirable.push(ch);
        } else {
          const { data: list } = await (supabase as any).from("character_skills")
            .select("order_index").eq("character_id", ch.id);
          const maxOrder = ((list || []) as any[]).reduce((m, r) => Math.max(m, r.order_index ?? 0), 0);
          const { error } = await (supabase as any).from("character_skills").insert({
            campaign_id: campaignId,
            character_id: ch.id,
            ...baseFields,
            is_unlocked: unlock,
            source: "dm_created",
            order_index: maxOrder + 1,
            unlocked_at: unlock ? new Date().toISOString() : null,
          });
          if (error) { toast.error(error.message); continue; }
          (unlock ? groups.unlocked : groups.acquirable).push(ch);
        }
      }

      async function logFor(bucket: typeof chosen, msgKey: string) {
        if (!bucket.length) return;
        const segs: any[] = [
          { t: "char", v: dm.name, color: dm.color, id: dm.id },
          { t: "text", v: ` ${t(msgKey)} ` },
        ];
        bucket.forEach((p, i) => {
          if (i > 0) segs.push({ t: "text", v: i === bucket.length - 1 ? " y " : ", " });
          segs.push({ t: "char", v: p.name, color: p.color, id: p.id });
        });
        segs.push({ t: "text", v: `: ✨ ${name.trim()}` });
        await pushLog(campaignId, segs);
      }
      await logFor(groups.unlocked, "skills.logCreatedFor");
      await logFor(groups.acquirable, "skills.logCreatedAcquirableFor");

      toast.success(t("skills.createdOk"));
      reset();
      onDone?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ornate-card p-3 space-y-2" style={{ borderColor: "color-mix(in oklab, var(--gold) 55%, var(--rarity-purple))" }}>
      <button onClick={() => setOpen(!open)} className="w-full font-display text-sm uppercase tracking-widest text-[var(--rarity-purple)] flex items-center justify-between">
        <span className="flex items-center gap-1"><Plus size={14} /> {t("skills.createManualTitle")}</span>
        <span className="text-xs text-muted-foreground">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-2 rounded-lg" style={{ background: "color-mix(in oklab, var(--gold) 6%, transparent)", border: "1px solid color-mix(in oklab, var(--gold) 30%, transparent)" }}>
            <SkillIconMedallion type={type || null} rarity={rarity} iconKey={iconKey} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-base truncate" style={{ color: RARITY_COLOR[rarity] }}>
                {name.trim() || t("skills.namePh")}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <RarityBadge rarity={rarity} />
                <span className="text-[10px] text-muted-foreground">{type.trim() || t("skills.typeOpts.utility")}</span>
                <span className="ml-auto text-[10px] font-display text-[var(--gold)]">{SKILL_RARITY_COST[rarity]} {t("skills.sp")}</span>
              </div>
            </div>
          </div>

          <Section title={t("skills.sectionIdentity")}>
            <input className="w-full bg-input border border-border rounded px-2 py-2 text-sm" placeholder={t("skills.namePh")} value={name} onChange={e => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              {(["white","blue","purple","gold"] as Rarity[]).map(r => (
                <button key={r} type="button" onClick={() => setRarity(r)}
                  className="rounded px-2 py-1.5 text-xs font-display flex items-center justify-between gap-1"
                  style={{
                    border: `1.5px solid ${RARITY_COLOR[r]}`,
                    background: rarity === r ? `color-mix(in oklab, ${RARITY_COLOR[r]} 25%, transparent)` : "transparent",
                    color: RARITY_COLOR[r],
                  }}>
                  <span>{t(`rarities.${r}`)}</span>
                  <span className="opacity-80">{SKILL_RARITY_COST[r]} SP</span>
                </button>
              ))}
            </div>
            <input className="w-full bg-input border border-border rounded px-2 py-2 text-sm" placeholder={t("skills.typePh")} value={type} onChange={e => setType(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {QUICK_TYPES.map(k => {
                const label = t(`skills.${k}`);
                return (
                  <button key={k} type="button" onClick={() => setType(label)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground">
                    {label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title={t("skills.sectionMechanics")}>
            <textarea className="w-full bg-input border border-border rounded px-2 py-2 text-sm" rows={3}
              placeholder={t("skills.effectPh")} value={effect} onChange={e => setEffect(e.target.value)} />
            <div className="flex items-center gap-2">
              <span className="text-[var(--gold)]"><Dices size={14} /></span>
              <input className="flex-1 bg-input border border-border rounded px-2 py-2 text-sm" placeholder={t("skills.dicePh")} value={dice} onChange={e => setDice(e.target.value)} />
            </div>
            {showDiceWarning && (
              <p className="text-[10px] text-[var(--rarity-gold)] flex items-center gap-1">
                <AlertTriangle size={11} /> {t("skills.diceWarning")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-input border border-border rounded px-2 py-2 text-sm" placeholder={t("skills.rangePh")} value={range} onChange={e => setRange(e.target.value)} />
              <input className="bg-input border border-border rounded px-2 py-2 text-sm" placeholder={t("skills.targetsPh")} value={targets} onChange={e => setTargets(e.target.value)} />
            </div>
          </Section>

          <Section title={t("skills.sectionVisual")}>
            <textarea className="w-full bg-input border border-border rounded px-2 py-2 text-sm" rows={2}
              placeholder={t("skills.visualBriefPh")} value={visualBrief} onChange={e => setVisualBrief(e.target.value)} />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("skills.iconLabel")}</p>
              <div className="grid grid-cols-6 gap-1.5">
                <button type="button" onClick={() => setIconKey(null)}
                  className="aspect-square rounded flex items-center justify-center text-[8px] text-center px-0.5"
                  style={{
                    border: `1.5px solid ${iconKey === null ? RARITY_COLOR[rarity] : "var(--border)"}`,
                    background: iconKey === null ? `color-mix(in oklab, ${RARITY_COLOR[rarity]} 18%, transparent)` : "transparent",
                  }}
                  title={t("skills.iconAuto")}>
                  <Sparkles size={14} />
                </button>
                {SKILL_ICON_OPTIONS.map(opt => {
                  const I = opt.icon;
                  const sel = iconKey === opt.key;
                  return (
                    <button key={opt.key} type="button" onClick={() => setIconKey(opt.key)}
                      className="aspect-square rounded flex items-center justify-center"
                      style={{
                        border: `1.5px solid ${sel ? RARITY_COLOR[rarity] : "var(--border)"}`,
                        background: sel ? `color-mix(in oklab, ${RARITY_COLOR[rarity]} 18%, transparent)` : "transparent",
                      }}
                      title={t(opt.labelKey)}>
                      <I size={14} color={sel ? RARITY_COLOR[rarity] : undefined} />
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {iconKey === null ? t("skills.iconAuto") : t(SKILL_ICON_OPTIONS.find(o => o.key === iconKey)!.labelKey)}
              </p>
            </div>
          </Section>

          <Section title={t("skills.sectionAssignment")}>
            <div className="grid grid-cols-2 gap-2">
              {(["unlock","acquirable"] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className="rounded p-2 text-left"
                  style={{
                    border: `1.5px solid ${mode === m ? "var(--gold)" : "var(--border)"}`,
                    background: mode === m ? "color-mix(in oklab, var(--gold) 12%, transparent)" : "transparent",
                  }}>
                  <p className="text-xs font-display" style={{ color: mode === m ? "var(--gold)" : undefined }}>
                    {t(m === "unlock" ? "skills.modeUnlock" : "skills.modeAcquirable")}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t(m === "unlock" ? "skills.modeUnlockHint" : "skills.modeAcquirableHint")}
                  </p>
                </button>
              ))}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{t("skills.targetsTitle")}</p>
              <p className="text-[10px] text-muted-foreground mb-1.5">{t("skills.targetsHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {players.map(p => {
                  const sel = targetIds.has(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleTarget(p.id)}
                      className="text-xs px-2 py-1 rounded flex items-center gap-1.5"
                      style={{
                        border: `1.5px solid ${sel ? p.color : "var(--border)"}`,
                        background: sel ? `color-mix(in oklab, ${p.color} 18%, transparent)` : "transparent",
                        color: sel ? p.color : undefined,
                      }}>
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>

          <div className="rounded-lg p-2 flex items-center justify-between text-xs"
            style={{ background: "color-mix(in oklab, var(--gold) 6%, transparent)", border: "1px solid color-mix(in oklab, var(--gold) 25%, transparent)" }}>
            <span className="text-muted-foreground">
              {t("skills.costPreview")}: <span className="font-display text-[var(--gold)]">
                {mode === "acquirable" ? `${SKILL_RARITY_COST[rarity]} SP` : t("skills.freeUnlocks")}
              </span>
              {" · "}
              {targetIds.size} {targetIds.size === 1 ? "👤" : "👥"}
            </span>
          </div>
          <button className="btn-fantasy w-full" disabled={submitting}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }} onClick={create}>
            {submitting ? t("common.saving") : t("skills.createSkill")}
          </button>
        </div>
      )}
    </div>
  );
}

function GrantSp({ campaignId, target, dm }: { campaignId: string; target: Character; dm: { id: string; name: string; color: string } }) {
  const { t } = useT();
  const [amount, setAmount] = useState(1);
  async function grant() {
    if (amount === 0) return;
    const cur = (target as any).skill_points ?? 0;
    const next = Math.max(0, cur + amount);
    const prev = { skill_points: cur };
    await supabase.from("characters").update({ skill_points: next } as any).eq("id", target.id);
    await pushLog(campaignId, [
      { t: "char", v: dm.name, color: dm.color, id: dm.id },
      { t: "text", v: amount > 0 ? t("skills.logGaveSp") : t("skills.logTookSp") },
      amount > 0 ? { t: "gain", v: `+${amount} SP` } : { t: "loss", v: `${amount} SP` },
      { t: "text", v: t("skills.logTo") },
      { t: "char", v: target.name, color: target.color, id: target.id },
    ], { kind: "character.update", id: target.id, prev });
  }
  return (
    <div className="ornate-card p-3 space-y-2">
      <h3 className="font-display text-sm uppercase tracking-widest text-[var(--gold)] flex items-center gap-1">
        <Sparkles size={14} /> {t("skills.grantSp")} — <span style={{ color: target.color }}>{target.name}</span>
      </h3>
      <p className="text-[10px] text-muted-foreground">
        {t("skills.spBalance")}: <span className="font-display text-[var(--gold)]">{(target as any).skill_points ?? 0}</span>
      </p>
      <div className="flex items-center gap-2">
        <input type="number" className="flex-1 bg-input border border-border rounded px-2 py-2 text-sm text-right" value={amount} onChange={e => setAmount(+e.target.value)} />
        <button className="btn-fantasy flex-1" onClick={grant}>{amount >= 0 ? t("skills.give") : t("skills.take")}</button>
      </div>
    </div>
  );
}

function MassGrant({ campaignId, dm, players, onlineIds }: {
  campaignId: string; dm: { id: string; name: string; color: string }; players: Character[]; onlineIds: Set<string>;
}) {
  const { t } = useT();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sp, setSp] = useState(1);
  const [lvl, setLvl] = useState(1);

  useEffect(() => {
    if (sel.size === 0 && onlineIds.size > 0) {
      const next = new Set<string>();
      for (const p of players) if (onlineIds.has(p.id)) next.add(p.id);
      if (next.size) setSel(next);
    }
    // eslint-disable-next-line
  }, [onlineIds.size]);

  function toggle(id: string) {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  }
  function selectOnline() {
    const next = new Set<string>();
    for (const p of players) if (onlineIds.has(p.id)) next.add(p.id);
    setSel(next);
  }

  async function grantSpAll() {
    if (sel.size === 0 || sp === 0) return;
    for (const id of sel) {
      const p = players.find(x => x.id === id); if (!p) continue;
      const cur = (p as any).skill_points ?? 0;
      const next = Math.max(0, cur + sp);
      await supabase.from("characters").update({ skill_points: next } as any).eq("id", id);
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: sp > 0 ? t("skills.logGaveSp") : t("skills.logTookSp") },
        sp > 0 ? { t: "gain", v: `+${sp} SP` } : { t: "loss", v: `${sp} SP` },
        { t: "text", v: t("skills.logTo") },
        { t: "char", v: p.name, color: p.color, id: p.id },
      ], { kind: "character.update", id: p.id, prev: { skill_points: cur } });
    }
    toast.success(t("skills.massGrantDone", { n: sel.size }));
  }

  async function levelUpAll() {
    if (sel.size === 0 || lvl === 0) return;
    for (const id of sel) {
      const p = players.find(x => x.id === id); if (!p) continue;
      const cur = (p as any).level ?? 1;
      const next = Math.max(1, cur + lvl);
      await supabase.from("characters").update({ level: next } as any).eq("id", id);
      await pushLog(campaignId, [
        { t: "char", v: dm.name, color: dm.color, id: dm.id },
        { t: "text", v: lvl > 0 ? t("skills.logLeveledUp") : t("skills.logLeveledDown") },
        lvl > 0 ? { t: "gain", v: `+${lvl}` } : { t: "loss", v: `${lvl}` },
        { t: "text", v: t("skills.logTo") },
        { t: "char", v: p.name, color: p.color, id: p.id },
      ], { kind: "character.update", id: p.id, prev: { level: cur } });
    }
    toast.success(t("skills.massLevelDone", { n: sel.size }));
  }

  return (
    <div className="ornate-card p-3 space-y-2">
      <h3 className="font-display text-sm uppercase tracking-widest text-[var(--rarity-purple)] flex items-center gap-1">
        <Trophy size={14} /> {t("skills.massTitle")}
      </h3>
      <p className="text-[10px] text-muted-foreground">{t("skills.massHint")}</p>
      <div className="flex flex-wrap gap-1">
        {players.map(p => {
          const isSel = sel.has(p.id);
          const isOnline = onlineIds.has(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)}
              className="text-[10px] px-2 py-1 rounded border font-display inline-flex items-center gap-1"
              style={{
                borderColor: isSel ? p.color : "var(--border)",
                color: isSel ? p.color : undefined,
                background: isSel ? `color-mix(in oklab, ${p.color} 15%, transparent)` : undefined,
              }}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-[var(--gain)]" : "bg-muted-foreground/40"}`} />
              {p.name}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 text-xs">
        <button className="flex-1 px-2 py-1 rounded border border-border" onClick={selectOnline}>{t("skills.selectOnline")}</button>
        <button className="flex-1 px-2 py-1 rounded border border-border" onClick={() => setSel(new Set())}>{t("skills.selectNone")}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="space-y-1">
          <input type="number" className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-right" value={sp} onChange={e => setSp(+e.target.value)} />
          <button className="btn-fantasy w-full text-xs" disabled={!sel.size} onClick={grantSpAll}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}>
            {t("skills.giveSpToSelected", { n: sel.size })}
          </button>
        </div>
        <div className="space-y-1">
          <input type="number" className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-right" value={lvl} onChange={e => setLvl(+e.target.value)} />
          <button className="btn-fantasy w-full text-xs" disabled={!sel.size} onClick={levelUpAll}
            style={{ background: "linear-gradient(135deg, var(--rarity-purple), oklch(0.35 0.18 300))", color: "white" }}>
            {t("skills.levelUpSelected", { n: sel.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
