import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AccountUser, AppConfig } from "../types";
import { checkPayment, getMe } from "../lib/api";
import { getSupabase, loadConfig } from "../lib/supabase";
import { AuthModal } from "../components/AuthModal";
import { PaywallModal } from "../components/PaywallModal";

interface SessionValue {
  config: AppConfig | null;
  session: Session | null;
  user: AccountUser | null;
  credits: number | null;
  costs: { image: number; video: number };
  loading: boolean;
  authOpen: boolean;
  paywall: { open: boolean; reason?: string };
  notify: (message: string) => void;
  refreshAccount: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  openAuth: () => void;
  closeAuth: () => void;
  openPaywall: (reason?: string) => void;
  closePaywall: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const cfg = await loadConfig();
      const supabase = await getSupabase();
      if (cancelled) return;

      setConfig(cfg);
      setClient(supabase);

      if (!supabase) {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) setSession(data.session ?? null);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!config?.accountsEnabled) {
      setCredits(null);
      setUser(null);
      return;
    }
    try {
      const me = await getMe();
      if (!me.authenticated) {
        setUser(null);
        setCredits(null);
        return;
      }
      setUser(me.user ?? null);
      setCredits(me.credits ?? 0);
    } catch {
      setUser(null);
      setCredits(null);
    }
  }, [config?.accountsEnabled]);

  useEffect(() => {
    if (!session) {
      setUser(null);
      setCredits(null);
      return;
    }
    void refreshAccount();
  }, [session, refreshAccount]);

  // Vuelta del checkout de Wompi: `?ref=CC-...`.
  useEffect(() => {
    if (!config?.billingEnabled || !session) return;
    const params = new URLSearchParams(window.location.search);
    // Wompi devuelve `?id=<transacción>`; la referencia queda en localStorage.
    const stored = window.localStorage.getItem("clonecinema_pending_reference");
    const reference = params.get("ref") || (params.has("id") ? stored : null);
    if (!reference) return;

    let cancelled = false;
    (async () => {
      notify("Confirmando el pago con Wompi…");
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        try {
          const result = await checkPayment(reference);
          if (result.status === "APPROVED") {
            notify(`Pago aprobado: +${result.credited ?? 0} créditos.`);
            break;
          }
          if (result.status === "NOT_FOUND" && attempt >= 2) {
            notify("Wompi aún no reporta la transacción. Si pagaste, aparecerá en unos minutos.");
            break;
          }
        } catch {
          /* reintenta */
        }
        await new Promise((r) => setTimeout(r, 3500));
      }
      if (!cancelled) {
        await refreshAccount();
        window.localStorage.removeItem("clonecinema_pending_reference");
        params.delete("ref");
        params.delete("id");
        params.delete("env");
        const query = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config?.billingEnabled, session, notify, refreshAccount]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) return "Supabase no está configurado.";
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      setAuthOpen(false);
      return null;
    },
    [client]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!client) return { error: "Supabase no está configurado." };
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return { error: error.message };
      if (!data.session) return { needsConfirmation: true };
      setAuthOpen(false);
      return {};
    },
    [client]
  );

  const signInWithGoogle = useCallback(async () => {
    if (!client) return "Supabase no está configurado.";
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error?.message ?? null;
  }, [client]);

  const signOut = useCallback(async () => {
    await client?.auth.signOut();
    setSession(null);
    setUser(null);
    setCredits(null);
    setPaywall({ open: false });
  }, [client]);

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const openPaywall = useCallback(
    (reason?: string) => {
      if (config?.accountsEnabled && !session) {
        setAuthOpen(true);
        return;
      }
      setPaywall({ open: true, reason });
    },
    [config?.accountsEnabled, session]
  );

  const closePaywall = useCallback(() => setPaywall({ open: false }), []);

  const value = useMemo<SessionValue>(
    () => ({
      config,
      session,
      user,
      credits,
      costs: config?.credits ?? { image: 1, video: 5 },
      loading,
      authOpen,
      paywall,
      notify,
      refreshAccount,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      openAuth,
      closeAuth,
      openPaywall,
      closePaywall,
    }),
    [
      config,
      session,
      user,
      credits,
      loading,
      authOpen,
      paywall,
      notify,
      refreshAccount,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      openAuth,
      closeAuth,
      openPaywall,
      closePaywall,
    ]
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      <AuthModal />
      <PaywallModal />
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 text-[12px] text-zinc-200 shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}
    </SessionContext.Provider>
  );
}
