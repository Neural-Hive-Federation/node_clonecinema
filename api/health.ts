export default function handler(_req: any, res: any) {
  res.status(200).json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
    hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    kaggle: Boolean(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY),
  });
}
