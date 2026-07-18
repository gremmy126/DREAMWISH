"use client";

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  ChevronDown,
  CirclePlay,
  MoreVertical,
  PanelLeftOpen,
  PanelRightOpen,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTOMATION_MODULES,
  createScenarioNode,
  type AutomationModule,
  type AutomationScenario,
  type ScenarioConfig,
  type ScenarioNode
} from "@/src/lib/automation/scenario-designer";
import type { PublicAutomationCredential } from "@/src/lib/automation/credential.repository";
import { AppLogo } from "@/components/shared/AppLogo";
import { ActionPicker } from "@/components/Automation/ActionPicker";
import { ActionInputForm } from "@/components/Automation/ActionInputForm";
import { ActionPreviewCard } from "@/components/Automation/ActionPreviewCard";
import { AutomationTabs, type AutomationTab } from "@/components/Automation/AutomationTabs";
import { ConnectionManager, TemplateGallery } from "@/components/Automation/AutomationSecondaryViews";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import { readStoredTimezonePreference } from "@/src/lib/settings/app-preferences";
import { changeScenarioAction } from "@/src/lib/automation/action-ui-model";
import { getActionDefinition } from "@/src/lib/automation/registry/action-registry";
import { ApprovalCenter } from "@/components/Automation/ApprovalCenter";
import { DurableRunHistory } from "@/components/Automation/DurableRunHistory";
import { DurableConnectionPanel } from "@/components/Automation/DurableConnectionPanel";
import { AutomationActionGuide } from "@/components/Automation/AutomationActionGuide";
import { ResponsiveAutomationPanel } from "@/components/Automation/ResponsiveAutomationPanel";

type CanvasData = { scenarioNode: ScenarioNode; order: number; oauthConnected?: boolean };
type CanvasNode = Node<CanvasData, "scenarioModule">;
type OAuthConnectionOption = { id: string; appId: string; status: string; accountLabel?: string | null; accountEmail?: string | null };

const nodeTypes = { scenarioModule: ScenarioModuleNode };
const templates = [
  { title: "이메일을 Notion에 저장", prompt: "Gmail의 중요한 이메일을 AI로 요약해 Notion에 저장해줘", chain: ["gmail", "ai", "notion"] },
  { title: "Slack 메시지를 시트에 저장", prompt: "Slack의 새 고객 메시지를 Google Sheets에 저장해줘", chain: ["slack", "google-sheets"] },
  { title: "폼 제출 알림", prompt: "Webhook으로 폼 제출을 받으면 AI로 분류하고 Slack에 알려줘", chain: ["webhook", "ai", "slack"] },
  { title: "일정 알림 이메일", prompt: "매일 오전 9시에 오늘 Calendar 일정을 Gmail로 보내줘", chain: ["schedule", "calendar", "gmail"] }
];

