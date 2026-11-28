import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export const config = {
  maxDuration: 60,
};

const KAGGLE_API_BASE = "https://api.kaggle.com/v1";
const RESERVED_TUNNEL_ID = "a0000000-0000-0000-0000-000000000001";

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
  if (typeof (globalThis as any).WebSocket === "undefined") {
    (globalThis as any).WebSocket = class {};
  }
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

async function getLiveWanGateway(supabase: any): Promise<{ online: boolean; tunnelUrl: string | null }> {
  try {
    const { data, error } = await supabase
      .from("ai_jobs")
      .select("input_url, status, updated_at")
      .eq("id", RESERVED_TUNNEL_ID)
      .maybeSingle();

    if (error || !data || !data.input_url || data.status === "offline") {
      return { online: false, tunnelUrl: null };
    }

    const tunnelUrl = String(data.input_url).trim().replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${tunnelUrl}/system_stats`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      return { online: true, tunnelUrl };
    }
    return { online: false, tunnelUrl };
  } catch {
    return { online: false, tunnelUrl: null };
  }
}

async function uploadImageToComfy(tunnelUrl: string, imageBuffer: Buffer, filename: string): Promise<string> {
  const boundary = `----WebKitFormBoundary${randomUUID()}`;
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`;
  const footer = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`;

  const payload = Buffer.concat([
    Buffer.from(header, "utf8"),
    imageBuffer,
    Buffer.from(footer, "utf8"),
  ]);

  const res = await fetch(`${tunnelUrl}/upload/image`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`Error subiendo imagen a ComfyUI (${res.status}): ${await res.text()}`);
  }

  const data: any = await res.json();
  return data.name || filename;
}

async function dispatchComfyWanPrompt(params: {
  tunnelUrl: string;
  jobId: string;
  prompt: string;
  negativePrompt?: string;
  imageName: string;
  aspectRatio?: string;
  numFrames?: number;
}): Promise<string> {
  const { tunnelUrl, jobId, prompt, negativePrompt, imageName, aspectRatio, numFrames = 25 } = params;

  const isLandscape = aspectRatio === "16:9";
  const width = isLandscape ? 832 : 480;
  const height = isLandscape ? 480 : 832;
  const seed = Math.floor(Math.random() * 1000000000000);

  // Workflow nativo para Wan 2.2 TI2V 5B (Kaggle Dataset sin descargas)
  const workflowWan22: Record<string, any> = {
    "1": {
      "inputs": {
        "unet_name": "wan2.2_ti2v_5B_fp16.safetensors",
        "weight_dtype": "fp8_e4m3fn"
      },
      "class_type": "UNETLoader"
    },
    "2": {
      "inputs": {
        "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "type": "wan"
      },
      "class_type": "CLIPLoader"
    },
    "3": {
      "inputs": {
        "vae_name": "wan2.2_vae.safetensors"
      },
      "class_type": "VAELoader"
    },
    "4": {
      "inputs": {
        "image": imageName,
        "upload": "image"
      },
      "class_type": "LoadImage"
    },
    "5": {
      "inputs": {
        "clip": ["2", 0],
        "text": prompt
      },
      "class_type": "CLIPTextEncode"
    },
    "6": {
      "inputs": {
        "clip": ["2", 0],
        "text": negativePrompt || "ugly, deformed, noisy, blurry, distorted, low quality, bad anatomy, bad hands, static picture"
      },
      "class_type": "CLIPTextEncode"
    },
    "7": {
      "inputs": {
        "width": width,
        "height": height,
        "length": numFrames,
        "batch_size": 1,
        "positive": ["5", 0],
        "negative": ["6", 0],
        "vae": ["3", 0],
        "start_image": ["4", 0]
      },
      "class_type": "WanImageToVideo"
    },
    "8": {
      "inputs": {
        "seed": seed,
        "steps": 16,
        "cfg": 5.0,
        "sampler_name": "uni_pc",
        "scheduler": "simple",
        "denoise": 1.0,
        "model": ["1", 0],
        "positive": ["7", 0],
        "negative": ["7", 1],
        "latent_image": ["7", 2]
      },
      "class_type": "KSampler"
    },
    "9": {
      "inputs": {
        "samples": ["8", 0],
        "vae": ["3", 0],
        "tile_size": 512,
        "overlap": 64,
        "temporal_size": 16,
        "temporal_overlap": 4
      },
      "class_type": "VAEDecodeTiled"
    },
    "10": {
      "inputs": {
        "images": ["9", 0],
        "frame_rate": 16,
        "loop_count": 0,
        "filename_prefix": `Wan22_${jobId}`,
        "format": "video/h264-mp4",
        "pingpong": false,
        "save_output": true
      },
      "class_type": "VHS_VideoCombine"
    }
  };

  const res = await fetch(`${tunnelUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: jobId,
      prompt: workflowWan22,
    }),
  });

  if (!res.ok) {
    throw new Error(`Error enviando workflow a ComfyUI (${res.status}): ${await res.text()}`);
  }

  const data: any = await res.json();
  if (!data?.prompt_id) {
    throw new Error("ComfyUI no devolvió un prompt_id válido.");
  }

  return data.prompt_id;
}

