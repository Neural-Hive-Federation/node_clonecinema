"""
CloneCinema — Voice & Audio Engine.
Genera locuciones neuronales con entonación humana natural en español usando Edge-TTS (v7.3.1).
Permite mezclar voz con música de fondo (BGM) con ducking automático usando FFmpeg.
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()

VOICES = {
    "salome": "es-CO-SalomeNeural",     # Femenina cálida y cercana (Colombia)
    "gonzalo": "es-CO-GonzaloNeural",   # Masculina enérgica y confiable (Colombia)
    "alvaro": "es-ES-AlvaroNeural",     # Masculina épica y profunda (España)
    "dalia": "es-MX-DaliaNeural",       # Femenina versátil y dulce (México)
    "elvira": "es-ES-ElviraNeural"      # Femenina formal y cinematográfica (España)
}


async def generate_voice_async(text: str, voice_name: str, output_path: str, rate: str = "+0%", pitch: str = "+0Hz"):
    """Genera el archivo de audio MP3 usando Edge-TTS."""
    voice = VOICES.get(voice_name.lower(), voice_name)
    print(f"🎙️ [Voice Engine] Sintetizando voz '{voice}' para texto ({len(text)} chars)...")
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(output_path)
    print(f"✅ [Voice Engine] Audio generado con éxito en: {output_path}")


def generate_voice(text: str, voice_name: str = "salome", output_path: str = "voiceover.mp3", rate: str = "+0%", pitch: str = "+0Hz") -> str:
    """Función síncrona envoltorio para CLI y scripts."""
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    asyncio.run(generate_voice_async(text, voice_name, output_path, rate=rate, pitch=pitch))
    return output_path


def mix_voice_and_bgm(voice_path: str, bgm_path: str, output_path: str, bgm_volume: float = 0.15) -> str:
    """
    Mezcla la locución con la música de fondo utilizando FFmpeg.
    Ajusta el volumen del BGM para que no opaque la voz y corta al final de la voz.
    """
    print(f"🎵 [Audio Mixer] Mezclando voz ({voice_path}) con música ({bgm_path})...")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    # Filtro complejo: baja el volumen del BGM, mezcla ambas pistas y ajusta duración al audio de voz
    filter_complex = f"[1:a]volume={bgm_volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"

    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", voice_path,
        "-i", bgm_path,
        "-filter_complex", filter_complex,
        "-map", "[aout]",
        "-c:a", "libmp3lame",
        "-q:a", "2",
        output_path
    ]

    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"✅ [Audio Mixer] Audio master final ensamblado en: {output_path}")
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python voice_audio_engine.py <texto> [voz: salome|gonzalo|alvaro|dalia] [output.mp3]")
        sys.exit(1)

    txt = sys.argv[1]
    vc = sys.argv[2] if len(sys.argv) > 2 else "salome"
    out = sys.argv[3] if len(sys.argv) > 3 else "output_voice.mp3"

    res = generate_voice(txt, voice_name=vc, output_path=out)
    print(f"Archivo listo: {res} ({os.path.getsize(res)} bytes)")
