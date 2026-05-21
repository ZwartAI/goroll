import { useEffect } from "react";

export type ConfirmVariant = "danger" | "warning" | "normal";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Reusable in-app confirmation modal. Replaces native window.confirm so the
 * RPG/fantasy theme stays consistent across destructive actions.
 */
export function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel,
  variant = "normal", busy, onConfirm, onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmStyle =
    variant === "danger"
      ? { background: "var(--loss)", color: "white" }
      : variant === "warning"
        ? { background: "color-mix(in oklab, var(--gold) 70%, var(--loss))", color: "oklch(0.15 0.03 25)" }
        : { background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-3"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="ornate-card max-w-sm w-full p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{description}</p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button className="btn-fantasy" onClick={onCancel} disabled={busy}>
            {cancelLabel || "Cancelar"}
          </button>
          <button
            className="btn-fantasy"
            style={confirmStyle}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
