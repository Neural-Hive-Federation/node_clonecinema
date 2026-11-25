import type { AnalyzeResponse, ChatResponse, CreditPackage, PlanPayload, TrendingResponse, TrendingWinner } from "../types";
import { getAccessToken } from "./supabase";

export class ApiError extends Error {
  status: number;
  code?: string;
  balance?: number;
  required?: number;

  constructor(message: string, status: number, data: any = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = data?.code;
    this.balance = typeof data?.balance === "number" ? data.balance : undefined;
    this.required = typeof data?.required === "number" ? data.required : undefined;
  }
}

export class PaymentRequiredError extends ApiError {
  constructor(message: string, data: any) {
    super(message, 402, data);
    this.name = "PaymentRequiredError";
  }
}

export class AuthRequiredError extends ApiError {
  constructor(message: string, data: any) {
    super(message, 401, data);
    this.name = "AuthRequiredError";
  }
}

export function isPaymentRequired(err: unknown): err is PaymentRequiredError {
  return err instanceof PaymentRequiredError || (err as any)?.status === 402;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(await authHeaders()),
    ...((init.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...init, headers });
  const data: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.error || `Error ${res.status}`;
    if (res.status === 402) throw new PaymentRequiredError(message, data);
    if (res.status === 401) throw new AuthRequiredError(message, data);
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, body === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(body) });
}

/* ------------------------------------------------------------------ *
 * Director / análisis
 * ------------------------------------------------------------------ */

export function chat(
  messages: { role: string; content: string }[],
  project: unknown,
  mode: string,
  attachments: string[]
): Promise<ChatResponse> {
  return post<ChatResponse>("/api/ai/chat", { messages, project, mode, attachments });
}

export function analyzeLink(input: {
  url: string;
  brief: string;
  mode: string;
  format: string;
  duration: number;
  referenceImage?: string;
}): Promise<AnalyzeResponse> {
  return post<AnalyzeResponse>("/api/viral/analyze", input);
}

export function getTrendingWinners(): Promise<TrendingResponse> {
  return request<TrendingResponse>("/api/viral/trending");
}

export function updateTrendingStatus(
  id: string,
  status: "available" | "cloned" | "published"
): Promise<{ success: boolean }> {
  return post<{ success: boolean }>("/api/viral/trending/status", { id, status });
}

export async function generateSpeech(text: string, voice: string): Promise<string> {
  const data = await post<{ success: boolean; audioUrl?: string | null; audioBase64?: string; mimeType?: string; error?: string }>(
    "/api/ai/speech",
    { text, voice, tone: "cinematic, intimate and confident" }
  );
  if (data.audioUrl) {
    return data.audioUrl;
  }
  if (!data.audioBase64) throw new Error(data.error || "Sin audio");
  return `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`;
}

/* ------------------------------------------------------------------ *
 * Generación con créditos (Kaggle / Gemini)
 * ------------------------------------------------------------------ */

interface JobStatus {
  success: boolean;
  status?: string;
  done: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  error?: string;
}

const POLL_MS = 3000;
const MAX_QUEUE_MS = 35 * 60 * 1000; // Hasta 35 minutos tolerando cola de espera de GPU en Kaggle durante horas pico
const MAX_RUNNING_MS = 12 * 60 * 1000; // Hasta 12 minutos una vez que la GPU está activamente ejecutando

