import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 30,
};

function getSupabaseAdmin() {
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
    : "Kaggle Wan 2.1 ComfyUI Warm Server";

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("ai_jobs")
        .select("id, input_url, status, updated_at")
        .eq("id", targetId)
        .maybeSingle();

      if (error || !data || !data.input_url) {
        return res.status(200).json({ online: false, tunnelUrl: null, service: isVoice ? "voice" : "wan" });
      }

      const tunnelUrl = data.input_url.trim().replace(/\/+$/, "");
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const check = await fetch(`${tunnelUrl}${healthPath}`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.status(200).json({
          online: check.ok,
          tunnelUrl,
          service: isVoice ? "voice" : "wan",
          lastHeartbeat: data.updated_at,
        });
      } catch {
        return res.status(200).json({
          online: false,
          tunnelUrl,
          service: isVoice ? "voice" : "wan",
          lastHeartbeat: data.updated_at,
        });
      }
    }

    // POST: Registrar o actualizar la URL del túnel Cloudflare
    const { tunnelUrl } = req.body || {};
    if (!tunnelUrl || typeof tunnelUrl !== "string") {
      return res.status(400).json({ error: "Falta tunnelUrl válido." });
    }

    const cleanUrl = tunnelUrl.trim().replace(/\/+$/, "");

    // Validar conectividad rápida con el túnel
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
    return res.status(500).json({ error: err?.message || "Error registrando túnel." });
  }
}
