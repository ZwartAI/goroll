import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ArrowLeft, Sparkles, ChevronRight, Gem } from "lucide-react";
import { SkillCard, type CharacterSkill } from "@/components/app/SkillCard";
import { SkillAcquireModal } from "@/components/app/SkillAcquireModal";
import { useT } from "@/lib/i18n";
import { pushLog } from "@/lib/log";
import { toast } from "sonner";

export const Route = createFileRoute("/campaign/skills")({ component: Skills });

function Skills() {
  const { character, campaign, loading } = useGameData();
  const { t } = useT();
  const [skills, setSkills] = useState<CharacterSkill[]>([]);
  const [shopOpen, setShopOpen] = useState(false);

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

  const skillI18n = {
    dice: t("skills.dice"),
    range: t("skills.range"),
    targets: t("skills.targets"),
    effect: t("skills.effect"),
    visual: t("skills.visualBrief"),
    rangeTargets: t("skills.rangeTargets"),
  };

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
    reload();
  }

  return (
    <PageFrame
      title={t("skills.title")}
      subtitle={character.name}
      right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20} /></Link>}
    >
      {/* SP card */}
      <div
        className="ornate-card p-3 flex items-center justify-between mb-3"
        style={{
          borderColor: "var(--gold)",
          background: "linear-gradient(135deg, color-mix(in oklab, var(--gold) 14%, var(--card)), var(--card))",
          boxShadow: "0 0 18px color-mix(in oklab, var(--gold) 25%, transparent)",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--gold) 55%, transparent), transparent 70%)",
              border: "1px solid var(--gold)",
              boxShadow: "0 0 10px color-mix(in oklab, var(--gold) 50%, transparent)",
            }}
          >
            <Gem size={18} className="text-[var(--gold)]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground leading-none">{t("skills.spBalance")}</span>
            <span className="font-display text-2xl text-[var(--gold)] leading-tight">{sp}</span>
          </div>
        </div>
      </div>

      {/* Owned skills */}
      <div className="space-y-2.5">
        {unlocked.length === 0 && (
          <div className="ornate-card p-6 text-center text-xs text-muted-foreground">
            {t("skills.noneOwned")}
          </div>
        )}
        {unlocked.map(s => (
          <SkillCard key={s.id} s={s} expandable i18n={skillI18n} />
        ))}
      </div>

      {/* Acquire CTA */}
      <button
        onClick={() => setShopOpen(true)}
        className="w-full mt-4 rounded-xl p-3 flex items-center gap-3 group"
        style={{
          border: "1.5px solid var(--gold)",
          background: "linear-gradient(135deg, color-mix(in oklab, var(--gold) 22%, var(--card)), color-mix(in oklab, var(--gold) 8%, var(--card)))",
          boxShadow: "0 0 22px color-mix(in oklab, var(--gold) 30%, transparent)",
        }}
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: "radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--gold) 70%, transparent), transparent 70%)",
            border: "1px solid var(--gold)",
            boxShadow: "0 0 12px color-mix(in oklab, var(--gold) 55%, transparent)",
          }}
        >
          <Sparkles size={20} className="text-[var(--gold)]" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-display text-base text-[var(--gold)] leading-tight">{t("skills.acquireOpen")}</p>
          <p className="text-[11px] text-muted-foreground truncate">{t("skills.acquireOpenSubtitle")} · {locked.length}</p>
        </div>
        <ChevronRight size={20} className="text-[var(--gold)] transition-transform group-hover:translate-x-0.5" />
      </button>

      {shopOpen && (
        <SkillAcquireModal
          skills={locked}
          spBalance={sp}
          onClose={() => setShopOpen(false)}
          onPurchase={purchase}
        />
      )}
    </PageFrame>
  );
}
