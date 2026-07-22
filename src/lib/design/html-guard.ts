// Safety inspection for AI-generated HTML before it is previewed or stored.
// The preview iframe already runs with sandbox="allow-scripts" (no
// same-origin, no top-navigation), so the goal here is defense in depth:
// surface anything that tries to escape the sandbox, phone home, or touch
// credentials, and block the artifact when a critical pattern appears.

export type HtmlGuardSeverity = "critical" | "warning";

export type HtmlGuardFinding = {
  code: string;
  severity: HtmlGuardSeverity;
  message: string;
  /** Small excerpt of the matched content for the reviewer. */
  evidence: string;
};

export type HtmlGuardReport = {
  safe: boolean;
  findings: HtmlGuardFinding[];
};

// Verified open-source CDNs the generation prompt permits. Anything else that
// loads executable code is flagged.
export const ALLOWED_SCRIPT_HOSTS = [
  "cdn.tailwindcss.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

const URL_ATTRIBUTE = /\b(?:src|href)\s*=\s*["']?(https?:\/\/[^"'\s>]+)/giu;

const CRITICAL_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: "iframe-escape",
    pattern: /(?:window\s*\.\s*)?(?:top|parent)\s*\.\s*(?:location|postMessage|document|window)/iu,
    message: "부모 창(top/parent)에 접근하려는 코드가 있습니다 (iframe escape 시도)."
  },
  {
    code: "cookie-access",
    pattern: /document\s*\.\s*cookie/iu,
    message: "쿠키에 접근하는 코드가 있습니다."
  },
  {
    code: "credential-probe",
    pattern: /(?:api[_-]?key|access[_-]?token|authorization|bearer\s+[a-z0-9._-]{16,}|password)\s*[:=]/iu,
    message: "자격 증명(API key/token/password)을 다루는 코드가 있습니다."
  },
  {
    code: "obfuscated-eval",
    pattern: /\beval\s*\(|new\s+Function\s*\(|\batob\s*\(\s*["'][A-Za-z0-9+/=]{40,}/u,
    message: "난독화된 실행 코드(eval/Function/장문 atob)가 있습니다."
  },
  {
    code: "form-exfiltration",
    pattern: /<form[^>]+action\s*=\s*["']https?:\/\//iu,
    message: "외부 주소로 제출되는 form이 있습니다 (데이터 유출 위험)."
  }
];

const WARNING_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  {
    code: "network-call",
    pattern: /\bfetch\s*\(\s*["']https?:\/\/|new\s+XMLHttpRequest|new\s+WebSocket\s*\(/iu,
    message: "외부 네트워크를 호출하는 코드가 있습니다. 미리보기에서는 차단됩니다."
  },
  {
    code: "storage-access",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/u,
    message:
      "브라우저 저장소를 사용합니다. sandbox 미리보기에서는 격리되지만 배포 시 확인이 필요합니다."
  },
  {
    code: "meta-refresh",
    pattern: /<meta[^>]+http-equiv\s*=\s*["']refresh/iu,
    message: "meta refresh 리다이렉트가 있습니다."
  }
];

// Known tracking/analytics endpoints have no place in generated artifacts.
const TRACKER_HOSTS =
  /(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.net|hotjar\.com|segment\.(?:io|com)|mixpanel\.com|amplitude\.com)/iu;

export function inspectGeneratedHtml(html: string): HtmlGuardReport {
  const findings: HtmlGuardFinding[] = [];
  const push = (
    code: string,
    severity: HtmlGuardSeverity,
    message: string,
    evidence: string
  ) => {
    if (!findings.some((finding) => finding.code === code)) {
      findings.push({ code, severity, message, evidence: evidence.slice(0, 160) });
    }
  };

  for (const rule of CRITICAL_PATTERNS) {
    const match = html.match(rule.pattern);
    if (match) push(rule.code, "critical", rule.message, match[0]);
  }
  for (const rule of WARNING_PATTERNS) {
    const match = html.match(rule.pattern);
    if (match) push(rule.code, "warning", rule.message, match[0]);
  }

  // Every absolute URL that loads content must be on the allowlist.
  for (const match of html.matchAll(URL_ATTRIBUTE)) {
    const url = match[1];
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (TRACKER_HOSTS.test(host)) {
      push("tracker", "critical", `추적 스크립트 호스트(${host})가 포함되어 있습니다.`, url);
      continue;
    }
    const isScriptOrStyle = new RegExp(
      `<(?:script|link)[^>]*["']?${url.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`,
      "iu"
    ).test(html);
    if (isScriptOrStyle && !ALLOWED_SCRIPT_HOSTS.some((allowed) => host === allowed)) {
      push(
        "unlisted-cdn",
        "warning",
        `허용 목록에 없는 외부 리소스 호스트(${host})를 로드합니다.`,
        url
      );
    }
  }

  return {
    safe: !findings.some((finding) => finding.severity === "critical"),
    findings
  };
}
