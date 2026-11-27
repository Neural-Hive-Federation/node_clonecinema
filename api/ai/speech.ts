import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

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

async function uploadAudioToSupabase(buffer: Buffer, contentType: string, ext = "mp3"): Promise<string | null> {
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
 * Mapeo inteligente y exhaustivo a las voces Neural reales de Microsoft Edge TTS.
 * Permite diferenciación real y clara entre Elvira (España), Dalia (México), Salomé (Colombia), etc.
 */
function resolveEdgeVoice(voice?: string, gender?: string, pitch = 0): { voiceName: string; pitchOffset: number } {
  const v = (voice || "").toLowerCase();

  if (v.includes("salome") || v.includes("cebolla")) {
    return { voiceName: "es-CO-SalomeNeural", pitchOffset: 0 };
  }
  if (v.includes("dalia")) {
    return { voiceName: "es-MX-DaliaNeural", pitchOffset: 0 };
  }
  if (v.includes("elvira")) {
    return { voiceName: "es-ES-ElviraNeural", pitchOffset: 0 };
  }
  if (v.includes("alvaro") || v.includes("patata") || v.includes("padre")) {
    return { voiceName: "es-ES-AlvaroNeural", pitchOffset: -5 };
  }
  if (v.includes("gonzalo") || v.includes("narrador")) {
    return { voiceName: "es-CO-GonzaloNeural", pitchOffset: 0 };
  }
  if (v.includes("larissa") || v.includes("niña") || v.includes("fresa")) {
    return { voiceName: "es-MX-LarissaNeural", pitchOffset: 12 };
  }
  if (v.includes("patatin") || v.includes("child-boy") || (v.includes("niño") && !v.includes("larissa"))) {
    return { voiceName: "es-MX-JorgeNeural", pitchOffset: 25 };
  }
  if (v.includes("elder-female") || v.includes("abuelita")) {
    return { voiceName: "es-ES-ElviraNeural", pitchOffset: -10 };
  }
  if (v.includes("elder-male") || v.includes("abuelo") || v.includes("don")) {
    return { voiceName: "es-ES-AlvaroNeural", pitchOffset: -18 };
  }
  if (v.includes("jorge")) {
    return { voiceName: "es-MX-JorgeNeural", pitchOffset: 0 };
  }

  // Si ya es un ID de Azure/Edge completo
  if (voice && voice.includes("Neural")) {
    return { voiceName: voice, pitchOffset: 0 };
  }

  // Fallbacks por género o modulación
  if (gender === "female" || v.includes("female") || v.includes("mujer")) {
    return { voiceName: "es-MX-DaliaNeural", pitchOffset: 0 };
  }
  if (pitch >= 20) {
    return { voiceName: "es-MX-LarissaNeural", pitchOffset: 15 };
  }
  if (pitch <= -15) {
    return { voiceName: "es-ES-AlvaroNeural", pitchOffset: -15 };
  }

  return { voiceName: "es-CO-GonzaloNeural", pitchOffset: 0 };
}

/**
 * Síntesis nativa con Microsoft Edge TTS (Zero quota, alta fidelidad, latencia <1s).
 */
async function generateEdgeTTSAudio(
  text: string,
  voiceName: string,
  pitchPercent = 0,
  rateSpeed = 1.0
): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const pitchStr = pitchPercent === 0 ? "+0%" : `${pitchPercent > 0 ? "+" : ""}${pitchPercent}%`;
  const rateDiff = Math.round((rateSpeed - 1.0) * 100);
  const rateStr = rateDiff === 0 ? "+0%" : `${rateDiff > 0 ? "+" : ""}${rateDiff}%`;

  const { audioStream } = await tts.toStream(text, {
    pitch: pitchStr,
    rate: rateStr,
  });

  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    audioStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    audioStream.on("end", () => resolve(Buffer.concat(chunks)));
    audioStream.on("error", (err: any) => reject(err));
  });
}

/**
 * Fallback resiliente para cuando la cuota de Gemini 3.1 Flash TTS (429) se agota.
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
  const isGeminiRequested = voice && VALID_GEMINI_VOICES[String(voice).toLowerCase()];

  // 1. Prioridad: Microsoft Edge Neural TTS (Para Elvira, Dalia, Salomé, Álvaro, Jorge, Larissa, etc.)
  if (!isGeminiRequested) {
    const { voiceName: edgeVoice, pitchOffset } = resolveEdgeVoice(voice, gender, numPitch);
    const finalPitch = numPitch !== 0 ? numPitch : pitchOffset;

    try {
      console.log(`[Edge TTS] Sintetizando voz '${edgeVoice}' (pitch: ${finalPitch}%, rate: ${numRate}x)...`);
      const mp3Buffer = await generateEdgeTTSAudio(cleanText, edgeVoice, finalPitch, numRate);
      const audioUrl = await uploadAudioToSupabase(mp3Buffer, "audio/mpeg", "mp3");

      return res.status(200).json({
        success: true,
        audioUrl: audioUrl || null,
        audioBase64: mp3Buffer.toString("base64"),
        mimeType: "audio/mpeg",
        provider: "edge-tts",
        voice: edgeVoice,
        pitch: finalPitch,
      });
    } catch (edgeErr: any) {
      console.warn("[Edge TTS Warning]:", edgeErr?.message || edgeErr);
    }
  }

  const supabase = getSupabaseClient();

  // 2. Colab Voice Studio (si está encendido y conectado)
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
            role: role || (numPitch >= 20 ? "child_boy" : "adult_female"),
            character_name: characterName || undefined,
            gender: gender || "female",
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

  // 3. Gemini Flash TTS si la voz fue solicitada como Gemini (Puck, Kore, Fenrir, etc.)
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const geminiVoice = (voice && VALID_GEMINI_VOICES[String(voice).toLowerCase()]) || "Fenrir";
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "clonecinema" } },
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } } },
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
      console.warn("[speech] Gemini TTS falló o excedió cuota (429/400):", geminiErr?.message || geminiErr);
    }
  }

  // 4. Fallback final resiliente
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
