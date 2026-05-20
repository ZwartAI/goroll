import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SkillCard, type CharacterSkill } from "@/components/app/SkillCard";
import { SkillDetailModal } from "@/components/app/SkillDetailModal";
import { useT } from "@/lib/i18n";
import { pushLog } from "@/lib/log";
import { toast } from "sonner";

export const Route = createFileRoute("/campaign/skills")({ component: Skills });

function Skills() {
  const { character, campaign, loading } = useGameData();
  const { t } = useT();
  const [skills, setSkills] = useState<CharacterSkill[]>([]);
  const [sel, setSel] = useState<CharacterSkill | null>(null);
  const [mode, setMode] = useState<"owned" | "acquire">("owned");

  async function reload() {
    if (!character) return;
    const { data } = await (supabase as any).from("character_skills")
      .select("*").eq("character_id", character.id)
      .order("order_index").order("created_at");
    setSkills((data || []) as CharacterSkill[]);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [character?.id]);
  useEffect(() => {
    if (!campaign || !character) return;
    const ch = (supabase as any).channel(`skills:player:${character.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_skills", filter: `character_id=eq.${character.id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `id=eq.${character.id}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [campaign?.id, character?.id]);

  if (loading || !character || !campaign)
    return <PageFrame><p className="text-center text-muted-foreground">{t("common.loading")}</p></PageFrame>;

  const sp = (character as any).skill_points ?? 0;
  const unlocked = skills.filter(s => s.is_unlocked);
  const locked = skills.filter(s => !s.is_unlocked);

  async function purchase(s: CharacterSkill) {
    if (!character || !campaign) return;
    if (sp < s.cost) { toast.error(t("skills.notEnoughSp", { have: sp, need: s.cost })); return; }
    const nextSp = sp - s.cost;
    const prev = { skill_points: sp };
    const { error: e1 } = await (supabase as any).from("character_skills")
      .update({ is_unlocked: true, unlocked_at: new Date().toISOString() })
      .eq("id", s.id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("characters").update({ skill_points: nextSp } as any).eq("id", character.id);
    await pushLog(campaign.id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: t("skills.logAcquired") },
      { t: "text", v: `✨ ${s.name}` },
      { t: "loss", v: `-${s.cost} SP` },
    ], { kind: "character.update", id: character.id, prev });
    setSel(null);
    reload();
  }

  return (
    <PageFrame title={t("skills.title")} subtitle={character.name}
      right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20} /></Link>}>
      <div className="ornate-card p-3 flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-[var(--gold)]" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">{t("skills.spBalance")}</span>
        </div>
        <span className="font-display text-xl text-[var(--gold)]">{sp}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={() => setMode("owned")}
          className={`btn-fantasy text-xs ${mode === "owned" ? "" : "opacity-60"}`}>
          {t("skills.tabOwned")} ({unlocked.length})
        </button>
        <button onClick={() => setMode("acquire")}
          className={`btn-fantasy text-xs ${mode === "acquire" ? "" : "opacity-60"}`}
          style={mode === "acquire" ? { background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" } : undefined}>
          {t("skills.tabAcquire")} ({locked.length})
        </button>
      </div>

      {mode === "owned" && (
        <>
          {unlocked.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">{t("skills.noneOwned")}</p>}
          <div className="grid grid-cols-2 gap-2">
            {unlocked.map(s => <SkillCard key={s.id} s={s} onClick={() => setSel(s)} />)}
          </div>
        </>
      )}

      {mode === "acquire" && (
        <>
          {locked.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">{t("skills.noneToAcquire")}</p>}
          <div className="grid grid-cols-2 gap-2">
            {locked.map(s => <SkillCard key={s.id} s={s} locked onClick={() => setSel(s)} />)}
          </div>
        </>
      )}

      {sel && (
        <SkillDetailModal skill={sel} spBalance={sp}
          onClose={() => setSel(null)}
          onAcquire={!sel.is_unlocked ? () => purchase(sel) : undefined}
          canAcquire={!sel.is_unlocked && sp >= sel.cost} />
      )}
    </PageFrame>
  );
}
