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

const VALID_GEMINI_VOICES: Record<string, string> = {
  puck: "Puck",
  charon: "Charon",
  kore: "Kore",
  fenrir: "Fenrir",
  aoede: "Aoede",
  zephyr: "Zephyr",
};

async function uploadAudioToSupabase(buffer: Buffer, contentType: string, ext = "wav"): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const fileName = `voices/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("audio").upload(fileName, buffer, {
      contentType,
      upsert: true,
    });

    if (!uploadError) {
      const { data: publicData } = supabase.storage.from("audio").getPublicUrl(fileName);
      return publicData.publicUrl;
    } else {
      console.warn("[speech] Error subiendo a bucket audio:", uploadError.message);
    }
  } catch (err: any) {
    console.warn("[speech] Excepción subiendo audio a Supabase:", err?.message || err);
  }
  return null;
}

/**
 * Fallback resiliente para cuando la cuota de Gemini 3.1 Flash TTS (429) se agota.
 * Genera audio real en español sin límites ni credenciales requeridas.
 */
async function generateFallbackAudio(text: string): Promise<{ buffer: Buffer; mimeType: string }> {
  // Dividir en fragmentos razonables para el endpoint
  const chunks = text.match(/[^.!?]+[.!?]+|\S+/g) || [text];
  const audioBuffers: Buffer[] = [];

  let currentBlock = "";
  for (const chunk of chunks) {
    if ((currentBlock + " " + chunk).length > 180) {
      if (currentBlock.trim()) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=es&client=tw-ob&q=${encodeURIComponent(currentBlock.trim())}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
        });
        if (res.ok) {
          const arr = await res.arrayBuffer();
          audioBuffers.push(Buffer.from(arr));
        }
      }
      currentBlock = chunk;
    } else {
      currentBlock += " " + chunk;
    }
  }

  if (currentBlock.trim()) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=es&client=tw-ob&q=${encodeURIComponent(currentBlock.trim())}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      audioBuffers.push(Buffer.from(arr));
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error("No se pudo generar audio de respaldo");
  }

  return {
    buffer: Buffer.concat(audioBuffers),
    mimeType: "audio/mpeg",
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, voice, tone } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Falta el texto a sintetizar" });
  }

  const cleanText = text.trim();

  // Mapear voz solicitada a una voz válida de Gemini (evitando 400 por voces tipo 'es-ES-Neural2-B')
  let voiceName = "Fenrir";
  const lowerVoice = (voice || "").toLowerCase();
  if (VALID_GEMINI_VOICES[lowerVoice]) {
    voiceName = VALID_GEMINI_VOICES[lowerVoice];
  } else if (lowerVoice.includes("female") || lowerVoice.includes("mujer") || lowerVoice.includes("kore") || lowerVoice.includes("salome")) {
    voiceName = "Kore";
  } else if (lowerVoice.includes("puck")) {
    voiceName = "Puck";
  } else {
    voiceName = "Fenrir";
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Intento primario con Gemini Flash TTS si existe API key
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "clonecinema" } },
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const wav = pcmToWav(Buffer.from(base64Audio, "base64"));
        const audioUrl = await uploadAudioToSupabase(wav, "audio/wav", "wav");

        return res.status(200).json({
          success: true,
          audioUrl: audioUrl || null,
          audioBase64: wav.toString("base64"),
          mimeType: "audio/wav",
          provider: "gemini-tts",
        });
      }
    } catch (geminiErr: any) {
      console.warn("[speech] Gemini TTS falló o excedió cuota (429/400). Activando respaldo resiliente:", geminiErr?.message || geminiErr);
    }
  }

  // 2. Respaldo Resiliente (Cero errores 429 de cuota o 400 de argumentos)
  try {
    const fallback = await generateFallbackAudio(cleanText);
    const audioUrl = await uploadAudioToSupabase(fallback.buffer, fallback.mimeType, "mp3");

    return res.status(200).json({
      success: true,
      audioUrl: audioUrl || null,
      audioBase64: fallback.buffer.toString("base64"),
      mimeType: fallback.mimeType,
      provider: "fallback-tts",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error generando voz de respaldo" });
  }
}
