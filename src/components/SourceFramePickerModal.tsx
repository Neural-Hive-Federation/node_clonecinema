import React, { useState } from "react";
import { Check, Film, Sparkles, X } from "lucide-react";

export interface SourceFrameItem {
  shotNumber: number;
  timestampSec: number;
  frameUrl: string;
  role?: string;
}

export function SourceFramePickerModal({
  frames,
  targetTitle,
  targetType,
  onSelectFrame,
  onClose,
}: {
  frames: SourceFrameItem[];
  targetTitle: string;
  targetType: "character" | "location" | "prop";
  onSelectFrame: (frameUrl: string, frame: SourceFrameItem) => void;
  onClose: () => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handlePick = (f: SourceFrameItem, idx: number) => {
    setSelectedIdx(idx);
    onSelectFrame(f.frameUrl, f);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const typeLabels = {
    character: "Rostro / Referencia de Personaje",
    location: "Referencia de Set / Entorno",
    prop: "Referencia de Prop / Objeto",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md transition-all animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Film size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-white">
                  Fotogramas Extraídos del Video Fuente (ADN Original)
                </h3>
                <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-amber-300">
                  {typeLabels[targetType]}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Selecciona el fotograma exacto del video viral para asignarlo a{" "}
                <span className="text-zinc-200 font-bold">{targetTitle}</span>. Garantiza coherencia visual 100% idéntica al original.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Frames Grid */}
        <div className="flex-1 overflow-y-auto py-5 pr-1 scrollbar-thin">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
            {frames.map((frame, idx) => {
              const isSelected = selectedIdx === idx;

              return (
                <div
                  key={idx}
                  onClick={() => handlePick(frame, idx)}
                  className={`group relative flex flex-col overflow-hidden rounded-xl border bg-zinc-900/60 transition cursor-pointer hover:border-amber-400 hover:shadow-lg hover:shadow-amber-500/10 ${
                    isSelected
                      ? "border-amber-400 ring-2 ring-amber-400/50 bg-amber-500/10"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-black/60">
                    <img
                      src={frame.frameUrl}
                      alt={`Plano ${frame.shotNumber}`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Badge de número de plano */}
                    <span className="absolute top-2 left-2 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-mono font-bold text-zinc-200 backdrop-blur">
                      Plano #{frame.shotNumber}
                    </span>

                    {/* Timestamp */}
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[9.5px] font-mono text-amber-300 backdrop-blur">
                      ⏱️ {frame.timestampSec}s
                    </span>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                      <span className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-black shadow-lg">
                        <Check size={13} /> Asignar a {targetTitle}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-[11px] text-zinc-500">
          <span>{frames.length} fotogramas extraídos por el Agente Minero</span>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
