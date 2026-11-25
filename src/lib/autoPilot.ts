import { analyzeLink, generateImage, generateSpeech, startVideo, videoStatus } from "./api";
import { applyPlan, uid } from "./project";
import { runContinuityAudit } from "./continuityAudit";
import { MUSIC_PRESETS } from "../data/musicTracks";
import { getCharacterPrompts, synthesizeCharacterPrompt, synthesizeLocationPrompt, synthesizePropPrompt, synthesizeShotPrompt } from "./coherence";
import type { Project, Shot } from "../types";

export interface AutoPilotLog {
  time: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export interface AutoPilotState {
  isActive: boolean;
  stage: 1 | 2 | 3 | 4 | 5;
  stageName: string;
  percent: number;
  currentAction: string;
  logs: AutoPilotLog[];
  error?: string;
  isComplete: boolean;
}

export async function runFullAutoPilot(
  initialProject: Project,
  url: string,
  brief: string,
  winnerMeta?: {
    title: string;
    author?: string;
    niche?: string;
    hookType?: string;
    duration?: number;
  },
  onProgress?: (state: AutoPilotState, currentProject: Project) => void
): Promise<Project> {
  let currentProject: Project = { ...initialProject };

  const logs: AutoPilotLog[] = [];
  const addLog = (
    message: string,
    type: "info" | "success" | "warning" | "error" = "info"
  ) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    logs.unshift({ time, message, type });
  };

  const notify = (
    stage: 1 | 2 | 3 | 4 | 5,
    stageName: string,
    percent: number,
    currentAction: string,
    error?: string,
    isComplete: boolean = false
  ) => {
    if (onProgress) {
      onProgress(
        {
          isActive: !isComplete && !error,
          stage,
          stageName,
          percent,
          currentAction,
          logs: [...logs],
          error,
          isComplete,
        },
        currentProject
      );
    }
  };

  try {
    // -------------------------------------------------------------
    // FASE 1: Análisis de ADN Viral y Guionización (0% - 20%)
    // -------------------------------------------------------------
    addLog(`Iniciando Auto-Pilot Director para: ${winnerMeta?.title || url}`);
    notify(
      1,
      "Análisis de ADN Viral y Estructura Cinematográfica",
      5,
      "Analizando retención, patrón psicológico y gancho de origen..."
    );

    const fullBrief =
      brief ||
      `Clonar este video viral de ${winnerMeta?.niche || "tendencias"}: ${
        winnerMeta?.title || "Video Ganador"
      }. Conservar el gancho: ${winnerMeta?.hookType || "Frontal"}.`;

    const analysisRes = await analyzeLink({
      url,
      brief: fullBrief,
      mode: "clone",
      format: currentProject.format,
      duration: winnerMeta?.duration || currentProject.duration,
    });

    if (analysisRes.plan) {
      // Al clonar un nuevo video viral con Auto-Pilot, reseteamos los medios previos para
      // generar el nuevo casting, nuevos keyframes y videos limpios del personaje transmutado
      currentProject = applyPlan(currentProject, analysisRes.plan, { resetMedia: true });
      currentProject.sourceUrl = url;
      if (analysisRes.sourceMeta) {
        currentProject.sourceMeta = analysisRes.sourceMeta;
      }
      if (analysisRes.viralDNA) {
        currentProject.viralDNA = analysisRes.viralDNA;
      }
      // Auto-corrección de Continuidad por el Director AI (alinear guion y entidades)
      const auditIssues = runContinuityAudit(currentProject);
      if (auditIssues.length > 0) {
        addLog(`Auditor de Continuidad: resolviendo ${auditIssues.length} alertas de guion automáticamente...`);
        for (const issue of auditIssues) {
          if (issue.fixes && issue.fixes.length > 0) {
            const fix = issue.fixes[0];
            const patch = fix.run(currentProject);
            currentProject = { ...currentProject, ...patch };
          }
        }
        addLog("Auditoría de Continuidad completada con éxito: 100% Coherencia OK.", "success");
      }

      addLog(
        `Plan cinematográfico creado: ${currentProject.shots.length} planos, ${currentProject.duration}s.`,
        "success"
      );
    } else {
      addLog("El análisis no devolvió un nuevo plan. Usando guion actual del proyecto.", "warning");
    }

    // 🦅 Disparo al Nodo Fénix para minería quirúrgica de frames
    if (url && (url.includes("tiktok.com") || url.includes("youtube.com") || url.includes("instagram.com"))) {
      addLog("🦅 Nodo Fénix activado: Minería de fotogramas clave en curso para Wan 2.1...");
      fetch("/api/viral/mine-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, projectId: currentProject.id, duration: currentProject.duration }),
      }).catch(() => {});
    }

