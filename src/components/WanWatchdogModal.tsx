import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock, Power, ShieldCheck, Zap } from "lucide-react";

interface WanWatchdogModalProps {
  isOpen: boolean;
  onExtend: () => Promise<void> | void;
  onShutdown: () => Promise<void> | void;
  initialSeconds?: number;
}

export function WanWatchdogModal({
  isOpen,
  onExtend,
  onShutdown,
  initialSeconds = 12,
}: WanWatchdogModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(initialSeconds);
      setLoading(false);
      return;
    }

    setSecondsLeft(initialSeconds);

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleAutoShutdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, initialSeconds]);

  const handleAutoShutdown = async () => {
    setLoading(true);
    try {
      await onShutdown();
    } finally {
      setLoading(false);
    }
  };

  const handleKeepAlive = async () => {
    setLoading(true);
    try {
      await onExtend();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const pct = Math.max(0, (secondsLeft / initialSeconds) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-md rounded-2xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl shadow-amber-500/10 text-center">
        {/* Glowing badge */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-4 animate-pulse">
          <AlertTriangle size={28} />
        </div>

        <h3 className="text-xl font-bold text-white tracking-tight mb-2">
          ¿Sigues ahí, Director?
        </h3>

        <p className="text-sm text-zinc-400 leading-relaxed mb-5">
          El motor de video <span className="font-semibold text-white">Wan 2.2</span> lleva 10 minutos inactivo. Para no agotar tus <span className="text-amber-400 font-semibold">30 horas semanales de GPU</span> en Kaggle, el servidor se apagará automáticamente:
        </p>

        {/* Countdown display */}
        <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 mb-5">
          <div className="flex items-center gap-2 text-3xl font-extrabold text-amber-400 font-mono tracking-wider">
            <Clock size={24} className="text-amber-400" />
            <span>00:{secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft}</span>
          </div>
          <span className="text-xs text-zinc-500 mt-1 uppercase tracking-wider font-semibold">
            Segundos para auto-desconexión
          </span>

          {/* Progress bar */}
          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={handleKeepAlive}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Zap size={16} className="fill-black" />
            <span>Mantener Activo (+10 min)</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleAutoShutdown}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            <Power size={15} />
            <span>Apagar Ahora</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 mt-4 text-[11px] text-zinc-500">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Protección activa de recursos GPU CloneCinema</span>
        </div>
      </div>
    </div>
  );
}
