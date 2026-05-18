import { useState } from "react";
import { LogList } from "@/components/app/LogList";
import { LogSegments } from "@/components/app/LogSegments";
import type { Character, LogRow } from "@/lib/game";
import { useT } from "@/lib/i18n";

type Props = {
  characters: Character[];
  onlineIds: Set<string>;
  logs: LogRow[];
  selfId?: string | null;
  onOpenChar: (id: string) => void;
  onOpenItem?: (id: string) => void;
  onOpenBooster?: (id: string) => void;
  /** Character IDs that belong to DM-role users — they are hidden from the players table. */
  dmCharacterIds?: Set<string>;
  /** Display overrides for DM/Co-DM names in the log. */
  nameOverrides?: Record<string, { name: string; color: string }>;
  /** Show log under the players grid. Default true. */
  showLog?: boolean;
  /** Character IDs currently speaking (mic activity). */
  speakingIds?: Set<string>;
};

/**
 * Shared "Escenario" view: shows the party (online first, offline collapsible)
 * and an optional log of the scene below. Used by Player profile, DM, and Spectator.
 */
export function Escenario({ characters, onlineIds, logs, selfId, onOpenChar, onOpenItem, onOpenBooster, dmCharacterIds, nameOverrides, showLog = true, speakingIds }: Props) {
  const [openOffline, setOpenOffline] = useState(false);
  const { t } = useT();
  const dmSet = dmCharacterIds || new Set<string>();
  const players = characters.filter(c => c.role !== "dm" && !dmSet.has(c.id));
  const online = players.filter(p => (onlineIds.has(p.id) || p.id === selfId));
  const offline = players.filter(p => !onlineIds.has(p.id) && p.id !== selfId);

  return (
    <>
      <div className="ornate-card p-3 mb-4">
        <h2 className="font-display text-sm uppercase tracking-widest text-center mb-2 text-[var(--gold)]">{t("escenario.title")}</h2>
        <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase text-[var(--gain)]">
          <span className="w-2 h-2 rounded-full bg-[var(--gain)] inline-block" /> {t("escenario.online")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
          {online.map(p => <PlayerCard key={p.id} c={p} online onClick={() => onOpenChar(p.id)} isSelf={p.id === selfId} t={t} />)}
          {online.length === 0 && <p className="col-span-full text-[10px] text-muted-foreground text-center py-2">{t("escenario.nobodyOnline")}</p>}
        </div>
        {offline.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 inline-block" /> {t("escenario.offline")}
            </div>
            {offline.length <= 3 ? (
              <div className="grid grid-cols-2 gap-2">
                {offline.map(p => <OfflineRow key={p.id} c={p} onClick={() => onOpenChar(p.id)} />)}
              </div>
            ) : (
              <button onClick={() => setOpenOffline(true)}
                className="w-full ornate-card p-3 text-center hover:border-[var(--gold)]/60 transition opacity-80">
                <div className="flex items-center justify-center gap-2 text-xs">
                  <span className="font-display text-[var(--gold)]">{offline.length}</span>
                  <span className="text-muted-foreground">{t("escenario.disconnectedCount")}</span>
                  <span className="text-[var(--gold)]">···</span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">{t("escenario.tapToSeeAll")}</p>
              </button>
            )}
          </>
        )}
      </div>

      {showLog && (
        <div className="ornate-card p-3">
          <h2 className="font-display text-sm uppercase tracking-widest text-center mb-2 text-[var(--gold)]">{t("escenario.logTitle")}</h2>
          <LogList rows={logs} initial={30} maxH="max-h-[50vh]" empty={t("escenario.noActivity")}
            renderRow={(l: any) => (
              <div key={l.id} className={`text-xs bg-secondary/40 rounded px-2 py-1.5 leading-relaxed ${l.undone ? "opacity-50 line-through" : ""}`}>
                <LogSegments segments={l.segments as any}
                  nameOverrides={nameOverrides}
                  onItem={(id) => onOpenItem?.(id)}
                  onBooster={(id) => onOpenBooster?.(id)}
                  onChar={(id) => onOpenChar(id)} />
                <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(l.created_at).toLocaleTimeString()}</p>
              </div>
            )} />
        </div>
      )}

      {openOffline && (
        <OfflineListModal players={offline} onClose={() => setOpenOffline(false)}
          onPick={(id) => { setOpenOffline(false); onOpenChar(id); }} title={t("escenario.offlineModalTitle")} closeLabel={t("common.close")} />
      )}
    </>
  );
}

