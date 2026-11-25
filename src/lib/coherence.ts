import type { Character, LocationRef, Project, PropItem, Shot } from "../types";

/**
 * Detecta si una descripción o nombre corresponde a un personaje no humano / antropomórfico
 * (ej: vegetales, alimentos, animales, objetos, criaturas, robots).
 */
export function isNonHumanCharacter(text: string): boolean {
  const normalized = text.toLowerCase();
  const nonHumanKeywords = [
    "cebolla", "onion", "patata", "papa", "potato", "vegetal", "fruta", "comida", "alimento",
    "antropomórfic", "antropomorf", "anthropomorphic", "objeto", "robot", "criatura", "monstruo",
    "animal", "perro", "gato", "ratón", "oso", "conejo", "zorro", "lobo",
    "cartoon", "animad", "minion", "peluche", "juguete", "alien", "extraterrestre",
    "árbol", "planta", "flor", "hongo", "seta", "ajo", "tomate", "zanahoria",
    "hamburguesa", "pizza", "botella", "vaso", "taza", "lámpara", "reloj"
  ];
  return nonHumanKeywords.some((kw) => normalized.includes(kw));
}

/**
 * Limpia adjetivos que puedan inducir a Playground v2.5 / Flux a pintar personas 100% humanas.
 */
function sanitizeNonHumanText(text: string): string {
  return text
    .replace(/\b(rostro humano|piel humana|humana 100%|humano 100%|portrait)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generador maestro de Prompts (Positivo y Negativo) optimizado para Playground v2.5 / SDXL / Gemini.
 * Diseñado específicamente para que los personajes humanoides vegetales (como Mamá Cebolla)
 * mantengan su cuerpo humanoide femenino de señora/madre pero con cabeza literal de cebolla.
 */
export function getCharacterPrompts(char: Character, globalStyle?: string): { prompt: string; negativePrompt: string } {
  const combinedDesc = `${char.name} ${char.description} ${char.wardrobe || ""}`.toLowerCase();
  const isNonHuman = isNonHumanCharacter(combinedDesc);
  const loraTrigger = char.loraConfig?.triggerWord ? `, ${char.loraConfig.triggerWord}` : "";
  const styleAnchor = globalStyle ? `Art Style: ${globalStyle}.` : "Style: 3D animated CGI feature film character (Pixar and DreamWorks animation aesthetic).";

  if (isNonHuman) {
    let specificAnatomy = "Anthropomorphic stylized 3D CGI character design. A humanoid body with stylized proportions, where the head is an organic cartoon creature.";

    if (combinedDesc.includes("cebolla") || combinedDesc.includes("onion")) {
      specificAnatomy = "An anthropomorphic humanoid female character with a literal whole onion for a head. She has a feminine humanoid body of a mature lady and homemaker mother of the family, wearing a cozy purple collared blouse and a floral kitchen apron tied neatly around her waist. INSTEAD OF A HUMAN HEAD, HER ENTIRE HEAD IS PHYSICALLY A WHOLE YELLOW ONION BULB: a large spherical yellow onion vegetable with crisp golden papery peel texture, fine vertical onion skin ridges, and green root sprouts on top standing upright like a maternal hair bun. On the front of this yellow onion bulb are big expressive motherly cartoon eyes with gentle eyelashes and a warm smiling mouth. Gentle cartoon hands. A sweet loving motherly presence.";
    } else if (combinedDesc.includes("patata") || combinedDesc.includes("papa") || combinedDesc.includes("potato")) {
      specificAnatomy = "An anthropomorphic humanoid male character with a literal whole potato for a head. He has a stout humanoid male body of a hardworking father figure, wearing a rustic flannel shirt and denim work pants. INSTEAD OF A HUMAN HEAD, HIS ENTIRE HEAD IS PHYSICALLY A WHOLE BROWN RUSSET POTATO: an organic potato tuber with natural starchy peel texture and dimples. Friendly cartoon eyes and a warm smiling mouth are embedded directly onto the front surface of the potato. A loving paternal presence.";
    }

    const cleanDesc = sanitizeNonHumanText(char.description);
    const cleanWardrobe = char.wardrobe ? sanitizeNonHumanText(char.wardrobe) : "";

    const prompt = `${styleAnchor} Full body 3D CGI character model sheet render. ${specificAnatomy} Character Context: ${cleanDesc}. ${cleanWardrobe ? `Outfit: ${cleanWardrobe}.` : ""}${loraTrigger} High-end 3D digital sculpture, cartoon shaders, soft subsurface scattering, cinematic studio rim lighting, clean render, 8k resolution, masterpiece.`;

    // Negative prompt que elimina activamente rostros y cabezas humanas sin penalizar 'cartoon' ni 'bad anatomy'
    const negativePrompt = "real human face, real human head, human skin on head, human hair, photorealistic human face, real human woman face, deformed, ugly, blurry, low quality, bad hands, extra limbs, dark, disfigured, text, watermark";

    return { prompt, negativePrompt };
  }

  const prompt = `Cinematic character portrait photo of ${char.name}: ${char.description}. ${char.wardrobe ? `Wardrobe: ${char.wardrobe}.` : ""}${loraTrigger} ${styleAnchor} Consistent facial anatomy, authentic costume details, sharp eyes, 8k resolution, cinematic studio lighting, dramatic rim light, shallow depth of field, high detail.`;
  const negativePrompt = "ugly, deformed, noisy, blurry, distorted, low quality, bad anatomy, bad hands, lowres, collage, split screen";

  return { prompt, negativePrompt };
}

/**
 * Sintetizador de Casting para Personajes (compatibilidad hacia atrás).
 */
export function synthesizeCharacterPrompt(char: Character, globalStyle?: string): string {
  return getCharacterPrompts(char, globalStyle).prompt;
}

/**
 * Sintetizador de Sets / Localizaciones:
 * Enfatiza la atmósfera, paleta de colores y arquitectura para mantener la coherencia espacial.
 */
export function synthesizeLocationPrompt(loc: LocationRef, globalStyle?: string): string {
  const styleAnchor = globalStyle ? `Art Style: ${globalStyle}.` : "Style: Cinematic film set design.";
  return `${styleAnchor} Cinematic environment establishing shot of ${loc.name}. Atmosphere: ${loc.timeOfDay} lighting. Description: ${loc.description}. Spatial depth, architectural integrity, authentic environmental textures, cinematic lighting and color palette, 8k masterpiece.`;
}

/**
 * Sintetizador de Props / Objetos Heroicos:
 * Destaca materiales, escala e interacción física.
 */
export function synthesizePropPrompt(prop: PropItem, globalStyle?: string): string {
  const styleAnchor = globalStyle ? `Art Style: ${globalStyle}.` : "Style: Cinematic prop studio photography.";
  return `${styleAnchor} Cinematic hero prop studio shot of ${prop.name}. Category: ${prop.category}. Description: ${prop.description}. High material fidelity, dramatic rim lighting, product commercial photography, isolated macro focus, 8k resolution.`;
}

/**
 * SINTETIZADOR MAESTRO DE PLANO (SHOT COHERENCE SYNTHESIZER):
 * Ensambla dinámicamente el Actor, Set, Prop y Acción en un prompt cohesivo
 * para que NINGÚN modelo genere a ciegas.
 */
export function synthesizeShotPrompt(
  shot: Shot,
  project: Project,
  refsData?: {
    char?: Character;
    loc?: LocationRef;
    prop?: PropItem;
  }
): string {
  const char = refsData?.char || (shot.characterId ? project.characters.find((c) => c.id === shot.characterId) : undefined);
  const loc = refsData?.loc || (shot.locationId ? project.locations.find((l) => l.id === shot.locationId) : undefined);
  const prop = refsData?.prop || (shot.propId ? project.props.find((p) => p.id === shot.propId) : undefined);

  const styleContext = project.style || "High-end 3D animated film (Pixar/DreamWorks aesthetic)";
  const parts: string[] = [`Style: ${styleContext}.`];

  // 1. Inyección de Identidad del Actor
  if (char) {
    const isNonHuman = isNonHumanCharacter(`${char.name} ${char.description}`);
    const loraTrigger = char.loraConfig?.triggerWord ? `, ${char.loraConfig.triggerWord}` : "";
    if (isNonHuman) {
      const cleanDesc = sanitizeNonHumanText(char.description);
      let characterAnatomy = `Main Character: ${char.name} (${cleanDesc}), wearing ${char.wardrobe || "signature attire"}${loraTrigger}. Anthropomorphic stylized 3D animated humanoid creature with cartoon features.`;
      
      const charLower = `${char.name} ${char.description}`.toLowerCase();
      if (charLower.includes("cebolla") || charLower.includes("onion")) {
        characterAnatomy = `Main Character: Mamá Cebolla, an anthropomorphic humanoid lady with a whole yellow onion for a head. Female humanoid body wearing a purple blouse and kitchen apron. Her entire head is a round yellow onion bulb with papery peel and expressive motherly cartoon eyes.`;
      } else if (charLower.includes("patata") || charLower.includes("papa") || charLower.includes("potato")) {
        characterAnatomy = `Main Character: Papá Patata, an anthropomorphic humanoid father with a whole russet potato for a head. Stout humanoid body wearing a flannel shirt. Head is an organic brown potato with cartoon eyes.`;
      }
      parts.push(characterAnatomy);
    } else {
      parts.push(
        `Main Character: ${char.name} (${char.description}), wearing ${char.wardrobe || "signature clothing"}${loraTrigger}. Consistent facial likeness and build.`
      );
    }
  }

  // 2. Inyección del Set / Entorno
  if (loc) {
    parts.push(
      `Environment & Setting: inside ${loc.name} (${loc.description}), ${loc.timeOfDay} lighting mood, consistent interior architecture and props in background.`
    );
  }

  // 3. Inyección del Prop / Objeto Heroico
  if (prop) {
    parts.push(
      `Hero Prop: ${prop.name} (${prop.description}) is clearly visible and interactively used in the scene.`
    );
  }

  // 4. Cámara, Encuadre y Acción del Plano
  const cameraAngle = shot.camera || "Cinematic eye-level shot";
  const actionBeat = shot.action || shot.title || "Subject in dynamic pose";
  parts.push(`Camera Framing: ${cameraAngle}. Action: ${actionBeat}.`);

  // 5. Prompt de Imagen base si aporta detalles visuales adicionales
  if (shot.imagePrompt && shot.imagePrompt.trim().length > 10) {
    parts.push(`Scene Details: ${shot.imagePrompt}.`);
  }

  // 6. Calidad y Coherencia Cinematográfica
  parts.push("Cinematic film still, high narrative continuity, volumetric lighting, highly detailed 3D render, 8k resolution, masterpiece.");

  return parts.join(" ");
}
