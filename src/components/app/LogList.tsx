import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";


/**
 * Log container with up to three display modes:
 *  - "closed"   (only when `extraClosedState` is true): collapses the whole
 *               block down to a single tappable button labeled `closedLabel`
 *               so the screen ends at the button's bottom edge. Tapping it
 *               expands to the peek state.
 *  - "peek"     (when `collapsible` is true): shows `collapsedRows` entries.
 *               Tapping the block expands it fully.
 *  - "expanded": full scrollable log with "show more" pagination.
 *
 * After 1 minute of inactivity in the expanded state we save the scroll
 * position and collapse to peek. After 3 minutes the scroll is reset.
 */
export function LogList<T>({
  rows,
  initial = 20,
  maxH = "max-h-[60vh]",
  empty = "El log está vacío.",
  renderRow,
  collapsible = false,
  collapsedRows = 2,
  extraClosedState = false,
  closedLabel,
}: {
  rows: T[];
  initial?: number;
  maxH?: string;
  empty?: string;
  renderRow: (row: T) => ReactNode;
  collapsible?: boolean;
  collapsedRows?: number;
  /** When true, adds an outermost "fully closed" state that renders only a button. */
  extraClosedState?: boolean;
  /** Label shown inside the closed-state button. */
  closedLabel?: string;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsible);
  const [closed, setClosed] = useState(extraClosedState);
  const visible = expanded ? rows : rows.slice(0, initial);
  const hidden = rows.length - visible.length;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollRef = useRef(0);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    collapseTimer.current = null;
    resetTimer.current = null;
  };

  const scheduleIdle = () => {
    if (!collapsible) return;
    clearTimers();
    collapseTimer.current = setTimeout(() => {
      if (scrollRef.current) savedScrollRef.current = scrollRef.current.scrollTop;
      setCollapsed(true);
    }, 60_000);
    resetTimer.current = setTimeout(() => {
      savedScrollRef.current = 0;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setCollapsed(true);
    }, 180_000);
  };

  // Restore scroll when re-opening from collapsed state.
  useEffect(() => {
    if (!closed && !collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollRef.current;
      scheduleIdle();
    }
    return () => {
      if (collapsed || closed) clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, closed]);

  useEffect(() => () => clearTimers(), []);

  const handleInteract = () => {
    if (!collapsible || collapsed || closed) return;
    scheduleIdle();
  };

  if (extraClosedState && closed) {
    return (
      <button
        type="button"
        className="ornate-card w-full px-3 py-2 text-center font-display text-xs uppercase tracking-widest text-[var(--gold)] cursor-pointer"
        onClick={() => setClosed(false)}
      >
        {closedLabel ?? t("profile.sessionLog")}
      </button>
    );
  }

  if (collapsible && collapsed) {
    const peek = rows.slice(0, collapsedRows);
    return (
      <div
        className="ornate-card p-1 cursor-pointer"
        onClick={() => setCollapsed(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed(false);
          }
        }}
      >
        <div className="p-2 space-y-2">
          {peek.map(renderRow)}
          {!rows.length && <p className="text-center text-xs text-muted-foreground py-4">{empty}</p>}
        </div>
        {extraClosedState && (
          <button
            type="button"
            className="w-full text-[10px] text-muted-foreground hover:underline py-1"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(true);
              setClosed(true);
            }}
          >
            {t("collapseUI.collapse")} −
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ornate-card p-1" onClick={handleInteract}>
      <div
        ref={scrollRef}
        className={`${maxH} overflow-y-auto p-2 space-y-2`}
        onScroll={handleInteract}
        onTouchStart={handleInteract}
      >
        {visible.map(renderRow)}
        {!rows.length && <p className="text-center text-xs text-muted-foreground py-4">{empty}</p>}
        {hidden > 0 && (
          <button
            className="w-full text-xs text-[var(--gold)] hover:underline py-2"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
              handleInteract();
            }}
          >
            {t("collapseUI.showMore")} + ({hidden})
          </button>
        )}
        {expanded && rows.length > initial && (
          <button
            className="w-full text-[10px] text-muted-foreground hover:underline py-1"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
              handleInteract();
            }}
          >
            {t("collapseUI.collapse")} −
          </button>
        )}
        {extraClosedState && (
          <button
            type="button"
            className="w-full text-[10px] text-muted-foreground hover:underline py-1"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
              setCollapsed(true);
              setClosed(true);
            }}
          >
            {t("collapseUI.collapse")} −
          </button>
        )}
      </div>
    </div>
  );
}
