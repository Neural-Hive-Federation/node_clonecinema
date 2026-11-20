export interface MusicTrackPreset {
  id: string;
  name: string;
  genre: string;
  bpm: string;
  description: string;
  previewUrl: string;
}

const SUPABASE_AUDIO_BASE = "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/bgm";

export const MUSIC_PRESETS: MusicTrackPreset[] = [
  {
    id: "cyber-radar",
    name: "Cyber Radar Social",
    genre: "Cyberpunk / Tech News",
    bpm: "130 BPM",
    description: "Sintetizadores pulsantes de alta tecnología con ritmo acelerado y bajo profundo.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/cyber_radar_invincible.mp3`,
  },
  {
    id: "viral-pulse",
    name: "Viral Pulse Tension",
    genre: "Electronic / Suspense",
    bpm: "128 BPM",
    description: "Arpegio hipnótico que crea urgencia y engancha la atención en los primeros segundos.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/viral_pulse_symbolism.mp3`,
  },
  {
    id: "dark-trailer",
    name: "Dark Cinematic Impact",
    genre: "Trailer / Hybrid Orchestral",
    bpm: "115 BPM",
    description: "Cuerdas graves, impactos cinematográficos y sub-bass con atmósfera imponente.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/dark_trailer_blank.mp3`,
  },
  {
    id: "lofi-future",
    name: "Lo-Fi Digital Horizon",
    genre: "Chillhop / Minimal Tech",
    bpm: "95 BPM",
    description: "Ritmo limpio y contemporáneo para explicaciones claras sin saturar el diálogo.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/lofi_future_tranquility.mp3`,
  },
  {
    id: "pop-viral",
    name: "Pop Viral Hit",
    genre: "Electronic Pop / Viral",
    bpm: "125 BPM",
    description: "Melodía pegadiza y enérgica para reels dinámicos y contenido de alto engagement.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/pop_viral_on_and_on.mp3`,
  },
  {
    id: "electro-high",
    name: "High Energy Electro",
    genre: "Progressive House",
    bpm: "128 BPM",
    description: "Subidón constante de energía ideal para intros explosivas y clímax visuales.",
    previewUrl: `${SUPABASE_AUDIO_BASE}/electro_sky_high.mp3`,
  },
];
