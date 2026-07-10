"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PAYMENT_STATUS_KEY } from "@/src/lib/payments/payment-state";

type VerificationState =
  | { status: "checking" }
  | { status: "paid"; checkoutId: string }
  | { status: "pending"; checkoutId: string; checkoutStatus: string }
  | { status: "error"; message: string };

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<PaymentSuccessShell state={{ status: "checking" }} />}>
      <PaymentSuccessClient />
    </Suspense>
  );
}

function PaymentSuccessClient() {
  const searchParams = useSearchParams();
  const checkoutId = useMemo(
    () => searchParams.get("checkout_id") || searchParams.get("checkoutId") || "",
    [searchParams]
  );
  const [state, setState] = useState<VerificationState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    async function verifyCheckout() {
      if (!checkoutId) {
        setState({ status: "error", message: "Missing checkout ID." });
        return;
      }

      try {
        const response = await fetch(`/api/payments/polar/checkout/${encodeURIComponent(checkoutId)}`, {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          checkout?: {
            id: string;
            paid: boolean;
            status: string;
          };
        };

        if (cancelled) return;

        if (!response.ok || !payload.ok || !payload.checkout) {
          setState({
            status: "error",
            message: payload.error || "Payment status could not be verified."
          });
          return;
        }

        if (payload.checkout.paid) {
          window.localStorage.setItem(PAYMENT_STATUS_KEY, "true");
          setState({ status: "paid", checkoutId: payload.checkout.id });
          return;
        }

        setState({
          status: "pending",
          checkoutId: payload.checkout.id,
          checkoutStatus: payload.checkout.status
        });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Payment status could not be verified." });
        }
      }
    }

    void verifyCheckout();

    return () => {
      cancelled = true;
    };
  }, [checkoutId]);

  return <PaymentSuccessShell state={state} />;
}

function PaymentSuccessShell({ state }: { state: VerificationState }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-xl rounded-app border border-app-border bg-white p-8 text-center shadow-soft">
        {state.status === "checking" ? (
          <StatusIcon tone="loading" />
        ) : state.status === "paid" ? (
          <StatusIcon tone="success" />
        ) : (
          <StatusIcon tone="warning" />
        )}

        <h1 className="mt-5 text-2xl font-semibold text-app-text">
          {state.status === "paid"
            ? "Payment verified"
            : state.status === "checking"
              ? "Verifying payment"
              : "Payment not verified"}
        </h1>

        <p className="mt-2 text-sm leading-6 text-app-muted">
          {state.status === "paid"
            ? "Your Polar checkout was verified on the server."
            : state.status === "pending"
              ? `Polar returned status: ${state.checkoutStatus}. Access will update after payment is confirmed.`
              : state.status === "checking"
                ? "Checking the checkout status with Polar before updating access."
                : state.message}
        </p>

        <Link
          href={state.status === "paid" ? "/" : "/pricing"}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-app bg-app-primary px-5 text-sm font-semibold text-white"
        >
          {state.status === "paid" ? "Go to chat" : "Back to pricing"}
        </Link>
      </section>
    </main>
  );
}

function StatusIcon({ tone }: { tone: "loading" | "success" | "warning" }) {
  const className =
    tone === "success"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "warning"
        ? "bg-amber-50 text-amber-600"
        : "bg-blue-50 text-blue-600";

  return (
    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] ${className}`}>
      {tone === "loading" ? (
        <Loader2 className="animate-spin" size={28} />
      ) : tone === "success" ? (
        <CheckCircle2 size={28} />
      ) : (
        <AlertTriangle size={28} />
      )}
    </div>
  );
}
