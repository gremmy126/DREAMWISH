"use client";

import Script from "next/script";
import { useEffect } from "react";
import { useConsent } from "@/components/consent/useConsent";

const ADSENSE_CLIENT = "ca-pub-5650931082151367";

export function GuestAdSlot() {
  const { preferences } = useConsent();
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID?.trim();
  const canShowAd = Boolean(preferences?.ads && slotId);

  useEffect(() => {
    if (!canShowAd) return;
    try {
      const adWindow = window as Window & { adsbygoogle?: Array<Record<string, never>> };
      (adWindow.adsbygoogle ||= []).push({});
    } catch {
      // Ad blockers and unfilled inventory must not interrupt the guest chat.
    }
  }, [canShowAd]);

  if (!canShowAd || !slotId) return null;

  return (
    <aside aria-label="광고" className="mx-auto w-full max-w-4xl px-4 pb-5 sm:px-6">
      <Script
        id="guest-adsense-loader"
        async
        strategy="afterInteractive"
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      />
      <ins
        className="adsbygoogle block min-h-[90px] overflow-hidden rounded-2xl bg-slate-50"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
