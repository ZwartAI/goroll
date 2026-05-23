import type { Character } from "@/lib/game";
import portraitFrameDefault from "@/assets/character-sheet/portrait-frame-default.png";

type Props = {
  character: Pick<Character, "name" | "color" | "image_url" | "image_offset_x" | "image_offset_y" | "image_scale"> & {
    level?: number | null;
    portrait_frame_url?: string | null;
  };
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  level?: number;
};

// Adjustable layout constants for the framed portrait.
// - frameScale/frameOffset: how much the decorative frame overflows the base square
// - levelX/levelY: percentage position of the level number (relative to the scaled frame)
const PORTRAIT_FRAME_LAYOUT = {
  frameScale: 1.08,
  frameOffsetX: -2,
  frameOffsetY: -2,
  levelX: 13,
  levelY: 17,
};


export function FramedCharacterPortrait({ character, onClick, ariaLabel, className = "", level }: Props) {
  const frameUrl = (character as any).portrait_frame_url || portraitFrameDefault;
  const ox = character.image_offset_x ?? 50;
  const oy = character.image_offset_y ?? 50;
  const scale = character.image_scale || 1;
  const lvl = level ?? (character as any).level ?? 1;

  const { frameScale, frameOffsetX, frameOffsetY, levelX, levelY } = PORTRAIT_FRAME_LAYOUT;

  const Inner = (
    <div
      className={`relative aspect-square w-full select-none ${className}`}
      style={{ overflow: "visible" }}
    >
      {/* Inner portrait area, inset to match the frame's inner opening (base, unscaled) */}
      <div
        className="absolute overflow-hidden bg-[var(--secondary)]"
        style={{ inset: "9%", borderRadius: "6%" }}
      >
        {character.image_url ? (
          <img
            src={character.image_url}
            alt={character.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
            style={{
              transform: `translate(${ox - 50}%, ${oy - 50}%) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <span className="font-display text-3xl" style={{ color: character.color }}>
              {character.name.charAt(0)}
            </span>
          </div>
        )}
      </div>

      {/* Scaled frame + level wrapper — overflows base square upward/left */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          overflow: "visible",
          transform: `scale(${frameScale}) translate(${frameOffsetX}%, ${frameOffsetY}%)`,
          transformOrigin: "center center",
        }}
      >
        <img
          src={frameUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {/* Level number centered inside the frame's circle */}
        <div
          className="absolute pointer-events-none flex items-center justify-center text-center"
          style={{
            left: `${levelX}%`,
            top: `${levelY}%`,
            width: "12%",
            height: "12%",
            transform: "translate(-50%, -50%)",
            lineHeight: 1,
            zIndex: 10,
          }}
          aria-label={`Level ${lvl}`}
        >
          <span
            className="font-display font-bold leading-none text-base sm:text-lg text-center"
            style={{
              color: "rgba(255,255,255,0.85)",
              textShadow: "0 1px 2px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6)",
            }}
          >
            {lvl}
          </span>

        </div>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="block w-full p-0 bg-transparent border-0 transition-transform active:scale-[0.98]"
        style={{ WebkitTapHighlightColor: "transparent", overflow: "visible" }}
      >
        {Inner}
      </button>
    );
  }
  return Inner;
}
