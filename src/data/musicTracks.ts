export interface MusicTrackPreset {
  id: string;
  name: string;
  genre: string;
  bpm: string;
  description: string;
  previewUrl: string;
}

export const MUSIC_PRESETS: MusicTrackPreset[] = [
  {
    id: "cyber-radar",
    name: "Cyber Radar Social",
    genre: "Cyberpunk / Tech News",
    bpm: "130 BPM",
    description: "Sintetizadores pulsantes de alta tecnología con ritmo acelerado y bajo profundo.",
    previewUrl: "https://actions.google.com/sounds/v1/science_fiction/deep_space_drone.ogg",
  },
  {
    id: "viral-pulse",
    name: "Viral Pulse Tension",
    genre: "Electronic / Suspense",
    bpm: "128 BPM",
    description: "Arpegio hipnótico que crea urgencia y engancha la atención en los primeros segundos.",
    previewUrl: "https://actions.google.com/sounds/v1/science_fiction/alien_spaceship_hum.ogg",
  },
  {
    id: "dark-trailer",
    name: "Dark Cinematic Impact",
    genre: "Trailer / Hybrid Orchestral",
    bpm: "115 BPM",
    description: "Cuerdas graves, impactos cinematográficos y sub-bass con atmósfera imponente.",
    previewUrl: "https://actions.google.com/sounds/v1/science_fiction/teleport_chamber.ogg",
  },
  {
    id: "lofi-future",
    name: "Lo-Fi Digital Horizon",
    genre: "Chillhop / Minimal Tech",
    bpm: "95 BPM",
    description: "Ritmo limpio y contemporáneo para explicaciones claras sin saturar el diálogo.",
    previewUrl: "https://actions.google.com/sounds/v1/science_fiction/laboratory_hum.ogg",
  },
];