export async function waitForJobFull(
  jobId: string,
  kind: "image" | "video",
  signal?: AbortSignal,
  onStatusUpdate?: (status: string) => void
): Promise<JobStatus> {
  const started = Date.now();
  let runningStarted: number | null = null;
  let lastStatus = "";

  while (true) {
    if (signal?.aborted) {
      throw new Error("Generación cancelada por el usuario.");
    }
    const status = await request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`);

    if (status.error) throw new Error(status.error);
    if (status.done) {
      return status;
    }
    lastStatus = (status.status || "queued").toLowerCase();
    if (onStatusUpdate) {
      onStatusUpdate(lastStatus);
    }

    if (lastStatus === "running" && !runningStarted) {
      runningStarted = Date.now();
    }

    if (runningStarted) {
      if (Date.now() - runningStarted > MAX_RUNNING_MS) {
        throw new Error(`La tarea se excedió del tiempo límite en GPU (${Math.round(MAX_RUNNING_MS / 60000)} min).`);
      }
    } else {
      if (Date.now() - started > MAX_QUEUE_MS) {
        throw new Error(`La tarea superó el tiempo máximo de cola (${Math.round(MAX_QUEUE_MS / 60000)} min). Kaggle está saturado.`);
      }
    }

    if (signal?.aborted) {
      throw new Error("Generación cancelada por el usuario.");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Sondea un job hasta que termina. Devuelve la URL del artefacto. */
async function waitForJob(
  jobId: string,
  kind: "image" | "video",
  signal?: AbortSignal,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  const status = await waitForJobFull(jobId, kind, signal, onStatusUpdate);
  const url = kind === "image" ? status.imageUrl : status.videoUrl;
  if (url) return url;
  throw new Error("La tarea terminó sin entregar el archivo.");
}

export async function generateImage(
  prompt: string,
  aspectRatio: string,
  references?: { character?: string; location?: string; prop?: string },
  strength?: number,
  signal?: AbortSignal,
  onStatusUpdate?: (status: string) => void,
  negativePrompt?: string
): Promise<string> {
  if (signal?.aborted) throw new Error("Generación cancelada por el usuario.");
  const data = await post<{
    success: boolean;
    imageUrl?: string;
    jobId?: string;
    error?: string;
  }>("/api/generate/image", { prompt, aspectRatio, references, strength, negativePrompt });

  if (data.imageUrl) return data.imageUrl;
  if (data.jobId) return waitForJob(data.jobId, "image", signal, onStatusUpdate);
  throw new Error(data.error || "Sin imagen");
}

export async function generateImageVariations(
  prompt: string,
  aspectRatio: string = "1:1",
  count: number = 4,
  negativePrompt?: string
): Promise<string[]> {
  const data = await post<{
    success: boolean;
    jobId?: string;
    imageUrl?: string;
    imageUrls?: string[];
    error?: string;
  }>("/api/generate/image", { prompt, aspectRatio, count, negativePrompt });

  if (Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
    return data.imageUrls;
  }
  if (data.imageUrl && count <= 1) return [data.imageUrl];
  if (data.jobId) {
    const status = await waitForJobFull(data.jobId, "image");
    if (Array.isArray(status.imageUrls) && status.imageUrls.length > 0) {
      return status.imageUrls;
    }
    if (status.imageUrl) return [status.imageUrl];
  }
  throw new Error(data.error || "Sin imágenes generadas");
}

export function startVideo(
  prompt: string,
  aspectRatio: string,
  imageUrl?: string,
  durationSeconds?: number
): Promise<{ success?: boolean; jobId?: string; operationName?: string; error?: string }> {
  return post("/api/generate/video", { prompt, aspectRatio, imageUrl, durationSeconds });
}

/** Acepta tanto jobs de Kaggle como operaciones de Veo. */
export function videoStatus(id: string) {
  return request<{ success: boolean; done: boolean; videoUrl?: string; error?: string }>(
    `/api/jobs/${encodeURIComponent(id)}`
  );
}

/* ------------------------------------------------------------------ *
 * Cuenta, créditos y pagos
 * ------------------------------------------------------------------ */

export interface MeResponse {
  authenticated: boolean;
  user?: {
    id: string;
    email: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    plan: string;
  };
  credits: number | null;
  billingEnabled: boolean;
  accountsEnabled: boolean;
  anonymousGeneration: boolean;
  costs: { image: number; video: number };
}

export function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/api/account/me");
}

export function getPackages(): Promise<{
  packages: CreditPackage[];
  currency: string;
  billingEnabled: boolean;
}> {
  return request("/api/wompi/packages");
}

export function createCheckout(packageId: string): Promise<{
  success: boolean;
  checkoutUrl: string;
  reference: string;
  package: CreditPackage;
}> {
  return post("/api/wompi/checkout", { packageId });
}

export function checkPayment(reference: string): Promise<{
  status: string;
  credited?: number;
  balance?: number;
  package?: CreditPackage;
}> {
  return request(`/api/wompi/status?reference=${encodeURIComponent(reference)}`);
}

export function isPlan(value: unknown): value is PlanPayload {
  return !!value && typeof value === "object" && Array.isArray((value as any).shots);
}
