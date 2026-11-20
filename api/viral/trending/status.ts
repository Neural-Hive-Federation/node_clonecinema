export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { id, status } = req.body || {};
  if (!id || !status) {
    return res.status(400).json({ error: "Faltan parámetros 'id' o 'status'" });
  }

  return res.status(200).json({
    success: true,
    winner: {
      id,
      status,
      clonedAt: status === "cloned" ? new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }) : undefined
    }
  });
}
