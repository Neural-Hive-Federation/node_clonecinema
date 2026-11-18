import type { NextFunction, Request, Response } from "express";
import { config, missingFor } from "../lib/config";
import { debitCredits, refundCredits } from "../lib/credits";
import { resolveUser } from "../lib/supabase";
import "../types";

export type CreditAction = "image" | "video";

/** Exige sesión válida de Supabase. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!config.supabase.enabled) {
    return res.status(503).json({
      error: "Supabase no está configurado.",
      code: "SUPABASE_MISSING",
      missing: missingFor("supabase"),
    });
  }
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ error: "Inicia sesión para continuar.", code: "AUTH_REQUIRED" });
    }
    req.user = user;
    next();
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Error verificando la sesión." });
  }
}

/**
 * Verifica saldo y descuenta antes de ejecutar la tarea de IA.
 * - 401 si falta sesión.
 * - 402 Payment Required si no hay saldo.
 * - Sin Supabase, deja pasar sin cobrar solo si ALLOW_ANONYMOUS_GENERATION.
 */
export function checkCredits(action: CreditAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const cost = action === "image" ? config.credits.image : config.credits.video;

    try {
      if (!config.supabase.enabled) {
        if (!config.allowAnonymousGeneration) {
          return res.status(503).json({
            error: "El cobro de créditos requiere Supabase configurado.",
            code: "SUPABASE_MISSING",
            missing: missingFor("supabase"),
          });
        }
        req.billing = {
          charged: 0,
          balance: null,
          anonymous: true,
          refund: async () => {},
        };
        return next();
      }

      const user = await resolveUser(req);
      if (!user) {
        return res.status(401).json({
          error: "Inicia sesión para generar imágenes y videos.",
          code: "AUTH_REQUIRED",
        });
      }
      req.user = user;

      const debit = await debitCredits(user.id, cost);
      if (!debit.ok) {
        return res.status(402).json({
          error: `Te faltan créditos: esta acción cuesta ${cost} y tu saldo es ${debit.balance ?? 0}.`,
          code: "PAYMENT_REQUIRED",
          required: cost,
          balance: debit.balance ?? 0,
        });
      }

      let refunded = false;
      req.billing = {
        charged: cost,
        balance: debit.balance,
        anonymous: false,
        refund: async () => {
          if (refunded || cost <= 0) return;
          refunded = true;
          await refundCredits(user.id, cost);
        },
      };

      next();
    } catch (err: any) {
      console.error("[checkCredits]", err?.message);
      res.status(500).json({ error: err?.message || "No se pudo verificar el saldo." });
    }
  };
}
