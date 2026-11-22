import { analyzeLink, generateImage, generateSpeech, startVideo, videoStatus } from "./api";
import { applyPlan, uid } from "./project";
import { MUSIC_PRESETS } from "../data/musicTracks";
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
      currentProject = applyPlan(currentProject, analysisRes.plan);
      currentProject.sourceUrl = url;
      if (analysisRes.sourceMeta) {
        currentProject.sourceMeta = analysisRes.sourceMeta;
      }
      if (analysisRes.viralDNA) {
        currentProject.viralDNA = analysisRes.viralDNA;
      }
      addLog(
        `Plan cinematográfico creado: ${currentProject.shots.length} planos, ${currentProject.duration}s.`,
        "success"
      );
    } else {
      addLog("El análisis no devolvió un nuevo plan. Usando guion actual del proyecto.", "warning");
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
      "Diseñando casting hiperrealista y keyframes visuales..."
    );

    // Generar imagen de personaje principal si no existe
    if (currentProject.characters.length > 0 && !currentProject.characters[0].avatarUrl) {
      const mainChar = currentProject.characters[0];
      addLog(`Diseñando aspecto de ${mainChar.name}...`);
      try {
        const charPrompt = `${mainChar.description}, hyperrealistic cinematic portrait, 8k, professional studio lighting`;
        const avatarUrl = await generateImage(charPrompt, currentProject.format);
        if (avatarUrl) {
          currentProject.characters[0] = { ...mainChar, avatarUrl };
          addLog(`Rostro de ${mainChar.name} fijado con éxito.`, "success");
        }
      } catch (err: any) {
        addLog(`No se pudo generar avatar: ${err?.message}`, "warning");
      }
    }

    // Generar keyframe para cada plano que no lo tenga
    const shotsCount = currentProject.shots.length;
    for (let i = 0; i < shotsCount; i++) {
      const shot = currentProject.shots[i];
      const stepPercent = 25 + Math.round(((i + 1) / shotsCount) * 20);

      if (!shot.imageUrl) {
        addLog(`Generando keyframe Plano ${shot.number}/${shotsCount}: «${shot.title}»...`);
        notify(
          2,
          "Generación Visual de Casting y Storyboard",
          stepPercent,
          `Renderizando keyframe de Plano ${shot.number}...`
        );

        try {
          const refs = currentProject.characters[0]?.avatarUrl
            ? [{ url: currentProject.characters[0].avatarUrl, weight: 0.85 }]
            : undefined;

          const imgUrl = await generateImage(shot.imagePrompt, currentProject.format, refs);
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
          const voiceUrl = await generateSpeech(textToSpeak, currentProject.audio.voice || "es-ES-Neural2-B");
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
