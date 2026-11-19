import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, aspectRatio, references } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Falta el prompt de la imagen." });
  }

  // Mapear relación de aspecto
  let cfAspect = "vertical";
  if (aspectRatio === "16:9") cfAspect = "horizontal";
  if (aspectRatio === "1:1") cfAspect = "square";

  // Enriquecer prompt con estética cinematográfica fotorrealista y evitar estilo cómic/dibujo
  let enrichedPrompt = prompt.trim();
  if (!enrichedPrompt.toLowerCase().includes("photorealistic")) {
    enrichedPrompt = `${enrichedPrompt}, raw photographic style, photorealistic 35mm film still, cinematic lighting, natural skin texture, 8k uhd, hyperrealistic`;
  }
  if (references?.character) {
    enrichedPrompt = `Consistent protagonist actor portrait, ${enrichedPrompt}`;
  }

  try {
    // 1. Generar imagen de alta velocidad con el Worker de Cloudflare
    const workerUrl = "https://beatriz-image-gen.wilycol1492.workers.dev/";
    const cfRes = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: enrichedPrompt,
        aspect: cfAspect,
      }),
    });

    if (!cfRes.ok) {
      const errText = await cfRes.text();
      throw new Error(`Worker de imagen devolvió error ${cfRes.status}: ${errText.slice(0, 100)}`);
    }

    const arrayBuffer = await cfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Intentar subir a Supabase Storage (Bucket 'keyframes') para URL persistente
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const filename = `keyframe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;

        const { error: uploadError } = await supabase.storage
          .from("keyframes")
          .upload(filename, buffer, {
            contentType: "image/png",
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from("keyframes")
            .getPublicUrl(filename);

          if (publicUrlData?.publicUrl) {
            return res.status(200).json({
              success: true,
              imageUrl: publicUrlData.publicUrl,
              provider: "cloudflare_worker",
            });
          }
        } else {
          console.warn("[Storage Upload Warning]", uploadError.message);
        }
      } catch (storageErr) {
        console.warn("[Storage Upload Fallback to Base64]", storageErr);
      }
    }

    // 3. Fallback: Data URL base64 directa si Supabase no responde
    const b64 = buffer.toString("base64");
    return res.status(200).json({
      success: true,
      imageUrl: `data:image/png;base64,${b64}`,
      provider: "cloudflare_worker",
    });
  } catch (err: any) {
    console.error("[generate/image Error]", err);
    return res.status(502).json({
      success: false,
      error: err?.message || "Error generando imagen",
    });
  }
}