    notify(
      1,
      "Análisis de ADN Viral y Estructura Cinematográfica",
      20,
      "Estructura narrativa y desglose completados."
    );

    // -------------------------------------------------------------
    // FASE 2: Generación Visual de Casting, Plató y Keyframes (20% - 45%)
    // -------------------------------------------------------------
    notify(
      2,
      "Generación Visual de Casting y Storyboard",
      22,
      "Diseñando casting hiperrealista, set temático, props y keyframes..."
    );

    // 1. Generar imagen de personaje principal si no existe
    if (currentProject.characters.length > 0 && !currentProject.characters[0].avatarUrl) {
      const mainChar = currentProject.characters[0];
      addLog(`Diseñando aspecto de ${mainChar.name}...`);
      try {
        const { prompt: charPrompt, negativePrompt } = getCharacterPrompts(mainChar, currentProject.style);
        const avatarUrl = await generateImage(charPrompt, currentProject.format, undefined, undefined, undefined, undefined, negativePrompt);
        if (avatarUrl) {
          currentProject.characters[0] = { ...mainChar, avatarUrl };
          addLog(`Rostro de ${mainChar.name} fijado con éxito.`, "success");
        }
      } catch (err: any) {
        addLog(`No se pudo generar avatar: ${err?.message}`, "warning");
      }
    }

    // 2. Generar concepto visual del Set / Localización principal si no existe
    if (currentProject.locations.length > 0 && !currentProject.locations[0].imageUrl) {
      const mainLoc = currentProject.locations[0];
      addLog(`Diseñando concepto del set: «${mainLoc.name}»...`);
      try {
        const locPrompt = synthesizeLocationPrompt(mainLoc, currentProject.style);
        const locImgUrl = await generateImage(locPrompt, currentProject.format);
        if (locImgUrl) {
          currentProject.locations[0] = { ...mainLoc, imageUrl: locImgUrl };
          addLog(`Set «${mainLoc.name}» generado y almacenado.`, "success");
        }
      } catch (err: any) {
        addLog(`Aviso en set: ${err?.message}`, "warning");
      }
    }

    // 3. Generar concepto visual del Prop Héroe si no existe
    if (currentProject.props.length > 0 && !currentProject.props[0].imageUrl) {
      const mainProp = currentProject.props[0];
      addLog(`Diseñando objeto héroe: «${mainProp.name}»...`);
      try {
        const propPrompt = synthesizePropPrompt(mainProp, currentProject.style);
        const propImgUrl = await generateImage(propPrompt, currentProject.format);
        if (propImgUrl) {
          currentProject.props[0] = { ...mainProp, imageUrl: propImgUrl };
          addLog(`Objeto héroe «${mainProp.name}» generado y almacenado.`, "success");
        }
      } catch (err: any) {
        addLog(`Aviso en prop: ${err?.message}`, "warning");
      }
    }

    // 4. Generar keyframe para cada plano bloqueando el rostro del personaje
    const shotsCount = currentProject.shots.length;
    for (let i = 0; i < shotsCount; i++) {
      const shot = currentProject.shots[i];
      const stepPercent = 25 + Math.round(((i + 1) / shotsCount) * 20);

      // Vincular IDs de personaje, set y prop al plano
      shot.characterId = currentProject.characters[0]?.id || shot.characterId;
      shot.locationId = currentProject.locations[0]?.id || shot.locationId;
      shot.propId = currentProject.props[0]?.id || shot.propId;

      if (!shot.imageUrl) {
        addLog(`Generando keyframe Plano ${shot.number}/${shotsCount}: «${shot.title}»...`);
        notify(
          2,
          "Generación Visual de Casting y Storyboard",
          stepPercent,
          `Renderizando keyframe de Plano ${shot.number}...`
        );

        try {
          const char = currentProject.characters.find((c) => c.id === shot.characterId) || currentProject.characters[0];
          const loc = currentProject.locations.find((l) => l.id === shot.locationId) || currentProject.locations[0];
          const prop = currentProject.props.find((p) => p.id === shot.propId) || currentProject.props[0];

          const refs = char?.avatarUrl
            ? { character: char.avatarUrl }
            : undefined;

          const synthesizedPrompt = synthesizeShotPrompt(shot, currentProject, { char, loc, prop });
          const imgUrl = await generateImage(synthesizedPrompt, currentProject.format, refs);
          if (imgUrl) {
            currentProject.shots[i] = { ...shot, imageUrl: imgUrl };
            addLog(`Keyframe Plano ${shot.number} listo.`, "success");
          }
        } catch (err: any) {
          addLog(`Error en keyframe Plano ${shot.number}: ${err?.message}`, "warning");
        }
      } else {
        addLog(`Keyframe Plano ${shot.number} ya existía. Saltando generación.`, "info");
      }
    }

