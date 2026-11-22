import React, { useState, useRef } from "react";
import { AudioLines, Clock, Music4, Play, Volume2, Sparkles, CheckCircle2, AlertTriangle, Upload, Wand2 } from "lucide-react";
import type { Project, ProjectUpdater, Shot } from "../../types";
import { generateSpeech } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import { VOICES } from "../../lib/project";
import { MUSIC_PRESETS, type MusicTrackPreset } from "../../data/musicTracks";
import { Field, Section, Spinner } from "../ui";

export function AudioTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [busyGlobal, setBusyGlobal] = useState(false);
  const [loadingShotIds, setLoadingShotIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Subir pista propia a Supabase Storage (Bucket: audio/bgm)
  async function handleBgmUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBgm(true);
    setError(null);
    try {
      const supabase = await getSupabase();
      if (!supabase) {
        const localUrl = URL.createObjectURL(file);
        setAudio({ music: file.name.replace(/\.[^/.]+$/, ""), musicUrl: localUrl });
        return;
      }
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `bgm/custom_${Date.now()}_${cleanName}`;
      const { error: upErr } = await supabase.storage.from("audio").upload(path, file, {
        contentType: file.type || "audio/mpeg",
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: pubData } = supabase.storage.from("audio").getPublicUrl(path);
      setAudio({
        music: file.name.replace(/\.[^/.]+$/, ""),
        musicUrl: pubData.publicUrl,
      });
    } catch (err: any) {
      setError(`Error subiendo música: ${err.message || err}`);
    } finally {
      setUploadingBgm(false);
      if (e.target) e.target.value = "";
    }
  }

  // Generar / Sintetizar atmósfera musical según el prompt con Gemini AI
  async function generateAiMusic() {
    setGeneratingMusic(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: project.audio.music,
          narration: project.audio.narration,
          shots: project.shots,
          availableTracks: MUSIC_PRESETS,
        }),
      });

      if (!res.ok) {
        throw new Error("No se pudo conectar con el Director de Música IA");
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Fallo en IA");

      const matched = MUSIC_PRESETS.find((p) => p.id === data.selectedTrackId) || MUSIC_PRESETS[0];

      setAudio({
        music: data.musicPrompt || `${matched.name} (${matched.genre}) - ${matched.description}`,
        bpm: data.bpm || matched.bpm,
        musicUrl: matched.previewUrl,
      });
    } catch (err: any) {
      // Fallback inteligente en caso de desconexión o red local
      const promptLower = (project.audio.music || "").toLowerCase();
      let matched = MUSIC_PRESETS[0];
      if (promptLower.includes("suspense") || promptLower.includes("tensión") || promptLower.includes("pulse")) {
        matched = MUSIC_PRESETS.find((p) => p.id === "viral-pulse") || matched;
      } else if (promptLower.includes("dark") || promptLower.includes("oscur") || promptLower.includes("epic") || promptLower.includes("trailer")) {
        matched = MUSIC_PRESETS.find((p) => p.id === "dark-trailer") || matched;
      } else if (promptLower.includes("lofi") || promptLower.includes("chill") || promptLower.includes("calm") || promptLower.includes("relax")) {
        matched = MUSIC_PRESETS.find((p) => p.id === "lofi-future") || matched;
      } else if (promptLower.includes("pop") || promptLower.includes("hit") || promptLower.includes("viral") || promptLower.includes("happy")) {
        matched = MUSIC_PRESETS.find((p) => p.id === "pop-viral") || matched;
      } else if (promptLower.includes("electro") || promptLower.includes("house") || promptLower.includes("dance")) {
        matched = MUSIC_PRESETS.find((p) => p.id === "electro-high") || matched;
      }

      setAudio({
        music: project.audio.music ? project.audio.music : `${matched.name} (${matched.genre}) - ${matched.description}`,
        bpm: matched.bpm,
        musicUrl: matched.previewUrl,
      });
    } finally {
      setGeneratingMusic(false);
    }
  }

  const setAudio = (partial: Partial<Project["audio"]>) =>
    patch((prev) => ({ audio: { ...prev.audio, ...partial } }));

  const updateShot = (shotId: string, partial: Partial<Shot>) =>
    patch((prev) => ({
      shots: (prev.shots || []).map((s) => (s.id === shotId ? { ...s, ...partial } : s)),
    }));

  // Generar narración global del proyecto
  async function narrateGlobal() {
    const textToSpeak = project.audio.narration.trim();
    if (!textToSpeak) {
      setError("Escribe primero la narración.");
      return;
    }
    setBusyGlobal(true);
    setError(null);
    try {
      const url = await generateSpeech(textToSpeak, project.audio.voice);
      setAudio({ narrationUrl: url });
    } catch (err: any) {
      setError(err?.message || "No se pudo generar la narración.");
    } finally {
      setBusyGlobal(false);
    }
  }

  // Generar voz individual para un plano específico
  async function narrateShot(shot: Shot) {
    const textToSpeak = (shot.voiceover || shot.dialogue || "").trim();
    if (!textToSpeak) {
      setError(`El Plano ${shot.number} no tiene texto de voz en off o diálogo.`);
      return;
    }
    setLoadingShotIds((prev) => [...prev, shot.id]);
    setError(null);
    try {
      const url = await generateSpeech(textToSpeak, project.audio.voice);
      updateShot(shot.id, { audioUrl: url });
    } catch (err: any) {
      setError(`Error en Plano ${shot.number}: ${err?.message || "Fallo al generar voz."}`);
    } finally {
      setLoadingShotIds((prev) => prev.filter((id) => id !== shot.id));
    }
  }

  // Generar todas las voces de los planos en lote
  async function narrateAllShots() {
    setError(null);
    for (const shot of (project.shots || [])) {
      const textToSpeak = (shot.voiceover || shot.dialogue || "").trim();
      if (!textToSpeak) continue;
      setLoadingShotIds((prev) => [...prev, shot.id]);
      try {
        const url = await generateSpeech(textToSpeak, project.audio.voice);
        updateShot(shot.id, { audioUrl: url });
      } catch (err: any) {
        console.error(`Error generando audio de Plano ${shot.number}:`, err);
      } finally {
        setLoadingShotIds((prev) => prev.filter((id) => id !== shot.id));
      }
    }
  }

  // Estimador de tiempo de lectura en español (aprox. 2.8 palabras/segundo)
  const estimateSpeechSeconds = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) return 0;
    return Math.max(1.5, Math.round((words / 2.7) * 10) / 10);
  };

  const selectedPreset = MUSIC_PRESETS.find(
    (p) => p.name.toLowerCase() === project.audio.music.toLowerCase() || project.audio.music.includes(p.name)
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        {/* Sección de Narración Global */}
        <Section
          title="Narración / voz en off maestra"
          subtitle="Guion general que unifica el tono de la pieza."
        >
          <textarea
            className="field min-h-[100px] resize-y text-[12px] leading-relaxed"
            value={project.audio.narration}
            onChange={(e) => setAudio({ narration: e.target.value })}
            placeholder="Escribe el guion de la voz en off global…"
          />
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Voz de narración">
              <select
                className="field"
                value={project.audio.voice}
                onChange={(e) => setAudio({ voice: e.target.value as Project["audio"]["voice"] })}
              >
                {VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn btn-primary h-[38px]" onClick={narrateGlobal} disabled={busyGlobal}>
              {busyGlobal ? <Spinner /> : <AudioLines size={14} />} Generar voz maestra
            </button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[11.5px] text-red-300">
              {error}
            </div>
          )}

          {project.audio.narrationUrl && (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-400">
                <Volume2 size={12} className="text-signal" /> Narración maestra generada
              </div>
              <audio controls src={project.audio.narrationUrl} className="w-full h-8" />
            </div>
          )}
        </Section>

        {/* Sección: Audios individuales por plano con coherencia temporal */}
        <Section
          title="Locución y Audios individuales por Plano"
          subtitle="Cada toma tiene su archivo de audio sincronizado con los segundos del video."
        >
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] text-zinc-400">
              {(project.shots || []).filter((s) => Boolean(s.audioUrl)).length} de {(project.shots || []).length} audios listos
            </span>
            <button
              onClick={narrateAllShots}
              className="text-[11px] font-semibold text-signal hover:underline flex items-center gap-1.5"
            >
              <Sparkles size={12} /> Generar todas las voces en lote
            </button>
          </div>

          {(project.shots || []).length === 0 ? (
            <p className="py-4 text-center text-[12px] text-zinc-600">Sin planos todavía en el Storyboard.</p>
          ) : (
            <div className="space-y-3">
              {(project.shots || []).map((s) => {
                const textLine = (s.voiceover || s.dialogue || "").trim();
                const estimatedSec = estimateSpeechSeconds(textLine);
                const shotSec = Number(s.seconds) || 3;
                const isOverDuration = estimatedSec > shotSec + 0.5;
                const isGenerating = loadingShotIds.includes(s.id);

                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      s.audioUrl
                        ? "border-emerald-500/30 bg-emerald-950/10"
                        : "border-zinc-800/80 bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-[12px] font-bold text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-md">
                          Plano {s.number}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                          <Clock size={10} /> Duración de plano: {shotSec}s
                        </span>
                      </div>

                      {/* Botón individual de generación */}
                      <button
                        onClick={() => narrateShot(s)}
                        disabled={isGenerating || !textLine}
                        className={`text-[10.5px] font-medium px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-colors ${
                          s.audioUrl
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                            : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-signal"
                        }`}
                      >
                        {isGenerating ? (
                          <>
                            <Spinner size={12} /> Generando…
                          </>
                        ) : s.audioUrl ? (
                          <>
                            <CheckCircle2 size={12} className="text-emerald-400" /> Regenerar voz
                          </>
                        ) : (
                          <>
                            <AudioLines size={12} /> Generar voz
                          </>
                        )}
                      </button>
                    </div>

                    {/* Texto del guion de este plano */}
                    <div className="mt-2 text-[12px] leading-relaxed text-zinc-200 font-medium">
                      {textLine ? (
                        `«${textLine}»`
                      ) : (
                        <span className="text-zinc-500 italic">Sin voz en off o diálogo asignado a este plano.</span>
                      )}
                    </div>

                    {/* Alerta de Coherencia Temporal del Director */}
                    {textLine && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          {isOverDuration ? (
                            <span className="text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                              <AlertTriangle size={11} /> Locución estimada: ~{estimatedSec}s (supera los {shotSec}s del plano)
                            </span>
                          ) : (
                            <span className="text-emerald-400/90 flex items-center gap-1">
                              <CheckCircle2 size={11} /> Tiempo calza perfecto: ~{estimatedSec}s de habla en {shotSec}s de plano
                            </span>
                          )}
                        </div>

                        {isOverDuration && (
                          <button
                            onClick={() => updateShot(s.id, { seconds: Math.ceil(estimatedSec) })}
                            className="text-[10px] font-semibold text-signal hover:underline"
                          >
                            + Ampliar plano a {Math.ceil(estimatedSec)}s
                          </button>
                        )}
                      </div>
                    )}

                    {/* Reproductor de Audio individual del plano */}
                    {s.audioUrl && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center gap-2">
                        <Volume2 size={13} className="text-emerald-400 shrink-0" />
                        <audio controls src={s.audioUrl} className="w-full h-7" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      <div className="space-y-5">
        {/* Sección de Música de Fondo con Preescucha */}
        <Section title="Música de fondo (BGM)" subtitle="Escucha y selecciona la banda sonora antes de renderizar.">
          <div className="flex items-center justify-between gap-2">
            <Field label="Presets de música sugeridos" className="flex-1">
              <select
                className="field"
                value={selectedPreset?.id || ""}
                onChange={(e) => {
                  const found = MUSIC_PRESETS.find((p) => p.id === e.target.value);
                  if (found) {
                    setAudio({
                      music: `${found.name} (${found.genre}) - ${found.description}`,
                      bpm: found.bpm,
                      musicUrl: found.previewUrl,
                    });
                  }
                }}
              >
                <option value="">Seleccionar pista de música…</option>
                {MUSIC_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.genre} ({p.bpm})
                  </option>
                ))}
              </select>
            </Field>

            {/* Input oculto y botón para subir MP3 propio a Supabase Storage */}
            <div className="pt-5">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="audio/mp3,audio/wav,audio/mpeg,audio/ogg"
                onChange={handleBgmUpload}
              />
              <button
                type="button"
                className="btn btn-secondary h-[38px] text-[11px] gap-1.5 whitespace-nowrap"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingBgm}
                title="Subir archivo MP3/WAV directamente a Supabase Storage"
              >
                {uploadingBgm ? <Spinner /> : <Upload size={13} className="text-emerald-400" />}
                {uploadingBgm ? "Subiendo…" : "Subir MP3"}
              </button>
            </div>
          </div>

          {/* Preescucha de Audio de la Música */}
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-300">
              <span className="flex items-center gap-1.5 font-semibold text-fuchsia-300">
                <Music4 size={13} /> Preescucha de pista
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{project.audio.bpm || "130 BPM"}</span>
            </div>
            <audio
              key={project.audio.musicUrl || selectedPreset?.previewUrl}
              controls
              src={project.audio.musicUrl || selectedPreset?.previewUrl || MUSIC_PRESETS[0].previewUrl}
              className="w-full h-8"
            />
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11.5px] font-medium text-zinc-300">Descripción / Prompt de la pista</span>
              <button
                type="button"
                onClick={generateAiMusic}
                disabled={generatingMusic}
                className="text-[10.5px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                title="Sintoniza o genera una atmósfera musical con IA"
              >
                <Sparkles size={11} /> {generatingMusic ? "Componiendo…" : "Generar con IA"}
              </button>
            </div>
            <textarea
              className="field min-h-[65px] resize-y text-[11.5px] leading-relaxed"
              value={project.audio.music}
              onChange={(e) => setAudio({ music: e.target.value })}
              placeholder="Ej: percusión seca, cuerdas graves, sintetizadores cyberpunk, silencio antes del clímax…"
            />
          </div>
        </Section>

        <Section title="Paleta de SFX" subtitle="Los sonidos que sostienen los cortes.">
          <div className="flex flex-wrap gap-1.5">
            {(project.audio?.sfxPalette || []).map((s, i) => (
              <span key={i} className="chip">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-3">
            <Field label="Separados por coma">
              <input
                className="field"
                value={(project.audio?.sfxPalette || []).join(", ")}
                onChange={(e) =>
                  setAudio({
                    sfxPalette: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
          </div>
        </Section>

        <Section title="Mezcla sugerida por el Director" subtitle="Regla técnica para video viral.">
          <ul className="space-y-2 text-[11.5px] leading-relaxed text-zinc-400">
            <li>· <strong>Voz:</strong> 3 dB por encima de la música; la música baja -6 dB durante la locución.</li>
            <li>· <strong>SFX:</strong> 1 frame antes de cada corte para disimular la transición de plano.</li>
            <li>· <strong>Ritmo:</strong> Sincronizar el golpe de corte visual con el BPM ({project.audio.bpm || "130 BPM"}).</li>
            <li>· <strong>Normalización:</strong> Master final a -14 LUFS para TikTok, Reels y Shorts.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
