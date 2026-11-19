export default function handler(_req: any, res: any) {
  res.status(200).json({
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
