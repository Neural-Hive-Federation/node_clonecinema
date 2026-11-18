import React, { useEffect, useMemo, useState } from "react";
import { Clapperboard, FolderOpen, X } from "lucide-react";
import type { Project, Mode, ProjectUpdater, StudioTab } from "./types";
import { PRESET_PROJECTS } from "./data/presets";
import { createEmptyProject, uid } from "./lib/project";
import { LeftRail } from "./components/LeftRail";
import { ChatView } from "./components/ChatView";
import { StudioView } from "./components/StudioView";

const STORAGE_KEY = "clonecinema_projects_v1";
const ACTIVE_KEY = "clonecinema_active_v1";

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* storage corrupt: fall through to presets */
    }
    return PRESET_PROJECTS;
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY);
    return saved || "";
  });

  const [view, setView] = useState<"chat" | "studio">("chat");
  const [tab, setTab] = useState<StudioTab>("script");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [storageFull, setStorageFull] = useState(false);

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
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      setStorageFull(true);
    }
  }, [projects, activeId]);

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
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950 md:flex-row">
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

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5 md:hidden">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-zinc-200"
            onClick={() => setRailOpen(true)}
          >
            <Clapperboard size={16} className="text-signal" />
            CloneCinema
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-400"
            onClick={() => setRailOpen(true)}
          >
            <FolderOpen size={12} /> {projects.length}
          </button>
        </div>

        {storageFull && (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-1.5 text-center text-[10.5px] text-amber-300/80">
            Almacenamiento local lleno. Exporta el proyecto desde «Publicar» para liberar espacio.
          </div>
        )}

        <div className="min-h-0 flex-1">
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
      </main>
    </div>
  );
}
