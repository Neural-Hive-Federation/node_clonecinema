export interface PublishedMetrics {
  ourViews: string;
  ourLikes: string;
  retention: string;
  hitScore: number;
  verdict: "viral_hit" | "performing" | "testing";
}

export interface AnalyticsDriver {
  label: string;
  value: number;
  weight: number;
  detail: string;
}

export interface WinnerAnalytics {
  velocityVph?: number;
  dailyMultiplier?: number;
  probability?: number;
  stage?: { label: string; color: string };
  projected24?: string;
  projected48?: string;
  projected72?: string;
  verdict?: string;
  sparkline?: number[];
  growthPct?: number;
  drivers?: AnalyticsDriver[];
}

export interface TrendingWinner {
  id: string;
  youtube_id?: string;
  title: string;
  author: string;
  platform: "tiktok" | "reels" | "shorts";
  url: string;
  niche: string;
  views: string;
  likes: string;
  duration: number;
  upload_date?: string;
  hookType: string;
  hookDescription: string;
  thumbnail: string;
  recommendedConcept: string;
  viral_score?: number;
  status: "available" | "cloned" | "published";
  clonedAt?: string;
  publishedMetrics?: PublishedMetrics;
  analytics?: WinnerAnalytics;
}

export interface ScoutTelemetry {
  totalTracked: number;
  totalCloned: number;
  totalPublished: number;
  globalHitRate: string;
  topHookType: string;
  topNiche: string;
  scoutConfidence: string;
  totalViews?: string;
  totalLikes?: string;
  explodingCount?: number;
  timeWindow?: string;
}

export interface TrendingResponse {
  winners: TrendingWinner[];
  telemetry: ScoutTelemetry;
}

export type Mode = "clone" | "ad" | "saga";

export type Format = "9:16" | "16:9" | "1:1";

export type StudioTab = "script" | "storyboard" | "cast" | "audio" | "render" | "publish";

export type ShotStatus = "idle" | "rendering" | "ready" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: string[];
  scoutCard?: SourceMeta;
}

/**
 * A locked visual reference. In "clone" mode this is the core of the product:
 * every element of the source video is either preserved (keep) or replaced.
 */
export interface RefAsset {
  id: string;
  kind: "character" | "product" | "location" | "prop" | "logo" | "text";
  name: string;
  description: string;
  keep: boolean;
  replaceWith?: string;
}

export interface ViralDNA {
  hook: string;
  pattern: string;
  beats: { at: string; label: string; why: string }[];
  retentionTricks: string[];
  cta: string;
}

export interface Shot {
  id: string;
  number: number;
  title: string;
  seconds: number;
  camera: string;
  action: string;
  dialogue?: string;
  voiceover?: string;
  sfx?: string;
  music?: string;
  onScreenText?: string;
  imagePrompt: string;
  videoPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  characterId?: string;
  locationId?: string;
  propId?: string;
  operationName?: string;
  status?: ShotStatus;
  error?: string;
}

export interface LoraConfig {
  presetId: string;
  name: string;
  triggerWord: string;
  weight: number;
  category?: string;
  description?: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  wardrobe?: string;
  color: string;
  avatarUrl?: string;
  castingVariations?: string[];
  loraConfig?: LoraConfig;
  voiceId?: string;
  voicePitch?: number;
  voiceRate?: number;
}

export interface LocationRef {
  id: string;
  name: string;
  description: string;
  timeOfDay: string;
  color: string;
  imageUrl?: string;
}

export interface PropItem {
  id: string;
  name: string;
  description: string;
  category: string;
  color?: string;
  imageUrl?: string;
}

export interface AudioPlan {
  narration: string;
  voice: "Zephyr" | "Kore" | "Puck" | "Charon" | "Fenrir";
  music: string;
  bpm: string;
  sfxPalette: string[];
  narrationUrl?: string;
  musicUrl?: string;
}

export interface PublishKit {
  caption: string;
  hashtags: string[];
  platforms: { platform: string; copy: string; hook: string }[];
  coverPrompt: string;
  coverUrl?: string;
  masterVideoUrl?: string;
}

export interface SourceMeta {
  url: string;
  platform: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  views?: string;
  likes?: string;
  duration?: number;
  rawVideoUrl?: string;
  note?: string;
  frames?: { shotNumber: number; timestampSec: number; frameUrl: string; role?: string }[];
  analytics?: {
    stage?: { label: string; color: string };
    probability?: number;
    retentionScore?: number;
    velocity?: string;
    verdict?: string;
    drivers?: { label: string; value: number; detail: string }[];
  };
}

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  format: Format;
  duration: number;
  style: string;
  language: "es" | "en";
  title: string;
  logline: string;
  brief: string;
  sourceUrl?: string;
  sourceMeta?: SourceMeta;
  viralDNA?: ViralDNA;
  references: RefAsset[];
  shots: Shot[];
  characters: Character[];
  locations: LocationRef[];
  props: PropItem[];
  audio: AudioPlan;
  publish?: PublishKit;
  masterVideoUrl?: string;
  chat: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export type ProjectUpdater = (
  update: Partial<Project> | ((prev: Project) => Partial<Project>)
) => void;

export interface PlanPayload {
  title: string;
  logline: string;
  mode: Mode;
  format: Format;
  duration: number;
  style: string;
  viralDNA?: ViralDNA;
  references: RefAsset[];
  shots: Omit<Shot, "id">[];
  characters: Omit<Character, "id">[];
  locations: Omit<LocationRef, "id">[];
  props: Omit<PropItem, "id">[];
  audio: AudioPlan;
  publish?: PublishKit;
}

export interface ChatResponse {
  reply: string;
  plan?: PlanPayload;
  mode: "gemini" | "local";
  warning?: string;
}

export interface AnalyzeResponse {
  sourceMeta: SourceMeta;
  viralDNA: ViralDNA;
  plan?: PlanPayload;
  mode: "gemini" | "local";
  warning?: string;
}

/* ------------------------------------------------------------------ *
 * SaaS: configuración pública, cuenta y paquetes de créditos
 * ------------------------------------------------------------------ */

export interface AppConfig {
  supabase: { url: string | null; anonKey: string | null };
  billingEnabled: boolean;
  accountsEnabled: boolean;
  anonymousGeneration: boolean;
  providers: { email: boolean; google: boolean };
  credits: { image: number; video: number };
  kaggleEnabled: boolean;
  geminiEnabled: boolean;
}

export interface AccountUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  plan: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  description: string;
  amountCop: number;
  amountCents: number;
  credits: number;
  type: "one_time" | "subscription";
  videos: string;
  highlight?: boolean;
}
