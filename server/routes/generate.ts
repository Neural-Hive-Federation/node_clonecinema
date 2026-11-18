import { Router } from "express";
import { config, missingFor } from "../lib/config";
import { generateGeminiImage } from "../lib/gemini";
import { advanceJob, createJob, failJob, getJob, saveJob, type Job } from "../lib/jobs";
import { submitKernelJob, type KaggleTask } from "../lib/kaggle";
import { readAssetAsBase64 } from "../lib/storage";
import { resolveUser } from "../lib/supabase";
import { startVeo, veoStatus } from "../lib/veo";
import { checkCredits } from "../middleware/checkCredits";
import "../types";

export const generateRouter = Router();

const FORMATS = ["9:16", "16:9", "1:1"];
const MAX_INLINE_IMAGE_B64 = 12 * 1024 * 1024;

function aspect(value: unknown): string {
  return typeof value === "string" && FORMATS.includes(value) ? value : "9:16";
}

/** Keyframe: Kaggle (Flux) con job asíncrono, o Gemini en línea como respaldo. */
generateRouter.post("/generate/image", checkCredits("image"), async (req, res) => {
  console.log("[generate/image] Petición recibida:", {
    prompt: req.body?.prompt?.slice?.(0, 50),
    references: req.body?.references,
    aspectRatio: req.body?.aspectRatio
  });
  const prompt = String(req.body?.prompt || "").trim();
  const ratio = aspect(req.body?.aspectRatio);
  const references = req.body?.references as
    | { character?: string; location?: string; prop?: string }
    | undefined;
  const strength =
    typeof req.body?.strength === "number"
      ? req.body.strength
      : references?.character
      ? 0.52
      : 0.65;
  const user = req.user ?? null;
  const billing = req.billing!;

  if (!prompt) {
    await billing.refund();
    return res.status(400).json({ error: "Falta el prompt de la imagen." });
  }

  if (config.kaggle.enabled) {
    const requestedEngine = String(req.body.engine || process.env.IMAGE_ENGINE || "image").toLowerCase();
    const taskKind: KaggleTask =
      requestedEngine === "flux_redux" || requestedEngine === "redux" ? "flux_redux" : "image";

    let job: Job;
    try {
      job = await createJob({
        userId: user?.id ?? null,
        kind: taskKind,
        prompt,
        creditsCharged: billing.charged,
      });
    } catch (err: any) {
      await billing.refund();
      return res.status(500).json({ error: err?.message || "No se pudo crear el trabajo." });
    }

    try {
      let characterB64: string | null = null;
      let locationB64: string | null = null;
      let propB64: string | null = null;

      if (references?.character) {
        const asset = await readAssetAsBase64(references.character);
        if (asset) characterB64 = asset.base64;
      }
      if (references?.location) {
        const asset = await readAssetAsBase64(references.location);
        if (asset) locationB64 = asset.base64;
      }
      if (references?.prop) {
        const asset = await readAssetAsBase64(references.prop);
        if (asset) propB64 = asset.base64;
      }

      const payload: Record<string, unknown> = {
        job_id: job.id,
        prompt,
        aspect_ratio: ratio,
        character_image_b64: characterB64,
        location_image_b64: locationB64,
        prop_image_b64: propB64,
        strength,
      };

      if (taskKind === "flux_redux") {
        payload.model_variant = req.body.model_variant || "schnell";
        payload.hf_token = config.kaggle.hfToken;
      }

      const { kernelRef } = await submitKernelJob(taskKind, payload);
      job.kernelRef = kernelRef;
      await saveJob(job);
    } catch (err: any) {
      const failed = await failJob(job, err?.message || "Kaggle rechazó la tarea.");
      return res.status(502).json({
        success: false,
        error: failed.error,
        code: "KAGGLE_ERROR",
        missing: missingFor("kaggle"),
      });
    }

    return res.json({
      success: true,
      provider: "kaggle",
      jobId: job.id,
      credits: billing.balance,
    });
  }

  if (config.gemini.apiKey) {
    try {
      const imageUrl = await generateGeminiImage(prompt, ratio);
      return res.json({
        success: true,
        provider: "gemini",
        imageUrl,
        credits: billing.balance,
      });
    } catch (err: any) {
      await billing.refund();
      return res.status(502).json({ success: false, error: err?.message || "Error generando imagen." });
    }
  }

  await billing.refund();
  return res.status(503).json({
    error: "Sin motor de imágenes: configura Kaggle o GEMINI_API_KEY.",
    code: "NO_IMAGE_ENGINE",
    missing: [...missingFor("kaggle"), "GEMINI_API_KEY"],
  });
});

