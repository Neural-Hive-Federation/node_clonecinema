import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta GEMINI_API_KEY en Vercel" });
  }

  const { text, voice, tone } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Falta el texto a sintetizar" });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "clonecinema" } },
    });

    const cleanText = text.trim();
    const voiceName = voice || "Fenrir";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(502).json({ error: "El modelo no devolvió audio" });
    }

    const wav = pcmToWav(Buffer.from(base64Audio, "base64"));

    // Subir a Supabase Storage (Bucket: audio)
    let audioUrl: string | null = null;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const fileName = `voices/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.wav`;
        const { error: uploadError } = await supabase.storage.from("audio").upload(fileName, wav, {
          contentType: "audio/wav",
          upsert: true,
        });

        if (!uploadError) {
          const { data: publicData } = supabase.storage.from("audio").getPublicUrl(fileName);
          audioUrl = publicData.publicUrl;
        } else {
          console.warn("[speech] Error subiendo a bucket audio:", uploadError.message);
        }
      } catch (err: any) {
        console.warn("[speech] Excepción subiendo audio a Supabase:", err?.message || err);
      }
    }

    return res.status(200).json({
      success: true,
      audioUrl: audioUrl || null,
      audioBase64: wav.toString("base64"),
      mimeType: "audio/wav",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error generando voz" });
  }
}
