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
}): any {
  const mode = input.mode;
  const duration = input.duration || (mode === "saga" ? 60 : mode === "ad" ? 30 : 15);
  const format = input.format || "9:16";
  const brief = normalizeBrief(input.brief || "") || "un producto que aparece en el momento exacto";
  const base = titleFromBrief(brief, mode === "saga" ? "Capítulo 1" : "Nuevo video");
  const sourceLabel = input.sourceTitle || "un video viral de referencia";

  const beats = MODE_BEATS[mode] || MODE_BEATS.clone;
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

function detectPlatform(url: string): string {
  if (/tiktok\.com/i.test(url)) return "TikTok";
  if (/instagram\.com/i.test(url)) return "Instagram Reels";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube Shorts";
  return "Video";
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const {
    url = "",
    brief = "",
    mode = "clone",
    format = "9:16",
    duration = 15,
  } = req.body || {};

  const platform = detectPlatform(url);
  const sourceMeta = {
    url,
    platform,
    title: url ? `Video de ${platform}` : undefined,
    author: "@creador_viral",
    note: "Metadatos analizados con el motor de clonación estructural de CloneCinema.",
  };

  const plan = buildLocalPlan({
    brief: brief || "Un video que clona el gancho de un viral",
    mode: (mode as Mode) || "clone",
    format,
    duration,
    sourceUrl: url,
    sourceTitle: sourceMeta.title,
  });

  return res.status(200).json({
    mode: "local",
    sourceMeta,
    viralDNA: plan.viralDNA,
    plan,
  });
}