function PlayerCard({ c, online, onClick, isSelf, t }: { c: any; online: boolean; onClick: () => void; isSelf?: boolean; t: (p: string) => string }) {
  const max = c.max_hp || c.base_hp || 1;
  const pct = Math.max(0, Math.min(100, (c.current_hp / max) * 100));
  return (
    <button onClick={onClick}
      className={`ornate-card !p-2 text-center transition hover:border-[var(--gold)]/70 ${online ? "" : "opacity-50 grayscale"}`}>
      <div className="relative mx-auto w-14 h-14 rounded-full overflow-hidden border-2"
        style={{ borderColor: c.color || "var(--gold)" }}>
        {c.image_url
          ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover"
              style={{ transform: `translate(${((c.image_offset_x ?? 50) - 50)}%, ${((c.image_offset_y ?? 50) - 50)}%) scale(${c.image_scale || 1})` }} />
          : <div className="w-full h-full flex items-center justify-center text-xl bg-[var(--secondary)]">🧙</div>}
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border border-background ${online ? "bg-[var(--gain)]" : "bg-muted-foreground/60"}`} />
      </div>
      <p className="font-display text-xs mt-1 truncate" style={{ color: c.color }}>{c.name}</p>
      <p className="text-[9px] text-muted-foreground truncate">{c.race || "—"} / {c.class || "—"}</p>
      <p className="text-[10px] mt-0.5">❤️ {c.current_hp}/{max}</p>
      <div className="h-1 rounded-full bg-secondary overflow-hidden mt-0.5">
        <div className="h-full" style={{ width: `${pct}%`, background: pct > 50 ? "var(--gain)" : pct > 25 ? "var(--gold)" : "var(--loss)" }} />
      </div>
      <p className={`text-[9px] mt-1 ${online ? "text-[var(--gain)]" : "text-muted-foreground"}`}>
        {isSelf && online ? <span className="inline-flex items-center gap-0.5">{t("escenario.activeNow")}<span className="animate-pulse">···</span></span> : online ? t("escenario.onlineShort") : t("escenario.offlineShort")}
      </p>
    </button>
  );
}

function OfflineRow({ c, onClick }: { c: any; onClick: () => void }) {
  return (
    <button onClick={onClick} className="ornate-card !p-2 flex items-center gap-2 opacity-60 hover:opacity-80 transition text-left">
      <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: c.color || "var(--gold)" }}>
        {c.image_url
          ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover grayscale" />
          : <div className="w-full h-full flex items-center justify-center text-xs bg-[var(--secondary)]">🧙</div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xs truncate" style={{ color: c.color }}>{c.name}</p>
        <p className="text-[9px] text-muted-foreground truncate">{c.race || "—"} / {c.class || "—"}</p>
        <div className="h-1 rounded-full bg-secondary overflow-hidden mt-0.5">
          <div className="h-full bg-muted-foreground/60" style={{ width: `${Math.max(0, Math.min(100, (c.current_hp / (c.max_hp || c.base_hp || 1)) * 100))}%` }} />
        </div>
      </div>
    </button>
  );
}

function OfflineListModal({ players, onClose, onPick, title, closeLabel }: { players: any[]; onClose: () => void; onPick: (id: string) => void; title: string; closeLabel: string }) {
  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-4 max-w-md w-full max-h-[85vh] overflow-y-auto space-y-2" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-lg text-center text-[var(--gold)]">{title}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {players.map(p => <OfflineRow key={p.id} c={p} onClick={() => onPick(p.id)} />)}
        </div>
        <button className="btn-fantasy w-full" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}
