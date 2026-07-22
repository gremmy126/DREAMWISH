import { randomBytes } from "node:crypto";

// 한국결제네트웍스(KPN) 등 국내 PG는 가맹점 주문번호(MxIssueNO)를 최대
// 32바이트로 제한한다(초과 시 9104 오류). PortOne paymentId가 그대로 이
// 값으로 전달되므로, 모든 결제 ID는 ASCII 영숫자 32자(=32바이트) 이내로
// 생성·정규화한다.
export const MAX_PROVIDER_PAYMENT_ID_LENGTH = 32;

// 접두사(최대 8자) + 임의 16진수로 32바이트 이내의 고유 결제 ID를 만든다.
export function createProviderPaymentId(prefix: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9]/gu, "").slice(0, 8);
  const randomLength = MAX_PROVIDER_PAYMENT_ID_LENGTH - safePrefix.length;
  const random = randomBytes(randomLength).toString("hex").slice(0, randomLength);
  return `${safePrefix}${random}`;
}

// 이미 만들어진 값을 PG 한도에 맞게 안전화(영숫자만, 32자 이내).
export function compactProviderPaymentId(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, "").slice(0, MAX_PROVIDER_PAYMENT_ID_LENGTH);
}

// PortOne/PG로 보내기 전 유효성 검사: 영숫자 + 32바이트 이내.
export function isValidProviderPaymentId(value: string): boolean {
  return (
    /^[A-Za-z0-9]+$/u.test(value) &&
    Buffer.byteLength(value, "utf8") <= MAX_PROVIDER_PAYMENT_ID_LENGTH
  );
}
