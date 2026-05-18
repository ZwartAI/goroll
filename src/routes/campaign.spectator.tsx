import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useGameData } from "@/lib/useGame";
import { PageFrame } from "@/components/app/Frame";
import { LogOut } from "lucide-react";
import { setSession, type LogRow } from "@/lib/game";
import { LogSegments } from "@/components/app/LogSegments";
import { LogList } from "@/components/app/LogList";
import { CharacterSheetModal } from "@/components/app/CharacterSheetModal";
import { ItemModal } from "@/components/app/ItemModal";
import { Escenario } from "@/components/app/Escenario";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/campaign/spectator")({ component: Spectator });

function Spectator() {
  const { t } = useT();
  const { campaign, characters, logs, achievements, onlineIds, loading } = useGameData();
  const nav = useNavigate();
  const [tab, setTab] = useState<"escenario" | "log" | "achievements">("escenario");
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  if (loading || !campaign) return <PageFrame><p className="text-center text-muted-foreground">{t("spectator.loading")}</p></PageFrame>;

  function logout() { setSession(null); nav({ to: "/" }); }
  const players = characters.filter(c => c.role === "player");
  const openItemFromId = (id: string) => setOpenItemId(id);

  return (
    <PageFrame>
      <header className="flex items-start justify-between gap-2 mb-3">
        <button onClick={logout} className="text-muted-foreground"><LogOut size={18}/></button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{campaign.name}</p>
          <h1 className="font-display text-xl rune-glow">{t("spectator.title")}</h1>
        </div>
        <div className="w-5"/>
      </header>
      <div className="gem-divider mb-4"/>

      <div className="grid grid-cols-3 gap-1 mb-4">
        {([
          ["escenario", t("spectator.tabScene")],["log", t("spectator.tabLog")],["achievements", t("spectator.tabAchievements")],
        ] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`text-xs py-2 rounded-md font-display ${tab===k?"bg-[var(--gold)] text-black":"bg-card text-foreground border border-border"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "escenario" && (
        <Escenario
          characters={characters}
          onlineIds={onlineIds}
          logs={logs}
          selfId={null}
          onOpenChar={(id) => setOpenChar(id)}
          onOpenItem={openItemFromId}
        />
      )}

      {tab === "log" && (
        <LogList rows={logs} initial={20} maxH="max-h-[70vh]" empty={t("spectator.noActivity")}
          renderRow={(l: LogRow) => (
            <div key={l.id} className={`text-sm bg-secondary/40 rounded px-3 py-2 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
              <LogSegments segments={l.segments as any}
                onItem={openItemFromId}
                onChar={(id) => setOpenChar(id)} />
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(l.created_at).toLocaleTimeString()}</p>
            </div>
          )} />
      )}

      {tab === "achievements" && (
        <div className="space-y-3">
          {players.map(p => {
            const list = achievements.filter(a => a.character_id === p.id);
            return (
              <div key={p.id} className="ornate-card p-3">
                <p className="font-display text-sm mb-2" style={{ color: p.color }}>{p.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(a => (
                    <span key={a.id} className="text-[10px] rounded-full px-2 py-0.5 border" style={{ borderColor: a.color, color: a.color }}>🏆 {a.label}</span>
                  ))}
                  {!list.length && <span className="text-[10px] text-muted-foreground">{t("spectator.noAchievements")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openChar && (
        <CharacterSheetModal characterId={openChar} campaignId={campaign.id} editor={null}
          onClose={() => setOpenChar(null)}
          onPickItem={(it) => setOpenItemId(it.id)} />
      )}
      {openItemId && (
        <ItemModal itemId={openItemId} onClose={() => setOpenItemId(null)} />
      )}
    </PageFrame>
  );
}
