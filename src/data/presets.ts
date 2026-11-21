import type { Project } from "../types";

const now = new Date().toISOString();

export const RADAR_SOCIAL_PRESET: Project = {
  id: "prj-radar-social",
  name: "Radar Social: La Tendencia Imposible",
  title: "Radar Social: La Tendencia Imposible",
  mode: "clone",
  format: "9:16",
  duration: 15,
  style: "Ciber-noticioso cinematográfico hiperrealista, iluminación volumétrica de pantallas LED y HUDs holográficos",
  language: "es",
  logline:
    "Un avatar hiperrealista de CloneCinema expone una premisa hiperbólica global que desafía la realidad digital en 15 s...",
  brief:
    "Clon viral diseñado para romper el scroll: gancho con el 99% de Internet, colapso de algoritmos y llamada a la acción intrigante.",
  sourceUrl: "https://www.youtube.com/shorts/radar-social",
  sourceMeta: {
    url: "https://www.youtube.com/shorts/radar-social",
    platform: "YouTube Shorts",
    title: "El 99% del Internet acaba de cambiar",
    author: "@CloneCinemaDirector",
    note: "Video clonado desde el Radar Scout con algoritmo Wily Scoring 7D.",
  },
  viralDNA: {
    hook: "El noventa y nueve por ciento del internet acaba de cambiar para siempre y nadie lo notó.",
    pattern: "Gancho hiperbólico → evidencia global de colapso → giro revelador de censura → CTA a comentar",
    beats: [
      { at: "0-3s", label: "El Gancho Hiperbólico", why: "Disrupción frontal a cámara con zoom rápido hacia los ojos." },
      { at: "3-8s", label: "La Evidencia Global", why: "Pantalla dividida con gráficas y colapso algorítmico mundial." },
      { at: "8-12s", label: "El Giro Revelador", why: "Ángulo holandés y revelación de secretos ocultos por plataformas." },
      { at: "12-15s", label: "Cierre Viral y CTA", why: "Sonrisa confiada, señalando abajo: 'Comenta antes de que lo borren'." },
    ],
    retentionTricks: [
      "Crash zoom a los ojos en los primeros 1.5s",
      "Picos de HUDs holográficos al 3er segundo",
      "Corte rítmico a 130 BPM",
    ],
    cta: "¿Ya te apareció a ti? Comenta antes de que lo borren.",
  },
  references: [
    {
      id: "ref-1",
      kind: "character",
      name: "Avatar Sintético",
      description: "Presentador ciber-noticioso con traje moderno y expresión de urgencia",
      keep: true,
    },
    {
      id: "ref-2",
      kind: "location",
      name: "Plató Virtual Radar Social",
      description: "Estudio ciber-noticioso oscuro con suelo de espejo negro pulido y muros de pantallas LED",
      keep: true,
    },
    {
      id: "ref-3",
      kind: "prop",
      name: "HUD Holográfico de Tendencias",
      description: "Gráficas tridimensionales translúcidas que flotan frente al avatar",
      keep: true,
    },
    {
      id: "ref-4",
      kind: "prop",
      name: "Mapa",
      description: "Objeto clave utilizado en Plano 2",
      keep: true,
    },
  ],
  characters: [
    {
      id: "char-avatar",
      name: "Avatar Sintético",
      role: "Presentador y Anchor Principal",
      description:
        "Hombre joven carismático de cabello castaño rizado, barba recortada, mirada penetrante y expresión de urgencia creíble.",
      color: "#c8fa5a",
      avatarUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_2287f94c-5fb5-4ea6-bf1a-86d6f831c991_1795140290171.png",
    },
  ],
  locations: [
    {
      id: "loc-plato",
      name: "Plató Virtual Radar Social",
      description:
        "Estudio ciber-noticioso oscuro con suelo de espejo negro pulido y muros formados por pantallas LED de datos verticales.",
      timeOfDay: "Noche artificial",
      color: "#06b6d4",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_8b3aa0d7-7f3f-4f92-bf55-79159243e3b8_1795140515114.png",
    },
  ],
  props: [
    {
      id: "prop-hud",
      name: "HUD Holográfico de Tendencias",
      description:
        "Gráficas tridimensionales translúcidas que flotan frente al avatar con picos de interacción y mapas mundiales.",
      category: "Interfaz Digital",
      color: "#3b82f6",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_cd468bf3-bd06-417d-99c5-61e9bf9be388_1795140757224.png",
    },
    {
      id: "prop-mapa",
      name: "Mapa",
      description: "Objeto clave utilizado en Plano 2 con cartas estelares y datos mundiales.",
      category: "Objeto",
      color: "#eab308",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_ace4a5cc-1782-4a6f-b8ae-916f0098f645_1795142734670.png",
    },
  ],
  shots: [
    {
      id: "shot-1",
      number: 1,
      title: "El Gancho Hiperbólico",
      seconds: 7,
      camera:
        "Plano medio corto (MCU), empuje rápido (crash zoom in) hacia los ojos del presentador en Plató Virtual Radar Social",
      action:
        "El avatar de CloneCinema señala fijamente al lente con expresión de urgencia mientras gráficos flotantes estallan a su alrededor. Usa HUD Holográfico de Tendencias.",
      voiceover: "El noventa y nueve por ciento del internet acaba de cambiar para siempre y nadie lo notó.",
      imagePrompt:
        "Futuristic male news anchor pointing intensely at camera, urgent expression, dark cyber studio with vertical glowing blue and cyan LED walls, holographic metrics floating around him, cinematic moody lighting, hyperrealistic 8k --ar 9:16",
      videoPrompt:
        "Fast push in towards the eyes of an urgent news presenter in a dark high-tech newsroom, holographic data charts erupting around him",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_21a2e570-dfca-4e53-961d-3cd1ad827975_1795148844207.png",
      audioUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/voices/1795238672153_czrpae.wav",
      videoUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/kaggle_video_a407c34f-a4a5-4e86-8f82-4ae97c78ff15_1795251540742.mp4",
      characterId: "char-avatar",
      locationId: "loc-plato",
      propId: "prop-hud",
    },
    {
      id: "shot-2",
      number: 2,
      title: "La Evidencia Global",
      seconds: 5,
      camera: "Plano medio con paneo lateral rápido a pantalla dividida",
      action:
        "Presentador analizando mapas y flujos de datos en tiempo real mientras pantallas traseras parpadean con advertencias en rojo y cyan.",
      voiceover: "Desde Tokio hasta Nueva York, los algoritmos colapsaron en simultáneo.",
      imagePrompt:
        "Futuristic news anchor gesturing toward floating holographic screens displaying viral network graphs and rapid social media metrics, hyper-detailed UI design, cinematic moody lighting, 9:16",
      videoPrompt:
        "Lateral tracking pan showing news anchor studying live network traffic collapse on floating transparent holographic displays",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_623fea87-522d-4a11-8f8a-acbcbf11c0d4_1795151039389.png",
      audioUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/voices/1795238677841_1hgo2k.wav",
      videoUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/kaggle_video_46f1795b-f6a5-49fb-8870-5a681dd08f75_1795261573824.mp4",
      characterId: "char-avatar",
      locationId: "loc-plato",
      propId: "prop-mapa",
    },
    {
      id: "shot-3",
      number: 3,
      title: "El Giro Revelador",
      seconds: 4,
      camera: "Primer plano cerrado (close-up) con leve giro orbital dutch angle",
      action:
        "El rostro del avatar se ilumina con un destello magenta y cyan mientras baja el tono y revela la verdad oculta.",
      voiceover: "Y la razón real es algo que las plataformas intentaron ocultar hoy.",
      imagePrompt:
        "Extreme close up dramatic angle of cyber anchor, subtle orbital camera rotation, neon rim light reflecting on skin, cinematic depth of field, high tension look",
      videoPrompt:
        "Slow orbital arc around the anchor face as background LED walls shift to deep crimson warning mode",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_15b2a273-6f47-4bdf-8f08-c3e2ddad9b90_1795151830305.png",
      audioUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/voices/1795238683080_w5x3hr.wav",
      videoUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/kaggle_video_82974f52-4672-410e-a730-5f1a2c973f99_1795281719392.mp4",
      characterId: "char-avatar",
      locationId: "loc-plato",
    },
    {
      id: "shot-4",
      number: 4,
      title: "El Cierre Viral y CTA",
      seconds: 5,
      camera: "Plano medio frontal con corte dinámico",
      action:
        "El presentador sonríe levemente con confianza y señala hacia abajo invitando a comentar antes del cierre en bucle.",
      voiceover: "¿Ya te apareció a ti? Comenta antes de que lo borren.",
      imagePrompt:
        "Charismatic cyber anchor smiling confidently, pointing down toward viewer comment section, clean high-tech studio background with glowing accents, sharp focus 9:16",
      videoPrompt:
        "Anchor smiles with confident smirk and gestures downwards pointing towards the comment interface as camera slowly pulls back",
      imageUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/keyframes/kaggle_52999aa1-7bc0-4e2b-aef8-d9c111f7424e_1795152132125.png",
      audioUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/voices/1795238687463_wrclvn.wav",
      videoUrl:
        "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/videos/kaggle_video_1c6c3042-a5c4-4a3c-a3f6-23a2a2ed74fb_1795283243656.mp4",
      characterId: "char-avatar",
      locationId: "loc-plato",
    },
  ],
  audio: {
    narration:
      "El noventa y nueve por ciento del internet acaba de cambiar para siempre y nadie lo notó. Desde Tokio hasta Nueva York, los algoritmos colapsaron en simultáneo. Y la razón real es algo que las plataformas intentaron ocultar hoy. ¿Ya te apareció a ti? Comenta antes de que lo borren.",
    narrationUrl:
      "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/voices/1795238697593_1o4hai.wav",
    voice: "Fenrir",
    music: "Cyber-electronic news score pulsante a ritmo acelerado con textura de misterio tecnológico.",
    musicUrl:
      "https://micjwzatshemmovaneix.supabase.co/storage/v1/object/public/audio/bgm/cyber_radar_invincible.mp3",
    bpm: "130 BPM",
    sfxPalette: [
      "Sub-bass impact hook",
      "Digital glitch swoosh",
      "Cybernetic UI click stream",
      "Tension riser",
      "Tape stop",
    ],
  },
  chat: [
    {
      id: "chat-1",
      role: "user",
      content:
        "⚡ Clonar video ganador: «Radar Social: La Tendencia Imposible»\nConcepto sugerido: El 99% de Internet acaba de cambiar",
      timestamp: "05:40 AM",
    },
    {
      id: "chat-2",
      role: "assistant",
      content:
        "Director CloneCinema listo. He estructurado un plan de 4 planos (15s) con proporción 9:16 optimizado para retención viral máxima en YouTube Shorts y TikTok. El reparto, el set cibernético y los props ya están asignados en el Estudio.",
      timestamp: "05:41 AM",
    },
  ],
  createdAt: now,
  updatedAt: now,
};

