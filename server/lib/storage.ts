import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { config } from "./config";
import { supabaseAdmin } from "./supabase";

export type AssetKind = "image" | "video";

const BUCKET: Record<AssetKind, string> = { image: "keyframes", video: "videos" };
const EXT: Record<AssetKind, string> = { image: "png", video: "mp4" };

/**
 * Sube el artefacto a Supabase Storage y devuelve su URL pública.
 * Sin Supabase configurado lo escribe en `data/generated` y sirve `/media/...`,
 * para que el estudio siga siendo recorrible en local.
 */
export async function storeAsset(input: {
  userId: string | null;
  jobId: string;
  kind: AssetKind;
  data: Buffer;
  contentType: string;
}): Promise<string> {
  const db = supabaseAdmin();
  const ext = EXT[input.kind];

  if (db) {
    const bucket = BUCKET[input.kind];
    const key = `${input.userId || "anon"}/${input.jobId}.${ext}`;
    const { error } = await db.storage.from(bucket).upload(key, input.data, {
      contentType: input.contentType,
      upsert: true,
    });
    if (error) throw new Error(`Storage (${bucket}): ${error.message}`);

    const { data } = db.storage.from(bucket).getPublicUrl(key);
    return data.publicUrl;
  }

  const dir = path.join(config.mediaDir, "generated");
  await fs.mkdir(dir, { recursive: true });
  const file = `${input.jobId}.${ext}`;
  await fs.writeFile(path.join(dir, file), input.data);
  return `/media/generated/${file}`;
}

export async function compressImageBuffer(
  buffer: Buffer,
  maxDim = 768,
  quality = 82
): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const compressed = await sharp(buffer)
      .resize({
        width: maxDim,
        height: maxDim,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();
    return { buffer: compressed, mime: "image/jpeg" };
  } catch (err) {
    return { buffer, mime: "image/jpeg" };
  }
}

/** Convierte una referencia (data URL, /media/... o http) en base64 para el kernel, comprimiendo para no superar el límite de 1MB de Kaggle. */
export async function readAssetAsBase64(
  url: string,
  compress = true
): Promise<{ base64: string; mime: string } | null> {
  if (!url) return null;

  let buffer: Buffer | null = null;
  let mime = "image/png";

  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
    if (!match) return null;
    mime = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else if (url.startsWith("/media/")) {
    const relative = url.replace("/media/", "");
    const file = path.join(config.mediaDir, relative);
    try {
      buffer = await fs.readFile(file);
      mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
    } catch {
      return null;
    }
  } else if (/^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get("content-type") || "image/png";
    } catch {
      return null;
    }
  }

  if (!buffer) return null;

  if (compress) {
    const optimized = await compressImageBuffer(buffer);
    return { mime: optimized.mime, base64: optimized.buffer.toString("base64") };
  }

  return { mime, base64: buffer.toString("base64") };
}
