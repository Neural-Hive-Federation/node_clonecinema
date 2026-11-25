import React, { useState } from "react";
import { Film, ImageIcon, MapPin, Maximize2, Package, Plus, Sparkles, Trash2, Upload, UserCheck, UserRound, Zap } from "lucide-react";
import type { Character, LocationRef, Project, ProjectUpdater, PropItem } from "../../types";
import { generateImage, generateImageVariations, isPaymentRequired } from "../../lib/api";
import { uploadImageFile } from "../../lib/imageUpload";
import { useSession } from "../../context/SessionContext";
import { uid } from "../../lib/project";
import { Section, Spinner, ImageLightbox } from "../ui";
import { CastingPickerModal } from "../CastingPickerModal";
import { SourceFramePickerModal } from "../SourceFramePickerModal";
import { LORA_PRESETS } from "../../lib/loraPresets";
import { synthesizeCharacterPrompt, synthesizeLocationPrompt, synthesizePropPrompt } from "../../lib/coherence";

export function CastTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [busyChr, setBusyChr] = useState<string | null>(null);
  const [busyLoc, setBusyLoc] = useState<string | null>(null);
  const [busyProp, setBusyProp] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    src: string;
    title: string;
    subtitle?: string;
    character?: Character;
  } | null>(null);
  const [castingTarget, setCastingTarget] = useState<{
    character: Character;
    variations: string[];
  } | null>(null);
  const [sourceFrameTarget, setSourceFrameTarget] = useState<{
    type: "character" | "location" | "prop";
    id: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { openPaywall, refreshAccount } = useSession();

  const setCharacters = (characters: Character[]) => patch({ characters });
  const setLocations = (locations: LocationRef[]) => patch({ locations });
  const setProps = (props: PropItem[]) => patch({ props });

  const updateCharacter = (id: string, partial: Partial<Character>) =>
    patch((prev) => ({
      characters: (prev.characters || []).map((c) => (c.id === id ? { ...c, ...partial } : c)),
    }));

  const updateLocation = (id: string, partial: Partial<LocationRef>) =>
    patch((prev) => ({
      locations: (prev.locations || []).map((l) => (l.id === id ? { ...l, ...partial } : l)),
    }));

  const updateProp = (id: string, partial: Partial<PropItem>) =>
    patch((prev) => ({
      props: (prev.props || []).map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));

  async function portrait(character: Character) {
    if (busyChr) return;
    setBusyChr(character.id);
    setError(null);
    try {
      const prompt = synthesizeCharacterPrompt(character, project.style);

      // Se envían 4 solicitudes independientes en paralelo con el mismo prompt
      const urls = await generateImageVariations(prompt, "1:1", 4);
      const chosenAvatar = urls[0] || character.avatarUrl;

      updateCharacter(character.id, {
        avatarUrl: chosenAvatar,
        castingVariations: urls,
      });
      void refreshAccount();

      // Abrir automáticamente el selector con las 4 variaciones fotográficas reales
      setCastingTarget({
        character: { ...character, avatarUrl: chosenAvatar, castingVariations: urls },
        variations: urls,
      });
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        openPaywall(err.message);
      } else {
        setError(err?.message || "Error al generar casting");
      }
    } finally {
      setBusyChr(null);
    }
  }

  async function generateLocation(location: LocationRef) {
    if (busyLoc) return;
    setBusyLoc(location.id);
    setError(null);
    try {
      const prompt = synthesizeLocationPrompt(location, project.style);
      const imageUrl = await generateImage(prompt, project.format === "16:9" ? "16:9" : "9:16");
      updateLocation(location.id, { imageUrl });
      void refreshAccount();
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        openPaywall(err.message);
      } else {
        setError(err?.message || "Error al generar set");
      }
    } finally {
      setBusyLoc(null);
    }
  }

  async function generateProp(prop: PropItem) {
    if (busyProp) return;
    setBusyProp(prop.id);
    setError(null);
    try {
      const prompt = synthesizePropPrompt(prop, project.style);
      const imageUrl = await generateImage(prompt, "1:1");
      updateProp(prop.id, { imageUrl });
      void refreshAccount();
    } catch (err: any) {
      if (isPaymentRequired(err)) {
        openPaywall(err.message);
      } else {
        setError(err?.message || "Error al generar prop");
      }
    } finally {
      setBusyProp(null);
    }
  }

  async function handleUploadCharacter(character: Character, file: File) {
    if (!file) return;
    setBusyChr(character.id);
    setError(null);
    try {
      const url = await uploadImageFile(file);
      const existing = character.castingVariations || [];
      updateCharacter(character.id, {
        avatarUrl: url,
        castingVariations: [url, ...existing.filter((u) => u !== url)],
      });
    } catch (err: any) {
      setError(err?.message || "Error al subir foto del personaje");
    } finally {
      setBusyChr(null);
    }
  }

  async function handleUploadLocation(location: LocationRef, file: File) {
    if (!file) return;
    setBusyLoc(location.id);
    setError(null);
    try {
      const url = await uploadImageFile(file);
      updateLocation(location.id, { imageUrl: url });
    } catch (err: any) {
      setError(err?.message || "Error al subir imagen del set");
    } finally {
      setBusyLoc(null);
    }
  }

  async function handleUploadProp(prop: PropItem, file: File) {
    if (!file) return;
    setBusyProp(prop.id);
    setError(null);
    try {
      const url = await uploadImageFile(file);
      updateProp(prop.id, { imageUrl: url });
    } catch (err: any) {
      setError(err?.message || "Error al subir imagen del prop");
    } finally {
      setBusyProp(null);
    }
  }

  return (
    <>
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-zinc-400 hover:text-white ml-2 text-sm"
            >
              ✕
            </button>
          </div>
        )}
        {/* 1. Protagonistas y Personajes */}
        <Section
          title="Personajes y Protagonistas"
          subtitle="Referencias bloqueadas: genera una hoja de casting con 4 variaciones y elige tu rostro favorito."
          action={
            <button
              className="btn btn-ghost text-[11.5px]"
              onClick={() =>
                setCharacters([
                  ...project.characters,
                  {
                    id: uid("chr"),
                    name: "Nuevo personaje",
                    role: "Protagonista",
                    description: "",
                    wardrobe: "",
                    color: "#c8fa5a",
                  },
                ])
              }
            >
              <Plus size={14} className="text-signal" /> Añadir
            </button>
          }
        >
          {project.characters.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-zinc-600">
              Sin personajes. El director los crea cuando genera un plan o puedes añadirlos manualmente.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {(project.characters || []).map((c) => (
                <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5 hover:border-zinc-700/80 transition">
                  <div className="flex gap-3">
                    {/* Thumbnail Box / Dropzone */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingId(c.id);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingId(null);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleUploadCharacter(c, file);
                      }}
                      onClick={() =>
                        c.avatarUrl &&
                        setLightbox({
                          src: c.avatarUrl,
                          title: c.name,
                          subtitle: `${c.role} · ${c.description || "Retrato de referencia"}`,
                          character: c,
                        })
                      }
                      title={c.avatarUrl ? "Clic para ampliar foto · O arrastra y suelta una imagen aquí" : "Arrastra y suelta una foto aquí o haz clic en Subir foto"}
                      className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-zinc-900 shadow-md transition ${
                        draggingId === c.id
                          ? "border-signal border-dashed ring-2 ring-signal/60 bg-signal/15 scale-105"
                          : "border-zinc-700/60"
                      } ${c.avatarUrl ? "cursor-zoom-in group" : ""}`}
                    >
                      {draggingId === c.id ? (
                        <div className="flex flex-col items-center justify-center p-1 text-center animate-pulse">
                          <Upload size={18} className="text-signal" />
                          <span className="text-[9px] font-bold text-signal leading-tight mt-1">Soltar</span>
                        </div>
                      ) : c.avatarUrl ? (
                        <>
                          <img src={c.avatarUrl} alt={c.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-xs">
                            <Maximize2 size={14} className="text-white drop-shadow" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-1">
                          <UserRound size={26} style={{ color: c.color }} />
                          <span className="text-[8px] text-zinc-500 font-medium mt-0.5">Drag & Drop</span>
                        </div>
                      )}
                      {busyChr === c.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs">
                          <Spinner size={16} />
                        </div>
                      )}
                    </div>

                    {/* Metadata & Individual Action */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <input
                        className="w-full bg-transparent text-[13px] font-bold text-zinc-100 outline-none placeholder:text-zinc-600"
                        value={c.name}
                        placeholder="Nombre del personaje"
                        onChange={(e) => updateCharacter(c.id, { name: e.target.value })}
                      />
                      <input
                        className="w-full bg-transparent text-[11px] text-zinc-400 outline-none placeholder:text-zinc-600"
                        value={c.role}
                        placeholder="Rol (ej. Protagonista)"
                        onChange={(e) => updateCharacter(c.id, { role: e.target.value })}
                      />
                      <div className="pt-1 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-signal hover:bg-zinc-800 hover:border-signal/50 transition disabled:opacity-50"
                          onClick={() => portrait(c)}
                          disabled={busyChr === c.id}
                        >
                          {busyChr === c.id ? <Spinner size={11} /> : <Sparkles size={11} />}
                          {c.avatarUrl ? "Regenerar casting" : "Generar casting (4 variaciones)"}
                        </button>

                        {/* Botón e Input para Subir Imagen Propia (ChatGPT, Midjourney, etc) */}
                        <input
                          id={`upload-chr-${c.id}`}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleUploadCharacter(c, f);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={`upload-chr-${c.id}`}
                          title="Sube tu propia imagen generada externamente (ChatGPT, Midjourney, etc.)"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 hover:border-zinc-500 transition cursor-pointer"
                        >
                          <Upload size={11} className="text-zinc-400" /> Subir foto
                        </label>

                        {/* Tomar fotograma del video fuente */}
                        {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition cursor-pointer"
                            onClick={() => setSourceFrameTarget({ type: "character", id: c.id, name: c.name })}
                            title="Seleccionar el fotograma real del video fuente original como rostro oficial"
                          >
                            <Film size={11} className="text-amber-400" /> Tomar del video fuente
                          </button>
                        )}

                        {c.avatarUrl && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-signal/40 bg-signal/10 px-2.5 py-1 text-[10.5px] font-bold text-signal hover:bg-signal/20 transition"
                            onClick={() => {
                              const vars = c.castingVariations?.length ? c.castingVariations : [c.avatarUrl!];
                              setCastingTarget({ character: c, variations: vars });
                            }}
                            title="Elegir cuál de las 4 variaciones será el rostro oficial"
                          >
                            <UserCheck size={11} /> Elegir de las 4
                          </button>
                        )}
                      </div>
                    </div>

                    <button
                      className="self-start p-1 text-zinc-600 hover:text-red-400 transition"
                      onClick={() => setCharacters(project.characters.filter((x) => x.id !== c.id))}
                      title="Eliminar personaje"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <textarea
                    className="field min-h-[50px] resize-y text-[11.5px] leading-relaxed overflow-y-auto"
                    placeholder="Descripción física y de carácter (se usa para el prompt del retrato)"
                    value={c.description}
                    onChange={(e) => updateCharacter(c.id, { description: e.target.value })}
                  />
                  <input
                    className="field text-[11.5px]"
                    placeholder="Vestuario y estilo"
                    value={c.wardrobe || ""}
                    onChange={(e) => updateCharacter(c.id, { wardrobe: e.target.value })}
                  />

                  {/* Selector de LoRA / Estilo del Actor */}
                  <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                        <Zap size={12} className={c.loraConfig ? "text-amber-400" : "text-zinc-500"} />
                        <span>Adaptador LoRA / Estilo Especial</span>
                      </div>
                      {c.loraConfig && (
                        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-400 border border-amber-400/20">
                          {c.loraConfig.category || "Activo"} · {(c.loraConfig.weight * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <select
                        className="field py-1 text-[11px] bg-zinc-900 border-zinc-800 text-zinc-200"
                        value={c.loraConfig?.presetId || "none"}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "none") {
                            updateCharacter(c.id, { loraConfig: undefined });
                          } else if (val === "custom") {
                            updateCharacter(c.id, {
                              loraConfig: {
                                presetId: "custom",
                                name: "LoRA Personalizado",
                                triggerWord: c.loraConfig?.triggerWord || "",
                                weight: c.loraConfig?.weight || 0.8,
                                category: "Personalizado",
                              },
                            });
                          } else {
                            const preset = LORA_PRESETS.find((p) => p.id === val);
                            if (preset) {
                              updateCharacter(c.id, {
                                loraConfig: {
                                  presetId: preset.id,
                                  name: preset.name,
                                  triggerWord: preset.triggerWord,
                                  weight: preset.weight,
                                  category: preset.category,
                                  description: preset.description,
                                },
                              });
                            }
                          }
                        }}
                      >
                        <option value="none">Sin LoRA (Estilo base estándar)</option>
                        <optgroup label="Sugerencias de Estilos y Combate">
                          {LORA_PRESETS.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.category}] {p.name}
                            </option>
                          ))}
                        </optgroup>
                        <option value="custom">⚙️ Personalizado (Escribir prompt / safetensors)</option>
                      </select>

                      {c.loraConfig && (
                        <div className="space-y-1.5 pt-1 border-t border-zinc-800/60">
                          {c.loraConfig.description && (
                            <p className="text-[10px] text-zinc-400 leading-tight">
                              {c.loraConfig.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-zinc-500 shrink-0">Intensidad:</span>
                            <input
                              type="range"
                              min="0.2"
                              max="1.0"
                              step="0.05"
                              value={c.loraConfig.weight}
                              onChange={(e) =>
                                updateCharacter(c.id, {
                                  loraConfig: {
                                    ...c.loraConfig!,
                                    weight: parseFloat(e.target.value),
                                  },
                                })
                              }
                              className="h-1 flex-1 bg-zinc-800 accent-amber-400 rounded cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-amber-400 w-8 text-right">
                              {c.loraConfig.weight.toFixed(2)}
                            </span>
                          </div>
                          <input
                            className="field py-1 text-[10.5px] font-mono text-zinc-300"
                            placeholder="Trigger words del LoRA (ej. fengbaobao style, blades...)"
                            value={c.loraConfig.triggerWord}
                            onChange={(e) =>
                              updateCharacter(c.id, {
                                loraConfig: {
                                  ...c.loraConfig!,
                                  triggerWord: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 2. Sets y Localizaciones & 3. Props */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Sets y Localizaciones */}
          <Section
            title="Sets y localizaciones"
            subtitle="Luz, hora del día y concepto visual unificado de cada espacio."
            action={
              <button
                className="btn btn-ghost text-[11.5px]"
                onClick={() =>
                  setLocations([
                    ...project.locations,
                    {
                      id: uid("loc"),
                      name: "Nuevo set",
                      description: "",
                      timeOfDay: "Noche",
                      color: "#38bdf8",
                    },
                  ])
                }
              >
                <Plus size={14} className="text-signal" /> Añadir
              </button>
            }
          >
            {project.locations.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-zinc-600">Sin sets definidos.</p>
            ) : (
              <div className="space-y-3">
                {(project.locations || []).map((l) => (
                  <div key={l.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5 hover:border-zinc-700/80 transition">
                    <div className="flex gap-3">
                      {/* Unified Thumbnail Box / Dropzone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(l.id);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(null);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleUploadLocation(l, file);
                        }}
                        onClick={() =>
                          l.imageUrl &&
                          setLightbox({
                            src: l.imageUrl,
                            title: l.name,
                            subtitle: `${l.timeOfDay} · ${l.description || "Concepto visual de set"}`,
                          })
                        }
                        title={l.imageUrl ? "Clic para ampliar set · O arrastra y suelta una imagen aquí" : "Arrastra y suelta una imagen aquí o haz clic en Subir foto"}
                        className={`relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-zinc-900 shadow-md transition ${
                          draggingId === l.id
                            ? "border-signal border-dashed ring-2 ring-signal/60 bg-signal/15 scale-105"
                            : "border-zinc-700/60"
                        } ${l.imageUrl ? "cursor-zoom-in group" : ""}`}
                      >
                        {draggingId === l.id ? (
                          <div className="flex flex-col items-center justify-center p-1 text-center animate-pulse">
                            <Upload size={18} className="text-signal" />
                            <span className="text-[9px] font-bold text-signal leading-tight mt-1">Soltar</span>
                          </div>
                        ) : l.imageUrl ? (
                          <>
                            <img src={l.imageUrl} alt={l.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-xs">
                              <Maximize2 size={14} className="text-white drop-shadow" />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <MapPin size={24} style={{ color: l.color }} />
                            <span className="text-[8px] text-zinc-500 font-medium mt-0.5">Drag & Drop</span>
                          </div>
                        )}
                        {busyLoc === l.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs">
                            <Spinner size={16} />
                          </div>
                        )}
                      </div>

                      {/* Info & Action */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <input
                          className="w-full bg-transparent text-[13px] font-bold text-zinc-100 outline-none placeholder:text-zinc-600"
                          value={l.name}
                          placeholder="Nombre del set"
                          onChange={(e) => updateLocation(l.id, { name: e.target.value })}
                        />
                        <input
                          className="w-full bg-transparent text-[11px] text-zinc-400 outline-none placeholder:text-zinc-600"
                          value={l.timeOfDay}
                          placeholder="Hora del día (ej. Noche artificial)"
                          onChange={(e) => updateLocation(l.id, { timeOfDay: e.target.value })}
                        />
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-signal hover:bg-zinc-800 hover:border-signal/50 transition disabled:opacity-50"
                            onClick={() => generateLocation(l)}
                            disabled={busyLoc === l.id}
                          >
                            {busyLoc === l.id ? <Spinner size={11} /> : <Sparkles size={11} />}
                            {l.imageUrl ? "Regenerar set" : "Generar concepto de set"}
                          </button>

                          {/* Subir imagen propia para set */}
                          <input
                            id={`upload-loc-${l.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadLocation(l, f);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`upload-loc-${l.id}`}
                            title="Sube tu propia imagen para este set o locación"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 hover:border-zinc-500 transition cursor-pointer"
                          >
                            <Upload size={11} className="text-zinc-400" /> Subir foto
                          </label>

                          {/* Tomar fotograma del video fuente */}
                          {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition cursor-pointer"
                              onClick={() => setSourceFrameTarget({ type: "location", id: l.id, name: l.name })}
                              title="Seleccionar un fotograma del video fuente como referencia del set"
                            >
                              <Film size={11} className="text-amber-400" /> Tomar del video fuente
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        className="self-start p-1 text-zinc-600 hover:text-red-400 transition"
                        onClick={() => setLocations(project.locations.filter((x) => x.id !== l.id))}
                        title="Eliminar set"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <textarea
                      className="field min-h-[48px] resize-y text-[11.5px] leading-relaxed overflow-y-auto"
                      placeholder="Descripción del entorno, arquitectura y ambiente"
                      value={l.description}
                      onChange={(e) => updateLocation(l.id, { description: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Props y Objetos Héroe */}
          <Section
            title="Props y objetos héroe"
            subtitle="Todo lo que aparece en cuadro con consistencia visual."
            action={
              <button
                className="btn btn-ghost text-[11.5px]"
                onClick={() =>
                  setProps([
                    ...project.props,
                    {
                      id: uid("prp"),
                      name: "Nuevo prop",
                      description: "",
                      category: "Objeto",
                      color: "#f472b6",
                    },
                  ])
                }
              >
                <Plus size={14} className="text-signal" /> Añadir
              </button>
            }
          >
            {project.props.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-zinc-600">Sin props definidos.</p>
            ) : (
              <div className="space-y-3">
                {(project.props || []).map((p) => (
                  <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5 hover:border-zinc-700/80 transition">
                    <div className="flex gap-3">
                      {/* Unified Thumbnail Box / Dropzone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(p.id);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(null);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDraggingId(null);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleUploadProp(p, file);
                        }}
                        onClick={() =>
                          p.imageUrl &&
                          setLightbox({
                            src: p.imageUrl,
                            title: p.name,
                            subtitle: `${p.category} · ${p.description || "Prop y objeto héroe"}`,
                          })
                        }
                        title={p.imageUrl ? "Clic para ampliar prop · O arrastra y suelta una imagen aquí" : "Arrastra y suelta una imagen aquí o haz clic en Subir foto"}
                        className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-zinc-900 shadow-md transition ${
                          draggingId === p.id
                            ? "border-signal border-dashed ring-2 ring-signal/60 bg-signal/15 scale-105"
                            : "border-zinc-700/60"
                        } ${p.imageUrl ? "cursor-zoom-in group" : ""}`}
                      >
                        {draggingId === p.id ? (
                          <div className="flex flex-col items-center justify-center p-1 text-center animate-pulse">
                            <Upload size={18} className="text-signal" />
                            <span className="text-[9px] font-bold text-signal leading-tight mt-1">Soltar</span>
                          </div>
                        ) : p.imageUrl ? (
                          <>
                            <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-xs">
                              <Maximize2 size={14} className="text-white drop-shadow" />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center p-1">
                            <Package size={24} style={{ color: p.color || "#f472b6" }} />
                            <span className="text-[8px] text-zinc-500 font-medium mt-0.5">Drag & Drop</span>
                          </div>
                        )}
                        {busyProp === p.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/75 backdrop-blur-xs">
                            <Spinner size={16} />
                          </div>
                        )}
                      </div>

                      {/* Info & Action */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <input
                          className="w-full bg-transparent text-[13px] font-bold text-zinc-100 outline-none placeholder:text-zinc-600"
                          value={p.name}
                          placeholder="Nombre del objeto"
                          onChange={(e) => updateProp(p.id, { name: e.target.value })}
                        />
                        <input
                          className="w-full bg-transparent text-[11px] text-zinc-400 outline-none placeholder:text-zinc-600"
                          value={p.category}
                          placeholder="Categoría (ej. Interfaz Digital, Espada)"
                          onChange={(e) => updateProp(p.id, { category: e.target.value })}
                        />
                        <div className="pt-1 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-signal hover:bg-zinc-800 hover:border-signal/50 transition disabled:opacity-50"
                            onClick={() => generateProp(p)}
                            disabled={busyProp === p.id}
                          >
                            {busyProp === p.id ? <Spinner size={11} /> : <Sparkles size={11} />}
                            {p.imageUrl ? "Regenerar prop" : "Generar imagen de prop"}
                          </button>

                          {/* Subir imagen propia para prop */}
                          <input
                            id={`upload-prp-${p.id}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadProp(p, f);
                              e.target.value = "";
                            }}
                          />
                          <label
                            htmlFor={`upload-prp-${p.id}`}
                            title="Sube tu propia imagen para este objeto o prop"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-800/80 px-2.5 py-1 text-[10.5px] font-semibold text-zinc-300 hover:text-white hover:bg-zinc-700 hover:border-zinc-500 transition cursor-pointer"
                          >
                            <Upload size={11} className="text-zinc-400" /> Subir foto
                          </label>

                          {/* Tomar fotograma del video fuente */}
                          {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition cursor-pointer"
                              onClick={() => setSourceFrameTarget({ type: "prop", id: p.id, name: p.name })}
                              title="Seleccionar un fotograma del video fuente como referencia del objeto"
                            >
                              <Film size={11} className="text-amber-400" /> Tomar del video fuente
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        className="self-start p-1 text-zinc-600 hover:text-red-400 transition"
                        onClick={() => setProps(project.props.filter((x) => x.id !== p.id))}
                        title="Eliminar prop"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <textarea
                      className="field min-h-[48px] resize-y text-[11.5px] leading-relaxed overflow-y-auto"
                      placeholder="Descripción del objeto, textura, detalles y función"
                      value={p.description}
                      onChange={(e) => updateProp(p.id, { description: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Lightbox con acción para elegir variación de casting */}
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          title={lightbox.title}
          subtitle={lightbox.subtitle}
          action={
            lightbox.character ? (
              <button
                type="button"
                onClick={() => {
                  const targetChar = lightbox.character!;
                  const vars = targetChar.castingVariations?.length
                    ? targetChar.castingVariations
                    : [lightbox.src];
                  setLightbox(null);
                  setCastingTarget({ character: targetChar, variations: vars });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-signal px-3.5 py-2 text-[11.5px] font-bold text-black shadow-lg hover:bg-lime-400 transition cursor-pointer"
              >
                <UserCheck size={14} /> Elegir 1 de las 4 variaciones
              </button>
            ) : undefined
          }
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Modal interactivo de Selección de Casting */}
      {castingTarget && (
        <CastingPickerModal
          character={castingTarget.character}
          variations={castingTarget.variations}
          onSelectAvatar={(selectedUrl) => {
            updateCharacter(castingTarget.character.id, { avatarUrl: selectedUrl });
            setCastingTarget(null);
          }}
          onClose={() => setCastingTarget(null)}
        />
      )}

      {/* Modal para Tomar Fotograma del Video Fuente */}
      {sourceFrameTarget && project.sourceMeta?.frames && (
        <SourceFramePickerModal
          frames={project.sourceMeta.frames}
          targetTitle={sourceFrameTarget.name}
          targetType={sourceFrameTarget.type}
          onSelectFrame={(selectedUrl) => {
            if (sourceFrameTarget.type === "character") {
              const c = project.characters.find((x) => x.id === sourceFrameTarget.id);
              const existing = c?.castingVariations || [];
              updateCharacter(sourceFrameTarget.id, {
                avatarUrl: selectedUrl,
                castingVariations: [selectedUrl, ...existing.filter((u) => u !== selectedUrl)],
              });
            } else if (sourceFrameTarget.type === "location") {
              updateLocation(sourceFrameTarget.id, { imageUrl: selectedUrl });
            } else if (sourceFrameTarget.type === "prop") {
              updateProp(sourceFrameTarget.id, { imageUrl: selectedUrl });
            }
            setSourceFrameTarget(null);
          }}
          onClose={() => setSourceFrameTarget(null)}
        />
      )}
    </>
  );
}
