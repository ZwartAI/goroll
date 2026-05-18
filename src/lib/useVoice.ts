import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Voice-activity presence over Supabase realtime broadcast.
 * - When `enabled` is true, captures mic input and broadcasts speaking state.
 * - Always listens (if campaignId given) so all viewers see the green glow.
 *
 * Returns the set of character ids currently speaking and a toggle for the mic.
 */
export function useVoice(campaignId: string | undefined, characterId: string | undefined | null) {
  const [enabled, setEnabledState] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const speakingRef = useRef(false);
  const lastSentRef = useRef(0);
  const timersRef = useRef<Map<string, any>>(new Map());

  // Subscribe to the campaign voice channel.
  useEffect(() => {
    if (!campaignId) return;
    const ch = (supabase as any).channel(`voice:${campaignId}`, {
      config: { broadcast: { self: false } },
    });
    ch.on("broadcast", { event: "speak" }, ({ payload }: any) => {
      const id = payload?.id as string | undefined;
      const speaking = !!payload?.speaking;
      if (!id) return;
      setSpeakingIds(prev => {
        const next = new Set(prev);
        if (speaking) next.add(id); else next.delete(id);
        return next;
      });
      const prevTimer = timersRef.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      if (speaking) {
        const t = setTimeout(() => {
          setSpeakingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
          timersRef.current.delete(id);
        }, 1500);
        timersRef.current.set(id, t);
      }
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
      timersRef.current.clear();
      (supabase as any).removeChannel(ch);
      channelRef.current = null;
    };
  }, [campaignId]);

  // Mic capture loop when enabled.
  useEffect(() => {
    if (!enabled || !characterId) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    const cid = characterId;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const THRESHOLD = 0.045;
        let lastChange = 0;

        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const isSpeaking = rms > THRESHOLD;
          const now = performance.now();

          // Hysteresis: switch off only after 350ms of silence.
          if (isSpeaking) lastChange = now;
          const speaking = isSpeaking || (now - lastChange < 350 && speakingRef.current);

          if (speaking !== speakingRef.current || (speaking && now - lastSentRef.current > 900)) {
            speakingRef.current = speaking;
            lastSentRef.current = now;
            channelRef.current?.send({
              type: "broadcast",
              event: "speak",
              payload: { id: cid, speaking },
            });
            setSpeakingIds(prev => {
              const n = new Set(prev);
              if (speaking) n.add(cid); else n.delete(cid);
              return n;
            });
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        toast.error(e?.message || "No se pudo acceder al micrófono");
        setEnabledState(false);
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      ctx?.close().catch(() => {});
      if (speakingRef.current) {
        channelRef.current?.send({
          type: "broadcast",
          event: "speak",
          payload: { id: cid, speaking: false },
        });
        setSpeakingIds(prev => { const n = new Set(prev); n.delete(cid); return n; });
        speakingRef.current = false;
      }
    };
  }, [enabled, characterId]);

  const setEnabled = useCallback((v: boolean) => setEnabledState(v), []);
  const toggle = useCallback(() => setEnabledState(v => !v), []);

  return { enabled, setEnabled, toggle, speakingIds };
}
