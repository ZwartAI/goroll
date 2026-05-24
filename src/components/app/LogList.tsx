import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";


/**
 * Log container that:
 *  - Shows last `initial` entries (newest order assumed pre-sorted).
 *  - Renders a "ver más +" expander to reveal the rest.
 *  - Wraps the scroll area INSIDE the ornate-card so the inner red
 *    border (::before) doesn't visually scroll out of view.
 *
 * When `collapsible` is true the block starts collapsed showing only
 * `collapsedRows` entries (default 2). Clicking expands it to full size.
 * After 1 minute of inactivity it collapses but preserves the scroll
 * position. After 3 minutes of inactivity the scroll position is reset
 * to the top.
 */
export function LogList<T>({
  rows,
  initial = 20,
  maxH = "max-h-[60vh]",
  empty = "El log está vacío.",
  renderRow,
  collapsible = false,
  collapsedRows = 2,
}: {
  rows: T[];
  initial?: number;
  maxH?: string;
  empty?: string;
  renderRow: (row: T) => ReactNode;
  collapsible?: boolean;
  collapsedRows?: number;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsible);
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
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = savedScrollRef.current;
      scheduleIdle();
    }
    return () => {
      if (collapsed) clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  useEffect(() => () => clearTimers(), []);

  const handleInteract = () => {
    if (!collapsible || collapsed) return;
    scheduleIdle();
  };

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
      </div>
    </div>
  );
}
