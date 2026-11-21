import type { Project, Shot, Character, LocationRef, PropItem } from "../types";
import { totalDuration, uid } from "./project";

export type AuditSeverity = "error" | "warning" | "info";

export interface AuditFix {
  label: string;
  run: (prev: Project) => Partial<Project>;
}

export interface AuditIssue {
  id: string;
  category: "character" | "location" | "prop" | "timing" | "storyboard";
  severity: AuditSeverity;
  title: string;
  description: string;
  detail?: string;
  shotNumber?: number;
  shotId?: string;
  fixes?: AuditFix[];
}

const COMMON_PROPS = [
  "espada", "pistola", "arma", "teléfono", "celular", "smartphone", "reloj", "libro",
  "auto", "carro", "vehículo", "coche", "moto", "joya", "anillo", "collar",
  "computadora", "laptop", "daga", "armadura", "guitarra", "maleta", "maletín",
  "escudo", "frasco", "botella", "cuchillo", "gafas", "lentes", "corona", "llave",
  "mapa", "máscara", "pocillo", "taza", "cámara", "micrófono", "holograma",
  "cadenas", "monedas", "diamante", "trofeo", "báculo", "cetro", "varita"
];

const COMMON_LOCATIONS = [
  "palacio", "mazmorra", "castillo", "laboratorio", "playa", "bosque", "oficina",
  "nave", "nave espacial", "cueva", "callejón", "terraza", "hangar", "desierto",
  "templo", "ruinas", "búnker", "estudio", "habitación", "azotea", "puente",
  "montaña", "selva", "cárcel", "celda", "bar", "café", "restaurante", "calle"
];

function textContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const cleanHaystack = haystack.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleanNeedle = needle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (cleanNeedle.length < 3) return false;
  return cleanHaystack.includes(cleanNeedle);
}

