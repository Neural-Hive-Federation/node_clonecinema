"""
CloneCinema — Video Vision Deconstructor (El Ojo Analizador).
Deconstruye videos virales (TikTok, Reels, Shorts) extrayendo su ADN dramático,
ritmo de cortes, guion y protagonistas, generando propuestas para Playground v2.5 y Wan 2.1.
Utiliza el SDK oficial google-genai con fallback automático de modelos.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg
from google import genai
from PIL import Image

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()


def get_api_key() -> str:
    # 1. Variable de entorno
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key

    # 2. Archivo .env en CloneCinema
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip('"\'')

    # 3. Archivo coretextil .env.local
    core_env = Path("C:/Users/Usuario/Documents/coretextil/.env.local")
    if core_env.exists():
        for line in core_env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip('"\'')

    return ""


def download_or_locate_video(video_source: str, work_dir: str) -> str:
    """Descarga con yt-dlp si es URL o retorna la ruta si es local."""
    if video_source.startswith("http://") or video_source.startswith("https://"):
        print(f"📥 [yt-dlp] Descargando video desde: {video_source}...")
        import yt_dlp
        out_template = os.path.join(work_dir, "source_video.%(ext)s")
        ydl_opts = {
            "format": "mp4/bestvideo+bestaudio/best",
            "outtmpl": out_template,
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_source])

        # Buscar el archivo descargado
        for f in os.listdir(work_dir):
            if f.startswith("source_video."):
                return os.path.join(work_dir, f)
        raise RuntimeError("No se pudo localizar el archivo descargado por yt-dlp.")
    else:
        if not os.path.exists(video_source):
            raise FileNotFoundError(f"Video no encontrado: {video_source}")
        return video_source


def extract_frames(video_path: str, work_dir: str, interval_sec: float = 2.0) -> list[str]:
    """Extrae fotogramas clave a intervalos fijos usando FFmpeg."""
    print(f"🎞️ [FFmpeg] Extrayendo fotogramas cada {interval_sec}s...")
    frames_dir = os.path.join(work_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    out_pattern = os.path.join(frames_dir, "frame_%03d.jpg")

    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", video_path,
        "-vf", f"fps=1/{interval_sec}",
        "-q:v", "2",
        out_pattern
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    extracted = sorted([
        os.path.join(frames_dir, f)
        for f in os.listdir(frames_dir)
        if f.startswith("frame_") and f.endswith(".jpg")
    ])
    print(f"✅ [FFmpeg] {len(extracted)} fotogramas extraídos.")
    return extracted


def analyze_with_gemini(frame_paths: list[str], target_theme: str = "Frutifresa") -> dict:
    """Envía los fotogramas clave a Gemini Vision para el despiece forense del video."""
    api_key = get_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY no encontrada.")

    client = genai.Client(api_key=api_key)

    print(f"🧠 [Gemini Vision] Analizando {len(frame_paths)} fotogramas para despiece dramático...")
    
    # Abrir y copiar en memoria para no bloquear archivos en Windows
    pil_images = []
    for fp in frame_paths[:12]:
        with Image.open(fp) as img:
            pil_images.append(img.copy())

    prompt = f"""
Eres el "Video Vision Deconstructor" del sistema CloneCinema.
Tu misión es deconstruir este video viral cuadro a cuadro para permitir clonar su estructura dramática, ritmo, guion y retención pero cambiando el protagonista a: "{target_theme}".

Analiza los fotogramas ordenados cronológicamente y devuelve un JSON ESTRICTO con la siguiente estructura:

