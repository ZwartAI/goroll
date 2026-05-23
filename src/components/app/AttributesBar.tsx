import { useT } from "@/lib/i18n";
import { fmtMod, modifier } from "@/lib/game";
import attrEs from "@/assets/attributes-es.png";
import attrEn from "@/assets/attributes-en.png";

type Char = {
  fue: number; des: number; con: number; int_stat: number; wis: number; car: number;
};

const ATTRS = [
  { k: "fue",      color: "var(--stat-fue)", esLabel: "Fuerza",       enLabel: "Strength",     x: 10.2, y: 57 },
  { k: "des",      color: "var(--stat-des)", esLabel: "Destreza",     enLabel: "Dexterity",    x: 26.8, y: 57 },
  { k: "con",      color: "var(--stat-con)", esLabel: "Constitución", enLabel: "Constitution", x: 42.8, y: 57 },
  { k: "int_stat", color: "var(--stat-int)", esLabel: "Inteligencia", enLabel: "Intelligence", x: 58.4, y: 57 },
  { k: "wis",      color: "var(--stat-sab)", esLabel: "Sabiduría",    enLabel: "Wisdom",       x: 73.6, y: 57 },
  { k: "car",      color: "var(--stat-car)", esLabel: "Carisma",      enLabel: "Charisma",     x: 89.4, y: 57 },
] as const;

export function AttributesBar({ character }: { character: Char }) {
  const { t, lang } = useT();
  const asset = lang === "en" ? attrEn : attrEs;

  return (
    <div className="mb-3">
      <h2 className="font-display text-xs uppercase tracking-widest text-center mb-2 text-[var(--gold)]">
        {t("profile.attributes")}
      </h2>
      <div className="relative w-full select-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>
        <img
          src={asset}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="w-full h-auto block pointer-events-none select-none"
        />
        {ATTRS.map(({ k, color, esLabel, enLabel, x, y }) => {
          const v = (character as any)[k] as number;
          const mod = fmtMod(modifier(v));
          const label = lang === "en" ? enLabel : esLabel;
          const aria = lang === "en"
            ? `${label} modifier ${mod}`
            : `${label} modificador ${mod}`;
          return (
            <button
              key={k}
              type="button"
              aria-label={aria}
              className="absolute flex items-center justify-center font-display font-bold leading-none transition-transform duration-100 ease-out active:scale-[0.92] active:translate-y-px focus:outline-none"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: "14%",
                height: "35%",
                transform: "translate(-50%, -50%)",
                color,
                fontSize: "clamp(1.25rem, 4.4vw, 2.25rem)",
                textShadow: `0 0 10px color-mix(in oklab, ${color} 55%, transparent), 0 0 2px color-mix(in oklab, ${color} 80%, transparent)`,
                WebkitUserSelect: "none",
                userSelect: "none",
                WebkitTapHighlightColor: "transparent",
                touchAction: "manipulation",
                background: "transparent",
                border: "none",
                padding: 0,
              }}
            >
              <span className="pointer-events-none" style={{ WebkitUserSelect: "none", userSelect: "none" }}>{mod}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
