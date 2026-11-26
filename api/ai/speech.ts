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

const RESERVED_VOICE_STUDIO_ID = "a0000000-0000-0000-0000-000000000002";

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function getLiveVoiceStudioGateway(supabase: any): Promise<{ online: boolean; tunnelUrl: string | null }> {
  try {
    const { data, error } = await supabase
      .from("ai_jobs")
      .select("input_url, status, updated_at")
      .eq("id", RESERVED_VOICE_STUDIO_ID)
      .maybeSingle();

    if (error || !data || !data.input_url || data.status === "offline") {
      return { online: false, tunnelUrl: null };
    }

    const tunnelUrl = String(data.input_url).trim().replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${tunnelUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      return { online: true, tunnelUrl };
    }
    return { online: false, tunnelUrl };
  } catch {
    return { online: false, tunnelUrl: null };
  }
}

async function uploadAudioToSupabase(buffer: Buffer, contentType: string, ext = "wav"): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
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

  const { text, voice, tone, role, characterName, gender, pitch = 0, rate = 1.0 } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Falta el texto a sintetizar" });
  }

  const cleanText = text.trim();
  const numPitch = Number(pitch) || 0;
  const numRate = Number(rate) || 1.0;

  // Mapear voz solicitada a una voz válida de Gemini
  let voiceName = "Fenrir";
  const lowerVoice = (voice || "").toLowerCase();
  if (VALID_GEMINI_VOICES[lowerVoice]) {
    voiceName = VALID_GEMINI_VOICES[lowerVoice];
  } else if (lowerVoice.includes("female") || lowerVoice.includes("mujer") || lowerVoice.includes("kore") || lowerVoice.includes("salome") || lowerVoice.includes("dalia") || lowerVoice.includes("cebolla") || lowerVoice.includes("elvira")) {
    voiceName = "Kore";
  } else if (lowerVoice.includes("puck") || lowerVoice.includes("niño") || lowerVoice.includes("niña") || lowerVoice.includes("child") || lowerVoice.includes("patatin") || lowerVoice.includes("larissa") || numPitch > 15) {
    voiceName = "Puck";
  } else if (lowerVoice.includes("charon") || lowerVoice.includes("elder") || lowerVoice.includes("ancian") || numPitch < -15) {
    voiceName = "Charon";
  } else {
    voiceName = "Fenrir";
  }

  const supabase = getSupabaseClient();

  // 1. Prioridad: Si Colab Voice Studio está activo, generar con voces multi-personaje de alta fidelidad
  if (supabase) {
    const voiceGateway = await getLiveVoiceStudioGateway(supabase);
    if (voiceGateway.online && voiceGateway.tunnelUrl) {
      try {
        console.log(`[Voice Studio Colab] Enviando síntesis a ${voiceGateway.tunnelUrl}...`);
        const synthRes = await fetch(`${voiceGateway.tunnelUrl}/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cleanText,
            role: role || (numPitch >= 20 ? "child_boy" : voiceName === "Kore" ? "adult_female" : "adult_male"),
            character_name: characterName || undefined,
            gender: gender || (voiceName === "Kore" ? "female" : "male"),
            voice: voice || undefined,
            pitch: numPitch,
            speed: numRate,
            tone: tone || undefined,
          }),
        });

        if (synthRes.ok) {
          const synthData = (await synthRes.json()) as any;
          if (synthData.audio_base64) {
            const audioBuf = Buffer.from(synthData.audio_base64, "base64");
            const audioUrl = await uploadAudioToSupabase(audioBuf, "audio/wav", "wav");
            return res.status(200).json({
              success: true,
              audioUrl: audioUrl || null,
              audioBase64: synthData.audio_base64,
              mimeType: "audio/wav",
              provider: "colab-voice-studio",
            });
          }
        }
      } catch (colabErr: any) {
        console.warn("[Voice Studio Colab Warning]:", colabErr?.message || colabErr);
      }
    }
  }

  // 2. Motor secundario: Gemini Flash TTS si existe API key
  const apiKey = process.env.GEMINI_API_KEY;
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

  // 3. Respaldo Resiliente (Cero errores 429 de cuota o 400 de argumentos)
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
