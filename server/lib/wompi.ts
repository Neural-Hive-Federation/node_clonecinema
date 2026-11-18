import { createHash } from "crypto";
import { config } from "./config";

export interface CreditPackage {
  id: string;
  name: string;
  description: string;
  amountCop: number;
  amountCents: number;
  credits: number;
  type: "one_time" | "subscription";
  /** Copia comercial: cuántos videos de 30 s (~24 créditos) rinde. */
  videos: string;
  highlight?: boolean;
}

function pkg(
  id: string,
  name: string,
  description: string,
  amountCop: number,
  credits: number,
  type: CreditPackage["type"],
  videos: string,
  highlight = false
): CreditPackage {
  return {
    id,
    name,
    description,
    amountCop,
    amountCents: amountCop * 100,
    credits,
    type,
    videos,
    highlight,
  };
}

/**
 * Un video de 30 s ≈ 4 keyframes (4) + 4 clips (20) = 24 créditos.
 * Los planes mensuales bajan el COP por crédito; el pack de 10 añade bono.
 */
export const PACKAGES: CreditPackage[] = [
  pkg("single", "Single Shot", "Un video de 30 s, pago único.", 10_000, 25, "one_time", "1 video"),
  pkg("pack5", "Pack 5 videos", "Lanzamiento de producto.", 40_000, 140, "one_time", "5 videos"),
  pkg("pack10", "Pack 10 videos", "Campaña completa, mejor precio por video.", 75_000, 280, "one_time", "~11 videos"),
  pkg(
    "micro",
    "Micro-Business",
    "200 créditos al mes para negocios locales.",
    60_000,
    200,
    "subscription",
    "~8 videos / mes"
  ),
  pkg(
    "pro",
    "Pro / Creador",
    "500 créditos al mes, prioridad de cola.",
    120_000,
    500,
    "subscription",
    "~20 videos / mes",
    true
  ),
];

export function findPackage(id: string): CreditPackage | undefined {
  return PACKAGES.find((p) => p.id === id);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Firma oficial de integridad: SHA256(reference + amountInCents + currency + secret). */
export function integritySignature(input: {
  reference: string;
  amountInCents: number;
  currency?: string;
  secret?: string;
}): string {
  const currency = input.currency || config.wompi.currency;
  const secret = input.secret ?? config.wompi.integritySecret;
  if (!secret) throw new Error("Falta WOMPI_INTEGRITY_SECRET.");
  return sha256Hex(`${input.reference}${input.amountInCents}${currency}${secret}`);
}

/** Referencia con usuario y paquete embebidos: CC-<uuid>-<paquete>-<nonce>. */
export function buildReference(userId: string, packageId: string): string {
  return `CC-${userId}-${packageId}-${Date.now().toString(36)}`;
}

export interface ParsedReference {
  userId: string;
  packageId: string;
  package: CreditPackage;
  nonce: string;
}

/** Referencia -> usuario + paquete. El webhook no necesita estado previo. */
export function parseReference(reference: string): ParsedReference | null {
  const match =
    /^CC-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-([a-z0-9_]+)-([A-Za-z0-9]+)$/i.exec(
      reference || ""
    );
  if (!match) return null;
  const found = findPackage(match[2]);
  if (!found) return null;
  return { userId: match[1], packageId: found.id, package: found, nonce: match[3] };
}

function resolvePath(source: any, dotted: string): unknown {
  return dotted.split(".").reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), source);
}

export interface WompiEvent {
  event?: string;
  data?: Record<string, any>;
  sent_at?: string;
  timestamp?: number;
  signature?: { checksum?: string; properties?: string[] };
}

/**
 * Checksum de Wompi: SHA256( valores de signature.properties + timestamp + eventsSecret ).
 * El orden de `properties` es el que envía Wompi y no debe reordenarse.
 */
export function eventChecksum(event: WompiEvent, secret?: string): string {
  const eventsSecret = secret ?? config.wompi.eventsSecret;
  if (!eventsSecret) throw new Error("Falta WOMPI_EVENTS_SECRET.");
  const properties = event.signature?.properties || [];
  const values = properties.map((prop) => {
    const value = resolvePath(event.data, prop);
    return value === undefined || value === null ? "" : String(value);
  });
  return sha256Hex(`${values.join("")}${event.timestamp ?? ""}${eventsSecret}`);
}

export function isChecksumValid(event: WompiEvent): boolean {
  const expected = event.signature?.checksum;
  if (!expected) return false;
  const computed = eventChecksum(event);
  // Comparación en tiempo constante sobre hexadecimales de igual longitud.
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function buildCheckoutUrl(input: {
  reference: string;
  amountInCents: number;
  redirectUrl: string;
  customerEmail?: string | null;
}): string {
  if (!config.wompi.publicKey) throw new Error("Falta WOMPI_PUBLIC_KEY.");
  const signature = integritySignature({
    reference: input.reference,
    amountInCents: input.amountInCents,
  });

  const params = new URLSearchParams({
    "public-key": config.wompi.publicKey,
    currency: config.wompi.currency,
    "amount-in-cents": String(input.amountInCents),
    reference: input.reference,
    "signature:integrity": signature,
    "redirect-url": input.redirectUrl,
  });
  if (input.customerEmail) params.set("customer-data:email", input.customerEmail);

  return `${config.wompi.baseUrl.replace(/\/$/, "")}/p/?${params.toString()}`;
}

/** Consulta el estado real de una transacción en Wompi (para la vuelta del checkout). */
export async function fetchWompiTransactions(reference: string): Promise<any[]> {
  if (!config.wompi.publicKey) throw new Error("Falta WOMPI_PUBLIC_KEY.");
  const res = await fetch(
    `${config.wompi.apiBaseUrl.replace(/\/$/, "")}/transactions?reference=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${config.wompi.publicKey}` } }
  );
  if (!res.ok) throw new Error(`Wompi respondió ${res.status}`);
  const body: any = await res.json();
  return Array.isArray(body?.data) ? body.data : [];
}
