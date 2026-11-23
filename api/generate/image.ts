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

const FLUX_IMAGE_TEMPLATE = `from __future__ import annotations

"""
CloneCinema — Playground v2.5 Hybrid Generation Kernel (T2I + I2I + Multi-Reference).
Soporta:
1. Text-to-Image (T2I) estándar cuando no hay referencias adjuntas.
2. Image-to-Image (I2I) cuando se pasa una sola imagen de referencia.
3. Multi-Referencia (Composición inteligente de Actor + Set + Prop con refinado latente homogéneo).
"""

import base64
import io
import json
import os
import subprocess
import sys
import time
import gc

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

try:
    import torch
    import diffusers
    from diffusers import (
        DiffusionPipeline,
        AutoPipelineForImage2Image,
        AutoPipelineForText2Image,
        EDMDPMSolverMultistepScheduler
    )
    from PIL import Image, ImageOps
except ImportError:
    print("[clonecinema] Instalando dependencias de difusion en Kaggle...")
    subprocess.run([sys.executable, "-m", "pip", "install", "diffusers", "transformers", "accelerate", "safetensors", "pillow", "-q"])
    import torch
    from diffusers import (
        DiffusionPipeline,
        AutoPipelineForImage2Image,
        AutoPipelineForText2Image,
        EDMDPMSolverMultistepScheduler
    )
    from PIL import Image, ImageOps

MODEL_ID = "playgroundai/playground-v2.5-1024px-aesthetic"
READY_FILE = "/kaggle/working/result.json"
OUTPUT_FILE = "/kaggle/working/output_image.png"

# Inyección de Payload dinámico desde CloneCinema
RAW_B64 = "__PAYLOAD_B64__"

DEFAULT_PAYLOAD = {
    "job_id": "playground_keyframe",
    "count": 1,
    "prompt": "Cinematic film still, ultra realistic, dramatic cinematic lighting, 8k masterpiece",
    "negative_prompt": "ugly, deformed, noisy, blurry, distorted, low quality, bad anatomy, bad hands, cartoonish, lowres, collage, split screen",
    "aspect_ratio": "9:16",
    "strength": 0.65,
    "seed": 42
}

try:
    if RAW_B64 and not RAW_B64.startswith("__"):
        PAYLOAD = json.loads(base64.b64decode(RAW_B64).decode("utf-8"))
    else:
        PAYLOAD = DEFAULT_PAYLOAD
except Exception as e:
    print(f"[clonecinema] Error decodificando payload: {e}. Usando default.")
    PAYLOAD = DEFAULT_PAYLOAD

RATIOS = {
    "9:16": (768, 1344),
    "16:9": (1344, 768),
    "1:1": (1024, 1024),
}

job_id = PAYLOAD.get("job_id", "default_job")
count = int(PAYLOAD.get("count", 1))
prompt = PAYLOAD.get("prompt") or DEFAULT_PAYLOAD["prompt"]
negative_prompt = PAYLOAD.get("negative_prompt") or DEFAULT_PAYLOAD["negative_prompt"]
aspect_ratio = PAYLOAD.get("aspect_ratio", "9:16")
width, height = RATIOS.get(aspect_ratio, (768, 1344))
seed = int(PAYLOAD.get("seed", int(time.time()) % 100000))
steps = int(PAYLOAD.get("steps", 20))
guidance_scale = float(PAYLOAD.get("guidance_scale", 3.0))
strength = float(PAYLOAD.get("strength", 0.65))

# Referencias visuales en Base64
char_b64 = PAYLOAD.get("character_image_b64")
loc_b64 = PAYLOAD.get("location_image_b64")
prop_b64 = PAYLOAD.get("prop_image_b64")
init_b64 = PAYLOAD.get("init_image_b64")


def decode_image(b64_or_url: str | None) -> Image.Image | None:
    if not b64_or_url:
        return None
    try:
        if b64_or_url.startswith("http://") or b64_or_url.startswith("https://"):
            import urllib.request
            req = urllib.request.Request(b64_or_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                img = Image.open(io.BytesIO(resp.read()))
        else:
            raw = base64.b64decode(b64_or_url)
            img = Image.open(io.BytesIO(raw))
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            return img.convert("RGBA")
        return img.convert("RGB")
    except Exception as e:
        print(f"[clonecinema] Advertencia: no se pudo cargar imagen ({e})")
        return None


def compose_multi_reference(
    target_width: int,
    target_height: int,
    loc_img: Image.Image | None,
    char_img: Image.Image | None,
    prop_img: Image.Image | None
) -> Image.Image | None:
    """
    Construye un canvas preliminar unificando el set (fondo), actor (sujeto)
    y prop (objeto) para condicionar el proceso de difusión latente.
    """
    if not loc_img and not char_img and not prop_img:
        return None

    single_imgs = [img for img in [loc_img, char_img, prop_img] if img is not None]
    if len(single_imgs) == 1:
        return ImageOps.fit(single_imgs[0].convert("RGB"), (target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (target_width, target_height), (15, 15, 18, 255))

    if loc_img:
        bg = ImageOps.fit(loc_img.convert("RGBA"), (target_width, target_height), Image.Resampling.LANCZOS)
        canvas.paste(bg, (0, 0))

    if char_img:
        char_h = int(target_height * 0.75)
        char_w = int(char_img.width * (char_h / char_img.height))
        char_resized = char_img.resize((char_w, char_h), Image.Resampling.LANCZOS)
        pos_x = (target_width - char_w) // 2
        pos_y = target_height - char_h
        mask = char_resized if char_resized.mode == "RGBA" else None
        canvas.paste(char_resized, (pos_x, pos_y), mask)

    if prop_img:
        prop_size = int(min(target_width, target_height) * 0.28)
        prop_resized = ImageOps.fit(prop_img, (prop_size, prop_size), Image.Resampling.LANCZOS)
        pos_x = int(target_width * 0.65)
        pos_y = int(target_height * 0.62)
        mask = prop_resized if prop_resized.mode == "RGBA" else None
        canvas.paste(prop_resized, (pos_x, pos_y), mask)

    return canvas.convert("RGB")


def main() -> None:
    t_start = time.time()
    print("=" * 60)
    print(f"[clonecinema] Iniciando Generador Híbrido con {MODEL_ID}")
    print(f"[clonecinema] Job ID: {job_id}")
    print(f"[clonecinema] Prompt: {prompt}")
    print(f"[clonecinema] Aspect Ratio: {aspect_ratio} ({width}x{height})")
    print(f"[clonecinema] Steps: {steps} | Guidance: {guidance_scale} | Seed: {seed}")

    char_img = decode_image(char_b64)
    loc_img = decode_image(loc_b64)
    prop_img = decode_image(prop_b64)
    direct_init_img = decode_image(init_b64)

    has_refs = bool(char_img or loc_img or prop_img or direct_init_img)
    ref_count = sum(1 for x in [char_img, loc_img, prop_img, direct_init_img] if x is not None)
    print(f"[clonecinema] Referencias visuales activas: {ref_count} (Direct Init: {bool(direct_init_img)}, Actor: {bool(char_img)}, Set: {bool(loc_img)}, Prop: {bool(prop_img)})")
    print("=" * 60)

    t_load_start = time.time()
    base_pipe = DiffusionPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        variant="fp16"
    )
    base_pipe.scheduler = EDMDPMSolverMultistepScheduler.from_config(base_pipe.scheduler.config)
    base_pipe.to("cuda")
    t_load_elapsed = round(time.time() - t_load_start, 2)
    print(f"[clonecinema] Modelo cargado en GPU en {t_load_elapsed}s")

    t_gen_start = time.time()
    generated_images = []

    if has_refs:
        print(f"[clonecinema] Modo IMAGE-TO-IMAGE / MULTI-REFERENCIA activo (strength={strength})")
        if direct_init_img:
            init_image = ImageOps.fit(direct_init_img.convert("RGB"), (width, height), Image.Resampling.LANCZOS)
        else:
            init_image = compose_multi_reference(width, height, loc_img, char_img, prop_img)

        pipe = AutoPipelineForImage2Image.from_pipe(base_pipe)
        pipe.to("cuda")
    else:
        print("[clonecinema] Modo TEXT-TO-IMAGE estándar activo")
        pipe = base_pipe

    for idx in range(count):
        cur_seed = seed + idx * 137
        generator = torch.Generator("cuda").manual_seed(cur_seed)
        print(f"[clonecinema] Generando imagen {idx + 1}/{count} con seed {cur_seed}...")

        if has_refs:
            res = pipe(
                prompt=prompt,
                image=init_image,
                strength=strength,
                negative_prompt=negative_prompt,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=generator
            )
        else:
            res = pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                width=width,
                height=height,
                generator=generator
            )

        file_path = f"/kaggle/working/output_image_{idx}.png" if count > 1 else OUTPUT_FILE
        res.images[0].save(file_path, format="PNG")
        generated_images.append(file_path)
        if idx == 0 and count > 1:
            res.images[0].save(OUTPUT_FILE, format="PNG")
        print(f"[clonecinema] Imagen {idx + 1} guardada en {file_path}")

    t_gen_elapsed = round(time.time() - t_gen_start, 2)

    meta = {
        "job_id": job_id,
        "count": count,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "seed": seed,
        "mode": "img2img_multiref" if has_refs else "text2img",
        "reference_count": ref_count,
        "seconds": t_gen_elapsed,
        "status": "done"
    }
    with open(READY_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    t_total = round(time.time() - t_start, 2)
    print("=" * 60)
    print(f"[clonecinema] Tarea completada con éxito en {t_total}s totales (Modo: {meta['mode']})")
    print("=" * 60)


if __name__ == "__main__":
    main()
`;

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

