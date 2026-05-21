import { useState } from "react";
import { useT } from "@/lib/i18n";
import { Coins, Minus, Plus, X } from "lucide-react";

/** Legacy inline coin adjuster — kept for DM character sheet modal. */
export function CoinsAdjuster({ onApply }: { onApply: (delta: number) => void | Promise<void> }) {
  const [open, setOpen] = useState<"add" | "sub" | null>(null);
  const [val, setVal] = useState("");
  const { t } = useT();
  const n = parseInt(val, 10);
  return (
    <>
      <div className="flex gap-1 justify-center">
        <button
          onClick={() => { setOpen("add"); setVal(""); }}
          className="text-[10px] px-2 py-1 rounded bg-[var(--gold)] text-black font-display"
          title={t("coins.receiveAria")}
        >🪙 +</button>
        <button
          onClick={() => { setOpen("sub"); setVal(""); }}
          className="text-[10px] px-2 py-1 rounded font-display text-white"
          style={{ background: "var(--gradient-blood, var(--loss))" }}
          title={t("coins.payAria")}
        >💸 −</button>
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="ornate-card p-4 max-w-xs w-full space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-center">
              {open === "add" ? t("coins.receive") : t("coins.pay")}
            </h3>
            <input
              autoFocus type="number" min={1} inputMode="numeric"
              value={val} onChange={e => setVal(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={t("coins.amount")}
              className="w-full bg-input border border-border rounded px-3 py-2 text-center text-lg"
            />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy" onClick={() => setOpen(null)}>{t("common.cancel")}</button>
              <button
                className="btn-fantasy"
                style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
                disabled={!n || n <= 0}
                onClick={async () => {
                  if (!n || n <= 0) return;
                  await onApply(open === "add" ? n : -n);
                  setOpen(null); setVal("");
                }}
              >OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Purse modal — opens from a long-press on the coins tile in the character sheet.
 * Lets the player/DM add or spend coins through the same `onApply(delta)` contract.
 */
export function CoinsPurseModal({
  current,
  onApply,
  onClose,
}: {
  current: number;
  onApply: (delta: number) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [val, setVal] = useState("");
  const n = parseInt(val, 10);
  const validAdd = Number.isFinite(n) && n > 0;
  const validSpend = validAdd && n <= current;

  async function apply(delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return;
    await onApply(delta);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="ornate-card p-4 max-w-xs w-full space-y-4 relative"
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, oklch(0.20 0.04 60), oklch(0.13 0.02 40))",
          borderColor: "color-mix(in oklab, var(--gold) 70%, transparent)",
          boxShadow: "0 18px 40px -16px oklch(0 0 0 / 0.7), inset 0 0 18px color-mix(in oklab, var(--gold) 18%, transparent)",
        }}
      >
        <button
          onClick={onClose}
          aria-label={t("common.cancel")}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-[var(--gold)]">
            <Coins size={20} />
            <h3 className="font-display text-lg rune-glow">{t("purse.title")}</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("purse.subtitle")}</p>
          <p className="font-display text-2xl text-[var(--gold)] pt-1">{current}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("profile.coins")}</p>
        </div>

        <div className="gem-divider" />

        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("coins.amount")}
          </label>
          <input
            autoFocus
            type="number"
            min={1}
            inputMode="numeric"
            value={val}
            onChange={e => setVal(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("coins.amount")}
            className="w-full bg-input border border-[var(--gold)]/40 rounded px-3 py-2 text-center text-lg font-display"
          />
          {validAdd && !validSpend && (
            <p className="text-[10px] text-[var(--loss)] text-center">
              {t("purse.notEnough")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn-fantasy flex items-center justify-center gap-1.5 font-display"
            style={{ background: "var(--gradient-blood, var(--loss))", color: "white" }}
            disabled={!validSpend}
            onClick={() => apply(-n)}
          >
            <Minus size={14} /> {t("purse.spend")}
          </button>
          <button
            className="btn-fantasy flex items-center justify-center gap-1.5 font-display"
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            disabled={!validAdd}
            onClick={() => apply(n)}
          >
            <Plus size={14} /> {t("purse.add")}
          </button>
        </div>

        <button className="btn-fantasy w-full !py-1.5 text-xs" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
