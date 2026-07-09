import { Bot, BrainCircuit, CheckCircle2, ShieldCheck } from "lucide-react";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { agentCatalog } from "@/src/lib/agent/agents";

export function AgentsView() {
  return (
    <div className="space-y-5">
      <SurfaceCard className="p-6">
        <SectionHeader
          icon={Bot}
          title="Agents"
          description="모든 Agent는 Planner를 사용하고, 실행 전 Approval을 거칩니다."
        />
        <div className="grid grid-cols-3 gap-3">
          <Principle icon={BrainCircuit} title="Plan" text="사용자 요청을 실행 단계로 분해" />
          <Principle icon={ShieldCheck} title="Approve" text="데이터 수정 전 Execution Preview" />
          <Principle icon={CheckCircle2} title="Learn" text="실행 결과와 다음 행동을 Memory에 기록" />
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6">
        <SectionHeader
          icon={Bot}
          title="Agent Framework"
          description="Sales, Marketing, Support, Knowledge, Calendar, Email 등 업무별 Agent입니다."
        />
        <div className="grid grid-cols-5 gap-3">
          {agentCatalog.map((agent) => (
            <article
              key={agent.name}
              className="rounded-app border border-app-border bg-white p-4 shadow-soft"
            >
              <p className="text-sm font-semibold text-app-text">{agent.name}</p>
              <p className="mt-2 text-xs leading-5 text-app-muted">{agent.description}</p>
            </article>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
}

function Principle({
  icon: Icon,
  title,
  text
}: {
  icon: typeof Bot;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-app border border-app-border bg-white p-4 shadow-soft">
      <Icon size={18} className="mb-3 text-app-primary" />
      <p className="text-sm font-semibold text-app-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-app-muted">{text}</p>
    </div>
  );
}
