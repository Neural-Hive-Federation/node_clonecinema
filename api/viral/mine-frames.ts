import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://micjwzatshemmovaneix.supabase.co";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, projectId, duration } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "Falta la URL del video fuente" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase no disponible" });
  }

  try {
    const { data, error } = await supabase.from("messages").insert({
      sender_id: "CLONECINEMA_AUTOPILOT",
      type: "fenix_frame_mining",
      content: `Misión de minería de frames para video: ${url}`,
      metadata: {
        url,
        projectId: projectId || "prj-autopilot",
        duration: duration || 15,
        timestamp: Date.now(),
      },
    }).select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({
      success: true,
      message: "Misión enviada al Nodo Fénix con éxito.",
      missionId: data?.[0]?.id,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
