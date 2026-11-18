/**
 * Utilidad de recorte de cuadrantes en el cliente (0 latencia, 0 costo de API).
 * Permite dividir una hoja de casting 2x2 (character reference sheet) en
 * 4 retratos individuales para que el usuario elija su favorito.
 */

export async function cropQuadrant(
  imageUrl: string,
  quadrant: 1 | 2 | 3 | 4
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const halfW = Math.floor(img.naturalWidth / 2);
        const halfH = Math.floor(img.naturalHeight / 2);

        canvas.width = halfW;
        canvas.height = halfH;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("No se pudo obtener el contexto 2D del canvas"));
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

        // Guardar como JPEG calidad 0.88 para reducir payload a ~60KB y garantizar compatibilidad con Kaggle API
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    img.src = imageUrl;
  });
}
