import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { config, publicConfig } from "./server/lib/config";
import {
  generateGeminiImage,
  generateGeminiSpeech,
  generateWithFallback,
  getGenAI,
  parseJson,
} from "./server/lib/gemini";
import { startVeo, streamVeo, veoStatus } from "./server/lib/veo";
import { accountRouter } from "./server/routes/account";
import { billingRouter, wompiWebhook } from "./server/routes/billing";
import { generateRouter } from "./server/routes/generate";

const app = express();
const PORT = config.port;

app.use(express.json({ limit: "50mb" }));

// Logging detallado para depuración en vivo
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      console.log(`[API ${req.method}] ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
    }
  });
  next();
});

/* ------------------------------------------------------------------ *
 * SaaS: cuentas, créditos, generación con Kaggle y pagos
 * ------------------------------------------------------------------ */

app.use("/api", accountRouter);
app.use("/api", generateRouter);
app.use("/api/wompi", billingRouter);
app.post("/api/v1/webhooks/wompi", wompiWebhook);

// Medios generados en local (cuando no hay Supabase Storage).
app.use("/media", express.static(config.mediaDir, { fallthrough: true, maxAge: "1h" }));

/* ------------------------------------------------------------------ *
 * Plan schema shared by chat + link analysis
 * ------------------------------------------------------------------ */

const planSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    logline: { type: Type.STRING },
    mode: { type: Type.STRING, enum: ["clone", "ad", "saga"] },
    format: { type: Type.STRING, enum: ["9:16", "16:9", "1:1"] },
    duration: { type: Type.NUMBER, description: "Duración total en segundos" },
    style: { type: Type.STRING, description: "Estilo visual en español" },
    viralDNA: {
      type: Type.OBJECT,
      properties: {
        hook: { type: Type.STRING, description: "Los primeros 2 segundos, literal" },
        pattern: { type: Type.STRING, description: "El patrón viral que se clona" },
        beats: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              at: { type: Type.STRING, description: "Marca de tiempo, ej. 0-2s" },
              label: { type: Type.STRING },
              why: { type: Type.STRING, description: "Por qué retiene al espectador" },
            },
            required: ["at", "label", "why"],
          },
        },
        retentionTricks: { type: Type.ARRAY, items: { type: Type.STRING } },
        cta: { type: Type.STRING },
      },
      required: ["hook", "pattern", "beats", "retentionTricks", "cta"],
    },
    references: {
      type: Type.ARRAY,
      description: "Elementos del video fuente que se conservan o se reemplazan",
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: ["character", "product", "location", "prop", "logo", "text"],
          },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          keep: { type: Type.BOOLEAN, description: "true = se conserva, false = se reemplaza" },
          replaceWith: { type: Type.STRING, description: "Qué lo reemplaza, si aplica" },
        },
        required: ["kind", "name", "description", "keep"],
      },
    },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: { type: Type.INTEGER },
          title: { type: Type.STRING },
          seconds: { type: Type.NUMBER },
          camera: { type: Type.STRING, description: "Plano y movimiento de cámara" },
          action: { type: Type.STRING },
          dialogue: { type: Type.STRING },
          voiceover: { type: Type.STRING },
          sfx: { type: Type.STRING },
          music: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
          imagePrompt: {
            type: Type.STRING,
            description: "Prompt EN INGLÉS para generar el keyframe",
          },
          videoPrompt: {
            type: Type.STRING,
            description: "Prompt EN INGLÉS de movimiento para el modelo de video",
          },
        },
        required: [
          "number",
          "title",
          "seconds",
          "camera",
          "action",
          "imagePrompt",
          "videoPrompt",
        ],
      },
    },
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          description: { type: Type.STRING },
          wardrobe: { type: Type.STRING },
          color: { type: Type.STRING, description: "Hex, ej. #8b5cf6" },
        },
        required: ["name", "role", "description", "color"],
      },
    },
    locations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          timeOfDay: { type: Type.STRING },
          color: { type: Type.STRING },
        },
        required: ["name", "description", "timeOfDay", "color"],
      },
    },
    props: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          color: { type: Type.STRING },
        },
        required: ["name", "description", "category"],
      },
    },
    audio: {
      type: Type.OBJECT,
      properties: {
        narration: { type: Type.STRING, description: "Guion de narración o VO completo" },
        voice: { type: Type.STRING, enum: ["Zephyr", "Kore", "Puck", "Charon", "Fenrir"] },
        music: { type: Type.STRING, description: "Descripción del track y referencias" },
        bpm: { type: Type.STRING },
        sfxPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["narration", "voice", "music", "bpm", "sfxPalette"],
    },
    publish: {
      type: Type.OBJECT,
      properties: {
        caption: { type: Type.STRING },
        hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
        platforms: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              platform: { type: Type.STRING },
              copy: { type: Type.STRING },
              hook: { type: Type.STRING },
            },
            required: ["platform", "copy", "hook"],
          },
        },
        coverPrompt: { type: Type.STRING },
      },
      required: ["caption", "hashtags", "platforms", "coverPrompt"],
    },
  },
  required: [
    "title",
    "logline",
    "mode",
    "format",
    "duration",
    "style",
    "references",
    "shots",
    "characters",
    "locations",
    "props",
    "audio",
  ],
};

const chatSchema = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: "Respuesta conversacional, breve y concreta" },
    action: { type: Type.STRING, enum: ["chat", "plan"] },
    plan: planSchema,
  },
  required: ["reply", "action"],
};

/* ------------------------------------------------------------------ *
 * Local engine: keeps the studio usable without an API key
 * ------------------------------------------------------------------ */

type Mode = "clone" | "ad" | "saga";

const MODE_BEATS: Record<Mode, { at: string; label: string; why: string }[]> = {
  clone: [
    { at: "0-2s", label: "Gancho visual imposible", why: "Algo ocurre antes de que el pulgar decida: no hay tiempo de contexto." },
    { at: "2-5s", label: "Ruptura de patrón", why: "Cambia el encuadre y el sonido para reabrir la curiosidad." },
    { at: "5-10s", label: "Escalada de consecuencia", why: "Cada corte añade un problema mayor, no repite el mismo gag." },
    { at: "10-15s", label: "Pago + bucle", why: "El final vuelve al inicio para que el video se repita sin costura." },
  ],
  ad: [
    { at: "0-3s", label: "Producto como personaje", why: "El objeto entra en cuadro con intención dramática, no como catálogo." },
    { at: "3-8s", label: "Deseo y fricción", why: "Se nombra el problema en una frase que el espectador ya pensó." },
    { at: "8-15s", label: "Revelación", why: "El beneficio se muestra en macro, sin explicarlo." },
    { at: "15-22s", label: "Prueba sensorial", why: "Textura, agua, luz y materia: lo que no se puede decir con palabras." },
    { at: "22-30s", label: "Clímax y CTA", why: "Pose final limpia con marca, oferta y una sola acción." },
  ],
  saga: [
    { at: "0-3s", label: "Imagen profética", why: "Abre con una promesa que solo tendrá sentido en el capítulo siguiente." },
    { at: "3-10s", label: "Mundo y regla", why: "Establece una ley del universo que será quebrada." },
    { at: "10-20s", label: "Conflicto", why: "El protagonista pierde algo que no puede recuperar igual." },
    { at: "20-30s", label: "Giro", why: "Revelación que reordena lo ya visto y obliga al siguiente capítulo." },
  ],
};

/**
 * Quita la orden y deja el sujeto: «genera un plan para mi botella» -> «mi botella».
 * Así el brief no contamina guion, voz en off ni prompts.
 */
function normalizeBrief(brief: string): string {
  return brief
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(por favor|hola|buenas)\b/gi, " ")
    .replace(
      /^(genera|generar|crea|crear|haz|hacer|arma|armar|escribe|escribir|monta|quiero|necesito|dame)\s+(me\s+)?/i,
      ""
    )
    .replace(
      /^(un|una|el|la|mi|mis|los|las)?\s*(anuncio|v[ií]deo|video|spot|comercial|plan|cap[ií]tulo|saga|historia|reel|short|clip|clon)\s*(para|de|sobre|con|del|de la)?\s*/i,
      ""
    )
    .replace(/^(un|una|el|la|mi|mis)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromBrief(brief: string, fallback: string): string {
  const clean = normalizeBrief(brief);
  if (!clean) return fallback;
  const words = clean.split(" ").slice(0, 6).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function buildLocalPlan(input: {
  brief: string;
  mode: Mode;
  format?: string;
  duration?: number;
  style?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceAuthor?: string;
}): any {
  const mode = input.mode;
  const duration = input.duration || (mode === "saga" ? 60 : mode === "ad" ? 30 : 15);
  const format = input.format || "9:16";
  const brief = normalizeBrief(input.brief || "") || "un producto que aparece en el momento exacto";
  const base = titleFromBrief(brief, mode === "saga" ? "Capítulo 1" : "Nuevo video");
  const sourceLabel = input.sourceTitle || "un video viral de referencia";

  const beats = MODE_BEATS[mode];
  const per = Math.max(2, Math.round(duration / beats.length));
  const shotTitles =
    mode === "clone"
      ? ["Gancho", "Ruptura", "Escalada", "Pago"]
      : mode === "ad"
      ? ["Aparición", "Tensión", "Revelación", "Textura", "Cierre"]
      : ["Prólogo", "El mundo", "La pérdida", "El giro", "Cierre del capítulo"];

  const cameras = [
    "Macro extremo, push-in lento, 100mm",
    "Plano medio, dolly lateral, 50mm",
    "Contrapicado, grúa ascendente, 35mm",
    "Primer plano, cámara en mano, 85mm",
    "Plano general, órbita continua, 24mm",
    "Detalle, whip pan, 135mm",
  ];

  const shots = shotTitles.map((t, i) => ({
    number: i + 1,
    title: t,
    seconds:
      i === shotTitles.length - 1
        ? Math.max(1, duration - per * (shotTitles.length - 1))
        : per,
    camera: cameras[i % cameras.length],
    action:
      mode === "saga"
        ? `${t}: ${brief}. La escena avanza un grado de tensión y deja una pregunta abierta.`
        : `${t}: ${brief}. El espectador entiende la situación sin una sola línea de explicación.`,
    dialogue: mode === "saga" ? "— No debiste venir." : undefined,
    voiceover: i === 0 ? brief : undefined,
    sfx: i === 0 ? "Impacto seco + silencio de 200 ms" : "Whoosh, textura de materia",
    music: i === 0 ? "Entrada rítmica sincronizada al primer corte" : "Pulso sostenido sin melodía principal",
    onScreenText: mode === "ad" && i === shotTitles.length - 1 ? "Descúbrelo hoy" : undefined,
    imagePrompt: `Cinematic ${format === "9:16" ? "vertical" : "widescreen"} frame, ${t.toLowerCase()} beat, ${brief}, dramatic volumetric lighting, shallow depth of field, filmic color grade, ultra detailed, photorealistic`,
    videoPrompt: `Slow cinematic camera move, ${t.toLowerCase()}, ${brief}, motion blur, 24fps filmic look, dramatic lighting, vertical format`,
  }));

  const references =
    mode === "clone"
      ? [
          {
            kind: "character",
            name: "Protagonista del clip",
            description: `Persona que aparece en ${sourceLabel}`,
            keep: false,
            replaceWith: "Tu personaje o embajador de marca",
          },
          {
            kind: "product",
            name: "Objeto en mano",
            description: "El producto que el protagonista sostiene en el gancho",
            keep: false,
            replaceWith: brief,
          },
          {
            kind: "location",
            name: "Fondo original",
            description: "El set donde ocurre la acción",
            keep: true,
          },
          {
            kind: "logo",
            name: "Marca del video fuente",
            description: "Logo en esquina superior",
            keep: false,
            replaceWith: "Tu logo",
          },
        ]
      : [];

  return {
    title: base,
    logline:
      mode === "clone"
        ? `Clon estructural de ${sourceLabel}: mismo ritmo, nuevo elenco y producto.`
        : mode === "saga"
        ? `Capítulo de apertura de una saga: ${brief}.`
        : `Anuncio cinematográfico de ${brief}.`,
    mode,
    format,
    duration,
    style: input.style || "Cinematográfico, contraste alto, grano fino, luz volumétrica",
    viralDNA: {
      hook: mode === "clone" ? "Arranca con el resultado final, nunca con el contexto." : beats[0].label,
      pattern:
        mode === "clone"
          ? "Gancho imposible → ruptura → escalada → bucle"
          : "Tensión creciente hasta un clímax visual mínimo",
      beats,
      retentionTricks: [
        "Corte cada 1.2-2 s en los primeros 5 s",
        "Sonido que entra 1 frame antes del corte",
        "Texto en pantalla solo cuando el audio baja",
        "El último frame coincide con el primero",
      ],
      cta: mode === "saga" ? "Continúa en el capítulo 2" : "Toca el enlace antes de que cierre",
    },
    references,
    shots,
    characters: [
      {
        name: mode === "saga" ? "Protagonista" : "Talento principal",
        role: "Protagonista",
        description: `${brief}. Presencia magnética, mirada directa a cámara en el gancho.`,
        wardrobe: "Vestuario neutro de alto contraste, texturas mate",
        color: "#a3e635",
      },
    ],
    locations: [
      {
        name: "Set principal",
        description: "Espacio con profundidad real, luz práctica en el fondo y niebla fina",
        timeOfDay: "Noche",
        color: "#38bdf8",
      },
    ],
    props: [
      {
        name: brief.slice(0, 40),
        description: "Objeto héroe, limpio, con reflejos controlados",
        category: "Producto",
        color: "#f472b6",
      },
    ],
    audio: {
      narration:
        mode === "saga"
          ? `Nadie sabía lo que despertaría. ${brief}. Y cuando el último eco se apagó, ya era demasiado tarde.`
          : `${brief}. Lo que ves no es magia. Es el siguiente paso.`,
      voice: "Zephyr",
      music: "Híbrido orgánico-electrónico, percusión seca, silencio antes del clímax",
      bpm: mode === "clone" ? "128" : "92",
      sfxPalette: ["Impacto seco", "Whoosh invertido", "Textura de materia", "Silencio de tensión"],
    },
    publish: {
      caption:
        mode === "clone"
          ? `Clonamos la estructura de un viral y la volvimos nuestra. ${brief}`
          : `${brief}. Mira hasta el final.`,
      hashtags: ["#CloneCinema", "#ViralClone", "#IA", "#VideoMarketing", "#Shorts"],
      platforms: [
        { platform: "TikTok", copy: "Hook visual en 0.5 s, CTA en el segundo 12.", hook: "No deberías ver esto dos veces." },
        { platform: "Instagram Reels", copy: "Corte más lento, texto mínimo, audio original.", hook: "Esto cambió el guion." },
        { platform: "YouTube Shorts", copy: "Título con curiosidad negativa y bucle final.", hook: "El error que todos cometen." },
      ],
      coverPrompt: `Bold cinematic cover frame, ${brief}, high contrast, negative space for title text`,
    },
  };
}

function wantsPlan(message: string): boolean {
  const m = message.toLowerCase();
  const verb = /(genera|generar|crea|crear|haz|hacer|arma|armar|reescribe|rehaz|escribe|monta|nuevo|nueva)/.test(m);
  const object =
    /(plan|video|vídeo|anuncio|spot|comercial|cap[ií]tulo|saga|historia|guion|guión|storyboard|story|reel|short|clip|clon)/.test(
      m
    );
  return verb && object;
}

function localChatReply(message: string, mode: Mode): string {
  const m = message.toLowerCase();
  if (/gancho|hook|primeros|inicio/.test(m)) {
    return "El gancho se decide en 24 frames. Empieza por el resultado, no por el contexto: muestra el objeto ya transformado y recién después explica cómo. Si en el segundo 2 el espectador ya sabe todo, lo perdió.";
  }
  if (/musica|música|audio|sonido|ritmo/.test(m)) {
    return "Regla práctica: el sonido entra un frame antes del corte para que el ojo no note la costura. En los primeros 5 s usa percusión seca sin melodía; la melodía aparece recién cuando el beneficio ya está en cuadro.";
  }
  if (/personaje|actor|rostro|protagonista/.test(m)) {
    return "Para que un personaje se sostenga entre tomas necesitas tres vistas coherentes: frontal neutra, tres cuartos y perfil, con la misma ropa y la misma luz. Eso es lo que evita que la IA invente una cara nueva en cada plano.";
  }
  if (/precio|cu[aá]nto cuesta|suscrip|pago|tarifa|membres|plan de pago|planes de pago/.test(m)) {
    return "El plan gratuito sirve para probar el flujo completo: un video de 15 s con storyboard y prompts. Los planes pagos desbloquean renders largos y marcas de agua fuera. Puedo dejarte el kit de publicación listo mientras decides.";
  }
  if (/saga|capitulo|capítulo|historia|trama/.test(m)) {
    return "Para una saga necesito tres anclas: la regla del mundo, lo que el protagonista pierde en el capítulo 1 y la revelación que reordena todo. Con eso genero el capítulo completo y dejo el cliffhanger del siguiente.";
  }
  if (/hola|buenas|qué tal|qué puedes|ayuda/.test(m)) {
    return "Puedo hacer tres cosas: clonar la estructura de un video viral y cambiar lo que tú elijas, construir un anuncio desde una idea o un producto, o escribir una saga por capítulos con storyboard. Dime el objetivo y armo el plan completo.";
  }
  return mode === "clone"
    ? "Entendido. Mantengo el ritmo y los cortes del clip fuente, y reemplazo solo lo que me indiques. Si quieres que reescriba el plan completo con estos cambios, pídeme «genera el plan» y lo hago en un paso."
    : "Entendido. Puedo convertir eso en un plan completo (guion, storyboard, reparto, audio y kit de publicación). Dime «genera el plan» y lo armo, o sigamos afinando la idea primero.";
}

/* ------------------------------------------------------------------ *
 * Link analysis (oEmbed metadata only — no scraping of video content)
 * ------------------------------------------------------------------ */

function detectPlatform(url: string) {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "Facebook";
  if (u.includes("x.com") || u.includes("twitter.com")) return "X";
  return "Enlace";
}

async function fetchOEmbed(url: string, platform: string) {
  let endpoint: string | null = null;
  if (platform === "YouTube") {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  } else if (platform === "TikTok") {
    endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  }
  if (!endpoint) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      title: data.title || undefined,
      author: data.author_name || undefined,
      thumbnail: data.thumbnail_url || undefined,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Scout Intelligence: Búsquedas Temáticas Personalizadas
 * ------------------------------------------------------------------ */

function detectScoutSearch(text: string): string | null {
  const t = text.toLowerCase().trim();
  const match = t.match(
    /(?:busca|buscar|búscame|encuentra|encontrar|encuéntrame|rastrea|rastrear|rastréame|quiero que me busques|dame videos? virales? de|videos? virales? sobre|video viral sobre|video viral de)\s+(.+)/i
  );
  if (match && match[1]) {
    let query = match[1].replace(/[.?!,]+$/, "").trim();
    query = query.replace(/^(un|una|unos|unas|el|la|los|las|de|sobre|videos?|virales?)\s+/i, "");
    query = query.replace(/^(un|una|unos|unas|el|la|los|las|de|sobre|videos?|virales?)\s+/i, "");
    query = query.replace(/(?:en|por)\s+(tiktok|instagram|youtube|shorts|reels)$/i, "").trim();
    if (query.length >= 2) return query;
  }
  if (
    (t.includes("viral") || t.includes("tendencia") || t.includes("ganador")) &&
    (t.includes("busca") || t.includes("encuentra") || t.includes("quiero"))
  ) {
    let cleaned = t
      .replace(
        /(?:busca|buscar|búscame|encuentra|quiero|por favor|un|una|video|videos|viral|virales|de|sobre|en tendencias|ganadores)/gi,
        " "
      )
      .trim();
    cleaned = cleaned.replace(/\s+/g, " ");
    if (cleaned.length >= 3) return cleaned;
  }
  return null;
}

function runScoutSearch(query: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), "scratch/scout_custom_search.py");
    const cmd = `python "${scriptPath}" "${query.replace(/"/g, "")}"`;
    exec(cmd, { timeout: 60000, encoding: "utf-8" }, (err) => {
      if (err) return reject(err);
      const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
      if (fs.existsSync(dataFile)) {
        try {
          return resolve(JSON.parse(fs.readFileSync(dataFile, "utf-8")));
        } catch (e) {
          return reject(e);
        }
      }
      return resolve(null);
    });
  });
}

