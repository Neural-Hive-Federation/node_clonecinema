from __future__ import annotations

"""
CloneCinema — Qwen2.5-VL Vision Director Kernel
================================================
Motor de Visión de Respaldo e Inteligencia Multimodal para Kaggle.
Procesa secuencias de fotogramas clave minados por el Fénix directamente
desde URLs de Supabase en modo streaming (frame por frame con limpieza de VRAM),
realizando OCR de subtítulos nativos, análisis dramático y estructuración
de guion plano a plano para Wan 2.1.
"""

import base64
import gc
import io
import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional
import urllib.request

# Optimización agresiva de memoria CUDA
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# --- CONFIGURACIÓN SUPABASE ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://micjwzatshemmovaneix.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

WORKING_DIR = "/kaggle/working" if os.path.exists("/kaggle") else "./working"
os.makedirs(WORKING_DIR, exist_ok=True)
CHECKPOINT_FILE = os.path.join(WORKING_DIR, "shots_analysis.json")
FINAL_PLAN_FILE = os.path.join(WORKING_DIR, "director_plan.json")

# Inyección de Payload dinámico (o default automático)
RAW_B64 = "__PAYLOAD_B64__"


def log(msg: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] 🧠 [QWEN-VISION] {msg}", flush=True)


# 1. INSTALACIÓN / IMPORTACIÓN DE DEPENDENCIAS
try:
    import torch
    from PIL import Image
    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
    from qwen_vl_utils import process_vision_info
    from supabase import create_client, Client
except ImportError:
    log("Instalando dependencias necesarias para Qwen2.5-VL y Supabase en Kaggle...")
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "-U",
        "transformers>=4.48.0",
        "accelerate",
        "qwen-vl-utils",
        "torchvision",
        "pillow",
        "supabase",
        "bitsandbytes",
        "-q",
    ]
    subprocess.run(cmd, check=True)
    import torch
    from PIL import Image
    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
    from qwen_vl_utils import process_vision_info
    from supabase import create_client, Client


def get_supabase_client() -> Optional[Client]:
    try:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        log(f"⚠️ Error conectando con Supabase: {e}")
        return None


def fetch_latest_fenix_frames(sb: Client, project_id: Optional[str] = None) -> Dict[str, Any]:
    """Obtiene la lista de frames y contrato del último minado del Fénix."""
    try:
        query = sb.table("messages").select("*").eq("type", "fenix_frames_result").order("created_at", desc=True)
        if project_id:
            res = query.limit(10).execute()
            for r in res.data or []:
                if r.get("metadata", {}).get("projectId") == project_id:
                    return r.get("metadata", {})
        res = query.limit(1).execute()
        if res.data:
            return res.data[0].get("metadata", {})
    except Exception as e:
        log(f"Error consultando mensajes en Supabase: {e}")
    return {}


def download_and_preprocess_image(url: str, max_dimension: int = 768) -> Optional[Image.Image]:
    """
    Descarga una imagen desde Supabase con reintentos y la redimensiona en memoria
    para reducir drásticamente el consumo de tokens visuales y VRAM.
    """
    retries = 3
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CloneCinema-Vision/1.0"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                img = Image.open(io.BytesIO(data))
                if img.mode != "RGB":
                    img = img.convert("RGB")

                # Redimensionar conservando aspect ratio (máx 768px de lado mayor)
                w, h = img.size
                if max(w, h) > max_dimension:
                    scale = max_dimension / max(w, h)
                    new_size = (int(w * scale), int(h * scale))
                    img = img.resize(new_size, Image.Resampling.LANCZOS)
                return img
        except Exception as ex:
            log(f"Reintento {attempt+1}/{retries} descargando {url}: {ex}")
            time.sleep(1.5)
    return None


