import React, { useEffect, useState } from "react";
import { Check, Sparkles, UserCheck, X } from "lucide-react";
import type { Character } from "../types";
import { cropQuadrant } from "../lib/imageCrop";
import { Spinner } from "./ui";

export function CastingPickerModal({
  character,
  sheetUrl,
  onSelectAvatar,
  onClose,
}: {
  character: Character;
  sheetUrl: string;
  onSelectAvatar: (croppedAvatarUrl: string) => void;
  onClose: () => void;
}) {
  const [variations, setVariations] = useState<{ id: 1 | 2 | 3 | 4; label: string; url: string | null }[]>([
    { id: 1, label: "Variación 1 · Frontal Primer Plano", url: null },
    { id: 2, label: "Variación 2 · Perfil 3/4", url: null },
    { id: 3, label: "Variación 3 · Plano Medio", url: null },
    { id: 4, label: "Variación 4 · Perspectiva Alternativa", url: null },
  ]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCrops() {
      setLoading(true);
      try {
        const [q1, q2, q3, q4] = await Promise.all([
          cropQuadrant(sheetUrl, 1).catch(() => null),
          cropQuadrant(sheetUrl, 2).catch(() => null),
          cropQuadrant(sheetUrl, 3).catch(() => null),
          cropQuadrant(sheetUrl, 4).catch(() => null),
        ]);

        if (active) {
          setVariations([
            { id: 1, label: "Variación 1 · Frontal", url: q1 },
            { id: 2, label: "Variación 2 · Ángulo 3/4", url: q2 },
            { id: 3, label: "Variación 3 · Cuerpo Medio", url: q3 },
            { id: 4, label: "Variación 4 · Ángulo Alternativo", url: q4 },
          ]);
          setLoading(false);
        }
      } catch {
        if (active) setLoading(false);
      }
    }

    loadCrops();
    return () => {
      active = false;
    };
  }, [sheetUrl]);

  const handleSelect = (url: string | null, id: number) => {
    if (!url) return;
    setSelectingId(id);
    onSelectAvatar(url);
    setTimeout(() => {
      onClose();
    }, 250);
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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size={24} />
              <p className="text-[12px] text-zinc-400 font-medium">
                Separando las 4 variaciones del actor en alta definición…
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {variations.map((v) => {
                const isSelecting = selectingId === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => handleSelect(v.url, v.id)}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border bg-zinc-900/60 transition cursor-pointer hover:border-signal hover:shadow-lg hover:shadow-signal/10 ${
                      isSelecting
                        ? "border-signal ring-2 ring-signal/50 bg-signal/5"
                        : "border-zinc-800"
                    }`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-black">
                      {v.url ? (
                        <img
                          src={v.url}
                          alt={v.label}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-600 text-xs">
                          Sin vista
                        </div>
                      )}

                      {/* Number badge */}
                      <span className="absolute top-2 left-2 rounded-md bg-black/80 px-2 py-0.5 text-[10.5px] font-bold text-zinc-200 backdrop-blur">
                        #{v.id}
                      </span>

                      {/* Hover check overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-2xs">
                        <span className="flex items-center gap-1.5 rounded-lg bg-signal px-3 py-1.5 text-[11px] font-bold text-black shadow-xl">
                          <Check size={13} /> Seleccionar #{v.id}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 text-center">
                      <div className="truncate text-[11.5px] font-semibold text-zinc-200">
                        {v.label}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(v.url, v.id);
                        }}
                        className="mt-2 w-full rounded-md border border-zinc-700/80 bg-zinc-800 py-1 text-[10.5px] font-semibold text-signal hover:bg-zinc-700 transition"
                      >
                        {isSelecting ? "¡Seleccionado!" : "Elegir este"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3">
          <p className="text-[11px] text-zinc-500">
            Al seleccionar uno, ese ángulo recortado en alta definición se convertirá en la imagen de referencia del protagonista.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost text-[11.5px]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
