import React from "react";
import {
  Clapperboard,
  Coins,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
  Youtube,
  Settings2,
} from "lucide-react";
import type { Project } from "../types";
import { MODE_LABEL } from "../lib/project";
import { useSession } from "../context/SessionContext";

export function LeftRail({
  projects,
  activeId,
  onSelect,
  onNew,
  onDelete,
  hasApiKey,
}: {
  projects: Project[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  hasApiKey: boolean | null;
}) {
  const { config, user, credits, openAuth, openPaywall, signOut } = useSession();
  const accountsEnabled = Boolean(config?.accountsEnabled);

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-zinc-800/80 bg-ink-950">
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal text-black">
          <Clapperboard size={17} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-tight text-white">
            Clone<span className="text-signal">Cinema</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
            viral video studio
          </div>
        </div>
      </div>

      <div className="px-4">
        <button className="btn btn-primary w-full" onClick={onNew}>
          <Plus size={15} /> Nuevo proyecto
        </button>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
          Proyectos
        </div>
        <div className="space-y-1">
          {projects.map((p) => {
            const active = p.id === activeId;
            return (
              <div
                key={p.id}
                className={`group flex cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2 transition ${
                  active ? "bg-zinc-900 ring-1 ring-zinc-800" : "hover:bg-zinc-900/60"
                }`}
                onClick={() => onSelect(p.id)}
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                    p.format === "9:16" ? "h-8 w-5" : "h-6 w-8"
                  } ${
                    active
                      ? "bg-signal/15 text-signal ring-1 ring-signal/30"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {p.mode === "clone" ? <Youtube size={12} /> : p.mode === "saga" ? "S" : "AD"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-zinc-200">
                    {p.name || "Sin título"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600">
                    <span>{MODE_LABEL[p.mode]}</span>
                    <span>·</span>
                    <span>{p.format}</span>
                    <span>·</span>
                    <span>{p.duration}s</span>
                  </div>
                </div>
                <button
                  className="mt-0.5 hidden rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  title="Eliminar proyecto"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-800/80 p-4">
        {accountsEnabled ? (
          user ? (
            <>
              <button
                className="flex w-full items-center justify-between rounded-xl bg-zinc-900/60 px-3 py-2.5 text-left transition hover:bg-zinc-900"
                onClick={() => openPaywall()}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <Coins size={13} className="shrink-0 text-signal" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-medium text-zinc-200">
                      {user.fullName || user.email || "Tu cuenta"}
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      {credits === null ? "—" : `${credits} créditos`}
                    </span>
                  </span>
                </span>
                <Plus size={13} className="text-signal" />
              </button>
              <div className="flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                  <Sparkles size={11} className={hasApiKey ? "text-signal/70" : "text-zinc-600"} />
                  {hasApiKey ? "Gemini conectado" : "Director local"}
                </span>
                <button
                  className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-300"
                  onClick={signOut}
                  title="Cerrar sesión"
                >
                  <LogOut size={11} /> Salir
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-primary w-full" onClick={openAuth}>
                <LogIn size={14} /> Entrar · 10 créditos
              </button>
              <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
                Guarda tus proyectos y genera con créditos. Sin cuenta trabajas en local.
              </p>
            </>
          )
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={13} className={hasApiKey ? "text-signal" : "text-zinc-500"} />
                <span className="text-[11px] font-medium text-zinc-400">
                  {hasApiKey === null
                    ? "Comprobando…"
                    : hasApiKey
                    ? "Gemini conectado"
                    : "Modo local"}
                </span>
              </div>
              <Settings2 size={13} className="text-zinc-600" />
            </div>
            <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
              Añade SUPABASE_URL y SUPABASE_ANON_KEY al .env para activar cuentas y créditos.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
