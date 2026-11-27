import React, { useState } from "react";
import { Check, Copy, Download, ExternalLink, ImageDown, MessageCircle, Send, Share2, Sparkles, Video } from "lucide-react";
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
  const [copiedPlatformIndex, setCopiedPlatformIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openPaywall, refreshAccount } = useSession();

  const publish = project.publish;

  const updatePlatform = (index: number, partial: { copy?: string; hook?: string; platform?: string }) => {
    const list = publish?.platforms || [];
    const updated = list.map((item, idx) => (idx === index ? { ...item, ...partial } : item));
    updatePublish({ platforms: updated });
  };

  const handleShareToPlatform = (p: { platform: string; copy: string; hook: string }, idx: number) => {
    const hashtags = (publish?.hashtags || []).join(" ");
    const fullMessage = `${p.hook ? `🔥 ${p.hook}\n\n` : ""}${p.copy}\n\n${hashtags}`.trim();

    navigator.clipboard.writeText(fullMessage);
    setCopiedPlatformIndex(idx);
    setTimeout(() => setCopiedPlatformIndex(null), 3500);

    const name = p.platform.toLowerCase();
    if (name.includes("whatsapp")) {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(fullMessage)}`, "_blank");
    } else if (name.includes("twitter") || name.includes(" x")) {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(fullMessage)}`, "_blank");
    } else if (name.includes("tiktok")) {
      window.open("https://www.tiktok.com/creator-center/upload", "_blank");
    } else if (name.includes("youtube") || name.includes("shorts")) {
      window.open("https://studio.youtube.com", "_blank");
    } else if (name.includes("instagram") || name.includes("reel")) {
      window.open("https://www.instagram.com/", "_blank");
    }
  };

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
          masterVideoUrl: prev.publish?.masterVideoUrl || prev.masterVideoUrl,
        },
        masterVideoUrl: prev.masterVideoUrl || prev.publish?.masterVideoUrl,
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
        masterVideoUrl: prev.publish?.masterVideoUrl || prev.masterVideoUrl,
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
              className="field h-24 max-h-32 resize-y text-xs"
              value={publish?.caption || ""}
              onChange={(e) => updatePublish({ caption: e.target.value })}
            />
          </Field>
          <div className="mt-3">
            <Field label="Hashtags">
              <input
                className="field !py-1.5 !text-xs"
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
          {/* 🌐 Contenedores de Redes Sociales en Grid 2x2 ajustado a pantalla de computador */}
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles size={13} className="text-signal" />
                Accesos Directos y Metadatos por Red Social
              </span>
              <span className="text-[10px] text-zinc-500">Haz clic en cada botón para abrir y publicar</span>
            </div>

            {/* Grid 2 columnas para no desbordar verticalmente la pantalla */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {((publish?.platforms && publish.platforms.length > 0)
              ? publish.platforms
              : [
                  { platform: "TikTok", copy: publish?.caption || "¡Mira este video viral que acaba de salir!", hook: "El 99% del Internet acaba de cambiar..." },
                  { platform: "YouTube Shorts", copy: publish?.caption || "Análisis urgente de tendencia global.", hook: "¿Por qué nadie habla de esto?" },
                  { platform: "Instagram Reels", copy: publish?.caption || "Guarda este Reel antes de que lo bajen.", hook: "Lo que intentaron ocultar..." },
                  { platform: "WhatsApp", copy: `${publish?.caption || ""}\n\n${(publish?.hashtags || []).join(" ")}`, hook: "¡Tienes que ver esto!" },
                ]
            ).map((p, i) => {
              const platformName = p.platform || "Red Social";
              const isCopied = copiedPlatformIndex === i;
              const isWA = platformName.toLowerCase().includes("whatsapp");
              const isYT = platformName.toLowerCase().includes("youtube") || platformName.toLowerCase().includes("shorts");
              const isTT = platformName.toLowerCase().includes("tiktok");
              const isIG = platformName.toLowerCase().includes("instagram") || platformName.toLowerCase().includes("reel");
              const isX = platformName.toLowerCase().includes("twitter") || platformName.toLowerCase().includes(" x");

              const badgeColor = isWA
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : isYT
                ? "bg-red-500/15 text-red-400 border-red-500/30"
                : isTT
                ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                : isIG
                ? "bg-pink-500/15 text-pink-400 border-pink-500/30"
                : "bg-blue-500/15 text-blue-400 border-blue-500/30";

              return (
                <div
                  key={i}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-700 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badgeColor}`}>
                        {platformName}
                      </span>
                      {isCopied && (
                        <span className="flex items-center gap-1 text-[10px] text-signal font-semibold animate-pulse">
                          <Check size={11} /> ¡Copiado!
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleShareToPlatform(p, i)}
                      className={`flex items-center gap-1 text-[11px] py-1 px-2.5 rounded-lg font-medium transition cursor-pointer ${
                        isWA
                          ? "bg-emerald-600/90 text-white hover:bg-emerald-500"
                          : isTT
                          ? "bg-cyan-500 text-black hover:bg-cyan-400 font-bold"
                          : isYT
                          ? "bg-red-600 text-white hover:bg-red-500"
                          : isIG
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90"
                          : "bg-signal text-black hover:bg-signal/90 font-bold"
                      }`}
                      title={`Copiar datos y abrir ${platformName}`}
                    >
                      {isCopied ? <Check size={12} /> : isWA ? <MessageCircle size={12} /> : <ExternalLink size={12} />}
                      <span>
                        {isWA ? "WhatsApp" : isX ? "X" : platformName.split(" ")[0]}
                      </span>
                    </button>
                  </div>

                  {/* Campo de Gancho editable */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>⚡ Gancho (Hook):</span>
                    </div>
                    <input
                      type="text"
                      className="field !py-1 !px-2.5 !text-xs !bg-zinc-950/60"
                      value={p.hook || ""}
                      onChange={(e) => updatePlatform(i, { hook: e.target.value })}
                      placeholder="Gancho de los primeros 2s..."
                    />
                  </div>

                  {/* Campo de Copy / Descripción editable */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-0.5">
                      <span>📝 Copy para el post:</span>
                    </div>
                    <textarea
                      rows={2}
                      className="field !py-1.5 !px-2.5 !text-xs !bg-zinc-950/60 h-16 max-h-24 resize-none"
                      value={p.copy || ""}
                      onChange={(e) => updatePlatform(i, { copy: e.target.value })}
                      placeholder="Texto del post, llamada a la acción..."
                    />
                  </div>
                </div>
              );
            })}
            </div>
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
              ["Narración normalizada a -14 LUFS", !!project.audio?.narration],
              ["Portada con espacio para el título", !!publish?.coverUrl],
              ["Copy adaptado por plataforma", !!publish?.platforms?.length],
              ["Clips descargados y unidos", (project.shots || []).some((s) => s.videoUrl)],
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
