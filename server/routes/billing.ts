import { Router } from "express";
import type { Request, Response } from "express";
import { config, missingFor } from "../lib/config";
import { creditPurchase, getBalance } from "../lib/credits";
import {
  PACKAGES,
  buildCheckoutUrl,
  buildReference,
  fetchWompiTransactions,
  findPackage,
  isChecksumValid,
  parseReference,
  type WompiEvent,
} from "../lib/wompi";
import { requireAuth } from "../middleware/checkCredits";
import "../types";

export const billingRouter = Router();

billingRouter.get("/packages", (_req, res) => {
  res.json({
    packages: PACKAGES,
    currency: config.wompi.currency,
    billingEnabled: config.wompi.enabled && config.supabase.enabled,
  });
});

/** Genera la URL de checkout de Wompi con la firma de integridad. */
billingRouter.post("/checkout", requireAuth, async (req, res) => {
  if (!config.wompi.enabled) {
    return res.status(503).json({
      error: "Wompi no está configurado.",
      code: "WOMPI_MISSING",
      missing: missingFor("wompi"),
    });
  }

  const pkg = findPackage(String(req.body?.packageId || ""));
  if (!pkg) {
    return res.status(400).json({ error: "Paquete desconocido.", packages: PACKAGES.map((p) => p.id) });
  }

  const reference = buildReference(req.user!.id, pkg.id);
  const redirectUrl = `${config.appUrl.replace(/\/$/, "")}/?ref=${encodeURIComponent(reference)}`;

  try {
    const checkoutUrl = buildCheckoutUrl({
      reference,
      amountInCents: pkg.amountCents,
      redirectUrl,
      customerEmail: req.user!.email,
    });
    return res.json({
      success: true,
      checkoutUrl,
      reference,
      package: pkg,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "No se pudo generar el checkout." });
  }
});

/**
 * Vuelta del checkout: confirma contra Wompi y acredita si el pago fue aprobado.
 * Redundante con el webhook a propósito (el webhook puede llegar después).
 */
billingRouter.get("/status", requireAuth, async (req, res) => {
  const reference = String(req.query.reference || "");
  const parsed = parseReference(reference);
  if (!parsed) return res.status(400).json({ error: "Referencia inválida." });
  if (parsed.userId !== req.user!.id) return res.status(403).json({ error: "Sin acceso a esta compra." });

  try {
    const transactions = await fetchWompiTransactions(reference);
    const approved = transactions.find((t) => String(t?.status).toUpperCase() === "APPROVED");

    if (approved) {
      const result = await creditPurchase({
        reference,
        userId: parsed.userId,
        amountCents: Number(approved.amount_in_cents) || parsed.package.amountCents,
        credits: parsed.package.credits,
        status: "APPROVED",
        packageId: parsed.package.id,
        wompiTransactionId: approved.id ? String(approved.id) : null,
      });
      return res.json({
        status: "APPROVED",
        credited: result.credited,
        balance: result.balance,
        package: parsed.package,
      });
    }

    const pending = transactions.find((t) => String(t?.status).toUpperCase() === "PENDING");
    return res.json({
      status: pending ? "PENDING" : "NOT_FOUND",
      balance: await getBalance(parsed.userId),
      package: parsed.package,
    });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || "No se pudo consultar Wompi." });
  }
});

function extractTransaction(event: WompiEvent) {
  const tx = event?.data?.transaction;
  return tx && typeof tx === "object" ? tx : null;
}

/**
 * Webhook de Wompi.
 * Valida el checksum del evento y, solo con transaction.updated + APPROVED,
 * acredita los créditos del paquete indicado en la referencia.
 */
export async function wompiWebhook(req: Request, res: Response) {
  if (!config.wompi.enabled) {
    return res.status(503).json({ error: "Wompi no está configurado.", missing: missingFor("wompi") });
  }

  const event = req.body as WompiEvent;

  try {
    if (!isChecksumValid(event)) {
      console.warn("[wompi] checksum inválido; evento rechazado.");
      return res.status(401).json({ error: "Firma del evento inválida." });
    }
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || "Evento inválido." });
  }

  if (event.event !== "transaction.updated") {
    return res.status(200).json({ received: true, ignored: true });
  }

  const tx = extractTransaction(event);
  if (!tx) return res.status(200).json({ received: true, ignored: true });

  const reference = String(tx.reference || "");
  const parsed = parseReference(reference);
  if (!parsed) {
    console.warn("[wompi] referencia no reconocida:", reference);
    return res.status(200).json({ received: true, ignored: true });
  }

  const status = String(tx.status || "").toUpperCase();
  if (status !== "APPROVED") {
    return res.status(200).json({ received: true, status });
  }

  const amountCents = Number(tx.amount_in_cents) || 0;
  if (amountCents && amountCents !== parsed.package.amountCents) {
    console.error("[wompi] monto no coincide con el paquete:", { reference, amountCents });
    return res.status(400).json({ error: "El monto no coincide con el paquete." });
  }

  try {
    const result = await creditPurchase({
      reference,
      userId: parsed.userId,
      amountCents: amountCents || parsed.package.amountCents,
      credits: parsed.package.credits,
      status: "APPROVED",
      packageId: parsed.package.id,
      wompiTransactionId: tx.id ? String(tx.id) : null,
    });

    console.log(
      `[wompi] ${reference}: ${result.duplicate ? "ya procesado" : `+${result.credited} créditos`} (saldo ${result.balance})`
    );
    return res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    console.error("[wompi] no se pudo acreditar:", err?.message);
    // 500 para que Wompi reintente el evento.
    return res.status(500).json({ error: err?.message || "No se pudo acreditar la compra." });
  }
}
