import React, { useEffect, useState } from "react";
import { Check, Coins, Sparkles, X } from "lucide-react";
import type { CreditPackage } from "../types";
import { createCheckout, getPackages, ApiError } from "../lib/api";
import { useSession } from "../context/SessionContext";
import { Spinner } from "./ui";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function PaywallModal() {
  const { paywall, closePaywall, credits, config, session, notify, openAuth, refreshAccount } = useSession();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paywall.open) return;
    setError(null);
    getPackages()
      .then((data) => {
        setPackages(data.packages);
        setBillingEnabled(data.billingEnabled);
      })
      .catch((err: ApiError) => {
        setError(err.message);
        setBillingEnabled(false);
      });
  }, [paywall.open]);

  if (!paywall.open) return null;

  async function buy(pkg: CreditPackage) {
    if (!session) {
      openAuth();
      return;
    }
    setBusyId(pkg.id);
    setError(null);
    try {
      const checkout = await createCheckout(pkg.id);
      window.localStorage.setItem("clonecinema_pending_reference", checkout.reference);
      window.location.href = checkout.checkoutUrl;
    } catch (err: any) {
      setError(err?.message || "No se pudo iniciar el pago.");
      setBusyId(null);
      await refreshAccount();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm">
      <div className="panel relative w-full max-w-[720px] p-6">
        <button
          className="absolute right-4 top-4 rounded p-1 text-zinc-500 hover:text-zinc-200"
          onClick={closePaywall}
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-signal/15 text-signal">
            <Coins size={17} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-zinc-100">Créditos</h2>
            <p className="text-[11px] text-zinc-500">
              {paywall.reason || "1 crédito por keyframe · 5 por clip de video"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5">
          <span className="text-[11.5px] text-zinc-400">Saldo actual</span>
          <span className="font-display text-[15px] font-bold text-signal">
            {credits === null ? "—" : `${credits} créditos`}
          </span>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-[11.5px] text-red-300">
            {error}
          </p>
        )}

        {!session && config?.accountsEnabled && (
          <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[11.5px] text-zinc-400">
            Inicia sesión para comprar y asignar los créditos a tu cuenta.
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-xl border p-4 ${
                pkg.highlight
                  ? "border-signal/35 bg-signal/[0.04]"
                  : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-zinc-100">{pkg.name}</span>
                    {pkg.highlight && <Sparkles size={12} className="text-signal" />}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-zinc-500">
                    {pkg.description}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display text-[15px] font-bold text-zinc-100">
                    {COP.format(pkg.amountCop)}
                  </div>
                  <div className="text-[10px] text-zinc-600">
                    {pkg.type === "subscription" ? "al mes" : "pago único"}
                  </div>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-[11px] text-zinc-400">
                <li className="flex items-center gap-1.5">
                  <Check size={11} className="text-signal" /> {pkg.credits} créditos
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={11} className="text-signal" /> {pkg.videos}
                </li>
              </ul>

              <button
                className={`btn mt-3 w-full ${pkg.highlight ? "btn-primary" : "btn-ghost"}`}
                onClick={() => buy(pkg)}
                disabled={busyId !== null || billingEnabled === false}
                title={billingEnabled === false ? "Wompi no está configurado" : undefined}
              >
                {busyId === pkg.id ? <Spinner /> : null}
                Comprar con Wompi
              </button>
            </div>
          ))}

          {packages.length === 0 && (
            <div className="col-span-full py-6 text-center text-[12px] text-zinc-500">
              Cargando paquetes…
            </div>
          )}
        </div>

        {billingEnabled === false && (
          <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
            Pagos desactivados: configura <code>WOMPI_PUBLIC_KEY</code>,{" "}
            <code>WOMPI_INTEGRITY_SECRET</code> y <code>WOMPI_EVENTS_SECRET</code> y registra el
            webhook <code>/api/v1/webhooks/wompi</code> en el panel de Wompi.
          </p>
        )}

        <p className="mt-3 text-[10.5px] leading-relaxed text-zinc-600">
          Nequi, PSE, Bancolombia y tarjetas. Los créditos se acreditan automáticamente al
          confirmarse el pago.
        </p>
      </div>
    </div>
  );
}
