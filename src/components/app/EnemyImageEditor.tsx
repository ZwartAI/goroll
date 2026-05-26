import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EnemyImageState = {
  url: string;
  offsetX: number; // 0..100 (50 = centered)
  offsetY: number;
  scale: number;
};

/**
 * Square (1:1) image editor with a circular guide overlay — used in the
 * Monster/Enemy editors. Lets the DM upload a personal asset for the monster
 * and reposition/zoom it; the final framing applies everywhere the monster
 * is rendered (bestiary card, combat list, sheets, logs…) because the
 * circular crop matches the runtime portrait shape.
 */
export function EnemyImageEditor({
  value,
  onChange,
  fallbackUrl,
  storageKey,
}: {
  value: EnemyImageState;
  onChange: (v: EnemyImageState) => void;
  /** Asset URL to preview when no custom image is uploaded. */
  fallbackUrl?: string | null;
  /** Folder prefix inside the `avatars` bucket. */
  storageKey: string;
}) {
  const { t } = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);

  const url = value.url || "";
  const showUrl = url || fallbackUrl || "";
  const { offsetX: ox, offsetY: oy, scale } = value;

  const zoomMin = 0.5;
  const zoomMax = 6;
  const clampScale = (s: number) => Math.min(zoomMax, Math.max(zoomMin, s));
  const clampOffset = (v: number) => Math.min(200, Math.max(-100, v));

  // Pointer + pinch handling, identical UX to the character image editor.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef<{ d: number; s: number; ox: number; oy: number; mx: number; my: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!showUrl) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox, oy };
      gesture.current = null;
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      gesture.current = {
        d: Math.hypot(dx, dy) || 1, s: scale, ox, oy,
        mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2,
      };
      drag.current = null;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (pointers.current.size >= 2 && gesture.current) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const newScale = clampScale(gesture.current.s * (dist / gesture.current.d));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const ddx = midX - gesture.current.mx;
      const ddy = midY - gesture.current.my;
      onChange({
        url,
        scale: newScale,
        offsetX: clampOffset(gesture.current.ox + (ddx / (rect.width * newScale)) * 100),
        offsetY: clampOffset(gesture.current.oy + (ddy / (rect.height * newScale)) * 100),
      });
    } else if (drag.current) {
      const ddx = e.clientX - drag.current.x;
      const ddy = e.clientY - drag.current.y;
      onChange({
        url, scale,
        offsetX: clampOffset(drag.current.ox + (ddx / (rect.width * scale)) * 100),
        offsetY: clampOffset(drag.current.oy + (ddy / (rect.height * scale)) * 100),
      });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!showUrl) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    onChange({ url, offsetX: ox, offsetY: oy, scale: clampScale(scale * factor) });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${storageKey}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // Reset framing for the new image.
    onChange({ url: data.publicUrl, offsetX: 50, offsetY: 50, scale: 1 });
    setUploading(false);
  }

  function clearCustom() {
    onChange({ url: "", offsetX: 50, offsetY: 50, scale: 1 });
  }

  return (
    <div className="space-y-2">
      {/* 1:1 preview with circular guide that mirrors how the monster is shown elsewhere. */}
      <div
        ref={previewRef}
        className={`relative aspect-square w-full max-w-[220px] mx-auto rounded-lg overflow-hidden bg-[var(--secondary)] border border-border ${showUrl ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {showUrl ? (
          <img
            src={showUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            style={{
              transform: `translate(${ox - 50}%, ${oy - 50}%) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs px-4 text-center">
            {t("bestiary.imgEmpty")}
          </div>
        )}
        {/* Circle guide: shows the visible crop in lists/cards. */}
        <div className="absolute inset-0 pointer-events-none rounded-full ring-2 ring-[var(--gold)]/70" />
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-fantasy text-xs flex items-center justify-center gap-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Camera size={12} /> {uploading ? t("profile.uploading") : t("bestiary.imgUpload")}
        </button>
        <button type="button" className="btn-fantasy text-xs flex items-center justify-center gap-1" disabled={!url} onClick={clearCustom}>
          <Trash2 size={12} /> {t("bestiary.imgClear")}
        </button>
      </div>

      {showUrl && (
        <div className="space-y-1.5">
          <label className="text-[11px] flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("profile.zoom")}</span>
            <input type="range" min={zoomMin} max={zoomMax} step={0.05} value={scale}
              onChange={(e) => onChange({ url, offsetX: ox, offsetY: oy, scale: clampScale(+e.target.value) })}
              className="flex-1" />
            <span className="font-mono text-[10px] w-10 text-right">{scale.toFixed(2)}x</span>
          </label>
          <label className="text-[11px] flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("profile.posX")}</span>
            <input type="range" min={-100} max={200} value={ox}
              onChange={(e) => onChange({ url, offsetX: clampOffset(+e.target.value), offsetY: oy, scale })}
              className="flex-1" />
            <span className="font-mono text-[10px] w-10 text-right">{ox | 0}</span>
          </label>
          <label className="text-[11px] flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("profile.posY")}</span>
            <input type="range" min={-100} max={200} value={oy}
              onChange={(e) => onChange({ url, offsetX: ox, offsetY: clampOffset(+e.target.value), scale })}
              className="flex-1" />
            <span className="font-mono text-[10px] w-10 text-right">{oy | 0}</span>
          </label>
        </div>
      )}
    </div>
  );
}
