import fs from "fs";
import path from "path";
import { defaultScoutData } from "../../lib/scoutData";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id, status } = req.body || {};
  if (!id || !status) {
    return res.status(400).json({ error: "Faltan parámetros 'id' o 'status'" });
  }

  const clonedAt = status === "cloned" ? new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) : undefined;

  // Intentar persistir en disco si existe (entorno local de desarrollo)
  try {
    const dataFile = path.resolve(process.cwd(), "server/data/scout_winners.json");
    if (fs.existsSync(dataFile)) {
      const parsed = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      const found = parsed.winners.find((w: any) => w.id === id);
      if (found) {
        found.status = status;
        if (clonedAt) found.clonedAt = clonedAt;
        fs.writeFileSync(dataFile, JSON.stringify(parsed, null, 2), "utf-8");
        return res.status(200).json({ success: true, winner: found });
      }
    }
  } catch (e) {
    // ignorar error de I/O en Vercel
  }

  // Fallback en memoria
  const found = defaultScoutData.winners.find((w: any) => w.id === id);
  if (found) {
    found.status = status;
    if (clonedAt) found.clonedAt = clonedAt;
    return res.status(200).json({ success: true, winner: found });
  }

  return res.status(200).json({ success: true, id, status });
}
