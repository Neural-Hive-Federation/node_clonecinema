import React, { useEffect, useMemo, useState } from "react";
import { Clapperboard, Film, FolderOpen, MessageSquare, Mic, X } from "lucide-react";
import type { Project, Mode, ProjectUpdater, StudioTab, TrendingWinner } from "./types";
import { PRESET_PROJECTS, RADAR_SOCIAL_PRESET } from "./data/presets";
import { createEmptyProject, uid } from "./lib/project";
import { LeftRail } from "./components/LeftRail";
import { ChatView } from "./components/ChatView";
import { StudioView } from "./components/StudioView";
import { AutoPilotModal } from "./components/AutoPilotModal";
import { runFullAutoPilot, type AutoPilotState } from "./lib/autoPilot";

const STORAGE_KEY = "clonecinema_projects_v1";
const ACTIVE_KEY = "clonecinema_active_v1";

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          // Auto-sanar si el proyecto en localStorage tiene URLs rotas o le faltan los audios/video
          const healed = parsed.map((p: Project) => {
            if (p.id === "prj-radar-social") {
              const hasBrokenUrls = JSON.stringify(p).includes("lkctxyoyajqrhaavnzrv");
              const hasOldDummyVideo = JSON.stringify(p).includes("7999bc0d-0b12-475e-8ef5-7aaf35022739");
              const missingAudio = !p.shots.some((s) => Boolean(s.audioUrl));
              const missingVideos = p.shots.some((s) => !s.videoUrl);
              const missingPublish = !p.publish?.caption;
              const missingMaster = !p.masterVideoUrl;
              const hasContinuityGap = p.duration !== 21 || !p.shots[0]?.action?.includes("Avatar Sintético");
              if (hasBrokenUrls || hasOldDummyVideo || missingAudio || missingVideos || missingPublish || missingMaster || hasContinuityGap) {
                return RADAR_SOCIAL_PRESET;
              }
            }
            return p;
          });
          if (!healed.some((p: Project) => p.id === "prj-radar-social")) {
            return [RADAR_SOCIAL_PRESET, ...healed];
          }
          return healed;
        }
      }
    } catch {
      /* storage corrupt: fall through to presets */
    }
    return PRESET_PROJECTS;
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY);
    return saved || "prj-radar-social";
  });

  const [view, setView] = useState<"chat" | "studio">("chat");
  const [tab, setTab] = useState<StudioTab>("script");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [autoPilotState, setAutoPilotState] = useState<AutoPilotState | null>(null);
  const [showAutoPilotModal, setShowAutoPilotModal] = useState(false);

  const handleStartAutoPilot = (url: string, brief: string, winner?: TrendingWinner) => {
    setShowAutoPilotModal(true);
    setAutoPilotState({
      isActive: true,
      stage: 1,
      stageName: "Iniciando Auto-Pilot Director",
      percent: 5,
      currentAction: "Conectando con el motor viral...",
      logs: [
        {
          time: new Date().toLocaleTimeString(),
          message: `Iniciando clonación autónoma para: ${winner?.title || url}`,
          type: "info",
        },
      ],
      isComplete: false,
    });

    void runFullAutoPilot(
      active,
      url,
      brief,
      winner
        ? {
            title: winner.title,
            author: winner.author,
            niche: winner.niche,
            hookType: winner.hookType,
            duration: winner.duration,
          }
        : undefined,
      (progress, currentProj) => {
        setAutoPilotState(progress);
        updateProject(currentProj);
        if (progress.isComplete) {
          setView("studio");
          setTab("publish");
        }
      }
    )
      .then((finalProject) => {
        updateProject(finalProject);
        setView("studio");
        setTab("publish");
      })
      .catch((err) => {
        console.error("AutoPilot Error:", err);
      });
  };

  const active = useMemo(() => {
    return projects.find((p) => p.id === activeId) || projects[0];
  }, [projects, activeId]);

  useEffect(() => {
    if (active && active.id !== activeId) setActiveId(active.id);
  }, [active, activeId]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHasApiKey(!!d.hasApiKey))
      .catch(() => setHasApiKey(false));

    // Sincronizar proyectos desde la nube (Supabase) al arrancar
    fetch("/api/projects/sync")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.projects) && data.projects.length) {
          setProjects((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            for (const remote of data.projects) {
              const local = map.get(remote.id);
              if (!local) {
                map.set(remote.id, remote);
              } else {
                const localVideos = local.shots?.filter((s: any) => !!s.videoUrl).length || 0;
                const remoteVideos = remote.shots?.filter((s: any) => !!s.videoUrl).length || 0;
                if (remoteVideos >= localVideos) {
                  map.set(remote.id, {
                    ...local,
                    ...remote,
                    masterVideoUrl:
                      remote.masterVideoUrl ||
                      remote.publish?.masterVideoUrl ||
                      local.masterVideoUrl ||
                      (local.id === "prj-radar-social"
                        ? "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/clonecinema_radar_social_master_final.mp4"
                        : undefined),
                  });
                }
              }
            }
            return Array.from(map.values());
          });
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      setStorageFull(true);
    }

    if (active) {
      const timer = setTimeout(() => {
        fetch("/api/projects/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: active }),
        }).catch(() => { });
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [projects, activeId, active]);

  function updateProject(next: Project) {
    setProjects((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  const patchProject: ProjectUpdater = (update) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === active?.id
          ? {
            ...p,
            ...(typeof update === "function" ? update(p) : update),
            updatedAt: new Date().toISOString(),
          }
          : p
      )
    );
  };

  function selectProject(id: string) {
    setActiveId(id);
    setView("chat");
    setRailOpen(false);
  }

  function newProject(mode: Mode = active?.mode || "clone") {
    const project = createEmptyProject(mode);
    project.name = "Proyecto sin título";
    project.chat = [];
    setProjects((prev) => [project, ...prev]);
    setActiveId(project.id);
    setView("chat");
    setTab("script");
    setRailOpen(false);
  }

  function deleteProject(id: string) {
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) {
        const fresh = createEmptyProject("clone");
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  const rail = (
    <LeftRail
      projects={projects}
      activeId={active?.id || ""}
      onSelect={selectProject}
      onNew={() => newProject()}
      onDelete={deleteProject}
      hasApiKey={hasApiKey}
    />
  );

  if (!active) {
    return <div className="p-10 text-zinc-400">Cargando estudio…</div>;
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-ink-950 md:flex-row">
      <div className="hidden md:flex">{rail}</div>

      {railOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="relative z-50 h-full">{rail}</div>
          <button
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setRailOpen(false)}
            aria-label="Cerrar proyectos"
          />
          <button
            className="absolute right-4 top-4 z-50 rounded-lg bg-zinc-900 p-2 text-zinc-400"
            onClick={() => setRailOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5 md:hidden">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-zinc-200"
            onClick={() => setRailOpen(true)}
          >
            <Clapperboard size={16} className="text-signal" />
            <span className="truncate max-w-[170px]">{active.name || "CloneCinema"}</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="rounded bg-zinc-800/90 px-2 py-0.5 text-[10px] font-mono text-signal">
              {active.format} · {active.duration}s
            </span>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] text-zinc-300"
              onClick={() => setRailOpen(true)}
            >
              <FolderOpen size={12} /> {projects.length}
            </button>
          </div>
        </div>

        {storageFull && (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-center text-[10.5px] text-amber-300/80">
            Almacenamiento local lleno. Exporta el proyecto desde «Publicar» para liberar espacio.
          </div>
        )}

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
          {view === "chat" ? (
            <ChatView
              key={active.id}
              project={active}
              mode={active.mode}
              onModeChange={(mode) => updateProject({ ...active, mode })}
              onChange={updateProject}
              onOpenStudio={() => {
                setTab("storyboard");
                setView("studio");
              }}
              onStartAutoPilot={handleStartAutoPilot}
            />
          ) : (
            <StudioView
              project={active}
              tab={tab}
              onTab={setTab}
              patch={patchProject}
              onBackToChat={() => setView("chat")}
            />
          )}
        </div>

        {/* Modal de Piloto Automático */}
        {showAutoPilotModal && autoPilotState && (
          <AutoPilotModal
            state={autoPilotState}
            onClose={() => setShowAutoPilotModal(false)}
            onGoToStudio={() => {
              setShowAutoPilotModal(false);
              setView("studio");
              setTab("publish");
            }}
            projectTitle={active.title || active.name}
          />
        )}

        {/* Floating pill si está minimizado */}
        {autoPilotState?.isActive && !showAutoPilotModal && (
          <button
            onClick={() => setShowAutoPilotModal(true)}
            className="fixed bottom-20 md:bottom-6 right-4 z-40 flex items-center gap-2.5 rounded-2xl border border-signal/40 bg-zinc-950/95 backdrop-blur-md px-4 py-2.5 text-xs font-bold text-signal shadow-2xl shadow-signal/20 hover:scale-105 transition cursor-pointer"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-signal"></span>
            </span>
            <span>⚡ Auto-Pilot: {autoPilotState.percent}%</span>
            <span className="text-[10.5px] text-zinc-400 font-mono">({autoPilotState.stageName.split(" ")[0]})</span>
          </button>
        )}

        {/* Mobile Bottom Navigation Bar */}
        <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/90 px-2 py-1.5 justify-around items-center text-xs shadow-2xl">
          <button
            onClick={() => setView("chat")}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${view === "chat"
              ? "text-signal font-bold"
              : "text-zinc-400 hover:text-zinc-200"
              }`}
          >
            <MessageSquare size={18} />
            <span className="text-[10px]">Chat & Radar</span>
          </button>

          <button
            onClick={() => {
              setView("studio");
              if (!tab || tab === "script") setTab("storyboard");
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition relative ${view === "studio" && tab === "storyboard"
              ? "text-signal font-bold"
              : "text-zinc-400 hover:text-zinc-200"
              }`}
          >
            <Film size={18} />
            <span className="text-[10px]">Storyboard</span>
            {active.shots.length > 0 && (
              <span className="absolute top-1 right-2.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-signal"></span>
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setView("studio");
              setTab("audio");
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${view === "studio" && tab === "audio"
              ? "text-signal font-bold"
              : "text-zinc-400 hover:text-zinc-200"
              }`}
          >
            <Mic size={18} />
            <span className="text-[10px]">Audio & Voz</span>
          </button>

          <button
            onClick={() => {
              setView("studio");
              setTab("render");
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${view === "studio" && tab === "render"
              ? "text-signal font-bold"
              : "text-zinc-400 hover:text-zinc-200"
              }`}
          >
            <Clapperboard size={18} />
            <span className="text-[10px]">Render</span>
          </button>

          <button
            onClick={() => setRailOpen(true)}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-zinc-400 hover:text-zinc-200 transition"
          >
            <FolderOpen size={18} />
            <span className="text-[10px]">Proyectos</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
