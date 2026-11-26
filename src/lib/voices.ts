export interface VoiceOption {
  id: string;
  name: string;
  gender: "male" | "female" | "child" | "elder";
  category: "adult_male" | "adult_female" | "child" | "elderly" | "narrator";
  country: string;
  flag: string;
  description: string;
  defaultPitch?: number;
}

export const CHARACTER_VOICE_CATALOG: VoiceOption[] = [
  // Femeninas
  {
    id: "es-CO-SalomeNeural",
    name: "Salomé",
    gender: "female",
    category: "adult_female",
    country: "Colombia",
    flag: "🇨🇴",
    description: "Expresiva, dulce, maternal y emotiva (Ideal Mamá Cebolla)",
    defaultPitch: 0,
  },
  {
    id: "es-MX-DaliaNeural",
    name: "Dalia",
    gender: "female",
    category: "adult_female",
    country: "México",
    flag: "🇲🇽",
    description: "Cálida, narrativa, clara y enérgica",
    defaultPitch: 0,
  },
  {
    id: "es-ES-ElviraNeural",
    name: "Elvira",
    gender: "female",
    category: "adult_female",
    country: "España",
    flag: "🇪🇸",
    description: "Madura, formal, serena y elegante",
    defaultPitch: 0,
  },

  // Masculinos
  {
    id: "es-MX-JorgeNeural",
    name: "Jorge",
    gender: "male",
    category: "adult_male",
    country: "México",
    flag: "🇲🇽",
    description: "Firme, enérgico, versátil y dinámico",
    defaultPitch: 0,
  },
  {
    id: "es-ES-AlvaroNeural",
    name: "Álvaro",
    gender: "male",
    category: "adult_male",
    country: "España",
    flag: "🇪🇸",
    description: "Profunda, solemne, de padre protector (Ideal Papá Patata)",
    defaultPitch: -5,
  },
  {
    id: "es-CO-GonzaloNeural",
    name: "Gonzalo",
    gender: "male",
    category: "adult_male",
    country: "Colombia",
    flag: "🇨🇴",
    description: "Cálido, formal, narrador cinematográfico",
    defaultPitch: 0,
  },

  // Infantiles & Jóvenes
  {
    id: "es-MX-LarissaNeural",
    name: "Larissa (Niña)",
    gender: "child",
    category: "child",
    country: "México",
    flag: "🇲🇽",
    description: "Infantil, alegre, vivaz y risueña (Ideal Doña Fresa / Niñas)",
    defaultPitch: 15,
  },
  {
    id: "child-boy-jorge",
    name: "Patatín (Niño)",
    gender: "child",
    category: "child",
    country: "Universal",
    flag: "🍟",
    description: "Tono infantil juguetón, animado y curioso (Ideal Patatín Jr.)",
    defaultPitch: 25,
  },

  // Ancianos / Arquetipos
  {
    id: "elder-female",
    name: "Abuelita Sabia",
    gender: "elder",
    category: "elderly",
    country: "Universal",
    flag: "👵",
    description: "Voz pausada, cariñosa, venerable y cálida",
    defaultPitch: -10,
  },
  {
    id: "elder-male",
    name: "Abuelo / Don",
    gender: "elder",
    category: "elderly",
    country: "Universal",
    flag: "👴",
    description: "Grave, ronca, sabia y pausada",
    defaultPitch: -18,
  },

  // Voces Nativas Gemini (para compatibilidad de proyectos existentes)
  {
    id: "Puck",
    name: "Puck (Gemini)",
    gender: "male",
    category: "adult_male",
    country: "Gemini",
    flag: "✨",
    description: "Voz rápida, juvenil y neutral",
    defaultPitch: 0,
  },
  {
    id: "Kore",
    name: "Kore (Gemini)",
    gender: "female",
    category: "adult_female",
    country: "Gemini",
    flag: "✨",
    description: "Voz femenina suave y calmada",
    defaultPitch: 0,
  },
  {
    id: "Fenrir",
    name: "Fenrir (Gemini)",
    gender: "male",
    category: "adult_male",
    country: "Gemini",
    flag: "✨",
    description: "Voz masculina profunda y resonante",
    defaultPitch: 0,
  },
];

export const PITCH_PRESETS = [
  { label: "Anciano / Monstruo", value: -25, color: "text-amber-400" },
  { label: "Grave / Maduro", value: -12, color: "text-blue-400" },
  { label: "Natural (0%)", value: 0, color: "text-zinc-300" },
  { label: "Joven (+12%)", value: 12, color: "text-emerald-400" },
  { label: "Niño (+25%)", value: 25, color: "text-lime-400" },
  { label: "Caricatura (+40%)", value: 40, color: "text-purple-400" },
];

export function getVoiceLabel(voiceId?: string): string {
  if (!voiceId) return "Sin voz asignada (Usa Narrador)";
  const found = CHARACTER_VOICE_CATALOG.find((v) => v.id.toLowerCase() === voiceId.toLowerCase());
  return found ? `${found.flag} ${found.name}` : voiceId;
}

export function getPitchTag(pitch: number = 0): { label: string; color: string } {
  if (pitch <= -20) return { label: "Anciano / Muy Grave", color: "text-amber-400" };
  if (pitch < -5) return { label: "Maduro / Grave", color: "text-blue-400" };
  if (pitch >= -5 && pitch <= 5) return { label: "Normal", color: "text-zinc-400" };
  if (pitch > 5 && pitch < 20) return { label: "Joven / Dulce", color: "text-emerald-400" };
  if (pitch >= 20 && pitch < 35) return { label: "Niño / Infantil", color: "text-lime-400" };
  return { label: "Caricatura / Animado", color: "text-purple-400" };
}
