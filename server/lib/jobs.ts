import { randomUUID } from "crypto";
import { config } from "./config";
import { refundCredits } from "./credits";
import { downloadKernelOutput, kernelStatus, type KaggleTask } from "./kaggle";
import { storeAsset } from "./storage";
import { supabaseAdmin } from "./supabase";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  userId: string | null;
  kind: KaggleTask;
  status: JobStatus;
  provider: "kaggle" | "gemini";
  kernelRef: string | null;
  prompt: string;
  inputUrl: string | null;
  outputUrl: string | null;
  creditsCharged: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const MAX_IN_MEMORY = 200;
const memory = new Map<string, Job>();

function remember(job: Job) {
  memory.set(job.id, job);
  if (memory.size > MAX_IN_MEMORY) {
    const oldest = [...memory.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (oldest) memory.delete(oldest.id);
  }
}

function fromRow(row: any): Job {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    kind: row.kind,
    status: row.status,
    provider: (row.provider || "kaggle") as Job["provider"],
    kernelRef: row.kernel_ref ?? null,
    prompt: row.prompt || "",
    inputUrl: row.input_url ?? null,
    outputUrl: row.output_url ?? null,
    creditsCharged: Number(row.credits_charged || 0),
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function persist(job: Job) {
  const db = supabaseAdmin();
  if (!db) return;
  const { error } = await db.from("ai_jobs").upsert(
    {
      id: job.id,
      user_id: job.userId,
      kind: job.kind,
      status: job.status,
      provider: job.provider,
      kernel_ref: job.kernelRef,
      prompt: job.prompt.slice(0, 4000),
      input_url: job.inputUrl,
      output_url: job.outputUrl,
      credits_charged: job.creditsCharged,
      error: job.error,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    },
    { onConflict: "id" }
  );
  if (error) console.error("[jobs] no se pudo persistir:", error.message);
}

export async function createJob(input: {
  userId: string | null;
  kind: KaggleTask;
  provider?: Job["provider"];
  prompt: string;
  inputUrl?: string | null;
  creditsCharged: number;
}): Promise<Job> {
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    userId: input.userId,
    kind: input.kind,
    status: "queued",
    provider: input.provider || "kaggle",
    kernelRef: null,
    prompt: input.prompt,
    inputUrl: input.inputUrl ?? null,
    outputUrl: null,
    creditsCharged: input.creditsCharged,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  remember(job);
  await persist(job);
  return job;
}

export async function saveJob(job: Job): Promise<Job> {
  job.updatedAt = new Date().toISOString();
  remember(job);
  await persist(job);
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  const local = memory.get(id);
  if (local) return local;

  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db.from("ai_jobs").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[jobs] lectura falló:", error.message);
    return null;
  }
  if (!data) return null;
  const job = fromRow(data);
  remember(job);
  return job;
}

export async function failJob(job: Job, message: string): Promise<Job> {
  job.status = "error";
  job.error = message.slice(0, 800);
  if (job.creditsCharged > 0) {
    await refundCredits(job.userId!, job.creditsCharged);
    job.creditsCharged = 0;
  }
  return saveJob(job);
}

export async function completeJob(job: Job, outputUrl: string): Promise<Job> {
  job.status = "done";
  job.outputUrl = outputUrl;
  job.error = null;
  return saveJob(job);
}

/**
 * Avanza el estado de un job de Kaggle. El sondeo es la única fuente de verdad:
 * se consulta el kernel y, si terminó, se descarga y publica el artefacto.
 */
export async function advanceJob(job: Job): Promise<Job> {
  if (job.provider !== "kaggle" || job.status === "done" || job.status === "error") return job;
  if (!job.kernelRef) return job;

  const age = Date.now() - Date.parse(job.createdAt);
  if (age > config.kaggle.jobTimeoutMs) {
    return failJob(
      job,
      `La tarea superó ${Math.round(config.kaggle.jobTimeoutMs / 60000)} min en Kaggle. Créditos devueltos.`
    );
  }

  try {
    const status = await kernelStatus(job.kernelRef);

    if (status === "error") {
      return failJob(job, "El kernel de Kaggle terminó con error. Revisa el log del kernel. Créditos devueltos.");
    }

    if (status === "done") {
      try {
        const data = await downloadKernelOutput(job.kind, job.kernelRef, job.id);
        const url = await storeAsset({
          userId: job.userId,
          jobId: job.id,
          kind: job.kind === "flux_redux" ? "image" : job.kind,
          data,
          contentType: job.kind === "video" ? "video/mp4" : "image/png",
        });
        return completeJob(job, url);
      } catch (err: any) {
        // Si el artefacto disponible aún pertenece a una corrida anterior o result.json no está listo,
        // no fallamos la tarea: Kaggle está transicionando o ejecutando la nueva versión.
        if (
          err?.message?.includes("no coincide") ||
          err?.message?.includes("Esperando") ||
          err?.message?.includes("result.json")
        ) {
          console.log(`[jobs] ${job.id}: Artefacto de corrida previa detectado. Esperando nueva versión en Kaggle...`);
          job.status = "running";
          return saveJob(job);
        }
        throw err;
      }
    }

    job.status = status === "queued" ? "queued" : "running";
    return saveJob(job);
  } catch (err: any) {
    // Un fallo de red no debe quemar créditos: se reporta como error del job.
    return failJob(job, err?.message || "No se pudo consultar Kaggle.");
  }
}
