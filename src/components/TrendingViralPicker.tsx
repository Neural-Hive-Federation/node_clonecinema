import React, { useEffect, useState } from "react";
import {
  Eye,
  Flame,
  Heart,
  Sparkles,
  Zap,
  TrendingUp,
  Clock,
  Layers,
  Brain,
  CheckCircle2,
  Rocket,
  BarChart3,
  Award,
  Filter,
  ExternalLink,
  Play,
  Activity,
  X,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import type { ScoutTelemetry, TrendingWinner } from "../types";
import { getTrendingWinners } from "../lib/api";

// --- COMPONENTES AUXILIARES DE TELEMETRÍA (Inspirados en Video Scout) ---

function Sparkline({ values, color = "#ff4d6d" }: { values?: number[]; color?: string }) {
  if (!values || values.length < 2) return <span className="text-zinc-600 text-[10px]">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 64;
  const H = 20;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} className="overflow-visible shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function TrajectoryChart({
  sparkline = [],
  projected24,
  projected48,
  stageColor = "#ff4d6d",
}: {
  sparkline?: number[];
  projected24?: string;
  projected48?: string;
  stageColor?: string;
}) {
  if (!sparkline || sparkline.length < 2) {
    return <div className="text-center py-6 text-zinc-500 text-xs">Sin datos suficientes de trayectoria.</div>;
  }

  const W = 520;
  const H = 190;
  const pad = { l: 40, r: 24, t: 20, b: 32 };

  // Convert projected strings like '25.4M' to numeric estimation
  const parseVal = (str?: string) => {
    if (!str) return 0;
    const num = parseFloat(str.replace(/[^\d.]/g, ""));
    if (str.includes("M")) return num * 1_000_000;
    if (str.includes("K")) return num * 1_000;
    return num;
  };

  const p24Val = parseVal(projected24) || sparkline[sparkline.length - 1] * 1.3;
  const p48Val = parseVal(projected48) || sparkline[sparkline.length - 1] * 1.6;

  const fullSeries = [...sparkline, p24Val, p48Val];
  const maxVal = Math.max(...fullSeries) * 1.05;
  const minVal = 0;

  const scaleY = (v: number) => H - pad.b - ((v - minVal) / (maxVal - minVal)) * (H - pad.t - pad.b);
  const scaleX = (idx: number, total: number) => pad.l + (idx / (total - 1)) * (W - pad.l - pad.r);

  const histLen = sparkline.length;
  const totalLen = fullSeries.length;

  const histPoints = sparkline.map((v, i) => `${scaleX(i, totalLen).toFixed(1)},${scaleY(v).toFixed(1)}`).join(" ");

  const splitX = scaleX(histLen - 1, totalLen);
  const splitY = scaleY(sparkline[histLen - 1]);

  const projPoints = [
    `${splitX.toFixed(1)},${splitY.toFixed(1)}`,
    `${scaleX(histLen, totalLen).toFixed(1)},${scaleY(p24Val).toFixed(1)}`,
    `${scaleX(histLen + 1, totalLen).toFixed(1)},${scaleY(p48Val).toFixed(1)}`,
  ].join(" ");

  const areaPoints = [
    `${scaleX(0, totalLen).toFixed(1)},${(H - pad.b).toFixed(1)}`,
    ...sparkline.map((v, i) => `${scaleX(i, totalLen).toFixed(1)},${scaleY(v).toFixed(1)}`),
    `${splitX.toFixed(1)},${(H - pad.b).toFixed(1)}`,
  ].join(" ");

  return (
    <div className="relative w-full rounded-xl bg-zinc-950/90 border border-zinc-800 p-3 pt-4">
      <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2 font-mono">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: stageColor }}></span>
          <span>Histórico Real de Escaneos</span>
        </span>
        <span className="flex items-center gap-1.5 text-zinc-400">
          <span className="inline-block w-3.5 border-t-2 border-dashed border-cyan-400"></span>
          <span>Proyección 24h–48h ({projected24} / {projected48})</span>
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stageColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stageColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Ejes y líneas horizontales */}
        {[0.25, 0.5, 0.75, 1].map((pct) => {
          const yVal = scaleY(maxVal * pct);
          return (
            <g key={pct}>
              <line x1={pad.l} y1={yVal} x2={W - pad.r} y2={yVal} stroke="#27272a" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.l - 8} y={yVal + 3} textAnchor="end" className="text-[9.5px] fill-zinc-500 font-mono">
                {pct === 1 ? "Pico" : `${Math.round(pct * 100)}%`}
              </text>
            </g>
          );
        })}

        {/* Línea divisoria 'HOY' */}
        <line x1={splitX} y1={pad.t} x2={splitX} y2={H - pad.b} stroke="#71717a" strokeWidth="1.5" strokeDasharray="2 2" />
        <text x={splitX} y={pad.t - 5} textAnchor="middle" className="text-[10px] font-bold fill-zinc-300">
          HOY
        </text>

        {/* Área rellena bajo la curva histórica */}
        <polygon points={areaPoints} fill="url(#curveGradient)" />

        {/* Curva Histórica Sólida */}
        <polyline fill="none" stroke={stageColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={histPoints} />

        {/* Curva Proyectada Discontinua */}
        <polyline fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeDasharray="4 4" strokeLinecap="round" points={projPoints} />

        {/* Puntos destacados */}
        {sparkline.map((v, i) => (
          <circle
            key={i}
            cx={scaleX(i, totalLen)}
            cy={scaleY(v)}
            r="3.5"
            fill="#09090b"
            stroke={stageColor}
            strokeWidth="2"
          />
        ))}
        <circle cx={scaleX(histLen, totalLen)} cy={scaleY(p24Val)} r="3.5" fill="#09090b" stroke="#22d3ee" strokeWidth="2" />
        <circle cx={scaleX(histLen + 1, totalLen)} cy={scaleY(p48Val)} r="3.5" fill="#09090b" stroke="#22d3ee" strokeWidth="2" />

        {/* Etiquetas X */}
        <text x={scaleX(0, totalLen)} y={H - 12} textAnchor="start" className="text-[10px] fill-zinc-500 font-mono">Inicio</text>
        <text x={splitX} y={H - 12} textAnchor="middle" className="text-[10px] fill-zinc-400 font-mono">Rastreo</text>
        <text x={scaleX(histLen, totalLen)} y={H - 12} textAnchor="middle" className="text-[10px] fill-cyan-400 font-mono">+24h</text>
        <text x={scaleX(histLen + 1, totalLen)} y={H - 12} textAnchor="end" className="text-[10px] fill-cyan-400 font-mono">+48h</text>
      </svg>
    </div>
  );
}