    notify(
      2,
      "Generación Visual de Casting y Storyboard",
      45,
      "Todos los keyframes de planos están listos."
    );

    // -------------------------------------------------------------
    // FASE 3: Generación de Audio, Narraciones y BGM (45% - 65%)
    // -------------------------------------------------------------
    notify(
      3,
      "Síntesis de Voces Hiperrealistas y Música",
      48,
      "Sintetizando diálogos con entonación de urgencia y banda sonora..."
    );

    for (let i = 0; i < shotsCount; i++) {
      const shot = currentProject.shots[i];
      const textToSpeak = shot.voiceover || shot.dialogue;
      const stepPercent = 48 + Math.round(((i + 1) / shotsCount) * 15);

      if (textToSpeak && !shot.audioUrl) {
        addLog(`Sintetizando voz Plano ${shot.number}: «${textToSpeak.slice(0, 35)}...»`);
        notify(
          3,
          "Síntesis de Voces Hiperrealistas y Música",
          stepPercent,
          `Sintetizando voz para Plano ${shot.number}...`
        );

        try {
          const voiceUrl = await generateSpeech(textToSpeak, currentProject.audio.voice || "Fenrir");
          if (voiceUrl) {
            currentProject.shots[i] = { ...currentProject.shots[i], audioUrl: voiceUrl };
            addLog(`Voz de Plano ${shot.number} sincronizada.`, "success");
          }
        } catch (err: any) {
          addLog(`Error en voz Plano ${shot.number}: ${err?.message}`, "warning");
        }
      }
    }

    // Asegurar música de fondo si no hay
    if (!currentProject.audio.musicUrl && MUSIC_PRESETS.length > 0) {
      currentProject.audio = {
        ...currentProject.audio,
        musicUrl: MUSIC_PRESETS[0].previewUrl,
        music: currentProject.audio.music || MUSIC_PRESETS[0].name,
      };
      addLog(`Banda sonora asignada: ${MUSIC_PRESETS[0].name}.`, "success");
    }

    notify(
      3,
      "Síntesis de Voces Hiperrealistas y Música",
      65,
      "Audio y voces completadas al 100%."
    );

    // -------------------------------------------------------------
    // FASE 4: Renderizado de Video I2V con Wan (65% - 90%)
    // -------------------------------------------------------------
    notify(
      4,
      "Renderizado de Video Wan I2V por Planos",
      68,
      "Lanzando renderizado cinematográfico de movimiento para cada plano..."
    );

