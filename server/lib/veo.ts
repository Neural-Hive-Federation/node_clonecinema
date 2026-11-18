import type { Response } from "express";
import { config } from "./config";
import { getGenAI } from "./gemini";

/** Inicia un render de Veo y devuelve el nombre de la operación. */
export async function startVeo(prompt: string, aspectRatio: string): Promise<string> {
  const ai = getGenAI();
  if (!ai) throw new Error("Falta GEMINI_API_KEY para renderizar video.");

  const operation = await ai.models.generateVideos({
    model: "veo-3.1-lite-generate-preview",
    prompt: `${prompt}. Cinematic short-form video, natural motion, filmic grain, no on-screen text.`,
    config: {
      numberOfVideos: 1,
      resolution: "720p" as any,
      aspectRatio: aspectRatio as any,
    },
  });
  if (!operation.name) throw new Error("Veo no devolvió una operación válida.");
  return operation.name;
}

export async function veoStatus(operationName: string): Promise<{
  done: boolean;
  error?: string;
  videoUrl?: string;
}> {
  const ai = getGenAI();
  if (!ai) throw new Error("Falta GEMINI_API_KEY.");

  const updated: any = await ai.operations.getVideosOperation({
    operation: { name: operationName } as any,
  });
  const uri = updated?.response?.generatedVideos?.[0]?.video?.uri;

  return {
    done: Boolean(updated.done),
    error: updated?.error?.message,
    videoUrl: updated.done && uri ? `/api/ai/video-file?op=${encodeURIComponent(operationName)}` : undefined,
  };
}

/** Hace streaming del MP4 de Veo sin exponer la API key al navegador. */
export async function streamVeo(operationName: string, res: Response): Promise<void> {
  const ai = getGenAI();
  const apiKey = config.gemini.apiKey;
  if (!ai || !apiKey) {
    res.status(400).json({ error: "Render no disponible" });
    return;
  }

  const updated: any = await ai.operations.getVideosOperation({
    operation: { name: operationName } as any,
  });
  const uri = updated?.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) {
    res.status(404).json({ error: "Video no listo" });
    return;
  }

  const videoRes = await fetch(uri, { headers: { "x-goog-api-key": apiKey } });
  res.setHeader("Content-Type", "video/mp4");
  if (!videoRes.body) {
    res.status(500).json({ error: "Respuesta vacía" });
    return;
  }

  const reader = videoRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}
