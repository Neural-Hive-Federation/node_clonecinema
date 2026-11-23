import React, { useState, useRef } from "react";
import { AudioLines, ImageIcon, Layers, MapPin, Maximize2, Package, Plus, Sparkles, Trash2, Upload, UserRound, Volume2, Wand2, X } from "lucide-react";
import type { Shot, Project, ProjectUpdater } from "../../types";
import { generateImage, generateSpeech, isPaymentRequired } from "../../lib/api";
import { uploadImageFile } from "../../lib/imageUpload";
import { useSession } from "../../context/SessionContext";
import { uid } from "../../lib/project";
import { Field, FORMAT_CLASS, Section, Spinner, EmptyState, ImageLightbox } from "../ui";

export function StoryboardTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(project.shots[0]?.id ?? null);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [draggingShotId, setDraggingShotId] = useState<string | null>(null);
  const [isDraggingInspector, setIsDraggingInspector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const abortBulkRef = useRef(false);
  const [useMultiref, setUseMultiref] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; title: string; subtitle?: string } | null>(null);
  const { openPaywall, refreshAccount, costs } = useSession();

  const selected = (project.shots || []).find((s) => s.id === selectedId) || (project.shots || [])[0];

  async function generateVoiceForShot(shot: Shot) {
    const textToSpeak = (shot.voiceover || shot.dialogue || "").trim();
    if (!textToSpeak) return;
    setLoadingAudioId(shot.id);
    try {
      const url = await generateSpeech(textToSpeak, project.audio.voice);
      updateShot(shot.id, { audioUrl: url });
    } catch (err: any) {
      setError(`Error generando voz del plano: ${err?.message || "Fallo"}`);
    } finally {
      setLoadingAudioId(null);
    }
  }

  async function handleUploadShot(shot: Shot, file: File) {
    if (!file) return;
    setLoadingIds((prev) => [...prev, shot.id]);
    setError(null);
    try {
      const url = await uploadImageFile(file);
      updateShot(shot.id, { imageUrl: url });
    } catch (err: any) {
      setError(err?.message || `Error al subir imagen para el Plano ${shot.number}`);
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== shot.id));
    }
  }

  // Referencias visuales dinámicas específicas para cada plano
  const getReferencesForShot = (targetShot?: Shot) => {
    if (!useMultiref || !targetShot) {
      return { char: undefined, loc: undefined, prop: undefined, refs: undefined, missingProp: undefined, hasAnyRef: false };
    }

    const shotText = `${targetShot.title} ${targetShot.camera} ${targetShot.action} ${targetShot.imagePrompt}`.toLowerCase();

    // 1. Personaje asignado explícitamente o por coincidencia
    let char = targetShot.characterId !== undefined
      ? (targetShot.characterId ? project.characters.find((c) => c.id === targetShot.characterId) : undefined)
      : project.characters.find((c) => shotText.includes(c.name.toLowerCase())) ||
        project.characters.find((c) => Boolean(c.avatarUrl));

    // 2. Localización / Set asignado explícitamente o por coincidencia
    let loc = targetShot.locationId !== undefined
      ? (targetShot.locationId ? project.locations.find((l) => l.id === targetShot.locationId) : undefined)
      : project.locations.find((l) => shotText.includes(l.name.toLowerCase())) ||
        project.locations.find((l) => Boolean(l.imageUrl));

    // 3. Prop asignado explícitamente o por coincidencia
    let prop = targetShot.propId !== undefined
      ? (targetShot.propId ? project.props.find((p) => p.id === targetShot.propId) : undefined)
      : project.props.find((p) => {
          const pName = p.name.toLowerCase();
          return shotText.includes(pName) || (pName.includes("mapa") && (shotText.includes("mapa") || shotText.includes("map")));
        });

    const hasAnyRef = Boolean(char?.avatarUrl || loc?.imageUrl || prop?.imageUrl);
    const refs = hasAnyRef
      ? {
          character: char?.avatarUrl,
          location: loc?.imageUrl,
          prop: prop?.imageUrl,
        }
      : undefined;

    const missingProp = prop && !prop.imageUrl ? prop : undefined;

    return { char, loc, prop, refs, missingProp, hasAnyRef };
  };

  const selectedRefs = getReferencesForShot(selected);

  const updateShot = (id: string, partial: Partial<Shot>) =>
    patch((prev) => ({
      shots: (prev.shots || []).map((s) => (s.id === id ? { ...s, ...partial } : s)),
    }));

  const addShot = () => {
    const nextNumber = (project.shots || []).length + 1;
    const newShot: Shot = {
      id: uid("sht"),
      number: nextNumber,
      title: `Plano ${nextNumber}`,
      seconds: 3,
      camera: "Plano medio, cámara fija, 50mm",
      action: "",
      imagePrompt: `Cinematic film still, scene ${nextNumber}, dramatic lighting, 8k masterpiece`,
      videoPrompt: `Cinematic motion, scene ${nextNumber}, photorealistic, smooth movement`,
    };
    patch((prev) => ({
      shots: [...(prev.shots || []), newShot],
      duration: (prev.duration || 0) + 3,
    }));
    setSelectedId(newShot.id);
  };

  const deleteShot = (id: string) => {
    patch((prev) => {
      const remaining = (prev.shots || []).filter((s) => s.id !== id);
      const renumbered = remaining.map((s, idx) => ({ ...s, number: idx + 1 }));
      const newDuration = renumbered.reduce((acc, s) => acc + (Number(s.seconds) || 0), 0);
      return {
        shots: renumbered,
        duration: newDuration || prev.duration,
      };
    });
    if (selectedId === id) {
      const remaining = (project.shots || []).filter((s) => s.id !== id);
      setSelectedId(remaining[0]?.id ?? null);
    }
  };

  async function generate(shot: Shot) {
    if (loadingIds.includes(shot.id)) return;
    setError(null);
    setLoadingIds((prev) => [...prev, shot.id]);
    try {
      const shotRefData = getReferencesForShot(shot);
      const loraBonus = (useMultiref && shotRefData.char?.loraConfig?.triggerWord) ? `, ${shotRefData.char.loraConfig.triggerWord}` : "";
      const finalPrompt = `${shot.imagePrompt}${loraBonus}`;
      const imageUrl = await generateImage(finalPrompt, project.format, shotRefData.refs, useMultiref ? 0.52 : undefined);
      updateShot(shot.id, { imageUrl });
      void refreshAccount();
    } catch (err: any) {
      if (isPaymentRequired(err)) openPaywall(err.message);
      else setError(err?.message || "No se pudo generar la imagen.");
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== shot.id));
    }
  }

  async function generateAll(force: boolean = false) {
    if (bulk) return;
    abortBulkRef.current = false;
    setBulk(true);
    setError(null);

    const targetShots = force
      ? (project.shots || [])
      : (project.shots || []).filter((s) => !s.imageUrl);

    if (targetShots.length === 0) {
      setBulk(false);
      return;
    }

    for (let i = 0; i < targetShots.length; i++) {
      if (abortBulkRef.current) break;
      const shot = targetShots[i];
      setBulkProgress({ current: i + 1, total: targetShots.length, title: shot.title });
      setLoadingIds((prev) => [...prev, shot.id]);

      try {
        const shotRefData = getReferencesForShot(shot);
        const loraBonus = (useMultiref && shotRefData.char?.loraConfig?.triggerWord) ? `, ${shotRefData.char.loraConfig.triggerWord}` : "";
        const finalPrompt = `${shot.imagePrompt}${loraBonus}`;
        const imageUrl = await generateImage(finalPrompt, project.format, shotRefData.refs, useMultiref ? 0.52 : undefined);
        updateShot(shot.id, { imageUrl });
        void refreshAccount();
      } catch (err: any) {
        if (isPaymentRequired(err)) {
          openPaywall(err.message);
          break;
        } else {
          setError(err?.message || `La generación se detuvo en el plano ${shot.number}.`);
          break;
        }
      } finally {
        setLoadingIds((prev) => prev.filter((id) => id !== shot.id));
      }
    }
    setBulkProgress(null);
    setBulk(false);
  }

  const totalShots = (project.shots || []).length;
  const shotsWithImage = (project.shots || []).filter((s) => s.imageUrl).length;
  const shotsEmpty = totalShots - shotsWithImage;

  if (totalShots === 0) {
    return (
      <EmptyState
        icon={<Layers size={18} />}
        title="Sin planos todavía"
        body="El storyboard se llena cuando el director genera un plan desde el chat o puedes añadir planos manualmente."
        action={
          <button className="btn btn-primary" onClick={addShot}>
            <Plus size={14} /> Añadir primer plano
          </button>
        }
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_390px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="chip chip-active">{project.format}</span>
              <span className="chip">{totalShots} planos</span>
              <span className="chip">
                {shotsWithImage} keyframes
              </span>
              <button
                className="btn btn-ghost text-[11px] border border-zinc-800 hover:border-zinc-700 hover:text-zinc-100 ml-1"
                onClick={addShot}
                title="Añadir un nuevo plano a la historia"
              >
                <Plus size={13} className="text-signal" /> Añadir plano
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10.5px] text-zinc-500">{costs.image} crédito / keyframe</span>

              {shotsEmpty > 0 && shotsWithImage > 0 ? (
                <>
                  <button
                    className="btn btn-ghost text-[11.5px] border border-zinc-800 hover:border-zinc-700"
                    onClick={() => generateAll(false)}
                    disabled={bulk || loadingIds.length > 0}
                    title="Genera solo los planos que no tienen ninguna imagen"
                  >
                    {bulk && !abortBulkRef.current ? <Spinner size={13} /> : <Wand2 size={13} />}
                    Generar vacíos ({shotsEmpty})
                  </button>
                  <button
                    className="btn btn-primary text-[11.5px] border border-signal/40 bg-signal/15 text-signal hover:bg-signal hover:text-black font-semibold flex items-center gap-1.5 cursor-pointer shadow-md"
                    onClick={() => {
                      if (confirm(`¿Deseas generar los ${totalShots} keyframes con IA reemplazando las capturas de referencia del Fénix?`)) {
                        generateAll(true);
                      }
                    }}
                    disabled={bulk || loadingIds.length > 0}
                    title="Reemplaza todas las capturas de referencia por keyframes de IA"
                  >
                    <Sparkles size={13} />
                    Reemplazar todos con IA ({totalShots})
                  </button>
                </>
              ) : shotsWithImage === totalShots ? (
                <button
                  className="btn btn-primary text-[11.5px] border border-signal/40 bg-signal/20 text-signal hover:bg-signal hover:text-black font-bold flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  onClick={() => {
                    if (confirm(`Actualmente los ${totalShots} planos tienen capturas del Fénix.\n\n¿Deseas generar los ${totalShots} keyframes fotorrealistas con IA reemplazando las capturas?`)) {
                      generateAll(true);
                    }
                  }}
                  disabled={bulk || loadingIds.length > 0}
                  title="Genera con IA todos los keyframes reemplazando las capturas de video del Fénix"
                >
                  {bulk ? <Spinner size={13} /> : <Sparkles size={13} />}
                  <span>{bulk && bulkProgress ? `Generando ${bulkProgress.current}/${bulkProgress.total}...` : `✨ Generar imágenes IA en lote (${totalShots})`}</span>
                </button>
              ) : (
                <button
                  className="btn btn-ghost text-[11.5px] border border-zinc-800 hover:border-zinc-700 flex items-center gap-1.5"
                  onClick={() => generateAll(false)}
                  disabled={bulk || loadingIds.length > 0}
                  title="Genera en cascada todos los planos que aún no tengan imagen"
                >
                  {bulk ? <Spinner size={13} /> : <Wand2 size={13} />}
                  <span>Generar todos en lote ({shotsEmpty})</span>
                </button>
              )}
            </div>
          </div>

          {bulkProgress && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-signal/40 bg-signal/10 px-4 py-2.5 text-[12px] text-zinc-100 shadow-md animate-pulse">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Spinner size={14} />
                <span className="font-bold text-signal shrink-0">
                  Generando plano {bulkProgress.current} de {bulkProgress.total}:
                </span>
                <span className="text-zinc-300 truncate max-w-[280px] sm:max-w-[420px]">
                  "{bulkProgress.title}"
                </span>
              </div>
              <button
                type="button"
                onClick={() => { abortBulkRef.current = true; }}
                className="shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 hover:text-red-200 transition cursor-pointer"
              >
                Detener lote
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-[11.5px] text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(project.shots || []).map((shot) => {
              const loading = loadingIds.includes(shot.id);
              const active = shot.id === selected?.id;
              return (
                <div
                  key={shot.id}
                  onClick={() => setSelectedId(shot.id)}
                  className={`group cursor-pointer overflow-hidden rounded-xl border bg-zinc-900/40 transition ${
                    active ? "border-signal/50 ring-1 ring-signal/30 shadow-lg shadow-signal/5" : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingShotId(shot.id);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingShotId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingShotId(null);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleUploadShot(shot, file);
                    }}
                    className={`relative ${FORMAT_CLASS[project.format] || "aspect-video"} w-full overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black transition ${
                      draggingShotId === shot.id ? "ring-2 ring-signal ring-inset" : ""
                    }`}
                  >
                    {/* Drag and Drop Active Overlay */}
                    {draggingShotId === shot.id && (
                      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xs p-2 text-center animate-pulse border-2 border-dashed border-signal">
                        <Upload size={24} className="text-signal" />
                        <span className="text-[11px] font-bold text-signal mt-1">Soltar imagen en Plano {shot.number}</span>
                      </div>
                    )}

                    {shot.imageUrl ? (
                      <div className="relative h-full w-full group/img">
                        <img
                          src={shot.imageUrl}
                          alt={shot.title}
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox({
                              src: shot.imageUrl!,
                              title: `Plano ${shot.number} · ${shot.title}`,
                              subtitle: shot.camera,
                            });
                          }}
                          title="Ver imagen en tamaño completo"
                          className="absolute left-2 bottom-2 z-10 flex items-center gap-1 rounded-md bg-black/80 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:text-white opacity-0 group-hover/img:opacity-100 backdrop-blur transition border border-zinc-700/60 shadow-lg"
                        >
                          <Maximize2 size={11} /> Ampliar
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-zinc-700 p-2 text-center">
                        {loading ? (
                          <Spinner size={18} />
                        ) : (
                          <>
                            <ImageIcon size={20} />
                            <span className="font-display text-2xl font-bold text-zinc-800">
                              {shot.number}
                            </span>
                            <span className="text-[9px] text-zinc-600 font-medium">
                              Arrastra aquí tu foto
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1 z-10">
                      <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200 backdrop-blur">
                        Plano {shot.number}
                      </span>
                      <span className="rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] text-zinc-400 backdrop-blur">
                        {shot.seconds}s
                      </span>
                    </div>

                    <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                      {/* Botón rápido para subir imagen propia a este plano */}
                      <input
                        id={`upload-shot-${shot.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadShot(shot, f);
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor={`upload-shot-${shot.id}`}
                        onClick={(e) => e.stopPropagation()}
                        title={`Subir imagen propia para Plano ${shot.number}`}
                        className="rounded-md bg-black/80 p-1 px-1.5 text-[10px] font-semibold text-zinc-300 hover:text-white opacity-0 group-hover:opacity-100 backdrop-blur transition border border-zinc-700/60 cursor-pointer shadow-md flex items-center gap-1"
                      >
                        <Upload size={10} className="text-zinc-400" /> Subir
                      </label>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteShot(shot.id);
                        }}
                        title={`Eliminar Plano ${shot.number}`}
                        className="rounded-md bg-black/80 p-1 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 backdrop-blur transition border border-zinc-700/60"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generate(shot);
                      }}
                      disabled={loading}
                      title={`Generar imagen individual para el Plano ${shot.number}`}
                      className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-lg bg-black/85 px-2.5 py-1 text-[10.5px] font-semibold text-zinc-200 border border-zinc-700/60 shadow-md backdrop-blur transition hover:border-signal hover:text-signal disabled:opacity-100"
                    >
                      {loading ? <Spinner size={11} /> : <Sparkles size={11} className="text-signal" />}
                      {shot.imageUrl ? "Regenerar" : "Generar"}
                    </button>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-[12.5px] font-semibold text-zinc-200">{shot.title}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400">{shot.camera}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selected && (
          <div className="lg:sticky lg:top-0 lg:self-start">
            <Section
              title={`Plano ${selected.number} · ${selected.title}`}
              subtitle="Detalles e imagen individual del plano"
              action={
                <div className="flex items-center gap-1">
                  <button
                    className="rounded p-1 text-zinc-600 hover:text-red-400 transition"
                    onClick={() => deleteShot(selected.id)}
                    title={`Eliminar Plano ${selected.number}`}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    className="rounded p-1 text-zinc-600 hover:text-zinc-300 transition"
                    onClick={() => setSelectedId(null)}
                    title="Cerrar inspector"
                  >
                    <X size={14} />
                  </button>
                </div>
              }
            >
              <div className="max-h-[calc(100vh-180px)] space-y-3.5 overflow-y-auto pr-1">
                <div className="grid grid-cols-[1fr_80px] gap-2">
                  <Field label="Título">
                    <textarea
                      rows={1}
                      className="field min-h-[38px] resize-none leading-snug font-medium text-[12px] overflow-y-auto"
                      value={selected.title}
                      onChange={(e) => updateShot(selected.id, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Duración (s)">
                    <input
                      type="number"
                      className="field min-h-[38px] text-center font-medium"
                      value={selected.seconds}
                      onChange={(e) =>
                        updateShot(selected.id, { seconds: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                </div>

                {/* Elementos vinculados al Plano (Actor, Set, Prop) */}
                {Boolean((project.characters || []).length || (project.locations || []).length || (project.props || []).length) && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10.5px] font-bold text-zinc-200 flex items-center gap-1.5">
                        <UserRound size={12} className="text-amber-400" /> Elementos del Plano {selected.number}
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useMultiref}
                          onChange={(e) => setUseMultiref(e.target.checked)}
                          className="h-3 w-3 rounded border-zinc-700 bg-zinc-800 text-signal accent-lime-400"
                        />
                        <span className="text-[9.5px] text-zinc-400">Ref. visual IA</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Selector de Actor */}
                      <div className="bg-black/50 rounded-lg p-1.5 border border-zinc-800 flex flex-col gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          {selectedRefs.char?.avatarUrl ? (
                            <img
                              src={selectedRefs.char.avatarUrl}
                              alt=""
                              className="h-5 w-5 rounded object-cover shrink-0 border border-zinc-700"
                            />
                          ) : (
                            <UserRound size={12} className="text-amber-400 shrink-0" />
                          )}
                          <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider truncate">
                            Actor
                          </span>
                        </div>
                        <select
                          value={selected.characterId || ""}
                          onChange={(e) => {
                            const charId = e.target.value;
                            const charObj = project.characters?.find((c) => c.id === charId);
                            updateShot(selected.id, {
                              characterId: charId || undefined,
                              ...(charObj && !selected.action.includes(charObj.name)
                                ? { action: `${selected.action ? selected.action + ". " : ""}En cuadro: ${charObj.name}.` }
                                : {}),
                            });
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-[9.5px] text-zinc-200 rounded px-1 py-0.5 focus:border-signal truncate cursor-pointer"
                        >
                          <option value="">(Sin actor)</option>
                          {(project.characters || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.avatarUrl ? "✓" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Selector de Set */}
                      <div className="bg-black/50 rounded-lg p-1.5 border border-zinc-800 flex flex-col gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          {selectedRefs.loc?.imageUrl ? (
                            <img
                              src={selectedRefs.loc.imageUrl}
                              alt=""
                              className="h-5 w-5 rounded object-cover shrink-0 border border-zinc-700"
                            />
                          ) : (
                            <MapPin size={12} className="text-cyan-400 shrink-0" />
                          )}
                          <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider truncate">
                            Set
                          </span>
                        </div>
                        <select
                          value={selected.locationId || ""}
                          onChange={(e) => {
                            const locId = e.target.value;
                            const locObj = project.locations?.find((l) => l.id === locId);
                            updateShot(selected.id, {
                              locationId: locId || undefined,
                              ...(locObj && !selected.camera.includes(locObj.name)
                                ? { camera: `${selected.camera ? selected.camera + ". " : ""}En ${locObj.name}.` }
                                : {}),
                            });
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-[9.5px] text-zinc-200 rounded px-1 py-0.5 focus:border-signal truncate cursor-pointer"
                        >
                          <option value="">(Sin set)</option>
                          {(project.locations || []).map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name} {l.imageUrl ? "✓" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Selector de Prop */}
                      <div className="bg-black/50 rounded-lg p-1.5 border border-zinc-800 flex flex-col gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          {selectedRefs.prop?.imageUrl ? (
                            <img
                              src={selectedRefs.prop.imageUrl}
                              alt=""
                              className="h-5 w-5 rounded object-cover shrink-0 border border-zinc-700"
                            />
                          ) : (
                            <Package size={12} className="text-pink-400 shrink-0" />
                          )}
                          <span className="text-[8.5px] font-bold text-zinc-400 uppercase tracking-wider truncate">
                            Prop
                          </span>
                        </div>
                        <select
                          value={selected.propId || ""}
                          onChange={(e) => {
                            const propId = e.target.value;
                            const propObj = project.props?.find((p) => p.id === propId);
                            updateShot(selected.id, {
                              propId: propId || undefined,
                              ...(propObj && !selected.action.includes(propObj.name)
                                ? { action: `${selected.action ? selected.action + ". " : ""}Usa ${propObj.name}.` }
                                : {}),
                            });
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 text-[9.5px] text-zinc-200 rounded px-1 py-0.5 focus:border-signal truncate cursor-pointer"
                        >
                          <option value="">(Sin prop)</option>
                          {(project.props || []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.imageUrl ? "✓" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {selectedRefs.missingProp && (
                      <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[9.5px] text-amber-300">
                        ⚠️ «{selectedRefs.missingProp.name}» no tiene foto en <strong>Reparto & Sets</strong>.
                      </div>
                    )}
                  </div>
                )}

                <Field label="Cámara / Plano">
                  <textarea
                    rows={2}
                    className="field min-h-[52px] resize-y leading-relaxed text-[11.5px] overflow-y-auto"
                    placeholder="Movimiento de cámara, lente y encuadre"
                    value={selected.camera}
                    onChange={(e) => updateShot(selected.id, { camera: e.target.value })}
                  />
                </Field>

                <Field label="Acción">
                  <textarea
                    rows={3}
                    className="field min-h-[72px] resize-y leading-relaxed text-[11.5px] overflow-y-auto"
                    placeholder="Qué sucede en este plano"
                    value={selected.action}
                    onChange={(e) => updateShot(selected.id, { action: e.target.value })}
                  />
                </Field>

                <Field label="Diálogo">
                  <textarea
                    rows={2}
                    className="field min-h-[52px] resize-y leading-relaxed text-[11.5px] overflow-y-auto"
                    placeholder="Diálogo hablado en plano"
                    value={selected.dialogue || ""}
                    onChange={(e) => updateShot(selected.id, { dialogue: e.target.value })}
                  />
                </Field>

                <Field label="Voz en off">
                  <textarea
                    rows={2}
                    className="field min-h-[52px] resize-y leading-relaxed text-[11.5px] overflow-y-auto"
                    placeholder="Locución en off que acompaña la toma"
                    value={selected.voiceover || ""}
                    onChange={(e) => updateShot(selected.id, { voiceover: e.target.value })}
                  />
                </Field>

                {/* Reproductor y Generador de Audio de este plano individual */}
                {(selected.voiceover || selected.dialogue) && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-zinc-300 flex items-center gap-1.5">
                        <Volume2 size={12} className="text-signal" /> Audio de este plano
                      </span>
                      <button
                        type="button"
                        onClick={() => generateVoiceForShot(selected)}
                        disabled={loadingAudioId === selected.id}
                        className="text-[10px] font-semibold text-zinc-200 hover:text-signal flex items-center gap-1 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700/60 transition-colors"
                      >
                        {loadingAudioId === selected.id ? (
                          <>
                            <Spinner size={10} /> Generando…
                          </>
                        ) : selected.audioUrl ? (
                          <>
                            <AudioLines size={10} /> Regenerar voz
                          </>
                        ) : (
                          <>
                            <AudioLines size={10} /> Generar voz
                          </>
                        )}
                      </button>
                    </div>

                    {selected.audioUrl && (
                      <audio controls src={selected.audioUrl} className="w-full h-7" />
                    )}
                  </div>
                )}

                <Field label="Texto en pantalla">
                  <textarea
                    rows={2}
                    className="field min-h-[50px] resize-y leading-relaxed text-[11.5px] overflow-y-auto"
                    placeholder="Textos gráficos, stickers o subtítulos"
                    value={selected.onScreenText || ""}
                    onChange={(e) => updateShot(selected.id, { onScreenText: e.target.value })}
                  />
                </Field>

                <Field label="Prompt de keyframe (EN)" hint="Texto exacto para el motor de imagen Playground v2.5 / Flux.">
                  <textarea
                    rows={4}
                    className="field min-h-[85px] resize-y font-mono text-[11px] leading-relaxed overflow-y-auto"
                    value={selected.imagePrompt}
                    onChange={(e) => updateShot(selected.id, { imagePrompt: e.target.value })}
                  />
                </Field>

                {/* Botón individual prominente para generar o subir imagen de este plano */}
                <div className="grid grid-cols-[1fr_auto] gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => generate(selected)}
                    disabled={loadingIds.includes(selected.id)}
                    className="btn btn-primary flex items-center justify-center gap-2 py-2.5 text-[12px] font-bold shadow-md shadow-signal/15"
                  >
                    {loadingIds.includes(selected.id) ? (
                      <>
                        <Spinner size={14} /> Generando keyframe de Plano {selected.number}…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        {selected.imageUrl ? `Regenerar imagen (Plano ${selected.number})` : `Generar imagen (Plano ${selected.number})`}
                      </>
                    )}
                  </button>

                  <input
                    id={`upload-inspector-${selected.id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadShot(selected, f);
                      e.target.value = "";
                    }}
                  />
                  <label
                    htmlFor={`upload-inspector-${selected.id}`}
                    title="Subir imagen propia externa para este plano (ChatGPT, Midjourney, etc.)"
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-zinc-700/80 bg-zinc-800/90 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-zinc-700 hover:border-zinc-500 transition cursor-pointer shadow-md"
                  >
                    <Upload size={13} className="text-zinc-400" /> Subir
                  </label>
                </div>

                {selected.imageUrl && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <span>Keyframe del plano</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLightbox({
                            src: selected.imageUrl!,
                            title: `Plano ${selected.number} · ${selected.title}`,
                            subtitle: selected.camera,
                          })
                        }
                        className="flex items-center gap-1 text-[10px] font-medium text-signal hover:underline"
                      >
                        <Maximize2 size={11} /> Ampliar
                      </button>
                    </div>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingInspector(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingInspector(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingInspector(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleUploadShot(selected, file);
                      }}
                      className={`group relative cursor-zoom-in overflow-hidden rounded-xl border shadow-lg transition ${
                        isDraggingInspector
                          ? "border-signal border-dashed ring-2 ring-signal/60 bg-signal/15"
                          : "border-zinc-700/60"
                      }`}
                      onClick={() =>
                        setLightbox({
                          src: selected.imageUrl!,
                          title: `Plano ${selected.number} · ${selected.title}`,
                          subtitle: selected.camera,
                        })
                      }
                      title="Haz clic para ver en pantalla completa · O arrastra una imagen aquí para reemplazarla"
                    >
                      {isDraggingInspector ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center animate-pulse">
                          <Upload size={28} className="text-signal" />
                          <span className="text-xs font-bold text-signal mt-2">Soltar reemplazo para Plano {selected.number}</span>
                        </div>
                      ) : (
                        <>
                          <img
                            src={selected.imageUrl}
                            alt={`Keyframe plano ${selected.number}`}
                            className="w-full object-cover transition group-hover:scale-102"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition backdrop-blur-xs">
                            <span className="flex items-center gap-1.5 rounded-lg bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white border border-white/20 shadow-xl">
                              <Maximize2 size={13} /> Pantalla completa
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <Field label="Prompt de video (EN)" hint="Se usa en Render para el modelo de video I2V.">
                  <textarea
                    rows={3}
                    className="field min-h-[75px] resize-y font-mono text-[11px] leading-relaxed overflow-y-auto"
                    value={selected.videoPrompt}
                    onChange={(e) => updateShot(selected.id, { videoPrompt: e.target.value })}
                  />
                </Field>
              </div>
            </Section>
          </div>
        )}
      </div>

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          title={lightbox.title}
          subtitle={lightbox.subtitle}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  );
}
