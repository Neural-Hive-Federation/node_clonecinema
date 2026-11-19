import dotenv from "dotenv";
import path from "path";

dotenv.config({ quiet: true });

function text(value: string | undefined): string | undefined {
  const trimmed = (value || "").trim();
  if (!trimmed || /^tu[_-]|^<|^changeme/i.test(trimmed)) return undefined;
  return trimmed;
}

function number(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const configuredPort = Number(process.env.PORT);
const port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;

const supabaseUrl = text(process.env.SUPABASE_URL) || text(process.env.VITE_SUPABASE_URL);
const supabaseAnonKey =
  text(process.env.SUPABASE_ANON_KEY) ||
  text(process.env.SUPABASE_PUBLISHABLE_KEY) ||
  text(process.env.VITE_SUPABASE_ANON_KEY);
const supabaseServiceRoleKey =
  text(process.env.SUPABASE_SERVICE_ROLE_KEY) || text(process.env.SUPABASE_SECRET_KEY);

const kaggleUsername = text(process.env.KAGGLE_USERNAME);
const kaggleKey = text(process.env.KAGGLE_KEY);
const kaggleFluxKernel =
  text(process.env.KAGGLE_FLUX_KERNEL) || (kaggleUsername ? `${kaggleUsername}/clonecinema-flux` : undefined);
const kaggleFluxReduxKernel =
  text(process.env.KAGGLE_FLUX_REDUX_KERNEL) || (kaggleUsername ? `${kaggleUsername}/clonecinema-flux-1-redux-multi-reference` : undefined);
const kaggleVideoKernel =
  text(process.env.KAGGLE_VIDEO_KERNEL) || (kaggleUsername ? `${kaggleUsername}/clonecinema-wan-i2v` : undefined);

const wompiPublicKey = text(process.env.WOMPI_PUBLIC_KEY);
const wompiIntegritySecret = text(process.env.WOMPI_INTEGRITY_SECRET);
const wompiEventsSecret = text(process.env.WOMPI_EVENTS_SECRET);

export const config = {
  port,
  appUrl: text(process.env.APP_URL) || `http://localhost:${port}`,
  isProduction: process.env.NODE_ENV === "production",

  gemini: {
    apiKey: text(process.env.GEMINI_API_KEY),
  },

  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    get enabled() {
      return Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
    },
  },

  kaggle: {
    username: kaggleUsername,
    key: kaggleKey,
    fluxKernel: kaggleFluxKernel,
    fluxReduxKernel: kaggleFluxReduxKernel,
    videoKernel: kaggleVideoKernel,
    get enabled() {
      return Boolean(kaggleUsername && kaggleKey && (kaggleFluxKernel || kaggleFluxReduxKernel));
    },
    pollIntervalMs: number(process.env.KAGGLE_POLL_INTERVAL_MS, 8000),
    /** Tiempo máximo que un job puede estar pendiente antes de darse por fallido. */
    jobTimeoutMs: number(process.env.KAGGLE_JOB_TIMEOUT_MS, 45 * 60 * 1000),
    /** Modelo I2V. Wan 2.1 no publica un I2V de 1.3B: el mínimo real es 14B 480p. */
    wanModelId: text(process.env.WAN_MODEL_ID) || "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers",
    hfToken: text(process.env.HF_TOKEN),
  },

  wompi: {
    publicKey: wompiPublicKey,
    integritySecret: wompiIntegritySecret,
    eventsSecret: wompiEventsSecret,
    baseUrl: text(process.env.WOMPI_BASE_URL) || "https://checkout.wompi.co",
    apiBaseUrl: text(process.env.WOMPI_API_BASE_URL) || "https://sandbox.wompi.co/v1",
    currency: "COP",
    get enabled() {
      return Boolean(wompiPublicKey && wompiIntegritySecret && wompiEventsSecret);
    },
  },

  credits: {
    image: number(process.env.CREDIT_COST_IMAGE, 1),
    video: number(process.env.CREDIT_COST_VIDEO, 5),
  },

  /** Sin Supabase, permitimos generar sin cobrar para no bloquear el estudio local. */
  allowAnonymousGeneration: process.env.ALLOW_ANONYMOUS_GENERATION !== "false",

  mediaDir: process.env.MEDIA_DIR || path.join(process.cwd(), "data"),
};

export function publicConfig() {
  return {
    supabase: {
      // La anon key es pública por diseño: se usa en el navegador.
      url: config.supabase.url || null,
      anonKey: config.supabase.anonKey || null,
    },
    billingEnabled: config.wompi.enabled && config.supabase.enabled,
    accountsEnabled: config.supabase.enabled,
    anonymousGeneration: !config.supabase.enabled && config.allowAnonymousGeneration,
    providers: { email: true, google: config.supabase.enabled },
    credits: config.credits,
    kaggleEnabled: config.kaggle.enabled,
    geminiEnabled: Boolean(config.gemini.apiKey),
  };
}

export function missingFor(feature: "supabase" | "kaggle" | "wompi"): string[] {
  const map = {
    supabase: [
      ["SUPABASE_URL", config.supabase.url],
      ["SUPABASE_ANON_KEY", config.supabase.anonKey],
      ["SUPABASE_SERVICE_ROLE_KEY", config.supabase.serviceRoleKey],
    ],
    kaggle: [
      ["KAGGLE_USERNAME", config.kaggle.username],
      ["KAGGLE_KEY", config.kaggle.key],
      ["KAGGLE_FLUX_KERNEL", config.kaggle.fluxKernel],
    ],
    wompi: [
      ["WOMPI_PUBLIC_KEY", config.wompi.publicKey],
      ["WOMPI_INTEGRITY_SECRET", config.wompi.integritySecret],
      ["WOMPI_EVENTS_SECRET", config.wompi.eventsSecret],
    ],
  } as const;

  return map[feature].filter(([, value]) => !value).map(([name]) => name as string);
}