export function runContinuityAudit(project: Project): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const shots = project.shots || [];
  const characters = project.characters || [];
  const locations = project.locations || [];
  const props = project.props || [];

  if (shots.length === 0) {
    return [
      {
        id: "no_shots",
        category: "storyboard",
        severity: "error",
        title: "El proyecto no tiene planos en el Storyboard",
        description: "Agrega planos manualmente o pide al Director que genere el plan para poder producir el video.",
      },
    ];
  }

  // 1. Duración del video vs suma de planos
  const totalSecs = totalDuration(project);
  if (Math.abs(totalSecs - project.duration) >= 2) {
    issues.push({
      id: "duration_mismatch",
      category: "timing",
      severity: "warning",
      title: `Descuadre de duración: ${totalSecs}s vs ${project.duration}s`,
      description: `La suma de duración de tus ${shots.length} planos da ${totalSecs}s, pero el video está configurado a ${project.duration}s.`,
      fixes: [
        {
          label: `Ajustar duración meta a ${totalSecs}s`,
          run: () => ({ duration: totalSecs }),
        },
      ],
    });
  }

  // Concatenación de todo el texto de los planos para búsquedas globales
  const allShotsText = shots
    .map(
      (s) =>
        `${s.title} ${s.camera} ${s.action} ${s.dialogue || ""} ${s.voiceover || ""} ${s.onScreenText || ""} ${s.imagePrompt}`
    )
    .join(" ");

  // 2. Personajes huérfanos (en reparto pero nunca mencionados ni asignados)
  for (const c of characters) {
    const isMentioned =
      textContains(allShotsText, c.name) ||
      textContains(allShotsText, c.role) ||
      shots.some((s) => s.characterId === c.id);
    if (!isMentioned) {
      issues.push({
        id: `orphan_chr_${c.id}`,
        category: "character",
        severity: "warning",
        title: `Personaje huérfano: «${c.name}»`,
        description: `«${c.name}» (${c.role}) está definido en el reparto pero no aparece en ninguna de las ${shots.length} tomas.`,
        detail: "Generar este personaje consumirá créditos sin que se vea en el video final.",
        fixes: [
          {
            label: `Asignar «${c.name}» al Plano 1`,
            run: (prev) => ({
              shots: prev.shots.map((s, idx) =>
                idx === 0
                  ? {
                      ...s,
                      action: `${s.action ? s.action + ". " : ""}En cuadro: ${c.name}.`,
                      imagePrompt: `${s.imagePrompt}, featuring ${c.name}`,
                    }
                  : s
              ),
            }),
          },
          {
            label: `Quitar «${c.name}» del reparto`,
            run: (prev) => ({
              characters: prev.characters.filter((x) => x.id !== c.id),
            }),
          },
        ],
      });
    }
  }

  // 3. Sets / Localizaciones huérfanas
  for (const l of locations) {
    const isMentioned = textContains(allShotsText, l.name);
    if (!isMentioned) {
      issues.push({
        id: `orphan_loc_${l.id}`,
        category: "location",
        severity: "info",
        title: `Set sin planos asignados: «${l.name}»`,
        description: `El set «${l.name}» (${l.timeOfDay}) no está vinculado a ningún plano del storyboard.`,
        fixes: [
          {
            label: `Vincular set al Plano 1`,
            run: (prev) => ({
              shots: prev.shots.map((s, idx) =>
                idx === 0
                  ? {
                      ...s,
                      camera: `${s.camera ? s.camera + " en " : ""}${l.name}`,
                      imagePrompt: `${s.imagePrompt}, environment: ${l.name}`,
                    }
                  : s
              ),
            }),
          },
          {
            label: `Quitar «${l.name}» de sets`,
            run: (prev) => ({
              locations: prev.locations.filter((x) => x.id !== l.id),
            }),
          },
        ],
      });
    }
  }

  // 4. Props huérfanos
  for (const p of props) {
    const isMentioned = textContains(allShotsText, p.name);
    if (!isMentioned) {
      issues.push({
        id: `orphan_prop_${p.id}`,
        category: "prop",
        severity: "info",
        title: `Prop no utilizado: «${p.name}»`,
        description: `El objeto «${p.name}» está creado pero no se usa en las acciones del storyboard.`,
        fixes: [
          {
            label: `Asignar «${p.name}» al Plano 1`,
            run: (prev) => ({
              shots: prev.shots.map((s, idx) =>
                idx === 0
                  ? {
                      ...s,
                      action: `${s.action ? s.action + ". " : ""}Usa ${p.name}.`,
                      imagePrompt: `${s.imagePrompt}, holding ${p.name}`,
                    }
                  : s
              ),
            }),
          },
          {
            label: `Quitar «${p.name}» de props`,
            run: (prev) => ({
              props: prev.props.filter((x) => x.id !== p.id),
            }),
          },
        ],
      });
    }
  }

  // 5. Entidades mencionadas en los planos que no están registradas en Reparto/Sets
  // Revisamos plano por plano
  const registeredPropNames = props.map((p) => p.name.toLowerCase());
  const registeredLocNames = locations.map((l) => l.name.toLowerCase());

  for (const shot of shots) {
    const shotText = `${shot.action} ${shot.camera} ${shot.imagePrompt}`.toLowerCase();

    // Detección de props comunes mencionados pero no dados de alta
    for (const propName of COMMON_PROPS) {
      if (
        shotText.includes(propName) &&
        !registeredPropNames.some((r) => r.includes(propName) || propName.includes(r))
      ) {
        const capitalProp = propName.charAt(0).toUpperCase() + propName.slice(1);
        issues.push({
          id: `unregistered_prop_${shot.id}_${propName}`,
          category: "prop",
          severity: "warning",
          shotNumber: shot.number,
          shotId: shot.id,
          title: `Objeto «${capitalProp}» en Plano ${shot.number} no registrado`,
          description: `El Plano ${shot.number} menciona «${propName}», pero no está registrado como objeto héroe en Reparto & Sets.`,
          detail: "Sin una referencia visual bloqueada, la IA creará un objeto diferente en cada ángulo.",
          fixes: [
            {
              label: `+ Dar de alta «${capitalProp}» en Props`,
              run: (prev) => ({
                props: [
                  ...prev.props,
                  {
                    id: uid("prp"),
                    name: capitalProp,
                    category: "Objeto",
                    description: `Objeto clave utilizado en Plano ${shot.number}.`,
                    color: "#f472b6",
                  },
                ],
              }),
            },
          ],
        });
        break; // Max 1 prop detectado por plano para no saturar
      }
    }

    // Detección de sets comunes mencionados pero no dados de alta
    for (const locName of COMMON_LOCATIONS) {
      if (
        shotText.includes(locName) &&
        !registeredLocNames.some((r) => r.includes(locName) || locName.includes(r))
      ) {
        const capitalLoc = locName.charAt(0).toUpperCase() + locName.slice(1);
        issues.push({
          id: `unregistered_loc_${shot.id}_${locName}`,
          category: "location",
          severity: "warning",
          shotNumber: shot.number,
          shotId: shot.id,
          title: `Localización «${capitalLoc}» en Plano ${shot.number} no registrada`,
          description: `El Plano ${shot.number} se desarrolla en «${locName}», pero no existe como set definido.`,
          detail: "Definir el set garantiza iluminación y arquitectura coherentes.",
          fixes: [
            {
              label: `+ Dar de alta set «${capitalLoc}»`,
              run: (prev) => ({
                locations: [
                  ...prev.locations,
                  {
                    id: uid("loc"),
                    name: capitalLoc,
                    description: `Entorno de filmación para el Plano ${shot.number}.`,
                    timeOfDay: "Día / Estudio",
                    color: "#38bdf8",
                  },
                ],
              }),
            },
          ],
        });
        break; // Max 1 set detectado por plano
      }
    }

    // 6. Planos sin keyframe generado
    if (!shot.imageUrl) {
      issues.push({
        id: `missing_keyframe_${shot.id}`,
        category: "storyboard",
        severity: "info",
        shotNumber: shot.number,
        shotId: shot.id,
        title: `Plano ${shot.number} pendiente de keyframe`,
        description: `El Plano ${shot.number} aún no tiene imagen base generada antes del render final.`,
      });
    }

    // 7. Chequeo de Encuadre de Cámara vs Prompt (Evitar primeros planos cerrados no deseados)
    const camLower = shot.camera.toLowerCase();
    const pLower = shot.imagePrompt.toLowerCase();
    const isMediumShot = /medio|mcu|general|wide|entero/i.test(camLower);
    const isPortraitPrompt = /portrait|close-up|headshot/i.test(pLower);

    if (isMediumShot && isPortraitPrompt) {
      issues.push({
        id: `framing_mismatch_${shot.id}`,
        category: "storyboard",
        severity: "warning",
        shotNumber: shot.number,
        shotId: shot.id,
        title: `Encuadre incongruente en Plano ${shot.number}`,
        description: `La cámara pide «${shot.camera.split(",")[0]}» pero el prompt dice «portrait» (primer plano cerrado), lo que recorta el escenario y oculta los props.`,
        fixes: [
          {
            label: `Ajustar encuadre a «medium shot (MCU)» en Plano ${shot.number}`,
            run: (prev) => ({
              shots: prev.shots.map((s) => {
                if (s.id !== shot.id) return s;
                const fixedPrompt = s.imagePrompt
                  .replace(/cinematic portrait/gi, "cinematic medium shot (MCU)")
                  .replace(/portrait/gi, "medium shot (MCU)");
                return { ...s, imagePrompt: fixedPrompt };
              }),
            }),
          },
        ],
      });
    }

    // 8. Chequeo de Identidad y Género en los Prompts de Plano (Evitar cambios de hombre a mujer)
    if (characters.length > 0) {
      const mainChar = characters[0];
      const hasCharMention = textContains(pLower, mainChar.name);
      const isGenericAnchor = /anchor|presenter|avatar|host|reporter|protagonist|person|figure/i.test(pLower);
      const hasGenderKeyword = /male|man|handsome|guy|boy|female|woman|lady|girl/i.test(pLower);

      if (isGenericAnchor && (!hasCharMention || !hasGenderKeyword)) {
        issues.push({
          id: `gender_identity_gap_${shot.id}`,
          category: "character",
          severity: "warning",
          shotNumber: shot.number,
          shotId: shot.id,
          title: `Identidad y Género no fijados en Plano ${shot.number}`,
          description: `El prompt usa términos genéricos («presenter/anchor») sin fijar el género masculino ni las facciones de «${mainChar.name}». Esto hace que la IA genere mujeres o rostros inconsistentes.`,
          fixes: [
            {
              label: `Sincronizar «${mainChar.name}» (Hombre, 28 años) en Plano ${shot.number}`,
              run: (prev) => ({
                shots: prev.shots.map((s) => {
                  if (s.id !== shot.id) return s;
                  let newPrompt = s.imagePrompt;
                  if (/futuristic news anchor|digital avatar presenter|news anchor|presenter/i.test(newPrompt)) {
                    newPrompt = newPrompt.replace(
                      /futuristic news anchor|digital avatar presenter|news anchor|presenter/gi,
                      `handsome 28-year-old male presenter (${mainChar.name}, masculine facial features, dark wavy hair, light beard stubble)`
                    );
                  } else {
                    newPrompt = `${newPrompt}, featuring ${mainChar.name} (handsome 28-year-old male presenter, masculine facial features, dark wavy hair, light beard stubble)`;
                  }
                  return { ...s, imagePrompt: newPrompt };
                }),
              }),
            },
          ],
        });
      }
    }
  }

  // 9. Props y Sets en uso que no tienen imagen generada
  for (const p of props) {
    if (!p.imageUrl && textContains(allShotsText, p.name)) {
      issues.push({
        id: `unrendered_prop_${p.id}`,
        category: "prop",
        severity: "warning",
        title: `Objeto «${p.name}» sin imagen generada`,
        description: `El objeto «${p.name}» se utiliza en el guion pero aún no tiene imagen generada en Reparto & Sets. Al rodar los planos, la IA no tendrá referencia visual.`,
        detail: "Ve a la pestaña 'Reparto & sets' y pulsa 'Generar imagen de prop'.",
      });
    }
  }

  // 10. Props registrados pero no vinculados al plano correspondiente
  for (const shot of shots) {
    const sText = `${shot.title} ${shot.camera} ${shot.action} ${shot.dialogue || ""} ${shot.voiceover || ""} ${shot.imagePrompt}`.toLowerCase();
    for (const p of props) {
      const pLower = p.name.toLowerCase();
      const isPropMentioned = sText.includes(pLower) || (pLower.includes("mapa") && (sText.includes("mapa") || sText.includes("map")));
      if (isPropMentioned && shot.propId !== p.id) {
        issues.push({
          id: `unlinked_prop_${shot.id}_${p.id}`,
          category: "prop",
          severity: "warning",
          shotNumber: shot.number,
          shotId: shot.id,
          title: `Objeto «${p.name}» no vinculado en Plano ${shot.number}`,
          description: `El Plano ${shot.number} menciona «${p.name}», pero la referencia de prop activa en este plano no está enlazada.`,
          detail: `Al vincularlo, Playground v2.5 usará la imagen de «${p.name}» como referencia visual condicionada.`,
          fixes: [
            {
              label: `Vincular prop «${p.name}» al Plano ${shot.number}`,
              run: (prev) => ({
                shots: prev.shots.map((s) => (s.id === shot.id ? { ...s, propId: p.id } : s)),
              }),
            },
          ],
        });
      }
    }
  }

  // 11. Coherencia Temporal: Duración de locución vs duración de plano
  for (const shot of shots) {
    const textLine = (shot.voiceover || shot.dialogue || "").trim();
    if (textLine) {
      const words = textLine.split(/\s+/).filter(Boolean).length;
      const estimatedSec = Math.max(1.5, Math.round((words / 2.7) * 10) / 10);
      const shotSec = Number(shot.seconds) || 3;
      if (estimatedSec > shotSec + 0.6) {
        const recommendedSec = Math.ceil(estimatedSec);
        issues.push({
          id: `audio_duration_overflow_${shot.id}`,
          category: "storyboard",
          severity: "warning",
          shotNumber: shot.number,
          shotId: shot.id,
          title: `Locución excede duración en Plano ${shot.number}`,
          description: `El texto («${textLine.slice(0, 45)}…») toma ~${estimatedSec}s en pronunciarse, pero el plano dura solo ${shotSec}s. En el render final, el audio se cortará.`,
          detail: `Ampliar el plano a ${recommendedSec}s permite que la frase se escuche con cadencia y dicción completas.`,
          fixes: [
            {
              label: `Ampliar Plano ${shot.number} a ${recommendedSec}s`,
              run: (prev) => ({
                shots: prev.shots.map((s) => (s.id === shot.id ? { ...s, seconds: recommendedSec } : s)),
                duration: prev.duration + (recommendedSec - shotSec),
              }),
            },
          ],
        });
      }
    }
  }

  return issues;
}
