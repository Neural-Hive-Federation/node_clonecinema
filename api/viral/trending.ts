import fs from "fs";
import path from "path";
import { defaultScoutData } from "../_lib/scoutData";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Si se llama como POST para actualizar estado directamente en esta ruta
  if (req.method === "POST") {
    const { id, status } = req.body || {};
    if (id && status) {
      const clonedAt = status === "cloned" ? new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) : undefined;

      const found = defaultScoutData.winners.find((w: any) => w.id === id);
      if (found) {
        found.status = status;
        if (clonedAt) found.clonedAt = clonedAt;
        return res.status(200).json({ success: true, winner: found });
      }
      return res.status(200).json({ success: true, id, status });
    }
  }

  // GET: Obtener lista de videos ganadores y telemetría del Radar Scout
  try {
    const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      if (Array.isArray(parsed.winners) && parsed.winners.length > 0) {
        return res.status(200).json(parsed);
      }
    }
  } catch (e) {
    // Si no se puede leer el archivo en Vercel, usamos los datos embebidos oficiales
  }

  return res.status(200).json(defaultScoutData);
}
