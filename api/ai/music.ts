import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta GEMINI_API_KEY en el servidor" });
  }

  const { prompt, narration, shots, availableTracks } = req.body || {};

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "clonecinema-audio" } },
    });

    const scriptContext = [
      narration ? `Narración maestra: "${narration}"` : "",
      Array.isArray(shots)
        ? shots
            .map((s: any) => `Plano ${s.number || ""}: ${s.voiceover || s.dialogue || s.action || ""}`)
            .join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const tracksList = Array.isArray(availableTracks)
      ? availableTracks
          .map((t: any) => `- ID: "${t.id}", Nombre: "${t.name}", Género: "${t.genre}", BPM: "${t.bpm}", Info: "${t.description}"`)
          .join("\n")
      : "";

    const systemInstruction = `
Eres el Director Musical y Diseñador Sonoro Principal de CloneCinema Viral Studio.
Tu tarea es definir la banda sonora perfecta (BGM) para una pieza de video de alto impacto (Reels/TikTok/Shorts).

Analiza el guion del proyecto y las instrucciones del usuario.
Debes seleccionar la mejor pista del catálogo disponible y redactar un prompt técnico de dirección musical para el motor de renderizado.

Pistas disponibles en nuestro catálogo de Supabase:
${tracksList}

Responde estrictamente en formato JSON válido con la siguiente estructura:
{
  "selectedTrackId": "id de la pista elegida",
  "bpm": "ej: 130 BPM",
  "musicPrompt": "descripción cinematográfica rica para el renderizador (instrumentos, curva de energía, sub-bass, ritmo)",
  "rationale": "breve explicación de 1 línea de por qué esta música potencia el gancho viral"
}
`;

    const userPrompt = `
Prompt del usuario para la música: ${prompt || "Automático según el tono del guion"}

Contexto del guion y planos:
${scriptContext || "Video dinámico de impacto tecnológico / viral"}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [{ parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        responseMimeType: "application/json",
      },
    });

    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: "El modelo no devolvió respuesta" });
    }

    const parsed = JSON.parse(rawText);
    return res.status(200).json({
      success: true,
      ...parsed,
    });
  } catch (err: any) {
    console.error("[api/ai/music] Error:", err);
    return res.status(500).json({ error: err?.message || "Error analizando banda sonora" });
  }
}
