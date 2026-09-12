import { expect, type Page } from "@playwright/test";
import type {
  GlobalMemory,
  Job,
  Project,
  ProjectDetails,
  Report,
  Workflow,
} from "../src/lib/api/types";
export const projectId = "11111111-1111-4111-8111-111111111111";
export const workflowId = "22222222-2222-4222-8222-222222222222";
export const departmentId = "33333333-3333-4333-8333-333333333333";
export const jobId = "44444444-4444-4444-8444-444444444444";
const date = "2026-09-12T04:00:00Z";
export const memory: GlobalMemory = {
  version: 1,
  departments: [
    { id: departmentId, name: "產品部", description: "釐清需求與驗收。" },
  ],
  relationshipsDescription: "產品部協調各部門",
  source: "INITIAL",
  sourceProjectId: null,
  createdAt: date,
};
export const project: Project = {
  id: projectId,
  name: "真實 API 專案",
  status: "OPEN",
  createdAt: date,
  closedAt: null,
};
export const workflow: Workflow = {
  id: workflowId,
  reportId: "55555555-5555-4555-8555-555555555555",
  name: "確認會員需求",
  description: "定義會員資料及使用情境。",
  assignmentStatus: "UNKNOWN",
  departmentId: null,
  assignmentSource: "AI",
  dependsOnWorkflowIds: [],
  createdAt: date,
  updatedAt: date,
};
export const report: Report = {
  id: workflow.reportId,
  projectId,
  version: 1,
  workflows: [workflow],
  createdAt: date,
  updatedAt: date,
};
export const job: Job = {
  id: jobId,
  projectId,
  type: "INITIAL_ANALYSIS",
  status: "SUCCEEDED",
  attempts: 1,
  maxAttempts: 3,
  nextRetryAt: null,
  globalMemoryVersion: 1,
  inputReportVersion: 0,
  error: null,
  createdAt: date,
  startedAt: date,
  finishedAt: date,
  result: { reportVersion: 1 },
};
export async function installApi(
  page: Page,
  options: {
    initialized?: boolean;
    initiallyEmpty?: boolean;
    createDisconnect?: boolean;
    conflict?: boolean;
    feedbackFailed?: boolean;
    analysisFailed?: boolean;
    busy?: boolean;
    dependencyError?: boolean;
  } = {},
) {
  const state = {
    project: structuredClone(project),
    report: structuredClone(report),
    job: structuredClone(job),
    memory:
      options.initialized === false
        ? (null as GlobalMemory | null)
        : structuredClone(memory),
    hasProject: !options.initiallyEmpty,
    jobReads: 0,
    posts: [] as { path: string; body: Record<string, unknown>; key: string }[],
    patches: [] as Record<string, unknown>[],
    deletes: [] as URL[],
    reads: [] as string[],
    disconnected: false,
    conflicted: false,
  };
  if (options.busy) state.job.status = "RUNNING";
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = req.method();
    const ok = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const fail = (code: string, status = 409, details = {}) =>
      ok({ error: { code, message: code, details } }, status);
    const body = req.postDataJSON() as Record<string, unknown> | null;
    if (method === "POST") {
      const key = req.headers()["idempotency-key"];
      expect(key).toMatch(/^[a-f0-9-]{36}$/);
      expect(req.headers()["content-type"]).toBe("application/json");
      state.posts.push({ path, body: body || {}, key });
    }
    if (method === "GET") state.reads.push(path);
    if (path === "/global-memory") {
      if (method === "POST") {
        if (state.memory) return fail("GLOBAL_MEMORY_ALREADY_INITIALIZED");
        state.memory = { ...memory, ...body } as GlobalMemory;
        return ok(state.memory, 201);
      }
      return state.memory ? ok(state.memory) : fail("RESOURCE_NOT_FOUND", 404);
    }
    if (path === "/projects") {
      if (method === "POST") {
        expect(Object.keys(body!).sort()).toEqual(["name", "userDoc"]);
        state.hasProject = true;
        state.project.name = String(body!.name);
        state.report.version = 0;
        state.report.workflows = [];
        state.job.status = "RUNNING";
        state.job.type = "INITIAL_ANALYSIS";
        if (options.createDisconnect && !state.disconnected) {
          state.disconnected = true;
          return route.abort("failed");
        }
        return ok(
          { project: state.project, report: state.report, job: state.job },
          202,
        );
      }
      return ok({
        items: state.hasProject ? [state.project] : [],
        total: state.hasProject ? 1 : 0,
        limit: 200,
        offset: 0,
      });
    }
    if (path === `/projects/${projectId}`) {
      const details: ProjectDetails = {
        project: state.project,
        userDoc: { projectId, content: "會員管理 PRD 內容", createdAt: date },
        reportVersion: state.report.version,
        activeAnalysisJobId:
          state.job.type !== "FEEDBACK" &&
          ["RUNNING", "QUEUED", "RETRY_WAIT"].includes(state.job.status)
            ? jobId
            : null,
        feedbackJobId: state.job.type === "FEEDBACK" ? jobId : null,
      };
      return ok(details);
    }
    if (path === `/projects/${projectId}/report`) return ok(state.report);
    if (path === `/jobs/${jobId}`) {
      state.jobReads++;
      if (
        !options.busy &&
        state.job.status === "RUNNING" &&
        state.jobReads >= 2
      ) {
        state.job.status = options.analysisFailed ? "FAILED" : "SUCCEEDED";
        if (state.job.status === "SUCCEEDED") {
          state.report.version++;
          state.report.workflows = [structuredClone(workflow)];
          state.job.result = { reportVersion: state.report.version };
        } else
          state.job.error = {
            code: "AI_TIMEOUT",
            message: "分析逾時",
            retryable: true,
          };
      }
      return ok(state.job);
    }
    if (path === `/jobs/${jobId}/retry`) {
      expect(body).toEqual({});
      state.job.status = "SUCCEEDED";
      state.job.error = null;
      return ok({ job: state.job }, 202);
    }
    if (path === `/projects/${projectId}/analyses`) {
      expect(body!.expectedReportVersion).toBe(state.report.version);
      state.job.type = body!.type as Job["type"];
      state.job.status = "RUNNING";
      state.jobReads = 0;
      if (body!.type === "ALL_REANALYZE") {
        expect(body!.reason).toBeTruthy();
        state.report.version++;
        state.report.workflows.forEach((w) => {
          w.assignmentStatus = "UNASSIGNED";
          w.departmentId = null;
          w.departmentIds = [];
          w.assignmentSource = null;
        });
      }
      state.job.inputReportVersion = state.report.version;
      return ok({ job: state.job, reportVersion: state.report.version }, 202);
    }
    if (path === `/projects/${projectId}/close`) {
      expect(body!.expectedReportVersion).toBe(state.report.version);
      state.project.status = "CLOSED";
      state.project.closedAt = date;
      state.report.version++;
      state.job.type = "FEEDBACK";
      state.job.status = options.feedbackFailed ? "FAILED" : "SUCCEEDED";
      if (options.feedbackFailed)
        state.job.error = {
          code: "AI_TIMEOUT",
          message: "回饋逾時",
          retryable: true,
        };
      return ok(
        {
          project: state.project,
          reportVersion: state.report.version,
          feedbackJob: state.job,
        },
        202,
      );
    }
    if (path === `/projects/${projectId}/workflows`) {
      expect(body!.expectedReportVersion).toBe(state.report.version);
      const created = {
        ...workflow,
        ...body,
        id: "66666666-6666-4666-8666-666666666666",
        assignmentSource: "USER",
      } as Workflow;
      state.report.workflows.push(created);
      state.report.version++;
      return ok(
        { workflow: created, reportVersion: state.report.version },
        201,
      );
    }
    if (path.startsWith("/workflows/")) {
      if (method === "PATCH") {
        state.patches.push(body!);
        if (options.conflict && !state.conflicted) {
          state.conflicted = true;
          state.report.version++;
          return fail("REPORT_VERSION_CONFLICT");
        }
        expect(body!.expectedReportVersion).toBe(state.report.version);
        const target = state.report.workflows.find(
          (w) => w.id === path.split("/")[2],
        )!;
        Object.assign(target, body);
        if ("assignmentStatus" in body!) target.assignmentSource = "USER";
        state.report.version++;
        return ok({ workflow: target, reportVersion: state.report.version });
      }
      if (method === "DELETE") {
        state.deletes.push(url);
        expect(req.postData()).toBeNull();
        if (options.dependencyError)
          return fail("WORKFLOW_HAS_DEPENDENTS", 409, {
            dependentWorkflowIds: [workflowId],
          });
        expect(Number(url.searchParams.get("expectedReportVersion"))).toBe(
          state.report.version,
        );
        const id = path.split("/")[2];
        state.report.workflows = state.report.workflows.filter(
          (w) => w.id !== id,
        );
        state.report.version++;
        return ok({
          deletedWorkflowId: id,
          reportVersion: state.report.version,
        });
      }
    }
    if (path.endsWith("/report-diffs"))
      return ok({ items: [], total: 0, limit: 50, offset: 0 });
    return fail("RESOURCE_NOT_FOUND", 404);
  });
  return state;
}
