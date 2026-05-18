import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { ArrowLeft } from "lucide-react";
import { BoosterCard, type Booster } from "@/components/app/BoosterCard";
import { BoosterActions } from "@/components/app/BoosterEditor";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/boosters")({ component: Boosters });

function Boosters() {
  const { character, campaign, loading } = useGameData();
  const [boosters, setBoosters] = useState<Booster[]>([]);
  const [sel, setSel] = useState<Booster | null>(null);
  const { t } = useT();

  async function reload() {
    if (!character) return;
    const { data } = await (supabase as any).from("boosters")
      .select("*").eq("owner_character_id", character.id).order("created_at");
    setBoosters((data || []) as Booster[]);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [character?.id]);
  useEffect(() => {
    if (!campaign) return;
    const ch = (supabase as any).channel(`boosters:player:${character?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${campaign.id}` }, () => reload())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line
  }, [campaign?.id, character?.id]);

  if (loading || !character || !campaign)
    return <PageFrame><p className="text-center text-muted-foreground">{t("common.loading")}</p></PageFrame>;

  return (
    <PageFrame title={t("boosters.title")} subtitle={character.name}
      right={<Link to="/campaign/profile" className="text-muted-foreground"><ArrowLeft size={20} /></Link>}>
      {boosters.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-10">{t("boosters.none")}</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {boosters.map(b => (
          <BoosterCard key={b.id} b={b} onClick={() => setSel(b)} />
        ))}
      </div>
      {sel && (
        <BoosterActions booster={sel} character={character} campaignId={campaign.id} players={[]}
          onClose={() => setSel(null)} />
      )}
    </PageFrame>
  );
}
