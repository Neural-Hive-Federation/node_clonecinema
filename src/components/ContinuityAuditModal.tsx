import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Clock,
  Info,
  MapPin,
  Package,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wand2,
  X,
  ArrowRight,
} from "lucide-react";
import type { Project, ProjectUpdater } from "../types";
import { runContinuityAudit, type AuditIssue } from "../lib/continuityAudit";

export function ContinuityAuditModal({
  project,
  patch,
  onClose,
  onProceedToRender,
  isPreflightForRender = false,
}: {
  project: Project;
  patch: ProjectUpdater;
  onClose: () => void;
  onProceedToRender?: () => void;
  isPreflightForRender?: boolean;
}) {
  const issues = runContinuityAudit(project);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");

  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "warnings" | "suggestions">("all");
  const [targetShotByIssue, setTargetShotByIssue] = useState<Record<string, number>>({});

  const filteredIssues = issues.filter((i) => {
    if (filter === "warnings") return i.severity === "warning" || i.severity === "error";
    if (filter === "suggestions") return i.severity === "info";
    return true;
  });

  const handleApplyFix = (issueId: string, fixIndex: number) => {
    const issue = issues.find((i) => i.id === issueId);
    if (!issue || !issue.fixes || !issue.fixes[fixIndex]) return;

    patch(issue.fixes[fixIndex].run(project));
    setAppliedFixes((prev) => [...prev, `${issueId}_${fixIndex}`]);
  };

  const handleAssignToSpecificShot = (issue: AuditIssue, shotNumber: number) => {
    if (issue.category === "character") {
      const charId = issue.id.replace("orphan_chr_", "");
      const charObj = project.characters.find((c) => c.id === charId);
      if (!charObj) return;

      patch((prev) => ({
        shots: prev.shots.map((s) =>
          s.number === shotNumber
            ? {
                ...s,
                characterId: charObj.id,
                action: `${s.action ? s.action + ". " : ""}En cuadro: ${charObj.name}.`,
                imagePrompt: `${s.imagePrompt}, featuring ${charObj.name}`,
              }
            : s
        ),
      }));
      setAppliedFixes((prev) => [...prev, `${issue.id}_custom`]);
    } else if (issue.category === "location") {
      const locId = issue.id.replace("orphan_loc_", "");
      const locObj = project.locations.find((l) => l.id === locId);
      if (!locObj) return;

      patch((prev) => ({
        shots: prev.shots.map((s) =>
          s.number === shotNumber
            ? {
                ...s,
                locationId: locObj.id,
                camera: `${s.camera ? s.camera + ". " : ""}En ${locObj.name}.`,
                imagePrompt: `${s.imagePrompt}, environment: ${locObj.name}`,
              }
            : s
        ),
      }));
      setAppliedFixes((prev) => [...prev, `${issue.id}_custom`]);
    } else if (issue.category === "prop") {
      const propId = issue.id.replace("orphan_prop_", "");
      const propObj = project.props.find((p) => p.id === propId);
      if (!propObj) return;

      patch((prev) => ({
        shots: prev.shots.map((s) =>
          s.number === shotNumber
            ? {
                ...s,
                propId: propObj.id,
                action: `${s.action ? s.action + ". " : ""}Usa ${propObj.name}.`,
                imagePrompt: `${s.imagePrompt}, holding ${propObj.name}`,
              }
            : s
        ),
      }));
      setAppliedFixes((prev) => [...prev, `${issue.id}_custom`]);
    }
  };

  const getCategoryIcon = (category: AuditIssue["category"]) => {
    switch (category) {
      case "character":
        return <UserRound size={14} className="text-amber-400" />;
      case "location":
        return <MapPin size={14} className="text-cyan-400" />;
      case "prop":
        return <Package size={14} className="text-pink-400" />;
      case "timing":
        return <Clock size={14} className="text-yellow-400" />;
      case "storyboard":
        return <Clapperboard size={14} className="text-emerald-400" />;
    }
  };

  const isClean = warnings.length === 0 && errors.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-md transition-all animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border ${
                isClean
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              {isClean ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] sm:text-[15px] font-bold text-white truncate">
                  Auditoría de Continuidad
                </h3>
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-300 shrink-0">
                  Director AI
                </span>
              </div>
              <p className="mt-0.5 text-[11px] sm:text-[11.5px] text-zinc-400 line-clamp-1">
                {isClean
                  ? "El Director ha verificado todos los planos, actores y sets: todo está alineado."
                  : `Revisión en conjunto: ${warnings.length} advertencia${
                      warnings.length === 1 ? "" : "s"
                    } de continuidad detectada${warnings.length === 1 ? "" : "s"}.`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-4 sm:px-6 py-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                filter === "all"
                  ? "bg-zinc-800 text-white shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Todas ({issues.length})
            </button>
            <button
              onClick={() => setFilter("warnings")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                filter === "warnings"
                  ? "bg-zinc-800 text-amber-300 shadow-xs"
                  : "text-zinc-400 hover:text-amber-300"
              }`}
            >
              Advertencias ({warnings.length + errors.length})
            </button>
            <button
              onClick={() => setFilter("suggestions")}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                filter === "suggestions"
                  ? "bg-zinc-800 text-zinc-200 shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sugerencias ({infos.length})
            </button>
          </div>

          <span className="text-[10.5px] text-zinc-500">
            {project.shots.length} planos · {project.characters.length} personajes ·{" "}
            {project.locations.length} sets · {project.props.length} props
          </span>
        </div>

        {/* Issue list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 size={36} className="text-emerald-400 mb-2" />
              <h4 className="text-[13.5px] font-semibold text-zinc-200">
                ¡Todo en perfecta coherencia!
              </h4>
              <p className="mt-1 max-w-sm text-[11.5px] text-zinc-500">
                No hay elementos huérfanos ni discrepancias entre los planos del Storyboard y las
                referencias de Reparto & Sets.
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              return (
                <div
                  key={issue.id}
                  className={`rounded-xl border p-3.5 transition space-y-2.5 ${
                    issue.severity === "error"
                      ? "border-red-500/30 bg-red-500/5"
                      : issue.severity === "warning"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{getCategoryIcon(issue.category)}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[12.5px] font-bold text-zinc-200">{issue.title}</h4>
                          {issue.shotNumber && (
                            <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-400">
                              Plano {issue.shotNumber}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                          {issue.description}
                        </p>
                        {issue.detail && (
                          <p className="mt-1 text-[10.5px] text-zinc-500 italic">
                            💡 {issue.detail}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Shot Assignment for Orphans & 1-Click Fixes */}
                  {issue.id.startsWith("orphan_") ? (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/60">
                      <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
                        <span className="text-[10px] font-medium text-zinc-400">Vincular al:</span>
                        <select
                          value={targetShotByIssue[issue.id] ?? 1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setTargetShotByIssue((prev) => ({ ...prev, [issue.id]: val }));
                          }}
                          className="bg-black border border-zinc-700/80 text-[10.5px] text-zinc-200 rounded px-1.5 py-0.5 focus:border-signal cursor-pointer"
                        >
                          {(project.shots || []).map((s) => (
                            <option key={s.id} value={s.number}>
                              Plano {s.number} · {s.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {appliedFixes.includes(`${issue.id}_custom`) ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 size={11} /> Vinculado al Plano {targetShotByIssue[issue.id] ?? 1}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAssignToSpecificShot(issue, targetShotByIssue[issue.id] ?? 1)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold bg-signal/20 text-signal border border-signal/40 hover:bg-signal hover:text-black transition cursor-pointer shadow-sm"
                        >
                          <Wand2 size={11} /> Asignar al Plano {targetShotByIssue[issue.id] ?? 1}
                        </button>
                      )}

                      {issue.fixes
                        ?.filter((f) => f.label.startsWith("Quitar"))
                        .map((fix, idx) => {
                          const isApplied = appliedFixes.includes(`${issue.id}_del_${idx}`);
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={isApplied}
                              onClick={() => {
                                patch(fix.run(project));
                                setAppliedFixes((prev) => [...prev, `${issue.id}_del_${idx}`]);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-zinc-400 hover:text-red-400 border border-zinc-800 hover:border-red-500/30 transition cursor-pointer ml-auto"
                            >
                              {fix.label}
                            </button>
                          );
                        })}
                    </div>
                  ) : issue.fixes && issue.fixes.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800/60">
                      <span className="text-[10px] font-medium text-zinc-500">Acción sugerida:</span>
                      {issue.fixes.map((fix, idx) => {
                        const isApplied = appliedFixes.includes(`${issue.id}_${fixIndexKey(idx)}`);
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={isApplied}
                            onClick={() => handleApplyFix(issue.id, idx)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold transition ${
                              isApplied
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-zinc-800 text-signal border border-zinc-700/80 hover:bg-zinc-700 hover:border-signal/50"
                            }`}
                          >
                            {isApplied ? (
                              <>
                                <CheckCircle2 size={11} /> Aplicado
                              </>
                            ) : (
                              <>
                                <Wand2 size={11} /> {fix.label}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900/60 px-6 py-3.5">
          <span className="text-[11px] text-zinc-500">
            {isClean
              ? "El proyecto está listo para pasar al rodaje."
              : "Puedes resolver las alertas o continuar según tu visión creativa."}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost text-[11.5px]"
            >
              {isPreflightForRender ? "Volver a Editar" : "Cerrar"}
            </button>

            {isPreflightForRender && onProceedToRender && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onProceedToRender();
                }}
                className={`btn ${
                  isClean ? "btn-primary" : "btn-primary bg-amber-500 text-black hover:bg-amber-400"
                } text-[11.5px] flex items-center gap-1.5`}
              >
                Continuar a Render <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function fixIndexKey(idx: number): string {
  return String(idx);
}