function runFenixScout(platform: "tiktok" | "instagram" | "both" = "both", query?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = "C:\\Users\\Usuario\\Documents\\trae_projects\\Beatriz Publisher\\SAI_Agent\\tools\\fenix_social_scout.py";
    const qArg = query ? ` --query "${query.replace(/"/g, "")}"` : "";
    const cmd = `python "${scriptPath}" --platform ${platform}${qArg}`;
    exec(cmd, { timeout: 120000, encoding: "utf-8" }, (err) => {
      if (err) return reject(err);
      const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
      if (fs.existsSync(dataFile)) {
        try {
          return resolve(JSON.parse(fs.readFileSync(dataFile, "utf-8")));
        } catch (e) {
          return reject(e);
        }
      }
      return resolve(null);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(config.gemini.apiKey),
    supabase: config.supabase.enabled,
    kaggle: config.kaggle.enabled,
    wompi: config.wompi.enabled,
    config: publicConfig(),
  });
});

// Endpoint directo para búsqueda bajo demanda del Scout
app.post("/api/viral/scout/search", async (req: Request, res: Response) => {
  const { query } = req.body || {};
  if (!query) {
    return res.status(400).json({ error: "Falta el parámetro 'query'" });
  }
  try {
    const result = await runScoutSearch(String(query));
    if (result) {
      return res.json(result);
    }
    return res.status(500).json({ error: "No se pudieron obtener resultados para esta búsqueda." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error ejecutando búsqueda del Scout" });
  }
});

// Endpoint para activar Fénix Social Scout en primera persona (TikTok / Instagram)
app.post("/api/viral/scout/fenix", async (req: Request, res: Response) => {
  const { platform = "both", query } = req.body || {};
  try {
    const result = await runFenixScout(platform, query);
    if (result) {
      return res.json(result);
    }
    return res.status(500).json({ error: "Fénix finalizó la misión sin nuevos ganadores." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error en misión de Fénix Social Scout" });
  }
});

// Conversational director
app.post("/api/ai/chat", async (req: Request, res: Response) => {
  const { messages = [], project = null, mode = "clone", attachments = [] } = req.body || {};
  const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
  const userText: string = lastUser?.content || "";

  // Detección de Búsqueda Personalizada para el Scout
  const scoutQuery = detectScoutSearch(userText);
  if (scoutQuery) {
    try {
      console.log(`[director] Intención de búsqueda de Scout detectada para: "${scoutQuery}"`);
      const result = await runScoutSearch(scoutQuery);
      if (result && result.winners && result.winners.length > 0) {
        const winnersList = result.winners
          .slice(0, 3)
          .map(
            (w: any, idx: number) =>
              `**${idx + 1}. ${w.title}** (${w.author}) · ${w.views} vistas · ${w.likes} likes`
          )
          .join("\n");

        const reply = `🎯 ¡Entendido Wily! Puse a trabajar al **Scout Brain** para rastrear las tendencias más calientes de los últimos 7 días sobre: **«${scoutQuery}»**.\n\nEncontré ${result.winners.length} videos ganadores en plena explosión algorítmica:\n${winnersList}\n\n⚡ **Actualicé la parrilla de tu radar arriba**. Puedes abrir las curvas predictivas o tocar **«Clonar este ganador»** para empezar a construir la versión generada por IA.`;

        return res.json({
          mode: "scout",
          action: "scout_search",
          query: scoutQuery,
          reply,
          winners: result.winners,
          telemetry: result.telemetry,
        });
      }
    } catch (err: any) {
      console.error("[director] Error en búsqueda personalizada de Scout:", err?.message);
    }
  }

  const ai = getGenAI();

  if (!ai) {
    // Sin clave seguimos siendo útiles: el motor local arma el plan completo.
    if (wantsPlan(userText)) {
      const brief =
        userText.trim().length > 25
          ? userText
          : (project?.brief || project?.logline || userText);
      const plan = buildLocalPlan({ brief, mode: (project?.mode || mode) as Mode });
      return res.json({
        mode: "local",
        action: "plan",
        reply: `Plan generado con el motor local: ${plan.shots.length} planos, ${plan.duration}s en formato ${plan.format}. Ya está en el estudio; configuremos GEMINI_API_KEY cuando quieras que el director escriba a medida.`,
        plan,
        warning:
          "Modo local activo: no hay GEMINI_API_KEY configurada. El plan usa el motor de plantillas de CloneCinema.",
      });
    }
    return res.json({
      mode: "local",
      action: "chat",
      reply: localChatReply(userText, mode),
      warning:
        "Modo local activo: no hay GEMINI_API_KEY configurada. La conversación es guiada, no generativa.",
    });
  }

  try {
    const systemInstruction = `Eres el director creativo de CloneCinema, un estudio que clona la estructura de videos virales y la convierte en videos nuevos para TikTok, Reels y Shorts.

Trabajas en tres modos:
- "clone": remezclar un video fuente conservando ritmo, cortes y cámara, y reemplazando solo lo pedido (personajes, producto, objetos, fondos, logos, textos).
- "ad": anuncio de producto desde una idea, una imagen o un brief.
- "saga": capítulo de una historia o saga con continuidad entre capítulos.

Reglas:
1. Responde en español, breve (máximo 120 palabras), concreto y sin relleno. Nunca inventes que ya generaste un video: solo planificas.
2. Si el usuario pide crear, cambiar, reescribir o completar el video, responde con action="plan" y devuelve el plan COMPLETO en "plan". Si solo conversa o pregunta, action="chat" y omite "plan".
3. En modo clone, "references" debe listar cada elemento del video fuente con keep=true (se conserva) o keep=false y replaceWith (se reemplaza). Nunca cambies lo que el usuario no pidió cambiar.
4. Los shots duran entre 2 y 10 segundos y la suma debe acercarse a la duración total. imagePrompt y videoPrompt van SIEMPRE en inglés y describen un frame concreto; el resto del plan va en español.
5. Si el usuario aporta una persona real, recuérdale en una frase que necesita autorización o consentimiento antes de generar.
6. Si falta información, no bloquees: asume lo razonable, dilo en una línea y entrega el plan.

Modo actual: ${mode}.
Proyecto actual (JSON, puede estar vacío): ${JSON.stringify(project || {}).slice(0, 12000)}`;

    const history = (messages || []).map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    }));

    const parts: any[] = [];
    for (const file of attachments.slice(0, 3)) {
      if (typeof file === "string" && file.startsWith("data:")) {
        const [meta, data] = file.split(",");
        const mimeType = meta.replace("data:", "").replace(";base64", "") || "image/jpeg";
        parts.push({ inlineData: { mimeType, data } });
      }
    }

    const contents: any[] = history.length
      ? history
      : [{ role: "user", parts: [{ text: userText || "Hola" }] }];
    if (parts.length) {
      contents.push({ role: "user", parts });
    }

    const response = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: chatSchema,
      },
    });

    const parsed = parseJson<{ reply: string; action: string; plan?: any }>(response.text, {
      reply: "No pude estructurar la respuesta. ¿Reformulas la petición?",
      action: "chat",
    });

    res.json({
      mode: "gemini",
      reply: parsed.reply,
      action: parsed.action === "plan" && parsed.plan ? "plan" : "chat",
      plan: parsed.action === "plan" ? parsed.plan : undefined,
    });
  } catch (err: any) {
    console.error("chat error:", err?.message);
    res.json({
      mode: "local",
      action: "chat",
      reply: localChatReply(userText, mode),
      warning: `La IA no respondió (${err?.message || "error desconocido"}). Respuesta del motor local.`,
    });
  }
});

