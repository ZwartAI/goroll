import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ChevronLeft, Plus, Search, Eye, Edit3, Copy, Trash2, Swords, Crown, Star, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  deleteTemplate,
  duplicateTemplate,
  listTemplates,
  PRIMARY_TIERS,
  type EnemyTemplate,
} from "@/lib/bestiary";
import { EnemyIcon, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { MonsterEditor } from "@/components/app/MonsterEditor";
import { MonsterSheetModal } from "@/components/app/MonsterSheetModal";
import { AddFromBestiaryModal } from "@/components/app/AddFromBestiaryModal";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { EnemyExcelImportModal } from "@/components/app/EnemyExcelImportModal";


export const Route = createFileRoute("/campaign/bestiary")({ component: Bestiary });

function Bestiary() {
  const { t } = useT();
  const { character, campaign, combat, loading } = useGameData();

  const [templates, setTemplates] = useState<EnemyTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<string>("");

  const [editing, setEditing] = useState<EnemyTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<EnemyTemplate | null>(null);
  const [spawning, setSpawning] = useState<EnemyTemplate | null>(null);
  const [deleting, setDeleting] = useState<EnemyTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const isDM = character?.role === "dm";

  useEffect(() => {
    if (!campaign) return;
    const reload = () => listTemplates(campaign.id).then(setTemplates);
    reload();
    const ch = (supabase as any).channel(`bestiary:${campaign.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "enemy_templates", filter: `campaign_id=eq.${campaign.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "enemy_template_skills", filter: `campaign_id=eq.${campaign.id}` }, reload)
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [campaign?.id]);

  // Auto-open the Excel import modal when navigated with ?import=1 (DM Create shortcut).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "1") setImporting(true);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter(tpl => {
      if (q && !tpl.name.toLowerCase().includes(q)) return false;
      if (tier && tpl.tier !== tier) return false;
      return true;
    });
  }, [templates, search, tier]);

  if (loading || !character || !campaign) {
    return <PageFrame><p className="text-center text-muted-foreground">{t("dm.loading")}</p></PageFrame>;
  }
  if (!isDM) {
    return (
      <PageFrame>
        <p className="text-center text-muted-foreground py-6">{t("bestiary.dmOnly")}</p>
        <Link to="/campaign/profile" className="btn-fantasy block text-center">{t("common.back")}</Link>
      </PageFrame>
    );
  }

  const dmCtx = { id: character.id, name: character.name, color: character.color };

  return (
    <PageFrame>
      <header className="flex items-center gap-2 mb-3">
        <Link to="/campaign/dm" className="text-muted-foreground"><ChevronLeft size={20} /></Link>
        <h1 className="font-display text-lg flex-1 text-[var(--gold)] rune-glow">🐉 {t("bestiary.title")}</h1>
        <button className="btn-fantasy text-xs inline-flex items-center gap-1"
          onClick={() => setImporting(true)}
          title={t("bestiary.importEnemyExcel")}>
          <Upload size={14} /> {t("bestiary.importExcelShort")}
        </button>
        <button className="btn-fantasy text-xs"
          style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
          onClick={() => setCreating(true)}>
          <Plus size={14} className="inline" /> {t("bestiary.createEnemyOrMonster")}
        </button>
      </header>
      <div className="gem-divider mb-3" />

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 ornate-card px-2 py-1">
          <Search size={14} className="text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t("bestiary.search")}
            className="flex-1 bg-transparent outline-none text-sm" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TierChip active={tier === ""} label={t("bestiary.allTypes")} onClick={() => setTier("")} />
          {PRIMARY_TIERS.map(v => (
            <TierChip key={v} active={tier === v} label={t(`bestiary.tier_${v}`)} onClick={() => setTier(v)} />
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">{t("bestiary.empty")}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(tpl => {
          const hasAsset = !!getEnemyAssetUrl(tpl.icon_key);
          return (
            <article key={tpl.id} className="ornate-card p-3 space-y-2"
              style={{ borderColor: `color-mix(in oklab, ${tpl.color} 55%, transparent)` }}>
              <div className="flex items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full border-2 overflow-hidden flex items-center justify-center bg-card shrink-0 relative"
                  style={{ borderColor: tpl.color, color: tpl.color }}
                >
                  <EnemyIcon name={tpl.icon_key} size={28} fill={hasAsset} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display truncate" style={{ color: tpl.color }}>{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {t(`bestiary.tier_${tpl.tier}`)} · {t(`bestiary.role_${tpl.role}`)}
                  </p>
                  {tpl.biome && (
                    <p className="text-[10px] text-muted-foreground truncate">{tpl.biome}</p>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  {tpl.tier === "elite" && <span title={t("bestiary.tier_elite")}><Star size={12} className="text-purple-400" /></span>}
                  {(tpl.tier === "boss" || tpl.tier === "god") && <span title={t(`bestiary.tier_${tpl.tier}`)}><Crown size={12} className={tpl.tier === "god" ? "text-yellow-300" : "text-yellow-400"} /></span>}
                </div>
              </div>
              <div className="grid grid-cols-3 text-center text-[10px] text-muted-foreground">
                <span>HP {tpl.max_hp}</span>
                <span>DEF {tpl.defense}</span>
                <span>{tpl.speed}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                <IconBtn icon={<Eye size={12} />} title={t("bestiary.viewSheet")} onClick={() => setViewing(tpl)} />
                <IconBtn icon={<Edit3 size={12} />} title={t("common.edit")} onClick={() => setEditing(tpl)} />
                <IconBtn icon={<Copy size={12} />} title={t("bestiary.duplicate")} onClick={async () => {
                  const r = await duplicateTemplate(tpl, dmCtx);
                  if (!r.ok) toast.error(t("bestiary.saveError"));
                  else toast.success(t("bestiary.duplicated"));
                }} />
                <IconBtn icon={<Trash2 size={12} />} danger title={t("bestiary.delete")} onClick={() => setDeleting(tpl)} />
              </div>
              {combat.encounter && combat.encounter.status !== "ended" && (
                <button className="btn-fantasy w-full text-[11px]"
                  style={{ background: "var(--loss)", color: "white" }}
                  onClick={() => setSpawning(tpl)}>
                  <Swords size={12} className="inline mr-1" /> {t("bestiary.addToCombat")}
                </button>
              )}
            </article>
          );
        })}
      </div>

      {creating && (
        <MonsterEditor campaignId={campaign.id} dm={dmCtx} onClose={() => setCreating(false)}
          onSaved={() => listTemplates(campaign.id).then(setTemplates)} />
      )}
      {editing && (
        <MonsterEditor campaignId={campaign.id} dm={dmCtx} editing={editing} onClose={() => setEditing(null)}
          onSaved={() => listTemplates(campaign.id).then(setTemplates)} />
      )}
      {viewing && (
        <MonsterSheetModal
          template={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onAddToCombat={combat.encounter && combat.encounter.status !== "ended" ? () => { setSpawning(viewing); setViewing(null); } : undefined}
        />
      )}
      {spawning && combat.encounter && (
        <AddFromBestiaryModal
          template={spawning}
          encounter={combat.encounter}
          dm={dmCtx}
          onClose={() => setSpawning(null)}
        />
      )}

      {importing && (
        <EnemyExcelImportModal
          campaignId={campaign.id}
          dm={dmCtx}
          existing={templates}
          onClose={() => setImporting(false)}
          onImported={() => listTemplates(campaign.id).then(setTemplates)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t("bestiary.confirmDeleteTitle")}
        description={t("bestiary.confirmDelete")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteBusy(true);
          const r = await deleteTemplate(deleting);
          setDeleteBusy(false);
          if (!r.ok) toast.error(t("bestiary.saveError"));
          else {
            toast.success(t("bestiary.deleted"));
            setTemplates(prev => prev.filter(x => x.id !== deleting.id));
          }
          setDeleting(null);
        }}
      />
    </PageFrame>
  );
}

function TierChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-md border transition ${
        active
          ? "bg-[var(--gold)]/20 border-[var(--gold)] text-[var(--gold)]"
          : "border-border text-foreground hover:border-[var(--gold)]/50"
      }`}
    >
      {label}
    </button>
  );
}

function IconBtn({ icon, onClick, title, danger }: {
  icon: React.ReactNode; onClick: () => void; title: string; danger?: boolean;
}) {
  return (
    <button title={title} onClick={onClick}
      className="btn-fantasy text-[10px] py-1 flex items-center justify-center"
      style={danger ? { background: "color-mix(in oklab, var(--loss) 35%, var(--card))" } : undefined}>
      {icon}
    </button>
  );
}
