import { Router } from "express";
import { config, publicConfig } from "../lib/config";
import { getBalance } from "../lib/credits";
import { resolveUser, supabaseAdmin } from "../lib/supabase";
import { requireAuth } from "../middleware/checkCredits";
import "../types";

export const accountRouter = Router();

/** Configuración pública para el frontend (la anon key puede vivir en el navegador). */
accountRouter.get("/config", (_req, res) => {
  res.json(publicConfig());
});

accountRouter.get("/account/me", async (req, res) => {
  if (!config.supabase.enabled) {
    return res.json({
      authenticated: false,
      credits: null,
      billingEnabled: false,
      accountsEnabled: false,
      anonymousGeneration: config.allowAnonymousGeneration,
      costs: config.credits,
    });
  }

  let user;
  try {
    user = await resolveUser(req);
  } catch {
    return res.status(401).json({ error: "Sesión inválida.", code: "AUTH_REQUIRED" });
  }
  if (!user) return res.status(401).json({ error: "Sin sesión.", code: "AUTH_REQUIRED" });

  const db = supabaseAdmin();
  const [{ data: profile, error: profileError }, balance] = await Promise.all([
    db!.from("profiles").select("full_name, avatar_url, plan").eq("id", user.id).maybeSingle(),
    getBalance(user.id),
  ]);
  if (profileError) console.warn("[account] perfil:", profileError.message);

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name || user.fullName,
      avatarUrl: profile?.avatar_url || user.avatarUrl,
      plan: profile?.plan || "free",
    },
    credits: balance ?? 0,
    billingEnabled: config.wompi.enabled,
    accountsEnabled: true,
    anonymousGeneration: false,
    costs: config.credits,
  });
});

accountRouter.get("/account/transactions", requireAuth, async (req, res) => {
  const db = supabaseAdmin();
  if (!db) return res.status(503).json({ error: "Supabase no está configurado." });

  const { data, error } = await db
    .from("transactions")
    .select("reference, amount_cents, currency, credits, status, package_id, created_at")
    .eq("user_id", req.user!.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ transactions: data ?? [] });
});