export const PRESET_PROJECTS: Project[] = [
  RADAR_SOCIAL_PRESET,
  {
    id: "prj-glaciar",
    name: "Botella glaciar — clon viral",
    mode: "clone",
    format: "9:16",
    duration: 15,
    style: "Cinematográfico hiperrealista, agua en cámara lenta, luz dura lateral",
    language: "es",
    title: "Botella glaciar — clon viral",
    logline:
      "Clon del viral de unboxing imposible: el producto rompe el hielo antes de que el espectador sepa qué está viendo.",
    brief:
      "Botella térmica de acero que mantiene el frío 24 horas. Queremos el mismo gancho del clip de referencia, con nuestro producto y nuestro logo.",
    sourceUrl: "https://www.tiktok.com/@creador/video/0000000000000000000",
    sourceMeta: {
      url: "https://www.tiktok.com/@creador/video/0000000000000000000",
      platform: "TikTok",
      title: "POV: el hielo no puede con esto",
      author: "@creador",
      note: "Metadatos públicos del video. El ritmo se reconstruye a partir de tu descripción y la referencia visual.",
    },
    viralDNA: {
      hook: "El hielo estalla antes de que se entienda qué lo rompió.",
      pattern: "Gancho imposible → ruptura de patrón → escalada → bucle al primer frame",
      beats: [
        { at: "0-2s", label: "Estallido de hielo", why: "Impacto físico antes de cualquier contexto." },
        { at: "2-5s", label: "Mano que atrapa la botella", why: "Ruptura de patrón: del caos al control." },
        { at: "5-10s", label: "Macro de gotas y acero", why: "Prueba sensorial del beneficio real." },
        { at: "10-15s", label: "Pose final + logo", why: "Cierre que repite el encuadre del inicio." },
      ],
      retentionTricks: [
        "Corte cada 1.4 s en los primeros 5 s",
        "Sonido de hielo 1 frame antes del corte",
        "Sin texto en pantalla hasta el segundo 5",
      ],
      cta: "Consigue la tuya antes del lunes",
    },
    references: [
      {
        id: "ref-1",
        kind: "character",
        name: "Mano protagonista",
        description: "Mano con guante negro que rompe el hielo",
        keep: false,
        replaceWith: "Nuestro atleta embajador",
      },
      {
        id: "ref-2",
        kind: "product",
        name: "Botella genérica",
        description: "Botella metálica sin marca en el clip original",
        keep: false,
        replaceWith: "Botella glaciar 750 ml",
      },
      {
        id: "ref-3",
        kind: "location",
        name: "Mesa de piedra",
        description: "Superficie oscura mojada con luz lateral dura",
        keep: true,
      },
      {
        id: "ref-4",
        kind: "logo",
        name: "Logo del creador",
        description: "Marca en la esquina inferior",
        keep: false,
        replaceWith: "Logo CloneCinema",
      },
    ],
    shots: [
      {
        id: "shot-1",
        number: 1,
        title: "Estallido",
        seconds: 3,
        camera: "Macro extremo, 100 mm, push-in agresivo",
        action: "Un bloque de hielo estalla en el aire sobre piedra mojada.",
        sfx: "Crujido seco + silencio de 150 ms",
        music: "Percusión seca sincronizada",
        imagePrompt:
          "Extreme macro of a thick block of ice exploding mid-air above wet black stone, backlit with hard cold light, frozen shards suspended, ultra realistic, 100mm macro lens, shallow depth of field",
        videoPrompt:
          "Slow motion ice shards burst toward camera, hard lateral light, micro droplets, 120fps look, no text",
        status: "idle",
      },
      {
        id: "shot-2",
        number: 2,
        title: "Captura",
        seconds: 3,
        camera: "Plano medio, dolly lateral, 50 mm",
        action: "Una mano enguantada atrapa la botella antes de que caiga.",
        sfx: "Whoosh invertido",
        music: "Sub-bass entra en el corte",
        imagePrompt:
          "Medium shot of a black-gloved hand catching a matte steel thermal bottle, dark wet studio, hard rim light, condensation droplets, cinematic product photography",
        videoPrompt: "Hand catches bottle mid-fall, camera dollies sideways, water droplets in slow motion",
        status: "idle",
      },
      {
        id: "shot-3",
        number: 3,
        title: "Textura",
        seconds: 5,
        camera: "Detalle, órbita continua, 85 mm",
        action: "Macro de gotas resbalando por el acero cepillado.",
        sfx: "Goteo limpio",
        music: "Textura orgánica, sin melodía",
        imagePrompt:
          "Macro orbit of condensation sliding down brushed steel surface, deep black background, single hard specular highlight, luxury product detail",
        videoPrompt: "Continuous orbit around brushed metal bottle, droplets sliding, dark studio, macro detail",
        status: "idle",
      },
      {
        id: "shot-4",
        number: 4,
        title: "Cierre",
        seconds: 4,
        camera: "Plano general, estático, 35 mm",
        action: "Botella sobre piedra, logo aparece en la esquina inferior.",
        onScreenText: "Frío real. 24 horas.",
        sfx: "Impacto final",
        music: "Corte a silencio en el último frame",
        imagePrompt:
          "Wide hero shot of a matte steel bottle standing on wet black stone, cold blue rim light, negative space top right, cinematic advertising still",
        videoPrompt: "Static hero shot, bottle on wet stone, slow light sweep, logo space top right",
        status: "idle",
      },
    ],
    characters: [
      {
        id: "chr-1",
        name: "Atleta",
        role: "Protagonista",
        description: "Manos fuertes, guantes negros, sin rostro visible en el gancho.",
        wardrobe: "Guantes de neopreno negro, muñequera de acero",
        color: "#c8fa5a",
      },
    ],
    locations: [
      {
        id: "loc-1",
        name: "Estudio de piedra",
        description: "Mesa de pizarra mojada, fondo negro infinito, luz lateral dura.",
        timeOfDay: "Noche",
        color: "#38bdf8",
      },
    ],
    props: [
      {
        id: "prp-1",
        name: "Botella glaciar 750 ml",
        description: "Acero cepillado, tapón mate, condensación controlada.",
        category: "Producto",
        color: "#a3e635",
      },
    ],
    audio: {
      narration: "No es hielo. Es lo que aguanta el hielo.",
      voice: "Zephyr",
      music: "Híbrido percusivo, 128 BPM, silencio antes del cierre",
      bpm: "128",
      sfxPalette: ["Crujido de hielo", "Whoosh invertido", "Goteo", "Impacto final"],
    },
    publish: {
      caption: "Clonamos el gancho, cambiamos el producto. Mismo ritmo, otra marca.",
      hashtags: ["#CloneCinema", "#ViralClone", "#Producto", "#Shorts", "#TikTokMadeMeBuyIt"],
      platforms: [
        { platform: "TikTok", copy: "Gancho en 0.4 s + CTA en el segundo 13.", hook: "El hielo no pudo con esto." },
        { platform: "Reels", copy: "Corte más lento en el macro de textura.", hook: "Mira lo que pasa al segundo 3." },
        { platform: "Shorts", copy: "Título de curiosidad negativa y bucle final.", hook: "Nadie esperaba que aguantara." },
      ],
      coverPrompt:
        "Bold vertical cover: steel bottle on wet black stone, ice shards frozen mid-air, high contrast, empty top area for title",
    },
    chat: [
      {
        id: "msg-1",
        role: "assistant",
        content:
          "Soy tu director en CloneCinema. Puedo clonar la estructura de un video viral y cambiar solo lo que tú decidas —personajes, producto, fondos, logos— o construir un anuncio o una saga desde cero. Pega un enlace de TikTok, Reels o Shorts, o cuéntame la idea.",
        timestamp: "Ahora",
      },
      {
        id: "msg-2",
        role: "user",
        content:
          "Quiero clonar este viral de unboxing para mi botella térmica. Cambia el producto y el logo, deja el resto igual.",
        timestamp: "Ahora",
      },
      {
        id: "msg-3",
        role: "assistant",
        content:
          "Listo. Conservo el set de piedra mojada, el ritmo de cortes y el bucle final; reemplazo la botella y el logo, y ajusto el macro de textura para que se lea el acero cepillado. El plan está en el estudio: 4 planos, 15 s, listo para keyframes.",
        timestamp: "Ahora",
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "prj-amaterasu",
    name: "El Despertar de Amaterasu",
    mode: "saga",
    format: "16:9",
    duration: 60,
    style: "Anime cinematográfico, paleta fuego y tinta, grano de película",
    language: "es",
    title: "El Despertar de Amaterasu — Capítulo 14",
    logline:
      "La última portadora del sello solar descubre que el precio de despertarlo es la memoria de quien ama.",
    brief:
      "Capítulo 14 de la saga: Kira rompe el sello para salvar a Ren, pero el fuego le cobra el recuerdo de su nombre.",
    viralDNA: {
      hook: "Una mano se cierra sobre una brasa sin quemarse.",
      pattern: "Profecía → pérdida → revelación que reordena el capítulo anterior",
      beats: [
        { at: "0-6s", label: "Imagen profética", why: "Promesa que solo cierra en el capítulo siguiente." },
        { at: "6-20s", label: "La regla del sello", why: "Se enuncia el costo antes de pagarlo." },
        { at: "20-42s", label: "Pérdida", why: "Kira elige y el mundo responde." },
        { at: "42-60s", label: "Giro y cliffhanger", why: "Ren no la reconoce." },
      ],
      retentionTricks: [
        "Cada corte abre una pregunta nueva",
        "El silencio se usa antes de cada revelación",
        "El último plano repite el encuadre del primero, invertido",
      ],
      cta: "Capítulo 15 en camino",
    },
    references: [],
    shots: [
      {
        id: "shot-a1",
        number: 1,
        title: "La brasa",
        seconds: 8,
        camera: "Macro, 100 mm, sin movimiento",
        action: "Una mano joven se cierra sobre una brasa. No hay humo. La piel brilla.",
        dialogue: "— Si lo sueltas, te recuerda.",
        sfx: "Chisporroteo ahogado",
        music: "Cuerdas graves, sin percusión",
        imagePrompt:
          "Anime close-up of a young hand closing around a glowing ember, no smoke, skin lit from within, ember light on fingers, dark background, cinematic anime style",
        videoPrompt: "Slow close-up, fingers close around ember, glow intensifies, embers floating, anime cinematic",
        status: "idle",
      },
      {
        id: "shot-a2",
        number: 2,
        title: "El santuario",
        seconds: 16,
        camera: "Gran plano general, grúa descendente, 24 mm",
        action: "El santuario de tinta se quiebra mientras Kira camina hacia el altar.",
        voiceover: "El sello no estaba roto. Estaba esperando.",
        sfx: "Piedra partiéndose, viento",
        music: "Taiko lejano entrando en capas",
        imagePrompt:
          "Extreme wide shot of a ruined ink-black shrine on a cliff at dawn, a lone girl walking toward a burning altar, floating embers, anime cinematic wide shot",
        videoPrompt: "Crane descends over broken shrine, embers rise, girl walks toward altar, dawn light, anime",
        status: "idle",
      },
      {
        id: "shot-a3",
        number: 3,
        title: "El nombre",
        seconds: 20,
        camera: "Primer plano, cámara en mano, 85 mm",
        action: "Kira pronuncia el nombre de Ren. El fuego se lo lleva.",
        dialogue: "— Ren. Ren, mírame.",
        voiceover: "Y el fuego, que todo lo cobra, se llevó lo único que era suyo.",
        sfx: "Silencio abrupto",
        music: "Tema de Kira en piano, una sola nota",
        imagePrompt:
          "Anime close-up of a girl's face lit by fire, tears reflecting embers, mouth open mid-word, handheld framing, warm orange key light, dark background",
        videoPrompt: "Handheld close-up, firelight flickers on face, embers drift past, slow push in, anime",
        status: "idle",
      },
      {
        id: "shot-a4",
        number: 4,
        title: "El giro",
        seconds: 16,
        camera: "Sobre el hombro, dolly in, 50 mm",
        action: "Ren abre los ojos y pregunta quién es ella.",
        dialogue: "— ¿Quién eres?",
        sfx: "Latido único",
        music: "Silencio total, luego un solo de cello",
        imagePrompt:
          "Over-the-shoulder anime shot of a boy waking in a burning shrine, looking at a girl with no recognition, fire reflections in his eyes, cinematic anime",
        videoPrompt: "Over-shoulder dolly in, boy opens eyes, no recognition, embers, cinematic anime",
        status: "idle",
      },
    ],
    characters: [
      {
        id: "chr-k",
        name: "Kira",
        role: "Protagonista",
        description: "17 años, pelo negro recogido, sello solar en la muñeca que brilla al usarlo.",
        wardrobe: "Haori blanco quemado en los bordes, vendas en las manos",
        color: "#f97316",
      },
      {
        id: "chr-r",
        name: "Ren",
        role: "Coprotagonista",
        description: "18 años, pelo claro, cicatriz sobre la ceja izquierda.",
        wardrobe: "Túnica de monje, cordón rojo",
        color: "#38bdf8",
      },
    ],
    locations: [
      {
        id: "loc-s",
        name: "Santuario de tinta",
        description: "Ruinas de tinta negra sobre un acantilado, altar en llamas.",
        timeOfDay: "Amanecer",
        color: "#a855f7",
      },
    ],
    props: [
      {
        id: "prp-b",
        name: "Brasa del sello",
        description: "Fragmento que no quema y guarda un recuerdo.",
        category: "Artefacto",
        color: "#fb923c",
      },
    ],
    audio: {
      narration: "El sello no estaba roto. Estaba esperando.",
      voice: "Charon",
      music: "Taiko, cuerdas graves y piano solo, 92 BPM",
      bpm: "92",
      sfxPalette: ["Chisporroteo", "Piedra", "Viento", "Silencio"],
    },
    publish: {
      caption: "Capítulo 14: el precio de despertar el sello.",
      hashtags: ["#Saga", "#Amaterasu", "#Anime", "#CloneCinema"],
      platforms: [
        { platform: "YouTube", copy: "Estreno del capítulo con cliffhanger al final.", hook: "El fuego cobra lo que amas." },
        { platform: "TikTok", copy: "Corte de 45 s centrado en el giro final.", hook: "Él ya no la recuerda." },
      ],
      coverPrompt:
        "Anime key visual: girl holding an ember, shrine burning behind, title space on the left",
    },
    chat: [
      {
        id: "msg-a1",
        role: "assistant",
        content:
          "Continuamos la saga. Tengo el canon del capítulo 13: el sello se agrietó y Ren quedó inconsciente. ¿Escribimos el 14 o revisamos el arco antes?",
        timestamp: "Ahora",
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
];
