import React, { useEffect, useRef } from "react";
import {
  Brain,
  CheckCircle2,
  Clapperboard,
  Clock,
  ExternalLink,
  Film,
  Mic,
  Rocket,
  Sparkles,
  Terminal,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import type { AutoPilotState } from "../lib/autoPilot";
import { Spinner } from "./ui";

export function AutoPilotModal({
  state,
  onClose,
  onGoToStudio,
  projectTitle,
}: {
  state: AutoPilotState;
  onClose: () => void;
  onGoToStudio: () => void;
  projectTitle: string;
}) {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [state.logs]);

  const stages = [
    { num: 1, label: "ADN & Guión", icon: Brain },
    { num: 2, label: "Casting & Keyframes", icon: Film },
    { num: 3, label: "Voces & Música", icon: Volume2 },
    { num: 4, label: "Video Wan I2V", icon: Clapperboard },
    { num: 5, label: "Master & Publicar", icon: Rocket },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-5">
      <div className="relative flex flex-col max-h-[92vh] w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-signal/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-signal/15 border border-signal/30 text-signal">
              <Zap size={18} className="fill-signal" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white tracking-wide">
                  Director en Piloto Automático
                </span>
                <span className="rounded-full bg-signal/10 border border-signal/30 px-2 py-0.5 text-[10px] font-semibold text-signal uppercase tracking-wider">
                  Full Autonomous
                </span>
              </div>
              <p className="text-[11.5px] text-zinc-400 truncate max-w-[340px] sm:max-w-md">
                {projectTitle || "Clonando video ganador..."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            title="Minimizar modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Progress Bar & Current Status */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                {!state.isComplete && !state.error && <Spinner className="text-signal" />}
                {state.isComplete ? (
                  <span className="text-signal flex items-center gap-1">
                    <CheckCircle2 size={14} /> ¡Clonación 100% Completada!
                  </span>
                ) : state.error ? (
                  <span className="text-red-400">Detenido por error</span>
                ) : (
                  state.stageName
                )}
              </span>
              <span className="font-mono font-bold text-signal text-sm">
                {state.percent}%
              </span>
            </div>

            {/* Barra */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  state.error
                    ? "bg-red-500"
                    : state.isComplete
                    ? "bg-signal shadow-[0_0_12px_rgba(200,250,90,0.6)]"
                    : "bg-signal shadow-[0_0_10px_rgba(200,250,90,0.4)]"
                }`}
                style={{ width: `${state.percent}%` }}
              />
            </div>

            <p className="text-[11.5px] text-zinc-400">
              {state.currentAction || "Procesando componentes..."}
            </p>
          </div>

          {/* Stepper Visual */}
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {stages.map((st) => {
              const Icon = st.icon;
              const isPast = state.stage > st.num || state.isComplete;
              const isCurrent = state.stage === st.num && !state.isComplete;

              return (
                <div
                  key={st.num}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                    isPast
                      ? "border-signal/40 bg-signal/5 text-signal"
                      : isCurrent
                      ? "border-signal bg-zinc-900 text-white shadow-md shadow-signal/10"
                      : "border-zinc-800/70 bg-zinc-900/20 text-zinc-500"
                  }`}
                >
                  <div className="relative mb-1">
                    <Icon size={16} />
                    {isPast && (
                      <CheckCircle2
                        size={10}
                        className="absolute -top-1 -right-1 text-signal fill-black"
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold leading-tight line-clamp-1">
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Live Terminal Logs */}
          <div className="rounded-xl border border-zinc-800 bg-black/70 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800/70 pb-2">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal size={12} className="text-signal" /> Registros del Director en Vivo
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {state.logs.length} eventos
              </span>
            </div>

            <div
              ref={logContainerRef}
              className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1"
            >
              {state.logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 leading-relaxed ${
                    log.type === "success"
                      ? "text-emerald-400"
                      : log.type === "warning"
                      ? "text-amber-400"
                      : log.type === "error"
                      ? "text-red-400 font-bold"
                      : "text-zinc-400"
                  }`}
                >
                  <span className="text-zinc-600 shrink-0 text-[10px]">[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
              {!state.logs.length && (
                <p className="text-zinc-600 text-center py-4">Iniciando motor de clonación...</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/60 px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-3.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
          >
            {state.isComplete ? "Cerrar" : "Continuar en segundo plano"}
          </button>

          <button
            onClick={onGoToStudio}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-lg ${
              state.isComplete
                ? "bg-signal text-black hover:bg-signal/90 shadow-signal/20 animate-bounce"
                : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            <Sparkles size={14} className={state.isComplete ? "fill-black" : ""} />
            <span>{state.isComplete ? "🚀 Ver y Publicar Video Final" : "Abrir Estudio"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