async function processImageSource(imageSource?: string | null, supabase?: any): Promise<{ b64?: string; url?: string; buffer?: Buffer }> {
  if (!imageSource || typeof imageSource !== "string") return {};

  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    try {
      const res = await fetch(imageSource.trim());
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { url: imageSource.trim(), buffer: buf };
      }
    } catch {}
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
      .jpeg({ quality: 80 })
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
          return { url: pubData.publicUrl, buffer: compressedBuf };
        }
      }
    }

    return { b64: compressedBuf.toString("base64"), buffer: compressedBuf };
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
    "9:16": (384, 640),
    "16:9": (640, 384),
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

    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()

    pipe.enable_sequential_cpu_offload()
    gc.collect()
    torch.cuda.empty_cache()
    return pipe

def main() -> None:
    started_total = time.time()
    aspect = PAYLOAD.get("aspect_ratio") or "9:16"
    width, height = SIZES.get(aspect, SIZES.get("9:16", (384, 640)))
    frames_per_clip = clamp_frames(PAYLOAD.get("num_frames") or 33)
    fps = int(PAYLOAD.get("fps") or 16)

    pipe = load_pipeline()

    chain_prompts = PAYLOAD.get("chain_prompts")
    if not chain_prompts:
        chain_prompts = [PAYLOAD.get("prompt") or "Cinematic motion, high quality camera push"]

    initial_b64 = PAYLOAD.get("initial_image_b64") or PAYLOAD.get("image_b64")
    initial_url = PAYLOAD.get("initial_image_url") or PAYLOAD.get("image_url")

    if initial_b64:
        raw_img = Image.open(io.BytesIO(base64.b64decode(initial_b64))).convert("RGB")
    elif initial_url:
        req = urllib.request.Request(initial_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            raw_img = Image.open(io.BytesIO(resp.read())).convert("RGB")
    else:
        raw_img = Image.new("RGB", (width, height), color=(20, 20, 25))

    current_image = load_image(raw_img.resize((width, height), Image.Resampling.LANCZOS))

    master_frames = []
    clip_records = []

    print(f"[clonecinema] Iniciando Frame Chaining de {len(chain_prompts)} clips consecutivos ({width}x{height}, {fps}fps)...")

    for idx, prompt in enumerate(chain_prompts):
        clip_num = idx + 1
        t_start = time.time()
        print(f"--- [Clip {clip_num}/{len(chain_prompts)}] ---")
        print(f"Prompt: {prompt[:200]}")

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
        clip_path = f"/kaggle/working/clip_{clip_num}.mp4"
        export_to_video(clip_frames, clip_path, fps=fps)

        dur_clip = round(time.time() - t_start, 1)
        print(f"[clonecinema] Clip {clip_num} completado en {dur_clip}s -> {clip_path}")

        if idx == 0:
            master_frames.extend(clip_frames)
        else:
            master_frames.extend(clip_frames[1:])

        last_frame_raw = clip_frames[-1]
        if isinstance(last_frame_raw, Image.Image):
            last_frame_pil = last_frame_raw
        else:
            arr = np.array(last_frame_raw)
            if arr.dtype in [np.float32, np.float64]:
                arr = (np.clip(arr, 0.0, 1.0) * 255.0).astype(np.uint8)
            last_frame_pil = Image.fromarray(arr)

        current_image = load_image(last_frame_pil.resize((width, height), Image.Resampling.LANCZOS))
        current_image.save(f"/kaggle/working/last_frame_clip_{clip_num}.png")

        clip_records.append({
            "clip": clip_num,
            "seconds": dur_clip,
            "prompt": prompt,
            "frames": len(clip_frames)
        })

        gc.collect()
        torch.cuda.empty_cache()

    output_video_path = "/kaggle/working/output_video.mp4"
    export_to_video(master_frames, output_video_path, fps=fps)

    total_time = round(time.time() - started_total, 1)
    print(f"[clonecinema] 🎉 Secuencia maestra ensamblada en {total_time}s ({len(master_frames)} frames, ~{round(len(master_frames)/fps, 1)}s) -> {output_video_path}")

    with open("/kaggle/working/result.json", "w", encoding="utf-8") as fh:
        json.dump(
            {
                "job_id": PAYLOAD.get("job_id"),
                "total_frames": len(master_frames),
                "total_duration_sec": round(len(master_frames) / fps, 1),
                "total_render_seconds": total_time,
                "video_file": "output_video.mp4",
                "clips": clip_records
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

    const { prompt, aspectRatio, imageUrl, durationSeconds, seconds, negativePrompt } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Falta el prompt del video." });
    }

    const supabase = getSupabaseAdmin();
    const jobId = randomUUID();
    const imageRef = await processImageSource(imageUrl, supabase);

    const targetSeconds = Number(durationSeconds || seconds || 3);
    // Wan 2.1/2.2 genera múltiplos de 4 + 1 frames (16 fps): 33f = 2.06s, 49f = 3.06s, 65f = 4.06s, 81f = 5.06s
    const calculatedFrames = targetSeconds <= 2 ? 33 : (targetSeconds <= 3 ? 49 : (targetSeconds <= 4 ? 65 : 81));

    // 1. Verificar si el Servidor Caliente de Wan 2.1 ComfyUI en Kaggle está online
    const gateway = await getLiveWanGateway(supabase);
    if (gateway.online && gateway.tunnelUrl) {
      try {
        console.log(`[Wan 2.1 Warm ComfyUI] Enviando tarea ${jobId} a ${gateway.tunnelUrl} (${calculatedFrames} frames / ${targetSeconds}s)...`);
        const isLandscape = aspectRatio === "16:9";
        const width = isLandscape ? 832 : 480;
        const height = isLandscape ? 480 : 832;

        let bufToUpload = imageRef.buffer;
        if (!bufToUpload) {
          bufToUpload = await sharp({
            create: {
              width,
              height,
              channels: 3,
              background: { r: 20, g: 20, b: 25 },
            },
          }).png().toBuffer();
        }

        const uploadedImageName = await uploadImageToComfy(
          gateway.tunnelUrl,
          bufToUpload,
          `input_${jobId.slice(0, 8)}.png`
        );

        const promptId = await dispatchComfyWanPrompt({
          tunnelUrl: gateway.tunnelUrl,
          jobId,
          prompt: prompt.trim(),
          negativePrompt,
          imageName: uploadedImageName,
          aspectRatio: aspectRatio || "9:16",
          numFrames: 25, // 25 frames (1.6s a 16fps) optimizado con VAEDecodeTiled y VHS_VideoCombine en GPU T4
        });

        console.log(`[Wan 2.1 Warm ComfyUI] Prompt encolado con éxito. Prompt ID: ${promptId}`);

        const { error: insertErr } = await supabase.from("ai_jobs").insert({
          id: jobId,
          kind: "video",
          status: "running",
          provider: "wan22_tunnel",
          kernel_ref: promptId,
          input_url: imageUrl || imageRef.url || null,
          prompt: prompt.trim(),
        });

        if (insertErr) {
          console.warn("[ai_jobs comfy insert warning]:", insertErr.message);
        }

        return res.status(200).json({
          success: true,
          jobId,
          provider: "wan22_tunnel",
          mode: "warm_comfyui",
          promptId,
        });
      } catch (comfyErr: any) {
        console.warn("[Wan 2.1 ComfyUI Error, haciendo fallback a Kaggle Script]:", comfyErr.message);
      }
    }

    // 2. Fallback al Script de Kaggle (Modo Frío por Lotes)
    const clipCount = Math.max(1, Math.min(6, Math.ceil(targetSeconds / 2.0)));

    const chainPrompts = Array.from({ length: clipCount }, (_, i) => {
      if (i === 0) return prompt.trim();
      return `${prompt.trim()}, continuous seamless camera motion, smooth cinematic continuation, phase ${i + 1}`;
    });

    const payload = {
      job_id: jobId,
      prompt: prompt.trim(),
      chain_prompts: chainPrompts,
      aspect_ratio: aspectRatio || "9:16",
      initial_image_b64: imageRef.b64 || null,
      initial_image_url: imageRef.url || null,
      num_frames: 33,
      fps: 16,
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
    const scriptWithPayload = WAN_I2V_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

    console.log(`[Kaggle Submit Video Fallback] Enviando tarea ${jobId} a wilycol/clonecinema-wan-i2v...`);
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
    console.error("[generate/video Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Error al procesar la tarea de render de video.",
      details: String(err),
    });
  }
}
