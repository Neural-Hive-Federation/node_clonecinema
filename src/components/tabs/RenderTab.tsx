import React, { useEffect, useState, useRef } from "react";
import { CircleAlert, Clapperboard, Download, Play, RotateCw, Sparkles, ListFilter, Check, X, ChevronDown, StopCircle, Wand2, Clock } from "lucide-react";
import type { Project, ProjectUpdater, Shot } from "../../types";
import { isPaymentRequired, startVideo, videoStatus, waitForJobFull } from "../../lib/api";
import { useSession } from "../../context/SessionContext";
import { FORMAT_CLASS, Section, Spinner } from "../ui";

export function RenderTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [error, setError] = useState<string | null>(null);
  const { openPaywall, refreshAccount, costs } = useSession();

  // Estados para selección y renderizado por lote de video
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [bulkRendering, setBulkRendering] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
    shotNumber: number;
    title: string;
    statusText: string;
  } | null>(null);
  const abortBulkRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Estados de Telemetría Watchdog 2.0 y Gateway GPU
  const [gatewayStatus, setGatewayStatus] = useState<{
    online: boolean;
    status: string;
    isWarning: boolean;
    warningSeconds: number;
    note: string;
  }>({
    online: false,
    status: "offline",
    isWarning: false,
    warningSeconds: 0,
    note: "",
  });
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Sondeo de presencia y estado del Watchdog 2.0
  useEffect(() => {
    let active = true;
    const checkGateway = async () => {
      try {
        const res = await fetch("/api/wan/register");
        if (res.ok && active) {
          const data = await res.json();
          setGatewayStatus({
            online: !!data.online,
            status: data.status || "offline",
            isWarning: !!data.isWarning,
            warningSeconds: data.warningSeconds || 0,
            note: data.note || "",
          });
          if (data.isWarning) {
            setShowWarningModal(true);
          } else {
            setShowWarningModal(false);
          }
        }
      } catch {}
    };

    void checkGateway();
    const interval = setInterval(checkGateway, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleKeepalive = async () => {
    try {
      await fetch("/api/wan/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "keepalive" }),
      });
      setShowWarningModal(false);
      setGatewayStatus((prev) => ({ ...prev, isWarning: false, status: "running" }));
    } catch {}
  };

  const handleManualShutdown = async () => {
    try {
      await fetch("/api/wan/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "shutdown" }),
      });
      setShowWarningModal(false);
      setGatewayStatus((prev) => ({ ...prev, online: false, status: "offline", isWarning: false }));
    } catch {}
  };

  const updateShot = (id: string, partial: Partial<Shot>) =>
    patch((prev) => ({
      shots: (prev.shots || []).map((s) => (s.id === id ? { ...s, ...partial } : s)),
    }));

  const toggleShotSelection = (shotId: string) => {
    setSelectedForBatch((prev) =>
      prev.includes(shotId) ? prev.filter((id) => id !== shotId) : [...prev, shotId]
    );
  };

  const selectAllShots = () => {
    setSelectedForBatch((project.shots || []).map((s) => s.id));
  };

  const selectEmptyShots = () => {
    setSelectedForBatch((project.shots || []).filter((s) => !s.videoUrl).map((s) => s.id));
  };

  const clearSelection = () => {
    setSelectedForBatch([]);
  };

  // Sondeo periódico para planos que se están renderizando en segundo plano
  useEffect(() => {
    if (bulkRendering) return; // Si el renderizado por lote está activo, él mismo gestiona el sondeo

    const pending = (project.shots || []).filter((s) => s.status === "rendering" && s.operationName);
    if (pending.length === 0) return;

    const timer = setInterval(async () => {
      for (const shot of pending) {
        try {
          const res = await videoStatus(shot.operationName!);
          if (res.done && res.videoUrl) {
            updateShot(shot.id, { status: "ready", videoUrl: res.videoUrl });
            void refreshAccount();
          } else if (res.error) {
            updateShot(shot.id, { status: "error", error: res.error });
          }
        } catch (err: any) {
          updateShot(shot.id, { status: "error", error: err?.message || "Render fallido" });
        }
      }
    }, 7000);

    return () => clearInterval(timer);
  }, [project.shots, bulkRendering]);

  // Renderizado individual de un plano
  async function render(shot: Shot) {
    setError(null);
    updateShot(shot.id, { status: "rendering", error: undefined });
    try {
      const res = await startVideo(shot.videoPrompt, project.format, shot.imageUrl, shot.seconds);
      const tracked = res.jobId || res.operationName;
      if (!tracked) throw new Error(res.error || "No se inició el render");
      updateShot(shot.id, { operationName: tracked, status: "rendering" });
      void refreshAccount();
    } catch (err: any) {
      if (isPaymentRequired(err)) openPaywall(err.message);
      else setError(err?.message || "No se pudo iniciar el render.");
      updateShot(shot.id, { status: "error", error: err?.message });
    }
  }

  // Renderizado por lotes secuencial con orden estricto de planos para concordancia perfecta
  async function renderBatch(targetIds?: string[]) {
    const ids = targetIds || (selectedForBatch.length > 0 ? selectedForBatch : (project.shots || []).map((s) => s.id));
    const targetShots = (project.shots || [])
      .filter((s) => ids.includes(s.id))
      .sort((a, b) => a.number - b.number);

    if (targetShots.length === 0) return;

    setBulkRendering(true);
    abortBulkRef.current = false;
    abortControllerRef.current = new AbortController();
    setError(null);

    // Pre-flight SaaS Autónomo: Si la GPU está apagada, la despertamos automáticamente vía API
    if (!gatewayStatus.online) {
      setBulkProgress({
        current: 0,
        total: targetShots.length,
        shotNumber: 0,
        title: "Arranque Autónomo de GPU",
        statusText: "🚀 Despertando servidor GPU Wan 2.2 en la nube (arranque automático, espere ~60-90s)...",
      });

      try {
        await fetch("/api/wan/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "wake" }),
        });

        // Sondear hasta que el túnel esté online (hasta 120s)
        for (let i = 0; i < 24; i++) {
          if (abortBulkRef.current) break;
          await new Promise((r) => setTimeout(r, 5000));
          const check = await fetch("/api/wan/register");
          if (check.ok) {
            const cData = await check.json();
            if (cData.online) {
              setGatewayStatus((prev) => ({ ...prev, online: true, status: "running" }));
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Fallo en arranque automático GPU:", e);
      }
    }

    let count = 0;
    for (const shot of targetShots) {
      if (abortBulkRef.current) break;

      count++;
      setBulkProgress({
        current: count,
        total: targetShots.length,
        shotNumber: shot.number,
        title: shot.title,
        statusText: "Enviando a Wan 2.1 (Kaggle GPU)...",
      });

      updateShot(shot.id, { status: "rendering", error: undefined });

      try {
        const res = await startVideo(shot.videoPrompt, project.format, shot.imageUrl, shot.seconds);
        const tracked = res.jobId || res.operationName;
        if (!tracked) throw new Error(res.error || "No se pudo iniciar el render.");

        updateShot(shot.id, { operationName: tracked, status: "rendering" });

        setBulkProgress((prev) =>
          prev ? { ...prev, statusText: "GPU activa: procesando clip con Wan 2.1..." } : null
        );

        const statusRes = await waitForJobFull(
          tracked,
          "video",
          abortControllerRef.current?.signal,
          (statusText) => {
            setBulkProgress((prev) =>
              prev ? { ...prev, statusText: `GPU Wan 2.1: ${statusText}` } : null
            );
          }
        );

        if (statusRes.done && statusRes.videoUrl) {
          updateShot(shot.id, { status: "ready", videoUrl: statusRes.videoUrl });
          void refreshAccount();
        } else if (statusRes.error) {
          updateShot(shot.id, { status: "error", error: statusRes.error });
        }
      } catch (err: any) {
        if (isPaymentRequired(err)) {
          openPaywall(err.message);
          break;
        }
        if (err?.message?.includes("cancelad")) {
          break;
        }
        console.error(`Error en render de Plano ${shot.number}:`, err);
        updateShot(shot.id, { status: "error", error: err?.message || "Fallo en render de video" });
      }
    }

    setBulkRendering(false);
    setBulkProgress(null);
  }

  function handleCancelBulk() {
    abortBulkRef.current = true;
    abortControllerRef.current?.abort();
    setBulkRendering(false);
    setBulkProgress(null);
  }

  const ready = (project.shots || []).filter((s) => s.videoUrl).length;
  const totalShots = (project.shots || []).length;
  const shotsWithoutVideo = (project.shots || []).filter((s) => !s.videoUrl).length;

  return (
    <div className="space-y-5">
      {/* Barra de control superior con chips y herramientas de lote */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-active">{project.format}</span>
          <span className="chip">{totalShots} planos</span>
          <span className="chip">{ready} renderizados</span>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                gatewayStatus.online
                  ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-500/50"
                  : gatewayStatus.status === "booting"
                  ? "bg-blue-400 animate-ping"
                  : gatewayStatus.status === "warning"
                  ? "bg-amber-400 animate-bounce"
                  : "bg-zinc-500"
              }`}
            />
            <span className="text-zinc-400 font-medium">
              {gatewayStatus.online
                ? "GPU Wan 2.2 Lista (Warm)"
                : gatewayStatus.status === "booting"
                ? "Arrancando GPU..."
                : gatewayStatus.status === "warning"
                ? `Apagado en ${gatewayStatus.warningSeconds}s`
                : "GPU en Reposo"}
            </span>
          </div>
        </div>

        {/* Controles de Lote de Video */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn btn-ghost text-[11.5px] border flex items-center gap-1.5 transition ${
              selectedForBatch.length > 0
                ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25 font-semibold shadow-xs"
                : "border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white"
            }`}
            onClick={() => setShowBatchModal(true)}
            title="Selecciona planos específicos para renderizar en lote"
          >
            <ListFilter size={13} className={selectedForBatch.length > 0 ? "text-signal" : "text-zinc-400"} />
            <span>
              {selectedForBatch.length > 0 ? `Lote (${selectedForBatch.length} seleccionados)` : "Seleccionar lote"}
            </span>
            <ChevronDown size={11} className={selectedForBatch.length > 0 ? "text-signal" : "text-zinc-500"} />
          </button>

          {selectedForBatch.length > 0 ? (
            <>
              <button
                type="button"
                className="btn btn-primary text-[11.5px] border border-signal/50 bg-signal/25 text-signal hover:bg-signal hover:text-black font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                onClick={() => renderBatch(selectedForBatch)}
                disabled={bulkRendering}
                title={`Renderizar únicamente los ${selectedForBatch.length} planos seleccionados en orden`}
              >
                {bulkRendering ? <Spinner size={13} /> : <Sparkles size={13} />}
                <span>🎬 Renderizar selección ({selectedForBatch.length})</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost text-[11px] text-zinc-500 hover:text-red-400 px-2 py-1 border border-zinc-800/80 hover:border-red-500/30 rounded-lg transition"
                onClick={clearSelection}
                title="Deseleccionar todos los planos"
              >
                <X size={12} /> Desmarcar
              </button>
            </>
          ) : shotsWithoutVideo > 0 && ready > 0 ? (
            <button
              type="button"
              className="btn btn-primary text-[11.5px] border border-signal/40 bg-signal/15 text-signal hover:bg-signal hover:text-black font-semibold flex items-center gap-1.5 cursor-pointer shadow-md"
              onClick={() => renderBatch((project.shots || []).filter((s) => !s.videoUrl).map((s) => s.id))}
              disabled={bulkRendering}
              title={`Renderizar los ${shotsWithoutVideo} planos pendientes`}
            >
              {bulkRendering ? <Spinner size={13} /> : <Wand2 size={13} />}
              <span>Renderizar pendientes ({shotsWithoutVideo})</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost text-[11.5px] border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
              onClick={() => renderBatch()}
              disabled={bulkRendering || totalShots === 0}
              title="Renderizar todos los planos en lote"
            >
              <Sparkles size={13} className="text-signal" />
              <span>Renderizar lote ({totalShots})</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de Progreso Activo de Renderizado por Lote */}
      {bulkRendering && bulkProgress && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-signal/50 bg-gradient-to-r from-signal/15 via-zinc-900 to-zinc-950 p-4 shadow-xl shadow-signal/10 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-signal/40 bg-signal/20 text-signal shadow-inner">
              <Spinner size={18} />
            </div>
            <div>
              <div className="text-[13px] font-bold text-white flex items-center gap-2">
                <span>Renderizando Video por Lote ({bulkProgress.current} de {bulkProgress.total})</span>
                <span className="rounded bg-signal/20 text-signal px-2 py-0.5 text-[11px] font-mono border border-signal/40">
                  Plano {bulkProgress.shotNumber}
                </span>
              </div>
              <div className="text-[11.5px] text-zinc-300 font-medium truncate max-w-lg mt-0.5">
                "{bulkProgress.title}" · <span className="text-signal/90 font-mono text-[11px]">{bulkProgress.statusText}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelBulk}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-[11.5px] font-bold text-red-300 hover:bg-red-500/25 transition cursor-pointer"
          >
            <StopCircle size={14} /> Detener lote
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-[11.5px] text-red-300">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {(project.shots || []).length === 0 && (
        <div className="panel px-5 py-10 text-center text-[12px] text-zinc-500">
          Sin planos que renderizar.
        </div>
      )}

      {/* Cuadrícula de Planos de Video */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(project.shots || []).map((shot) => {
          const rendering = shot.status === "rendering";
          const isChecked = selectedForBatch.includes(shot.id);

          return (
            <div
              key={shot.id}
              className={`panel overflow-hidden transition-all duration-200 ${
                isChecked ? "ring-2 ring-signal/50 border-signal/50" : ""
              }`}
            >
              <div
                className={`relative ${FORMAT_CLASS[project.format] || "aspect-video"} max-h-[280px] w-full bg-black`}
              >
                {shot.videoUrl ? (
                  <video
                    src={shot.videoUrl}
                    controls
                    className="h-full w-full object-contain"
                    poster={shot.imageUrl}
                  />
                ) : shot.imageUrl ? (
                  <img
                    src={shot.imageUrl}
                    alt={shot.title}
                    className="h-full w-full object-cover opacity-60"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-900 to-black text-zinc-800">
                    <Clapperboard size={26} />
                  </div>
                )}

                {rendering && !shot.videoUrl && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-[11px] text-zinc-300 backdrop-blur-xs">
                    <Spinner size={18} />
                    Renderizando clip Wan 2.1…
                    <span className="text-[10px] text-zinc-400">
                      puede tardar varios minutos
                    </span>
                  </div>
                )}

                {/* Badges superiores con checkbox de selección por lote */}
                <div className="absolute left-2 top-2 flex items-center gap-1.5 z-10">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleShotSelection(shot.id);
                    }}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition cursor-pointer select-none ${
                      isChecked
                        ? "bg-signal text-black border-signal shadow-sm"
                        : "border-white/50 bg-black/70 text-transparent hover:border-white"
                    }`}
                    title="Marcar / desmarcar para lote"
                  >
                    <Check size={12} className="stroke-[3]" />
                  </div>
                  <span className="rounded bg-black/75 px-2 py-0.5 text-[10.5px] font-bold text-zinc-100 border border-white/10">
                    P{shot.number}
                  </span>
                  <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-zinc-400 font-mono border border-white/10">
                    {shot.seconds}s
                  </span>
                </div>
              </div>

              <div className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-zinc-100">
                      {shot.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                      {shot.videoPrompt}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {shot.videoUrl && (
                      <a
                        href={shot.videoUrl}
                        download={`shot-${shot.number}.mp4`}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        title="Descargar clip"
                      >
                        <Download size={13} />
                      </a>
                    )}
                    <button
                      className="btn btn-ghost !px-2.5 !py-1.5 !text-[11px]"
                      onClick={() => render(shot)}
                      disabled={rendering || bulkRendering}
                      title={shot.videoUrl ? "Volver a renderizar" : "Renderizar plano"}
                    >
                      {rendering ? (
                        <Spinner />
                      ) : shot.videoUrl ? (
                        <RotateCw size={12} />
                      ) : (
                        <Play size={12} />
                      )}
                      {shot.videoUrl ? "Rehacer" : "Render"}
                    </button>
                  </div>
                </div>
                {shot.status === "error" && shot.error && !shot.videoUrl && (
                  <p className="mt-2 rounded bg-red-500/5 px-2 py-1 text-[10.5px] text-red-400/90">
                    {shot.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Selección de Lote de Video */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-signal/30 bg-signal/10 text-signal shadow-inner">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                    Renderizado de Video por Lote (Wan 2.1)
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-normal text-zinc-400">
                      {totalShots} planos
                    </span>
                  </h3>
                  <p className="text-[12px] text-zinc-400">
                    Selecciona los planos que deseas procesar en cadena continua sin interrupciones.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filtros rápidos */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-900/60 p-2.5 border border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-zinc-400">Filtros rápidos:</span>
                <button
                  type="button"
                  onClick={selectAllShots}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-signal/50 hover:text-white transition cursor-pointer"
                >
                  Seleccionar todos ({totalShots})
                </button>
                <button
                  type="button"
                  onClick={selectEmptyShots}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-signal/50 hover:text-white transition cursor-pointer"
                >
                  Solo sin video ({shotsWithoutVideo})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-zinc-500 hover:text-red-400 transition cursor-pointer px-1"
                >
                  Deseleccionar todos
                </button>
              </div>
            </div>

            {/* Cuadrícula de planos con selección individual */}
            <div className="mt-4 max-h-[360px] overflow-y-auto pr-1 space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(project.shots || []).map((shot) => {
                  const isChecked = selectedForBatch.includes(shot.id);
                  return (
                    <div
                      key={shot.id}
                      onClick={() => toggleShotSelection(shot.id)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        isChecked
                          ? "border-signal/60 bg-signal/10 ring-1 ring-signal/30"
                          : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                            isChecked
                              ? "bg-signal text-black border-signal shadow-sm"
                              : "border-zinc-700 bg-zinc-800/50 text-transparent"
                          }`}
                        >
                          <Check size={14} className="stroke-[3]" />
                        </div>

                        {shot.imageUrl && (
                          <img
                            src={shot.imageUrl}
                            alt={shot.title}
                            className="h-10 w-10 shrink-0 rounded-md object-cover border border-zinc-800"
                          />
                        )}

                        <div className="overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[12px] text-white">Plano {shot.number}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">({shot.seconds}s)</span>
                          </div>
                          <div className="truncate text-[11px] text-zinc-400">{shot.title}</div>
                        </div>
                      </div>

                      <div className="shrink-0 text-[10px]">
                        {shot.videoUrl ? (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-emerald-400 font-medium">
                            Listo
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-zinc-400">
                            Pendiente
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer con resumen y botón de ejecución */}
            <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-4">
              <div className="text-[12px] text-zinc-400">
                <span className="font-bold text-signal text-sm">{selectedForBatch.length}</span>{" "}
                {selectedForBatch.length === 1 ? "plano seleccionado" : "planos seleccionados"} ·{" "}
                <span className="text-zinc-300">
                  {selectedForBatch.length * costs.video} {selectedForBatch.length * costs.video === 1 ? "crédito" : "créditos"} estimados
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="btn btn-ghost text-[12px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={selectedForBatch.length === 0 || bulkRendering}
                  onClick={() => {
                    setShowBatchModal(false);
                    renderBatch(selectedForBatch);
                  }}
                  className="btn btn-primary text-[12px] border border-signal/50 bg-signal text-black font-bold flex items-center gap-1.5 shadow-lg shadow-signal/20 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>Iniciar Renderizado ({selectedForBatch.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sección Informativa del Montaje */}
      <Section
        title="Montaje Automático del Video Final"
        subtitle="¡Todo el ensamble ocurre en un solo clic en la pestaña Publicar!"
        action={
          <span className="rounded-full bg-signal/15 px-3 py-1 text-[11px] font-semibold text-signal flex items-center gap-1.5 border border-signal/25">
            <Sparkles size={13} /> CineMaster Activo
          </span>
        }
      >
        <div className="rounded-xl border border-signal/20 bg-signal/5 p-4 text-[12px] leading-relaxed text-zinc-300">
          <p className="font-semibold text-white mb-2 flex items-center gap-1.5">
            ✨ Ya no necesitas unir los clips ni sincronizar los audios manualmente:
          </p>
          <ol className="grid grid-cols-1 gap-2.5 text-zinc-400 sm:grid-cols-2 text-[11.5px]">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/20 font-bold text-signal text-[10px]">1</span>
              <span>Renderiza tus planos con Wan 2.1 I2V de forma individual o en lote continuo.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/20 font-bold text-signal text-[10px]">2</span>
              <span>Dirígete a la pestaña <strong>Publicar</strong>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/20 font-bold text-signal text-[10px]">3</span>
              <span>En <strong>CineMaster</strong> se reproducen los clips en cadena con audios, música y subtítulos virales.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-signal/20 font-bold text-signal text-[10px]">4</span>
              <span>Haz clic en <strong>Descargar Video Master</strong> para obtener el video completo final.</span>
            </li>
          </ol>
        </div>
      </Section>

      {/* Modal Interactivo de Presencia Humana Watchdog 2.0 */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-zinc-900 border border-amber-500/50 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center text-2xl font-bold">
              ⏱️
            </div>
            <div>
              <h3 className="text-base font-bold text-white">¿Sigues en la sala de dirección?</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                El servidor GPU Wan 2.2 se apagará automáticamente en{" "}
                <span className="text-amber-400 font-mono font-bold text-sm">
                  {gatewayStatus.warningSeconds || 120}s
                </span>{" "}
                por inactividad para conservar tus horas de cómputo.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={handleKeepalive}
                className="px-5 py-2.5 bg-signal hover:bg-signal/90 text-black font-bold text-xs rounded-xl shadow-lg shadow-signal/20 transition cursor-pointer"
              >
                Mantener Encendido
              </button>
              <button
                type="button"
                onClick={handleManualShutdown}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs rounded-xl border border-zinc-700 transition cursor-pointer"
              >
                Apagar Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
