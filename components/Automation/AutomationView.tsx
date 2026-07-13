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
  type NodeProps
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  Check,
  ChevronDown,
  CirclePlay,
  KeyRound,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUTOMATION_MODULES,
  createScenarioNode,
  type AutomationModule,
  type AutomationScenario,
  type ScenarioNode
} from "@/src/lib/automation/scenario-designer";
import type { PublicAutomationCredential } from "@/src/lib/automation/credential.repository";

type CanvasData = { scenarioNode: ScenarioNode; order: number };
type CanvasNode = Node<CanvasData, "scenarioModule">;

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
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  useEffect(() => { void loadWorkspace(); }, []);

  async function loadWorkspace(preferredId?: string) {
    const [scenarioResponse, credentialResponse] = await Promise.all([
      fetch("/api/automation/scenarios"),
      fetch("/api/automation/credentials")
    ]);
    const scenarioData = (await scenarioResponse.json().catch(() => ({}))) as { scenarios?: AutomationScenario[] };
    const credentialData = (await credentialResponse.json().catch(() => ({}))) as { credentials?: PublicAutomationCredential[] };
    const nextScenarios = scenarioData.scenarios || [];
    setScenarios(nextScenarios);
    setCredentials(credentialData.credentials || []);
    const next = nextScenarios.find((scenario) => scenario.id === preferredId) || nextScenarios[0] || null;
    selectScenario(next);
  }

  function selectScenario(scenario: AutomationScenario | null) {
    setActive(scenario);
    setSelectedNodeId(null);
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
        body: JSON.stringify({ prompt: value.trim() || "매일 오전 9시에 오늘 일정을 요약해줘" })
      });
      const data = (await response.json()) as { scenario?: AutomationScenario; error?: string };
      if (!response.ok || !data.scenario) throw new Error(data.error || "시나리오를 만들지 못했습니다.");
      setPrompt("");
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
    const response = await fetch(`/api/automation/scenarios/${scenario.id}/run`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { scenario?: AutomationScenario; issues?: Array<{ message: string }>; error?: string };
    setBusy(false);
    if (!response.ok) { setNotice(data.issues?.map((issue) => issue.message).join(" · ") || data.error || "실행하지 못했습니다."); return; }
    await loadWorkspace(scenario.id);
    setNotice("모든 모듈을 순서대로 실행했습니다.");
  }

  async function toggleActive() {
    if (!active) return;
    const status = active.status === "active" ? "paused" : "active";
    const response = await fetch(`/api/automation/scenarios/${active.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status })
    });
    if (response.ok) await loadWorkspace(active.id);
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

  function deleteSelectedNode() {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) => current.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  async function addCredential(input: { appId: string; label: string; secret: string }) {
    const response = await fetch("/api/automation/credentials", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
    });
    const data = (await response.json().catch(() => ({}))) as { credential?: PublicAutomationCredential; error?: string };
    if (!response.ok || !data.credential) throw new Error(data.error || "API 키를 저장하지 못했습니다.");
    setCredentials((current) => [data.credential!, ...current]);
    if (selectedNode?.data.scenarioNode.appId === input.appId) updateSelectedNode({ credentialId: data.credential.id });
  }

  return (
    <div className="space-y-5 pb-3">
      <AutomationHeader busy={busy} onCreate={() => void createFromPrompt("새 자동화 시나리오")} />
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-200 text-xs font-semibold text-slate-500">
        {["시나리오", "템플릿", "실행 내역", "연결 관리", "사용 가이드"].map((tab, index) => (
          <button key={tab} type="button" className={`shrink-0 border-b-2 px-4 py-3 ${index === 0 ? "border-violet-600 text-violet-600" : "border-transparent hover:text-slate-900"}`}>{tab}</button>
        ))}
      </div>

      <section className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <ScenarioPicker scenarios={scenarios} active={active} onSelect={selectScenario} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
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

        <div className="grid min-h-[610px] min-w-0 grid-cols-1 xl:grid-cols-[210px_minmax(0,1fr)_300px]">
          <ModuleCatalog search={search} onSearch={setSearch} onAdd={addModule} />
          <div className="relative min-h-[610px] min-w-0 overflow-hidden border-y border-slate-200 bg-[#fbfbfd] xl:border-x xl:border-y-0">
            {active ? (
              <ReactFlow<CanvasNode, Edge>
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)} fitView minZoom={0.35} maxZoom={1.8}
                defaultEdgeOptions={{ animated: true, style: { stroke: "#8b7cf6", strokeWidth: 1.6 } }}
                className="automation-flow"
              >
                <Background color="#d9d9e5" gap={20} size={1} />
                <MiniMap pannable zoomable nodeColor="#8b7cf6" className="!border !border-slate-200 !bg-white" />
                <Controls showInteractive={false} className="!overflow-hidden !rounded-xl !border-slate-200 !shadow-sm" />
              </ReactFlow>
            ) : (
              <EmptyCanvas onCreate={() => void createFromPrompt()} />
            )}
          </div>
          <ScenarioInspector
            scenario={active} selectedNode={selectedNode?.data.scenarioNode || null}
            credentials={credentials} onNodeChange={updateSelectedNode} onDeleteNode={deleteSelectedNode}
            onAddCredential={addCredential}
          />
        </div>
      </section>

      <section className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">추천 템플릿</h2><span className="text-xs font-semibold text-violet-600">모두 보기</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {templates.map((template) => <TemplateCard key={template.title} {...template} onUse={() => void createFromPrompt(template.prompt)} />)}
        </div>
      </section>

      <div className="rounded-[18px] border border-violet-100 bg-violet-50/70 p-3">
        <form onSubmit={(event) => { event.preventDefault(); void createFromPrompt(); }} className="flex min-w-0 items-center gap-3">
          <WandSparkles className="shrink-0 text-violet-600" size={18} />
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="AI Chat처럼 말해보세요. 예: 새 Gmail을 요약해서 Slack에 보내줘" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          <button type="submit" disabled={busy} className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">AI로 만들기</button>
        </form>
      </div>
      {notice ? <p className="fixed bottom-5 right-6 z-50 max-w-sm rounded-2xl bg-slate-950 px-4 py-3 text-xs font-semibold leading-5 text-white shadow-xl">{notice}</p> : null}
    </div>
  );
}

function AutomationHeader({ busy, onCreate }: { busy: boolean; onCreate: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-4 pt-1"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"><Zap size={23} /></div><div><h1 className="text-2xl font-bold text-slate-950">Automation</h1><p className="mt-1 text-sm text-slate-500">앱을 연결하고 반복 업무를 자동화하세요</p></div></div><div className="flex gap-2"><button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">가이드 보기</button><button type="button" onClick={onCreate} disabled={busy} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-violet-200"><Plus size={15} />새 시나리오</button></div></header>;
}

function ScenarioPicker({ scenarios, active, onSelect }: { scenarios: AutomationScenario[]; active: AutomationScenario | null; onSelect: (scenario: AutomationScenario) => void }) {
  return <label className="relative flex max-w-[360px] min-w-0 items-center"><select value={active?.id || ""} onChange={(event) => { const next = scenarios.find((item) => item.id === event.target.value); if (next) onSelect(next); }} className="h-9 min-w-0 appearance-none truncate rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-xs font-bold text-slate-800 outline-none"><option value="">시나리오를 선택하세요</option>{scenarios.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 text-slate-400" size={14} /></label>;
}

function ToolbarButton({ icon: Icon, label, onClick, disabled, danger = false }: { icon: typeof Play; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition disabled:opacity-40 ${danger ? "border-red-100 text-red-600 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:border-violet-200 hover:text-violet-600"}`}><Icon size={14} />{label}</button>;
}

