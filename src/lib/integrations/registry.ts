import { calendarConnector } from "./calendar-connector";
import { gmailConnector } from "./gmail-connector";
import { MockConnector } from "./mock-connector";
import { slackConnector } from "./slack-connector";
import type { Connector } from "./types";

const connectors: Connector[] = [
  gmailConnector,
  calendarConnector,
  slackConnector,
  new MockConnector({
    id: "notion",
    name: "Notion",
    serviceType: "document",
    description: "페이지와 데이터베이스 동기화 구조를 준비합니다.",
    permissions: [
      permission("notion.page.read", "페이지 읽기", "페이지를 읽습니다.", "medium", true),
      permission("notion.page.create", "페이지 생성", "승인 후 페이지를 생성합니다.", "high", false)
    ]
  }),
  new MockConnector({
    id: "github",
    name: "GitHub",
    serviceType: "code",
    description: "Issue, PR, repository read 구조를 준비합니다.",
    permissions: [
      permission("github.repo.read", "Repo 읽기", "Repository 메타데이터를 읽습니다.", "medium", true),
      permission("github.issue.write", "Issue 작성", "승인 후 Issue를 작성합니다.", "high", false)
    ]
  }),
  new MockConnector({
    id: "firebase",
    name: "Firebase",
    serviceType: "database",
    description: "Firebase project configuration, deployment status, and sync readiness are tracked locally.",
    permissions: [
      permission("firebase.config.read", "Read config status", "Checks whether Firebase client/admin configuration exists without exposing values.", "low", true),
      permission("firebase.deploy.preview", "Deployment preview", "Creates a local deployment checklist before any external action.", "medium", false)
    ]
  }),
  new MockConnector({
    id: "browser",
    name: "Browser",
    serviceType: "browser",
    description: "브라우저 검색과 웹페이지 저장 구조를 준비합니다.",
    permissions: [
      permission("browser.read", "페이지 읽기", "현재 페이지 정보를 읽습니다.", "medium", false)
    ]
  }),
  new MockConnector({
    id: "local-files",
    name: "Local Files",
    serviceType: "file",
    description: "Vault와 외부 파일 인덱싱 구조를 준비합니다.",
    permissions: [
      permission("files.read", "파일 읽기", "선택된 파일을 읽습니다.", "medium", true),
      permission("files.write", "파일 쓰기", "승인 후 파일을 생성하거나 수정합니다.", "high", false)
    ]
  }),
  new MockConnector({
    id: "webhook",
    name: "Webhook",
    serviceType: "webhook",
    description: "외부 이벤트 수신 구조를 준비합니다.",
    permissions: [
      permission("webhook.receive", "Webhook 수신", "외부 이벤트를 수신합니다.", "medium", false)
    ]
  })
];

export const connectorRegistry = {
  list: () => connectors,
  get: (id: string) => {
    const connector = connectors.find((item) => item.id === id);
    if (!connector) throw new Error(`Connector를 찾을 수 없습니다: ${id}`);
    return connector;
  }
};

function permission(
  permissionKey: string,
  permissionName: string,
  description: string,
  riskLevel: "low" | "medium" | "high" | "critical",
  isGranted: boolean
) {
  return { permissionKey, permissionName, description, riskLevel, isGranted };
}

export { calendarConnector, gmailConnector, slackConnector };
