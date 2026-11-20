import { createClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

async function generateSingleImage(
  prompt: string,
  aspect: string,
  supabase: any,
  seedIndex: number = 0
): Promise<string> {
  let buffer: Buffer | null = null;

  // 1. INTENTO PRINCIPAL: Cloudflare Worker de Wily
  const workerUrl = "https://beatriz-image-gen.wilycol1492.workers.dev/";
  try {
    const cfRes = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        aspect,
      }),
    });

    if (cfRes.ok && cfRes.headers.get("content-type")?.includes("image")) {
      const arrayBuffer = await cfRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      const errText = await cfRes.text();
      console.warn(`[Cloudflare Worker Warning: ${cfRes.status}]`, errText.slice(0, 150));
    }
  } catch (cfErr: any) {
    console.warn("[Cloudflare Worker Connection Warning]:", cfErr?.message || cfErr);
  }

  // 2. FALLBACK RESILIENTE: Pollinations AI (FLUX / SANA)
  if (!buffer) {
    try {
      let width = 1024;
      let height = 576;
      if (aspect === "vertical") {
        width = 576;
        height = 1024;
      } else if (aspect === "square") {
        width = 768;
        height = 768;
      }

      const seed = Math.floor(Math.random() * 100000) + seedIndex * 1337;
      const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;

      const pollRes = await fetch(pollUrl);
      if (pollRes.ok) {
        const arrayBuffer = await pollRes.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        const errText = await pollRes.text();
        console.warn(`[Pollinations Fallback Warning: ${pollRes.status}]`, errText.slice(0, 150));
      }
    } catch (pollErr: any) {
      console.warn("[Pollinations Fallback Error]:", pollErr?.message || pollErr);
    }
  }

  if (!buffer) {
    throw new Error(
      "El motor de generación no respondió a tiempo. Puedes reintentar o usar el botón 'Subir foto' para cargar tu propia imagen directamente."
    );
  }

  // 3. Almacenar permanentemente en Supabase Storage (Bucket 'keyframes')
  if (supabase) {
    try {
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
          return publicUrlData.publicUrl;
        }
      }
    } catch (storageErr) {
      console.warn("[Storage Upload Fallback to Base64]", storageErr);
    }
  }

  // Fallback garantizado a Data URL Base64
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt, aspectRatio, references, count: requestedCount } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Falta el prompt de la imagen." });
  }

  const count = Math.min(Math.max(Number(requestedCount) || 1, 1), 4);

  // Mapear relación de aspecto
  let cfAspect = "vertical";
  if (aspectRatio === "16:9") cfAspect = "horizontal";
  if (aspectRatio === "1:1") cfAspect = "square";

  // Enriquecer prompt con estética cinematográfica fotorrealista
  let enrichedPrompt = prompt.trim();
  if (!enrichedPrompt.toLowerCase().includes("photorealistic")) {
    enrichedPrompt = `${enrichedPrompt}, raw photographic style, photorealistic 35mm film still, cinematic lighting, natural skin texture, 8k uhd, hyperrealistic`;
  }
  if (references?.character) {
    enrichedPrompt = `Consistent protagonist actor portrait, ${enrichedPrompt}`;
  }

  // Cliente de Supabase
  let supabase = null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (initErr) {
      console.warn("[Supabase Client Init Warning]", initErr);
    }
  }

  try {
    const imageUrls: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const url = await generateSingleImage(enrichedPrompt, cfAspect, supabase, i);
        imageUrls.push(url);
      } catch (singleErr: any) {
        if (imageUrls.length > 0) {
          // Si ya tenemos al menos una variación, la duplicamos para no fallar el casting
          imageUrls.push(imageUrls[0]);
        } else {
          throw singleErr;
        }
      }
    }

    return res.status(200).json({
      success: true,
      imageUrl: imageUrls[0],
      imageUrls,
      provider: "hybrid_resilient",
    });
  } catch (err: any) {
    console.error("[generate/image Error]", err);
    return res.status(502).json({
      success: false,
      error: err?.message || "Error generando imagen",
    });
  }
}
