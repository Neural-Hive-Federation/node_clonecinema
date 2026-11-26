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

const RESERVED_VOICE_STUDIO_ID = "a0000000-0000-0000-0000-000000000002";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("ai_jobs")
        .select("id, input_url, status, updated_at")
        .eq("id", RESERVED_VOICE_STUDIO_ID)
        .maybeSingle();

      if (error || !data || !data.input_url) {
        return res.status(200).json({ online: false, tunnelUrl: null });
      }

      const tunnelUrl = data.input_url.trim().replace(/\/+$/, "");
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const check = await fetch(`${tunnelUrl}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.status(200).json({
          online: check.ok,
          tunnelUrl,
          lastHeartbeat: data.updated_at,
        });
      } catch {
        return res.status(200).json({
          online: false,
          tunnelUrl,
          lastHeartbeat: data.updated_at,
        });
      }
    }

    // POST: Registrar túnel de Colab Voice Studio
    const { tunnelUrl } = req.body || {};
    if (!tunnelUrl || typeof tunnelUrl !== "string") {
      return res.status(400).json({ error: "Falta tunnelUrl válido." });
    }

    const cleanUrl = tunnelUrl.trim().replace(/\/+$/, "");

    let active = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const testRes = await fetch(`${cleanUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      active = testRes.ok;
    } catch {
      active = false;
    }

    const { error: upsertErr } = await supabase.from("ai_jobs").upsert(
      {
        id: RESERVED_VOICE_STUDIO_ID,
        kind: "audio",
        provider: "voice_studio",
        status: active ? "running" : "offline",
        input_url: cleanUrl,
        prompt: "Colab Voice Studio - Kokoro Multi-Character TTS Online",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (upsertErr) {
      return res.status(500).json({ error: upsertErr.message });
    }

    return res.status(200).json({
      success: true,
      online: active,
      tunnelUrl: cleanUrl,
      message: active
        ? "Colab Voice Studio conectado exitosamente. Voces multi-personaje activas."
        : "Túnel guardado, esperando respuesta de /health.",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error registrando Voice Studio." });
  }
}
