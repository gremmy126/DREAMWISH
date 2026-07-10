"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { POLAR_CHECKOUT_SETTINGS } from "@/src/lib/payments/polar.config";

export function PricingPageClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useAppLanguage();

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || t("pricing.checkoutFailed"));
      }
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("pricing.checkoutFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-app-bg px-6 py-10">
      <section className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">
            {t("pricing.eyebrow")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-app-text">
            {t("pricing.pageTitle")}
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {t("pricing.subtitle")}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
          <article className="rounded-app border border-app-border bg-white p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-app-primary">
                  {POLAR_CHECKOUT_SETTINGS.planName}
                </p>
                <h2 className="mt-2 text-4xl font-semibold text-app-text">
                  ${POLAR_CHECKOUT_SETTINGS.amountUsd}
                </h2>
                <p className="mt-2 text-sm text-app-muted">
                  {t("pricing.planDescription")}
                </p>
              </div>
              <span className="rounded-full border border-app-border bg-app-bg px-3 py-1 text-xs font-semibold text-app-muted">
                Polar
              </span>
            </div>

            <div className="mt-6 grid gap-3 text-sm text-app-text">
              {[
                t("pricing.featureAi"),
                t("pricing.featureKnowledge"),
                t("pricing.featureAutomation"),
                t("pricing.featureApproval")
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={loading}
              className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-app bg-app-primary px-5 text-sm font-semibold text-white shadow-soft disabled:bg-slate-200"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {t("pricing.payWithPolar")}
            </button>
            {error ? (
              <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </article>

          <aside className="rounded-app border border-app-border bg-white p-5 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">
              {t("pricing.eyebrow")}
            </p>
            <h2 className="mt-2 text-base font-semibold text-app-text">
              {t("pricing.secureTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-app-muted">
              {t("pricing.secureDescription")}
            </p>
            <div className="mt-5 rounded-app border border-app-border bg-app-bg p-4">
              <p className="text-sm font-semibold text-app-text">
                {t("pricing.brandText")}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                {t("pricing.noLogo")}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