// Estado en memoria del Radar Scout de Videos Ganadores con Trazabilidad
const trendingWinnersStore = [
  {
    id: "win-1",
    title: "La Criatura Frutal y el Secreto de la Naturaleza",
    author: "@nature_illusions",
    platform: "tiktok",
    url: "https://www.tiktok.com/@nature_illusions/video/7291048291038",
    niche: "Misterio & Disrupción Surrealista",
    views: "5.8M",
    likes: "640K",
    duration: 15,
    hookType: "Disrupción visual surrealista",
    hookDescription: "Ser orgánico emerge en un cultivo y sostiene una fruta brillante que rompe la física.",
    thumbnail: "/thumbnails/winner_1.png",
    recommendedConcept: "Clonar estructura con avatar místico o personaje Saiyan en entorno orgánico.",
    status: "published",
    clonedAt: "15 Nov 2026 · 19:30",
    publishedMetrics: {
      ourViews: "385K",
      ourLikes: "42.5K",
      retention: "86%",
      hitScore: 9.4,
      verdict: "viral_hit",
    },
  },
  {
    id: "win-2",
    title: "El Despertar del Guerrero Definitivo",
    author: "@saiyan_mindset",
    platform: "reels",
    url: "https://www.instagram.com/reels/C7kL90pA_12/",
    niche: "Motivación & Transformación Épica",
    views: "4.2M",
    likes: "510K",
    duration: 15,
    hookType: "Pregunta confrontativa + Zoom ki",
    hookDescription: "Mirada fija con aura destellante y pregunta que interpela la disciplina del espectador.",
    thumbnail: "/thumbnails/winner_2.png",
    recommendedConcept: "Adaptar a video de superación con Son Goku y locución enérgica.",
    status: "cloned",
    clonedAt: "16 Nov 2026 · 10:15",
  },
  {
    id: "win-3",
    title: "La Ley del Más Fuerte: Disciplina Brutal",
    author: "@elite_warrior_code",
    platform: "shorts",
    url: "https://www.youtube.com/shorts/v_VegetaPower77",
    niche: "Orgullo & Liderazgo Implacable",
    views: "3.7M",
    likes: "430K",
    duration: 15,
    hookType: "Contraste de escala + Iluminación dramática",
    hookDescription: "Primer plano imponente con rayos eléctricos azules y silueta en pose de poder.",
    thumbnail: "/thumbnails/winner_3.png",
    recommendedConcept: "Clonar estructura de confrontación con Vegeta o líder implacable.",
    status: "available",
  },
  {
    id: "win-4",
    title: "El Ciclo de la Semilla Prohibida",
    author: "@seed_magic_macro",
    platform: "tiktok",
    url: "https://www.tiktok.com/@seed_magic_macro/video/73029182019",
    niche: "Bucle Infinito & Naturaleza Viva",
    views: "3.1M",
    likes: "380K",
    duration: 12,
    hookType: "Bucle infinito (Seamless Loop)",
    hookDescription: "Cámara macro que desciende y conecta el final con el inicio de forma imperceptible.",
    thumbnail: "/thumbnails/winner_4.jpg",
    recommendedConcept: "Video hipnótico de bucle para máxima retención de algoritmo (>120%).",
    status: "available",
  },
  {
    id: "win-5",
    title: "Qué Ocurre Realmente en el Fondo del Huerto",
    author: "@micro_universe",
    platform: "reels",
    url: "https://www.instagram.com/reels/C8mK11sB_34/",
    niche: "Curiosidad Científica & Revelación",
    views: "2.9M",
    likes: "295K",
    duration: 15,
    hookType: "Curiosity Gap (Brecha de intriga)",
    hookDescription: "Revelación progresiva en 3 tomas encadenadas con aumento de tensión.",
    thumbnail: "/thumbnails/winner_5.jpg",
    recommendedConcept: "Narrativa documental con voz neuronal estilo narrador de misterio.",
    status: "available",
  },
  {
    id: "win-6",
    title: "El Toque Dorado de la Primavera",
    author: "@cinematic_essence",
    platform: "shorts",
    url: "https://www.youtube.com/shorts/s_GoldenBloom88",
    niche: "Estética Cinematográfica & Lujo",
    views: "2.4M",
    likes: "260K",
    duration: 12,
    hookType: "Dopamina visual hiper-detallada",
    hookDescription: "Colores saturados, partículas en suspensión y movimiento de cámara fluido.",
    thumbnail: "/thumbnails/winner_6.png",
    recommendedConcept: "Video estético de alta gama para productos de lujo o intros de saga.",
    status: "available",
  },
];

