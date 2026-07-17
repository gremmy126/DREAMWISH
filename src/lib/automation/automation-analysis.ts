import { chatWithAI } from "../ai/ai.service";
import { listAutomationRuns } from "./run.repository";
import { listScenarios } from "./scenario.repository";
import type { AutomationScenario } from "./scenario-designer";

export type AutomationAnalysis = {
  generatedAt: string;
  aiGenerated: boolean;
  stats: {
    totalScenarios: number;
    activeScenarios: number;
    scheduledScenarios: number;
    totalRuns: number;
    successRate: number;
    pendingApprovals: number;
    missingConnections: number;
    failedRuns: number;
  };
  findings: string[];
  recommendations: string[];
};

/**
 * Analyzes the owner's real automation data (scenarios, run history and
 * connection gaps). Statistics are always computed deterministically; the
 * recommendation prose is AI-written when a provider is configured and falls
 * back to rule-based recommendations otherwise — never fabricated numbers.
 */
export async function buildAutomationAnalysis(
  ownerId: string,
  options: { connectedApps?: Set<string>; askAI?: typeof chatWithAI } = {}
): Promise<AutomationAnalysis> {
  const [scenarios, runs] = await Promise.all([
    listScenarios(ownerId),
    listAutomationRuns(ownerId, { limit: 100 })
  ]);
  const connected = options.connectedApps || new Set<string>();

  const activeScenarios = scenarios.filter((scenario) => scenario.status === "active");
  const scheduledScenarios = activeScenarios.filter((scenario) => Boolean(scenario.nextRunAt));
  const failedRuns = runs.filter((run) => run.status === "failed");
  const pendingApprovals = runs.filter((run) =>
    run.steps.some((step) => step.status === "approval_required")
  );
  const missingConnections = scenarios.filter((scenario) =>
    scenario.nodes.some(
      (node) => node.requiresCredential && !node.credentialId && !connected.has(node.appId)
    )
  );
  const totalRuns = scenarios.reduce((sum, scenario) => sum + scenario.runs, 0);
  const successfulRuns = scenarios.reduce((sum, scenario) => sum + scenario.successfulRuns, 0);
  const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;

  const stats: AutomationAnalysis["stats"] = {
    totalScenarios: scenarios.length,
    activeScenarios: activeScenarios.length,
    scheduledScenarios: scheduledScenarios.length,
    totalRuns,
    successRate,
    pendingApprovals: pendingApprovals.length,
    missingConnections: missingConnections.length,
    failedRuns: failedRuns.length
  };

  const findings = buildFindings(stats, scenarios, missingConnections);
  const fallbackRecommendations = buildRuleRecommendations(stats, missingConnections);

  let recommendations = fallbackRecommendations;
  let aiGenerated = false;
  const askAI = options.askAI || chatWithAI;
  if (scenarios.length > 0) {
    try {
      const answer = await askAI([
        {
          role: "system",
          content:
            "당신은 업무 자동화 컨설턴트입니다. 아래 사용자의 실제 자동화 통계를 보고, 한국어로 실행 가능한 개선 추천을 정확히 3~5개, 각 줄을 '- '로 시작하는 목록으로만 답하세요. 통계에 없는 수치를 만들지 마세요."
        },
        {
          role: "user",
          content: [
            `시나리오 ${stats.totalScenarios}개 (활성 ${stats.activeScenarios}, 예약됨 ${stats.scheduledScenarios})`,
            `누적 실행 ${stats.totalRuns}회, 성공률 ${stats.successRate}%`,
            `승인 대기 실행 ${stats.pendingApprovals}건, 실패 실행 ${stats.failedRuns}건`,
            `연결이 비어 있는 시나리오 ${stats.missingConnections}개${
              missingConnections.length > 0
                ? ` (${missingConnections.slice(0, 3).map((item) => item.name).join(", ")})`
                : ""
            }`
          ].join("\n")
        }
      ]);
      const parsed = answer
        .split("\n")
        .map((line) => line.replace(/^[-*\d.\s]+/u, "").trim())
        .filter((line) => line.length > 4 && line.length < 200)
        .slice(0, 5);
      if (parsed.length >= 2) {
        recommendations = parsed;
        aiGenerated = true;
      }
    } catch {
      // Provider not configured or failed — rule-based recommendations stand.
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    aiGenerated,
    stats,
    findings,
    recommendations
  };
}

function buildFindings(
  stats: AutomationAnalysis["stats"],
  scenarios: AutomationScenario[],
  missingConnections: AutomationScenario[]
): string[] {
  const findings: string[] = [];
  if (stats.totalScenarios === 0) {
    findings.push("아직 만든 자동화가 없습니다.");
    return findings;
  }
  const worst = scenarios
    .filter((scenario) => scenario.runs >= 2)
    .sort(
      (a, b) => a.successfulRuns / a.runs - b.successfulRuns / b.runs
    )[0];
  if (worst && worst.successfulRuns / worst.runs < 0.7) {
    findings.push(
      `"${worst.name}"의 성공률이 ${Math.round((worst.successfulRuns / worst.runs) * 100)}%로 가장 낮습니다.`
    );
  }
  if (stats.activeScenarios > 0 && stats.scheduledScenarios === 0) {
    findings.push("활성 시나리오에 예약 실행 시간이 설정되어 있지 않습니다.");
  }
  if (stats.pendingApprovals > 0) {
    findings.push(`승인을 기다리는 외부 발송이 ${stats.pendingApprovals}건 있습니다.`);
  }
  if (missingConnections.length > 0) {
    findings.push(
      `연결되지 않은 계정이 필요한 시나리오: ${missingConnections
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ")}`
    );
  }
  if (findings.length === 0) findings.push("모든 자동화가 정상 상태입니다.");
  return findings;
}

function buildRuleRecommendations(
  stats: AutomationAnalysis["stats"],
  missingConnections: AutomationScenario[]
): string[] {
  const recommendations: string[] = [];
  if (stats.totalScenarios === 0) {
    recommendations.push("아래 입력창에 원하는 자동화를 문장으로 적어 첫 시나리오를 만들어 보세요.");
    return recommendations;
  }
  if (missingConnections.length > 0) {
    recommendations.push("연동 페이지에서 누락된 계정을 연결하면 실패 없이 실행됩니다.");
  }
  if (stats.pendingApprovals > 0) {
    recommendations.push("실행 내역 탭에서 승인 대기 중인 외부 발송을 검토·승인하세요.");
  }
  if (stats.activeScenarios > 0 && stats.scheduledScenarios === 0) {
    recommendations.push("Schedule 모듈에 시간을 설정하면 예약 실행이 자동으로 동작합니다.");
  }
  if (stats.successRate < 80 && stats.totalRuns > 0) {
    recommendations.push("실패한 실행의 단계별 로그를 확인해 누락된 설정을 채워주세요.");
  }
  if (recommendations.length === 0) {
    recommendations.push("현재 구성이 안정적입니다. 템플릿에서 새 자동화를 추가해 보세요.");
  }
  return recommendations;
}