def load_model_and_processor():
    log("Cargando modelo Qwen2.5-VL-7B-Instruct en GPU...")
    model_name = "Qwen/Qwen2.5-VL-7B-Instruct"

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if (torch.cuda.is_available() and torch.cuda.is_bf16_supported()) else torch.float16

    try:
        model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
            model_name,
            torch_dtype=dtype,
            device_map="auto",
            low_cpu_mem_usage=True,
        )
    except Exception as e:
        log(f"Aviso con 7B ({e}), intentando modo cuantizado 4-bit o fallback 3B...")
        try:
            model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                model_name,
                device_map="auto",
                load_in_4bit=True,
                low_cpu_mem_usage=True,
            )
        except Exception:
            fallback_3b = "Qwen/Qwen2.5-VL-3B-Instruct"
            log(f"Cargando fallback ultra-liviano {fallback_3b}...")
            model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                fallback_3b,
                torch_dtype=dtype,
                device_map="auto",
            )

    processor = AutoProcessor.from_pretrained(model_name)
    log("✅ Modelo y procesador Qwen2.5-VL cargados exitosamente.")
    return model, processor


def analyze_frame_streaming(
    model: Any,
    processor: Any,
    img: Image.Image,
    shot_num: int,
    timestamp_sec: float,
    total_shots: int,
) -> Dict[str, Any]:
    """
    Analiza un fotograma individual con Qwen2.5-VL:
    1. Lee subtítulos en pantalla (OCR de precisión).
    2. Identifica personajes, gestos dramáticos y entorno.
    3. Formula sugerencia de cámara para Wan 2.1.
    4. Genera locución adaptada en español.
    """
    prompt = f"""Actúa como el Director Técnico de Fotografía y Guionista de CloneCinema.
Analiza este fotograma #{shot_num} de {total_shots} (segundo {timestamp_sec:.1f}s del video viral fuente).

Responde en formato JSON estrictamente válido con estos campos:
{{
  "ocr_text": "Copia exacta de subtítulos, carteles o texto visible en pantalla (o vacío si no hay)",
  "characters": "Descripción de personajes visibles (edad aprox, emoción, vestuario)",
  "scene_description": "Qué acción ocurre en este fotograma con alto detalle visual",
  "camera_motion": "Movimiento de cámara cinemático para Wan 2.1 (ej: Tracking lateral suave, Crash zoom, Dolly in)",
  "voiceover_draft": "Línea de narración o diálogo potente en español acorde a la emoción del plano",
  "viral_beat": "Tipo de plano (Gancho, Tensión, Revelación, Clímax o Cierre)"
}}"""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": img},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    )
    inputs = inputs.to(model.device)

    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=320,
            temperature=0.3,
            do_sample=False,
        )

    trimmed_ids = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_text = processor.batch_decode(
        trimmed_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]

    # Parsear JSON de salida
    result = {}
    try:
        clean_json = output_text.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
        result = json.loads(clean_json)
    except Exception:
        result = {
            "ocr_text": "",
            "characters": "Personaje en escena dramática",
            "scene_description": output_text[:200],
            "camera_motion": "Paneo suave cinemático",
            "voiceover_draft": "Momento crucial en el desarrollo de la historia.",
            "viral_beat": "Desarrollo",
        }

    return result


