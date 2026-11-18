import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../types";

const FALLBACK: AppConfig = {
  supabase: { url: null, anonKey: null },
  billingEnabled: false,
  accountsEnabled: false,
  anonymousGeneration: true,
  providers: { email: true, google: false },
  credits: { image: 1, video: 5 },
  kaggleEnabled: false,
  geminiEnabled: false,
};

let configPromise: Promise<AppConfig> | null = null;
let clientPromise: Promise<SupabaseClient | null> | null = null;
let client: SupabaseClient | null = null;

/**
 * La URL y la anon key vienen del backend (`/api/config`) para reutilizar
 * SUPABASE_URL / SUPABASE_ANON_KEY sin duplicarlas con prefijo VITE_.
 */
export function loadConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = fetch("/api/config")
      .then((res) => (res.ok ? res.json() : FALLBACK))
      .catch(() => FALLBACK)
      .then((cfg: AppConfig) => {
        const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
        const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
        return {
          ...FALLBACK,
          ...cfg,
          supabase: {
            url: cfg?.supabase?.url || envUrl || null,
            anonKey: cfg?.supabase?.anonKey || envKey || null,
          },
        };
      });
  }
  return configPromise;
}

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    clientPromise = loadConfig().then((cfg) => {
      if (!cfg.supabase.url || !cfg.supabase.anonKey) return null;
      client = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return client;
    });
  }
  return clientPromise;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