{{
  "viral_dna": {{
    "hook_type": "disrupcion visual / intriga / pregunta / accion dinamica",
    "retention_mechanism": "explicacion de por que retiene la atencion en los primeros 3 segundos",
    "emotional_curve": "intriga -> sorpresa -> satisfaccion / climax",
    "estimated_pace": "rapido / medio / pausado"
  }},
  "shot_list": [
    {{
      "shot_number": 1,
      "approx_timestamp": "0.0s - 2.5s",
      "shot_type": "Primer plano / Plano medio / Plano general",
      "camera_motion": "Zoom in lento / Estatica / Paneo dinámico / Tilt",
      "action_description": "Que hace el protagonista en esta toma",
      "wan_prompt": "Prompt cinematografico en ingles optimizado para Wan 2.1 I2V describiendo el movimiento y la atmosfera con el nuevo personaje {target_theme}"
    }}
  ],
  "protagonist_casting": {{
    "original_protagonist": "Descripcion del personaje en el video fuente",
    "target_protagonist": "{target_theme}",
    "playground_prompts": [
      {{
        "option_id": 1,
        "name": "Variacion 1: Clasica / Iconica",
        "prompt": "Prompt cinematografico detallado en ingles para Playground v2.5 en formato 9:16 con iluminacion de estudio",
        "negative_prompt": "ugly, deformed, noisy, blurry, distorted, low quality"
      }},
      {{
        "option_id": 2,
        "name": "Variacion 2: Dinamica / Accion",
        "prompt": "Prompt cinematografico con accion, aura o expresion intensa para Playground v2.5",
        "negative_prompt": "ugly, deformed, noisy, blurry, distorted, low quality"
      }},
      {{
        "option_id": 3,
        "name": "Variacion 3: Epica / Iluminacion Cinematografica",
        "prompt": "Prompt con iluminacion volumetrica y acabado hiperrealista para Playground v2.5",
        "negative_prompt": "ugly, deformed, noisy, blurry, distorted, low quality"
      }}
    ]
  }},
  "adapted_script": {{
    "suggested_voice": "salome",
    "dialogues": [
      {{
        "scene": 1,
        "text": "Texto del guion adaptado para esta escena en espanol neutro y atractivo."
      }}
    ],
    "full_voiceover_text": "Texto completo continuo para enviar al motor de voz TTS."
  }}
}}

RESPONDE UNICAMENTE CON EL JSON VALIDO SIN BLOQUES DE MARKDOWN.
"""

    models_to_try = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash"]
    last_err = None
    for model_name in models_to_try:
        try:
            print(f"🔄 Intentando con {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=[prompt, *pil_images]
            )
            raw_text = response.text.strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

            return json.loads(raw_text.strip())
        except Exception as e:
            last_err = e
            print(f"⚠️ {model_name} falló: {e}")

    raise last_err


def deconstruct_video(video_source: str, target_theme: str = "Frutifresa", output_json: str = None) -> dict:
    """Función principal que ejecuta todo el flujo del Deconstructor."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_file = download_or_locate_video(video_source, tmp_dir)
        frames = extract_frames(video_file, tmp_dir, interval_sec=2.0)
        result = analyze_with_gemini(frames, target_theme=target_theme)

        if output_json:
            os.makedirs(os.path.dirname(os.path.abspath(output_json)), exist_ok=True)
            with open(output_json, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"✅ [Deconstructor] ADN del video guardado en: {output_json}")

        return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python video_vision_deconstructor.py <video_path_o_url> [tema_objetivo] [output.json]")
        sys.exit(1)

    src = sys.argv[1]
    theme = sys.argv[2] if len(sys.argv) > 2 else "Frutifresa"
    out = sys.argv[3] if len(sys.argv) > 3 else "output_deconstruction.json"

    res = deconstruct_video(src, target_theme=theme, output_json=out)
    print("\n" + "=" * 50)
    print("🎯 RESUMEN DE LA DECONSTRUCCIÓN FORENSE")
    print("=" * 50)
    print(f"Hook Detectado: {res.get('viral_dna', {}).get('hook_type')}")
    print(f"Mecanismo de Retención: {res.get('viral_dna', {}).get('retention_mechanism')}")
    print(f"Planos Desglosados: {len(res.get('shot_list', []))}")
    print(f"Variaciones de Personaje: {len(res.get('protagonist_casting', {}).get('playground_prompts', []))}")
    print(f"Guion Adaptado: {res.get('adapted_script', {}).get('full_voiceover_text')[:100]}...")
    print("=" * 50)
