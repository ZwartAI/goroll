import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameData } from "@/lib/useGame";
import { ArrowLeft, ScrollText, Gem, ShoppingBag } from "lucide-react";
import { SkillCard, type CharacterSkill } from "@/components/app/SkillCard";
import { SkillAcquireModal } from "@/components/app/SkillAcquireModal";
import { PlayerCombatSkillsPanel } from "@/components/app/PlayerCombatSkillsPanel";
import { SKILL_RARITY_COST } from "@/lib/skillImport";
import { useT } from "@/lib/i18n";
import { pushLog } from "@/lib/log";
import { toast } from "sonner";

export const Route = createFileRoute("/campaign/skills")({ component: Skills });

function Skills() {
  const { character, campaign, characters, combat, loading } = useGameData();
  const { t } = useT();
  const [skills, setSkills] = useState<CharacterSkill[]>([]);
  const [shopOpen, setShopOpen] = useState(false);

  async function reload() {
    if (!character) return;
    const { data } = await (supabase as any).from("character_skills")
      .select("*").eq("character_id", character.id)
      .order("order_index").order("created_at");
    // Normalize locked-skill cost to match current rarity pricing
    const normalized = (data || []).map((s: CharacterSkill) =>
      !s.is_unlocked && SKILL_RARITY_COST[s.rarity] !== s.cost
        ? { ...s, cost: SKILL_RARITY_COST[s.rarity] }
        : s
    );
    setSkills(normalized as CharacterSkill[]);
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
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-24">
        <p className="text-center text-muted-foreground">{t("common.loading")}</p>
      </div>
    );

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
    const realCost = SKILL_RARITY_COST[s.rarity] ?? s.cost;
    if (sp < realCost) { toast.error(t("skills.notEnoughSp", { have: sp, need: realCost })); return; }
    const nextSp = sp - realCost;
    const prev = { skill_points: sp };
    const { error: e1 } = await (supabase as any).from("character_skills")
      .update({ is_unlocked: true, unlocked_at: new Date().toISOString(), cost: realCost })
      .eq("id", s.id);
    if (e1) { toast.error(e1.message); return; }
    await supabase.from("characters").update({ skill_points: nextSp } as any).eq("id", character.id);
    await pushLog(campaign.id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: t("skills.logAcquired") },
      { t: "text", v: `✨ ${s.name}` },
      { t: "loss", v: `-${realCost} SP` },
    ], { kind: "character.update", id: character.id, prev });
    reload();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-24">
      {/* Header */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="rune-glow text-2xl font-display font-bold text-foreground">{t("skills.title")}</h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{character.name}</p>
        </div>
        <Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20} /></Link>
      </header>
      <div className="gem-divider mb-4" />

      {/* Sticky: SP + Acquire */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pt-1 pb-3 space-y-2.5 bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur-sm">
        {/* SP card */}
        <div
          className="ornate-card p-3 flex items-center justify-between"
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

        {/* Shop button — parchment, intentionally different from skill cards */}
        <button
          type="button"
          onClick={() => setShopOpen(true)}
          className="w-full rounded-lg px-3 py-2.5 flex items-center gap-3 group transition-transform active:scale-[0.99]"
          style={{
            background: "linear-gradient(180deg, oklch(0.93 0.04 80), oklch(0.86 0.06 75))",
            border: "1px dashed oklch(0.45 0.10 55)",
            boxShadow: "0 2px 0 oklch(0.55 0.10 55), inset 0 1px 0 rgba(255,255,255,0.6)",
            color: "oklch(0.25 0.06 40)",
          }}
        >
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
            style={{
              background: "oklch(0.98 0.02 80)",
              border: "1px solid oklch(0.45 0.10 55)",
              color: "oklch(0.35 0.10 45)",
            }}
          >
            <ShoppingBag size={18} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-display text-sm leading-tight">{t("skills.acquireOpen")}</p>
            <p className="text-[11px] opacity-75 truncate">{t("skills.acquireOpenSubtitle")}: {locked.length}</p>
          </div>
          <ScrollText size={18} className="opacity-60 group-hover:opacity-100" />
        </button>
      </div>

      <PlayerCombatSkillsPanel
        encounter={combat.encounter}
        participants={combat.participants}
        groups={combat.groups}
        pins={combat.pins}
        character={character}
        allCharacters={characters}
        skills={unlocked}
      />

      {/* Owned skills (scrollable area, 2 columns when there's room) */}
      <div
        className="mt-3 grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        {unlocked.length === 0 && (
          <div className="ornate-card p-6 text-center text-xs text-muted-foreground">
            {t("skills.noneOwned")}
          </div>
        )}
        {unlocked.map(s => (
          <SkillCard key={s.id} s={s} expandable i18n={skillI18n} />
        ))}
      </div>

      {shopOpen && (
        <SkillAcquireModal
          skills={locked}
          spBalance={sp}
          onClose={() => setShopOpen(false)}
          onPurchase={purchase}
        />
      )}
    </div>
  );
}
