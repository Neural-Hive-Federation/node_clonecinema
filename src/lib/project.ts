import type { PlanPayload, Project } from "../types";

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

export function totalDuration(project: Project): number {
  return project.shots.reduce((sum, s) => sum + (Number(s.seconds) || 0), 0);
}

export function createEmptyProject(mode: Project["mode"] = "clone"): Project {
  const now = new Date().toISOString();
  return {
    id: uid("prj"),
    name: "Proyecto sin título",
    mode,
    format: "9:16",
    duration: mode === "saga" ? 60 : mode === "ad" ? 30 : 15,
    style: "Cinematográfico, contraste alto, grano fino",
    language: "es",
    title: "",
    logline: "",
    brief: "",
    references: [],
    shots: [],
    characters: [],
    locations: [],
    props: [],
    audio: {
      narration: "",
      voice: "Zephyr",
      music: "",
      bpm: "",
      sfxPalette: [],
    },
    chat: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies an AI plan onto a project. Media that already existed (images, videos,
 * renders) survives when the shot keeps the same number, unless resetMedia is true.
 */
export function applyPlan(
  base: Project,
  plan: PlanPayload,
  options?: { resetMedia?: boolean }
): Project {
  const previousShots = options?.resetMedia
    ? new Map()
    : new Map(base.shots.map((s) => [s.number, s]));

  const shots = (plan.shots || []).map((shot, index) => {
    const number = Number(shot.number) || index + 1;
    const previous = previousShots.get(number);
    return {
      ...shot,
      number,
      id: previous?.id || uid("shot"),
      imageUrl: previous?.imageUrl,
      videoUrl: previous?.videoUrl,
      operationName: previous?.operationName,
      status: previous?.status || "idle",
    };
  });

  return {
    ...base,
    title: plan.title || base.title,
    name: plan.title || base.name,
    logline: plan.logline || base.logline,
    mode: plan.mode || base.mode,
    format: plan.format || base.format,
    duration: plan.duration || base.duration,
    style: plan.style || base.style,
    viralDNA: plan.viralDNA || base.viralDNA,
    references: (plan.references || []).map((r) => ({ ...r, id: uid("ref") })),
    shots,
    characters: (plan.characters || []).map((c) => ({ ...c, id: uid("chr") })),
    locations: (plan.locations || []).map((l) => ({ ...l, id: uid("loc") })),
    props: (plan.props || []).map((p) => ({ ...p, id: uid("prp") })),
    audio: { ...base.audio, ...(plan.audio || {}) },
    publish: plan.publish || base.publish,
    updatedAt: new Date().toISOString(),
  };
}

export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export const MODE_LABEL: Record<Project["mode"], string> = {
  clone: "Clon viral",
  ad: "Anuncio",
  saga: "Saga",
};

export const VOICES = ["Zephyr", "Kore", "Puck", "Charon", "Fenrir"] as const;
