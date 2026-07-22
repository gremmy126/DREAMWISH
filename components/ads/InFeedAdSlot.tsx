"use client";

import { useEffect } from "react";
import { useConsent } from "@/components/consent/useConsent";

const ADSENSE_CLIENT = "ca-pub-5650931082151367";
// AdSense 인피드(콘텐츠 피드형) 광고 단위. 슬롯/레이아웃 키는 AdSense에서
// 발급한 값이며, 슬롯은 환경변수로 덮어쓸 수 있다.
const DEFAULT_INFEED_SLOT = "6469730068";
const INFEED_LAYOUT_KEY = "-ef+6k-30-ac+ty";

export function InFeedAdSlot() {
  const { preferences } = useConsent();
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_INFEED_SLOT_ID?.trim() || DEFAULT_INFEED_SLOT;
  const canLoadAds = Boolean(preferences?.ads);

  useEffect(() => {
    if (!canLoadAds || !slotId) return;
    try {
      const adWindow = window as Window & { adsbygoogle?: Array<Record<string, never>> };
      (adWindow.adsbygoogle ||= []).push({});
    } catch {
      // 광고 차단기·미충족 인벤토리가 페이지를 방해하지 않도록 무시한다.
    }
  }, [canLoadAds, slotId]);

  // 동의(ads) 전에는 렌더링하지 않는다 — 사이트의 광고 정책과 동일한 패턴.
  if (!canLoadAds || !slotId) return null;

  return (
    <aside aria-label="광고" className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <ins
        className="adsbygoogle block overflow-hidden rounded-2xl bg-slate-50"
        style={{ display: "block" }}
        data-ad-format="fluid"
        data-ad-layout-key={INFEED_LAYOUT_KEY}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
      />
    </aside>
  );
}
