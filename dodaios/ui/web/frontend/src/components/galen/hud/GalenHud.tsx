/** Authenticated optional HUD using real Dodaios voice state and OpenDex components. */
import { useCallback } from "react";
import { useEventStore } from "@/store/events";
import { JarvisReactor } from "./jarvis-reactor";
import { HudRing } from "./hud-widgets";
import type { DexStatus } from "./state";
import "./hud.css";

export function GalenHud() {
  const state = useEventStore((s) => s.voiceState);
  const assistantName = useEventStore((s) => s.assistantName);
  const status: DexStatus =
    state === "listening" ? "active_listening" :
    state === "thinking" ? "thinking" :
    state === "speaking" ? "speaking" :
    state === "error" ? "error" :
    state === "paused" ? "muted" : "idle";
  // No synthetic microphone amplitudes: real state drives the mode.
  const getAmplitude = useCallback(() => 0, []);
  const labels: Record<DexStatus, string> = {
    idle: "Готов", listening_wake: "Ожидание", active_listening: "Слушаю",
    follow_up_listening: "Слушаю", thinking: "Думаю", speaking: "Говорю",
    muted: "Пауза", error: "Ошибка", unsupported: "Недоступно",
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background text-foreground" data-testid="galen-hud">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{backgroundImage:"linear-gradient(#ddd 1px, transparent 1px),linear-gradient(90deg,#ddd 1px, transparent 1px)",backgroundSize:"44px 44px"}}/>
      <header className="absolute top-6 left-8 right-8 flex items-center justify-between text-sm tracking-widest">
        <div><span className="font-bold">GALEN</span><span className="ml-3 text-white/40">by GALENITE</span></div>
        <button onClick={()=>window.location.assign("/")} className="rounded-md border border-white/25 px-4 py-2 hover:bg-white/10">Вернуться в Galen</button>
      </header>
      <div className="relative">
        <HudRing size={140} className="absolute -left-16 top-5 opacity-30"/>
        <HudRing size={100} className="absolute -right-10 bottom-12 opacity-25"/>
        <JarvisReactor status={status} getAmplitude={getAmplitude}/>
      </div>
      <h1 className="text-2xl font-semibold tracking-[.25em] uppercase">{assistantName || "Galen"}</h1>
      <p className="mt-3 text-white/60">{labels[status]}</p>
      <p className="absolute bottom-7 text-xs text-white/40">Реальный статус голосового контура. Альтернативный HUD — OpenDex / Galenite.</p>
    </div>
  );
}
