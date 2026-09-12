"use client";
import { workflowDepartmentIds } from "@/lib/api/types";
import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Plus } from "lucide-react";
import { api, errorMessage, isActiveJob, rememberJob } from "@/lib/api/client";
import { useProject } from "@/lib/api/use-project";
import type { Department, Job, ReportDiffPage } from "@/lib/api/types";
import { refreshWorkspace } from "@/lib/workspace-store";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { displayDate, ErrorNotice, Loading, ProjectStatus } from "./api-shared";
import ReportActions from "./report-actions";
import { WorkflowForm } from "./workflow-form";
const jobLabels: Record<Job["status"], string> = {
  QUEUED: "排隊中",
  RUNNING: "分析中",
  RETRY_WAIT: "等待自動重試",
  SUCCEEDED: "已完成",
  FAILED: "失敗",
};
function History({
  projectId,
  version,
}: {
  projectId: string;
  version: number;
}) {
  const [page, setPage] = useState<ReportDiffPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api
      .diffs(projectId, offset, controller.signal)
      .then((value) => {
        setPage(value);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error));
      });
    return () => controller.abort();
  }, [projectId, offset, version]);
  return (
    <section className="form-surface">
      <h2>修改歷程</h2>
      <ErrorNotice message={error} />
      {!page && !error && <Loading />}
      {page?.items.map((diff) => (
        <details key={diff.id} className="api-history">
          <summary>
            {displayDate(diff.createdAt)} · {diff.eventType} / {diff.phase} · v
            {diff.fromVersion} → v{diff.toVersion}
          </summary>
          <p>{diff.reason || "未填寫理由"}</p>
          {diff.changes.map((change) => (
            <div key={change.workflowId}>
              <strong>
                {change.after?.name || change.before?.name} · {change.operation}
              </strong>
              <pre>
                {JSON.stringify(
                  { before: change.before, after: change.after },
                  (key, value) =>
                    key === "dependsOnWorkflowIds" ? undefined : value,
                  2,
                )}
              </pre>
            </div>
          ))}
        </details>
      ))}
      {page && !page.items.length && <p>尚無修改紀錄。</p>}
      <div className="heading-actions">
        <Button
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          上一頁
        </Button>
        <Button
          variant="outline"
          disabled={!page || offset + page.items.length >= page.total}
          onClick={() => setOffset(offset + 50)}
        >
          下一頁
        </Button>
      </div>
    </section>
  );
}
export function ProjectReport({
  projectId,
  departments,
  memoryAvailable,
}: {
  projectId: string;
  departments: Department[];
  memoryAvailable: boolean;
}) {
  const { data, loading, error, busy, locked, refresh, run } =
    useProject(projectId);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [showPrd, setShowPrd] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const feedbackSucceeded = data?.jobs.some(
    (job) => job.type === "FEEDBACK" && job.status === "SUCCEEDED",
  );
  useEffect(() => {
    if (feedbackSucceeded) void refreshWorkspace();
  }, [feedbackSucceeded]);
  if (loading && !data) return <Loading>正在讀取專案與分析結果…</Loading>;
  if (!data)
    return (
      <>
        <ErrorNotice message={error} retry={() => void refresh()} />
        <Button asChild variant="outline">
          <a href="#reports">回到報告列表</a>
        </Button>
      </>
    );
  const { details, report, jobs } = data;
  const departmentMap = new Map(departments.map((d) => [d.id, d.name]));
  const workflows = new Map(report.workflows.map((w) => [w.id, w]));
  const disabled = locked || !memoryAvailable;
  const analysisActive =
    !!details.activeAnalysisJobId ||
    jobs.some((job) => job.type !== "FEEDBACK" && isActiveJob(job));
  const remove = async () => {
    if (!deleting) return;
    if (
      await run(() =>
        api.deleteWorkflow(
          deleting,
          report.version,
          deleteReason.trim() || undefined,
        ),
      )
    )
      setDeleting(null);
  };
  return (
    <>
      <div className="report-heading">
        <div>
          <a href="#reports" className="back-link">
            <ArrowLeft size={14} />
            返回報告列表
          </a>
          <div className="report-title">
            <h1>{details.project.name}</h1>
            <ProjectStatus closed={details.project.status === "CLOSED"} />
          </div>
          <p>
            {report.workflows.length} 個工作 · 版本 {report.version} · 更新於{" "}
            {displayDate(report.updatedAt)}
          </p>
        </div>
        <div className="heading-actions">
          <Button
            disabled={disabled || report.workflows.length >= 200}
            aria-expanded={editing === "new"}
            aria-controls="new-workflow"
            onClick={() => setEditing("new")}
          >
            <Plus size={16} aria-hidden="true" />
            新增流程
          </Button>
          <Button variant="outline" onClick={() => setShowPrd(true)}>
            <FileText size={16} />
            原始 PRD
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory ? "收起歷程" : "修改歷程"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh()}
          >
            重新載入
          </Button>
        </div>
      </div>
      <ErrorNotice message={error} retry={() => void refresh()} />
      <div className="heading-actions api-action-bar">
        <ReportActions
          error={error}
          data={data}
          locked={disabled}
          busy={busy}
          run={run}
        />
      </div>
      {jobs.map((job) => (
        <div className="api-notice" role="status" key={job.id}>
          <div>
            <strong>
              {job.type === "FEEDBACK" ? "組織回饋" : "需求／歸屬分析"}：
              {jobLabels[job.status]}
            </strong>
            <p>
              已嘗試 {job.attempts} / {job.maxAttempts} 次
              {job.nextRetryAt
                ? ` · 預計重試 ${displayDate(job.nextRetryAt)}`
                : ""}
            </p>
            {job.error && <p>{job.error.message}</p>}
          </div>
          {job.status === "FAILED" && (
            <Button
              variant="outline"
              disabled={
                busy ||
                (job.type !== "FEEDBACK" &&
                  (details.project.status === "CLOSED" ||
                    analysisActive ||
                    job.inputReportVersion !== report.version))
              }
              onClick={() =>
                void run(async () => {
                  const result = await api.retry(job.id);
                  rememberJob(result.job);
                })
              }
            >
              重試{job.type === "FEEDBACK" ? "回饋" : "分析"}
            </Button>
          )}
        </div>
      ))}
      {details.project.status === "CLOSED" && (
        <p className="api-notice">
          已結案。分工與報告已鎖定，組織回饋的成敗不影響結案狀態。
        </p>
      )}
      {showHistory && (
        <History projectId={projectId} version={report.version} />
      )}
      {editing === "new" && (
        <section
          className="use-case-card"
          id="new-workflow"
          aria-labelledby="new-workflow-title"
        >
          <h2 id="new-workflow-title">新增流程</h2>
          <p>補充分析報告中的工作，設定部門歸屬。儲存後會加入此專案。</p>
          <WorkflowForm
            report={report}
            departments={departments}
            disabled={disabled}
            run={run}
            done={() => setEditing(null)}
          />
        </section>
      )}
      {report.workflows.length > 0 && (
        <nav className="use-case-steps" aria-label="工作導覽">
          <ol>
            {report.workflows.map((workflow, index) => (
              <li key={workflow.id}>
                <button
                  type="button"
                  onClick={() => {
                    const element = document.getElementById(
                      `workflow-${workflow.id}`,
                    );
                    element?.focus({ preventScroll: true });
                    element?.scrollIntoView({ block: "start" });
                  }}
                >
                  <span className="use-case-step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="use-case-step-name">{workflow.name}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <section className="use-case-list" aria-label="流程分析結果">
        {report.workflows.map((workflow, index) => (
          <article
            className="use-case-card"
            key={workflow.id}
            id={`workflow-${workflow.id}`}
            tabIndex={-1}
          >
            <header>
              <span className="use-case-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{workflow.name}</h2>
            </header>
            {editing === workflow.id ? (
              <WorkflowForm
                workflow={workflow}
                report={report}
                departments={departments}
                disabled={disabled}
                run={run}
                done={() => setEditing(null)}
              />
            ) : (
              <>
                <div>
                  <h3>部門歸屬</h3>
                  <ul className="use-case-tags">
                    {workflow.assignmentStatus === "ASSIGNED" ? (
                      workflowDepartmentIds(workflow).map((id) => (
                        <li key={id}>
                          {departmentMap.get(id) || "部門資料尚未載入"}
                        </li>
                      ))
                    ) : (
                      <li>
                        {workflow.assignmentStatus === "UNKNOWN"
                          ? "不知道"
                          : "未歸屬"}
                      </li>
                    )}
                    {workflow.assignmentSource && (
                      <li>
                        {workflow.assignmentSource === "AI"
                          ? "AI 建議"
                          : "人工指定"}
                      </li>
                    )}
                  </ul>
                </div>
                <div>
                  <h3>流程描述</h3>
                  <p className="use-case-description">{workflow.description}</p>
                </div>
                <div className="heading-actions">
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setEditing(workflow.id)}
                  >
                    編輯工作
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      setDeleteReason("");
                      setDeleting(workflow.id);
                    }}
                  >
                    刪除工作
                  </Button>
                </div>
              </>
            )}
          </article>
        ))}
        {!report.workflows.length && (
          <div className="empty-state">
            <h2>{analysisActive ? "分析進行中" : "尚無分析結果"}</h2>
            <p>
              {analysisActive
                ? "工作會在首次分析成功後出現。"
                : "請查看任務狀態；首次分析失敗時可以重試。"}
            </p>
          </div>
        )}
      </section>
      <Dialog open={showPrd} onOpenChange={setShowPrd}>
        <DialogContent className="wide-dialog">
          <DialogHeader>
            <DialogTitle>原始 PRD</DialogTitle>
            <DialogDescription>{details.project.name}</DialogDescription>
          </DialogHeader>
          <pre className="document-preview">{details.userDoc.content}</pre>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!busy && !open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除工作</DialogTitle>
            <DialogDescription>
              確認刪除「{workflows.get(deleting || "")?.name}
              」？刪除後將保留修改歷程。
            </DialogDescription>
          </DialogHeader>
          <label>
            刪除理由（選填）
            <Textarea
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              disabled={busy}
            />
          </label>
          <ErrorNotice message={error} />
          <div className="heading-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <Button
              disabled={disabled || [...deleteReason].length > 2000}
              onClick={() => void remove()}
            >
              確認刪除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
