import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const config = {
  maxDuration: 60,
};

const KAGGLE_API_BASE = "https://api.kaggle.com/v1";

function getKaggleAuthHeaders(): HeadersInit {
  const token =
    process.env.KAGGLE_KEY ||
    process.env.KAGGLE_API_TOKEN ||
    "";

  if (!token) {
    throw new Error(
      "Kaggle API token no configurado. Define KAGGLE_KEY en las variables de entorno."
    );
  }

  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  };
}

async function pushKaggleScript(params: {
  slug: string;
  title: string;
  text: string;
  enableGpu?: boolean;
}): Promise<{ ref: string; versionNumber: number }> {
  const headers = getKaggleAuthHeaders();

  const body = {
    slug: params.slug,
    newTitle: params.title,
    text: params.text,
    language: "python",
    kernelType: "script",
    isPrivate: true,
    enableGpu: params.enableGpu !== false,
    enableInternet: true,
  };

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/SaveKernel`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle SaveKernel error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  return {
    ref: data.ref || params.slug,
    versionNumber: data.versionNumber,
  };
}

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

async function processImageSource(imageSource?: string | null, supabase?: any): Promise<{ b64?: string; url?: string }> {
  if (!imageSource || typeof imageSource !== "string") return {};

  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    return { url: imageSource.trim() };
  }

  try {
    let b64Data = imageSource;
    if (imageSource.startsWith("data:")) {
      const commaIdx = imageSource.indexOf(",");
      b64Data = commaIdx >= 0 ? imageSource.slice(commaIdx + 1) : imageSource;
    }
    const inputBuf = Buffer.from(b64Data, "base64");
    const compressedBuf = await sharp(inputBuf)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    if (supabase) {
      const fileName = `temp_i2v_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await supabase.storage.from("keyframes").upload(fileName, compressedBuf, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (!upErr) {
        const { data: pubData } = supabase.storage.from("keyframes").getPublicUrl(fileName);
        if (pubData?.publicUrl) {
          return { url: pubData.publicUrl };
        }
      }
    }

    return { b64: compressedBuf.toString("base64") };
  } catch (e) {
    console.warn("[processImageSource warning]:", e);
    return {};
  }
}

