"use client";

import { useEffect } from "react";
import { useConsent } from "@/components/consent/useConsent";

const ADSENSE_CLIENT = "ca-pub-5650931082151367";
const DEFAULT_ADSENSE_SLOT = "3983195777";

export function GuestAdSlot() {
  const { preferences } = useConsent();
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID?.trim() || DEFAULT_ADSENSE_SLOT;
  const canLoadAds = Boolean(preferences?.ads);

  useEffect(() => {
    if (!canLoadAds || !slotId) return;
    try {
      const adWindow = window as Window & { adsbygoogle?: Array<Record<string, never>> };
      (adWindow.adsbygoogle ||= []).push({});
    } catch {
      // Ad blockers and unfilled inventory must not interrupt the guest chat.
    }
  }, [canLoadAds, slotId]);

  if (!canLoadAds) return null;

  return (
    <>
      {slotId ? (
        <aside aria-label="광고" className="mx-auto w-full max-w-4xl px-4 pb-5 sm:px-6">
          <ins
            className="adsbygoogle block min-h-[90px] overflow-hidden rounded-2xl bg-slate-50"
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </aside>
      ) : null}
    </>
  );
}
