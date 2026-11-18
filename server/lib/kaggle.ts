import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { config } from "./config";

export type KaggleTask = "image" | "flux_redux" | "video";
export type KernelStatus = "queued" | "running" | "done" | "error";

const TEMPLATE_ROOT = path.join(process.cwd(), "kaggle");
const TEMPLATE_DIR: Record<KaggleTask, string> = {
  image: path.join(TEMPLATE_ROOT, "flux_image"),
  flux_redux: path.join(TEMPLATE_ROOT, "flux_redux"),
  video: path.join(TEMPLATE_ROOT, "wan_i2v"),
};
const OUTPUT_FILE: Record<KaggleTask, string> = {
  image: "output_image.png",
  flux_redux: "output_image.png",
  video: "output_video.mp4",
};

interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function runKaggle(args: string[], timeoutMs = 120_000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("kaggle", args, {
      env: {
        ...process.env,
        KAGGLE_USERNAME: config.kaggle.username,
        KAGGLE_KEY: config.kaggle.key,
        // La CLI escribe caché aquí; en entornos efímeros necesita un HOME válido.
        KAGGLE_CONFIG_DIR: process.env.KAGGLE_CONFIG_DIR || path.join(os.homedir(), ".kaggle"),
      },
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`kaggle ${args[0]} ${args[1] || ""} excedió ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `No se pudo ejecutar la CLI de Kaggle (${err.message}). Instálala con "pip install kaggle" y configura KAGGLE_USERNAME / KAGGLE_KEY.`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

export function kernelRefFor(task: KaggleTask): string {
  const configured =
    task === "flux_redux"
      ? config.kaggle.fluxReduxKernel
      : task === "image"
      ? config.kaggle.fluxKernel
      : config.kaggle.videoKernel;
  if (!configured) throw new Error(`Falta el kernel de ${task} (KAGGLE_FLUX_KERNEL / KAGGLE_FLUX_REDUX_KERNEL / KAGGLE_VIDEO_KERNEL).`);
  const withOwner = configured.includes("/")
    ? configured
    : `${config.kaggle.username}/${configured}`;
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(withOwner)) {
    throw new Error(`Referencia de kernel inválida: ${withOwner}`);
  }
  return withOwner;
}

async function renderTemplate(task: KaggleTask, payload: Record<string, unknown>) {
  const source = await fs.readFile(path.join(TEMPLATE_DIR[task], "main.py"), "utf8");
  const metadata = JSON.parse(
    await fs.readFile(path.join(TEMPLATE_DIR[task], "kernel-metadata.json"), "utf8")
  );

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const code = source.replace("__PAYLOAD_B64__", encoded);
  const sizeKb = (Buffer.byteLength(code, "utf8") / 1024).toFixed(1);
  console.log(`[kaggle push] Tamaño total del script generado (${task}): ${sizeKb} KB`);
  if (Buffer.byteLength(code, "utf8") > 980 * 1024) {
    throw new Error(`El payload generado (${sizeKb} KB) supera el límite de 1MB de Kaggle. Reduce el tamaño de las referencias.`);
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `clonecinema-${task}-`));
  await fs.writeFile(path.join(dir, "main.py"), code, "utf8");
  await fs.writeFile(
    path.join(dir, "kernel-metadata.json"),
    JSON.stringify({ ...metadata, id: kernelRefFor(task), code_file: "main.py" }, null, 2),
    "utf8"
  );
  return dir;
}

/**
 * Publica una versión nueva del kernel con el payload embebido y la pone a correr.
 * Kaggle no admite parámetros en tiempo de ejecución: la "inyección de payload"
 * es la forma soportada de mandar un prompt por trabajo.
 */
export async function submitKernelJob(
  task: KaggleTask,
  payload: Record<string, unknown>
): Promise<{ kernelRef: string }> {
  const kernelRef = kernelRefFor(task);
  const dir = await renderTemplate(task, payload);

  try {
    console.log(`[kaggle push] Iniciando push para ${task} (${kernelRef})...`);
    const { stdout, stderr, code } = await runKaggle(["kernels", "push", "-p", dir], 240_000);
    const output = `${stdout}\n${stderr}`;
    console.log(`[kaggle push] Resultado: code=${code}, output: ${output.trim()}`);
    if (code !== 0 || /error|failed/i.test(output) && !/successfully/i.test(output)) {
      throw new Error(`Kaggle rechazó el push: ${output.trim().slice(0, 500)}`);
    }
    return { kernelRef };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function kernelStatus(kernelRef: string): Promise<KernelStatus> {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(kernelRef)) {
    throw new Error(`Referencia de kernel inválida: ${kernelRef}`);
  }
  const { stdout, stderr, code } = await runKaggle(["kernels", "status", kernelRef], 90_000);
  const output = `${stdout}\n${stderr}`;

  if (/COMPLETE/.test(output)) return "done";
  if (/ERROR|CANCEL|FAILED/.test(output)) return "error";
  if (/QUEUED|PENDING/.test(output)) return "queued";
  if (/RUNNING/.test(output)) return "running";
  if (code !== 0) throw new Error(`Kaggle status falló: ${output.trim().slice(0, 300)}`);
  return "running";
}

/** Descarga el artefacto de la última versión del kernel. */
export async function downloadKernelOutput(
  task: KaggleTask,
  kernelRef: string,
  expectedJobId?: string
): Promise<Buffer> {
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(kernelRef)) {
    throw new Error(`Referencia de kernel inválida: ${kernelRef}`);
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `clonecinema-out-${task}-`));
  try {
    const { stdout, stderr, code } = await runKaggle(
      ["kernels", "output", kernelRef, "-p", dir],
      300_000
    );
    if (code !== 0) {
      throw new Error(`No se pudo descargar el output: ${`${stdout}\n${stderr}`.trim().slice(0, 400)}`);
    }

    // El kernel escribe result.json con el job_id: si no coincide o no existe,
    // el artefacto pertenece a una ejecución previa del kernel y no se debe entregar.
    if (expectedJobId) {
      try {
        const meta = JSON.parse(await fs.readFile(path.join(dir, "result.json"), "utf8"));
        if (meta?.job_id !== expectedJobId) {
          throw new Error(
            `El output disponible en Kaggle (job_id: ${meta?.job_id || "antiguo"}) no coincide con esta tarea (${expectedJobId}). Esperando nueva versión.`
          );
        }
      } catch (err: any) {
        throw new Error(
          `Esperando confirmación de artefacto para ${expectedJobId}: ${err?.message || "result.json no listo"}`
        );
      }
    }

    const expected = path.join(dir, OUTPUT_FILE[task]);
    try {
      return await fs.readFile(expected);
    } catch {
      const files = await fs.readdir(dir);
      const fallback = files.find((f) => f.endsWith(task === "image" ? ".png" : ".mp4"));
      if (!fallback) {
        throw new Error(`El kernel terminó sin ${OUTPUT_FILE[task]} (archivos: ${files.join(", ") || "ninguno"}).`);
      }
      return await fs.readFile(path.join(dir, fallback));
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