/** Clip: Wan 2.1 I2V en Kaggle (job asíncrono) o Veo como respaldo. */
generateRouter.post("/generate/video", checkCredits("video"), async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  const imageUrl = typeof req.body?.imageUrl === "string" ? req.body.imageUrl : "";
  const ratio = aspect(req.body?.aspectRatio);
  const user = req.user ?? null;
  const billing = req.billing!;

  if (!prompt) {
    await billing.refund();
    return res.status(400).json({ error: "Falta el prompt de video." });
  }

  if (config.kaggle.enabled) {
    let image: { base64: string; mime: string } | null = null;
    if (imageUrl) {
      image = await readAssetAsBase64(imageUrl);
      if (!image) {
        await billing.refund();
        return res.status(400).json({
          error: "No se pudo leer la imagen de referencia. Vuelve a generar el keyframe.",
        });
      }
      if (image.base64.length > MAX_INLINE_IMAGE_B64) {
        await billing.refund();
        return res.status(413).json({
          error: "La imagen de referencia es demasiado grande para el kernel (máx. 9 MB).",
        });
      }
    }

    let job: Job;
    try {
      job = await createJob({
        userId: user?.id ?? null,
        kind: "video",
        prompt,
        inputUrl: imageUrl || null,
        creditsCharged: billing.charged,
      });
    } catch (err: any) {
      await billing.refund();
      return res.status(500).json({ error: err?.message || "No se pudo crear el trabajo." });
    }

    try {
      const { kernelRef } = await submitKernelJob("video", {
        job_id: job.id,
        prompt,
        aspect_ratio: ratio,
        image_b64: image?.base64 || null,
        image_mime: image?.mime || null,
        num_frames: Number(process.env.WAN_NUM_FRAMES) || 81,
        fps: Number(process.env.WAN_FPS) || 16,
        model_id: config.kaggle.wanModelId,
      });
      job.kernelRef = kernelRef;
      await saveJob(job);
    } catch (err: any) {
      const failed = await failJob(job, err?.message || "Kaggle rechazó la tarea.");
      return res.status(502).json({
        success: false,
        error: failed.error,
        code: "KAGGLE_ERROR",
        missing: missingFor("kaggle"),
      });
    }

    return res.json({
      success: true,
      provider: "kaggle",
      jobId: job.id,
      credits: billing.balance,
    });
  }

  if (config.gemini.apiKey) {
    try {
      const operationName = await startVeo(prompt, ratio);
      return res.json({
        success: true,
        provider: "gemini",
        operationName,
        credits: billing.balance,
      });
    } catch (err: any) {
      await billing.refund();
      return res.status(502).json({ success: false, error: err?.message || "Error iniciando el render." });
    }
  }

  await billing.refund();
  return res.status(503).json({
    error: "Sin motor de video: configura Kaggle o GEMINI_API_KEY.",
    code: "NO_VIDEO_ENGINE",
    missing: [...missingFor("kaggle"), "GEMINI_API_KEY"],
  });
});

/**
 * Estado de un trabajo. Acepta tanto jobs de Kaggle como operaciones de Veo,
 * para que el frontend tenga un único endpoint de sondeo.
 */
generateRouter.get("/jobs/:id", async (req, res) => {
  const id = String(req.params.id || "");
  if (!id) return res.status(400).json({ error: "Falta el id del trabajo." });

  const job = await getJob(id);

  if (job) {
    if (job.userId) {
      const user = await resolveUser(req);
      if (!user) return res.status(401).json({ error: "Inicia sesión.", code: "AUTH_REQUIRED" });
      if (user.id !== job.userId) return res.status(403).json({ error: "Sin acceso a este trabajo." });
    }

    const advanced = await advanceJob(job);
    console.log(`[jobs/${id}] Estado job: ${advanced.status} (Kaggle: ${job.kernelRef})`);

    return res.json({
      success: advanced.status !== "error",
      jobId: advanced.id,
      status: advanced.status,
      done: advanced.status === "done",
      imageUrl: advanced.kind === "image" ? advanced.outputUrl || undefined : undefined,
      videoUrl: advanced.kind === "video" ? advanced.outputUrl || undefined : undefined,
      error: advanced.error || undefined,
    });
  }

  // Compatibilidad con operaciones de Veo (render en línea).
  if (config.gemini.apiKey && id.includes("/operations/")) {
    try {
      const status = await veoStatus(id);
      return res.json({ success: !status.error, status: status.done ? "done" : "running", ...status });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Error consultando el render." });
    }
  }

  return res.status(404).json({ error: "Trabajo no encontrado o expirado." });
});
