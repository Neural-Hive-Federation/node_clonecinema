import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  ExternalLink,
  Eye,
  Film,
  Heart,
  ImagePlus,
  LayoutGrid,
  Link2,
  Play,
  Rocket,
  Send,
  Sparkles,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import type { ChatMessage, Mode, Project, TrendingWinner } from "../types";
import { analyzeLink, chat, updateTrendingStatus } from "../lib/api";
import { applyPlan, uid } from "../lib/project";
import { Spinner } from "./ui";
import { TrendingViralPicker } from "./TrendingViralPicker";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "clone", label: "Clon viral", hint: "Clona la estructura de un video que funciona" },
  { id: "ad", label: "Anuncio", hint: "Video publicitario desde una idea o un producto" },
  { id: "saga", label: "Saga", hint: "Historia por capítulos con continuidad" },
];

const SUGGESTIONS: Record<Mode, string[]> = {
  clone: [
    "Quiero que me busques un video viral generado por IA",
    "Búscame videos virales sobre coches de lujo",
    "Clona este viral para mi producto",
    "Cambia solo el personaje y deja el resto igual",
    "Dame 3 ganchos para los primeros 2 segundos",
  ],
  ad: [
    "Anuncio de 20s para mi café de especialidad",
    "Convierte la foto de mi producto en un spot",
    "Necesito un antes/después que no parezca publicidad",
  ],
  saga: [
    "Escribe el capítulo 14 de mi saga",
    "Necesito un cliffhanger que obligue a ver el siguiente",
    "Define la regla del mundo antes del giro",
  ],
};

const URL_RE = /(https?:\/\/[^\s]+)/i;

