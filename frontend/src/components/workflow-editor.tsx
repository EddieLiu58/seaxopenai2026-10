"use client";
import { useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import {
  GitBranch,
  Plus,
  Save,
  Trash2,
  Sparkles,
  Check,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  departments,
  type Report,
  type WorkNode,
  type WorkData,
} from "@/lib/workspace-data";
import "@xyflow/react/dist/style.css";
function WorkCard({ data, selected }: NodeProps<WorkNode>) {
  return (
    <div className={`work-node ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className="node-dept">
        <span
          className={`dept-dot dept-${departments.indexOf(data.department)}`}
        />
        {data.department}
        <span className="node-origin">
          {data.history.length ? "已調整" : "示範建議"}
        </span>
      </div>
      <strong>{data.label}</strong>
      <div className="node-bottom">
        {data.pending ? (
          <>
            <span className="pending-dot" />
            有待確認事項
          </>
        ) : (
          <>
            <Check size={12} />
            分工已明確
          </>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
const nodeTypes = { work: WorkCard };
export default function WorkflowEditor({
  report,
  onChange,
  notify,
}: {
  report: Report;
  onChange: (r: Report) => void;
  notify: (s: string) => void;
}) {
  const [caseFilter, setCaseFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkData | null>(null);
  const [reason, setReason] = useState("");
  const [edgeSelection, setEdgeSelection] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const locked = report.status === "已準備開案";
  const persistGraph = (r: Report, message: string) => {
    onChange({
      ...r,
      nodes: r.nodes.map((n) => ({
        ...n,
        data: { ...n.data, history: [...n.data.history, message] },
      })),
    });
  };
  const onNodesChange = useCallback(
    (changes: NodeChange<WorkNode>[]) =>
      onChange({ ...report, nodes: applyNodeChanges(changes, report.nodes) }),
    [report, onChange],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      onChange({ ...report, edges: applyEdgeChanges(changes, report.edges) }),
    [report, onChange],
  );
  const connect = (connection: Connection) => {
    if (
      locked ||
      connection.source === connection.target ||
      report.edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      )
    )
      return;
    persistGraph(
      {
        ...report,
        edges: addEdge({ ...connection, type: "smoothstep" }, report.edges),
      },
      `新增依賴：${connection.source} → ${connection.target}`,
    );
    notify("已新增交接連線");
  };
  const select = (node: WorkNode) => {
    setSelected(node.id);
    setDraft({ ...node.data });
    setReason("");
    setEdgeSelection(null);
  };
  const save = () => {
    if (!draft?.label.trim() || !reason.trim()) {
      notify("請填寫工作名稱與調整原因");
      return;
    }
    onChange({
      ...report,
      status: "協作中",
      nodes: report.nodes.map((n) =>
        n.id === selected
          ? {
              ...n,
              data: {
                ...draft,
                reason,
                history: [
                  ...draft.history,
                  `${new Date().toLocaleString("zh-TW")}：${reason}（${n.data.department} → ${draft.department}）`,
                ],
              },
            }
          : n,
      ),
    });
    setSelected(null);
    setDraft(null);
    notify("已儲存分工與調整原因");
  };
  const visible = report.nodes.filter(
    (n) => caseFilter === "all" || n.data.useCase === caseFilter,
  );
  return (
    <div className="workflow-layout">
      <aside className="case-panel">
        <div className="panel-title">
          使用情境 <span>{report.cases.length}</span>
        </div>
        <button
          className={`case-button ${caseFilter === "all" ? "active" : ""}`}
          onClick={() => setCaseFilter("all")}
        >
          <GitBranch size={17} />
          完整協作流程
        </button>
        {report.cases.map((c, i) => (
          <button
            key={c}
            className={`case-button ${caseFilter === c ? "active" : ""}`}
            onClick={() => setCaseFilter(c)}
          >
            <span className="case-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            {c}
            <small>
              {report.nodes.filter((n) => n.data.useCase === c).length}
            </small>
          </button>
        ))}
        <div className="case-footer">
          <Sparkles size={18} />
          <strong>每一份共識，都有跡可循</strong>
          <p>調整分工時記錄原因，讓下一次協作少一點猜測。</p>
        </div>
      </aside>
      <section className="canvas-section">
        <div className="canvas-toolbar">
          <span>
            <span className="live-dot" />{" "}
            {caseFilter === "all" ? "完整協作流程" : caseFilter}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={locked}
            onClick={() => {
              const id = crypto.randomUUID();
              const node: WorkNode = {
                id,
                type: "work",
                position: { x: 150 + report.nodes.length * 35, y: 420 },
                data: {
                  label: "新增開發工作",
                  department: "產品部",
                  originalDepartment: "產品部",
                  scope: "",
                  delivery: "",
                  acceptance: "",
                  pending: "請確認工作範圍與分工",
                  reason: "",
                  useCase: caseFilter === "all" ? report.cases[0] : caseFilter,
                  collaborators: "",
                  history: ["手動新增流程"],
                },
              };
              onChange({ ...report, nodes: [...report.nodes, node] });
              select(node);
            }}
          >
            <Plus size={14} />
            新增流程
          </Button>
        </div>
        <div className="flow-wrap">
          <ReactFlow
            nodes={report.nodes.map((n) => ({
              ...n,
              hidden: !visible.some((v) => v.id === n.id),
              selected: n.id === selected,
            }))}
            edges={report.edges.map((e) => ({
              ...e,
              hidden:
                !visible.some((n) => n.id === e.source) ||
                !visible.some((n) => n.id === e.target),
              selected: e.id === edgeSelection,
            }))}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            onNodeClick={(_, n) => select(n)}
            onEdgeClick={(_, e) => {
              setEdgeSelection(e.id);
              setSelected(null);
              setDraft(null);
            }}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
            edgesReconnectable={false}
            deleteKeyCode={null}
            fitView
            minZoom={0.25}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} color="#cad7d5" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor="#c9e3dd" />
          </ReactFlow>
        </div>
        <div className="canvas-caption">
          <span>拖曳工作卡片調整位置 · 從圓點拉出交接連線</span>
          <span>
            {report.nodes.length} 項工作 / {report.edges.length} 條連線
          </span>
        </div>
        {!locked && (
          <details className="connection-tools">
            <summary>用表單管理連線（鍵盤操作）</summary>
            <div className="connect-form">
              <label>
                前置工作
                <select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">選擇工作</option>
                  {report.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.label}
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRight size={16} />
              <label>
                後續工作
                <select value={to} onChange={(e) => setTo(e.target.value)}>
                  <option value="">選擇工作</option>
                  {report.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                disabled={!from || !to || from === to}
                onClick={() =>
                  connect({
                    source: from,
                    target: to,
                    sourceHandle: null,
                    targetHandle: null,
                  })
                }
              >
                建立連線
              </Button>
            </div>
            <div className="edge-list">
              {report.edges.map((e) => (
                <div key={e.id}>
                  <span>
                    {report.nodes.find((n) => n.id === e.source)?.data.label} →{" "}
                    {report.nodes.find((n) => n.id === e.target)?.data.label}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="刪除這條連線"
                    onClick={() => {
                      persistGraph(
                        {
                          ...report,
                          edges: report.edges.filter((x) => x.id !== e.id),
                        },
                        `刪除依賴：${e.source} → ${e.target}`,
                      );
                    }}
                  >
                    移除
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
      <aside className="detail-panel">
        <div className="panel-title">
          {draft ? "工作詳情" : "協作摘要"}
          {draft && (
            <Button
              aria-label="關閉工作詳情"
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelected(null);
                setDraft(null);
              }}
            >
              <X size={16} />
            </Button>
          )}
        </div>
        {draft ? (
          <div className="node-form">
            <label>
              工作名稱
              <Input
                disabled={locked}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <div className="form-two">
              <label>
                主責部門
                <select
                  disabled={locked}
                  value={draft.department}
                  onChange={(e) =>
                    setDraft({ ...draft, department: e.target.value })
                  }
                >
                  {departments.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                使用情境
                <select
                  disabled={locked}
                  value={draft.useCase}
                  onChange={(e) =>
                    setDraft({ ...draft, useCase: e.target.value })
                  }
                >
                  {report.cases.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              協作部門
              <Input
                disabled={locked}
                value={draft.collaborators}
                onChange={(e) =>
                  setDraft({ ...draft, collaborators: e.target.value })
                }
              />
            </label>
            {(
              [
                ["scope", "工作範圍"],
                ["delivery", "交付內容"],
                ["acceptance", "驗收條件"],
                ["pending", "待確認事項"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} htmlFor={`work-${key}`}>
                {label}
                <Textarea
                  id={`work-${key}`}
                  aria-label={label}
                  disabled={locked}
                  rows={2}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <div className="evidence">
              <Sparkles size={15} />
              <div>
                <strong>原始建議 · {draft.originalDepartment}</strong>
                <p>
                  示範依據：部門職掌與責任範圍。尚未經 AI
                  分析，請依實際公司資料確認。
                </p>
              </div>
            </div>
            {!locked && (
              <>
                <label>
                  調整原因 <span className="required">必填</span>
                  <Textarea
                    placeholder="例如：會議確認此 API 由後端團隊維護…"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button onClick={save}>
                  <Save size={15} />
                  儲存調整
                </Button>
                <Button
                  variant="ghost"
                  className="danger"
                  onClick={() => {
                    if (!reason.trim()) {
                      notify("刪除工作前，請填寫調整原因");
                      return;
                    }
                    persistGraph(
                      {
                        ...report,
                        nodes: report.nodes.filter((n) => n.id !== selected),
                        edges: report.edges.filter(
                          (e) => e.source !== selected && e.target !== selected,
                        ),
                      },
                      `刪除「${draft.label}」：${reason}`,
                    );
                    setSelected(null);
                    setDraft(null);
                    notify("已刪除工作與相關連線");
                  }}
                >
                  <Trash2 size={14} />
                  刪除這項工作
                </Button>
              </>
            )}
            {draft.history.length > 0 && (
              <details>
                <summary>修改紀錄（{draft.history.length}）</summary>
                {draft.history.map((h, i) => (
                  <p className="history-item" key={i}>
                    {h}
                  </p>
                ))}
              </details>
            )}
          </div>
        ) : (
          <div className="summary-body">
            <div className="summary-icon">
              <GitBranch size={26} />
            </div>
            <h3>
              把工作說清楚，
              <br />
              讓協作走得更順。
            </h3>
            <p>點選流程中的工作，檢視責任邊界、交付內容與判斷依據。</p>
            <hr />
            <strong>建議邀請的部門</strong>
            <div className="department-tags">
              {[...new Set(report.nodes.map((n) => n.data.department))].map(
                (d) => (
                  <span key={d}>
                    <span
                      className={`dept-dot dept-${departments.indexOf(d)}`}
                    />
                    {d}
                  </span>
                ),
              )}
            </div>
            <div className="attention-box">
              <strong>
                {report.nodes.filter((n) => n.data.pending).length} 項待確認
              </strong>
              <p>在需求會議中確認工作範圍，並更新各項工作的待確認事項。</p>
            </div>
            {edgeSelection && !locked && (
              <Button
                variant="outline"
                onClick={() => {
                  persistGraph(
                    {
                      ...report,
                      edges: report.edges.filter((e) => e.id !== edgeSelection),
                    },
                    "使用者移除所選依賴連線",
                  );
                  setEdgeSelection(null);
                  notify("已移除連線");
                }}
              >
                <Trash2 size={14} />
                移除選取的連線
              </Button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
