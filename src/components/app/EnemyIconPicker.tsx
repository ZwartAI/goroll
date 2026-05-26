import {
  Skull, Sword, Shield, Eye, Flame, Bug, Crown, Ghost, PawPrint, Drama, Swords, Cloud,
  type LucideIcon,
} from "lucide-react";
import normalAsset from "@/assets/combat-ranks/normal.png";
import eliteAsset from "@/assets/combat-ranks/elite.png";
import bossAsset from "@/assets/combat-ranks/boss.png";
import godAsset from "@/assets/combat-ranks/god.png";
import heroFemAsset from "@/assets/combat-ranks/hero_female.png";
import heroMaleAsset from "@/assets/combat-ranks/hero_male.png";

export const ENEMY_ICONS: Record<string, LucideIcon> = {
  skull: Skull,
  sword: Sword,
  shield: Shield,
  eye: Eye,
  flame: Flame,
  bug: Bug,
  crown: Crown,
  ghost: Ghost,
  paw: PawPrint,
  mask: Drama,
  swords: Swords,
  shadow: Cloud,
};

export const ENEMY_ASSETS: Record<string, string> = {
  normal: normalAsset,
  elite: eliteAsset,
  boss: bossAsset,
  god: godAsset,
  hero_female: heroFemAsset,
  hero_male: heroMaleAsset,
};

export const ENEMY_COLORS = [
  "#ef4444", "#a855f7", "#1e3a8a", "#16a34a", "#eab308", "#6b7280", "#0f172a",
];

/** Detect if an icon_key refers to a bundled visual asset (prefix `asset:`). */
export function getEnemyAssetUrl(key: string | null | undefined): string | null {
  if (!key || !key.startsWith("asset:")) return null;
  return ENEMY_ASSETS[key.slice(6)] || null;
}

export type EnemyCustomImage = {
  url: string;
  offsetX?: number; // 0..100 (50 = center)
  offsetY?: number;
  scale?: number;
};

/**
 * Extract the custom-image framing from a record. Works for both bestiary
 * templates (`image_url`, `image_offset_x`, …) and combat participants
 * (`image_url`, `enemy_image_offset_x`, …). Returns null when no custom
 * image is set so callers can fall back to the visual asset / lucide icon.
 */
export function getEnemyCustomImage(entity: any): EnemyCustomImage | null {
  if (!entity) return null;
  const url: string = entity.image_url || "";
  if (!url) return null;
  const ox = entity.image_offset_x ?? entity.enemy_image_offset_x ?? 50;
  const oy = entity.image_offset_y ?? entity.enemy_image_offset_y ?? 50;
  const sc = entity.image_scale ?? entity.enemy_image_scale ?? 1;
  return { url, offsetX: Number(ox), offsetY: Number(oy), scale: Number(sc) };
}

export function EnemyIcon({
  name, size = 24, color, fill = false, assetScale = 1, customImage,
}: {
  name: string | null | undefined;
  size?: number;
  color?: string;
  fill?: boolean;
  /** Scale factor applied only to tier visual assets (not to lucide icons). */
  assetScale?: number;
  /** When present, render this uploaded image (with the saved framing) as a
   *  circular avatar instead of the asset / lucide icon. */
  customImage?: EnemyCustomImage | null;
}) {
  // Custom uploaded image takes precedence over assets / lucide icons.
  if (customImage?.url) {
    const ox = customImage.offsetX ?? 50;
    const oy = customImage.offsetY ?? 50;
    const sc = customImage.scale ?? 1;
    const tx = `translate(${ox - 50}%, ${oy - 50}%) scale(${sc})`;
    if (fill) {
      return (
        <img
          src={customImage.url}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{ objectPosition: "center", transform: tx, transformOrigin: "center" }}
        />
      );
    }
    return (
      <span
        style={{ width: size, height: size, display: "inline-block", borderRadius: "9999px", overflow: "hidden", position: "relative" }}
      >
        <img
          src={customImage.url}
          alt=""
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "contain", objectPosition: "center",
            transform: tx, transformOrigin: "center",
          }}
        />
      </span>
    );
  }

  const asset = getEnemyAssetUrl(name);
  if (asset) {
    if (fill) {
      return (
        <img
          src={asset}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center", transform: assetScale !== 1 ? `scale(${assetScale})` : undefined, transformOrigin: "center" }}
        />
      );
    }
    if (assetScale !== 1) {
      return (
        <span
          style={{ width: size, height: size, display: "inline-block", borderRadius: "9999px", overflow: "hidden", position: "relative" }}
        >
          <img
            src={asset}
            alt=""
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
              transform: `scale(${assetScale})`, transformOrigin: "center",
            }}
          />
        </span>
      );
    }
    return <img src={asset} alt="" style={{ width: size, height: size, objectFit: "cover", borderRadius: "9999px" }} />;
  }
  const Icon = ENEMY_ICONS[name || "skull"] || Skull;
  return <Icon size={size} color={color} />;
}

export function EnemyIconPicker({
  value, onChange,
}: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Object.entries(ENEMY_ICONS).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`aspect-square rounded-md border flex items-center justify-center transition ${
            value === key ? "border-[var(--gold)] bg-[var(--gold)]/15" : "border-border bg-card hover:border-[var(--gold)]/50"
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}

export function EnemyColorPicker({
  value, onChange,
}: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ENEMY_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 ${value === c ? "border-[var(--gold)]" : "border-border"}`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
