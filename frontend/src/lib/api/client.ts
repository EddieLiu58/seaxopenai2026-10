import type * as DTO from "./types";
export const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
const messages: Record<string, string> = {
  REPORT_VERSION_CONFLICT:
    "報告已更新，已重新讀取最新資料。請檢視後再送出修改。",
  PROJECT_BUSY: "專案正在分析，完成後才能修改或結案。",
  PROJECT_CLOSED: "專案已結案，無法再修改或分析。",
  INITIAL_ANALYSIS_REQUIRED: "請先完成首次分析。",
  GLOBAL_MEMORY_NOT_INITIALIZED: "請先到部門清單初始化組織職能。",
  GLOBAL_MEMORY_ALREADY_INITIALIZED: "部門清單已初始化，不能再次覆蓋。",
  WORKFLOW_DEPENDENCY_CYCLE: "這些前置工作會形成循環，請調整相依關係。",
  WORKFLOW_HAS_DEPENDENTS: "此流程仍被其他流程使用，後端目前不允許刪除。",
  STALE_JOB_INPUT: "這個任務的輸入已過期，請依最新報告重新分析。",
  NO_UNASSIGNED_WORKFLOWS: "目前沒有未歸屬或不知道的工作。",
  NO_WORKFLOWS: "報告尚無工作，不能執行此操作。",
  RESOURCE_NOT_FOUND: "找不到指定的資料。",
};
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return messages[error.code] || error.message;
  return error instanceof Error ? error.message : "操作失敗，請稍後重試。";
}
// Only unresolved POST operations retain a key, including across reloads.
const pending = new Map<string, string>();
async function operationKey(path: string, body: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${apiBaseUrl}${path}:${body}`),
  );
  return `seax:pending:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  if (
    encoded &&
    new TextEncoder().encode(encoded).byteLength > 10 * 1024 * 1024
  ) {
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "送出的 JSON 不可超過 10 MiB。",
    );
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (encoded !== undefined) headers["Content-Type"] = "application/json";
  let identity: string | undefined;
  if (method === "POST") {
    identity = await operationKey(path, encoded || "");
    let key = pending.get(identity);
    try {
      key ||= sessionStorage.getItem(identity) || undefined;
    } catch {
      /* memory fallback */
    }
    key ||= crypto.randomUUID();
    pending.set(identity, key);
    try {
      sessionStorage.setItem(identity, key);
    } catch {
      /* memory fallback */
    }
    headers["Idempotency-Key"] = key;
  }
  const clear = () => {
    if (!identity) return;
    pending.delete(identity);
    try {
      sessionStorage.removeItem(identity);
    } catch {
      /* memory fallback */
    }
  };
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: encoded,
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => {
      throw new ApiError(
        response.status,
        "INVALID_RESPONSE",
        "服務未回傳 JSON，請確認 API 連線設定。",
      );
    });
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) clear();
      throw new ApiError(
        response.status,
        data.error?.code || "HTTP_ERROR",
        data.error?.message || `請求失敗（${response.status}）`,
        data.error?.details || {},
      );
    }
    clear();
    return data as T;
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "無法連線或等待回應逾時，請重試；同一筆提交會保留識別碼以避免重複建立。",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
const id = encodeURIComponent;
export const api = {
  memory: (signal?: AbortSignal) =>
    request<DTO.GlobalMemory>("/global-memory", "GET", undefined, signal),
  initialize: (body: DTO.InitializeMemory) =>
    request<DTO.GlobalMemory>("/global-memory", "POST", body),
  projects: (offset = 0, signal?: AbortSignal) =>
    request<DTO.ProjectPage>(
      `/projects?limit=200&offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  createProject: (body: DTO.CreateProject) =>
    request<DTO.CreateProjectResult>("/projects", "POST", body),
  project: (projectId: string, signal?: AbortSignal) =>
    request<DTO.ProjectDetails>(
      `/projects/${id(projectId)}`,
      "GET",
      undefined,
      signal,
    ),
  report: (projectId: string, signal?: AbortSignal) =>
    request<DTO.Report>(
      `/projects/${id(projectId)}/report`,
      "GET",
      undefined,
      signal,
    ),
  createWorkflow: (projectId: string, body: DTO.CreateWorkflow) =>
    request<DTO.WorkflowResult>(
      `/projects/${id(projectId)}/workflows`,
      "POST",
      body,
    ),
  patchWorkflow: (workflowId: string, body: DTO.PatchWorkflow) =>
    request<DTO.WorkflowResult>(`/workflows/${id(workflowId)}`, "PATCH", body),
  deleteWorkflow: (workflowId: string, version: number, reason?: string) =>
    request<DTO.DeleteWorkflowResult>(
      `/workflows/${id(workflowId)}?${new URLSearchParams({ expectedReportVersion: String(version), ...(reason ? { reason } : {}) })}`,
      "DELETE",
    ),
  analyze: (projectId: string, body: DTO.AnalysisRequest) =>
    request<DTO.AnalysisResult>(
      `/projects/${id(projectId)}/analyses`,
      "POST",
      body,
    ),
  close: (projectId: string, body: DTO.CloseRequest) =>
    request<DTO.CloseResult>(`/projects/${id(projectId)}/close`, "POST", body),
  diffs: (projectId: string, offset = 0, signal?: AbortSignal) =>
    request<DTO.ReportDiffPage>(
      `/projects/${id(projectId)}/report-diffs?limit=50&offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
  job: (jobId: string, signal?: AbortSignal) =>
    request<DTO.Job>(`/jobs/${id(jobId)}`, "GET", undefined, signal),
  retry: (jobId: string) =>
    request<DTO.RetryResult>(`/jobs/${id(jobId)}/retry`, "POST", {}),
};
export const isActiveJob = (job: DTO.Job) =>
  ["QUEUED", "RUNNING", "RETRY_WAIT"].includes(job.status);
export function rememberJob(job: DTO.Job) {
  try {
    localStorage.setItem(
      `seax:job:${apiBaseUrl}:${job.projectId}:${job.type === "FEEDBACK" ? "feedback" : "analysis"}`,
      job.id,
    );
  } catch {
    /* use server associations */
  }
}
export function rememberedJobs(
  projectId: string,
  current: { analysis: string | null; feedback: string | null },
): string[] {
  return (["analysis", "feedback"] as const).flatMap((type) => {
    if (current[type]) return [current[type]];
    try {
      return (
        localStorage.getItem(`seax:job:${apiBaseUrl}:${projectId}:${type}`) ||
        []
      );
    } catch {
      return [];
    }
  });
}
export function validateText(
  value: string,
  label: string,
  maximum: number,
  required = true,
) {
  if (required && !value.trim()) throw new Error(`請填寫${label}。`);
  if ([...value].length > maximum)
    throw new Error(`${label}最多 ${maximum.toLocaleString()} 字。`);
}
