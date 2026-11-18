import { GoogleGenAI, Modality } from "@google/genai";
import { config } from "./config";

export function getGenAI(): GoogleGenAI | null {
  if (!config.gemini.apiKey) return null;
  return new GoogleGenAI({
    apiKey: config.gemini.apiKey,
    httpOptions: { headers: { "User-Agent": "clonecinema" } },
  });
}

export const TEXT_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-pro",
];

export async function generateWithFallback(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; models?: string[] }
) {
  const models = params.models || TEXT_MODELS;
  let lastError: any = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
      } catch (err: any) {
        lastError = err;
        await new Promise((r) => setTimeout(r, (attempt + 1) * 400));
      }
    }
  }
  throw lastError;
}

export function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

/** Keyframe con Gemini. Devuelve un data URL listo para guardar en el proyecto. */
export async function generateGeminiImage(prompt: string, aspectRatio: string): Promise<string> {
  const ai = getGenAI();
  if (!ai) throw new Error("Falta GEMINI_API_KEY para generar imágenes.");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-image",
    contents: {
      parts: [
        {
          text: `${prompt}, cinematic film still, dramatic lighting, high detail, filmic color grade`,
        },
      ],
    },
    config: { imageConfig: { aspectRatio } },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType || "image/png";
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("El modelo no devolvió imagen");
}

export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
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

export async function generateGeminiSpeech(input: {
  text: string;
  voice: string;
  tone: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const ai = getGenAI();
  if (!ai) throw new Error("Falta GEMINI_API_KEY para la narración.");

  const cleanText = input.text.trim();

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: cleanText }] }],
    config: {
      systemInstruction: `You are a professional voice narrator. Speak the text clearly and naturally in a ${input.tone} tone. Read the exact text provided ONCE only. Never repeat phrases, never provide alternative takes, and never add conversational filler.`,
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } } },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("El modelo no devolvió audio");
  const wav = pcmToWav(Buffer.from(base64Audio, "base64"));
  return { audioBase64: wav.toString("base64"), mimeType: "audio/wav" };
}
