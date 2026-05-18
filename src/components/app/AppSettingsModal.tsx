import { THEMES, useTheme, type ThemeKey } from "@/lib/theme";
import { X } from "lucide-react";

type Props = { onClose: () => void };

export function AppSettingsModal({ onClose }: Props) {
  const { theme, setTheme } = useTheme();
  return (
    <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card p-5 max-w-sm w-full space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg text-[var(--gold)]">⚙️ Ajustes</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="gem-divider" />

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Tema de color</p>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map(t => (
              <button
                key={t.key}
                onClick={() => setTheme(t.key as ThemeKey)}
                className={`flex flex-col items-center gap-1 rounded-lg p-2 border transition ${
                  theme === t.key ? "border-[var(--gold)]" : "border-border hover:border-[var(--gold)]/50"
                }`}
                title={t.label}
              >
                <span className="w-8 h-8 rounded-full border border-black/30" style={{ background: t.swatch }} />
                <span className="text-[9px] text-center leading-tight">{t.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            El tema se aplica a fondos, cuadros, paneles y modales de toda la app.
          </p>
        </div>

        <div className="gem-divider" />

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Idioma</p>
          <p className="text-xs text-muted-foreground">
            Próximamente: traducción ES / EN.
          </p>
        </div>

        <div className="gem-divider" />

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Acerca de</p>
          <p className="text-xs text-muted-foreground">Vamos a Rolear · códice digital</p>
        </div>

        <button className="btn-fantasy w-full" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