// Top 6 videos ganadores detectados por el radar Scout diario + Telemetría Cerebral
app.get("/api/viral/trending", (_req: Request, res: Response) => {
  const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
  if (fs.existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      if (Array.isArray(parsed.winners) && parsed.winners.length > 0) {
        return res.json(parsed);
      }
    } catch (e) {
      console.error("[scout] Error leyendo scout_winners.json:", e);
    }
  }

  const telemetry = {
    totalTracked: trendingWinnersStore.length,
    totalCloned: trendingWinnersStore.filter((w) => w.status !== "available").length,
    totalPublished: trendingWinnersStore.filter((w) => w.status === "published").length,
    globalHitRate: "88%",
    topHookType: "Disrupción visual surrealista",
    topNiche: "Misterio & Disrupción Surrealista",
    scoutConfidence: "94.6% Precisión Algorítmica",
  };
  return res.json({ winners: trendingWinnersStore, telemetry });
});

// Actualizar estado de trazabilidad de un video ganador
app.post("/api/viral/trending/status", (req: Request, res: Response) => {
  const { id, status } = req.body || {};
  const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
  
  if (fs.existsSync(dataFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      const found = parsed.winners.find((w: any) => w.id === id);
      if (found && status) {
        found.status = status;
        if (status === "cloned") {
          found.clonedAt = new Date().toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        fs.writeFileSync(dataFile, JSON.stringify(parsed, null, 2), "utf-8");
        return res.json({ success: true, winner: found });
      }
    } catch {}
  }

  const found = trendingWinnersStore.find((w) => w.id === id);
  if (found && status) {
    found.status = status;
    if (status === "cloned") {
      found.clonedAt = new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return res.json({ success: true, winner: found });
  }
  return res.status(404).json({ error: "Video no encontrado o estado inválido." });
});

// Analyze a viral link and return its structure + a remix plan
app.post("/api/viral/analyze", async (req: Request, res: Response) => {
  const {
    url = "",
    brief = "",
    mode = "clone",
    format = "9:16",
    duration = 15,
    referenceImage,
  } = req.body || {};
  const platform = detectPlatform(url);
  const meta = url ? await fetchOEmbed(url, platform) : null;
  const sourceMeta = {
    url,
    platform,
    title: meta?.title,
    author: meta?.author,
    thumbnail: meta?.thumbnail,
    note: meta
      ? "Metadatos públicos del video. El ritmo se reconstruye a partir de tu descripción y la referencia visual."
      : url
      ? `No se pudieron leer metadatos públicos de ${platform}. El análisis se apoya en tu descripción y en la imagen de referencia.`
      : "Análisis sin enlace: se trabaja solo con tu descripción y la referencia visual.",
  };

  const ai = getGenAI();
  if (!ai) {
    const plan = buildLocalPlan({
      brief: brief || "Un video que clona el gancho de un viral",
      mode: mode as Mode,
      format,
      duration,
      sourceUrl: url,
      sourceTitle: meta?.title,
    });
    return res.json({
      mode: "local",
      sourceMeta,
      viralDNA: plan.viralDNA,
      plan,
      warning:
        "Modo local: estructura generada con el motor de plantillas de CloneCinema. Configura GEMINI_API_KEY para analizar la portada y escribir un plan a medida.",
    });
  }

  try {
    const contents: any = [
      {
        role: "user",
        parts: [
          {
            text: `Analiza este video viral y devuelve su ADN estructural.

Plataforma: ${platform}
Enlace: ${url || "(sin enlace)"}
Título público: ${meta?.title || "(desconocido)"}
Autor: ${meta?.author || "(desconocido)"}
Objetivo del usuario: ${brief || "clonar el formato para un producto propio"}
Modo: ${mode}
Formato: ${format}
Duración: ${duration}s

No tienes acceso al archivo de video. Construye el ADN viral (gancho, patrón, beats con marcas de tiempo, trucos de retención, CTA) a partir del título, la portada adjunta si existe y, sobre todo, de la descripción del usuario. Sé explícito y útil, no genérico.

Después devuelve un plan completo en el esquema: en "references" lista los elementos del clip original con keep=true o keep=false + replaceWith según lo que pidió el usuario.`,
          },
        ],
      },
    ];

    if (typeof referenceImage === "string" && referenceImage.startsWith("data:")) {
      const [metaPart, data] = referenceImage.split(",");
      const mimeType = metaPart.replace("data:", "").replace(";base64", "") || "image/jpeg";
      contents[0].parts.push({ inlineData: { mimeType, data } });
    }

    const response = await generateWithFallback(ai, {
      contents,
      config: {
        systemInstruction:
          "Eres analista de contenido viral y director de video. Describes estructura, no contenido ilegal. Nunca afirmas haber visto el video completo.",
        responseMimeType: "application/json",
        responseSchema: planSchema,
      },
    });

    const plan: any = parseJson(response.text, null);
    if (!plan) throw new Error("Respuesta sin plan válido");

    res.json({
      mode: "gemini",
      sourceMeta,
      viralDNA: plan.viralDNA,
      plan,
    });
  } catch (err: any) {
    console.error("analyze error:", err?.message);
    const plan = buildLocalPlan({
      brief: brief || "Un video que clona el gancho de un viral",
      mode: mode as Mode,
      format,
      duration,
      sourceUrl: url,
      sourceTitle: meta?.title,
    });
    res.json({
      mode: "local",
      sourceMeta,
      viralDNA: plan.viralDNA,
      plan,
      warning: `El análisis con IA falló (${err?.message || "error"}). Se usó el motor local.`,
    });
  }
});

// Keyframe image (ruta directa sin cobro; la vía SaaS es /api/generate/image)
app.post("/api/ai/image", async (req: Request, res: Response) => {
  const { prompt = "", aspectRatio = "9:16" } = req.body || {};
  if (!getGenAI()) {
    return res.status(503).json({
      success: false,
      error: "Falta GEMINI_API_KEY para generar imágenes.",
    });
  }
  try {
    const imageUrl = await generateGeminiImage(prompt, aspectRatio);
    res.json({ success: true, imageUrl });
  } catch (err: any) {
    console.error("image error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Error generando imagen" });
  }
});

// Narration (Gemini TTS -> WAV)
app.post("/api/ai/speech", async (req: Request, res: Response) => {
  const { text = "", voice = "Zephyr", tone = "cinematic and confident" } = req.body || {};
  if (!getGenAI()) {
    return res.status(503).json({ success: false, error: "Falta GEMINI_API_KEY para la narración." });
  }
  try {
    const audio = await generateGeminiSpeech({ text, voice, tone });
    res.json({ success: true, audioBase64: audio.audioBase64, mimeType: audio.mimeType });
  } catch (err: any) {
    console.error("speech error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Error generando narración" });
  }
});

