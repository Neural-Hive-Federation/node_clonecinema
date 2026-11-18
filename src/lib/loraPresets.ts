import type { LoraConfig } from "../types";

export interface LoraPreset {
  id: string;
  name: string;
  category: string;
  triggerWord: string;
  weight: number;
  description: string;
}

export const LORA_PRESETS: LoraPreset[] = [
  {
    id: "feng_baobao",
    name: "Feng Baobao — Artes Marciales & Dagas (I Am Nobody)",
    category: "Combate & Acción",
    triggerWord: "fengbaobao style, dynamic wushu martial arts stance, wielding blades, spiritual qi energy flow, intense focused kuudere gaze",
    weight: 0.85,
    description: "Estilo de combate marcial implacable, dagas y energía espiritual pura inspirado en Feng Baobao.",
  },
  {
    id: "amaterasu_solar",
    name: "Deidad Solar Amaterasu — Fuego Celestial",
    category: "Fantasía & Mitología",
    triggerWord: "amaterasu divine solar aura, mystical flame particles, traditional japanese celestial goddess robes, glowing golden eyes, radiant power",
    weight: 0.85,
    description: "Aura sagrada de fuego solar, ropajes celestiales y mirada divina para sagas místicas.",
  },
  {
    id: "cyberpunk_neon",
    name: "Ciberpunk — Tatuajes Neón & Aumentos",
    category: "Sci-Fi & Futurista",
    triggerWord: "cyberpunk chrome reflections, glowing neon circuit tattoos, holographic rim light, high tech augments, blade runner aesthetic",
    weight: 0.75,
    description: "Reflejos metálicos, circuitos brillantes y luz de neón de alto contraste.",
  },
  {
    id: "analog_35mm",
    name: "35mm Analógico — Grano Kodak Portra",
    category: "Cinematografía",
    triggerWord: "35mm film grain, vintage color palette, authentic film aesthetic, cinematic documentary, kodak portra 400 texture",
    weight: 0.70,
    description: "Grano orgánico de celuloide clásico y paleta de color cinematográfica analógica.",
  },
  {
    id: "cyberrealistic_skin",
    name: "Hiperrealismo & Micro-textura de Piel",
    category: "Fotorrealismo",
    triggerWord: "raw photographic skin texture, micro pores, natural subsurface scattering, soft studio lighting, ultra-realistic portrait",
    weight: 0.80,
    description: "Definición de poros, iluminación suave y textura humana fotorrealista sin aspecto plástico.",
  },
  {
    id: "shonen_aura",
    name: "Shonen Battle — Aura de Energía & Relámpagos",
    category: "Anime & Manga",
    triggerWord: "intense electric energy aura, dynamic hair motion, glowing pupils, sharp anime shadows, high-octane battle scene",
    weight: 0.85,
    description: "Aura de energía de combate, chispas eléctricas y dramatismo épico de anime de acción.",
  },
];
