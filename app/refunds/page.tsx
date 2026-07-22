import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout, PolicySection } from "@/components/legal/PolicyLayout";
import { OPERATOR_INFO } from "@/src/lib/legal/policy";
import { SITE_NAME } from "@/src/lib/site/metadata";

const description = "DREAMWISH 월간 구독의 해지 시점, 임의 환불 제한, 오류·오결제 처리 및 법정 권리를 안내합니다.";

export const metadata: Metadata = {
  title: "환불 및 구독 해지 정책",
  description,
  alternates: { canonical: "/refunds" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/refunds",
    siteName: SITE_NAME,
    title: "환불 및 구독 해지 정책 | DREAMWISH",
    description
  },
  twitter: { card: "summary", title: "환불 및 구독 해지 정책 | DREAMWISH", description }
};

export default function RefundsPage() {
  return (
    <PolicyLayout title="환불 및 구독 해지 정책" description={description}>
      <PolicySection id="service" title="1. 유료 서비스 제공 개시">
        <p>
          DREAMWISH는 무료 플랜이나 무료 체험 없이 월간 구독으로 제공되는 디지털 서비스입니다. 결제가 완료되면
          AI, AI Agent 생성 기능(웹사이트·앱·프로그램·이미지), 메모리, 파일, CRM·ERP, 외부 연동 및 자동화 등
          유료 기능의 이용 권한이 즉시 활성화됩니다.
        </p>
      </PolicySection>

      <PolicySection id="voluntary-refunds" title="2. 임의 환불 정책">
        <p>
          단순 변심 또는 미사용을 이유로 회사가 별도로 제공하는 임의 환불은 원칙적으로 제공하지 않습니다.
          결제 후 서비스를 사용하지 않았거나 남은 결제 기간이 있다는 사실만으로 현재 결제가 자동 환불되지는
          않습니다. 이 원칙은 아래의 회사 귀책 사유와 관계 법령상 권리를 제한하지 않습니다.
        </p>
        <p>
          AI Agent 생성물은 요청 즉시 생성·제공이 완료되는 디지털 콘텐츠입니다. 생성 결과가 기대와 다르다는
          사정은 원칙적으로 환불 사유가 아니며, 수정 요청 기능으로 결과를 다시 생성할 수 있습니다. 다만 회사의
          중대한 오류로 생성 기능 자체를 이용할 수 없었던 경우는 아래 4항의 환불 검토 대상입니다.
        </p>
      </PolicySection>

      <PolicySection id="subscription-cancellation" title="3. 구독 해지">
        <ul>
          <li>회원은 DREAMWISH 설정의 “구독 해지”에서 언제든 다음 자동 결제를 중단할 수 있습니다.</li>
          <li>Polar 구독은 본인 확인이 적용된 고객 포털에서, PortOne·KPN·NHN KCP 국내 구독은 DREAMWISH 설정에서 처리됩니다.</li>
          <li>일반적인 해지는 현재 결제 기간 종료일에 적용되고, 종료 전까지 유료 기능을 이용할 수 있습니다.</li>
          <li>해지 예약이 완료되면 다음 결제는 생성되지 않으며, 공급자가 지원하는 허용 기간에는 해지 예약을 취소할 수 있습니다.</li>
          <li>구독 해지는 앞으로의 갱신을 중단하는 절차이며 이미 완료된 결제의 환불을 의미하지 않습니다.</li>
        </ul>
      </PolicySection>

      <PolicySection id="company-fault" title="4. 플랫폼 오류 등 환불 검토 사유">
        <p>다음 사유가 확인되면 회사는 장애 범위, 이용 기간과 관계 법령에 따라 전액 또는 일부 환불을 검토합니다.</p>
        <ul>
          <li>회사의 중대한 플랫폼 오류로 핵심 유료 기능을 실질적으로 이용할 수 없었던 경우</li>
          <li>회사의 책임으로 결제한 서비스를 제공하지 않았거나 계약·표시 내용과 중대하게 다르게 제공한 경우</li>
          <li>같은 구독에 대한 중복 결제 또는 회사·결제 시스템의 오결제가 확인된 경우</li>
          <li>관계 법령 또는 소비자분쟁해결기준에서 환급이나 이용기간 연장을 정한 서비스 장애가 발생한 경우</li>
        </ul>
        <p>
          통신망, 이용자 기기, 잘못된 설정·승인, 외부 서비스 자체 장애 또는 이용자 귀책으로 발생한 문제는 회사의
          환불 사유에 해당하지 않을 수 있습니다. 다만 회사는 사실관계를 확인하고 가능한 복구 방법을 안내합니다.
        </p>
      </PolicySection>

      <PolicySection id="statutory-rights" title="5. 법정 권리와 우선 적용">
        <p>
          관계 법령에 따른 청약철회·계약 해지·환급 권리는 이 정책으로 배제되지 않습니다. 전자상거래법, 약관규제법,
          소비자보호 관계 법령 또는 강행규정이 이 정책보다 소비자에게 유리하게 적용되는 경우 해당 법령이 우선합니다.
          디지털 서비스의 제공 개시 여부, 실제 이용 범위, 가분성, 사전 고지 및 법정 요건에 따라 구체적인 처리 결과가
          달라질 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="request" title="6. 환불 신청 방법">
        <p>
          환불 검토를 요청하려면 <a href={`mailto:${OPERATOR_INFO.email}`}>{OPERATOR_INFO.email}</a>로 다음 정보를 보내
          주세요. 결제 카드번호, 비밀번호, OTP 또는 Access Token은 보내지 마세요.
        </p>
        <ul>
          <li>DREAMWISH 가입 이메일</li>
          <li>결제일, 결제 금액과 Polar 또는 PortOne·KPN·NHN KCP 영수증·주문 식별정보</li>
          <li>요청 사유와 문제가 발생한 시각</li>
          <li>오류 화면, 요청 ID 등 사실 확인에 필요한 자료</li>
        </ul>
        <p>회사는 본인과 결제 사실을 확인하기 위해 필요한 범위에서 추가 정보를 요청할 수 있습니다.</p>
      </PolicySection>

      <PolicySection id="processing" title="7. 환불 처리와 결제수단 반영">
        <p>
          환불 사유가 승인되면 원 결제수단으로 취소 또는 환급을 요청합니다. 법정 청약철회나 환급 의무가 적용되는
          경우 회사는 관계 법령에서 정한 기한에 따라 처리합니다. 회사가 결제 취소를 요청한 뒤 실제 카드 승인 취소
          또는 계좌 반영까지는 Polar, PortOne, KPN, NHN KCP, 카드사와 금융기관의 처리 일정에 따라 추가 시간이 걸릴 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="chargeback" title="8. 결제 분쟁과 부정 결제">
        <p>
          본인이 승인하지 않은 결제라면 즉시 회사와 결제수단 제공자에게 알리고 계정 보안을 점검해 주세요. 회사에
          먼저 문의하지 않고 결제 취소 분쟁을 제기하더라도 법정 권리는 제한되지 않지만, 신속한 확인을 위해 회사의
          조사 요청에 협조해 주세요.
        </p>
      </PolicySection>

      <PolicySection id="related" title="9. 관련 문서와 문의">
        <p>
          구독과 서비스 이용 조건은 <Link href="/terms">서비스 이용약관</Link>, 결제·문의 정보의 처리는
          <Link href="/privacy"> 개인정보 처리방침</Link>을 함께 확인해 주세요. 문의 전화는
          <a href={`tel:${OPERATOR_INFO.phone}`}> {OPERATOR_INFO.phone}</a>입니다.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
