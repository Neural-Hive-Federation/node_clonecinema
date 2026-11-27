export default function handler(req: any, res: any) {
  const action = req.query?.action || req.query?.endpoint;

  if (action === "health" || req.url?.includes("/health")) {
    return res.status(200).json({
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

  if (action === "account" || req.url?.includes("/account")) {
    return res.status(200).json({
      authenticated: false,
      credits: 999,
      billingEnabled: false,
      accountsEnabled: false,
      anonymousGeneration: true,
      costs: { image: 1, video: 5 },
    });
  }

  return res.status(200).json({
    supabase: {
      url: process.env.SUPABASE_URL || null,
      anonKey: process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || null,
    },
    billingEnabled: false,
    accountsEnabled: false,
    anonymousGeneration: true,
    providers: { email: true, google: false },
    credits: { image: 1, video: 5 },
    kaggleEnabled: Boolean(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY),
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
  });
}
