import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { FLUX_IMAGE_TEMPLATE } from "../lib/templates/fluxImage";
import { pushKaggleScript } from "../lib/kaggleClient";

export const config = {
  maxDuration: 60,
};

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error("Supabase credentials no configuradas en el entorno.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function urlToBase64(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) {
    const parts = url.split(",");
    return parts[1] || null;
  }
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.toString("base64");
  } catch (e) {
    console.warn("[urlToBase64 Warning]:", e);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt, aspectRatio, references, strength } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Falta el prompt de la imagen." });
    }

    const supabase = getSupabaseAdmin();
    const jobId = randomUUID();

    // Enriquecer prompt para render cinematográfico de máxima fidelidad
    let enrichedPrompt = prompt.trim();
    if (!enrichedPrompt.toLowerCase().includes("photorealistic")) {
      enrichedPrompt = `${enrichedPrompt}, photorealistic 35mm film still, cinematic lighting, 8k uhd, masterpiece`;
    }

    // 1. Preparar referencias en Base64 si existen (Actor, Set, Prop)
    const [charB64, locB64, propB64] = await Promise.all([
      urlToBase64(references?.character),
      urlToBase64(references?.location),
      urlToBase64(references?.prop),
    ]);

    const payload = {
      job_id: jobId,
      prompt: enrichedPrompt,
      aspect_ratio: aspectRatio || "16:9",
      character_image_b64: charB64,
      location_image_b64: locB64,
      prop_image_b64: propB64,
      strength: typeof strength === "number" ? strength : 0.65,
      seed: Math.floor(Math.random() * 100000),
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
    const scriptWithPayload = FLUX_IMAGE_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

    // 2. Publicar y lanzar el cuaderno en Kaggle GPU T4 x2
    console.log(`[Kaggle Submit] Enviando tarea ${jobId} a wilycol/clonecinema-flux-image...`);
    const { versionNumber } = await pushKaggleScript({
      slug: "wilycol/clonecinema-flux-image",
      title: "CloneCinema Flux image",
      text: scriptWithPayload,
      enableGpu: true,
    });
    console.log(`[Kaggle Submit] Versión ${versionNumber} en ejecución en GPU.`);

    // 3. Registrar el trabajo en Supabase ai_jobs para seguimiento asíncrono
    const { error: insertErr } = await supabase.from("ai_jobs").insert({
      id: jobId,
      kind: "image",
      status: "running",
      provider: "kaggle",
      kernel_ref: "wilycol/clonecinema-flux-image",
      prompt: enrichedPrompt,
    });

    if (insertErr) {
      console.warn("[ai_jobs insert warning]:", insertErr.message);
    }

    // 4. Devolver respuesta inmediata con jobId para que el frontend sondee
    return res.status(200).json({
      success: true,
      jobId,
      provider: "kaggle",
      kernelVersion: versionNumber,
    });
  } catch (err: any) {
    console.error("[generate/image Kaggle Error]:", err);
    return res.status(502).json({
      success: false,
      error: err?.message || "Error al enviar la tarea al cuaderno de Kaggle.",
    });
  }
}