const WAN_I2V_TEMPLATE = `from __future__ import annotations

"""
CloneCinema — Kernel Wan 2.1 I2V con Frame Chaining (Micro-Storyboards Continuos).
Genera clips cinematográficos con movimiento a partir de una imagen de referencia.
"""

import subprocess
import sys
import os

try:
    import ftfy
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "ftfy", "-q"])
    import ftfy

import builtins
builtins.ftfy = ftfy

try:
    import diffusers.pipelines.wan.pipeline_wan_i2v as _wan_i2v_mod
    _wan_i2v_mod.ftfy = ftfy
except Exception:
    pass

import base64
import gc
import io
import json
import time
import urllib.request

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

import torch
from diffusers import WanImageToVideoPipeline
from diffusers.utils import export_to_video, load_image
from PIL import Image
import numpy as np

PAYLOAD = json.loads(base64.b64decode("__PAYLOAD_B64__").decode("utf-8"))

I2V_MODEL = PAYLOAD.get("model_id") or os.environ.get(
    "WAN_MODEL_ID", "engineerA314/Wan2.1-Fun-V1.1-1.3B-InP-Diffusers"
)

SIZES = {
    "9:16": (480, 832),
    "16:9": (832, 480),
    "1:1": (480, 480),
    "safe_16:9": (640, 384),
    "safe_9:16": (384, 640),
}

NEGATIVE_PROMPT = (
    "Bright tones, overexposed, static, blurred details, subtitles, watermark, "
    "worst quality, low quality, JPEG artifacts, deformed, disfigured, "
    "extra limbs, fused fingers, still picture, messy background"
)

def clamp_frames(frames: int) -> int:
    frames = max(17, min(int(frames), 41))
    return frames - ((frames - 1) % 4)

def load_pipeline():
    print(f"[clonecinema] Cargando modelo Wan I2V ({I2V_MODEL}) en torch.float16...")
    try:
        pipe = WanImageToVideoPipeline.from_pretrained(
            I2V_MODEL, torch_dtype=torch.float16
        )
    except Exception as e:
        print(f"[clonecinema] Fallback carga modular: {e}")
        from diffusers import AutoencoderKLWan, WanTransformer3DModel
        transformer = WanTransformer3DModel.from_pretrained(
            I2V_MODEL, subfolder="transformer", torch_dtype=torch.float16
        )
        pipe = WanImageToVideoPipeline.from_pretrained(
            I2V_MODEL, transformer=transformer, torch_dtype=torch.float16
        )
    pipe.to("cuda")
    try:
        pipe.enable_model_cpu_offload()
    except Exception:
        pass
    return pipe

def main() -> None:
    started_total = time.time()
    aspect = PAYLOAD.get("aspect_ratio") or "9:16"
    width, height = SIZES.get(aspect, SIZES.get("9:16", (480, 832)))
    frames_per_clip = clamp_frames(PAYLOAD.get("num_frames") or 33)
    fps = int(PAYLOAD.get("fps") or 16)

    pipe = load_pipeline()

    prompt = PAYLOAD.get("prompt") or "Cinematic motion, high quality camera push"
    initial_b64 = PAYLOAD.get("initial_image_b64") or PAYLOAD.get("image_b64")
    initial_url = PAYLOAD.get("initial_image_url") or PAYLOAD.get("image_url")

    if initial_b64:
        raw_img = Image.open(io.BytesIO(base64.b64decode(initial_b64))).convert("RGB")
    elif initial_url:
        req = urllib.request.Request(initial_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            raw_img = Image.open(io.BytesIO(resp.read())).convert("RGB")
    else:
        # Generar imagen inicial de respaldo si no hay imagen provista
        raw_img = Image.new("RGB", (width, height), color=(20, 20, 25))

    current_image = load_image(raw_img.resize((width, height), Image.Resampling.LANCZOS))

    print(f"[clonecinema] Renderizando clip Wan I2V ({width}x{height}, {fps}fps, {frames_per_clip} frames)...")
    print(f"Prompt: {prompt}")

    output = pipe(
        image=current_image,
        prompt=prompt,
        negative_prompt=NEGATIVE_PROMPT,
        height=height,
        width=width,
        num_frames=frames_per_clip,
        guidance_scale=5.0,
    )

    clip_frames = output.frames[0]
    output_video_path = "/kaggle/working/output_video.mp4"
    export_to_video(clip_frames, output_video_path, fps=fps)

    total_time = round(time.time() - started_total, 1)
    print(f"[clonecinema] 🎉 Video renderizado con éxito en {total_time}s -> {output_video_path}")

    with open("/kaggle/working/result.json", "w", encoding="utf-8") as fh:
        json.dump(
            {
                "job_id": PAYLOAD.get("job_id"),
                "total_frames": len(clip_frames),
                "total_duration_sec": round(len(clip_frames) / fps, 1),
                "total_render_seconds": total_time,
                "video_file": "output_video.mp4"
            },
            fh,
            indent=2
        )

if __name__ == "__main__":
    main()
`;

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt, aspectRatio, imageUrl } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Falta el prompt del video." });
    }

    const supabase = getSupabaseAdmin();
    const jobId = randomUUID();

    const imageRef = await processImageSource(imageUrl, supabase);

    const payload = {
      job_id: jobId,
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio || "9:16",
      initial_image_b64: imageRef.b64 || null,
      initial_image_url: imageRef.url || null,
      num_frames: 33,
      fps: 16,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
    const scriptWithPayload = WAN_I2V_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

    console.log(`[Kaggle Submit Video] Enviando tarea ${jobId} a wilycol/clonecinema-wan-i2v...`);
    const { versionNumber } = await pushKaggleScript({
      slug: "wilycol/clonecinema-wan-i2v",
      title: "CloneCinema Wan I2V",
      text: scriptWithPayload,
      enableGpu: true,
    });
    console.log(`[Kaggle Submit Video] Versión ${versionNumber} en ejecución en GPU.`);

    const { error: insertErr } = await supabase.from("ai_jobs").insert({
      id: jobId,
      kind: "video",
      status: "running",
      provider: "kaggle",
      kernel_ref: "wilycol/clonecinema-wan-i2v",
      prompt: prompt.trim(),
    });

    if (insertErr) {
      console.warn("[ai_jobs video insert warning]:", insertErr.message);
    }

    return res.status(200).json({
      success: true,
      jobId,
      provider: "kaggle",
      kernelVersion: versionNumber,
    });
  } catch (err: any) {
    console.error("[generate/video Kaggle Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Error al enviar la tarea de render al cuaderno de Kaggle.",
      details: String(err),
    });
  }
}
