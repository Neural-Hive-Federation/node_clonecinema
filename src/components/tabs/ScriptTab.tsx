import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  Bot,
  Repeat2,
  Check,
  ExternalLink,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
} from "lucide-react";
import type { Project, ProjectUpdater } from "../../types";
import { Field, Section, Spinner } from "../ui";
import { MODE_LABEL } from "../../lib/project";

const KIND_LABEL: Record<string, string> = {
  character: "Personaje",
  product: "Producto",
  location: "Fondo",
  prop: "Objeto",
  logo: "Logo",
  text: "Texto",
};

export function ScriptTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const dna = project.viralDNA;
  const [miningFenix, setMiningFenix] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [fenixStatus, setFenixStatus] = useState<string | null>(null);
  const [viewingFrameIdx, setViewingFrameIdx] = useState<number | null>(null);
  const [isPlayingSlideshow, setIsPlayingSlideshow] = useState(false);
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
  const [activeScriptShotIdx, setActiveScriptShotIdx] = useState(0);
  const [activeFenixShotIdx, setActiveFenixShotIdx] = useState(0);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState<string | null>(null);

  const frames = project.sourceMeta?.frames || [];

  // Slideshow automático cada 3 segundos
  useEffect(() => {
    if (!isPlayingSlideshow || viewingFrameIdx === null || frames.length === 0) return;
    const timer = setInterval(() => {
      setViewingFrameIdx((prev) => (prev === null ? 0 : (prev + 1) % frames.length));
    }, 3000);
    return () => clearInterval(timer);
  }, [isPlayingSlideshow, viewingFrameIdx, frames.length]);

  // Navegación por teclado del Slideshow (Flechas, Espacio, Escape)
  useEffect(() => {
    if (viewingFrameIdx === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewingFrameIdx(null);
        setIsPlayingSlideshow(false);
      } else if (e.key === "ArrowLeft") {
        setViewingFrameIdx((prev) => (prev === null ? 0 : (prev - 1 + frames.length) % frames.length));
      } else if (e.key === "ArrowRight") {
        setViewingFrameIdx((prev) => (prev === null ? 0 : (prev + 1) % frames.length));
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlayingSlideshow((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewingFrameIdx, frames.length]);

  // Navegación por teclado de la Ficha Expandida de Plano
  useEffect(() => {
    if (selectedShotIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedShotIndex(null);
      } else if (e.key === "ArrowLeft") {
        const total = (project.shots || []).length;
        if (total > 0) setSelectedShotIndex((prev) => (prev === null ? 0 : (prev - 1 + total) % total));
      } else if (e.key === "ArrowRight") {
        const total = (project.shots || []).length;
        if (total > 0) setSelectedShotIndex((prev) => (prev === null ? 0 : (prev + 1) % total));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShotIndex, project.shots?.length]);

  const handleReconstructWithFenix = async (framesToUse: any[]) => {
    if (!framesToUse || framesToUse.length === 0) return;
    setReconstructing(true);
    setFenixStatus("🎬 Director Gemini analizando la secuencia visual de fotogramas...");

    try {
      const res = await fetch("/api/viral/analyze?action=reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: project.title,
          url: project.sourceMeta?.url || project.sourceUrl,
          frames: framesToUse,
          duration: project.duration || 80,
          format: project.format,
          style: project.style,
          brief: project.brief,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.shots) && data.shots.length > 0) {
        patch({
          shots: data.shots,
          viralDNA: data.viralDNA || project.viralDNA,
          characters: data.characters && data.characters.length > 0 ? data.characters : project.characters,
          locations: data.locations && data.locations.length > 0 ? data.locations : project.locations,
          props: data.props && data.props.length > 0 ? data.props : project.props,
          duration: data.shots.reduce((acc: number, s: any) => acc + (s.seconds || 0), 0) || project.duration,
          sourceMeta: {
            ...(project.sourceMeta || { url: project.sourceUrl || "", platform: "TikTok" }),
            frames: framesToUse,
          },
        });
        setFenixStatus(`🎉 ¡Guion y ADN reconstruidos con éxito! ${data.shots.length} planos sincronizados para Wan 2.1`);
      }
    } catch (err: any) {
      console.error("Error reconstruyendo guion con Fénix:", err);
      setFenixStatus("Error al reconstruir guion con el Director");
    } finally {
      setReconstructing(false);
    }
  };

  // Auto-cargar fotogramas minados si ya existen para este video o proyecto
  useEffect(() => {
    const targetUrl = project.sourceMeta?.url || project.sourceUrl;
    if (!targetUrl || (project.sourceMeta?.frames && project.sourceMeta.frames.length > 0)) {
      return;
    }

    let active = true;
    fetch(`/api/viral/mine-frames?projectId=${encodeURIComponent(project.id)}&url=${encodeURIComponent(targetUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.done && Array.isArray(data.frames) && data.frames.length > 0) {
          if ((project.shots || []).length <= 4 && data.frames.length > 4) {
            void handleReconstructWithFenix(data.frames);
          } else {
            const updatedShots = (project.shots || []).map((shot, idx) => {
              const frame = data.frames[idx] || data.frames.find((f: any) => f.shotNumber === shot.number);
              return frame && !shot.imageUrl ? { ...shot, imageUrl: frame.frameUrl } : shot;
            });
            patch({
              sourceMeta: {
                ...(project.sourceMeta || { url: targetUrl, platform: "TikTok" }),
                frames: data.frames,
              },
              shots: updatedShots,
            });
            setFenixStatus(`✅ ${data.frames.length} Planos del Fénix sincronizados`);
          }
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [project.id, project.sourceMeta?.url, project.sourceUrl]);

  const handleDispatchFenix = async () => {
    const url = project.sourceMeta?.url || project.sourceUrl;
    if (!url) return;
    setMiningFenix(true);
    setFenixStatus("Desplegando Fénix a tu PC...");

    try {
      const res = await fetch("/api/viral/mine-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          projectId: project.id,
          duration: project.duration || 60,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setFenixStatus(`Error: ${data.error || "No se pudo despachar al Fénix"}`);
        setMiningFenix(false);
        return;
      }

      setFenixStatus("🦅 Fénix en misión: minando fotogramas clave...");

      // Polling activo para recibir los frames en tiempo real del Fénix
      let elapsed = 0;
      const pollTimer = setInterval(async () => {
        elapsed += 2.5;
        if (elapsed > 45) {
          clearInterval(pollTimer);
          setMiningFenix(false);
          setFenixStatus("⚡ Misión completada por Fénix en tu PC");
          return;
        }

        try {
          const pollRes = await fetch(
            `/api/viral/mine-frames?projectId=${encodeURIComponent(project.id)}&url=${encodeURIComponent(url)}`
          );
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.done && Array.isArray(pollData.frames) && pollData.frames.length > 0) {
              clearInterval(pollTimer);
              setMiningFenix(false);
              setFenixStatus(`✅ ¡${pollData.frames.length} Planos minados con éxito por el Fénix!`);

              if ((project.shots || []).length <= 4 && pollData.frames.length > 4) {
                void handleReconstructWithFenix(pollData.frames);
              } else {
                const updatedFrames = pollData.frames;
                const updatedShots = (project.shots || []).map((shot, idx) => {
                  const matchingFrame =
                    updatedFrames[idx] || updatedFrames.find((f: any) => f.shotNumber === shot.number);
                  return matchingFrame && !shot.imageUrl
                    ? { ...shot, imageUrl: matchingFrame.frameUrl }
                    : shot;
                });

                patch({
                  sourceMeta: {
                    ...(project.sourceMeta || { url, platform: "TikTok" }),
                    frames: updatedFrames,
                  },
                  shots: updatedShots,
                });
              }
            }
          }
        } catch {
          // Ignorar fallos transitorios de red
        }
      }, 2500);
    } catch (err: any) {
      setFenixStatus("Error al contactar con el endpoint de minería");
      setMiningFenix(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]">
      <div className="space-y-5">
        <Section title="Brief del proyecto" subtitle="Lo que el director usa como fuente de verdad.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Título">
              <input
                className="field"
                value={project.title}
                onChange={(e) => patch({ title: e.target.value, name: e.target.value })}
              />
            </Field>
            <Field label="Modo">
              <select
                className="field"
                value={project.mode}
                onChange={(e) => patch({ mode: e.target.value as Project["mode"] })}
              >
                {(["clone", "ad", "saga"] as const).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Logline">
                <input
                  className="field"
                  value={project.logline}
                  onChange={(e) => patch({ logline: e.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Idea / brief">
                <textarea
                  className="field min-h-[76px] resize-y"
                  value={project.brief}
                  onChange={(e) => patch({ brief: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Formato">
              <select
                className="field"
                value={project.format}
                onChange={(e) => patch({ format: e.target.value as Project["format"] })}
              >
                <option value="9:16">9:16 vertical</option>
                <option value="16:9">16:9 cine</option>
                <option value="1:1">1:1 feed</option>
              </select>
            </Field>
            <Field label="Duración objetivo (s)">
              <input
                type="number"
                className="field"
                value={project.duration}
                onChange={(e) => patch({ duration: Number(e.target.value) || 0 })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Estilo visual">
                <input
                  className="field"
                  value={project.style}
                  onChange={(e) => patch({ style: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          title="Guion por planos"
          subtitle="Cada plano con su cámara, acción, diálogo y audio."
          action={
            <div className="flex items-center gap-2">
              <span className="chip">{(project.shots || []).length} planos</span>
              {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleReconstructWithFenix(project.sourceMeta!.frames!)}
                  disabled={reconstructing}
                  className="chip chip-active flex items-center gap-1.5 cursor-pointer hover:brightness-110 text-[10.5px] font-bold"
                  title="Reconstruir guion con la secuencia completa de fotogramas del Fénix"
                >
                  {reconstructing ? <Spinner size={10} /> : <span>🎬</span>}
                  <span>Reconstruir con {project.sourceMeta.frames.length} Planos</span>
                </button>
              )}
            </div>
          }
        >
          {(project.shots || []).length === 0 ? (
            <p className="py-6 text-center text-[12px] text-zinc-600">
              Pide un plan en el chat para ver el guion aquí.
            </p>
          ) : (() => {
            const shots = project.shots || [];
            const currentIdx = Math.max(0, Math.min(activeScriptShotIdx, shots.length - 1));
            const currentShot = shots[currentIdx];
            const prevIdx = (currentIdx - 1 + shots.length) % shots.length;
            const nextIdx = (currentIdx + 1) % shots.length;

            return (
              <div className="space-y-3">
                {/* Carrusel: 1 Plano a la vez con flechas horizontales (< ; >) */}
                <div className="relative flex items-center gap-2.5">
                  {/* Flecha Izquierda (<) */}
                  <button
                    type="button"
                    onClick={() => setActiveScriptShotIdx(prevIdx)}
                    className="p-2.5 shrink-0 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-signal/60 text-zinc-300 hover:text-signal transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                    title={`Ir al Plano anterior (P${shots[prevIdx]?.number})`}
                  >
                    <ChevronLeft size={20} />
                  </button>

                  {/* Tarjeta del Plano Activo en Pantalla */}
                  <div
                    onClick={() => setSelectedShotIndex(currentIdx)}
                    className="flex-1 rounded-2xl border border-signal/60 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-4 hover:border-signal transition-all cursor-pointer group shadow-lg shadow-signal/5"
                    title="Clic para abrir la ficha completa en pantalla expandida"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-signal font-display text-xs font-bold text-black shadow-sm">
                          {currentShot.number}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-zinc-100 group-hover:text-signal transition">
                            {currentShot.title}
                          </h4>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            Plano {currentIdx + 1} de {shots.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-zinc-800/90 border border-zinc-700/60 px-2 py-0.5 text-[10.5px] font-mono text-signal">
                          ⏱️ {currentShot.seconds}s
                        </span>
                        <span className="text-[10px] text-zinc-400 group-hover:text-signal font-mono transition flex items-center gap-0.5">
                          Ficha ↗
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 mt-3">
                      <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5 bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-800/60">
                        <span className="text-signal">📷</span> {currentShot.camera}
                      </div>

                      <p className="text-[12px] leading-relaxed text-zinc-200">
                        {currentShot.action}
                      </p>

                      {currentShot.voiceover && (
                        <div className="rounded-lg border border-signal/25 bg-signal/[0.04] px-3 py-1.5 text-[11.5px] text-zinc-100 italic">
                          <span className="text-signal/80 font-bold not-italic mr-1.5">VO:</span>
                          "{currentShot.voiceover}"
                        </div>
                      )}

                      {currentShot.sfx && (
                        <div className="pt-1.5 border-t border-zinc-800/60 text-[10px] text-zinc-400 font-mono flex items-center gap-1.5">
                          <span>🎵</span> {currentShot.sfx} {currentShot.music ? `— ${currentShot.music}` : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Flecha Derecha (>) */}
                  <button
                    type="button"
                    onClick={() => setActiveScriptShotIdx(nextIdx)}
                    className="p-2.5 shrink-0 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-signal/60 text-zinc-300 hover:text-signal transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                    title={`Ir al Plano siguiente (P${shots[nextIdx]?.number})`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>

                {/* Tira inferior de botones/pills de selección directa */}
                <div className="flex items-center justify-between gap-1.5 pt-1">
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    Navegador ({shots.length}):
                  </span>
                  <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                    {shots.map((s, i) => (
                      <button
                        key={s.id || i}
                        type="button"
                        onClick={() => setActiveScriptShotIdx(i)}
                        className={`h-6 px-2 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer shrink-0 ${
                          i === currentIdx
                            ? "bg-signal text-black shadow-xs scale-105"
                            : "bg-zinc-900 border border-zinc-800/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
                        }`}
                        title={`Ir al Plano ${s.number}`}
                      >
                        P{s.number}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </Section>
      </div>

      <div className="space-y-5">
        {dna ? (
          <Section
            title="ADN viral"
            subtitle="La estructura que se clona. El contenido cambia; el ritmo no."
            action={<Repeat2 size={14} className="text-signal/70" />}
          >
            <div className="rounded-xl border border-signal/20 bg-signal/[0.05] p-3">
              <div className="label text-signal/70">Gancho (0-2s)</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-200">{dna.hook}</p>
            </div>

            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="label">Patrón</div>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{dna.pattern}</p>
            </div>

            {dna.beats && dna.beats.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Beats</div>
                <div className="relative space-y-3 border-l border-zinc-800 pl-4">
                  {(dna.beats || []).map((b, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-signal/70 ring-4 ring-ink-900" />
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[10.5px] font-bold text-signal">
                          {b.at}
                        </span>
                        <span className="text-[12px] font-medium text-zinc-200">{b.label}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{b.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dna.retentionTricks && dna.retentionTricks.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Trucos de retención</div>
                <ul className="space-y-1.5">
                  {(dna.retentionTricks || []).map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11.5px] text-zinc-400">
                      <Check size={12} className="mt-0.5 shrink-0 text-signal/70" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dna.cta && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
                <ArrowRight size={12} className="mt-0.5 shrink-0 text-zinc-500" />
                <div>
                  <div className="label">CTA</div>
                  <p className="text-[11.5px] text-zinc-300">{dna.cta}</p>
                </div>
              </div>
            )}
          </Section>
        ) : (
          <Section title="ADN viral" subtitle="Se completa al analizar un video o generar un plan.">
            <p className="py-4 text-[12px] text-zinc-600">
              Sin estructura todavía. Pega un enlace viral en el chat.
            </p>
          </Section>
        )}

        {(project.references || []).length > 0 && (
          <Section
            title="Qué se conserva y qué se reemplaza"
            subtitle="El corazón del clon: el esqueleto no se toca."
          >
            <div className="space-y-2">
              {(project.references || []).map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="label">{KIND_LABEL[ref.kind] || ref.kind}</span>
                      <span className="text-[12px] font-medium text-zinc-200">{ref.name}</span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${
                        ref.keep
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-fuchsia-500/10 text-fuchsia-300"
                      }`}
                    >
                      {ref.keep ? "conservar" : "reemplazar"}
                    </span>
                  </div>
                  {!ref.keep && ref.replaceWith && (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      <span className="text-zinc-600">→</span> {ref.replaceWith}
                    </p>
                  )}
                  <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-600">
                    {ref.description}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-signal" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Ficha del Video Fuente</span>
            </div>
            {project.sourceMeta?.url && (
              <a
                href={project.sourceMeta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10.5px] text-signal hover:underline"
              >
                <ExternalLink size={11} /> Ver original ↗
              </a>
            )}
          </div>
          {project.sourceMeta && (project.sourceMeta.title || project.sourceMeta.platform) ? (
            <div className="mt-3 flex gap-3">
              {project.sourceMeta.thumbnail && (
                <img
                  src={project.sourceMeta.thumbnail}
                  alt="Carátula fuente"
                  className="h-20 w-16 shrink-0 rounded-lg border border-zinc-800 object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1 text-[11px]">
                <div className="font-semibold text-zinc-200 line-clamp-2">
                  {project.sourceMeta.title || "Video fuente"}
                </div>
                <div className="text-zinc-400">
                  {project.sourceMeta.author || "@creador"} · <span className="text-zinc-500">{project.sourceMeta.platform}</span>
                </div>
                {(project.sourceMeta.views || project.sourceMeta.likes) && (
                  <div className="flex items-center gap-2 text-zinc-400 font-mono text-[10.5px] pt-1">
                    {project.sourceMeta.views && <span className="text-signal">👁️ {project.sourceMeta.views}</span>}
                    {project.sourceMeta.likes && <span className="text-rose-400">❤️ {project.sourceMeta.likes}</span>}
                  </div>
                )}
                {project.sourceMeta.note && (
                  <p className="text-[10px] text-zinc-500 pt-1 leading-relaxed">{project.sourceMeta.note}</p>
                )}
                {project.sourceMeta.url && (
                  <div className="pt-2">
                    <a
                      href={project.sourceMeta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/80 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:text-signal shadow-xs cursor-pointer"
                    >
                      <ExternalLink size={12} className="text-signal" /> Abrir video fuente original ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-600">
              Proyecto original, sin video fuente.
            </p>
          )}

          {/* BOTÓN DESPACHAR AL FÉNIX */}
          {(project.sourceMeta?.url || project.sourceUrl) && (
            <div className="mt-4 pt-3 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={handleDispatchFenix}
                disabled={miningFenix}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal/15 via-signal/25 to-signal/15 border border-signal/40 py-2.5 px-3 text-[12px] font-bold text-signal hover:bg-signal hover:text-black transition-all shadow-lg shadow-signal/10 disabled:opacity-50 cursor-pointer"
              >
                {miningFenix ? <Spinner size={13} /> : <span className="text-base leading-none">🦅</span>}
                <span>
                  {miningFenix
                    ? "Fénix en misión: extrayendo fotogramas..."
                    : fenixStatus
                    ? fenixStatus
                    : "Enviar al Fénix en la misión del video fuente"}
                </span>
              </button>
              {fenixStatus && !miningFenix && (
                <div className="mt-2 text-center text-[10.5px] font-medium text-emerald-400">
                  ⚡ Tu Nodo Fénix PC extraerá los fotogramas clave (1 frame = 1 plano) para Wan 2.1.
                </div>
              )}

              {/* Riel de fotogramas del Fénix en carrusel de 1 en pantalla con flechas (< ; >) */}
              {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (() => {
                const fList = project.sourceMeta.frames;
                const currentFIdx = Math.max(0, Math.min(activeFenixShotIdx, fList.length - 1));
                const currentFrame = fList[currentFIdx];
                const prevFIdx = (currentFIdx - 1 + fList.length) % fList.length;
                const nextFIdx = (currentFIdx + 1) % fList.length;
                const matchingShot =
                  (project.shots || []).find((s) => s.number === currentFrame.shotNumber) ||
                  (project.shots || [])[currentFIdx];

                return (
                  <div className="mt-3.5 pt-3 border-t border-zinc-800/60 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                      <span className="flex items-center gap-1.5 text-signal font-mono">
                        <span>🦅</span> Fotograma {currentFIdx + 1} de {fList.length} ({currentFrame.timestampSec}s)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setViewingFrameIdx(currentFIdx);
                          setIsPlayingSlideshow(true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-signal/15 hover:bg-signal/25 border border-signal/40 px-2 py-1 text-[10px] font-bold text-signal transition cursor-pointer"
                        title="Reproducir secuencia de fotogramas cada 3 segundos"
                      >
                        <Play size={10} fill="currentColor" /> Slideshow (3s)
                      </button>
                    </div>

                    {/* Carrusel Fénix: 1 en pantalla con flechas laterales (< ; >) */}
                    <div className="relative flex items-center gap-2.5">
                      {/* Flecha Izquierda (<) */}
                      <button
                        type="button"
                        onClick={() => setActiveFenixShotIdx(prevFIdx)}
                        className="p-2.5 shrink-0 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-signal/60 text-zinc-300 hover:text-signal transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                        title={`Ver fotograma anterior (P${fList[prevFIdx]?.shotNumber})`}
                      >
                        <ChevronLeft size={20} />
                      </button>

                      {/* Tarjeta del Fotograma + Plano Sincronizado */}
                      <div className="flex-1 flex flex-col gap-2 rounded-2xl border border-signal/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-3 shadow-lg shadow-signal/5">
                        {/* Fotograma grande */}
                        <div
                          onClick={() => {
                            setViewingFrameIdx(currentFIdx);
                            setIsPlayingSlideshow(false);
                          }}
                          className="relative w-full h-44 rounded-xl overflow-hidden border border-zinc-800 hover:border-signal group cursor-pointer transition shadow-md bg-black/60 flex items-center justify-center"
                          title="Clic para ampliar fotograma"
                        >
                          <img
                            src={currentFrame.frameUrl}
                            alt={`Plano ${currentFrame.shotNumber}`}
                            className="w-full h-full object-contain group-hover:scale-105 transition duration-300"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                            <Maximize2 size={18} className="text-white" />
                          </div>
                          <div className="absolute bottom-2 left-2 rounded-lg bg-black/85 px-2 py-0.5 text-[10px] font-mono text-zinc-200 border border-white/10 backdrop-blur-xs">
                            P{currentFrame.shotNumber} ({currentFrame.timestampSec}s)
                          </div>
                        </div>

                        {/* Ficha técnica compacta debajo */}
                        {matchingShot ? (
                          <div
                            onClick={() => setSelectedShotIndex(currentFIdx)}
                            className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-2.5 hover:border-signal/80 hover:bg-zinc-900/90 cursor-pointer transition flex flex-col justify-between group"
                            title={`Ver ficha completa del Plano ${matchingShot.number}`}
                          >
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[11px] font-bold text-signal font-mono">
                                P{matchingShot.number}: {matchingShot.title}
                              </span>
                              <span className="text-[9.5px] text-zinc-400 group-hover:text-signal font-mono transition">
                                Ficha ↗
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono line-clamp-1 mb-1">
                              📷 {matchingShot.camera}
                            </div>
                            <p className="text-[10.5px] text-zinc-300 line-clamp-2 leading-relaxed">
                              {matchingShot.action}
                            </p>
                            {matchingShot.voiceover && (
                              <div className="mt-1 text-[10px] text-zinc-300 italic border-l-2 border-signal/40 pl-1.5 line-clamp-1">
                                VO: "{matchingShot.voiceover}"
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-zinc-800 p-2 text-center text-[10.5px] text-zinc-600">
                            Plano {currentFrame.shotNumber} en generación...
                          </div>
                        )}
                      </div>

                      {/* Flecha Derecha (>) */}
                      <button
                        type="button"
                        onClick={() => setActiveFenixShotIdx(nextFIdx)}
                        className="p-2.5 shrink-0 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-signal/60 text-zinc-300 hover:text-signal transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                        title={`Ver fotograma siguiente (P${fList[nextFIdx]?.shotNumber})`}
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    {/* Tira inferior de miniaturas para salto directo */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                        Frames ({fList.length}):
                      </span>
                      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
                        {fList.map((f, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setActiveFenixShotIdx(i)}
                            className={`relative shrink-0 w-8 h-10 rounded overflow-hidden border transition-all cursor-pointer ${
                              i === currentFIdx
                                ? "border-signal ring-2 ring-signal/50 scale-105"
                                : "border-zinc-800 opacity-50 hover:opacity-100"
                            }`}
                            title={`Saltar a Plano ${f.shotNumber}`}
                          >
                            <img src={f.frameUrl} alt="" className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[7px] font-mono text-center text-zinc-200">
                              {f.shotNumber}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReconstructWithFenix(project.sourceMeta!.frames!)}
                    disabled={reconstructing}
                    className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500/20 via-signal/30 to-emerald-500/20 border border-signal/60 py-2.5 px-3 text-[12px] font-bold text-signal hover:bg-signal hover:text-black transition-all shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    {reconstructing ? <Spinner size={13} /> : <span className="text-base leading-none">🎬</span>}
                    <span>
                      {reconstructing
                        ? `Director Gemini analizando ${project.sourceMeta.frames.length} fotogramas...`
                        : `🎬 Reconstruir Guion (${project.sourceMeta.frames.length} Planos para Wan 2.1)`}
                    </span>
                  </button>
                </div>
              );
            })()}
            </div>
          )}
        </div>
      </div>

      {/* MODAL / MINI REPRODUCTOR DE FOTOGRAMAS DEL FÉNIX */}
      {viewingFrameIdx !== null && frames[viewingFrameIdx] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Cabecera del modal */}
            <div className="w-full flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60">
              <div className="flex items-center gap-2">
                <span className="text-base">🦅</span>
                <span className="text-sm font-bold text-zinc-100">
                  Plano {frames[viewingFrameIdx].shotNumber} de {frames.length}
                </span>
                <span className="text-xs text-signal font-mono">
                  ({frames[viewingFrameIdx].timestampSec}s en video fuente)
                </span>
                {isPlayingSlideshow && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Reproduciendo ADN (3s)
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setViewingFrameIdx(null);
                  setIsPlayingSlideshow(false);
                }}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenedor de la Imagen con flechas */}
            <div className="relative flex-1 w-full flex items-center justify-center bg-black/60 p-4 min-h-[50vh] max-h-[66vh] overflow-hidden">
              <img
                src={frames[viewingFrameIdx].frameUrl}
                alt={`Plano ${frames[viewingFrameIdx].shotNumber}`}
                className="max-h-[62vh] max-w-full rounded-xl object-contain shadow-2xl transition-all duration-300"
              />

              {/* Flecha anterior */}
              <button
                type="button"
                onClick={() => {
                  setIsPlayingSlideshow(false);
                  setViewingFrameIdx((prev) => (prev === null ? 0 : (prev - 1 + frames.length) % frames.length));
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/70 hover:bg-zinc-800 text-white border border-white/10 shadow-xl transition cursor-pointer hover:scale-110"
                title="Plano anterior (Flecha Izquierda)"
              >
                <ChevronLeft size={22} />
              </button>

              {/* Flecha siguiente */}
              <button
                type="button"
                onClick={() => {
                  setIsPlayingSlideshow(false);
                  setViewingFrameIdx((prev) => (prev === null ? 0 : (prev + 1) % frames.length));
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/70 hover:bg-zinc-800 text-white border border-white/10 shadow-xl transition cursor-pointer hover:scale-110"
                title="Plano siguiente (Flecha Derecha)"
              >
                <ChevronRight size={22} />
              </button>
            </div>

            {/* Barra de control inferior */}
            <div className="w-full px-4 py-3 border-t border-zinc-800/80 bg-zinc-900/60 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsPlayingSlideshow((prev) => !prev)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-md cursor-pointer ${
                    isPlayingSlideshow
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30"
                      : "bg-signal text-black hover:bg-signal/90"
                  }`}
                >
                  {isPlayingSlideshow ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
                  <span>{isPlayingSlideshow ? "Pausar Slideshow" : "Reproducir ADN (cada 3s)"}</span>
                </button>

                <div className="text-[11px] text-zinc-400 font-mono">
                  Usa <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">←</kbd> <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">→</kbd> o <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">Espacio</kbd>
                </div>
              </div>

              {/* Asignación directa a Personajes / Reparto */}
              {project.characters && project.characters.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800/80">
                  <span className="text-[10.5px] font-mono font-bold text-amber-400 flex items-center gap-1 shrink-0">
                    👑 Asignar este fotograma como rostro a:
                  </span>
                  {project.characters.map((c) => {
                    const isAssigned = c.avatarUrl === frames[viewingFrameIdx].frameUrl;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const url = frames[viewingFrameIdx].frameUrl;
                          patch((prev) => ({
                            characters: (prev.characters || []).map((ch) =>
                              ch.id === c.id
                                ? {
                                    ...ch,
                                    avatarUrl: url,
                                    castingVariations: [url, ...(ch.castingVariations || []).filter((u) => u !== url)],
                                  }
                                : ch
                            ),
                          }));
                          setAssignSuccessMsg(`¡Plano ${frames[viewingFrameIdx].shotNumber} asignado a ${c.name}!`);
                          setTimeout(() => setAssignSuccessMsg(null), 3000);
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-semibold transition cursor-pointer ${
                          isAssigned
                            ? "bg-amber-500 text-black font-bold shadow-sm"
                            : "bg-zinc-800/90 text-zinc-200 hover:bg-amber-500/20 hover:text-amber-300 border border-zinc-700/60"
                        }`}
                        title={`Fijar como referencia visual oficial de ${c.name}`}
                      >
                        {isAssigned ? <Check size={11} /> : <span>👤</span>}
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                  {assignSuccessMsg && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 animate-in fade-in">
                      {assignSuccessMsg}
                    </span>
                  )}
                </div>
              )}

              {/* Tira inferior de miniaturas para salto directo */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {frames.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setViewingFrameIdx(i);
                      setIsPlayingSlideshow(false);
                    }}
                    className={`relative shrink-0 w-12 h-14 rounded-md overflow-hidden border transition cursor-pointer ${
                      i === viewingFrameIdx
                        ? "border-signal ring-2 ring-signal/50 scale-105"
                        : "border-zinc-800 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={f.frameUrl} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[7.5px] font-mono text-center text-zinc-300">
                      P{f.shotNumber}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / FICHA COMPLETA DEL PLANO EXPANDIDO */}
      {selectedShotIndex !== null && (project.shots || [])[selectedShotIndex] && (() => {
        const shot = (project.shots || [])[selectedShotIndex];
        const totalShots = (project.shots || []).length;
        const matchingFrame = (project.sourceMeta?.frames || []).find((f) => f.shotNumber === shot.number) || (project.sourceMeta?.frames || [])[selectedShotIndex];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="relative max-w-2xl w-full max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* Cabecera */}
              <div className="w-full flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-signal font-display text-xs font-bold text-black">
                    {shot.number}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                      <span>Plano {shot.number}: {shot.title}</span>
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-signal">
                        {shot.seconds}s
                      </span>
                    </h3>
                    <p className="text-[10px] font-mono text-zinc-500">
                      Plano {selectedShotIndex + 1} de {totalShots}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedShotIndex((prev) => (prev === null ? 0 : (prev - 1 + totalShots) % totalShots))}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                    title="Plano anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedShotIndex((prev) => (prev === null ? 0 : (prev + 1) % totalShots))}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                    title="Plano siguiente"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedShotIndex(null)}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer ml-1"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Contenido scrolleable */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                {(matchingFrame?.frameUrl || shot.imageUrl) && (
                  <div className="relative w-full rounded-xl overflow-hidden border border-zinc-800 bg-black/60 max-h-60 flex items-center justify-center">
                    <img
                      src={matchingFrame?.frameUrl || shot.imageUrl}
                      alt={`Fotograma Plano ${shot.number}`}
                      className="max-h-60 w-full object-contain"
                    />
                    <div className="absolute top-2 left-2 rounded bg-black/80 px-2 py-0.5 text-[10px] font-mono text-signal border border-signal/30 backdrop-blur-xs">
                      🦅 Fotograma Wan 2.1 ({matchingFrame?.timestampSec ?? (shot.seconds * selectedShotIndex)}s)
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-signal font-mono uppercase tracking-wider mb-1">
                    <span>📷</span> Cámara & Movimiento Wan 2.1
                  </div>
                  <p className="text-[12px] text-zinc-200 font-mono leading-relaxed">
                    {shot.camera}
                  </p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
                  <div className="text-[10.5px] font-bold text-zinc-400 font-mono uppercase tracking-wider mb-1">
                    🎬 Acción en Escena
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-zinc-200">
                    {shot.action}
                  </p>
                </div>

                {shot.voiceover && (
                  <div className="rounded-xl border border-signal/30 bg-signal/[0.04] p-3.5">
                    <div className="text-[10.5px] font-bold text-signal font-mono uppercase tracking-wider mb-1">
                      🎙️ Voz en Off / Diálogo (Audio Sync)
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-zinc-100 italic">
                      "{shot.voiceover}"
                    </p>
                  </div>
                )}

                {(shot.sfx || shot.music) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {shot.sfx && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase">🎵 Efectos de Sonido (SFX)</div>
                        <p className="text-[11.5px] text-zinc-300 mt-0.5">{shot.sfx}</p>
                      </div>
                    )}
                    {shot.music && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="text-[10px] font-mono text-zinc-500 uppercase">🎼 Banda Sonora / Beat</div>
                        <p className="text-[11.5px] text-zinc-300 mt-0.5">{shot.music}</p>
                      </div>
                    )}
                  </div>
                )}

                {(shot.imagePrompt || shot.videoPrompt) && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2.5">
                    <div className="text-[10.5px] font-bold text-zinc-400 font-mono uppercase tracking-wider">
                      ⚡ Prompts para Wan 2.1 / ComfyUI
                    </div>
                    {shot.imagePrompt && (
                      <div>
                        <div className="text-[9.5px] text-zinc-500 font-mono">Image Prompt (Keyframe):</div>
                        <p className="text-[10.5px] text-zinc-300 font-mono bg-black/40 p-2 rounded-lg border border-zinc-800/80 select-all">
                          {shot.imagePrompt}
                        </p>
                      </div>
                    )}
                    {shot.videoPrompt && (
                      <div>
                        <div className="text-[9.5px] text-zinc-500 font-mono">Video Motion Prompt:</div>
                        <p className="text-[10.5px] text-zinc-300 font-mono bg-black/40 p-2 rounded-lg border border-zinc-800/80 select-all">
                          {shot.videoPrompt}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selector horizontal de planos */}
              <div className="w-full px-5 py-3 border-t border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
                <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-thin max-w-full">
                  {(project.shots || []).map((s, i) => (
                    <button
                      key={s.id || i}
                      type="button"
                      onClick={() => setSelectedShotIndex(i)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer shrink-0 ${
                        i === selectedShotIndex
                          ? "bg-signal text-black"
                          : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                      }`}
                    >
                      P{s.number}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}