export function ChatView({
  project,
  mode,
  onModeChange,
  onChange,
  onOpenStudio,
  onStartAutoPilot,
}: {
  project: Project;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onChange: (project: Project) => void;
  onOpenStudio: () => void;
  onStartAutoPilot?: (url: string, brief: string, winner?: TrendingWinner) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | string>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [justApplied, setJustApplied] = useState(false);
  const [showRadar, setShowRadar] = useState(() => (typeof window !== "undefined" && window.innerWidth > 768) || project.chat.length === 0);
  const [radarKey, setRadarKey] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [project.chat.length, busy]);

  function pushMessage(message: ChatMessage) {
    onChange({ ...project, chat: [...project.chat, message], updatedAt: new Date().toISOString() });
  }

  async function handleSelectWinner(winner: TrendingWinner) {
    if (busy) return;
    const userMsg: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: `⚡ Clonar video ganador: «${winner.title}» (${winner.niche})\nEnlace: ${winner.url}\nConcepto sugerido: ${winner.recommendedConcept}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const withUser: Project = {
      ...project,
      chat: [...project.chat, userMsg],
      updatedAt: new Date().toISOString(),
    };
    onChange(withUser);
    setWarning(null);
    setJustApplied(false);

    setBusy(`El Director está analizando el ADN viral de «${winner.title}»…`);
    updateTrendingStatus(winner.id, "cloned").catch(() => {});
    try {
      const res = await analyzeLink({
        url: winner.url,
        brief: `Clonar este video viral de ${winner.niche}: ${winner.recommendedConcept}. Conservar gancho: ${winner.hookType}.`,
        mode: "clone",
        format: project.format,
        duration: winner.duration || project.duration,
      });
      if (res.warning) setWarning(res.warning);

      const meta = res.sourceMeta || {
        url: winner.url,
        platform: winner.platform,
        title: winner.title,
        author: winner.author,
        thumbnail: winner.thumbnail,
      };
      const dna = res.viralDNA;
      const summary = [
        `🎯 **Video Ganador Seleccionado:** ${winner.title} (${winner.author})`,
        `📊 **Métricas comprobadas:** ${winner.views} vistas · ${winner.likes} likes · Nicho: ${winner.niche}`,
        `⚡ **Gancho detectado:** ${winner.hookType} — ${winner.hookDescription}`,
        dna ? `\n**Fórmula del ADN Viral Extraído:**\n- Gancho visual: ${dna.hook}\n- Patrón psicológico: ${dna.pattern}` : "",
        res.plan ? `\n✅ **Plan de Clonación Generado:** ${res.plan.shots.length} planos · ${res.plan.duration}s · Formato ${res.plan.format}.` : "",
        `\n🚀 **Siguiente paso:** Haz clic abajo en «Abrir estudio» para aprobar el casting del protagonista y mandar a renderizar.`,
      ]
        .filter(Boolean)
        .join("\n");

      let next = res.plan ? applyPlan(withUser, res.plan) : withUser;
      next.sourceMeta = meta;
      next.sourceUrl = winner.url;
      next.chat = [
        ...withUser.chat,
        {
          id: uid("msg"),
          role: "assistant",
          content: summary,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          scoutCard: meta,
        },
      ];
      onChange(next);
      setJustApplied(true);
    } catch (err: any) {
      setWarning(err?.message || "Error al procesar el video ganador.");
    } finally {
      setBusy(null);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    const sentAttachments = attachments;

    const userMsg: ChatMessage = {
      id: uid("msg"),
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: sentAttachments,
    };
    const withUser: Project = {
      ...project,
      chat: [...project.chat, userMsg],
      updatedAt: new Date().toISOString(),
    };
    onChange(withUser);
    setInput("");
    setAttachments([]);
    setWarning(null);
    setJustApplied(false);

    const url = text.match(URL_RE)?.[1];
    const history = [...(withUser.chat || [])].map((m) => ({ role: m.role, content: m.content }));

    try {
      if (url) {
        setBusy("Leyendo el video y su estructura…");
        const res = await analyzeLink({
          url,
          brief: text,
          mode,
          format: project.format,
          duration: project.duration,
          referenceImage: sentAttachments[0],
        });
        if (res.warning) setWarning(res.warning);

        const meta = res.sourceMeta;
        const dna = res.viralDNA;
        const summary = [
          `🎯 **Video Fuente Analizado por el Scout:** «${meta.title || "Video"}» (${meta.author || "@creador"})`,
          meta.views ? `📊 **Telemetría Real:** ${meta.views} reproducciones · ${meta.likes || ""} likes · ${meta.platform}` : `Plataforma: ${meta.platform}`,
          dna ? `\n⚡ **Fórmula de Retención Extraída:**\n- Gancho: ${dna.hook}\n- Patrón: ${dna.pattern}` : "",
          res.plan ? `\n🚀 **Plan de Transmutación Temática:** ${res.plan.shots.length} planos · ${res.plan.duration}s · Personaje: ${res.plan.characters?.[0]?.name || "Original"}` : "",
          res.plan ? "\nÁbrelo en el estudio para revisar o pulsa «⚡ Auto-Pilot» para renderizar." : "",
        ]
          .filter(Boolean)
          .join("\n");

        const next = applyPlan(withUser, res.plan!);
        next.sourceMeta = meta;
        next.sourceUrl = url;
        next.chat = [
          ...withUser.chat,
          {
            id: uid("msg"),
            role: "assistant",
            content: summary,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            scoutCard: meta,
          },
        ];
        onChange(next);
        setJustApplied(true);
      } else {
        const isScoutSearch = /(busca|buscar|búscame|encuentra|rastrea|quiero que me busques|video viral)/i.test(text);
        setBusy(isScoutSearch ? "Rastreando tendencias en vivo con el Scout Brain…" : "Pensando el plan…");
        const res = await chat(history, withUser, mode, sentAttachments);
        if (res.warning) setWarning(res.warning);
        if ((res as any).action === "scout_search") {
          setShowRadar(true);
          setRadarKey((k) => k + 1);
        }
        let next: Project = {
          ...withUser,
          chat: [
            ...withUser.chat,
            {
              id: uid("msg"),
              role: "assistant",
              content: res.reply,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ],
        };
        if (res.plan) {
          next = applyPlan(next, res.plan);
          setJustApplied(true);
        }
        onChange(next);
      }
    } catch (err: any) {
      setWarning(err?.message || "No se pudo completar la petición.");
    } finally {
      setBusy(null);
    }
  }

  function handleFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachments((prev) => [...prev, String(reader.result)].slice(0, 2));
    };
    reader.readAsDataURL(file);
  }

  const hasPlan = project.shots.length > 0;
  const detectedUrl = input.match(URL_RE)?.[1];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800/70 px-3.5 sm:px-6 py-2.5 sm:py-3.5">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-signal to-lime-600 text-black shadow-[0_0_20px_rgba(200,250,90,0.25)]">
            <Bot size={17} strokeWidth={2.3} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-signal" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] sm:text-[13.5px] font-semibold text-zinc-100 truncate">
              Director CloneCinema
            </div>
            <div className="text-[10.5px] sm:text-[11px] text-zinc-500 truncate">
              {project.name || "Nuevo proyecto"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="btn btn-ghost !px-2 sm:!px-2.5 !py-1.5 text-xs" onClick={onOpenStudio}>
            <LayoutGrid size={13} /> <span className="hidden xs:inline">Estudio</span>
            {project.shots.length > 0 && (
              <span className="rounded-full bg-signal/15 px-1.5 py-0.5 text-[10px] font-semibold text-signal">
                {project.shots.length}
              </span>
            )}
          </button>
          <div className="hidden items-center gap-1.5 sm:flex">
            {MODES.map((m) => (
              <button
                key={m.id}
                title={m.hint}
                onClick={() => onModeChange(m.id)}
                className={`chip ${mode === m.id ? "chip-active" : ""}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid-bg flex-1 overflow-y-auto">
        <div className={`mx-auto w-full px-3 sm:px-6 py-4 sm:py-8 ${mode === "clone" ? "max-w-6xl" : "max-w-3xl"}`}>
          {mode === "clone" ? (
            <div className="mb-6 sm:mb-8">
              {project.chat.length > 0 && (
                <div className="mb-4 sm:mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75"></span>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal"></span>
                    </span>
                    <span className="text-[11.5px] sm:text-[12px] font-bold text-white">Radar Scout</span>
                    <span className="text-[10.5px] sm:text-[11px] text-zinc-400 hidden xs:inline">· Ganadores YouTube Shorts</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRadar(!showRadar)}
                    className="rounded-lg bg-zinc-800 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[10.5px] sm:text-[11px] font-semibold text-zinc-200 hover:bg-signal hover:text-black transition cursor-pointer"
                  >
                    {showRadar ? "Ocultar Radar" : "Ver Radar Ganador"}
                  </button>
                </div>
              )}
              {showRadar && (
                <TrendingViralPicker
                  key={radarKey}
                  onSelectWinner={handleSelectWinner}
                  onAutoPilotWinner={(w) =>
                    onStartAutoPilot
                      ? onStartAutoPilot(w.url, `Clonar este video viral de ${w.niche}: ${w.recommendedConcept}`, w)
                      : handleSelectWinner(w)
                  }
                  busy={Boolean(busy)}
                />
              )}
            </div>
          ) : project.chat.length === 0 ? (
            <div className="rise mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 text-signal">
                <Sparkles size={15} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Nuevo proyecto · {MODES.find((m) => m.id === mode)?.label}
                </span>
              </div>
              <h1 className="mt-3 font-display text-2xl leading-snug text-white">
                {mode === "ad"
                  ? "Cuéntame el producto. Yo dirijo el anuncio."
                  : "Empecemos la saga por el capítulo que quieras."}
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-zinc-400">
                {mode === "ad"
                  ? "De la idea al plan completo: gancho, storyboard, reparto, narración, música y kit de publicación."
                  : "Mantengo continuidad de personajes, mundo y reglas entre capítulos, con storyboard y cliffhanger."}
              </p>
            </div>
          ) : null}

          <div className="space-y-6">
            {(project.chat || []).map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onOpenStudio={onOpenStudio}
                onStartAutoPilot={onStartAutoPilot}
              />
            ))}
          </div>

          {busy && (
            <div className="mt-6 flex items-center gap-2.5 text-[12px] text-zinc-400">
              <Spinner />
              <span>{busy}</span>
            </div>
          )}

          {warning && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[11.5px] text-amber-300/90">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>{warning}</span>
            </div>
          )}

          {justApplied && hasPlan && (
            <button
              onClick={onOpenStudio}
              className="rise mt-5 flex w-full items-center justify-between rounded-xl border border-signal/30 bg-signal/[0.07] px-4 py-3 text-left transition hover:bg-signal/[0.11]"
            >
              <div>
                <div className="text-[12px] font-semibold text-signal">
                  Plan aplicado a «{project.title || project.name}»
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">
                  {project.shots.length} planos · {project.duration}s · {project.format}
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-signal">
                Abrir estudio <ArrowRight size={14} />
              </span>
            </button>
          )}

          <div ref={endRef} className="h-2" />
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-800/70 bg-ink-950/90 px-3 sm:px-6 pt-3 pb-20 md:pb-4 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl">
          {project.chat.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS[mode].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="chip hover:border-zinc-700 hover:text-zinc-300"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-2 flex gap-2">
              {attachments.map((a, i) => (
                <div key={i} className="relative">
                  <img
                    src={a}
                    alt="referencia"
                    className="h-14 w-14 rounded-lg border border-zinc-700 object-cover"
                  />
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-0.5 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 p-2 focus-within:border-signal/40">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={
                mode === "clone"
                  ? "Pega un enlace de TikTok, Reels o Shorts, o describe el video…"
                  : "Describe la idea, el producto o el capítulo…"
              }
              className="max-h-40 w-full resize-none bg-transparent px-2.5 py-1.5 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <div className="flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                  title="Adjuntar referencia visual"
                >
                  <ImagePlus size={16} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                {detectedUrl && (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 rounded-lg bg-signal/10 px-2 py-1 text-[10.5px] font-medium text-signal">
                      <Link2 size={11} /> URL detectada
                    </span>
                    {onStartAutoPilot && (
                      <button
                        type="button"
                        onClick={() => onStartAutoPilot(detectedUrl, input)}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 rounded-xl bg-signal px-2.5 py-1 text-[11px] font-bold text-black shadow-md shadow-signal/25 transition hover:bg-signal/90 cursor-pointer"
                        title="Clonación 100% autónoma de punta a punta"
                      >
                        <Rocket size={12} className="fill-black" />
                        <span>⚡ Auto-Pilot</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-[10px] text-zinc-600 sm:block">
                  {project.format} · {project.duration}s
                </span>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !!busy}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-signal text-black transition hover:bg-lime-300 disabled:opacity-30"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-600">
            CloneCinema planifica y genera. Las personas reales requieren tu autorización.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onOpenStudio,
  onStartAutoPilot,
}: {
  message: ChatMessage;
  onOpenStudio?: () => void;
  onStartAutoPilot?: (url: string, brief: string) => void;
}) {
  const isUser = message.role === "user";
  const card = message.scoutCard;

  return (
    <div className={`rise flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-signal ring-1 ring-zinc-700">
          <Film size={13} />
        </div>
      )}
      <div className={`max-w-[85%] ${isUser ? "items-end" : ""}`}>
        {message.attachments?.length ? (
          <div className="mb-2 flex justify-end gap-1.5">
            {message.attachments.map((a, i) => (
              <img
                key={i}
                src={a}
                alt="referencia"
                className="h-20 w-20 rounded-lg border border-zinc-700 object-cover"
              />
            ))}
          </div>
        ) : null}

        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
            isUser
              ? "bg-zinc-800 text-zinc-100"
              : "border border-zinc-800 bg-zinc-900/70 text-zinc-300"
          }`}
        >
          {message.content.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
            i % 2 === 1 ? (
              <strong key={i} className="font-semibold text-zinc-100">
                {chunk}
              </strong>
            ) : (
              <span key={i}>{chunk}</span>
            )
          )}
        </div>

        {/* 🕵️ FICHA TÉCNICA DEL SCOUT · VIDEO FUENTE AUDITADO */}
        {card && (
          <div className="mt-3 overflow-hidden rounded-2xl border border-signal/30 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-signal/20 text-signal font-bold text-[11px]">
                  🕵️
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-signal">
                  Ficha Técnica del Scout · Video Fuente Auditado
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                ⚡ Telemetría Real
              </span>
            </div>

            <div className="mt-3 flex gap-3.5">
              {card.thumbnail && (
                <a
                  href={card.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/thumb relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-md cursor-pointer"
                  title="Ver video fuente original"
                >
                  <img
                    src={card.thumbnail}
                    alt={card.title || "Video fuente"}
                    className="h-full w-full object-cover transition duration-300 group-hover/thumb:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-80 group-hover/thumb:opacity-100 transition">
                    <Play size={16} className="text-white fill-white" />
                  </div>
                </a>
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[13px] font-bold text-zinc-100 leading-snug line-clamp-2">
                  «{card.title || "Video Fuente"}»
                </div>
                <div className="text-[11.5px] text-zinc-400 flex items-center gap-2">
                  <span className="text-zinc-300 font-medium">{card.author || "@creador"}</span>
                  <span>·</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-300">
                    {card.platform}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono">
                  {card.views && (
                    <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-signal font-bold flex items-center gap-1">
                      <Eye size={11} /> {card.views}
                    </span>
                  )}
                  {card.likes && (
                    <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-rose-400 font-bold flex items-center gap-1">
                      <Heart size={11} /> {card.likes}
                    </span>
                  )}
                  {card.duration && (
                    <span className="rounded-md bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-zinc-400 flex items-center gap-1">
                      ⏱️ {card.duration}s
                    </span>
                  )}
                </div>
              </div>
            </div>

            {card.analytics?.verdict && (
              <div className="mt-3 rounded-xl bg-signal/[0.04] border border-signal/20 p-2.5 text-[11.5px] text-zinc-300 leading-relaxed">
                <span className="font-bold text-signal mr-1.5">Veredicto del Scout:</span>
                {card.analytics.verdict}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
              <a
                href={card.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-signal transition"
              >
                <ExternalLink size={11} /> Ver fuente ↗
              </a>
              <div className="flex items-center gap-2">
                {onOpenStudio && (
                  <button
                    onClick={onOpenStudio}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:border-signal hover:text-white transition"
                  >
                    Abrir en Estudio →
                  </button>
                )}
                {onStartAutoPilot && card.url && (
                  <button
                    onClick={() => onStartAutoPilot(card.url, "")}
                    className="rounded-lg bg-signal px-3.5 py-1.5 text-[11px] font-bold text-black hover:bg-lime-300 transition flex items-center gap-1 shadow-lg"
                  >
                    <Zap size={12} className="fill-black" /> Auto-Pilot
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`mt-1 text-[10px] text-zinc-600 ${isUser ? "text-right" : ""}`}>
          {message.timestamp}
        </div>
      </div>
    </div>
  );
}
