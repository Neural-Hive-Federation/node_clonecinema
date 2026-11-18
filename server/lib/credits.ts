import { supabaseAdmin } from "./supabase";

export interface DebitResult {
  ok: boolean;
  balance: number | null;
}

/** Saldo actual. `null` si no hay base de datos configurada. */
export async function getBalance(userId: string): Promise<number | null> {
  const db = supabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el saldo: ${error.message}`);
  return data?.balance ?? 0;
}

/**
 * Descuenta créditos de forma atómica en Postgres.
 * Si el saldo no alcanza, devuelve ok=false sin tocar la cuenta.
 */
export async function debitCredits(userId: string, amount: number): Promise<DebitResult> {
  const db = supabaseAdmin();
  if (!db) return { ok: true, balance: null };
  if (amount <= 0) return { ok: true, balance: await getBalance(userId) };

  const { data, error } = await db.rpc("debit_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) throw new Error(`No se pudo descontar créditos: ${error.message}`);

  const balance = typeof data === "number" ? data : null;
  if (balance === null) {
    return { ok: false, balance: await getBalance(userId) };
  }
  return { ok: true, balance };
}

export async function refundCredits(userId: string, amount: number): Promise<number | null> {
  const db = supabaseAdmin();
  if (!db || amount <= 0) return null;

  const { data, error } = await db.rpc("refund_credits", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) {
    console.error("[credits] refund failed:", error.message);
    return null;
  }
  return typeof data === "number" ? data : null;
}

export interface PurchaseCreditResult {
  balance: number;
  credited: number;
  duplicate: boolean;
}

/** Acredita una compra aprobada. Idempotente por `reference`. */
export async function creditPurchase(input: {
  reference: string;
  userId: string;
  amountCents: number;
  credits: number;
  status: string;
  packageId?: string | null;
  wompiTransactionId?: string | null;
}): Promise<PurchaseCreditResult> {
  const db = supabaseAdmin();
  if (!db) throw new Error("Supabase no está configurado.");

  const { data, error } = await db.rpc("credit_purchase", {
    p_reference: input.reference,
    p_user_id: input.userId,
    p_amount_cents: input.amountCents,
    p_credits: input.credits,
    p_status: input.status,
    p_package_id: input.packageId ?? null,
    p_wompi_transaction_id: input.wompiTransactionId ?? null,
  });

  if (error) throw new Error(`No se pudo acreditar la compra: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    balance: Number(row?.balance ?? 0),
    credited: Number(row?.credited ?? 0),
    duplicate: Boolean(row?.duplicate),
  };
}
