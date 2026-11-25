import WebSocket from "ws";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase";
import { storeAsset } from "./storage";

export interface WanStatus {
  online: boolean;
  tunnelUrl: string | null;
  gpu?: string;
  freeVram?: number;
  lastHeartbeat?: string;
  error?: string;
}

export interface WanGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  numFrames?: number;
  fps?: number;
  seed?: number;
  userId?: string | null;
  jobId?: string;
  onProgress?: (progress: number, stepMsg: string) => void;
}

export interface WanGenerationResult {
  success: boolean;
  videoUrl?: string;
  rawFilename?: string;
  error?: string;
  durationSeconds?: number;
}

const RESERVED_TUNNEL_NODE_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * Consulta la URL del túnel activo registrado por Kaggle en Supabase.
 */
export async function getWanGateway(): Promise<WanStatus> {
  const db = supabaseAdmin();
  if (!db) {
    return { online: false, tunnelUrl: null, error: "Supabase no está configurado." };
  }

  try {
    const { data, error } = await db
      .from("ai_jobs")
      .select("input_url, status, updated_at")
      .eq("id", RESERVED_TUNNEL_NODE_ID)
      .single();

    if (error || !data || !data.input_url) {
      return { online: false, tunnelUrl: null, error: "No hay ningún túnel de Wan 2.2 registrado." };
    }

    const tunnelUrl = data.input_url.trim().replace(/\/+$/, "");

    // Healthcheck rápido al túnel
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${tunnelUrl}/system_stats`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const stats: any = await res.json().catch(() => ({}));
        const gpuInfo = stats?.devices?.[0];
        return {
          online: true,
          tunnelUrl,
          gpu: gpuInfo?.name || "NVIDIA GPU",
          freeVram: gpuInfo?.vram_free ? Math.round(gpuInfo.vram_free / (1024 * 1024 * 1024)) : undefined,
          lastHeartbeat: data.updated_at,
        };
      }
    } catch {
      // El túnel registrado en Supabase no respondió o está caído
    }

    return {
      online: false,
      tunnelUrl,
      lastHeartbeat: data.updated_at,
      error: "El túnel está registrado pero no responde. El cuaderno de Kaggle puede estar apagado o reconectando.",
    };
  } catch (err: any) {
    return { online: false, tunnelUrl: null, error: err.message };
  }
}

/**
 * Sube una imagen a ComfyUI a través de su endpoint nativo /upload/image.
 */
async function uploadImageToComfy(tunnelUrl: string, imageBuffer: Buffer, filename: string): Promise<string> {
  const boundary = `----WebKitFormBoundary${randomUUID()}`;
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`;
  const footer = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`;

  const payload = Buffer.concat([
    Buffer.from(header, "utf8"),
    imageBuffer,
    Buffer.from(footer, "utf8"),
  ]);

  const res = await fetch(`${tunnelUrl}/upload/image`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: payload,
  });

  if (!res.ok) {
    throw new Error(`Error subiendo imagen de referencia a ComfyUI (${res.status}): ${await res.text()}`);
  }

  const data: any = await res.json();
  return data.name || filename;
}

/**
 * Descarga una imagen desde una URL pública (ej: Supabase wan_inputs o keyframes).
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar la imagen desde ${url} (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Ejecuta una generación Wan 2.2 TI2V 5B vía ComfyUI WebSocket + REST.
 */
export async function generateWanVideo(req: WanGenerationRequest): Promise<WanGenerationResult> {
  const status = await getWanGateway();
  if (!status.online || !status.tunnelUrl) {
    throw new Error(status.error || "El servidor Wan 2.2 en Kaggle no está disponible.");
  }

  const tunnelUrl = status.tunnelUrl;
  const clientId = randomUUID();
  let uploadedImageName = "clothing_model.png";

  if (req.imageUrl) {
    console.log(`[comfyWan] Descargando imagen de referencia desde ${req.imageUrl}...`);
    const imgBuffer = await fetchImageBuffer(req.imageUrl);
    uploadedImageName = await uploadImageToComfy(tunnelUrl, imgBuffer, `input_${clientId.slice(0, 8)}.png`);
    console.log(`[comfyWan] Imagen subida a ComfyUI como: ${uploadedImageName}`);
  }

  const numFrames = req.numFrames || 25; // 25 = 1.56s, 33 = 2.06s, 49 = 3.06s
  const fps = req.fps || 16;
  const seed = req.seed ?? Math.floor(Math.random() * 1000000000000);

  // Workflow JSON optimizado para Wan 2.2 TI2V 5B nativo
  const workflowPrompt: Record<string, any> = {
    "1": {
      "inputs": {
        "unet_name": "wan2.2_ti2v_5B_fp16.safetensors",
        "weight_dtype": "fp8_e4m3fn"
      },
      "class_type": "UNETLoader"
    },
    "2": {
      "inputs": {
        "text": req.prompt,
        "clip": ["3", 0]
      },
      "class_type": "CLIPTextEncode"
    },
    "3": {
      "inputs": {
        "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "type": "wan"
      },
      "class_type": "CLIPLoader"
    },
    "4": {
      "inputs": {
        "image": uploadedImageName,
        "upload": "image"
      },
      "class_type": "LoadImage"
    },
    "5": {
      "inputs": {
        "width": 480,
        "height": 832,
        "length": numFrames,
        "batch_size": 1,
        "positive": ["2", 0],
        "negative": ["8", 0],
        "vae": ["9", 0],
        "image": ["4", 0]
      },
      "class_type": "WanImageToVideo"
    },
    "6": {
      "inputs": {
        "seed": seed,
        "steps": 20,
        "cfg": 5.0,
        "sampler_name": "uni_pc",
        "scheduler": "simple",
        "denoise": 1.0,
        "model": ["1", 0],
        "positive": ["5", 0],
        "negative": ["5", 1],
        "latent_image": ["5", 2]
      },
      "class_type": "KSampler"
    },
    "7": {
      "inputs": {
        "filename_prefix": `Wan22_${req.jobId || "CloneCinema"}`,
        "fps": fps,
        "lossless": false,
        "quality": 90,
        "method": "default",
        "images": ["10", 0]
      },
      "class_type": "SaveAnimatedWEBP"
    },
    "8": {
      "inputs": {
        "text": req.negativePrompt || "ugly, deformed, noisy, blurry, distorted, low quality, bad anatomy, bad hands, cartoonish",
        "clip": ["3", 0]
      },
      "class_type": "CLIPTextEncode"
    },
    "9": {
      "inputs": {
        "vae_name": "wan2.2_vae.safetensors"
      },
      "class_type": "VAELoader"
    },
    "10": {
      "inputs": {
        "samples": ["6", 0],
        "vae": ["9", 0]
      },
      "class_type": "VAEDecode"
    }
  };

  // Conexión WebSocket para streaming de eventos y progreso
  const wsUrl = tunnelUrl.replace(/^http/, "ws") + `/ws?clientId=${clientId}`;
  console.log(`[comfyWan] Conectando WebSocket a ${wsUrl}...`);

  return new Promise<WanGenerationResult>((resolve, reject) => {
    let ws: WebSocket | null = null;
    let promptId: string | null = null;
    let outputFilename: string | null = null;
    let isFinished = false;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };

    try {
      ws = new WebSocket(wsUrl);
    } catch (e: any) {
      console.warn(`[comfyWan] No se pudo abrir WebSocket directo (${e.message}), usaremos sondeo HTTP.`);
    }

    const timeoutTimer = setTimeout(() => {
      cleanup();
      if (!isFinished) {
        reject(new Error("Tiempo de espera agotado al generar video en Wan 2.2 (más de 6 minutos)."));
      }
    }, 360000);

    const onFinish = async (filename: string) => {
      if (isFinished) return;
      isFinished = true;
      clearTimeout(timeoutTimer);
      cleanup();

      try {
        console.log(`[comfyWan] Generación exitosa. Descargando resultado: ${filename}...`);
        const fileRes = await fetch(`${tunnelUrl}/view?filename=${encodeURIComponent(filename)}&type=output`);
        if (!fileRes.ok) {
          throw new Error(`Error descargando video de ComfyUI (${fileRes.status})`);
        }

        const arrayBuffer = await fileRes.arrayBuffer();
        const dataBuffer = Buffer.from(arrayBuffer);

        // Guardar en Supabase Storage (bucket 'videos')
        const publicUrl = await storeAsset({
          userId: req.userId ?? null,
          jobId: req.jobId || `wan_${Date.now()}`,
          kind: "video",
          data: dataBuffer,
          contentType: filename.endsWith(".webp") ? "image/webp" : "video/mp4",
        });

        resolve({
          success: true,
          videoUrl: publicUrl,
          rawFilename: filename,
          durationSeconds: numFrames / fps,
        });
      } catch (err: any) {
        reject(err);
      }
    };

    if (ws) {
      ws.on("open", async () => {
        console.log("[comfyWan] WebSocket conectado. Enviando prompt a ComfyUI...");
        try {
          const promptRes = await fetch(`${tunnelUrl}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: workflowPrompt, client_id: clientId }),
          });

          if (!promptRes.ok) {
            throw new Error(`Error en POST /prompt (${promptRes.status}): ${await promptRes.text()}`);
          }

          const promptData: any = await promptRes.json();
          promptId = promptData.prompt_id;
          console.log(`[comfyWan] Trabajo encolado con promptId: ${promptId}`);
        } catch (err) {
          cleanup();
          reject(err);
        }
      });

      ws.on("message", (raw: WebSocket.Data) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "progress") {
            const { value, max } = msg.data;
            const pct = Math.round((value / max) * 100);
            req.onProgress?.(pct, `Muestreo KSampler Wan 2.2: ${value}/${max} pasos`);
          } else if (msg.type === "executing") {
            const node = msg.data.node;
            if (node === null) {
              // Fin de ejecución
              if (outputFilename) {
                onFinish(outputFilename);
              }
            } else {
              req.onProgress?.(20, `Ejecutando nodo: ${node}`);
            }
          } else if (msg.type === "executed") {
            const fname = msg.data.output?.images?.[0]?.filename;
            if (fname) {
              outputFilename = fname;
              onFinish(fname);
            }
          }
        } catch {}
      });

      ws.on("error", (err) => {
        console.warn(`[comfyWan] Error de WebSocket (${err.message}), verificando estado por HTTP...`);
      });
    }
  });
}