async function processReferenceImage(ref?: string | null, supabase?: any): Promise<string | null> {
  if (!ref || typeof ref !== "string") return null;

  // 1. Si es una URL HTTP/HTTPS, pasarla directa (Kaggle la descarga en segundos)
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return ref.trim();
  }

  // 2. Extraer datos base64 si es data URI o string base64 directo
  try {
    let b64Data = ref;
    if (ref.startsWith("data:")) {
      const commaIdx = ref.indexOf(",");
      b64Data = commaIdx >= 0 ? ref.slice(commaIdx + 1) : ref;
    }
    const inputBuf = Buffer.from(b64Data, "base64");
    const compressedBuf = await sharp(inputBuf)
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();

    // Subir a Supabase Storage para evitar inflar el script de Kaggle (>1MB límite)
    if (supabase) {
      const refPath = `refs/ref_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await supabase.storage.from("keyframes").upload(refPath, compressedBuf, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (!upErr) {
        const { data: pubData } = supabase.storage.from("keyframes").getPublicUrl(refPath);
        if (pubData?.publicUrl) {
          return pubData.publicUrl;
        }
      }
    }

    return compressedBuf.toString("base64");
  } catch (e) {
    console.warn("[processReferenceImage compress warning]:", e);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { prompt, aspectRatio, references, strength, count } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Falta el prompt de la imagen." });
    }

    const supabase = getSupabaseAdmin();
    const jobId = randomUUID();
    const numCount = Math.min(Math.max(Number(count) || 1, 1), 4);

    let enrichedPrompt = prompt.trim();
    if (!enrichedPrompt.toLowerCase().includes("photorealistic")) {
      enrichedPrompt = `${enrichedPrompt}, photorealistic 35mm film still, cinematic lighting, 8k uhd, masterpiece`;
    }

    const [charRef, locRef, propRef] = await Promise.all([
      processReferenceImage(references?.character, supabase),
      processReferenceImage(references?.location, supabase),
      processReferenceImage(references?.prop, supabase),
    ]);

    const payload = {
      job_id: jobId,
      count: numCount,
      prompt: enrichedPrompt,
      aspect_ratio: aspectRatio || "16:9",
      character_image_b64: charRef,
      location_image_b64: locRef,
      prop_image_b64: propRef,
      strength: typeof strength === "number" ? strength : 0.65,
      seed: Math.floor(Math.random() * 100000),
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
    const scriptWithPayload = FLUX_IMAGE_TEMPLATE.replace("__PAYLOAD_B64__", payloadB64);

    console.log(`[Kaggle Submit] Enviando tarea ${jobId} (variaciones: ${numCount}) a wilycol/clonecinema-flux-image...`);
    const { versionNumber } = await pushKaggleScript({
      slug: "wilycol/clonecinema-flux-image",
      title: "CloneCinema Flux image",
      text: scriptWithPayload,
      enableGpu: true,
    });
    console.log(`[Kaggle Submit] Versión ${versionNumber} en ejecución en GPU.`);

    const { error: insertErr } = await supabase.from("ai_jobs").insert({
      id: jobId,
      kind: "image",
      status: "running",
      provider: "kaggle",
      kernel_ref: "wilycol/clonecinema-flux-image",
      prompt: enrichedPrompt,
    });

    if (insertErr) {
      console.error("[ai_jobs insert error]:", insertErr.message);
      throw new Error(`Error registrando trabajo en base de datos: ${insertErr.message}`);
    }

    return res.status(200).json({
      success: true,
      jobId,
      provider: "kaggle",
      kernelVersion: versionNumber,
    });
  } catch (err: any) {
    console.error("[generate/image Kaggle Error]:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Error al enviar la tarea al cuaderno de Kaggle.",
      details: String(err),
    });
  }
}
