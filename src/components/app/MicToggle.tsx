import { useRef } from "react";
import { Mic, MicOff } from "lucide-react";
import { useT } from "@/lib/i18n";

type Props = {
  enabled: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
  className?: string;
};

/** Compact mic toggle. Tap = toggle, long-press = open settings. */
export function MicToggle({ enabled, onToggle, onLongPress, className }: Props) {
  const { t } = useT();
  const timerRef = useRef<any>(null);
  const longFiredRef = useRef(false);

  const start = () => {
    longFiredRef.current = false;
    if (!onLongPress) return;
    timerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      onLongPress();
    }, 500);
  };
  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const handleClick = () => {
    if (longFiredRef.current) { longFiredRef.current = false; return; }
    onToggle();
  };
  const handleContextMenu = (e: React.MouseEvent) => {
    if (onLongPress) { e.preventDefault(); onLongPress(); }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={handleContextMenu}
      aria-label={enabled ? t("micSettings.muteMic") : t("micSettings.enableMic")}
      title={enabled ? t("micSettings.muteMicWithHint") : t("micSettings.enableMicWithHint")}
      className={`inline-flex items-center justify-center rounded-md p-1 transition select-none ${
        enabled
          ? "text-[var(--gain)] hover:opacity-80"
          : "text-muted-foreground hover:text-foreground"
      } ${className || ""}`}
      style={enabled ? { filter: "drop-shadow(0 0 6px var(--gain))" } : undefined}
    >
      {enabled ? <Mic size={20} /> : <MicOff size={20} />}
    </button>
  );
}
