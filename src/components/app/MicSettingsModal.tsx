import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useMicSettings, sensitivityToThreshold } from "@/lib/micSettings";
import { useT } from "@/lib/i18n";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Live mic settings modal: sensitivity, input gain, audio processing toggles, and a live meter. */
export function MicSettingsModal({ open, onOpenChange }: Props) {
  const { t } = useT();
  const { settings, update, reset } = useMicSettings();
  const [level, setLevel] = useState(0);
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  // Live meter while the modal is open. Uses its own stream so it works even
  // when the global mic is muted.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: settings.echoCancellation,
            noiseSuppression: settings.noiseSuppression,
            autoGainControl: settings.autoGainControl,
          },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = settings.gain;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(gain);
        gain.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          // Keep gain live with current settings.
          gain.gain.value = settings.gain;
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(rms);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // Ignore — user can still adjust settings without preview.
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      setLevel(0);
    };
    // Re-open the stream only when constraint-changing settings toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, settings.noiseSuppression, settings.echoCancellation, settings.autoGainControl]);

  const threshold = sensitivityToThreshold(settings.sensitivity);
  const meterPct = Math.min(100, (level / 0.3) * 100);
  const thresholdPct = Math.min(100, (threshold / 0.3) * 100);
  const isOverThreshold = level > threshold;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{t("micSettings.title")}</DialogTitle>
          <DialogDescription>
            {t("micSettings.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Live meter */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{t("micSettings.liveLevel")}</span>
              <span>{isOverThreshold ? t("micSettings.detecting") : t("micSettings.silence")}</span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 transition-[width] duration-75"
                style={{
                  width: `${meterPct}%`,
                  background: isOverThreshold ? "var(--gain, #4ade80)" : "var(--muted-foreground)",
                }}
              />
              {/* Threshold marker */}
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/70"
                style={{ left: `${thresholdPct}%` }}
                aria-hidden
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("micSettings.thresholdHint")}
            </p>
          </div>

          {/* Sensitivity */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label>{t("micSettings.sensitivity")}</label>
              <span className="text-muted-foreground">{Math.round(settings.sensitivity * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[settings.sensitivity]}
              onValueChange={(v) => update({ sensitivity: v[0] })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("micSettings.sensitivityHint")}
            </p>
          </div>

          {/* Gain */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label>{t("micSettings.inputVolume")}</label>
              <span className="text-muted-foreground">{settings.gain.toFixed(2)}×</span>
            </div>
            <Slider
              min={0}
              max={3}
              step={0.05}
              value={[settings.gain]}
              onValueChange={(v) => update({ gain: v[0] })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("micSettings.inputVolumeHint")}
            </p>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-1">
            <ToggleRow
              label={t("micSettings.noiseSuppression")}
              hint={t("micSettings.noiseSuppressionHint")}
              checked={settings.noiseSuppression}
              onChange={(v) => update({ noiseSuppression: v })}
            />
            <ToggleRow
              label={t("micSettings.echoCancellation")}
              hint={t("micSettings.echoCancellationHint")}
              checked={settings.echoCancellation}
              onChange={(v) => update({ echoCancellation: v })}
            />
            <ToggleRow
              label={t("micSettings.autoGainControl")}
              hint={t("micSettings.autoGainControlHint")}
              checked={settings.autoGainControl}
              onChange={(v) => update({ autoGainControl: v })}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={reset}>{t("micSettings.reset")}</Button>
          <Button onClick={() => onOpenChange(false)}>{t("micSettings.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label, hint, checked, onChange,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
