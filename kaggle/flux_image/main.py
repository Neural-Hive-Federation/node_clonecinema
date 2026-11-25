from __future__ import annotations

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
    import torch  # pyrefly: ignore[missing-import] # type: ignore
    import diffusers  # pyrefly: ignore[missing-import] # type: ignore
    from diffusers import (  # pyrefly: ignore[missing-import] # type: ignore
        DiffusionPipeline,
        AutoPipelineForImage2Image,
        AutoPipelineForText2Image,
        EDMDPMSolverMultistepScheduler
    )
    from PIL import Image, ImageOps  # pyrefly: ignore[missing-import] # type: ignore
except ImportError:
    print("[clonecinema] Instalando/actualizando dependencias en entorno Kaggle...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-U", "diffusers", "transformers", "accelerate", "safetensors", "pillow", "-q"])
    import torch  # pyrefly: ignore[missing-import] # type: ignore
    from diffusers import (  # pyrefly: ignore[missing-import] # type: ignore
        DiffusionPipeline,
        AutoPipelineForImage2Image,
        AutoPipelineForText2Image,
        EDMDPMSolverMultistepScheduler
    )
    from PIL import Image, ImageOps  # pyrefly: ignore[missing-import] # type: ignore

MODEL_ID = "playgroundai/playground-v2.5-1024px-aesthetic"
READY_FILE = "/kaggle/working/result.json"
OUTPUT_FILE = "/kaggle/working/output_image.png"

# Inyección de Payload dinámico desde CloneCinema
RAW_B64 = "__PAYLOAD_B64__"

DEFAULT_PAYLOAD = {
    "job_id": "playground_keyframe",
    "prompt": "Cinematic film still, ultra realistic, dramatic cinematic lighting, 8k masterpiece",
    "negative_prompt": "ugly, deformed, noisy, blurry, distorted, low quality, bad hands, lowres, collage, split screen",
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
prompt = PAYLOAD.get("prompt") or DEFAULT_PAYLOAD["prompt"]
negative_prompt = PAYLOAD.get("negative_prompt") or DEFAULT_PAYLOAD["negative_prompt"]
aspect_ratio = PAYLOAD.get("aspect_ratio", "9:16")
width, height = RATIOS.get(aspect_ratio, (768, 1344))
seed = int(PAYLOAD.get("seed", int(time.time()) % 100000))
steps = int(PAYLOAD.get("steps", 25))
guidance_scale = float(PAYLOAD.get("guidance_scale", 3.0))
strength = float(PAYLOAD.get("strength", 0.65))

# Referencias visuales en Base64
char_b64 = PAYLOAD.get("character_image_b64")
loc_b64 = PAYLOAD.get("location_image_b64")
prop_b64 = PAYLOAD.get("prop_image_b64")
init_b64 = PAYLOAD.get("init_image_b64")


def decode_image(b64_str: str | None) -> Image.Image | None:
    if not b64_str:
        return None
    try:
        raw = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(raw))
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            return img.convert("RGBA")
        return img.convert("RGB")
    except Exception as e:
        print(f"[clonecinema] Advertencia: no se pudo decodificar imagen base64 ({e})")
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

    # Si solo hay una imagen, la adaptamos al formato destino
    single_imgs = [img for img in [loc_img, char_img, prop_img] if img is not None]
    if len(single_imgs) == 1:
        return ImageOps.fit(single_imgs[0].convert("RGB"), (target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (target_width, target_height), (15, 15, 18, 255))

    # 1. Capa Fondo: Set o Localización
    if loc_img:
        bg = ImageOps.fit(loc_img.convert("RGBA"), (target_width, target_height), Image.Resampling.LANCZOS)
        canvas.paste(bg, (0, 0))

    # 2. Capa Sujeto: Actor / Protagonista
    if char_img:
        char_h = int(target_height * 0.75)
        char_w = int(char_img.width * (char_h / char_img.height))
        char_resized = char_img.resize((char_w, char_h), Image.Resampling.LANCZOS)
        pos_x = (target_width - char_w) // 2
        pos_y = target_height - char_h
        mask = char_resized if char_resized.mode == "RGBA" else None
        canvas.paste(char_resized, (pos_x, pos_y), mask)

    # 3. Capa Objeto: Prop / Accesorio
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

    # 1. Carga del Modelo Base en GPU
    t_load_start = time.time()
    base_pipe = DiffusionPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        variant="fp16"
    )
    base_pipe.scheduler = EDMDPMSolverMultistepScheduler.from_config(base_pipe.scheduler.config)
    base_pipe.to("cuda")
    t_load_elapsed = round(time.time() - t_load_start, 2)
    print(f"[clonecinema] ✅ Modelo cargado en GPU en {t_load_elapsed}s")

    generator = torch.Generator("cuda").manual_seed(seed)
    t_gen_start = time.time()

    # 2. Ejecución: Modo Image-to-Image / Multi-Referencia vs Text-to-Image
    if has_refs:
        print(f"[clonecinema] 🎨 Modo IMAGE-TO-IMAGE / MULTI-REFERENCIA activo (strength={strength})")
        if direct_init_img:
            init_image = ImageOps.fit(direct_init_img.convert("RGB"), (width, height), Image.Resampling.LANCZOS)
        else:
            init_image = compose_multi_reference(width, height, loc_img, char_img, prop_img)

        # Usamos AutoPipelineForImage2Image compartiendo pesos de memoria GPU (0 VRAM extra)
        img2img_pipe = AutoPipelineForImage2Image.from_pipe(base_pipe)
        img2img_pipe.to("cuda")

        result = img2img_pipe(
            prompt=prompt,
            image=init_image,
            strength=strength,
            negative_prompt=negative_prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            generator=generator
        )
    else:
        print("[clonecinema] 📝 Modo TEXT-TO-IMAGE estándar activo")
        result = base_pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            width=width,
            height=height,
            generator=generator
        )

    t_gen_elapsed = round(time.time() - t_gen_start, 2)

    # 3. Guardado del Artefacto
    result.images[0].save(OUTPUT_FILE, format="PNG")
    print(f"[clonecinema] ✅ Imagen generada y guardada en {OUTPUT_FILE} ({t_gen_elapsed}s)")

    # 4. Escritura de Metadatos con job_id exacto para verificación de jobs.ts
    meta = {
        "job_id": job_id,
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
    print(f"[clonecinema] 🚀 Tarea completada con éxito en {t_total}s totales (Modo: {meta['mode']})")
    print("=" * 60)


if __name__ == "__main__":
    main()
