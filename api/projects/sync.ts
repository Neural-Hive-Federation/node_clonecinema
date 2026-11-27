import { createClient } from "@supabase/supabase-js";

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

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function toDbRow(p: any) {
  return {
    id: p.id,
    name: p.name || p.title || "Sin título",
    title: p.title || p.name || "Sin título",
    mode: p.mode || "clone",
    format: p.format || "9:16",
    duration: p.duration || 15,
    style: p.style || "",
    language: p.language || "es",
    logline: p.logline || "",
    brief: p.brief || "",
    source_url: p.sourceUrl || p.source_url || null,
    source_meta: p.sourceMeta || p.source_meta || {},
    viral_dna: p.viralDNA || p.viral_dna || {},
    references: p.references || [],
    shots: p.shots || [],
    characters: p.characters || [],
    locations: p.locations || [],
    props: p.props || [],
    audio: p.audio || {},
    publish: {
      ...(p.publish || {}),
      masterVideoUrl: p.masterVideoUrl || p.publish?.masterVideoUrl || (p.id === "prj-radar-social" ? "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/clonecinema_radar_social_master_final.mp4" : undefined),
    },
    chat: p.chat || [],
    updated_at: new Date().toISOString(),
  };
}

function fromDbRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    title: r.title,
    mode: r.mode,
    format: r.format,
    duration: r.duration,
    style: r.style,
    language: r.language,
    logline: r.logline,
    brief: r.brief,
    sourceUrl: r.source_url || "",
    sourceMeta: r.source_meta || {},
    viralDNA: r.viral_dna || {},
    references: r.references || [],
    shots: r.shots || [],
    characters: r.characters || [],
    locations: r.locations || [],
    props: r.props || [],
    audio: r.audio || {},
    publish: r.publish,
    masterVideoUrl: r.publish?.masterVideoUrl || (r.id === "prj-radar-social" ? "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/clonecinema_radar_social_master_final.mp4" : null),
    chat: r.chat || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(200).json({ success: false, warning: "Supabase no configurado" });
  }

  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        return res.status(200).json({ success: false, error: error.message });
      }

      const projects = (data || []).map(fromDbRow);
      return res.status(200).json({ success: true, projects });
    } catch (err: any) {
      return res.status(200).json({ success: false, error: err?.message || String(err) });
    }
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      const project = body?.project;
      if (!project || !project.id) {
        return res.status(400).json({ error: "Falta el objeto project o project.id" });
      }

      const row = toDbRow(project);
      const { error } = await supabase
        .from("projects")
        .upsert(row, { onConflict: "id" });

      if (error) {
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(200).json({ success: true, id: project.id });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