export function AutomationView() {
  const [scenarios, setScenarios] = useState<AutomationScenario[]>([]);
  const [active, setActive] = useState<AutomationScenario | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<PublicAutomationCredential[]>([]);
  const [oauthConnections, setOauthConnections] = useState<OAuthConnectionOption[]>([]);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AutomationTab>("scenario");
  const [approvalPolicy, setApprovalPolicy] = useState("high_risk_two_stage");
  const [approvalExpiryMinutes, setApprovalExpiryMinutes] = useState(30);
  const [notificationChannels, setNotificationChannels] = useState<string[]>(["in_app"]);
  const [criticalAuthMethod, setCriticalAuthMethod] = useState<"" | "password" | "otp" | "admin">("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<CanvasNode, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const inspectorButtonRef = useRef<HTMLButtonElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const refitCanvas = useCallback(() => {
    if (!reactFlowInstance) return;
    requestAnimationFrame(() => {
      void reactFlowInstance.fitView({ padding: 0.2, duration: 180 });
    });
  }, [reactFlowInstance]);

  useEffect(() => {
    void loadWorkspace();
    // Integrations and Automation share one connection-state source: reload
    // the OAuth status whenever the user returns from the Integrations page
    // so a fresh connection immediately clears any "연결 필요" badge.
    const refresh = () => void loadOauthConnections();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    refitCanvas();
  }, [catalogOpen, inspectorOpen, refitCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(refitCanvas);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [refitCanvas]);

  async function loadOauthConnections() {
    try {
      const response = await fetch("/api/integrations/connections", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        connections?: OAuthConnectionOption[];
      };
      if (response.ok) setOauthConnections(data.connections || []);
    } catch {
      setOauthConnections([]);
    }
  }

  async function loadWorkspace(preferredId?: string) {
    const deepLink = typeof window === "undefined" ? null : new URL(window.location.href);
    const requestedScenarioId = preferredId || deepLink?.searchParams.get("scenario") || undefined;
    const requestedNodeId = deepLink?.searchParams.get("node") || null;
    const [scenarioResponse, credentialResponse] = await Promise.all([
      fetch("/api/automation/scenarios"),
      fetch("/api/automation/credentials")
    ]);
    await loadOauthConnections();
    const scenarioData = (await scenarioResponse.json().catch(() => ({}))) as { scenarios?: AutomationScenario[] };
    const credentialData = (await credentialResponse.json().catch(() => ({}))) as { credentials?: PublicAutomationCredential[] };
    const nextScenarios = scenarioData.scenarios || [];
    setScenarios(nextScenarios);
    setCredentials(credentialData.credentials || []);
    const next = nextScenarios.find((scenario) => scenario.id === requestedScenarioId) || nextScenarios[0] || null;
    selectScenario(next);
    if (next && requestedNodeId && next.nodes.some((node) => node.id === requestedNodeId)) {
      setActiveTab("scenario");
      setSelectedNodeId(requestedNodeId);
      setInspectorOpen(true);
    }
  }

  const connectedOauthApps = useMemo(
    () =>
      new Map(
        oauthConnections
          .filter((connection) => connection.status === "connected")
          .map((connection) => [connection.appId, connection.accountLabel || connection.accountEmail || null])
      ),
    [oauthConnections]
  );

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          oauthConnected: connectedOauthApps.has(node.data.scenarioNode.appId)
        }
      }))
    );
  }, [connectedOauthApps]);

  function selectScenario(scenario: AutomationScenario | null) {
    setActive(scenario);
    setSelectedNodeId(null);
    setInspectorOpen(false);
    setNodes(toCanvasNodes(scenario?.nodes || []));
    setEdges((scenario?.edges || []).map((edge) => ({ ...edge, animated: scenario?.status === "active", style: { stroke: "#8b7cf6", strokeWidth: 1.6 } })));
  }

  async function createFromPrompt(value = prompt) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/automation/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: value.trim() || "매일 오전 9시에 오늘 일정을 요약해줘",
          title: draftTitle.trim() || undefined,
          description: draftDescription.trim() || undefined
        })
      });
      const data = (await response.json()) as { scenario?: AutomationScenario; error?: string };
      if (!response.ok || !data.scenario) throw new Error(data.error || "시나리오를 만들지 못했습니다.");
      setPrompt("");
      setDraftTitle("");
      setDraftDescription("");
      await loadWorkspace(data.scenario.id);
      setNotice("AI가 편집 가능한 시나리오 초안을 만들었습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "시나리오를 만들지 못했습니다.");
    } finally { setBusy(false); }
  }

  function addModule(item: AutomationModule) {
    const scenarioNode = createScenarioNode(item.id, nodes.length);
    setNodes((current) => [...current, toCanvasNode(scenarioNode, current.length)]);
    setSelectedNodeId(scenarioNode.id);
  }

  function addModuleFromResponsivePanel(item: AutomationModule) {
    addModule(item);
    setCatalogOpen(false);
    setInspectorOpen(true);
  }

  function selectCanvasNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    if (!window.matchMedia("(min-width: 1024px)").matches) setInspectorOpen(true);
  }

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);
  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true, style: { stroke: "#8b7cf6", strokeWidth: 1.6 } }, current));
  }, []);

  function currentScenario(): AutomationScenario | null {
    if (!active) return null;
    return {
      ...active,
      nodes: nodes.map((node) => ({ ...node.data.scenarioNode, position: node.position })),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: typeof edge.label === "string" ? edge.label : undefined }))
    };
  }

  async function saveScenario() {
    const scenario = currentScenario();
    if (!scenario) return;
    setBusy(true);
    const response = await fetch(`/api/automation/scenarios/${scenario.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario })
    });
    const data = (await response.json().catch(() => ({}))) as { scenario?: AutomationScenario; error?: string };
    setBusy(false);
    if (data.scenario) { await loadWorkspace(data.scenario.id); setNotice("시나리오를 저장했습니다."); }
    else setNotice(data.error || "저장하지 못했습니다.");
  }

  async function runScenario() {
    const scenario = currentScenario();
    if (!scenario) return;
    setBusy(true);
    await saveScenario();
    const response = await fetch(`/api/automation/workflows/${scenario.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalPolicy, approvalExpiryMinutes, notificationChannels, criticalAuthMethod: criticalAuthMethod || null })
    });
    const data = (await response.json().catch(() => ({}))) as { execution?: { id: string }; issues?: Array<{ message: string }>; error?: string };
    setBusy(false);
    if (!response.ok) { setNotice(data.issues?.map((issue) => issue.message).join(" · ") || data.error || "실행하지 못했습니다."); return; }
    await loadWorkspace(scenario.id);
    setNotice(`실행을 Queue에 안전하게 등록했습니다.${data.execution?.id ? ` 실행 ID: ${data.execution.id}` : ""}`);
  }

  async function toggleActive() {
    if (!active) return;
    const status = active.status === "active" ? "paused" : "active";
    const response = await fetch(`/api/automation/workflows/${active.id}/activate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        status,
        approvalPolicy,
        approvalExpiryMinutes,
        notificationChannels,
        criticalAuthMethod: criticalAuthMethod || null
      })
    });
    const data = await response.json().catch(() => ({})) as { error?: string; issues?: Array<{ message: string }> };
    if (response.ok) await loadWorkspace(active.id);
    else setNotice(data.issues?.map((issue) => issue.message).join(" · ") || data.error || "활성화 전 검증에 실패했습니다.");
  }

  async function removeScenario() {
    if (!active || !window.confirm("이 시나리오를 삭제할까요? 실행 기록도 목록에서 제거됩니다.")) return;
    await fetch(`/api/automation/scenarios/${active.id}`, { method: "DELETE" });
    await loadWorkspace();
  }

  function updateSelectedNode(patch: Partial<ScenarioNode>) {
    setNodes((current) => current.map((node) => node.id === selectedNodeId
      ? { ...node, data: { ...node.data, scenarioNode: { ...node.data.scenarioNode, ...patch } } }
      : node));
  }

  function updateScenarioMetadata(patch: Pick<Partial<AutomationScenario>, "name" | "description">) {
    if (!active) return;
    const updated = { ...active, ...patch };
    setActive(updated);
    setScenarios((current) => current.map((scenario) => scenario.id === updated.id ? updated : scenario));
  }

  function openCreateForm() {
    createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
    setInspectorOpen(false);
  }

  async function addStructuredCredential(input: { appId: string; label: string; values: Record<string, string> }) {
    const response = await fetch("/api/automation/credentials", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
    const data = (await response.json().catch(() => ({}))) as { credential?: PublicAutomationCredential; error?: string };
    if (!response.ok || !data.credential) throw new Error(data.error || "연결 정보를 저장하지 못했습니다.");
    setCredentials((current) => [data.credential!, ...current]);
  }

  return (
    <div className="space-y-5 pb-3">
      <AutomationHeader busy={busy} onCreate={openCreateForm} onGuide={() => setActiveTab("guide")} />
      <AutomationTabs value={activeTab} onChange={setActiveTab} />

      {activeTab === "scenario" ? <>
        <section className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <ScenarioPicker scenarios={scenarios} active={active} onSelect={selectScenario} />
            <div className="flex items-center gap-2 lg:hidden">
              <button
                ref={catalogButtonRef}
                type="button"
                aria-label="앱 추가"
                onClick={() => setCatalogOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <PanelLeftOpen size={16} /> 앱 추가
              </button>
              <button
                ref={inspectorButtonRef}
                type="button"
                aria-label="모듈 설정 열기"
                onClick={() => setInspectorOpen(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <PanelRightOpen size={16} /> 설정
              </button>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select aria-label="승인 정책" value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)} className="h-8 max-w-[210px] rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600">
                <option value="all_external_changes">모든 외부 변경 작업 승인</option><option value="test_only">테스트할 때만 승인</option><option value="medium_and_above">중간 위험 이상 승인</option><option value="high_risk_two_stage">고위험 작업만 2단계 승인</option><option value="automatic">승인 없이 자동 실행</option>
              </select>
              <select aria-label="승인 만료 시간" value={approvalExpiryMinutes} onChange={(event) => setApprovalExpiryMinutes(Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600">
                <option value={5}>5분</option><option value={15}>15분</option><option value={30}>30분</option><option value={60}>1시간</option><option value={1440}>24시간</option>
              </select>
              <select aria-label="critical 추가 인증" value={criticalAuthMethod} onChange={(event) => setCriticalAuthMethod(event.target.value as "" | "password" | "otp" | "admin")} className="h-8 rounded-lg border border-slate-200 px-2 text-[10px] font-bold text-slate-600">
                <option value="">critical 추가 인증 없음</option><option value="password">비밀번호 재확인</option><option value="otp">OTP</option><option value="admin">관리자 승인</option>
              </select>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <button type="button" onClick={() => void toggleActive()} className={`relative h-6 w-11 rounded-full transition ${active?.status === "active" ? "bg-emerald-500" : "bg-slate-200"}`} aria-label="실시간 실행 전환">
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${active?.status === "active" ? "left-6" : "left-1"}`} />
                </button>
                실시간 실행
              </label>
              <ToolbarButton icon={Play} label="실행" onClick={() => void runScenario()} disabled={!active || busy} />
              <ToolbarButton icon={Save} label="저장" onClick={() => void saveScenario()} disabled={!active || busy} />
              <ToolbarButton icon={Trash2} label="삭제" onClick={() => void removeScenario()} disabled={!active || busy} danger />
            </div>
          </div>

          {active ? (
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50/50 px-4 py-3 md:grid-cols-[minmax(180px,0.8fr)_minmax(260px,1.5fr)]">
              <label className="grid gap-1 text-[10px] font-bold text-slate-500">
                시나리오 제목
                <input
                  value={active.name}
                  maxLength={100}
                  onChange={(event) => updateScenarioMetadata({ name: event.target.value })}
                  className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none focus:border-violet-400"
                />
              </label>
              <label className="grid gap-1 text-[10px] font-bold text-slate-500">
                시나리오 설명
                <input
                  value={active.description}
                  maxLength={500}
                  onChange={(event) => updateScenarioMetadata({ description: event.target.value })}
                  className="h-9 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-violet-400"
                />
              </label>
            </div>
          ) : null}

          <div className="grid min-h-[610px] min-w-0 grid-cols-1 lg:grid-cols-[clamp(180px,18vw,210px)_minmax(0,1fr)_clamp(260px,24vw,300px)]">
            <div className="hidden min-w-0 overflow-hidden bg-white lg:block">
              <ModuleCatalog search={search} onSearch={setSearch} onAdd={addModule} />
            </div>
            <div ref={canvasRef} className="relative min-h-[610px] min-w-0 overflow-hidden border-y border-slate-200 bg-[#fbfbfd] lg:border-x lg:border-y-0">
              {active ? (
                <ReactFlow<CanvasNode, Edge>
                  nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                  onNodeClick={(_, node) => selectCanvasNode(node.id)} onInit={setReactFlowInstance} fitView minZoom={0.35} maxZoom={1.8}
                  defaultEdgeOptions={{ animated: true, style: { stroke: "#8b7cf6", strokeWidth: 1.6 } }}
                  className="automation-flow"
                >
                  <Background color="#d9d9e5" gap={20} size={1} />
                  <MiniMap pannable zoomable nodeColor="#8b7cf6" className="hidden sm:block !border !border-slate-200 !bg-white" />
                  <Controls showInteractive={false} className="!overflow-hidden !rounded-xl !border-slate-200 !shadow-sm" />
                </ReactFlow>
              ) : (
                <EmptyCanvas onCreate={openCreateForm} />
              )}
            </div>
            <div className="hidden min-w-0 overflow-hidden bg-white lg:block">
              <ScenarioInspector
                scenario={active} selectedNode={selectedNode?.data.scenarioNode || null}
                credentials={credentials} connectedOauthApps={connectedOauthApps} oauthConnections={oauthConnections}
                onNodeChange={updateSelectedNode} onDeleteNode={deleteSelectedNode}
                onOpenConnections={() => setActiveTab("connections")}
              />
            </div>
          </div>

          <ResponsiveAutomationPanel
            open={catalogOpen}
            title="앱 추가"
            side="left"
            onClose={() => setCatalogOpen(false)}
            returnFocusRef={catalogButtonRef}
          >
            <ModuleCatalog search={search} onSearch={setSearch} onAdd={addModuleFromResponsivePanel} />
          </ResponsiveAutomationPanel>
          <ResponsiveAutomationPanel
            open={inspectorOpen}
            title="모듈 설정"
            side="right"
            onClose={() => setInspectorOpen(false)}
            returnFocusRef={inspectorButtonRef}
          >
            <ScenarioInspector
              scenario={active} selectedNode={selectedNode?.data.scenarioNode || null}
              credentials={credentials} connectedOauthApps={connectedOauthApps} oauthConnections={oauthConnections}
              onNodeChange={updateSelectedNode} onDeleteNode={deleteSelectedNode}
              onOpenConnections={() => { setInspectorOpen(false); setActiveTab("connections"); }}
            />
          </ResponsiveAutomationPanel>
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-sm"><div className="flex flex-wrap items-center gap-3"><span className="text-[11px] font-bold text-slate-600">승인 알림 채널</span>{[["in_app", "앱 내부"], ["email", "이메일"], ["slack", "Slack"], ["browser", "브라우저"], ["mobile_push", "모바일 푸시"]].map(([value, label]) => <label key={value} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><input type="checkbox" checked={notificationChannels.includes(value)} onChange={(event) => setNotificationChannels((current) => event.target.checked ? [...new Set([...current, value])] : current.filter((item) => item !== value))} />{label}</label>)}</div><p className="mt-2 text-[10px] text-slate-400">‘승인 없이 자동 실행’을 선택해도 high 및 critical 작업은 항상 1차 경고와 최종 승인을 거칩니다.</p></section>

        <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">추천 템플릿</h2><span className="text-xs font-semibold text-violet-600">모두 보기</span></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {templates.map((template) => <TemplateCard key={template.title} {...template} onUse={() => void createFromPrompt(template.prompt)} />)}
          </div>
        </section>

        <div className="rounded-[18px] border border-violet-100 bg-violet-50/70 p-3">
          <form ref={createFormRef} onSubmit={(event) => { event.preventDefault(); void createFromPrompt(); }} className="grid min-w-0 gap-3 md:grid-cols-[minmax(150px,0.7fr)_minmax(180px,1fr)_minmax(240px,1.8fr)_auto] md:items-end">
            <label className="grid gap-1 text-[10px] font-bold text-violet-700">
              시나리오 제목
              <input ref={titleInputRef} value={draftTitle} maxLength={100} onChange={(event) => setDraftTitle(event.target.value)} placeholder="예: 고객 이메일 분석" className="h-10 min-w-0 rounded-xl border border-violet-100 bg-white px-3 text-xs text-slate-900 outline-none focus:border-violet-400" />
            </label>
            <label className="grid gap-1 text-[10px] font-bold text-violet-700">
              시나리오 설명
              <input value={draftDescription} maxLength={500} onChange={(event) => setDraftDescription(event.target.value)} placeholder="이 자동화의 목적" className="h-10 min-w-0 rounded-xl border border-violet-100 bg-white px-3 text-xs text-slate-900 outline-none focus:border-violet-400" />
            </label>
            <label className="grid gap-1 text-[10px] font-bold text-violet-700">
              자동화 요청
              <span className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-violet-100 bg-white px-3">
                <WandSparkles className="shrink-0 text-violet-600" size={16} />
                <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="예: Gmail을 요약해서 Notion에 저장해줘" className="min-w-0 flex-1 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400" />
              </span>
            </label>
            <button type="submit" disabled={busy} className="min-h-10 shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">AI로 만들기</button>
          </form>
        </div>

        <AiAnalysisCard />
      </> : null}
      {activeTab === "templates" ? <TemplateGallery onUse={(value) => { setActiveTab("scenario"); void createFromPrompt(value); }} /> : null}
      {activeTab === "runs" ? <DurableRunHistory /> : null}
      {activeTab === "approvals" ? <ApprovalCenter /> : null}
      {activeTab === "connections" ? <div><DurableConnectionPanel /><ConnectionManager credentials={credentials} onSave={addStructuredCredential} /></div> : null}
      {activeTab === "guide" ? <AutomationActionGuide /> : null}
      {notice ? <p className="fixed bottom-5 right-6 z-50 max-w-sm rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold leading-5 text-white shadow-xl">{notice}</p> : null}
    </div>
  );
}

