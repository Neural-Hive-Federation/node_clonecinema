import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

const KAGGLE_API_BASE = "https://api.kaggle.com/v1";

function getSupabaseAdmin() {
  if (typeof (globalThis as any).WebSocket === "undefined") {
    (globalThis as any).WebSocket = class {};
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    throw new Error("Supabase credentials no configuradas.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getKaggleAuthHeaders(): HeadersInit {
  const token =
    process.env.KAGGLE_KEY ||
    process.env.KAGGLE_API_TOKEN ||
    "";

  if (!token) {
    throw new Error("Kaggle API token no configurado.");
  }

  return {
    Authorization: `Bearer ${token.trim()}`,
    "Content-Type": "application/json",
  };
}

async function wakeKaggleWan22(): Promise<{ ref: string; versionNumber: number }> {
  const username = process.env.KAGGLE_USERNAME || "wilycol";
  const headers = getKaggleAuthHeaders();

  // Cargamos el cuaderno oficial con Watchdog 2.0 embebido
  const fs = await import("fs");
  const path = await import("path");
  let notebookText = "";

  const candidatePaths = [
    path.join(process.cwd(), "kaggle", "wan22_ti2v", "CloneCinema_Wan2_2_TI2V_Kaggle.ipynb"),
    path.join(process.cwd(), "..", "kaggle", "wan22_ti2v", "CloneCinema_Wan2_2_TI2V_Kaggle.ipynb"),
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        notebookText = fs.readFileSync(p, "utf-8");
        break;
      }
    } catch {}
  }

  if (!notebookText) {
    const b64Path = path.join(process.cwd(), "scratch", "nb_b64.txt");
    try {
      if (fs.existsSync(b64Path)) {
        const raw = fs.readFileSync(b64Path, "utf-8");
        notebookText = Buffer.from(raw, "base64").toString("utf-8");
      }
    } catch {}
  }

  const body = {
    slug: `${username}/clonecinema-wan-2-2-ti2v`,
    newTitle: "CloneCinema Wan 2.2 TI2V",
    text: notebookText || "{}",
    language: "python",
    kernelType: "notebook",
    isPrivate: true,
    enableGpu: true,
    enableInternet: true,
    datasetSources: ["dhoombhai/wan-2-2-5b-model-data"],
  };

  const res = await fetch(`${KAGGLE_API_BASE}/kernels.KernelsApiService/SaveKernel`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kaggle SaveKernel error (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  return {
    ref: data.ref || `${username}/clonecinema-wan-2-2-ti2v`,
    versionNumber: data.versionNumber,
  };
}

const RESERVED_TUNNEL_ID = "a0000000-0000-0000-0000-000000000001";
const RESERVED_VOICE_STUDIO_ID = "a0000000-0000-0000-0000-000000000002";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const isVoice =
    req.query?.type === "voice" ||
    req.query?.service === "voice" ||
    req.url?.includes("/voice");

  const targetId = isVoice ? RESERVED_VOICE_STUDIO_ID : RESERVED_TUNNEL_ID;
  const healthPath = isVoice ? "/health" : "/system_stats";
  const kind = isVoice ? "audio" : "video";
  const provider = isVoice ? "voice_studio" : "wan22_tunnel";
  const serviceTitle = isVoice
    ? "Colab Voice Studio - Kokoro Multi-Character TTS"
    : "Kaggle Wan 2.2 ComfyUI Warm Server";

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("ai_jobs")
        .select("id, input_url, status, prompt, updated_at")
        .eq("id", targetId)
        .maybeSingle();

      if (error || !data || !data.input_url) {
        return res.status(200).json({
          online: false,
          tunnelUrl: null,
          status: "offline",
          service: isVoice ? "voice" : "wan",
          isWarning: false,
        });
      }

      const tunnelUrl = data.input_url.trim().replace(/\/+$/, "");
      const promptText = String(data.prompt || "");
      const isWarning = data.status === "warning" || promptText.includes("PREAVISO_INACTIVIDAD");

      let warningSeconds = 0;
      if (promptText.includes("PREAVISO_INACTIVIDAD:")) {
        const match = promptText.match(/PREAVISO_INACTIVIDAD:(\d+)/);
        if (match) warningSeconds = parseInt(match[1], 10);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const check = await fetch(`${tunnelUrl}${healthPath}`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.status(200).json({
          online: check.ok,
          tunnelUrl,
          service: isVoice ? "voice" : "wan",
          status: check.ok ? (isWarning ? "warning" : data.status || "running") : "offline",
          isWarning: check.ok && isWarning,
          warningSeconds,
          note: promptText,
          lastHeartbeat: data.updated_at,
        });
      } catch {
        return res.status(200).json({
          online: false,
          tunnelUrl,
          service: isVoice ? "voice" : "wan",
          status: "offline",
          isWarning: false,
          note: promptText,
          lastHeartbeat: data.updated_at,
        });
      }
    }

    // --- ACCIONES POST ---
    const { action, tunnelUrl } = req.body || {};

    // 1. Despertar GPU Automáticamente vía API Kaggle (SaaS Autónomo)
    if (action === "wake") {
      if (isVoice) {
        return res.status(400).json({ error: "El arranque automático solo aplica a Wan 2.2 en Kaggle." });
      }

      console.log("[Wan 2.2 Wake] Despertando servidor en Kaggle...");
      const kernelRes = await wakeKaggleWan22();

      await supabase.from("ai_jobs").upsert(
        {
          id: targetId,
          kind,
          provider,
          status: "booting",
          input_url: "",
          prompt: `Kaggle Wan 2.2 Live Gateway - Arrancando contenedor GPU (v${kernelRes.versionNumber})...`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return res.status(200).json({
        success: true,
        status: "booting",
        kernelVersion: kernelRes.versionNumber,
        message: "Servidor GPU Wan 2.2 despertado con éxito. Inicializando ComfyUI...",
      });
    }

    // 2. Keepalive / Presencia Humana ("Mantener Encendido")
    if (action === "keepalive" || action === "touch") {
      await supabase.from("ai_jobs").update({
        status: "running",
        prompt: "Kaggle Wan 2.2 Live Gateway - KEEPALIVE_CONFIRMED",
        updated_at: new Date().toISOString(),
      }).eq("id", targetId);

      return res.status(200).json({
        success: true,
        message: "Reloj de inactividad reseteado por presencia de usuario.",
      });
    }

    // 3. Apagado Manual Inmediato ("Apagar Ahora")
    if (action === "shutdown") {
      await supabase.from("ai_jobs").update({
        prompt: "Kaggle Wan 2.2 Live Gateway - MANUAL_SHUTDOWN",
        status: "offline",
        updated_at: new Date().toISOString(),
      }).eq("id", targetId);

      return res.status(200).json({
        success: true,
        message: "Orden de apagado manual enviada al Watchdog de Kaggle.",
      });
    }

    // 3.5. Limpieza Masiva de Procesos Zombies / Cancelar Cola
    if (action === "reset_zombies") {
      // 1. Cancelar todos los trabajos que quedaron en "running" o "queued"
      await supabase
        .from("ai_jobs")
        .update({
          status: "error",
          error: "Cancelado por usuario / Limpieza de procesos colgados",
          updated_at: new Date().toISOString(),
        })
        .in("status", ["running", "queued"])
        .neq("id", targetId);

      // 2. Si el túnel de ComfyUI está activo, enviar orden de interrupción
      let comfyCleared = false;
      const { data: gw } = await supabase
        .from("ai_jobs")
        .select("input_url")
        .eq("id", targetId)
        .maybeSingle();

      const activeTunnel = gw?.input_url?.trim().replace(/\/+$/, "");
      if (activeTunnel) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          await fetch(`${activeTunnel}/interrupt`, { method: "POST", signal: controller.signal });
          await fetch(`${activeTunnel}/queue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clear: true }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          comfyCleared = true;
        } catch (e) {
          console.warn("[reset_zombies] ComfyUI interrupt error:", e);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Procesos colgados purgados y cola reseteada con éxito.",
        comfyCleared,
      });
    }

    // 4. Registro o actualización de la URL del túnel Cloudflare (desde el notebook)
    if (!tunnelUrl || typeof tunnelUrl !== "string") {
      return res.status(400).json({ error: "Falta tunnelUrl o action válido." });
    }

    const cleanUrl = tunnelUrl.trim().replace(/\/+$/, "");

    let tunnelActive = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const testRes = await fetch(`${cleanUrl}${healthPath}`, { signal: controller.signal });
      clearTimeout(timeout);
      tunnelActive = testRes.ok;
    } catch {
      tunnelActive = false;
    }

    const { error: upsertErr } = await supabase.from("ai_jobs").upsert(
      {
        id: targetId,
        kind,
        provider,
        status: tunnelActive ? "running" : "offline",
        input_url: cleanUrl,
        prompt: serviceTitle,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upsertErr) {
      console.error("[tunnel/register error]:", upsertErr);
      return res.status(500).json({ error: upsertErr.message });
    }

    return res.status(200).json({
      success: true,
      online: tunnelActive,
      tunnelUrl: cleanUrl,
      service: isVoice ? "voice" : "wan",
      message: tunnelActive
        ? `${serviceTitle} conectado y verificado.`
        : `Túnel guardado, pero aún no responde a ${healthPath}.`,
    });
  } catch (err: any) {
    console.error("[tunnel/register fatal]:", err);
    return res.status(500).json({ error: err?.message || "Error procesando gateway." });
  }
}