// --- MODAL DE DETALLE Y ANALYTICS PROFUNDAS ---

function WinnerAnalyticsModal({
  winner,
  onClose,
  onClone,
  busy,
}: {
  winner: TrendingWinner;
  onClose: () => void;
  onClone: () => void;
  busy: boolean;
}) {
  const an = winner.analytics;
  const stage = an?.stage || { label: "Explosión", color: "#ff4d6d" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-700/80 bg-zinc-950 p-6 shadow-2xl text-white space-y-5">
        {/* Header del Modal */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-[10.5px] font-extrabold uppercase tracking-wider"
                style={{ background: `${stage.color}25`, color: stage.color, border: `1px solid ${stage.color}60` }}
              >
                🔥 FASE: {stage.label.toUpperCase()}
              </span>
              <span className="text-[11px] font-mono text-zinc-400">{winner.upload_date}</span>
              {winner.viral_score && (
                <span className="rounded bg-signal/20 px-2 py-0.5 text-[10.5px] font-bold text-signal border border-signal/30 font-mono">
                  Viral Score: {winner.viral_score}/100
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-bold text-white leading-snug">{winner.title}</h3>
            <p className="text-[12px] text-zinc-400 font-mono">
              {winner.author} · {winner.niche} · {winner.duration}s
            </p>
            {/* BOTÓN PROMINENTE DIRECTO AL VIDEO ORIGINAL EN EL MODAL */}
            <div className="pt-1">
              <a
                href={winner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600/20 border border-red-500/40 px-3 py-1.5 text-[12px] font-bold text-red-300 hover:bg-red-600 hover:text-white transition shadow-sm cursor-pointer"
                title={`Abrir ${winner.url} en YouTube Shorts`}
              >
                <Play size={13} className="fill-current text-red-400" />
                <span>Ver Video Original en YouTube Shorts ↗</span>
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* 4 Métricas Clave de Velocidad y Proyección (Estilo Video Scout) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Velocidad Crucero</div>
            <div className="mt-1 text-lg font-bold font-mono text-white">
              {an?.velocityVph ? `+${(an.velocityVph / 1000).toFixed(1)}K` : "—"}/h
            </div>
            <div className="text-[10px] text-zinc-500">Views ganadas por hora</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Multiplicador Diario</div>
            <div className="mt-1 text-lg font-bold font-mono text-amber-400">
              {an?.dailyMultiplier ? `${an.dailyMultiplier}x` : "—"}
            </div>
            <div className="text-[10px] text-zinc-500">Aceleración por 24h</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Proyección 24h</div>
            <div className="mt-1 text-lg font-bold font-mono text-cyan-400">{an?.projected24 || "—"}</div>
            <div className="text-[10px] text-zinc-500">48h: {an?.projected48 || "—"}</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Probabilidad Viral</div>
            <div className="mt-1 text-lg font-bold font-mono text-emerald-400">
              {an?.probability ? `${an.probability}%` : "—"}
            </div>
            <div className="text-[10px] text-zinc-500">Confianza Algorítmica</div>
          </div>
        </div>

        {/* Gráfica SVG de Trayectoria y Proyección Punteada */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Activity size={14} className="text-signal" />
            <span>Curva de Aceleración y Pronóstico Predictivo</span>
          </div>
          <TrajectoryChart
            sparkline={an?.sparkline}
            projected24={an?.projected24}
            projected48={an?.projected48}
            stageColor={stage.color}
          />
        </div>

        {/* Desglose de Factores Explicables (Drivers) */}
        {an?.drivers && an.drivers.length > 0 && (
          <div className="space-y-2 border-t border-zinc-800/80 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Desglose de Factores de Viralidad (Drivers del Scout)
            </div>
            <div className="space-y-2">
              {an.drivers.map((d, i) => (
                <div key={i} className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-2.5 text-[11.5px]">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-zinc-200">{d.label}</span>
                    <span className="text-signal font-mono">{(d.value * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-signal to-emerald-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, d.value * 100)}%` }}
                    />
                  </div>
                  <div className="text-[10.5px] text-zinc-400 mt-1">{d.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Veredicto del Scout */}
        {an?.verdict && (
          <div className="rounded-xl border border-signal/30 bg-signal/[0.06] p-3 text-[12px] flex items-start gap-2.5">
            <ShieldCheck size={18} className="text-signal shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-signal uppercase tracking-wider text-[10.5px]">Veredicto del Scout Brain</div>
              <div className="text-zinc-300 mt-0.5 leading-relaxed">{an.verdict}</div>
            </div>
          </div>
        )}

        {/* Botones de Pie */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <a
            href={winner.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-[12px] font-semibold text-zinc-200 hover:border-signal hover:text-white transition cursor-pointer"
          >
            <ExternalLink size={13} className="text-signal" />
            <span>Abrir en YouTube ↗</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-[12px] font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            >
              Cerrar
            </button>
            <button
              disabled={busy}
              onClick={() => {
                onClone();
                onClose();
              }}
              className="flex items-center gap-2 rounded-xl bg-signal px-5 py-2 text-[12.5px] font-bold text-black shadow-lg shadow-signal/20 hover:bg-signal/90 transition cursor-pointer"
            >
              <Zap size={14} className="fill-black" />
              <span>Clonar este Ganador Ahora</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL TRENDING VIRAL PICKER ---

export function TrendingViralPicker({
  onSelectWinner,
  busy,
}: {
  onSelectWinner: (winner: TrendingWinner) => void;
  busy: boolean;
}) {
  const [winners, setWinners] = useState<TrendingWinner[]>([]);
  const [telemetry, setTelemetry] = useState<ScoutTelemetry>({
    totalTracked: 6,
    totalCloned: 0,
    totalPublished: 0,
    globalHitRate: "Pendiente de primer clon",
    topHookType: "Premisa hiperbólica inmediata",
    topNiche: "Escala Masiva & Curiosidad Extrema",
    scoutConfidence: "99.8% Algoritmo Wily Scoring + YouTube Live 7D",
    totalViews: "30.8M",
    totalLikes: "558K",
    explodingCount: 3,
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "cloned" | "published">("all");
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [showForecastWidget, setShowForecastWidget] = useState<boolean>(true);
  const [modalWinner, setModalWinner] = useState<TrendingWinner | null>(null);
  const [isFenixRunning, setIsFenixRunning] = useState<boolean>(false);

  const handleRunFenixScout = async () => {
    setIsFenixRunning(true);
    try {
      const res = await fetch("/api/viral/scout/fenix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "both" }),
      });
      const data = await res.json();
      if (data?.winners) {
        setWinners(data.winners);
        if (data.telemetry) setTelemetry(data.telemetry);
      }
    } catch (err) {
      console.error("Error corriendo Fénix Scout:", err);
    } finally {
      setIsFenixRunning(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    getTrendingWinners()
      .then((data) => {
        if (mounted && data) {
          if (Array.isArray(data.winners) && data.winners.length > 0) {
            setWinners(data.winners);
          }
          if (data.telemetry) {
            setTelemetry(data.telemetry);
          }
        }
      })
      .catch(() => { });
    return () => {
      mounted = false;
    };
  }, []);

  const niches = ["all", ...Array.from(new Set(winners.map((w) => w.niche)))];

  const filteredWinners = winners.filter((w) => {
    const matchesNiche = selectedNiche === "all" || w.niche === selectedNiche;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "available" && w.status === "available") ||
      (statusFilter === "cloned" && w.status === "cloned") ||
      (statusFilter === "published" && w.status === "published");
    return matchesNiche && matchesStatus;
  });

  const availableCount = winners.filter((w) => w.status === "available").length;
  const clonedCount = winners.filter((w) => w.status === "cloned").length;
  const publishedCount = winners.filter((w) => w.status === "published").length;

  return (
    <div className="mb-10 space-y-6">
      {/* HUD del Cerebro Scout & Métricas Globales (Fusión con Video Scout) */}
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 via-zinc-950/80 to-black p-4 sm:p-6 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal"></span>
              </span>
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.18em] text-signal">
                Scout Brain v3.0 · Algoritmo Wily Scoring + YouTube Live 7D
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-white flex items-center gap-2.5">
              <span>Radar de Ganadores Reales en YouTube Shorts</span>
              <Brain size={20} className="text-signal animate-pulse shrink-0" />
            </h2>
            <p className="max-w-2xl text-[12px] sm:text-[13px] leading-relaxed text-zinc-400">
              Filtro estricto de los últimos 7 días. Cada video incluye curvas predictivas a 24h/48h, velocidad por hora ($vph$) y botón de clonación directa.
            </p>
          </div>

          {/* Acciones de Reconocimiento & Tarjeta de Confianza */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <button
              onClick={handleRunFenixScout}
              disabled={isFenixRunning || busy}
              className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-bold text-[11px] sm:text-xs shadow-lg shadow-purple-900/30 transition disabled:opacity-50 cursor-pointer"
              title="Abre la sesión de Chrome de Wily para escanear tendencias en primera persona"
            >
              <Sparkles size={14} className={isFenixRunning ? "animate-spin" : ""} />
              <span>{isFenixRunning ? "Fénix en Misión 1ª Persona..." : "Fénix Social Scout (TikTok & Insta)"}</span>
            </button>

            <div className="flex flex-col items-start sm:items-end justify-center rounded-xl border border-signal/30 bg-signal/[0.06] px-3.5 sm:px-4 py-2 text-left sm:text-right">
              <div className="text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-signal">
                Algoritmo de Aprendizaje
              </div>
              <div className="text-[15px] sm:text-[16px] font-bold text-white mt-0.5">
                {telemetry.scoutConfidence}
              </div>
              <div className="text-[10.5px] sm:text-[11px] text-zinc-400">
                Ventana: {telemetry.timeWindow || "Últimos 7 días"}
              </div>
            </div>
          </div>
        </div>

        {/* Barra de 5 Métricas de Telemetría (Estilo Video Scout) */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-zinc-800/80 pt-4">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Layers size={13} className="text-zinc-400" />
              <span>Rastreados</span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono text-white">
              {winners.length}
            </div>
            <div className="text-[10.5px] text-zinc-500">Últimos 7 días</div>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
              <Flame size={13} className="text-rose-400 animate-bounce" />
              <span>Explotando Ahora</span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono text-rose-400">
              {telemetry.explodingCount || 3}
            </div>
            <div className="text-[10.5px] text-rose-300/80">Aceleración &gt; 15%</div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Eye size={13} className="text-cyan-400" />
              <span>Views en Radar</span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono text-cyan-300">
              {telemetry.totalViews || "30.8M"}
            </div>
            <div className="text-[10.5px] text-zinc-500">Volumen viral real</div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Heart size={13} className="text-rose-400" />
              <span>Likes Totales</span>
            </div>
            <div className="mt-1 text-xl font-bold font-mono text-rose-300">
              {telemetry.totalLikes || "558K"}
            </div>
            <div className="text-[10.5px] text-zinc-500">Reacciones masivas</div>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Award size={13} className="text-amber-400" />
              <span>Gancho Top</span>
            </div>
            <div className="mt-1 text-[13px] font-bold text-white truncate" title={telemetry.topHookType}>
              {telemetry.topHookType}
            </div>
            <div className="text-[10.5px] text-emerald-400 font-medium">+88% retención</div>
          </div>
        </div>

        {/* SECCIÓN DESPLEGABLE: PRONÓSTICO · CANDIDATOS A EXPLOTAR (Directo de Video Scout) */}
        <div className="mt-5 border-t border-zinc-800/80 pt-4">
          <button
            onClick={() => setShowForecastWidget(!showForecastWidget)}
            className="w-full flex items-center justify-between text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-signal" />
              <span className="text-[12.5px] font-bold uppercase tracking-wider text-white group-hover:text-signal transition">
                Pronóstico · Candidatos a Explotar (Ranking Predictivo)
              </span>
              <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                Velocidad views/h activa
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
              <span>{showForecastWidget ? "Ocultar tabla" : "Ver ranking predictivo"}</span>
              {showForecastWidget ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </button>

          {showForecastWidget && (
            <div className="mt-3.5 space-y-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800/90 p-2.5">
              {winners.map((w, rankIdx) => {
                const an = w.analytics;
                const stage = an?.stage || { label: "Explosión", color: "#ff4d6d" };
                const prob = an?.probability || 80;

                return (
                  <div
                    key={w.id}
                    onClick={() => setModalWinner(w)}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12px] bg-zinc-900/40 hover:bg-zinc-800/70 border border-transparent hover:border-zinc-700 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-[220px] max-w-sm truncate">
                      <span className="font-mono text-zinc-500 font-bold w-4">{rankIdx + 1}</span>
                      <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300 uppercase">
                        SHORTS
                      </span>
                      <div className="truncate">
                        <div className="font-semibold text-white truncate">{w.title}</div>
                        <div className="text-[10.5px] text-zinc-400 font-mono truncate">
                          {w.author} · <span style={{ color: stage.color }}>{stage.label}</span> · {an?.velocityVph ? `+${(an.velocityVph / 1000).toFixed(1)}K/h` : ""} · Proy 24h: {an?.projected24 || ""}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {/* Mini Sparkline Vectorial */}
                      <div className="hidden sm:block">
                        <Sparkline values={an?.sparkline} color={stage.color} />
                      </div>

                      {/* Barra de Probabilidad Viral */}
                      <div className="flex items-center gap-2 w-32">
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${prob}%`, background: stage.color }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[11px] text-white w-8 text-right">
                          {prob}%
                        </span>
                      </div>

                      <a
                        href={w.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded px-2.5 py-1 text-[10.5px] font-semibold bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600 hover:text-white transition flex items-center gap-1 cursor-pointer"
                        title={`Abrir ${w.url} en YouTube Shorts`}
                      >
                        <Play size={10} className="fill-current text-red-400" />
                        <span>Ver Short ↗</span>
                      </a>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalWinner(w);
                        }}
                        className="rounded px-2 py-1 text-[10.5px] font-semibold bg-zinc-800 hover:bg-signal hover:text-black transition flex items-center gap-1 cursor-pointer"
                        title="Ver analíticas detalladas"
                      >
                        <BarChart3 size={11} />
                        <span>Curva</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtros: Por Estado de Trazabilidad y por Nicho */}
        <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
          {/* Tabs de Estado con scroll horizontal suave en móviles */}
          <div className="flex items-center gap-1.5 rounded-xl bg-zinc-950/80 p-1 border border-zinc-800 overflow-x-auto no-scrollbar max-w-full">
            <button
              onClick={() => setStatusFilter("all")}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${statusFilter === "all"
                  ? "bg-signal text-black shadow-md"
                  : "text-zinc-400 hover:text-white"
                }`}
            >
              Todos ({winners.length})
            </button>
            <button
              onClick={() => setStatusFilter("available")}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${statusFilter === "available"
                  ? "bg-emerald-500 text-black shadow-md"
                  : "text-zinc-400 hover:text-emerald-300"
                }`}
            >
              🟢 Disponibles ({availableCount})
            </button>
            <button
              onClick={() => setStatusFilter("cloned")}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${statusFilter === "cloned"
                  ? "bg-amber-400 text-black shadow-md"
                  : "text-zinc-400 hover:text-amber-300"
                }`}
            >
              🟡 En Producción ({clonedCount})
            </button>
            <button
              onClick={() => setStatusFilter("published")}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition ${statusFilter === "published"
                  ? "bg-cyan-400 text-black shadow-md"
                  : "text-zinc-400 hover:text-cyan-300"
                }`}
            >
              🚀 Publicados ({publishedCount})
            </button>
          </div>

          {/* Filtros por Nicho con scroll horizontal suave en móviles */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full py-1">
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-zinc-500 mr-1 flex items-center gap-1">
              <Filter size={12} /> Nicho:
            </span>
            {niches.map((n) => (
              <button
                key={n}
                onClick={() => setSelectedNiche(n)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${selectedNiche === n
                    ? "bg-zinc-700 text-white font-semibold"
                    : "bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
              >
                {n === "all" ? "Todos" : n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Parrilla de 6 Cards Reales con Enlace Directo, Banderas y Botón de Estadísticas */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {filteredWinners.map((winner, idx) => {
          const isPublished = winner.status === "published";
          const isCloned = winner.status === "cloned";
          const an = winner.analytics;
          const stage = an?.stage || { label: "Explosión", color: "#ff4d6d" };

          return (
            <div
              key={winner.id}
              className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 ${isPublished
                  ? "border-cyan-500/40 bg-zinc-900/50 hover:border-cyan-400 hover:shadow-[0_10px_30px_rgba(6,182,212,0.15)]"
                  : isCloned
                    ? "border-amber-500/40 bg-zinc-900/50 hover:border-amber-400 hover:shadow-[0_10px_30px_rgba(245,158,11,0.15)]"
                    : "border-zinc-800/80 bg-zinc-900/40 hover:border-signal/50 hover:bg-zinc-900/70 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
                }`}
            >
              <div>
                {/* Contenedor de Miniatura / Fotograma Clicable */}
                <a
                  href={winner.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Abrir ${winner.title} en YouTube Shorts`}
                  className="relative block aspect-[9/10] w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 cursor-pointer"
                >
                  <img
                    src={winner.thumbnail}
                    alt={winner.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Overlay Degradado y botón de Play al Hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 backdrop-blur-[2px]">
                    <span className="flex items-center gap-1.5 rounded-full bg-signal px-3 py-1.5 text-[11px] font-bold text-black shadow-lg">
                      <Play size={12} className="fill-black" /> Ver en YouTube
                    </span>
                  </div>

                  {/* BANDERA DE TRAZABILIDAD (Arriba a la izquierda) */}
                  <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1">
                    {isPublished ? (
                      <span className="flex items-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-black shadow-lg">
                        <Rocket size={12} className="fill-black" /> PUBLICADO EN REDES
                      </span>
                    ) : isCloned ? (
                      <span className="flex items-center gap-1 rounded-md bg-amber-400 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-black shadow-lg">
                        <CheckCircle2 size={12} className="fill-black" /> EN PRODUCCIÓN
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-md bg-emerald-500/90 px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-black shadow-lg">
                        <Zap size={12} className="fill-black" /> DISPONIBLE
                      </span>
                    )}

                    {/* Badge de Fase (Explosión / Despegue de Video Scout) */}
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider self-start shadow-md"
                      style={{ background: `${stage.color}e6`, color: "#000" }}
                    >
                      🔥 {stage.label.toUpperCase()}
                    </span>
                  </div>

                  {/* Métricas Fuente Original (Arriba a la derecha) */}
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-2 rounded-md bg-black/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md border border-white/10 shadow-lg">
                    <span className="flex items-center gap-1 text-signal">
                      <Eye size={12} /> {winner.views}
                    </span>
                    <span className="h-2.5 w-px bg-white/20" />
                    <span className="flex items-center gap-1 text-rose-400">
                      <Heart size={12} /> {winner.likes}
                    </span>
                  </div>

                  {/* Duración y Ranking */}
                  <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-300 backdrop-blur">
                    <Clock size={11} /> {winner.duration}s
                  </div>

                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-md bg-signal/20 px-2 py-0.5 text-[10px] font-bold text-signal backdrop-blur border border-signal/30">
                    <Flame size={11} /> TOP #{idx + 1} · {winner.platform.toUpperCase()}
                  </div>
                </a>

                {/* Contenido de la Card */}
                <div className="mt-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {winner.niche}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {winner.upload_date}
                    </span>
                  </div>

                  <h3 className="font-display text-[15px] font-semibold leading-snug text-white line-clamp-2 group-hover:text-signal transition">
                    {winner.title}
                  </h3>

                  <div className="flex items-center justify-between text-[11.5px] text-zinc-400 font-mono">
                    <span>{winner.author}</span>
                    {an?.velocityVph && (
                      <span className="text-rose-400 font-bold">
                        +{(an.velocityVph / 1000).toFixed(1)}K/h
                      </span>
                    )}
                  </div>

                  {/* FILA DE 2 BOTONES: ENLACE ORIGINAL + MODO ANALYTICS */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a
                      href={winner.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800/40 px-3 py-2 text-[11.5px] font-semibold text-zinc-200 transition hover:border-signal hover:bg-zinc-800/90 hover:text-white cursor-pointer"
                      title="Ver video original en YouTube Shorts"
                    >
                      <ExternalLink size={12} className="text-signal shrink-0" />
                      <span>Ver Short ↗</span>
                    </a>

                    <button
                      onClick={() => setModalWinner(winner)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[11.5px] font-semibold text-rose-300 transition hover:border-rose-400 hover:bg-rose-900/40 hover:text-white cursor-pointer"
                      title="Ver curvas predictivas y métricas del video scout"
                    >
                      <BarChart3 size={12} className="text-rose-400 shrink-0" />
                      <span>Métricas & Curva</span>
                    </button>
                  </div>

                  {/* Caja de Gancho Viral */}
                  <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5 text-[11.5px] leading-relaxed">
                    <div className="flex items-center gap-1 font-semibold text-signal">
                      <Zap size={12} /> {winner.hookType}
                    </div>
                    <p className="mt-1 text-zinc-400 line-clamp-2">
                      {winner.hookDescription}
                    </p>
                  </div>
                </div>
              </div>

              {/* Botón de Acción según Estado */}
              <div className="mt-4 pt-3 border-t border-zinc-800/60">
                {isPublished ? (
                  <button
                    disabled={busy}
                    onClick={() => onSelectWinner(winner)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-[13px] font-bold text-black shadow-[0_0_15px_rgba(6,182,212,0.25)] transition hover:bg-cyan-300 hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] disabled:opacity-50 cursor-pointer"
                  >
                    <Rocket size={15} className="fill-black" />
                    <span>🚀 Crear Variante 2.0 (Evolución)</span>
                  </button>
                ) : isCloned ? (
                  <button
                    disabled={busy}
                    onClick={() => onSelectWinner(winner)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-[13px] font-bold text-black shadow-[0_0_15px_rgba(245,158,11,0.25)] transition hover:bg-amber-300 hover:shadow-[0_0_25px_rgba(245,158,11,0.4)] disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 size={15} className="fill-black" />
                    <span>🟡 En Producción · Re-abrir en Estudio</span>
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => onSelectWinner(winner)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-[13px] font-bold text-black shadow-[0_0_15px_rgba(200,250,90,0.25)] transition hover:bg-signal/90 hover:shadow-[0_0_25px_rgba(200,250,90,0.4)] disabled:opacity-50 cursor-pointer"
                  >
                    <Zap size={15} className="fill-black" />
                    <span>⚡ Clonar este ganador</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nota de pie informativa */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-900/30 px-3.5 sm:px-5 py-3 text-[11px] sm:text-[12px] text-zinc-400 gap-2">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-signal shrink-0" />
          <span>El Scout prioriza automáticamente en sus 2 barridos diarios los nichos con mayor retención comprobada.</span>
        </div>
        <span className="text-[10.5px] sm:text-[11px] font-medium text-zinc-300 shrink-0">
          Usa la caja inferior para videos manuales 👇
        </span>
      </div>

      {/* MODAL DE ANALYTICS ACTIVO */}
      {modalWinner && (
        <WinnerAnalyticsModal
          winner={modalWinner}
          onClose={() => setModalWinner(null)}
          onClone={() => onSelectWinner(modalWinner)}
          busy={busy}
        />
      )}
    </div>
  );
}
