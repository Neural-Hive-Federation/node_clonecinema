import React, { useState } from "react";
import {
  BookOpen,
  Clapperboard,
  Mic,
  Share2,
  Play,
  Users,
  ArrowLeft,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { Project, ProjectUpdater, StudioTab } from "../types";
import { formatTime, MODE_LABEL, totalDuration } from "../lib/project";
import { runContinuityAudit } from "../lib/continuityAudit";
import { ContinuityAuditModal } from "./ContinuityAuditModal";
import { ScriptTab } from "./tabs/ScriptTab";
import { StoryboardTab } from "./tabs/StoryboardTab";
import { CastTab } from "./tabs/CastTab";
import { AudioTab } from "./tabs/AudioTab";
import { RenderTab } from "./tabs/RenderTab";
import { PublishTab } from "./tabs/PublishTab";

const TABS: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  { id: "script", label: "Guion & ADN", icon: <FileText size={14} /> },
  { id: "cast", label: "Reparto & sets", icon: <Users size={14} /> },
  { id: "storyboard", label: "Storyboard", icon: <Clapperboard size={14} /> },
  { id: "audio", label: "Audio", icon: <Mic size={14} /> },
  { id: "render", label: "Render", icon: <Play size={14} /> },
  { id: "publish", label: "Publicar", icon: <Share2 size={14} /> },
];

export function StudioView({
  project,
  tab,
  onTab,
  patch,
  onBackToChat,
}: {
  project: Project;
  tab: StudioTab;
  onTab: (tab: StudioTab) => void;
  patch: ProjectUpdater;
  onBackToChat: () => void;
}) {
  const [openAudit, setOpenAudit] = useState(false);
  const [isPreflightForRender, setIsPreflightForRender] = useState(false);

  const issues = runContinuityAudit(project);
  const warningCount = issues.filter(
    (i) => i.severity === "warning" || i.severity === "error"
  ).length;

  const handleTabClick = (targetTab: StudioTab) => {
    // Si intenta ir a Render y hay alertas de coherencia sin resolver, interceptamos con la revisión del Director
    if (targetTab === "render" && warningCount > 0) {
      setIsPreflightForRender(true);
      setOpenAudit(true);
      return;
    }
    onTab(targetTab);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800/70 px-3.5 sm:px-6 pt-3 sm:pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              onClick={onBackToChat}
              className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300"
            >
              <ArrowLeft size={12} /> Volver al chat
            </button>
            <h1 className="truncate font-display text-lg sm:text-xl font-semibold text-white">
              {project.title || project.name || "Proyecto sin título"}
            </h1>
            <p className="mt-1 max-w-2xl truncate text-[11px] sm:text-[12px] text-zinc-500">
              {project.logline || project.brief || "Sin logline todavía."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="chip chip-active">{MODE_LABEL[project.mode]}</span>
            <span className="chip">{project.format}</span>
            <span className="chip">{formatTime(totalDuration(project))}</span>
            <span className="chip">{project.shots.length} planos</span>

            {/* Píldora interactiva de Auditoría de Coherencia con el Director */}
            <button
              type="button"
              onClick={() => {
                setIsPreflightForRender(false);
                setOpenAudit(true);
              }}
              className={`chip flex items-center gap-1.5 cursor-pointer transition ${
                warningCount > 0
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shadow-xs"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              }`}
              title="Haz clic para ver la revisión de continuidad con el Director"
            >
              {warningCount > 0 ? (
                <>
                  <ShieldAlert size={12} className="text-amber-400 animate-pulse" />
                  <span className="font-semibold">{warningCount} alertas</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={12} className="text-emerald-400" />
                  <span>Coherencia OK</span>
                </>
              )}
            </button>
          </div>
        </div>

        <nav className="-mb-px mt-3 sm:mt-4 flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabClick(t.id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition ${
                tab === t.id
                  ? "border-signal text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === "render" && warningCount > 0 && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="mx-auto max-w-6xl">
          {project.shots.length === 0 && tab !== "script" && (
            <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-[12px] text-amber-200/80">
              Este proyecto aún no tiene planos. Vuelve al chat y pide el plan para llenar el estudio.
            </div>
          )}
          {tab === "script" && <ScriptTab project={project} patch={patch} />}
          {tab === "cast" && <CastTab project={project} patch={patch} />}
          {tab === "storyboard" && <StoryboardTab project={project} patch={patch} />}
          {tab === "audio" && <AudioTab project={project} patch={patch} />}
          {tab === "render" && <RenderTab project={project} patch={patch} />}
          {tab === "publish" && <PublishTab project={project} patch={patch} />}
        </div>
      </div>

      {openAudit && (
        <ContinuityAuditModal
          project={project}
          patch={patch}
          isPreflightForRender={isPreflightForRender}
          onProceedToRender={() => onTab("render")}
          onClose={() => setOpenAudit(false)}
        />
      )}
    </div>
  );
}
