export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL),
    kaggle: Boolean(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY),
  });
}
