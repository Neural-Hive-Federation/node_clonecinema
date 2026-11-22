import React, { useState } from "react";
import { ArrowRight, Bot, Repeat2, Check, ExternalLink } from "lucide-react";
import type { Project, ProjectUpdater } from "../../types";
import { Field, Section, Spinner } from "../ui";
import { MODE_LABEL } from "../../lib/project";

const KIND_LABEL: Record<string, string> = {
  character: "Personaje",
  product: "Producto",
  location: "Fondo",
  prop: "Objeto",
  logo: "Logo",
  text: "Texto",
};

export function ScriptTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const dna = project.viralDNA;
  const [miningFenix, setMiningFenix] = useState(false);
  const [fenixStatus, setFenixStatus] = useState<string | null>(null);

  const handleDispatchFenix = async () => {
    const url = project.sourceMeta?.url || project.sourceUrl;
    if (!url) return;
    setMiningFenix(true);
    setFenixStatus("Desplegando Fénix a tu PC...");

    try {
      const res = await fetch("/api/viral/mine-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          projectId: project.id,
          duration: project.duration || 60,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFenixStatus("🦅 Misión enviada con éxito al Nodo Fénix en tu PC");
      } else {
        setFenixStatus(`Error: ${data.error || "No se pudo despachar al Fénix"}`);
      }
    } catch (err: any) {
      setFenixStatus("Error al contactar con el endpoint de minería");
    } finally {
      setMiningFenix(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]">
      <div className="space-y-5">
        <Section title="Brief del proyecto" subtitle="Lo que el director usa como fuente de verdad.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Título">
              <input
                className="field"
                value={project.title}
                onChange={(e) => patch({ title: e.target.value, name: e.target.value })}
              />
            </Field>
            <Field label="Modo">
              <select
                className="field"
                value={project.mode}
                onChange={(e) => patch({ mode: e.target.value as Project["mode"] })}
              >
                {(["clone", "ad", "saga"] as const).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Logline">
                <input
                  className="field"
                  value={project.logline}
                  onChange={(e) => patch({ logline: e.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Idea / brief">
                <textarea
                  className="field min-h-[76px] resize-y"
                  value={project.brief}
                  onChange={(e) => patch({ brief: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Formato">
              <select
                className="field"
                value={project.format}
                onChange={(e) => patch({ format: e.target.value as Project["format"] })}
              >
                <option value="9:16">9:16 vertical</option>
                <option value="16:9">16:9 cine</option>
                <option value="1:1">1:1 feed</option>
              </select>
            </Field>
            <Field label="Duración objetivo (s)">
              <input
                type="number"
                className="field"
                value={project.duration}
                onChange={(e) => patch({ duration: Number(e.target.value) || 0 })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Estilo visual">
                <input
                  className="field"
                  value={project.style}
                  onChange={(e) => patch({ style: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </Section>

        <Section
          title="Guion por planos"
          subtitle="Cada plano con su cámara, acción, diálogo y audio."
          action={<span className="chip">{(project.shots || []).length} planos</span>}
        >
          {(project.shots || []).length === 0 ? (
            <p className="py-6 text-center text-[12px] text-zinc-600">
              Pide un plan en el chat para ver el guion aquí.
            </p>
          ) : (
            <div className="space-y-2">
              {(project.shots || []).map((shot) => (
                <div
                  key={shot.id}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800 font-display text-[11px] font-bold text-zinc-300">
                      {shot.number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-zinc-100">
                          {shot.title}
                        </span>
                        <span className="text-[10px] text-zinc-600">{shot.seconds}s</span>
                        <span className="text-[10px] text-zinc-600">·</span>
                        <span className="text-[10px] text-zinc-500">{shot.camera}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                        {shot.action}
                      </p>
                      {shot.dialogue && (
                        <p className="mt-1.5 text-[11.5px] italic text-signal/80">
                          {shot.dialogue}
                        </p>
                      )}
                      {shot.voiceover && (
                        <p className="mt-1 text-[11px] text-zinc-500">
                          <span className="label mr-1.5">VO</span>
                          {shot.voiceover}
                        </p>
                      )}
                      {shot.sfx && (
                        <p className="mt-1 text-[10.5px] text-zinc-600">
                          SFX · {shot.sfx}
                          {shot.music ? ` — Música · ${shot.music}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="space-y-5">
        {dna ? (
          <Section
            title="ADN viral"
            subtitle="La estructura que se clona. El contenido cambia; el ritmo no."
            action={<Repeat2 size={14} className="text-signal/70" />}
          >
            <div className="rounded-xl border border-signal/20 bg-signal/[0.05] p-3">
              <div className="label text-signal/70">Gancho (0-2s)</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-200">{dna.hook}</p>
            </div>

            <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="label">Patrón</div>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{dna.pattern}</p>
            </div>

            {dna.beats && dna.beats.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Beats</div>
                <div className="relative space-y-3 border-l border-zinc-800 pl-4">
                  {(dna.beats || []).map((b, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-signal/70 ring-4 ring-ink-900" />
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-[10.5px] font-bold text-signal">
                          {b.at}
                        </span>
                        <span className="text-[12px] font-medium text-zinc-200">{b.label}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{b.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dna.retentionTricks && dna.retentionTricks.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Trucos de retención</div>
                <ul className="space-y-1.5">
                  {(dna.retentionTricks || []).map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11.5px] text-zinc-400">
                      <Check size={12} className="mt-0.5 shrink-0 text-signal/70" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dna.cta && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
                <ArrowRight size={12} className="mt-0.5 shrink-0 text-zinc-500" />
                <div>
                  <div className="label">CTA</div>
                  <p className="text-[11.5px] text-zinc-300">{dna.cta}</p>
                </div>
              </div>
            )}
          </Section>
        ) : (
          <Section title="ADN viral" subtitle="Se completa al analizar un video o generar un plan.">
            <p className="py-4 text-[12px] text-zinc-600">
              Sin estructura todavía. Pega un enlace viral en el chat.
            </p>
          </Section>
        )}

        {(project.references || []).length > 0 && (
          <Section
            title="Qué se conserva y qué se reemplaza"
            subtitle="El corazón del clon: el esqueleto no se toca."
          >
            <div className="space-y-2">
              {(project.references || []).map((ref) => (
                <div
                  key={ref.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="label">{KIND_LABEL[ref.kind] || ref.kind}</span>
                      <span className="text-[12px] font-medium text-zinc-200">{ref.name}</span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${
                        ref.keep
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-fuchsia-500/10 text-fuchsia-300"
                      }`}
                    >
                      {ref.keep ? "conservar" : "reemplazar"}
                    </span>
                  </div>
                  {!ref.keep && ref.replaceWith && (
                    <p className="mt-1 text-[11px] text-zinc-400">
                      <span className="text-zinc-600">→</span> {ref.replaceWith}
                    </p>
                  )}
                  <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-600">
                    {ref.description}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-signal" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Ficha del Video Fuente</span>
            </div>
            {project.sourceMeta?.url && (
              <a
                href={project.sourceMeta.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10.5px] text-signal hover:underline"
              >
                <ExternalLink size={11} /> Ver original ↗
              </a>
            )}
          </div>
          {project.sourceMeta && (project.sourceMeta.title || project.sourceMeta.platform) ? (
            <div className="mt-3 flex gap-3">
              {project.sourceMeta.thumbnail && (
                <img
                  src={project.sourceMeta.thumbnail}
                  alt="Carátula fuente"
                  className="h-20 w-16 shrink-0 rounded-lg border border-zinc-800 object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1 text-[11px]">
                <div className="font-semibold text-zinc-200 line-clamp-2">
                  {project.sourceMeta.title || "Video fuente"}
                </div>
                <div className="text-zinc-400">
                  {project.sourceMeta.author || "@creador"} · <span className="text-zinc-500">{project.sourceMeta.platform}</span>
                </div>
                {(project.sourceMeta.views || project.sourceMeta.likes) && (
                  <div className="flex items-center gap-2 text-zinc-400 font-mono text-[10.5px] pt-1">
                    {project.sourceMeta.views && <span className="text-signal">👁️ {project.sourceMeta.views}</span>}
                    {project.sourceMeta.likes && <span className="text-rose-400">❤️ {project.sourceMeta.likes}</span>}
                  </div>
                )}
                {project.sourceMeta.note && (
                  <p className="text-[10px] text-zinc-500 pt-1 leading-relaxed">{project.sourceMeta.note}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-600">
              Proyecto original, sin video fuente.
            </p>
          )}

          {/* BOTÓN DESPACHAR AL FÉNIX */}
          {(project.sourceMeta?.url || project.sourceUrl) && (
            <div className="mt-4 pt-3 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={handleDispatchFenix}
                disabled={miningFenix}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-signal/15 via-signal/25 to-signal/15 border border-signal/40 py-2.5 px-3 text-[12px] font-bold text-signal hover:bg-signal hover:text-black transition-all shadow-lg shadow-signal/10 disabled:opacity-50 cursor-pointer"
              >
                {miningFenix ? <Spinner size={13} /> : <span className="text-base leading-none">🦅</span>}
                <span>
                  {miningFenix
                    ? "Fénix en misión: extrayendo fotogramas..."
                    : fenixStatus
                    ? fenixStatus
                    : "Enviar al Fénix en la misión del video fuente"}
                </span>
              </button>
              {fenixStatus && !miningFenix && (
                <div className="mt-2 text-center text-[10.5px] font-medium text-emerald-400">
                  ⚡ Tu Nodo Fénix PC extraerá los fotogramas clave (1 frame = 1 plano) para Wan 2.1.
                </div>
              )}

              {/* Riel de fotogramas si ya existen minados */}
              {project.sourceMeta?.frames && project.sourceMeta.frames.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-zinc-800/60">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300 mb-2">
                    <span className="flex items-center gap-1.5 text-signal">
                      <span>🦅</span> Planos extraídos por el Fénix ({project.sourceMeta.frames.length})
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">1 plano / ~4.5s</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    {project.sourceMeta.frames.map((f, idx) => (
                      <div key={idx} className="relative shrink-0 w-16 group">
                        <img
                          src={f.frameUrl}
                          alt={`Plano ${f.shotNumber}`}
                          className="h-20 w-16 rounded-lg object-cover border border-zinc-800 group-hover:border-signal transition"
                        />
                        <div className="absolute bottom-1 left-1 right-1 rounded bg-black/85 px-1 py-0.5 text-[8.5px] font-mono text-center text-zinc-200">
                          P{f.shotNumber} ({f.timestampSec}s)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
