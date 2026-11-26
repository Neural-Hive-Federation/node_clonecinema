import React, { useState, useRef } from "react";
import { AudioLines, Clock, Music4, Play, Volume2, Sparkles, CheckCircle2, AlertTriangle, Upload, Wand2, ListFilter, Check, X, ChevronDown, CheckSquare, Square, StopCircle, Sliders } from "lucide-react";
import type { Project, ProjectUpdater, Shot } from "../../types";
import { generateSpeech } from "../../lib/api";
import { getSupabase } from "../../lib/supabase";
import { VOICES } from "../../lib/project";
import { MUSIC_PRESETS, type MusicTrackPreset } from "../../data/musicTracks";
import { Field, Section, Spinner } from "../ui";
import { CHARACTER_VOICE_CATALOG, PITCH_PRESETS, getPitchTag, getVoiceLabel } from "../../lib/voices";

export function AudioTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [busyGlobal, setBusyGlobal] = useState(false);
  const [busyTestVoice, setBusyTestVoice] = useState(false);
  const [loadingShotIds, setLoadingShotIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBgm, setUploadingBgm] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estados para selección y generación por lote de audios
  const [selectedForBatch, setSelectedForBatch] = useState<string[]>([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const abortBulkRef = useRef(false);

  const toggleShotSelection = (shotId: string) => {
    setSelectedForBatch((prev) =>
      prev.includes(shotId) ? prev.filter((id) => id !== shotId) : [...prev, shotId]
    );
  };

  const selectAllShots = () => {
    setSelectedForBatch((project.shots || []).map((s) => s.id));
  };

  const selectEmptyShots = () => {
    setSelectedForBatch((project.shots || []).filter((s) => !s.audioUrl).map((s) => s.id));
  };

  const clearSelection = () => {
    setSelectedForBatch([]);
  };

  // Sincronizar guion maestro unificado a partir de los textos de cada plano
  function syncNarrationFromShots() {
    const lines = (project.shots || [])
      .map((s) => (s.voiceover || s.dialogue || "").trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setError("Los planos aún no tienen diálogos ni voz en off para compilar.");
      return;
    }

    const unified = lines.join(" ");
    setAudio({ narration: unified });
    setError(null);
  }

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

  // Probar muestra de voz maestra con modulación de pitch
  async function handleTestMasterVoice() {
    const voice = project.audio.voice || "es-CO-GonzaloNeural";
    const pitch = project.audio.voicePitch ?? 0;
    setBusyTestVoice(true);
    setError(null);
    try {
      const sampleText =
        project.audio.narration.slice(0, 80).trim() ||
        "CloneCinema. Prueba de modulación y tono para la narración maestra del proyecto.";
      const audioUrl = await generateSpeech(sampleText, voice, { pitch });
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (err: any) {
      setError(err?.message || "Error al probar muestra de voz maestra.");
    } finally {
      setBusyTestVoice(false);
    }
  }

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
      const url = await generateSpeech(textToSpeak, project.audio.voice, {
        pitch: project.audio.voicePitch ?? 0,
        rate: project.audio.voiceRate ?? 1.0,
      });
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
      const character =
        project.characters?.find((c) => c.id === shot.characterId) ||
        project.characters?.find((c) => {
          const firstWord = c.name.toLowerCase().split(" ")[0];
          return (
            firstWord.length >= 3 &&
            `${shot.dialogue || ""} ${shot.voiceover || ""} ${shot.title || ""}`
              .toLowerCase()
              .includes(firstWord)
          );
        });
      const voiceToUse = character?.voiceId || project.audio.voice;
      const pitchToUse = character?.voicePitch ?? 0;
      const rateToUse = character?.voiceRate ?? 1.0;
      const url = await generateSpeech(textToSpeak, voiceToUse, {
        pitch: pitchToUse,
        rate: rateToUse,
        characterName: character?.name,
        role: character?.role,
      });
      updateShot(shot.id, { audioUrl: url });
    } catch (err: any) {
      setError(`Error en Plano ${shot.number}: ${err?.message || "Fallo al generar voz."}`);
    } finally {
      setLoadingShotIds((prev) => prev.filter((id) => id !== shot.id));
    }
  }

  // Generar voces seleccionadas o todas en lote de forma secuencial y ordenada
  async function narrateBatch(targetIds?: string[]) {
    const ids = targetIds || (selectedForBatch.length > 0 ? selectedForBatch : (project.shots || []).map((s) => s.id));
    const targetShots = (project.shots || [])
      .filter((s) => ids.includes(s.id))
      .sort((a, b) => a.number - b.number);

    if (targetShots.length === 0) return;

    setBulkGenerating(true);
    abortBulkRef.current = false;
    setError(null);

    let count = 0;
    for (const shot of targetShots) {
      if (abortBulkRef.current) break;
      const textToSpeak = (shot.voiceover || shot.dialogue || "").trim();
      if (!textToSpeak) continue;

      count++;
      setBulkProgress({
        current: count,
        total: targetShots.length,
        title: `Plano ${shot.number}: "${shot.title || textToSpeak.slice(0, 25)}..."`
      });

      setLoadingShotIds((prev) => [...prev, shot.id]);
      try {
        const character =
          project.characters?.find((c) => c.id === shot.characterId) ||
          project.characters?.find((c) => {
            const firstWord = c.name.toLowerCase().split(" ")[0];
            return (
              firstWord.length >= 3 &&
              `${shot.dialogue || ""} ${shot.voiceover || ""} ${shot.title || ""}`
                .toLowerCase()
                .includes(firstWord)
            );
          });
        const voiceToUse = character?.voiceId || project.audio.voice;
        const pitchToUse = character?.voicePitch ?? 0;
        const rateToUse = character?.voiceRate ?? 1.0;
        const url = await generateSpeech(textToSpeak, voiceToUse, {
          pitch: pitchToUse,
          rate: rateToUse,
          characterName: character?.name,
          role: character?.role,
        });
        updateShot(shot.id, { audioUrl: url });
      } catch (err: any) {
        console.error(`Error generando audio de Plano ${shot.number}:`, err);
      } finally {
        setLoadingShotIds((prev) => prev.filter((id) => id !== shot.id));
      }
    }

    setBulkGenerating(false);
    setBulkProgress(null);
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
          action={
            <button
              type="button"
              onClick={syncNarrationFromShots}
              className="btn btn-ghost text-[11px] border border-signal/40 bg-signal/10 text-signal hover:bg-signal/20 flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Compilar y acoplar el guion maestro automáticamente a partir de los textos de los 19 planos"
            >
              <Wand2 size={12} /> Acoplar con los planos ({project.shots.length})
            </button>
          }
        >
          <textarea
            className="field min-h-[100px] resize-y text-[12px] leading-relaxed"
            value={project.audio.narration}
            onChange={(e) => setAudio({ narration: e.target.value })}
            placeholder="Escribe el guion de la voz en off global…"
          />
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Voz de narración">
                <select
                  className="field"
                  value={project.audio.voice}
                  onChange={(e) => setAudio({ voice: e.target.value as Project["audio"]["voice"] })}
                >
                  <optgroup label="✨ Voces Femeninas">
                    {CHARACTER_VOICE_CATALOG.filter((v) => v.gender === "female").map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.flag} {v.name} ({v.country}) — {v.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🎩 Voces Masculinas">
                    {CHARACTER_VOICE_CATALOG.filter((v) => v.gender === "male").map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.flag} {v.name} ({v.country}) — {v.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="👶 Voces Infantiles & Juveniles">
                    {CHARACTER_VOICE_CATALOG.filter((v) => v.gender === "child").map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.flag} {v.name} — {v.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="👴 Voces de Ancianos / Sabios">
                    {CHARACTER_VOICE_CATALOG.filter((v) => v.gender === "elder").map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.flag} {v.name} — {v.description}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🔮 Voces Clásicas Gemini">
                    {VOICES.map((v) => (
                      <option key={v} value={v}>
                        ✨ {v} (Gemini)
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>

              <button
                type="button"
                className="btn btn-ghost h-[38px] border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs flex items-center gap-1.5 px-3 cursor-pointer"
                disabled={busyTestVoice}
                onClick={handleTestMasterVoice}
                title="Escuchar una muestra con esta voz y modulación"
              >
                {busyTestVoice ? <Spinner /> : <Volume2 size={13} className="text-signal" />}
                <span>{busyTestVoice ? "Probando..." : "Probar"}</span>
              </button>

              <button className="btn btn-primary h-[38px]" onClick={narrateGlobal} disabled={busyGlobal}>
                {busyGlobal ? <Spinner /> : <AudioLines size={14} />} Generar voz maestra
              </button>
            </div>

            {/* Modulador de Tono (Pitch) para Narración Maestra */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                  <Sliders size={11} className="text-signal" /> Modulador de Tono (Pitch):
                </span>
                <span className={`font-mono font-bold ${getPitchTag(project.audio.voicePitch ?? 0).color}`}>
                  {getPitchTag(project.audio.voicePitch ?? 0).label} ({(project.audio.voicePitch ?? 0) > 0 ? `+${project.audio.voicePitch}%` : `${project.audio.voicePitch ?? 0}%`})
                </span>
              </div>
              <input
                type="range"
                min="-25"
                max="40"
                step="1"
                className="w-full accent-lime-400 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                value={project.audio.voicePitch ?? 0}
                onChange={(e) => setAudio({ voicePitch: parseInt(e.target.value, 10) })}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PITCH_PRESETS.map((p) => {
                  const isSelected = (project.audio.voicePitch ?? 0) === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      className={`text-[9.5px] px-2 py-0.5 rounded border transition cursor-pointer ${
                        isSelected
                          ? "border-signal bg-signal/20 text-signal font-bold shadow-xs"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                      }`}
                      onClick={() => setAudio({ voicePitch: p.value })}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`btn btn-ghost text-[11.5px] border flex items-center gap-1.5 transition ${
                  selectedForBatch.length > 0
                    ? "border-signal/50 bg-signal/15 text-signal hover:bg-signal/25 font-semibold shadow-xs"
                    : "border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white"
                }`}
                onClick={() => setShowBatchModal(true)}
                title="Selecciona planos específicos para generar voces en lote"
              >
                <ListFilter size={13} className={selectedForBatch.length > 0 ? "text-signal" : "text-zinc-400"} />
                <span>
                  {selectedForBatch.length > 0 ? `Lote (${selectedForBatch.length} seleccionados)` : "Seleccionar lote"}
                </span>
                <ChevronDown size={11} className={selectedForBatch.length > 0 ? "text-signal" : "text-zinc-500"} />
              </button>

              {selectedForBatch.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary text-[11.5px] border border-signal/50 bg-signal/25 text-signal hover:bg-signal hover:text-black font-bold flex items-center gap-1.5 shadow-md cursor-pointer transition-all"
                    onClick={() => narrateBatch(selectedForBatch)}
                    disabled={bulkGenerating}
                    title={`Generar voces únicamente para los ${selectedForBatch.length} planos seleccionados`}
                  >
                    {bulkGenerating ? <Spinner size={13} /> : <Sparkles size={13} />}
                    <span>✨ Generar selección ({selectedForBatch.length})</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-[11px] text-zinc-500 hover:text-red-400 px-2 py-1 border border-zinc-800/80 hover:border-red-500/30 rounded-lg transition"
                    onClick={clearSelection}
                    title="Deseleccionar todos los planos"
                  >
                    <X size={12} /> Desmarcar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => narrateBatch()}
                  disabled={bulkGenerating}
                  className="btn btn-ghost text-[11px] border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                  title="Generar todas las voces en lote"
                >
                  <Sparkles size={12} className="text-signal" /> Generar todas ({project.shots.length})
                </button>
              )}
            </div>
          }
        >
          {bulkGenerating && bulkProgress && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-signal/50 bg-signal/10 p-3 shadow-md animate-in fade-in">
              <div className="flex items-center gap-3">
                <Spinner size={16} />
                <div>
                  <div className="text-[12px] font-bold text-white flex items-center gap-2">
                    <span>Generando lote de voces... ({bulkProgress.current} de {bulkProgress.total})</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate max-w-md">
                    {bulkProgress.title}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { abortBulkRef.current = true; }}
                className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer"
              >
                <StopCircle size={13} /> Detener lote
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pb-1 text-[11px] text-zinc-400">
            <span>
              {(project.shots || []).filter((s) => Boolean(s.audioUrl)).length} de {(project.shots || []).length} audios listos
            </span>
            {selectedForBatch.length > 0 && (
              <span className="text-signal font-semibold">
                {selectedForBatch.length} marcados para lote
              </span>
            )}
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
                const isChecked = selectedForBatch.includes(s.id);

                return (
                  <div
                    key={s.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      isChecked
                        ? "border-signal/50 bg-signal/5 ring-1 ring-signal/20"
                        : s.audioUrl
                        ? "border-emerald-500/30 bg-emerald-950/10"
                        : "border-zinc-800/80 bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          onClick={() => toggleShotSelection(s.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition cursor-pointer ${
                            isChecked
                              ? "bg-signal text-black border-signal shadow-xs"
                              : "border-zinc-700 bg-zinc-800/60 text-transparent hover:border-zinc-500"
                          }`}
                          title="Marcar / desmarcar para lote"
                        >
                          <Check size={12} className="stroke-[3]" />
                        </div>

                        <span className="font-display text-[12px] font-bold text-zinc-300 bg-zinc-800/80 px-2 py-0.5 rounded-md">
                          Plano {s.number}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                          <Clock size={10} /> Duración de plano: {shotSec}s
                        </span>
                        {/* Indicador de Actor y Voz */}
                        {(() => {
                          const char = project.characters?.find((c) => c.id === s.characterId);
                          if (char) {
                            return (
                              <span className="text-[10px] text-zinc-300 bg-zinc-900 border border-zinc-700/80 px-2 py-0.5 rounded flex items-center gap-1">
                                <span>🎭 {char.name}</span>
                                <span className="text-zinc-500">·</span>
                                <span className="text-signal font-semibold">{getVoiceLabel(char.voiceId)}</span>
                                <span className="font-mono text-zinc-400">
                                  ({(char.voicePitch ?? 0) > 0 ? `+${char.voicePitch}%` : `${char.voicePitch ?? 0}%`})
                                </span>
                              </span>
                            );
                          }
                          return (
                            <span className="text-[10px] text-zinc-400 bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800">
                              🎙️ Narrador ({project.audio.voice})
                            </span>
                          );
                        })()}
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

      {/* Modal de Selección de Lote de Voces */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-signal/30 bg-signal/10 text-signal shadow-inner">
                  <Volume2 size={18} />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                    Generación de Lote de Voces
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-normal text-zinc-400">
                      {project.shots.length} planos disponibles
                    </span>
                  </h3>
                  <p className="text-[12px] text-zinc-400">
                    Marca los planos cuyas voces deseas generar o actualizar en lote sin alterar el resto.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filtros rápidos */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-900/60 p-2.5 border border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-zinc-400">Filtros rápidos:</span>
                <button
                  type="button"
                  onClick={selectAllShots}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-signal/50 hover:text-white transition cursor-pointer"
                >
                  Seleccionar todos ({project.shots.length})
                </button>
                <button
                  type="button"
                  onClick={selectEmptyShots}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-signal/50 hover:text-white transition cursor-pointer"
                >
                  Solo sin audio ({(project.shots || []).filter((s) => !s.audioUrl).length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[11px] text-zinc-500 hover:text-red-400 transition cursor-pointer px-1"
                >
                  Deseleccionar todos
                </button>
              </div>
            </div>

            {/* Cuadrícula de planos con selección individual */}
            <div className="mt-4 max-h-[360px] overflow-y-auto pr-1 space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {project.shots.map((shot) => {
                  const isChecked = selectedForBatch.includes(shot.id);
                  const textLine = (shot.voiceover || shot.dialogue || "").trim();

                  return (
                    <div
                      key={shot.id}
                      onClick={() => toggleShotSelection(shot.id)}
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                        isChecked
                          ? "border-signal/60 bg-signal/10 ring-1 ring-signal/30"
                          : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/80"
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                            isChecked
                              ? "bg-signal text-black border-signal shadow-sm"
                              : "border-zinc-700 bg-zinc-800/50 text-transparent"
                          }`}
                        >
                          <Check size={14} className="stroke-[3]" />
                        </div>

                        <div className="overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[12px] text-white">Plano {shot.number}</span>
                            <span className="text-[10px] text-zinc-500 font-mono">({shot.seconds}s)</span>
                          </div>
                          <div className="truncate text-[11px] text-zinc-400">
                            {textLine ? `«${textLine}»` : <span className="italic text-zinc-600">Sin texto asignado</span>}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-[10px]">
                        {shot.audioUrl ? (
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-emerald-400 font-medium">
                            Listo
                          </span>
                        ) : (
                          <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-zinc-400">
                            Sin audio
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer con resumen y botón de ejecución */}
            <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-4">
              <div className="text-[12px] text-zinc-400">
                <span className="font-bold text-signal text-sm">{selectedForBatch.length}</span>{" "}
                {selectedForBatch.length === 1 ? "plano seleccionado" : "planos seleccionados"}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="btn btn-ghost text-[12px] text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={selectedForBatch.length === 0 || bulkGenerating}
                  onClick={() => {
                    setShowBatchModal(false);
                    narrateBatch(selectedForBatch);
                  }}
                  className="btn btn-primary text-[12px] border border-signal/50 bg-signal text-black font-bold flex items-center gap-1.5 shadow-lg shadow-signal/20 disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles size={14} />
                  <span>Generar voces ({selectedForBatch.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
