/** Optional Galen HUD, driven by the real voice state. */
import { useCallback } from "react";
import { useEventStore } from "@/store/events";
import { useT } from "@/i18n";
import { PRODUCT_NAME } from "@/lib/branding";
import { JarvisReactor } from "./jarvis-reactor";
import { HudRing } from "./hud-widgets";
import { STATUS_LABEL_KEYS, type DexStatus } from "./state";
import "./hud.css";

export function GalenHud() {
  const t = useT();
  const state = useEventStore((s) => s.voiceState);
  const assistantName = useEventStore((s) => s.assistantName);
  const status: DexStatus =
    state === "listening" ? "active_listening" :
    state === "thinking" ? "thinking" :
    state === "speaking" ? "speaking" :
    state === "error" ? "error" :
    state === "paused" ? "muted" : "idle";
  // No synthetic microphone amplitudes until actual audio levels are wired.
  const getAmplitude = useCallback(() => 0, []);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground overflow-hidden" data-testid="galen-hud">
      <header className="absolute top-6 left-6 right-6 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3"><span className="font-semibold tracking-widest">{PRODUCT_NAME.toUpperCase()}</span><span className="text-muted-foreground">by GALENITE</span></div>
        <button onClick={() => window.location.assign("/")} className="rounded-md border border-border px-4 py-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">{t("common.back")}</button>
      </header>
      <div className="relative max-w-full">
        <HudRing size={140} className="absolute -left-16 top-5 opacity-20 pointer-events-none"/>
        <HudRing size={100} className="absolute -right-10 bottom-12 opacity-20 pointer-events-none"/>
        <JarvisReactor status={status} getAmplitude={getAmplitude}/>
      </div>
      <h1 className="text-2xl font-semibold tracking-[.25em] uppercase text-center px-4">{assistantName || PRODUCT_NAME}</h1>
      <p className="mt-3 text-muted-foreground" role="status" aria-live="polite">{t(STATUS_LABEL_KEYS[status])}</p>
      <p className="absolute bottom-7 text-xs text-muted-foreground">OpenDex / Galenite</p>
    </div>
  );
}
