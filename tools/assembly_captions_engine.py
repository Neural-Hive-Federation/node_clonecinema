"""
CloneCinema — Assembly & Auto-Captions Engine.
Ensambla y concatena clips de video (Wan 2.1), integra la pista de audio (Voice Engine)
y genera/quema subtítulos cinemáticos dinámicos estilo TikTok / Reels.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()


def create_ass_subtitles(dialogues: list[dict], output_ass_path: str, video_width: int = 768, video_height: int = 1344) -> str:
    """
    Genera un archivo de subtítulos en formato Advanced SubStation Alpha (.ass)
    con estilo viral moderno: tipografía negrita, borde negro grueso, color amarillo/blanco y posición en el tercio inferior.
    """
    font_size = int(video_height * 0.042)  # Proporcional a la resolución
    margin_v = int(video_height * 0.18)   # Espacio para no chocar con la UI de TikTok/Instagram

    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ViralYellow,Montserrat, {font_size}, &H0000FFFF, &H000000FF, &H00000000, &H80000000, -1, 0, 0, 0, 100, 100, 0, 0, 1, 4, 2, 2, 30, 30, {margin_v}, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    current_time = 0.0
    for idx, d in enumerate(dialogues):
        text = d.get("text", "").strip()
        if not text:
            continue
        duration = float(d.get("duration", max(2.0, len(text) * 0.065)))
        start_str = format_ass_time(current_time)
        end_str = format_ass_time(current_time + duration)
        
        # Palabras en mayúsculas estilo TikTok con salto de línea si es largo
        formatted_text = text.upper()
        events.append(f"Dialogue: 0,{start_str},{end_str},ViralYellow,,0,0,0,,{formatted_text}")
        current_time += duration

    full_ass = ass_header + "\n".join(events) + "\n"
    os.makedirs(os.path.dirname(os.path.abspath(output_ass_path)), exist_ok=True)
    with open(output_ass_path, "w", encoding="utf-8") as f:
        f.write(full_ass)

    print(f"📝 [Subtitles] Archivo ASS generado: {output_ass_path}")
    return output_ass_path


def format_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:01d}:{m:02d}:{s:05.2f}"


def concatenate_clips(clip_paths: list[str], output_path: str) -> str:
    """Concatena múltiples clips de video usando el demuxer concat de FFmpeg."""
    print(f"🎬 [Assembly] Concatenando {len(clip_paths)} clips de video...")
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as list_file:
        for p in clip_paths:
            normalized = Path(p).resolve().as_posix()
            list_file.write(f"file '{normalized}'\n")
        list_file_path = list_file.name

    try:
        cmd = [
            FFMPEG_EXE,
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file_path,
            "-c", "copy",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        print(f"✅ [Assembly] Clips concatenados con éxito en: {output_path}")
        return output_path
    finally:
        if os.path.exists(list_file_path):
            os.remove(list_file_path)


def assemble_master_video(
    video_clips: list[str],
    audio_path: str,
    dialogues: list[dict],
    output_path: str,
    burn_subtitles: bool = True
) -> str:
    """
    Función maestra que:
    1. Concatena los clips de Wan 2.1.
    2. Acopla el audio master.
    3. Genera y quema los subtítulos dinámicos estilo TikTok.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        # 1. Concatenar clips de video
        concat_video = os.path.join(tmp_dir, "concat_temp.mp4")
        if len(video_clips) == 1:
            concat_video = video_clips[0]
        else:
            concatenate_clips(video_clips, concat_video)

        # 2. Generar subtítulos si se requieren
        ass_path = None
        if burn_subtitles and dialogues:
            ass_path = os.path.join(tmp_dir, "subtitles.ass")
            create_ass_subtitles(dialogues, ass_path)

        # 3. Ensamble final con audio y subtítulos
        print(f"🚀 [Master Assembly] Ensamblando video master final con audio y subtítulos...")
        
        cmd = [FFMPEG_EXE, "-y", "-i", concat_video]
        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path])
        
        if ass_path and os.path.exists(ass_path):
            # Usar ruta relativa simple o escapar para Windows
            rel_ass = os.path.relpath(ass_path).replace("\\", "/")
            cmd.extend(["-vf", f"subtitles='{rel_ass}'"])
            cmd.extend(["-c:v", "libx264", "-crf", "18", "-preset", "fast"])
        else:
            cmd.extend(["-c:v", "copy"])

        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest"])
        else:
            cmd.extend(["-c:a", "copy"])

        cmd.append(output_path)
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        print(f"🎉 [CloneCinema] Video master 100% finalizado en: {output_path}")
        return output_path


if __name__ == "__main__":
    print("CloneCinema Assembly & Auto-Captions Engine listo.")