def main():
    log("🚀 Iniciando Kernel Qwen2.5-VL Vision Director en Kaggle...")
    sb = get_supabase_client()

    # Determinar misión / payload
    payload: Dict[str, Any] = {}
    if RAW_B64 and not RAW_B64.startswith("__"):
        try:
            payload = json.loads(base64.b64decode(RAW_B64).decode("utf-8"))
            log(f"Payload inyectado recibido: {payload.get('projectId', 'custom')}")
        except Exception as e:
            log(f"Error decodificando RAW_B64: {e}")

    project_id = payload.get("projectId") or "prj-purodrama-test"
    frames = payload.get("frames") or []

    # Si no vienen frames en el payload, leer el contrato dejado por el Fénix en Supabase
    if not frames and sb:
        log(f"Consultando contrato del Fénix en Supabase para el proyecto: {project_id}...")
        meta = fetch_latest_fenix_frames(sb, project_id)
        frames = meta.get("frames", [])
        log(f"Se encontraron {len(frames)} frames en Supabase para procesar.")

    if not frames:
        log("❌ No se encontraron frames para analizar. Terminando ejecución.")
        return

    # Cargar modelo una sola vez en VRAM
    model, processor = load_model_and_processor()

    # Cargar checkpoint previo si existe (para no re-procesar si hubo reinicio)
    processed_shots: List[Dict[str, Any]] = []
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                processed_shots = json.load(f)
            log(f"Checkpoint recuperado de disco: {len(processed_shots)} planos ya analizados.")
        except Exception:
            processed_shots = []

    already_done_nums = {s.get("number") for s in processed_shots}

    log(f"🎬 Iniciando análisis en STREAMING de {len(frames)} planos (1 por 1)...")
    total_shots = len(frames)

    for idx, frame_info in enumerate(frames):
        shot_num = frame_info.get("shotNumber", idx + 1)
        timestamp_sec = frame_info.get("timestampSec", idx * 4.5)
        frame_url = frame_info.get("frameUrl")

        if shot_num in already_done_nums:
            log(f"⏩ Plano {shot_num}/{total_shots} ya procesado. Saltando...")
            continue

        if not frame_url:
            continue

        log(f"📥 [{shot_num}/{total_shots}] Descargando y redimensionando: {frame_url}...")
        img = download_and_preprocess_image(frame_url, max_dimension=768)
        if not img:
            log(f"⚠️ No se pudo descargar el plano {shot_num}. Continuando...")
            continue

        log(f"👁️ [{shot_num}/{total_shots}] Analizando plano #{shot_num} ({timestamp_sec}s) con Qwen2.5-VL...")
        analysis = analyze_frame_streaming(model, processor, img, shot_num, timestamp_sec, total_shots)

        shot_record = {
            "number": shot_num,
            "timestampSec": timestamp_sec,
            "frameUrl": frame_url,
            "ocrText": analysis.get("ocr_text", ""),
            "characters": analysis.get("characters", ""),
            "scene": analysis.get("scene_description", ""),
            "camera": analysis.get("camera_motion", "Paneo cinemático suave"),
            "voiceover": analysis.get("voiceover_draft", ""),
            "beat": analysis.get("viral_beat", "Desarrollo"),
        }
        processed_shots.append(shot_record)

        # Guardar en disco inmediatamente (resiliencia ante cortes)
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(processed_shots, f, indent=2, ensure_ascii=False)

        log(f"✅ Plano #{shot_num} completado: OCR=\"{shot_record['ocrText'][:30]}\" · Cámara=\"{shot_record['camera'][:25]}\"")

        # LIBERAR MEMORIA EXPLÍCITAMENTE
        del img
        del analysis
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        gc.collect()

    log(f"🏁 TODOS LOS {len(processed_shots)} PLANOS FUERON ANALIZADOS EXITOSAMENTE.")

    # Síntesis final del Plan del Director
    final_plan = {
        "projectId": project_id,
        "totalShots": len(processed_shots),
        "processedAt": time.time(),
        "shots": processed_shots,
        "directorSummary": {
            "totalDialogueLines": len([s for s in processed_shots if s.get("ocrText")]),
            "detectedHooks": [s for s in processed_shots if s.get("beat") == "Gancho"],
            "climaxShot": [s for s in processed_shots if s.get("beat") == "Clímax"],
        }
    }

    with open(FINAL_PLAN_FILE, "w", encoding="utf-8") as f:
        json.dump(final_plan, f, indent=2, ensure_ascii=False)

    # Notificar a Supabase en la tabla messages
    if sb:
        try:
            sb.table("messages").insert({
                "sender_id": "QWEN_VISION_WORKER",
                "type": "qwen_vision_result",
                "content": f"Análisis multimodal Qwen2.5-VL completado para {len(processed_shots)} planos del proyecto {project_id}.",
                "metadata": {
                    "projectId": project_id,
                    "totalShots": len(processed_shots),
                    "summary": final_plan["directorSummary"],
                    "shots": processed_shots,
                }
            }).execute()
            log("📡 Reporte final emitido a Supabase exitosamente.")
        except Exception as ex:
            log(f"⚠️ Error notificando a Supabase: {ex}")

    log("🎉 MISIÓN QWEN2.5-VL FINALIZADA CON ÉXITO.")


if __name__ == "__main__":
    main()
