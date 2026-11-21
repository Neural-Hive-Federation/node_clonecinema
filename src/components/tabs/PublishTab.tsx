import React, { useState } from "react";
import { Check, Copy, Download, ImageDown, Share2 } from "lucide-react";
import type { Project, ProjectUpdater } from "../../types";
import { generateImage, isPaymentRequired } from "../../lib/api";
import { useSession } from "../../context/SessionContext";
import { Field, Section, Spinner } from "../ui";
import { MasterVideoPlayer } from "../video/MasterVideoPlayer";

function toPromptPack(project: Project): string {
  const lines = [
    `# ${project.title}`,
    project.logline,
    "",
    `Formato: ${project.format} · ${project.duration}s · ${project.mode}`,
    `Estilo: ${project.style}`,
    "",
    "## Planos",
  ];
  for (const shot of project.shots) {
    lines.push(
      `\n### ${shot.number}. ${shot.title} (${shot.seconds}s)`,
      `Cámara: ${shot.camera}`,
      `Acción: ${shot.action}`,
      shot.dialogue ? `Diálogo: ${shot.dialogue}` : "",
      shot.voiceover ? `VO: ${shot.voiceover}` : "",
      `Imagen: ${shot.imagePrompt}`,
      `Video: ${shot.videoPrompt}`
    );
  }
  if (project.audio.narration) {
    lines.push("", "## Narración", project.audio.narration, `Voz: ${project.audio.voice}`);
  }
  if (project.audio.music) {
    lines.push("", "## Música", project.audio.music, `BPM: ${project.audio.bpm}`);
  }
  return lines.filter(Boolean).join("\n");
}

export function PublishTab({
  project,
  patch,
}: {
  project: Project;
  patch: ProjectUpdater;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedSocial, setCopiedSocial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openPaywall, refreshAccount } = useSession();

  const publish = project.publish;

  function download() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project.title || "clonecinema").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPack() {
    try {
      await navigator.clipboard.writeText(toPromptPack(project));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("El navegador bloqueó el portapapeles.");
    }
  }

  async function cover() {
    const prompt =
      publish?.coverPrompt ||
      `Bold vertical cover for ${project.title}, ${project.style}, high contrast, empty space for title`;
    setBusy(true);
    setError(null);
    try {
      const coverUrl = await generateImage(prompt, project.format === "16:9" ? "16:9" : "9:16");
      patch((prev) => ({
        publish: {
          caption: prev.publish?.caption || "",
          hashtags: prev.publish?.hashtags || [],
          platforms: prev.publish?.platforms || [],
          coverPrompt: prompt,
          coverUrl,
        },
      }));
      void refreshAccount();
    } catch (err: any) {
      if (isPaymentRequired(err)) openPaywall(err.message);
      else setError(err?.message || "No se pudo generar la portada.");
    } finally {
      setBusy(false);
    }
  }

  const updatePublish = (partial: Partial<NonNullable<Project["publish"]>>) =>
    patch((prev) => ({
      publish: {
        caption: prev.publish?.caption || "",
        hashtags: prev.publish?.hashtags || [],
        platforms: prev.publish?.platforms || [],
        coverPrompt: prev.publish?.coverPrompt || "",
        coverUrl: prev.publish?.coverUrl,
        ...partial,
      },
    }));

  return (
    <div className="space-y-6">
      {/* 🎬 Reproductor Maestro y Ensamblador de Video Final */}
      <MasterVideoPlayer project={project} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Section
          title="Kit de publicación"
          subtitle="Copy listo para cada plataforma, con su propio gancho."
          action={<Share2 size={14} className="text-zinc-600" />}
        >
          <Field label="Caption base">
            <textarea
              className="field min-h-[70px] resize-y"
              value={publish?.caption || ""}
              onChange={(e) => updatePublish({ caption: e.target.value })}
            />
          </Field>
          <div className="mt-3">
            <Field label="Hashtags">
              <input
                className="field"
                value={(publish?.hashtags || []).join(" ")}
                onChange={(e) =>
                  updatePublish({
                    hashtags: e.target.value.split(/\s+/).map((h) => h.trim()).filter(Boolean),
                  })
                }
              />
            </Field>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const text = `${publish?.caption || ""}\n\n${(publish?.hashtags || []).join(" ")}`;
                navigator.clipboard.writeText(text.trim());
                setCopiedSocial(true);
                setTimeout(() => setCopiedSocial(false), 2000);
              }}
              className="btn btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              {copiedSocial ? <Check size={13} className="text-signal" /> : <Copy size={13} />}
              {copiedSocial ? "¡Copiado para WhatsApp / Redes!" : "Copiar Caption + #Hashtags para WhatsApp"}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {(publish?.platforms || []).map((p, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-signal/80">
                    {p.platform}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{p.copy}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  <span className="text-zinc-600">Gancho:</span> {p.hook}
                </p>
              </div>
            ))}
            {!publish?.platforms?.length && (
              <p className="py-4 text-center text-[12px] text-zinc-600">
                El director genera el copy por plataforma al crear el plan.
              </p>
            )}
          </div>
        </Section>

        <Section title="Prompts del proyecto" subtitle="Todo el paquete listo para pegar en tu editor o modelo.">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={copyPack}>
              {copied ? <Check size={14} className="text-signal" /> : <Copy size={14} />}
              {copied ? "Copiado" : "Copiar prompts"}
            </button>
            <button className="btn btn-ghost" onClick={download}>
              <Download size={14} /> Exportar JSON
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
          <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-black/40 p-3 text-[10.5px] leading-relaxed text-zinc-500">
            {toPromptPack(project)}
          </pre>
        </Section>
      </div>

      <div className="space-y-5">
        <Section
          title="Portada"
          subtitle="El primer frame también vende el clic."
          action={
            <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={cover} disabled={busy}>
              {busy ? <Spinner /> : <ImageDown size={13} />} Generar
            </button>
          }
        >
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black">
            {publish?.coverUrl ? (
              <img src={publish.coverUrl} alt="portada" className="w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-[11px] text-zinc-600">
                Sin portada generada
              </div>
            )}
          </div>
          <div className="mt-3">
            <Field label="Prompt de portada">
              <textarea
                className="field min-h-[60px] resize-y text-[11px]"
                value={publish?.coverPrompt || ""}
                onChange={(e) => updatePublish({ coverPrompt: e.target.value })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Checklist de lanzamiento">
          <ul className="space-y-2 text-[11.5px] text-zinc-400">
            {[
              ["Gancho en menos de 2 s", true],
              ["Texto en pantalla con contraste real", true],
              ["Narración normalizada a -14 LUFS", !!project.audio.narration],
              ["Portada con espacio para el título", !!publish?.coverUrl],
              ["Copy adaptado por plataforma", !!publish?.platforms?.length],
              ["Clips descargados y unidos", project.shots.some((s) => s.videoUrl)],
            ].map(([label, ok], i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded border ${
                    ok
                      ? "border-signal/40 bg-signal/15 text-signal"
                      : "border-zinc-700 text-transparent"
                  }`}
                >
                  <Check size={10} />
                </span>
                <span className={ok ? "text-zinc-300" : "text-zinc-500"}>{label as string}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  </div>
  );
}
