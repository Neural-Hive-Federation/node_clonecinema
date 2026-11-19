/**
 * Utilidad de recorte de cuadrantes en el cliente (0 latencia, 0 costo de API).
 * Permite dividir una hoja de casting 2x2 (character reference sheet) en
 * 4 retratos individuales para que el usuario elija su favorito.
 */

async function loadImage(url: string): Promise<HTMLImageElement> {
  if (url.startsWith("data:")) {
    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error("Error al cargar data URL de imagen"));
      img.src = url;
    });
  }

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Error decodificando blob de imagen"));
      };
      img.src = objectUrl;
    });
  } catch {
    // Fallback estándar con crossOrigin
    const img = new Image();
    img.crossOrigin = "anonymous";
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error("Error al cargar imagen remota para recorte"));
      img.src = url;
    });
  }
}

export async function cropQuadrant(
  imageUrl: string,
  quadrant: 1 | 2 | 3 | 4
): Promise<string> {
  const img = await loadImage(imageUrl);

  const canvas = document.createElement("canvas");
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;

  if (!naturalW || !naturalH) {
    throw new Error("Dimensiones de imagen inválidas");
  }

  const halfW = Math.floor(naturalW / 2);
  const halfH = Math.floor(naturalH / 2);

  canvas.width = halfW;
  canvas.height = halfH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo obtener el contexto 2D del canvas");
  }

  // Definición de coordenadas según cuadrante
  // 1: Superior Izquierda | 2: Superior Derecha
  // 3: Inferior Izquierda | 4: Inferior Derecha
  let sx = 0;
  let sy = 0;

  if (quadrant === 2) {
    sx = halfW;
    sy = 0;
  } else if (quadrant === 3) {
    sx = 0;
    sy = halfH;
  } else if (quadrant === 4) {
    sx = halfW;
    sy = halfH;
  }

  // Dibuja el cuadrante recortado directamente en el canvas
  ctx.drawImage(img, sx, sy, halfW, halfH, 0, 0, halfW, halfH);

  // Exportar como JPEG de alta calidad
  return canvas.toDataURL("image/jpeg", 0.92);
}
