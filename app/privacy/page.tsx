import type { Metadata } from "next";
import Link from "next/link";
import { PolicyLayout, PolicySection } from "@/components/legal/PolicyLayout";
import { OPERATOR_INFO } from "@/src/lib/legal/policy";
import { SITE_NAME } from "@/src/lib/site/metadata";

const description = "DREAMWISH가 개인정보를 수집·이용·보관·파기하는 기준과 이용자의 권리를 안내합니다.";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/privacy",
    siteName: SITE_NAME,
    title: "개인정보 처리방침 | DREAMWISH",
    description
  },
  twitter: { card: "summary", title: "개인정보 처리방침 | DREAMWISH", description }
};

export default function PrivacyPage() {
  return (
    <PolicyLayout title="개인정보 처리방침" description={description}>
      <PolicySection id="scope" title="1. 개인정보 처리방침의 적용 범위">
        <p>
          {OPERATOR_INFO.businessName}(이하 “회사”)은 DREAMWISH 웹 서비스에서 처리하는 개인정보를
          「개인정보 보호법」 등 관계 법령에 따라 보호합니다. 이 방침은 계정, AI 기능, 파일·메모리,
          CRM·ERP, 자동화, 외부 앱 연동, 결제 및 고객지원 과정에 적용됩니다.
        </p>
      </PolicySection>

      <PolicySection id="purpose" title="2. 개인정보의 처리 목적">
        <ul>
          <li>회원 가입, 본인 식별, 로그인 세션 유지 및 계정 보안</li>
          <li>카카오·네이버 소셜 로그인, 동일한 검증 이메일을 기준으로 한 계정 연결</li>
          <li>AI 대화, 분석, 메모리, 검색, 파일 및 업무 관리 기능 제공</li>
          <li>OAuth 계정 연결, 외부 앱 동기화 및 사용자가 설정한 자동화 실행</li>
          <li>고위험 자동화의 Preview, 승인, 실행 기록 및 감사 로그 제공</li>
          <li>월간 구독 결제, 이용 권한 확인, 영수증·결제 내역 및 구독 상태 관리</li>
          <li>이용권형·할인형 쿠폰의 유효성 확인, 사용 횟수 관리, 접근권한 또는 결제 할인 적용</li>
          <li>오류 분석, 부정 이용 방지, 보안 대응, 고객문의 처리 및 서비스 개선</li>
          <li>이용자가 동의한 경우 서비스 이용 분석과 광고 측정·제공</li>
        </ul>
      </PolicySection>

      <PolicySection id="categories" title="3. 처리하는 개인정보 항목">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>구분</th><th>처리 항목</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>계정·인증</td>
                <td>Firebase 사용자 ID 또는 Kakao·Naver 제공자 식별자, 검증된 이메일, 표시 이름, 로그인 제공자, 계정 상태</td>
              </tr>
              <tr>
                <td>서비스 콘텐츠</td>
                <td>프롬프트, 대화, AI 출력, 메모리, 파일과 메타데이터, 프로젝트, 일정, CRM·ERP·업무 기록</td>
              </tr>
              <tr>
                <td>자동화</td>
                <td>워크플로, 입력·출력·Preview, 실행·승인·재시도 기록, API 요청 ID, 감사 이벤트</td>
              </tr>
              <tr>
                <td>컴패니언 앱·매출 후보</td>
                <td>연결 기기·공개키·앱 버전·동기화 sequence, 사용자가 선택한 연락처·일정 후보, Android에서 허용 목록에 넣은 앱의 마스킹된 알림 텍스트 또는 iPhone 공유 확장으로 직접 공유한 텍스트, 추정 금액·거래 방향·신뢰도·검토 결과, 암호화된 푸시 토큰</td>
              </tr>
              <tr>
                <td>외부 연결</td>
                <td>앱·제공자, 연결 ID, 외부 계정 ID·이메일·이름, 허용 Scope, 연결·자격증명 상태, 암호화된 인증정보</td>
              </tr>
              <tr>
                <td>결제·구독</td>
                <td>Polar 또는 PortOne 고객·결제·빌링키·구독 식별자, KPN·NHN KCP 처리 결과, 결제 상태, 결제 금액·통화, 결제·갱신·해지·환불 시각, 이용 종료일</td>
              </tr>
              <tr>
                <td>쿠폰·이용권</td>
                <td>쿠폰 코드의 HMAC 해시와 일부 힌트, 종류·혜택·만료·사용 횟수, 사용자·할인 예약·이용권 식별자와 적용 결과</td>
              </tr>
              <tr>
                <td>기술·보안</td>
                <td>IP 주소, 브라우저·기기 정보, 접속 시각, 요청·오류 로그, 보안 이벤트, Rate Limit 정보</td>
              </tr>
              <tr>
                <td>동의·문의</td>
                <td>쿠키 동의 항목·시각·버전, 문의 내용, 회신 이메일과 처리 기록</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          비밀번호는 Firebase 인증 화면에서 처리되며 회사가 평문으로 저장하지 않습니다. 결제 카드번호와
          CVC는 Polar, PortOne, KPN, NHN KCP 및 해당 결제 처리 사업자가 처리하며 DREAMWISH는 카드 정보를 직접 저장하지 않습니다.
          Access Token, Refresh Token, API Key 등 연결 비밀정보는 화면과 로그에서 마스킹하고 저장 시 보호합니다.
        </p>
      </PolicySection>

      <PolicySection id="collection" title="4. 개인정보의 수집 방법">
        <ul>
          <li>회원가입, 설정, 콘텐츠 작성, 파일 업로드, 고객문의 과정에서 이용자가 직접 입력</li>
          <li>Firebase 이메일 로그인, Kakao·Naver 로그인, Polar·PortOne 결제 및 OAuth 제공자의 동의 화면을 통한 전달</li>
          <li>사용자가 연결한 외부 앱의 API 또는 Webhook을 통한 동기화</li>
          <li>컴패니언 앱에서 사용자가 권한·허용 앱·동기화 버튼을 선택하거나 iPhone 공유 확장으로 직접 전달한 정보. iPhone에서 다른 앱의 알림을 자동 수집하지 않음</li>
          <li>서비스 이용 과정에서 서버·브라우저 로그와 쿠키를 통해 자동 생성</li>
        </ul>
      </PolicySection>

      <PolicySection id="retention" title="5. 보유 및 이용 기간">
        <p>
          회사는 처리 목적이 달성되거나 회원이 계정을 삭제하면 개인정보를 지체 없이 파기합니다. 다만 분쟁
          대응, 부정 이용 방지, 복구 또는 관계 법령상 의무가 있으면 필요한 범위에서 분리하여 보관합니다.
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>기록</th><th>원칙적 보유 기간</th></tr></thead>
            <tbody>
              <tr><td>계정 및 이용자 콘텐츠</td><td>회원 탈퇴 또는 이용자가 삭제할 때까지</td></tr>
              <tr><td>삭제 대기 계정</td><td>삭제 요청 후 7일의 취소 가능 기간까지. 이후 법정 보관 대상 외 계정 정보를 삭제</td></tr>
              <tr><td>OAuth 연결 및 암호화된 인증정보</td><td>연결 해제, 자격증명 삭제 또는 회원 탈퇴 시까지</td></tr>
              <tr><td>연결 기기·매출 후보·푸시 토큰</td><td>이용자가 검토·삭제하거나 기기 연결을 해제하거나 회원 탈퇴할 때까지. 감사·결제 기록은 관계 법령상 기간</td></tr>
              <tr><td>쿠폰 발급·사용 및 이용권 기록</td><td>혜택 제공·분쟁 대응 목적 달성 시까지. 결제·계약 관련 기록은 관계 법령상 기간</td></tr>
              <tr><td>쿠키 동의 선택</td><td>선택 시점부터 180일 또는 이용자가 먼저 삭제·변경할 때까지</td></tr>
              <tr><td>계약 또는 청약철회 등에 관한 기록</td><td>전자상거래법에 따라 5년</td></tr>
              <tr><td>대금결제 및 재화·서비스 공급 기록</td><td>전자상거래법에 따라 5년</td></tr>
              <tr><td>소비자 불만 또는 분쟁처리 기록</td><td>전자상거래법에 따라 3년</td></tr>
              <tr><td>표시·광고 기록</td><td>전자상거래법에 따라 6개월</td></tr>
              <tr><td>접속 기록</td><td>관계 법령이 적용되는 경우 해당 법정 기간</td></tr>
            </tbody>
          </table>
        </div>
      </PolicySection>

      <PolicySection id="third-parties" title="6. 제3자 제공과 사용자가 지시한 외부 전송">
        <p>
          회사는 이용자의 동의나 법적 근거 없이 개인정보를 제3자에게 판매하지 않습니다. 이용자가 Gmail,
          Google Sheets, YouTube, Notion, Slack, Microsoft, GitHub, Discord, Dropbox 등 외부 서비스를 연결하고
          동기화·전송·자동화를 실행하면 선택한 데이터가 해당 제공자에게 전송됩니다. 이 전송은 이용자가 지정한
          기능을 수행하기 위한 것이며 전송 범위와 결과는 실행 전 설정 또는 Preview에서 확인할 수 있습니다.
        </p>
        <p>
          회원이 Kakao(카카오) 또는 Naver(네이버) 로그인을 선택하면 해당 제공자로부터 제공자 식별자, 이메일과
          이름을 전달받습니다. DREAMWISH는 검증된 이메일 제공에 동의한 경우에만 로그인과 기존 계정 연결을
          처리하며, 제공자 Access Token을 회원 계정이나 브라우저 저장소에 보관하지 않습니다.
        </p>
        <p>
          법령상 요구, 생명·신체의 급박한 보호 또는 적법한 수사기관의 요청이 있는 경우에는 관계 법령이 허용하는
          범위에서 제공할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="overseas" title="7. 처리위탁 및 국외 이전">
        <p>
          다음 사업자는 서비스 운영을 위해 정보를 국외에서 처리할 수 있습니다. 실제 처리 국가와 보유 기간은
          이용자가 선택한 제공자, 계약 및 제공자의 인프라에 따라 달라질 수 있습니다. 전송은 해당 기능 사용 시
          암호화된 네트워크를 통해 이루어집니다.
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>수령자·업무</th><th>이전 항목과 목적</th><th>국가·보유 기준</th></tr></thead>
            <tbody>
              <tr>
                <td>Google(Firebase, Gemini, Analytics, Ads)</td>
                <td>계정 인증, 선택한 AI 입력·출력, 동의한 이용 분석·광고 정보, 컴패니언 앱의 후보 ID 기반 푸시 전송</td>
                <td>미국 등 Google 인프라 운영 국가·서비스 이용 또는 제공자 정책상 기간</td>
              </tr>
              <tr>
                <td>Polar, PortOne, KPN, NHN KCP 및 결제 처리 사업자</td>
                <td>계정 이메일, 고객·구독·주문 정보, 결제 및 구독 관리</td>
                <td>미국 등 결제 인프라 운영 국가·계약 및 법정 보유 기간</td>
              </tr>
              <tr>
                <td>선택한 AI 제공자(OpenRouter, Groq, Hugging Face, Cloudflare, OpenAI)</td>
                <td>이용자가 요청한 프롬프트·첨부 내용과 AI 응답 생성</td>
                <td>미국 등 각 제공자의 처리 국가·선택한 제공자 정책상 기간</td>
              </tr>
              <tr>
                <td>Railway 등 호스팅·데이터 저장 인프라</td>
                <td>계정 식별자, 서비스 데이터, 파일, 로그의 호스팅·백업·전송</td>
                <td>배포 환경으로 선택된 리전·서비스 제공 및 법정 보유 기간</td>
              </tr>
              <tr>
                <td>이용자가 연결한 외부 앱</td>
                <td>이용자가 선택한 계정·콘텐츠·자동화 입력과 실행 결과</td>
                <td>각 외부 앱의 처리 국가·연결 해제 또는 해당 제공자 정책상 기간</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          선택 기능의 국외 이전을 원하지 않으면 해당 AI 제공자·외부 앱을 사용하지 않거나 연결을 해제할 수
          있습니다. 다만 Firebase 인증과 선택한 Polar·PortOne 결제처럼 핵심 기능에 필요한 처리를 거부하면 회원가입 또는 유료
          서비스 이용이 제한될 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="destruction" title="8. 개인정보의 파기">
        <p>
          전자적 기록은 복구하기 어려운 방식으로 삭제하고, 출력물은 분쇄 또는 소각합니다. 법정 보관 대상은
          운영 데이터와 분리하고 보관 목적이 끝나면 파기합니다. 외부 계정 연결을 해제하면 내부 인증정보를
          삭제하며, 필요한 경우 외부 제공자에게 토큰 폐기를 요청합니다. 계정 삭제는 오조작 방지를 위해 요청 후
          7일 동안 삭제 예정 상태로 보관하며, 이 기간에는 취소할 수 있습니다. 기간이 지나면 법정 보관분을 제외하고 파기합니다.
        </p>
      </PolicySection>

      <PolicySection id="rights" title="9. 이용자의 권리와 행사 방법">
        <p>
          이용자는 자신의 개인정보 열람, 정정, 삭제, 처리정지, 동의 철회 및 연결 해제를 요청할 수 있습니다.
          계정과 서비스 내에서 직접 처리하거나 <a href={`mailto:${OPERATOR_INFO.email}`}>{OPERATOR_INFO.email}</a>로
          요청할 수 있습니다. 회사는 요청자의 본인 여부를 확인한 후 관계 법령에서 정한 기간 안에 조치합니다.
        </p>
        <p>계정 삭제를 요청하면 7일의 취소 가능 기간이 적용되며, 삭제 예정일 전에는 요청을 취소할 수 있습니다.</p>
        <p>
          쿠키 동의는 Footer 또는 설정의 쿠키 설정에서 언제든 변경할 수 있으며, OAuth 연결은 연동 또는 자동화
          설정에서 해제할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="children" title="10. 만 14세 미만 아동">
        <p>
          DREAMWISH는 만 14세 미만 아동을 대상으로 하지 않습니다. 회사가 법정대리인 동의 없이 아동의 정보가
          수집된 사실을 확인하면 해당 정보를 삭제하고 필요한 조치를 합니다.
        </p>
      </PolicySection>

      <PolicySection id="ai" title="11. AI 처리와 자동화된 결과">
        <p>
          AI 기능은 이용자가 제공한 내용과 연결된 업무 데이터를 분석하여 답변·요약·분류·자동화 입력을 만들 수
          있습니다. AI 결과만으로 이용자에게 법적 또는 중대한 효과를 발생시키는 결정을 자동 확정하지 않으며,
          중요한 결정과 고위험 외부 변경은 이용자가 검토·승인해야 합니다. 자세한 한계는 <Link href="/terms">이용약관</Link>을
          확인해 주세요.
        </p>
      </PolicySection>

      <PolicySection id="cookies" title="12. 쿠키 및 행태정보">
        <p>
          로그인·보안을 위한 필수 저장소를 사용하고, 분석·광고 저장은 이용자의 선택에 따라 Google Consent Mode
          v2로 제어합니다. 수집 항목, 보유 기간과 거부 방법은 <Link href="/cookies">쿠키 정책</Link>에서 확인할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="security" title="13. 안전성 확보 조치">
        <ul>
          <li>세션·소유자 범위 확인과 최소 권한 OAuth Scope 적용</li>
          <li>자격증명 암호화, Secret 마스킹 및 실행 직전 안전한 조회</li>
          <li>고위험 작업의 Preview·승인·입력 해시 검증 및 Append Only 감사 로그</li>
          <li>Queue lease, 중복 실행 방지, Rate Limit, 입력 검증 및 접근 기록</li>
          <li>권한 없는 접근 차단과 보안 사고 대응 절차 운영</li>
        </ul>
      </PolicySection>

      <PolicySection id="contact" title="14. 개인정보 보호 문의">
        <p>
          개인정보 보호책임자 및 고충처리 담당자는 대표자 김동현입니다. 이메일은
          <a href={`mailto:${OPERATOR_INFO.email}`}> {OPERATOR_INFO.email}</a>, 전화는
          <a href={`tel:${OPERATOR_INFO.phone}`}> {OPERATOR_INFO.phone}</a>입니다. 개인정보 침해에 대한 상담이나
          분쟁조정은 개인정보침해 신고센터, 개인정보분쟁조정위원회 등 관계 기관에도 신청할 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="changes" title="15. 방침의 변경">
        <p>
          법령, 제공 기능 또는 처리 방식이 변경되면 이 방침을 개정할 수 있습니다. 중요한 변경은 시행 전에
          서비스 화면이나 가입 이메일 등 합리적인 방법으로 알립니다.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
