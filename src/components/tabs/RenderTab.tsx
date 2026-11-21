import React, { useEffect, useState } from "react";
import { CircleAlert, Clapperboard, Download, Play, RotateCw } from "lucide-react";
import type { Project, ProjectUpdater, Shot } from "../../types";
import { isPaymentRequired, startVideo, videoStatus } from "../../lib/api";
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

  const updateShot = (id: string, partial: Partial<Shot>) =>
    patch((prev) => ({
      shots: prev.shots.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    }));

  useEffect(() => {
    const pending = project.shots.filter((s) => s.status === "rendering" && s.operationName);
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
  }, [project.shots]);

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

  const ready = project.shots.filter((s) => s.videoUrl).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="chip chip-active">{project.format}</span>
          <span className="chip">{project.shots.length} planos</span>
          <span className="chip">{ready} renderizados</span>
        </div>
        <p className="text-[10.5px] text-zinc-600">
          {costs.video} créditos por clip · cada render es un clip corto; el montaje es tuyo.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5 text-[11.5px] text-red-300">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {project.shots.length === 0 && (
        <div className="panel px-5 py-10 text-center text-[12px] text-zinc-500">
          Sin planos que renderizar.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {project.shots.map((shot) => {
          const rendering = shot.status === "rendering";
          return (
            <div key={shot.id} className="panel overflow-hidden">
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 text-[11px] text-zinc-300">
                    <Spinner size={18} />
                    Renderizando…
                    <span className="text-[10px] text-zinc-500">
                      puede tardar varios minutos
                    </span>
                  </div>
                )}
                <div className="absolute left-2 top-2 flex gap-1">
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">
                    {shot.number}
                  </span>
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-zinc-400">
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
                      disabled={rendering}
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
                {shot.error && (
                  <p className="mt-2 rounded bg-red-500/5 px-2 py-1 text-[10.5px] text-red-400/90">
                    {shot.error}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Section title="Cómo se arma el video final" subtitle="El render es por plano; el montaje es tuyo.">
        <ol className="grid grid-cols-1 gap-2 text-[11.5px] leading-relaxed text-zinc-400 sm:grid-cols-2">
          <li>1. Genera los keyframes en Storyboard para fijar la identidad visual.</li>
          <li>2. Renderiza cada plano con su prompt de video.</li>
          <li>3. Descarga los clips y únelos en el orden del storyboard.</li>
          <li>4. Monta la narración de Audio y normaliza a -14 LUFS.</li>
        </ol>
      </Section>
    </div>
  );
}