// Video render (Veo) — start, poll, stream
app.post("/api/ai/video", async (req: Request, res: Response) => {
  const { prompt = "", aspectRatio = "9:16" } = req.body || {};
  if (!getGenAI()) {
    return res.status(503).json({ success: false, error: "Falta GEMINI_API_KEY para renderizar video." });
  }
  try {
    const operationName = await startVeo(prompt, aspectRatio);
    res.json({ success: true, operationName });
  } catch (err: any) {
    console.error("video start error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Error iniciando el render" });
  }
});

app.post("/api/ai/video-status", async (req: Request, res: Response) => {
  const { operationName } = req.body || {};
  if (!getGenAI()) return res.status(503).json({ success: false, error: "Falta GEMINI_API_KEY." });
  if (!operationName) return res.status(400).json({ success: false, error: "operationName requerido" });
  try {
    res.json({ success: true, ...(await veoStatus(String(operationName))) });
  } catch (err: any) {
    console.error("video status error:", err?.message);
    res.status(500).json({ success: false, error: err?.message || "Error consultando el render" });
  }
});

app.get("/api/ai/video-file", async (req: Request, res: Response) => {
  const operationName = String(req.query.op || "");
  if (!operationName) return res.status(400).json({ error: "Render no disponible" });
  try {
    await streamVeo(operationName, res);
  } catch (err: any) {
    console.error("video stream error:", err?.message);
    if (!res.headersSent) res.status(500).json({ error: err?.message });
    else res.end();
  }
});

/* ------------------------------------------------------------------ *
 * Static / Vite
 * ------------------------------------------------------------------ */

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const flags = [
      `Gemini: ${config.gemini.apiKey ? "on" : "off"}`,
      `Supabase: ${config.supabase.enabled ? "on" : "off"}`,
      `Kaggle: ${config.kaggle.enabled ? "on" : "off"}`,
      `Wompi: ${config.wompi.enabled ? "on" : "off"}`,
    ];
    console.log(`[CloneCinema] http://0.0.0.0:${PORT} — ${flags.join(" · ")}`);
  });
}

startServer();
