import type { Character, LocationRef, Project, PropItem, Shot } from "../types";

/**
 * Detecta si una descripción o nombre corresponde a un personaje no humano / antropomórfico
 * (ej: vegetales, alimentos, animales, objetos, criaturas, robots).
 */
export function isNonHumanCharacter(text: string): boolean {
  const normalized = text.toLowerCase();
  const nonHumanKeywords = [
    "cebolla", "patata", "papa", "vegetal", "fruta", "comida", "alimento",
    "antropomórfic", "antropomorf", "objeto", "robot", "criatura", "monstruo",
    "animal", "perro", "gato", "ratón", "oso", "conejo", "zorro", "lobo",
    "cartoon", "animad", "minion", "peluche", "juguete", "alien", "extraterrestre",
    "árbol", "planta", "flor", "hongo", "seta", "ajo", "tomate", "zanahoria",
    "hamburguesa", "pizza", "botella", "vaso", "taza", "lámpara", "reloj"
  ];
  return nonHumanKeywords.some((kw) => normalized.includes(kw));
}

/**
 * Sintetizador de Casting para Personajes:
 * Elimina la trampa semántica humana ("natural skin texture", "35mm human headshot")
 * cuando el personaje es un vegetal, objeto o criatura antropomórfica.
 */
export function synthesizeCharacterPrompt(char: Character, globalStyle?: string): string {
  const combinedDesc = `${char.name} ${char.description} ${char.wardrobe || ""}`;
  const isNonHuman = isNonHumanCharacter(combinedDesc);
  const loraTrigger = char.loraConfig?.triggerWord ? `, ${char.loraConfig.triggerWord}` : "";
  const wardrobeInfo = char.wardrobe ? `Wardrobe/Attire: ${char.wardrobe}.` : "";
  const styleAnchor = globalStyle ? `Art Style: ${globalStyle}.` : "Style: High-end 3D animated feature film (Pixar/DreamWorks aesthetic).";

  if (isNonHuman) {
    return `${styleAnchor} Stylized character design portrait of ${char.name}: ${char.description}. ${wardrobeInfo}${loraTrigger} Anthropomorphic living food/creature character, body and head made of organic stylized materials. Strictly non-human character, cartoon expressive eyes and animated mouth, stylized texture, NO human skin, NO realistic human flesh, NO realistic human face. Studio character turnaround sheet, vibrant cinematic lighting, volumetric soft shadows, 8k resolution, masterpiece 3D render.`;
  }

  return `Cinematic character portrait photo of ${char.name}: ${char.description}. ${wardrobeInfo}${loraTrigger} ${styleAnchor} Consistent facial anatomy, authentic costume details, sharp eyes, 8k resolution, cinematic studio lighting, dramatic rim light, shallow depth of field, high detail.`;
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
      parts.push(
        `Main Character: ${char.name} (${char.description}), wearing ${char.wardrobe || "signature attire"}${loraTrigger}. Strictly anthropomorphic cartoon creature, body made entirely of ${char.name}, no human skin, cartoon facial features with expressive eyes and mouth.`
      );
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