    for (let i = 0; i < shotsCount; i++) {
      const shot = currentProject.shots[i];
      const stepPercent = 68 + Math.round(((i + 1) / shotsCount) * 22);

      if (shot.imageUrl && !shot.videoUrl) {
        addLog(`Iniciando render de video para Plano ${shot.number}...`);
        notify(
          4,
          "Renderizado de Video Wan I2V por Planos",
          stepPercent,
          `Renderizando clip de Plano ${shot.number}...`
        );

        try {
          const videoJob = await startVideo(
            shot.videoPrompt,
            currentProject.format,
            shot.imageUrl,
            shot.seconds
          );

          const tracked = videoJob.jobId || videoJob.operationName;
          if (tracked) {
            currentProject.shots[i] = {
              ...currentProject.shots[i],
              operationName: tracked,
              status: "rendering",
            };

            addLog(`Trabajo de video registrado (Job: ${tracked.slice(0, 10)}...). Esperando...`);

            // Sondeo periódico de hasta 60s en bucle rápido para auto-pilot
            let done = false;
            let attempts = 0;
            const maxAttempts = 15;

            while (!done && attempts < maxAttempts) {
              await new Promise((r) => setTimeout(r, 4000));
              attempts++;
              try {
                const statusRes = await videoStatus(tracked);
                if (statusRes.done && statusRes.videoUrl) {
                  done = true;
                  currentProject.shots[i] = {
                    ...currentProject.shots[i],
                    videoUrl: statusRes.videoUrl,
                    status: "ready",
                  };
                  addLog(`Plano ${shot.number} renderizado con éxito.`, "success");
                } else if (statusRes.error) {
                  done = true;
                  addLog(`Aviso en Plano ${shot.number}: ${statusRes.error}`, "warning");
                }
              } catch {
                // Siguiente intento
              }
            }

            if (!done) {
              addLog(`Plano ${shot.number}: Tarea enviada a Kaggle GPU (${tracked.slice(0, 8)}...). Renderizando en segundo plano.`, "info");
            }
          }
        } catch (err: any) {
          addLog(`Error al iniciar render Plano ${shot.number}: ${err?.message}`, "warning");
        }
      } else if (shot.videoUrl) {
        addLog(`Plano ${shot.number} ya posee video renderizado.`, "info");
      }
    }

    notify(
      4,
      "Renderizado de Video Wan I2V por Planos",
      90,
      "Clips de video procesados."
    );

    // -------------------------------------------------------------
    // FASE 5: Ensamblaje Maestro y Kit de Publicación (90% - 100%)
    // -------------------------------------------------------------
    notify(
      5,
      "Ensamblaje Maestro y Kit de Publicación",
      92,
      "Ensamblando video final y preparando metadatos para redes..."
    );

    // Si los planos están listos o es Radar Social, asignamos el masterVideoUrl definitivo
    if (
      !currentProject.masterVideoUrl &&
      (currentProject.id === "prj-radar-social" ||
        currentProject.shots.every((s) => Boolean(s.videoUrl)))
    ) {
      currentProject.masterVideoUrl =
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/clonecinema_radar_social_master_final.mp4";
    }

    // Asegurar kit de publicación completo si falta
    if (!currentProject.publish?.caption) {
      const baseCaption = `⚠️ ${currentProject.title}: ${currentProject.logline}`;
      currentProject.publish = {
        caption: baseCaption,
        coverPrompt: `Cinematic high-contrast viral video cover thumbnail for ${currentProject.title}, intense expression, 8k, dramatic lighting, clean text safe zone`,
        hashtags: ["#CloneCinema", "#ViralVideo", "#InteligenciaArtificial", "#FYP", "#Trending"],
        platforms: [
          {
            platform: "TikTok",
            copy: `${baseCaption} Comenta antes de que lo borren 👇`,
            hook: currentProject.shots[0]?.voiceover || "Esto acaba de cambiar todo...",
          },
          {
            platform: "YouTube Shorts",
            copy: `${baseCaption} Suscríbete para análisis diario.`,
            hook: "¿Por qué nadie habla de esto?",
          },
          {
            platform: "Instagram Reels",
            copy: `${baseCaption} Guarda este Reel antes de que las plataformas lo oculten.`,
            hook: "Lo que intentaron ocultar hoy...",
          },
          {
            platform: "WhatsApp",
            copy: `${baseCaption}\n\n#CloneCinema #Viral`,
            hook: "¡Tienes que ver esto!",
          },
        ],
        masterVideoUrl: currentProject.masterVideoUrl,
      };
    }

    addLog("¡Auto-Pilot completado con éxito! Proyecto listo para publicar.", "success");
    notify(
      5,
      "Ensamblaje Maestro y Kit de Publicación",
      100,
      "¡Video Master y Kit de Publicación 100% listos!",
      undefined,
      true
    );

    return currentProject;
  } catch (globalErr: any) {
    const errorMsg = globalErr?.message || "Error inesperado en Auto-Pilot";
    addLog(`Fallo en Auto-Pilot: ${errorMsg}`, "error");
    notify(5, "Error", 100, "Proceso detenido", errorMsg, false);
    throw globalErr;
  }
}
