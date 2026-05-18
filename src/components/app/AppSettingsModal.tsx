import { THEMES, useTheme, type ThemeKey } from "@/lib/theme";
import { useT, type Lang } from "@/lib/i18n";
import { X } from "lucide-react";

type Props = { onClose: () => void };

export function AppSettingsModal({ onClose }: Props) {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useT();

  const langs: { key: Lang; label: string; flag: string }[] = [
    { key: "es", label: t("langs.es"), flag: "🇪🇸" },
    { key: "en", label: t("langs.en"), flag: "🇬🇧" },
  ];

  return (
    <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-5 max-w-sm w-full space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-[var(--gold)]">{t("settings.title")}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="gem-divider" />

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings.langLabel")}</p>
          <div className="grid grid-cols-2 gap-2">
            {langs.map(l => (
              <button
                key={l.key}
                onClick={() => setLang(l.key)}
                className={`flex items-center justify-center gap-2 rounded-lg p-2 border transition text-xs ${
                  lang === l.key ? "border-[var(--gold)] bg-[var(--gold)]/10" : "border-border hover:border-[var(--gold)]/50"
                }`}
              >
                <span className="text-lg">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">{t("settings.langHint")}</p>
        </div>

        <div className="gem-divider" />

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings.themeLabel")}</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map(th => {
              const label = t(`colors.${th.key}`);
              return (
              <button
                key={th.key}
                onClick={() => setTheme(th.key as ThemeKey)}
                className={`flex flex-col items-center gap-1 rounded-lg p-2 border transition ${
                  theme === th.key ? "border-[var(--gold)]" : "border-border hover:border-[var(--gold)]/50"
                }`}
                title={label}
              >
                <span className="w-8 h-8 rounded-full border border-black/30" style={{ background: th.swatch }} />
                <span className="text-[9px] text-center leading-tight">{label}</span>
              </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">{t("settings.themeHint")}</p>
        </div>

        <div className="gem-divider" />

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("settings.aboutLabel")}</p>
          <p className="text-xs text-muted-foreground">{t("common.appTagline")}</p>
        </div>

        <button className="btn-fantasy w-full" onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}