type AnalysisData = {
  generatedAt: string;
  results: Array<{
    id: string;
    executionId: string;
    workflowId: string;
    workflowName: string;
    workflowVersion: number;
    nodeId: string;
    appId: "ai" | "openai";
    actionId: string;
    output: Record<string, unknown>;
    completedAt: string;
  }>;
};

function AiAnalysisCard() {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/automation/analysis", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { analysis?: AnalysisData; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error || "분석을 불러오지 못했습니다.");
      setAnalysis(data.analysis);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "분석을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-600" />
          <h2 className="text-sm font-bold text-slate-950">AI 자동화 분석</h2>
          {analysis ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              실제 AI 모듈 결과 {analysis.results.length}개
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {loading && !analysis ? (
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-slate-50" aria-hidden />
      ) : null}

      {analysis && analysis.results.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-slate-600">아직 완료된 AI 모듈 분석 결과가 없습니다.</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">시나리오에 AI 분석 또는 OpenAI 모듈을 넣고 실행하면 실제 출력이 여기에 표시됩니다.</p>
        </div>
      ) : null}

      {analysis && analysis.results.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {analysis.results.map((result) => (
            <article key={result.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <AppLogo appId={result.appId} size={30} color="#6d5dfc" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{result.workflowName}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{result.actionId} · 실행 {result.executionId.slice(0, 8)}</p>
                </div>
                <time className="shrink-0 text-[9px] text-slate-400" dateTime={result.completedAt}>
                  {new Date(result.completedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
              <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-slate-700">
                {formatAiResultOutput(result.output)}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatAiResultOutput(output: Record<string, unknown>) {
  for (const key of ["text", "summary", "analysis", "result", "content"]) {
    if (typeof output[key] === "string" && output[key].trim()) return output[key];
  }
  return JSON.stringify(output, null, 2);
}

function AutomationHeader({ busy, onCreate, onGuide }: { busy: boolean; onCreate: () => void; onGuide: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-4 pt-1"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Zap size={23} /></div><div><h1 className="text-2xl font-bold text-slate-950">Automation</h1><p className="mt-1 text-sm text-slate-500">앱을 연결하고 반복 업무를 자동화하세요</p></div></div><div className="flex gap-2"><button type="button" onClick={onGuide} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">가이드 보기</button><button type="button" onClick={onCreate} disabled={busy} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-200"><Plus size={15} />새 시나리오</button></div></header>;
}

function ScenarioPicker({ scenarios, active, onSelect }: { scenarios: AutomationScenario[]; active: AutomationScenario | null; onSelect: (scenario: AutomationScenario) => void }) {
  return <label className="relative flex max-w-[360px] min-w-0 items-center"><select value={active?.id || ""} onChange={(event) => { const next = scenarios.find((item) => item.id === event.target.value); if (next) onSelect(next); }} className="h-9 min-w-0 appearance-none truncate rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-xs font-bold text-slate-800 outline-none"><option value="">시나리오를 선택하세요</option>{scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 text-slate-400" size={14} /></label>;
}

function ToolbarButton({ icon: Icon, label, onClick, disabled, danger = false }: { icon: typeof Play; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-40 ${danger ? "border-red-100 text-red-600 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:border-violet-200 hover:text-violet-600"}`}><Icon size={14} />{label}</button>;
}

function ModuleCatalog({ search, onSearch, onAdd }: { search: string; onSearch: (value: string) => void; onAdd: (item: AutomationModule) => void }) {
  const modules = AUTOMATION_MODULES.filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className="min-w-0 overflow-hidden bg-white"><div className="border-b border-slate-100 p-3"><h2 className="text-xs font-bold text-slate-900">기본 모듈</h2><label className="mt-3 flex h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={14} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="모듈 검색" className="min-w-0 flex-1 text-xs outline-none" /></label></div><div className="max-h-[510px] overflow-y-auto p-2 app-scrollbar">{["app", "ai", "tool"].map((category) => <div key={category} className="mb-3"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{category === "app" ? "앱" : category === "ai" ? "AI" : "도구"}</p>{modules.filter((item) => item.category === category).map((item) => <button type="button" key={item.id} onClick={() => onAdd(item)} className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-violet-50"><AppLogo appId={item.id} size={28} color={item.color} /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 group-hover:text-violet-700">{item.label}</span><Plus size={13} className="shrink-0 text-slate-300 group-hover:text-violet-500" /></button>)}</div>)}</div></aside>;
}

function ScenarioInspector({ scenario, selectedNode, credentials, connectedOauthApps, oauthConnections, onNodeChange, onDeleteNode, onOpenConnections }: { scenario: AutomationScenario | null; selectedNode: ScenarioNode | null; credentials: PublicAutomationCredential[]; connectedOauthApps: Map<string, string | null>; oauthConnections: OAuthConnectionOption[]; onNodeChange: (patch: Partial<ScenarioNode>) => void; onDeleteNode: () => void; onOpenConnections: () => void }) {
  const matchingCredentials = credentials.filter((item) => !selectedNode || item.appId === selectedNode.appId);
  const selectedModule = selectedNode ? AUTOMATION_MODULES.find((item) => item.id === selectedNode.appId) || AUTOMATION_MODULES[0]! : null;
  const app = selectedNode ? getAutomationApp(selectedNode.appId) : null;
  const oauthConnected = selectedNode ? connectedOauthApps.has(selectedNode.appId) : false;
  const oauthAccountLabel = selectedNode ? connectedOauthApps.get(selectedNode.appId) || null : null;
  const matchingOauthConnections = oauthConnections.filter((connection) => selectedNode && connection.appId === selectedNode.appId && connection.status === "connected");
  const selectedAction = selectedNode?.actionId
    ? getActionDefinition(selectedNode.appId, selectedNode.actionId, selectedNode.actionVersion || undefined)
    : null;
  function openConnectionSetup() {
    if (app?.supportedAuthModes.length === 1 && app.supportedAuthModes[0] === "oauth") {
      window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "integrations", connectorId: app.id } }));
      return;
    }
    onOpenConnections();
  }
  async function copyNodeId() {
    if (!selectedNode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(selectedNode.id);
  }
  return <aside className="min-w-0 overflow-hidden bg-white p-4">
<div className="flex items-center justify-between">
<h2 className="truncate text-sm font-bold text-slate-950">{selectedNode ? "모듈 설정" : "시나리오 정보"}</h2>
<MoreVertical size={16} className="shrink-0 text-slate-400" />
</div>{selectedNode && selectedModule ? <div className="mt-5 space-y-4">
<div className="flex min-w-0 items-center gap-3">
<AppLogo appId={selectedModule.id} size={40} color={selectedModule.color} />
<div className="min-w-0">
<p className="truncate text-sm font-bold text-slate-900">{selectedNode.label}</p>
<p className="truncate text-xs text-slate-400">{selectedNode.operation}</p>
</div>
</div>
<div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-bold text-slate-500">노드 ID</p><p className="mt-1 truncate font-mono text-[10px] text-slate-700" title={selectedNode.id}>{selectedNode.id}</p></div><button type="button" onClick={() => void copyNodeId()} className="min-h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-violet-600">복사</button></div><p className="mt-2 text-[10px] leading-4 text-slate-400">출력 매핑에서 steps.노드ID.필드 형식으로 사용합니다.</p></div>
<InspectorField label="모듈 이름" value={selectedNode.label} onChange={(label) => onNodeChange({ label })} />
{selectedNode.appId !== "filter" ? (
  <ActionPicker
    appId={selectedNode.appId}
    actionId={selectedNode.actionId}
    actionVersion={selectedNode.actionVersion}
    onChange={({ actionId, actionVersion }) => onNodeChange(changeScenarioAction(selectedNode, actionId, actionVersion))}
  />
) : null}
{selectedAction && selectedNode.appId !== "schedule" ? (
  <ActionInputForm definition={selectedAction} value={selectedNode.config} scenario={scenario} nodeId={selectedNode.id} onChange={(config) => onNodeChange({ config })} />
) : null}
{selectedAction ? <ActionPreviewCard appId={selectedNode.appId} actionId={selectedAction.id} actionVersion={selectedAction.version} input={selectedNode.config} /> : null}
{selectedNode.appId === "schedule" ? <ScheduleEditor config={selectedNode.config} onChange={(config) => onNodeChange({ config })} /> : null}
{selectedNode.appId === "filter" || selectedNode.appId === "router" ? <FilterEditor appId={selectedNode.appId} config={selectedNode.config} onChange={(config) => onNodeChange({ config })} /> : null}
{selectedNode.appId === "webhook" && scenario ? <WebhookPanel scenarioId={scenario.id} /> : null}
{selectedNode.requiresCredential ? <div>
<label className="text-[11px] font-bold text-slate-500">검증된 계정 / API 키</label>
<select value={selectedNode.credentialId || ""} onChange={(event) => onNodeChange({ credentialId: event.target.value || null })} className="mt-2 h-10 w-full min-w-0 truncate rounded-xl border border-slate-200 px-3 text-xs outline-none">
<option value="">{oauthConnected ? "사용할 연결 계정을 선택하세요" : "연결 필요"}</option>{matchingOauthConnections.map((connection) => <option key={connection.id} value={connection.id}>OAuth · {connection.accountLabel || connection.accountEmail || connection.id}</option>)}
{matchingCredentials.filter((item) => item.verificationStatus === "verified").map((item) => <option key={item.id} value={item.id}>{item.accountLabel || item.label} · {item.masked}</option>)}</select>{oauthConnected ? <p className="mt-2 rounded-xl bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-700">Integrations에서 OAuth로 연결된 계정{oauthAccountLabel ? ` (${oauthAccountLabel})` : ""}이 이 모듈에서 바로 사용됩니다.</p> : <div className="mt-3 rounded-xl bg-slate-50 p-3">
<p className="text-[11px] leading-5 text-slate-600">앱별 정확한 키 항목 또는 OAuth를 연결 관리에서 인증하세요.</p>
<button type="button" onClick={openConnectionSetup} className="mt-2 flex h-9 w-full items-center justify-center rounded-lg bg-violet-600 text-[11px] font-bold text-white">연결 관리에서 인증</button>
</div>}</div> : <p className="rounded-xl bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-700">이 모듈은 별도 API 키 없이 DREAMWISH 내부에서 실행됩니다.</p>}<button type="button" onClick={onDeleteNode} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-100 text-xs font-bold text-red-600 hover:bg-red-50">
<Trash2 size={14} />모듈 삭제</button>
</div> : <ScenarioSummary scenario={scenario} credentials={credentials} />}</aside>;
}

function ScenarioSummary({ scenario, credentials }: { scenario: AutomationScenario | null; credentials: PublicAutomationCredential[] }) {
  if (!scenario) return <p className="mt-5 break-keep text-xs leading-6 text-slate-500">새 시나리오를 만들면 설정과 실행 정보가 여기에 표시됩니다.</p>;
  const rate = scenario.runs ? Math.round((scenario.successfulRuns / scenario.runs) * 1000) / 10 : 0;
  return <div className="mt-5 space-y-5"><div className="min-w-0 rounded-xl border border-slate-200 p-3"><p className="break-words text-xs font-bold leading-5 text-slate-900">{scenario.name}</p><p className="mt-1 line-clamp-3 break-words text-[11px] leading-5 text-slate-500">{scenario.description}</p></div><dl className="space-y-3 text-xs"><SummaryRow label="상태" value={scenario.status === "active" ? "활성화" : "일시 중지"} /><SummaryRow label="실행 횟수" value={`${scenario.runs}회`} /><SummaryRow label="성공률" value={`${rate}%`} /><SummaryRow label="연결 모듈" value={`${scenario.nodes.length}개`} /></dl><div><p className="text-[11px] font-bold text-slate-500">API & 키값 관리</p><div className="mt-2 space-y-2">{credentials.length ? credentials.slice(0, 5).map((item) => <div key={item.id} className="min-w-0 rounded-xl border border-slate-100 p-2.5"><p className="truncate text-[11px] font-bold text-slate-700">{item.label}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{item.masked}</p></div>) : <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">모듈을 선택한 뒤 사용자가 API 키를 직접 등록할 수 있습니다.</p>}</div></div></div>;
}

function ScenarioModuleNode({ data, selected }: NodeProps<CanvasNode>) {
  const item = AUTOMATION_MODULES.find((module) => module.id === data.scenarioNode.appId) || AUTOMATION_MODULES[0]!;
  return <div className={`relative w-[154px] rounded-2xl border bg-white px-3 py-3 shadow-lg shadow-slate-200/50 transition ${selected ? "border-violet-500 ring-4 ring-violet-100" : "border-slate-200"}`}><Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-violet-500" /><span className="absolute -left-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ backgroundColor: item.color }}>{data.order + 1}</span><div className="flex items-center gap-2"><AppLogo appId={item.id} size={40} color={item.color} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900" title={data.scenarioNode.label}>{data.scenarioNode.label}</p><p className="mt-1 line-clamp-2 break-words text-[10px] leading-4 text-slate-500">{data.scenarioNode.operation}</p></div></div>{data.scenarioNode.requiresCredential && !data.scenarioNode.credentialId && !data.oauthConnected ? <span className="mt-2 block truncate rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">연결 필요</span> : null}{data.scenarioNode.requiresCredential && !data.scenarioNode.credentialId && data.oauthConnected ? <span className="mt-2 block truncate rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">OAuth 연결됨</span> : null}<Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-violet-500" /></div>;
}

function InspectorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block min-w-0"><span className="text-[11px] font-bold text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-violet-400" /></label>; }

function FilterEditor({ appId, config, onChange }: { appId: string; config: ScenarioConfig; onChange: (config: ScenarioConfig) => void }) {
  const field = "mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-2.5 text-xs outline-none";
  const patch = (next: Record<string, string | number | boolean>) => onChange({ ...config, ...next });
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-bold text-slate-500">{appId === "filter" ? "필터 조건" : "라우터 분기 기준"}</p>
      <label className="mt-2 block text-[10px] font-semibold text-slate-500">값 경로
        <input value={String(config.path || "")} placeholder="예: trigger.email.from 또는 steps.노드ID.output.x" onChange={(event) => patch({ path: event.target.value })} className={field} />
      </label>
      {appId === "filter" ? (
        <>
          <label className="mt-2 block text-[10px] font-semibold text-slate-500">연산자
            <select value={String(config.operator || "contains")} onChange={(event) => patch({ operator: event.target.value })} className={field}>
              {["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "gt", "lt", "gte", "lte", "is_empty", "is_not_empty", "exists", "not_exists", "regex"].map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </select>
          </label>
          <label className="mt-2 block text-[10px] font-semibold text-slate-500">비교 값
            <input value={String(config.value ?? "")} onChange={(event) => patch({ value: event.target.value })} className={field} />
          </label>
          <p className="mt-2 text-[10px] leading-4 text-slate-500">조건이 거짓이면 이후 경로는 오류가 아니라 건너뜀으로 처리됩니다.</p>
        </>
      ) : (
        <p className="mt-2 text-[10px] leading-4 text-slate-500">연결선의 라벨과 값이 일치하는 분기가 실행됩니다. 라벨 없는 연결선은 기본 경로입니다.</p>
      )}
    </div>
  );
}

function WebhookPanel({ scenarioId }: { scenarioId: string }) {
  const [webhook, setWebhook] = useState<{ id: string; secret: string; active: boolean; requestCount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/automation/webhooks?scenarioId=${encodeURIComponent(scenarioId)}`);
      const data = (await response.json().catch(() => ({}))) as { webhooks?: Array<{ id: string; secret: string; active: boolean; requestCount: number }> };
      if (response.ok) setWebhook(data.webhooks?.[0] || null);
    })();
  }, [scenarioId]);

  async function issue() {
    setBusy(true);
    try {
      const response = await fetch("/api/automation/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId })
      });
      const data = (await response.json().catch(() => ({}))) as { webhook?: { id: string; secret: string; active: boolean; requestCount: number } };
      if (response.ok && data.webhook) setWebhook(data.webhook);
    } finally { setBusy(false); }
  }

  async function toggleActive() {
    if (!webhook) return;
    const response = await fetch("/api/automation/webhooks", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhookId: webhook.id, active: !webhook.active })
    });
    const data = (await response.json().catch(() => ({}))) as { webhook?: typeof webhook };
    if (response.ok && data.webhook) setWebhook(data.webhook);
  }

  const url = webhook ? `${window.location.origin}/api/webhooks/automation/${webhook.id}` : "";
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-bold text-slate-500">커스텀 웹훅 트리거</p>
      {webhook ? (
        <div className="mt-2 space-y-2">
          <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[10px] text-slate-700">{url}</p>
          <p className="text-[10px] text-slate-500">헤더 <span className="font-mono">X-Webhook-Secret</span> 또는 <span className="font-mono">X-Signature-256</span>(HMAC-SHA256)으로 인증 · 수신 {webhook.requestCount}회</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { void navigator.clipboard.writeText(`${url}\nX-Webhook-Secret: ${webhook.secret}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[10px] font-bold text-slate-600">{copied ? "복사됨" : "URL+Secret 복사"}</button>
            <button type="button" onClick={() => void toggleActive()} className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${webhook.active ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{webhook.active ? "활성" : "비활성"}</button>
          </div>
          <p className="text-[10px] leading-4 text-slate-500">시나리오가 활성 상태이고 웹훅이 활성일 때, JSON POST 수신 즉시 실행 기록이 생성됩니다. 같은 <span className="font-mono">X-Event-Id</span>는 한 번만 처리됩니다.</p>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => void issue()} className="mt-2 h-9 w-full rounded-lg bg-violet-600 text-[11px] font-bold text-white disabled:opacity-50">웹훅 URL 발급</button>
      )}
    </div>
  );
}

function ScheduleEditor({ config, onChange }: { config: ScenarioConfig; onChange: (config: ScenarioConfig) => void }) {
  const kind = String(config.scheduleKind || "daily");
  const time = /^\d{2}:\d{2}$/u.test(String(config.scheduleTime)) ? String(config.scheduleTime) : "09:00";
  const weekday = Number.isFinite(Number(config.scheduleWeekday)) ? Number(config.scheduleWeekday) : 1;
  const intervalMinutes = Number.isFinite(Number(config.scheduleIntervalMinutes)) ? Number(config.scheduleIntervalMinutes) : 60;
  const onceAt = typeof config.scheduleOnceAt === "string" ? config.scheduleOnceAt : "";
  const timezone = String(config.scheduleTimezone || readStoredTimezonePreference(window.localStorage));
  const patch = (next: Record<string, string | number | boolean>) =>
    onChange({ ...config, scheduleKind: kind, scheduleTime: time, scheduleWeekday: weekday, scheduleIntervalMinutes: intervalMinutes, scheduleOnceAt: onceAt, scheduleTimezone: timezone, ...next });
  const select = "mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-2.5 text-xs outline-none";
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[11px] font-bold text-slate-500">시간 설정 (예약 실행)</p>
      <label className="mt-2 block text-[10px] font-semibold text-slate-500">반복 주기
        <select value={kind} onChange={(event) => patch({ scheduleKind: event.target.value })} className={select}>
          <option value="daily">매일</option>
          <option value="weekdays">평일만</option>
          <option value="weekly">매주 특정 요일</option>
          <option value="interval">일정 간격</option>
          <option value="once">특정 날짜와 시간 (1회)</option>
        </select>
      </label>
      {kind === "weekly" ? (
        <label className="mt-2 block text-[10px] font-semibold text-slate-500">요일
          <select value={weekday} onChange={(event) => patch({ scheduleWeekday: Number(event.target.value) })} className={select}>
            {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => <option key={label} value={index}>{label}요일</option>)}
          </select>
        </label>
      ) : null}
      {kind === "interval" ? (
        <label className="mt-2 block text-[10px] font-semibold text-slate-500">간격(분)
          <input value={intervalMinutes} inputMode="numeric" onChange={(event) => patch({ scheduleIntervalMinutes: Number(event.target.value) || 60 })} className={select} />
        </label>
      ) : null}
      {kind === "once" ? (
        <label className="mt-2 block text-[10px] font-semibold text-slate-500">실행 시각
          <input type="datetime-local" value={onceAt.slice(0, 16)} onChange={(event) => patch({ scheduleOnceAt: event.target.value ? new Date(event.target.value).toISOString() : "" })} className={select} />
        </label>
      ) : null}
      {kind !== "interval" && kind !== "once" ? (
        <label className="mt-2 block text-[10px] font-semibold text-slate-500">시간
          <input type="time" value={time} onChange={(event) => patch({ scheduleTime: event.target.value })} className={select} />
        </label>
      ) : null}
      <label className="mt-2 block text-[10px] font-semibold text-slate-500">시간대 (IANA)
        <input value={timezone} placeholder="예: Asia/Seoul (비우면 시스템)" onChange={(event) => patch({ scheduleTimezone: event.target.value })} className={select} />
      </label>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <label className="flex items-center gap-2 text-[10px] font-semibold text-slate-600">
          <input type="checkbox" checked={config.watchGmail === true} onChange={(event) => patch({ watchGmail: event.target.checked })} className="h-3.5 w-3.5 accent-[#7c3aed]" />
          Gmail 새 메일 감지 (예약 주기마다 폴링)
        </label>
        {config.watchGmail === true ? (
          <>
            <label className="mt-2 block text-[10px] font-semibold text-slate-500">발신자 필터 (선택)
              <input value={String(config.gmailFrom || "")} placeholder="예: client@acme.com" onChange={(event) => patch({ gmailFrom: event.target.value })} className={select} />
            </label>
            <label className="mt-2 block text-[10px] font-semibold text-slate-500">제목 포함 (선택)
              <input value={String(config.gmailSubject || "")} placeholder="예: 견적" onChange={(event) => patch({ gmailSubject: event.target.value })} className={select} />
            </label>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">새 메일이 있을 때만 실행되며, 메일 데이터는 {"{{trigger.email.from}}"} · {"{{trigger.email.subject}}"} · {"{{trigger.email.snippet}}"} 으로 다음 노드에서 사용할 수 있습니다. Gmail 읽기 권한 OAuth 연결이 필요합니다.</p>
          </>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">저장하면 다음 실행 시각이 계산되고 5분 주기 스케줄러가 해당 시각에 자동으로 실행합니다. 외부 전송 단계는 승인 후에만 실제 발송됩니다.</p>
    </div>
  );
}
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 items-center justify-between gap-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 truncate font-bold text-slate-800">{value}</dd></div>; }
function EmptyCanvas({ onCreate }: { onCreate: () => void }) { return <div className="absolute inset-0 flex items-center justify-center"><div className="max-w-xs text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Bot size={25} /></div><h2 className="mt-4 text-base font-bold text-slate-900">첫 시나리오를 만들어보세요</h2><p className="mt-2 break-keep text-xs leading-6 text-slate-500">AI에게 원하는 자동화를 말하거나 왼쪽 모듈을 연결해 시작할 수 있습니다.</p><button type="button" onClick={onCreate} className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white">AI로 초안 만들기</button></div></div>; }
function TemplateCard({ title, chain, onUse }: { title: string; prompt: string; chain: string[]; onUse: () => void }) { return <article className="min-w-0 rounded-2xl border border-slate-200 p-3"><div className="flex items-center gap-1.5">{chain.map((id, index) => { const item = AUTOMATION_MODULES.find((module) => module.id === id) || AUTOMATION_MODULES[0]!; return <span key={`${id}-${index}`} className="flex items-center gap-1.5"><AppLogo appId={item.id} size={28} color={item.color} />{index < chain.length - 1 ? <span className="text-slate-300">→</span> : null}</span>; })}</div><p className="mt-3 truncate text-xs font-bold text-slate-900" title={title}>{title}</p><button type="button" onClick={onUse} className="mt-3 h-8 w-full rounded-lg border border-violet-100 text-[11px] font-bold text-violet-600 hover:bg-violet-50">사용하기</button></article>; }

function toCanvasNodes(nodes: ScenarioNode[]): CanvasNode[] { return nodes.map(toCanvasNode); }
function toCanvasNode(scenarioNode: ScenarioNode, order: number): CanvasNode { return { id: scenarioNode.id, type: "scenarioModule", position: scenarioNode.position, data: { scenarioNode, order } }; }
