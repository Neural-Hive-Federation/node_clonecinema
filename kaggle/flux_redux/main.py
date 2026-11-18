from __future__ import annotations

"""
CloneCinema — FLUX.1 + Redux Multi-Reference Generation Kernel.
Arquitectura de Ultra-Coherencia Cinematográfica:
1. Extracción independiente de embeddings latentes para Actor, Set y Prop vía FluxPriorReduxPipeline.
2. Fusión latente ponderada (Identity / Atmosphere / Hero Object).
3. Inferencia guiada por lenguaje natural (T5-XXL) + Transformer de FLUX.1 con CPU offload para 16GB VRAM.
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

# Dependencias necesarias para FLUX y Redux en Diffusers
try:
    import torch
    import diffusers
    from diffusers import FluxPipeline, FluxPriorReduxPipeline
    from PIL import Image, ImageOps
except ImportError:
    print("[clonecinema-flux-redux] Instalando dependencias de FLUX en entorno Kaggle...")
    subprocess.run([
        sys.executable, "-m", "pip", "install", "-U",
        "diffusers", "transformers", "accelerate", "safetensors",
        "sentencepiece", "protobuf", "pillow", "huggingface_hub", "-q"
    ], check=True)
    import torch
    import diffusers
    from diffusers import FluxPipeline, FluxPriorReduxPipeline
    from PIL import Image, ImageOps

READY_FILE = "/kaggle/working/result.json"
OUTPUT_FILE = "/kaggle/working/output_image.png"

# Inyección de Payload dinámico desde CloneCinema
RAW_B64 = "__PAYLOAD_B64__"

DEFAULT_PAYLOAD = {
    "job_id": "flux_redux_keyframe",
    "prompt": "Cinematic film still, ultra realistic, dramatic cinematic lighting, 8k masterpiece",
    "aspect_ratio": "9:16",
    "steps": 4,
    "guidance_scale": 3.5,
    "seed": 42,
    "model_variant": "schnell"  # 'schnell' (4 steps, Apache 2.0) o 'dev' (20-25 steps, máxima fidelidad)
}

try:
    if RAW_B64 and not RAW_B64.startswith("__"):
        PAYLOAD = json.loads(base64.b64decode(RAW_B64).decode("utf-8"))
    else:
        PAYLOAD = DEFAULT_PAYLOAD
except Exception as e:
    print(f"[clonecinema-flux-redux] Error decodificando payload: {e}. Usando default.")
    PAYLOAD = DEFAULT_PAYLOAD

RATIOS = {
    "9:16": (768, 1344),
    "16:9": (1344, 768),
    "1:1": (1024, 1024),
}

job_id = PAYLOAD.get("job_id", "default_job")
prompt = PAYLOAD.get("prompt") or DEFAULT_PAYLOAD["prompt"]
aspect_ratio = PAYLOAD.get("aspect_ratio", "9:16")
width, height = RATIOS.get(aspect_ratio, (768, 1344))
seed = int(PAYLOAD.get("seed", int(time.time()) % 100000))
model_variant = PAYLOAD.get("model_variant", "schnell").lower()
steps = int(PAYLOAD.get("steps", 4 if model_variant == "schnell" else 24))
guidance_scale = float(PAYLOAD.get("guidance_scale", 3.5 if model_variant == "dev" else 0.0))
hf_token = PAYLOAD.get("hf_token") or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

if hf_token:
    try:
        from huggingface_hub import login
        login(token=hf_token, add_to_git_credential=False)
        print("[clonecinema-flux-redux] ✅ Autenticado en Hugging Face")
    except Exception as e:
        print(f"[clonecinema-flux-redux] Nota de auth HF: {e}")

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
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return img
    except Exception as e:
        print(f"[clonecinema-flux-redux] Error decodificando imagen base64: {e}")
        return None


def main() -> None:
    global steps, guidance_scale, model_variant
    t_start = time.time()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16

    print("=" * 65)
    print(f"[clonecinema-flux-redux] INICIANDO MOTOR FLUX.1 + REDUX MULTI-REFERENCE")
    print(f"[clonecinema-flux-redux] Job ID: {job_id}")
    print(f"[clonecinema-flux-redux] Variante: FLUX.1-{model_variant} | Steps: {steps} | Guidance: {guidance_scale}")
    print(f"[clonecinema-flux-redux] Dimensiones: {width}x{height} ({aspect_ratio}) | Seed: {seed}")
    print(f"[clonecinema-flux-redux] Prompt: {prompt[:120]}...")
    print("=" * 65)

    char_img = decode_image(char_b64)
    loc_img = decode_image(loc_b64)
    prop_img = decode_image(prop_b64)
    direct_init = decode_image(init_b64)

    ref_items = []
    # (imagen, etiqueta, peso_por_defecto)
    if char_img:
        ref_items.append((char_img, "Actor", 0.50))
    if loc_img:
        ref_items.append((loc_img, "Set", 0.30))
    if prop_img:
        ref_items.append((prop_img, "Prop", 0.20))
    if not ref_items and direct_init:
        ref_items.append((direct_init, "InitDirect", 1.0))

    has_redux_refs = len(ref_items) > 0
    print(f"[clonecinema-flux-redux] Referencias visuales activas: {len(ref_items)} ({', '.join(t[1] for t in ref_items) if ref_items else 'Ninguna - T2I'})")

    redux_prior_output = None

    # PASO 1: Extracción de embeddings si hay referencias
    if has_redux_refs:
        print("[clonecinema-flux-redux] 🔮 Cargando FluxPriorReduxPipeline para extracción de embeddings...")
        t_redux_start = time.time()
        try:
            prior_redux = FluxPriorReduxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-Redux-dev",
                token=hf_token,
                torch_dtype=dtype
            ).to(device)

            # Normalizar pesos
            total_weight = sum(w for _, _, w in ref_items)
            norm_refs = [(img, label, w / total_weight) for img, label, w in ref_items]

            acc_prompt_embeds = None
            acc_pooled_embeds = None

            for img, label, weight in norm_refs:
                print(f"[clonecinema-flux-redux] 📸 Extrayendo features de {label} (peso: {weight:.2f})...")
                # Redux espera imágenes centradas / redimensionadas
                fit_img = ImageOps.fit(img, (512, 512), Image.Resampling.LANCZOS)
                out = prior_redux(fit_img)
                p_emb = out.prompt_embeds * weight
                pooled_emb = out.pooled_prompt_embeds * weight

                if acc_prompt_embeds is None:
                    acc_prompt_embeds = p_emb
                    acc_pooled_embeds = pooled_emb
                else:
                    acc_prompt_embeds = acc_prompt_embeds + p_emb
                    acc_pooled_embeds = acc_pooled_embeds + pooled_emb

            redux_prior_output = {
                "prompt_embeds": acc_prompt_embeds,
                "pooled_prompt_embeds": acc_pooled_embeds
            }
            print(f"[clonecinema-flux-redux] ✅ Fusión latente completada con éxito en {round(time.time() - t_redux_start, 2)}s")

            # Liberar memoria de Redux Prior para dar todo el VRAM al Transformer
            del prior_redux
            torch.cuda.empty_cache()
            gc.collect()

        except Exception as e:
            print(f"[clonecinema-flux-redux] ⚠️ Advertencia en Redux Prior: {e}. Continuando con T2I enriquecido.")
            redux_prior_output = None

    # PASO 2: Carga de FLUX.1 Base Pipeline
    t_model_start = time.time()
    repo_id = "black-forest-labs/FLUX.1-schnell" if model_variant == "schnell" else "black-forest-labs/FLUX.1-dev"
    print(f"[clonecinema-flux-redux] ⚡ Cargando modelo base {repo_id} con CPU Offload...")

    try:
        pipe = FluxPipeline.from_pretrained(
            repo_id,
            token=hf_token,
            torch_dtype=dtype
        )
    except Exception as e:
        if model_variant == "dev":
            print(f"[clonecinema-flux-redux] Falló carga de {repo_id} ({e}). Haciendo fallback a FLUX.1-schnell...")
            repo_id = "black-forest-labs/FLUX.1-schnell"
            steps = 4
            guidance_scale = 0.0
            pipe = FluxPipeline.from_pretrained(repo_id, token=hf_token, torch_dtype=dtype)
        else:
            raise e

    # Habilitar CPU Offload para entrar perfecto en los 16 GB de VRAM de Kaggle
    pipe.enable_model_cpu_offload()
    print(f"[clonecinema-flux-redux] ✅ FLUX.1 listo en {round(time.time() - t_model_start, 2)}s")

    # PASO 3: Generación
    t_infer_start = time.time()
    generator = torch.Generator("cuda").manual_seed(seed) if device == "cuda" else torch.Generator().manual_seed(seed)

    print(f"[clonecinema-flux-redux] 🎨 Generando imagen ({steps} steps)...")
    gen_kwargs = {
        "prompt": prompt,
        "width": width,
        "height": height,
        "num_inference_steps": steps,
        "guidance_scale": guidance_scale,
        "generator": generator
    }

    if redux_prior_output:
        gen_kwargs["prompt_embeds"] = redux_prior_output["prompt_embeds"]
        gen_kwargs["pooled_prompt_embeds"] = redux_prior_output["pooled_prompt_embeds"]

    output = pipe(**gen_kwargs)
    result_image = output.images[0]
    t_infer_elapsed = round(time.time() - t_infer_start, 2)

    # PASO 4: Guardado de Artefacto y Metadatos
    result_image.save(OUTPUT_FILE, format="PNG")
    print(f"[clonecinema-flux-redux] ✅ Imagen guardada en {OUTPUT_FILE} ({t_infer_elapsed}s)")

    meta = {
        "job_id": job_id,
        "prompt": prompt,
        "model": repo_id,
        "aspect_ratio": aspect_ratio,
        "width": width,
        "height": height,
        "seed": seed,
        "mode": "flux_redux_multiref" if redux_prior_output else "flux_t2i",
        "reference_count": len(ref_items),
        "seconds": t_infer_elapsed,
        "status": "done"
    }

    with open(READY_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    t_total = round(time.time() - t_start, 2)
    print("=" * 65)
    print(f"[clonecinema-flux-redux] 🚀 Finalizado con éxito en {t_total}s totales.")
    print("=" * 65)


if __name__ == "__main__":
    main()
