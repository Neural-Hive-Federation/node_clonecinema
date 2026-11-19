import React, { useState } from "react";
import { Check, Sparkles, UserCheck, X } from "lucide-react";
import type { Character } from "../types";

export function CastingPickerModal({
  character,
  variations,
  onSelectAvatar,
  onClose,
}: {
  character: Character;
  variations: string[];
  onSelectAvatar: (selectedAvatarUrl: string) => void;
  onClose: () => void;
}) {
  const [selectingId, setSelectingId] = useState<number | null>(null);

  const handleSelect = (url: string, id: number) => {
    if (!url) return;
    setSelectingId(id);
    onSelectAvatar(url);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md transition-all animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-signal/30 bg-signal/10 text-signal">
              <UserCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-white">
                  Casting de Personaje · Seleccionar Actor Principal
                </h3>
                <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-300">
                  {character.name}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-zinc-400">
                Haz clic sobre la variación que más te guste para fijarla como el rostro y avatar oficial de tu protagonista.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* 4 Variations Grid */}
        <div className="flex-1 overflow-y-auto py-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {variations.map((url, idx) => {
              const id = idx + 1;
              const isSelecting = selectingId === id;
              const isCurrent = character.avatarUrl === url;

              return (
                <div
                  key={id}
                  onClick={() => handleSelect(url, id)}
                  className={`group relative flex flex-col overflow-hidden rounded-xl border bg-zinc-900/60 transition cursor-pointer hover:border-signal hover:shadow-lg hover:shadow-signal/10 ${
                    isSelecting || isCurrent
                      ? "border-signal ring-2 ring-signal/50 bg-signal/5"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-black">
                    <img
                      src={url}
                      alt={`Opción ${id}`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Number badge */}
                    <span className="absolute top-2 left-2 rounded-md bg-black/80 px-2 py-0.5 text-[10.5px] font-bold text-zinc-200 backdrop-blur">
                      Opción #{id}
                    </span>

                    {isCurrent && (
                      <span className="absolute top-2 right-2 rounded-md bg-signal px-2 py-0.5 text-[10px] font-bold text-black shadow">
                        Actual
                      </span>
                    )}

                    {/* Hover check overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-2xs">
                      <span className="flex items-center gap-1.5 rounded-lg bg-signal px-3 py-1.5 text-[11px] font-bold text-black shadow-xl">
                        <Check size={13} /> Seleccionar #{id}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 text-center">
                    <div className="truncate text-[11.5px] font-semibold text-zinc-200">
                      Variación #{id}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(url, id);
                      }}
                      className="mt-2 w-full rounded-md border border-zinc-700/80 bg-zinc-800 py-1 text-[10.5px] font-semibold text-signal hover:bg-zinc-700 transition"
                    >
                      {isSelecting ? "¡Seleccionado!" : isCurrent ? "Seleccionado" : "Elegir este"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3">
          <p className="text-[11px] text-zinc-500">
            Cada opción es una foto cinematográfica individual generada con el mismo prompt.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
