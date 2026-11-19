import { getSupabase } from "./supabase";

/**
 * Sube una imagen proporcionada por el usuario (desde explorador de archivos o drag & drop).
 * Intenta subirla al bucket público 'keyframes' de Supabase Storage.
 * Si Supabase no está conectado o falla, devuelve la imagen como Data URL Base64 para
 * que el usuario nunca quede bloqueado y la imagen funcione de inmediato en el navegador.
 */
export async function uploadImageFile(file: File): Promise<string> {
  if (!file) {
    throw new Error("No se proporcionó ningún archivo de imagen.");
  }

  // Verificar que sea una imagen válida
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
  if (!isImage) {
    throw new Error("El archivo seleccionado no es una imagen válida (debe ser JPG, PNG, WEBP, etc.).");
  }

  try {
    const supabase = await getSupabase();
    if (supabase) {
      const cleanExt = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const ext = cleanExt || "png";
      const filename = `user_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("keyframes")
        .upload(filename, file, {
          contentType: file.type || "image/png",
          upsert: true,
        });

      if (!uploadError) {
        const { data } = supabase.storage.from("keyframes").getPublicUrl(filename);
        if (data?.publicUrl) {
          return data.publicUrl;
        }
      } else {
        console.warn("[Upload to Supabase Storage failed, using base64 fallback]:", uploadError);
      }
    }
  } catch (err) {
    console.warn("[Storage Error, falling back to base64]:", err);
  }

  // Fallback 100% garantizado: Convertir a Data URL Base64 local
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("No se pudo convertir la imagen a formato visual."));
      }
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo local."));
    reader.readAsDataURL(file);
  });
}
