import React, { useState } from "react";
import { Clapperboard, Mail, X } from "lucide-react";
import { useSession } from "../context/SessionContext";
import { Spinner } from "./ui";

export function AuthModal() {
  const { authOpen, closeAuth, signIn, signUp, signInWithGoogle, config } = useSession();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!authOpen) return null;

  const accountsDisabled = !config?.accountsEnabled;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);

    if (!email.includes("@")) return setError("Escribe un correo válido.");
    if (password.length < 6) return setError("La contraseña necesita al menos 6 caracteres.");

    setBusy(true);
    try {
      if (mode === "signin") {
        const message = await signIn(email.trim(), password);
        if (message) setError(message);
      } else {
        const result = await signUp(email.trim(), password);
        if (result.error) setError(result.error);
        else if (result.needsConfirmation) {
          setNotice("Te enviamos un correo para confirmar la cuenta. Después podrás entrar.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    setBusy(true);
    try {
      const message = await signInWithGoogle();
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="panel relative w-full max-w-[400px] p-6">
        <button
          className="absolute right-4 top-4 rounded p-1 text-zinc-500 hover:text-zinc-200"
          onClick={closeAuth}
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>

        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal text-black">
            <Clapperboard size={17} strokeWidth={2.4} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-zinc-100">
              {mode === "signin" ? "Entrar a CloneCinema" : "Crear cuenta"}
            </h2>
            <p className="text-[11px] text-zinc-500">
              10 créditos de bienvenida al registrarte.
            </p>
          </div>
        </div>

        {accountsDisabled ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[11.5px] leading-relaxed text-amber-200/90">
            Las cuentas aún no están configuradas. Añade <code>SUPABASE_URL</code>,{" "}
            <code>SUPABASE_ANON_KEY</code> y <code>SUPABASE_SERVICE_ROLE_KEY</code> al{" "}
            <code>.env</code> para activar el inicio de sesión.
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="label">Correo</span>
                <div className="relative mt-1.5">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    type="email"
                    className="field !pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    autoComplete="email"
                  />
                </div>
              </label>
              <label className="block">
                <span className="label">Contraseña</span>
                <input
                  type="password"
                  className="field mt-1.5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </label>

              {error && <p className="text-[11.5px] text-red-400">{error}</p>}
              {notice && <p className="text-[11.5px] text-signal/90">{notice}</p>}

              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                {mode === "signin" ? "Entrar" : "Crear cuenta"}
              </button>
            </form>

            {config?.providers.google && (
              <>
                <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-600">
                  <span className="h-px flex-1 bg-zinc-800" />
                  o
                  <span className="h-px flex-1 bg-zinc-800" />
                </div>
                <button className="btn btn-ghost w-full" onClick={google} disabled={busy}>
                  Continuar con Google
                </button>
              </>
            )}

            <button
              className="mt-4 w-full text-center text-[11.5px] text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
            >
              {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "Ya tengo cuenta"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
