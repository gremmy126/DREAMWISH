export const POLICY_EFFECTIVE_DATE = "2026년 7월 17일";
export const POLICY_LAST_UPDATED = "2026년 7월 17일";

export const OPERATOR_INFO = Object.freeze({
  businessName: "드림위시",
  representative: "김동현",
  businessRegistrationNumber: "147-07-03187",
  mailOrderRegistrationNumber: "제 2026-부산사상구-0185",
  address: "부산광역시 사상구 덕상로 8-37, 202동 2504호",
  phone: "051-916-1222",
  email: "adveryhyeon@gmail.com"
});

export const POLICY_LINKS = [
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/cookies", label: "쿠키 정책" },
  { href: "/terms", label: "이용약관" },
  { href: "/refunds", label: "환불 및 구독 해지" }
] as const;
