/**
 * Extrae el último fotograma de un video en memoria como imagen base64 (DataURL PNG)
 * para realizar Frame-Chaining continuo sin saltos.
 */
export function extractLastFrameFromVideo(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Tiempo de espera agotado al extraer fotograma del video."));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.src = "";
    };

    video.onloadedmetadata = () => {
      // Nos situamos en el último fotograma (últimos 0.08 segundos para asegurar frame válido)
      const targetTime = Math.max(0, (video.duration || 2.0) - 0.08);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 480;
        canvas.height = video.videoHeight || 832;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/png");
          cleanup();
          resolve(dataUrl);
        } else {
          cleanup();
          reject(new Error("No se pudo obtener el contexto 2D para capturar el frame."));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Error cargando video para extracción de fotograma."));
    };
  });
}