function ModuleCatalog({ search, onSearch, onAdd }: { search: string; onSearch: (value: string) => void; onAdd: (item: AutomationModule) => void }) {
  const modules = AUTOMATION_MODULES.filter((item) => `${item.label} ${item.id}`.toLowerCase().includes(search.toLowerCase()));
  return <aside className="min-w-0 overflow-hidden bg-white"><div className="border-b border-slate-100 p-3"><h2 className="text-xs font-bold text-slate-900">기본 모듈</h2><label className="mt-3 flex h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={14} className="shrink-0 text-slate-400" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="모듈 검색" className="min-w-0 flex-1 text-xs outline-none" /></label></div><div className="max-h-[510px] overflow-y-auto p-2 app-scrollbar">{["app", "ai", "tool"].map((category) => <div key={category} className="mb-3"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{category === "app" ? "앱" : category === "ai" ? "AI" : "도구"}</p>{modules.filter((item) => item.category === category).map((item) => <button type="button" key={item.id} onClick={() => onAdd(item)} className="group flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-violet-50"><ModuleGlyph item={item} /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 group-hover:text-violet-700">{item.label}</span><Plus size={13} className="shrink-0 text-slate-300 group-hover:text-violet-500" /></button>)}</div>)}</div></aside>;
}

function ScenarioInspector({ scenario, selectedNode, credentials, onNodeChange, onDeleteNode, onAddCredential }: { scenario: AutomationScenario | null; selectedNode: ScenarioNode | null; credentials: PublicAutomationCredential[]; onNodeChange: (patch: Partial<ScenarioNode>) => void; onDeleteNode: () => void; onAddCredential: (input: { appId: string; label: string; secret: string }) => Promise<void> }) {
  const [secret, setSecret] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const matchingCredentials = credentials.filter((item) => !selectedNode || item.appId === selectedNode.appId);
  async function saveKey() { if (!selectedNode || !secret.trim()) return; setSaving(true); setError(null); try { await onAddCredential({ appId: selectedNode.appId, label: `${selectedNode.label} API`, secret }); setSecret(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했습니다."); } finally { setSaving(false); } }
  return <aside className="min-w-0 overflow-hidden bg-white p-4"><div className="flex items-center justify-between"><h2 className="truncate text-sm font-bold text-slate-950">{selectedNode ? "모듈 설정" : "시나리오 정보"}</h2><MoreVertical size={16} className="shrink-0 text-slate-400" /></div>{selectedNode ? <div className="mt-5 space-y-4"><div className="flex min-w-0 items-center gap-3"><ModuleGlyph item={AUTOMATION_MODULES.find((item) => item.id === selectedNode.appId) || AUTOMATION_MODULES[0]!} large /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{selectedNode.label}</p><p className="truncate text-xs text-slate-400">{selectedNode.operation}</p></div></div><InspectorField label="모듈 이름" value={selectedNode.label} onChange={(label) => onNodeChange({ label })} /><InspectorField label="실행 작업" value={selectedNode.operation} onChange={(operation) => onNodeChange({ operation })} />{selectedNode.requiresCredential ? <div><label className="text-[11px] font-bold text-slate-500">연결된 계정 / API 키</label><select value={selectedNode.credentialId || ""} onChange={(event) => onNodeChange({ credentialId: event.target.value || null })} className="mt-2 h-10 w-full min-w-0 truncate rounded-xl border border-slate-200 px-3 text-xs outline-none"><option value="">연결 필요</option>{matchingCredentials.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.masked}</option>)}</select><div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-[11px] font-bold text-slate-600"><KeyRound size={13} />새 API 키 추가</div><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="사용자가 직접 키 값 입력" className="mt-2 h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none" /><button type="button" onClick={() => void saveKey()} disabled={!secret.trim() || saving} className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-violet-600 text-[11px] font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}암호화하여 저장</button>{error ? <p className="mt-2 break-words text-[10px] leading-4 text-red-600">{error}</p> : null}</div></div> : <p className="rounded-xl bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-700">이 모듈은 별도 API 키 없이 DREAMWISH 내부에서 실행됩니다.</p>}<button type="button" onClick={onDeleteNode} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-100 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 size={14} />모듈 삭제</button></div> : <ScenarioSummary scenario={scenario} credentials={credentials} />}</aside>;
}

function ScenarioSummary({ scenario, credentials }: { scenario: AutomationScenario | null; credentials: PublicAutomationCredential[] }) {
  if (!scenario) return <p className="mt-5 break-keep text-xs leading-6 text-slate-500">새 시나리오를 만들면 설정과 실행 정보가 여기에 표시됩니다.</p>;
  const rate = scenario.runs ? Math.round((scenario.successfulRuns / scenario.runs) * 1000) / 10 : 0;
  return <div className="mt-5 space-y-5"><div className="min-w-0 rounded-xl border border-slate-200 p-3"><p className="break-words text-xs font-bold leading-5 text-slate-900">{scenario.name}</p><p className="mt-1 line-clamp-3 break-words text-[11px] leading-5 text-slate-500">{scenario.description}</p></div><dl className="space-y-3 text-xs"><SummaryRow label="상태" value={scenario.status === "active" ? "활성화" : "일시 중지"} /><SummaryRow label="실행 횟수" value={`${scenario.runs}회`} /><SummaryRow label="성공률" value={`${rate}%`} /><SummaryRow label="연결 모듈" value={`${scenario.nodes.length}개`} /></dl><div><p className="text-[11px] font-bold text-slate-500">API & 키값 관리</p><div className="mt-2 space-y-2">{credentials.length ? credentials.slice(0, 5).map((item) => <div key={item.id} className="min-w-0 rounded-xl border border-slate-100 p-2.5"><p className="truncate text-[11px] font-bold text-slate-700">{item.label}</p><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{item.masked}</p></div>) : <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">모듈을 선택한 뒤 사용자가 API 키를 직접 등록할 수 있습니다.</p>}</div></div></div>;
}

function ScenarioModuleNode({ data, selected }: NodeProps<CanvasNode>) {
  const item = AUTOMATION_MODULES.find((module) => module.id === data.scenarioNode.appId) || AUTOMATION_MODULES[0]!;
  return <div className={`relative w-[154px] rounded-2xl border bg-white px-3 py-3 shadow-lg shadow-slate-200/50 transition ${selected ? "border-violet-500 ring-4 ring-violet-100" : "border-slate-200"}`}><Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-violet-500" /><span className="absolute -left-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white shadow" style={{ backgroundColor: item.color }}>{data.order + 1}</span><div className="flex items-center gap-2"><ModuleGlyph item={item} large /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-900" title={data.scenarioNode.label}>{data.scenarioNode.label}</p><p className="mt-1 line-clamp-2 break-words text-[10px] leading-4 text-slate-500">{data.scenarioNode.operation}</p></div></div>{data.scenarioNode.requiresCredential && !data.scenarioNode.credentialId ? <span className="mt-2 block truncate rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">연결 필요</span> : null}<Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-violet-500" /></div>;
}

function ModuleGlyph({ item, large = false }: { item: AutomationModule; large?: boolean }) { return <span className={`flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ${large ? "h-10 w-10 text-sm" : "h-7 w-7 text-[10px]"}`} style={{ backgroundColor: item.color }}>{item.glyph}</span>; }
function InspectorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block min-w-0"><span className="text-[11px] font-bold text-slate-500">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-violet-400" /></label>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 items-center justify-between gap-3"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 truncate font-bold text-slate-800">{value}</dd></div>; }
function EmptyCanvas({ onCreate }: { onCreate: () => void }) { return <div className="absolute inset-0 flex items-center justify-center"><div className="max-w-xs text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><Bot size={25} /></div><h2 className="mt-4 text-base font-bold text-slate-900">첫 시나리오를 만들어보세요</h2><p className="mt-2 break-keep text-xs leading-6 text-slate-500">AI에게 원하는 자동화를 말하거나 왼쪽 모듈을 연결해 시작할 수 있습니다.</p><button type="button" onClick={onCreate} className="mt-4 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-bold text-white">AI로 초안 만들기</button></div></div>; }
function TemplateCard({ title, chain, onUse }: { title: string; prompt: string; chain: string[]; onUse: () => void }) { return <article className="min-w-0 rounded-2xl border border-slate-200 p-3"><div className="flex items-center gap-1.5">{chain.map((id, index) => { const item = AUTOMATION_MODULES.find((module) => module.id === id) || AUTOMATION_MODULES[0]!; return <span key={`${id}-${index}`} className="flex items-center gap-1.5"><ModuleGlyph item={item} />{index < chain.length - 1 ? <span className="text-slate-300">→</span> : null}</span>; })}</div><p className="mt-3 truncate text-xs font-bold text-slate-900" title={title}>{title}</p><button type="button" onClick={onUse} className="mt-3 h-8 w-full rounded-lg border border-violet-100 text-[11px] font-bold text-violet-600 hover:bg-violet-50">사용하기</button></article>; }

function toCanvasNodes(nodes: ScenarioNode[]): CanvasNode[] { return nodes.map(toCanvasNode); }
function toCanvasNode(scenarioNode: ScenarioNode, order: number): CanvasNode { return { id: scenarioNode.id, type: "scenarioModule", position: scenarioNode.position, data: { scenarioNode, order } }; }
