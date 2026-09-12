// DTOs based on API 0.1.0 in docs/openapi.json.
// departmentIds is a proposed multi-department extension requiring backend support.
// Field constraints are enforced by the API and form validation.

export type Department = {
  id: string;
  name: string;
  description: string;
};

export type InitializeMemory = {
  departments: Department[];
  relationshipsDescription: string;
};

export type GlobalMemory = {
  version: number;
  departments: Department[];
  relationshipsDescription: string;
  source: "INITIAL" | "FEEDBACK";
  sourceProjectId: string | null;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  closedAt: string | null;
};

export type UserDoc = {
  projectId: string;
  content: string;
  createdAt: string;
};

export type Workflow = {
  id: string;
  reportId: string;
  name: string;
  description: string;
  dependsOnWorkflowIds: string[];
  assignmentStatus: "UNASSIGNED" | "ASSIGNED" | "UNKNOWN";
  departmentId?: string | null;
  departmentIds?: string[];
  assignmentSource: ("AI" | "USER") | null;
  createdAt: string;
  updatedAt: string;
};

export type Report = {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  workflows: Workflow[];
};

export type JobError = {
  code:
    | "AI_TIMEOUT"
    | "AI_UNAVAILABLE"
    | "AI_RATE_LIMITED"
    | "AI_INVALID_OUTPUT"
    | "AI_AUTH_ERROR"
    | "AI_REQUEST_REJECTED"
    | "MEMORY_VERSION_CONFLICT"
    | "WORKER_INTERRUPTED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
};

export type Job = {
  id: string;
  projectId: string;
  type:
    "INITIAL_ANALYSIS" | "ALL_REANALYZE" | "UNASSIGNED_ANALYZE" | "FEEDBACK";
  status: "QUEUED" | "RUNNING" | "RETRY_WAIT" | "SUCCEEDED" | "FAILED";
  attempts: number;
  maxAttempts: 3;
  nextRetryAt: string | null;
  globalMemoryVersion: number;
  inputReportVersion: number;
  error: JobError | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result:
    | null
    | {
        reportVersion: number;
      }
    | {
        globalMemoryVersion: number;
      };
};

export type Change = {
  workflowId: string;
  operation: "CREATE" | "UPDATE" | "DELETE";
  changedFields: (
    | "id"
    | "reportId"
    | "name"
    | "description"
    | "dependsOnWorkflowIds"
    | "assignmentStatus"
    | "departmentId"
    | "departmentIds"
    | "assignmentSource"
    | "createdAt"
    | "updatedAt"
  )[];
  before: Workflow | null;
  after: Workflow | null;
};

export type ReportDiff = {
  id: string;
  projectId: string;
  reportId: string;
  eventType:
    | "INITIAL_ANALYSIS"
    | "WORKFLOW_CREATED"
    | "WORKFLOW_UPDATED"
    | "WORKFLOW_DELETED"
    | "ALL_REANALYZE"
    | "UNASSIGNED_ANALYZE"
    | "PROJECT_CLOSED";
  phase: "CLEAR" | "APPLY";
  source: "USER" | "AI" | "SYSTEM";
  actorId: null;
  reason: string | null;
  jobId: string | null;
  globalMemoryVersion: number | null;
  fromVersion: number;
  toVersion: number;
  changes: Change[];
  createdAt: string;
};

export type Error = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};

export type CreateProject = {
  name: string;
  userDoc: {
    content: string;
  };
};

export type CreateProjectResult = {
  project: Project;
  report: Report;
  job: Job;
};

export type ProjectDetails = {
  project: Project;
  userDoc: UserDoc;
  reportVersion: number;
  activeAnalysisJobId: string | null;
  feedbackJobId: string | null;
};

export type CreateWorkflow = {
  name: string;
  description: string;
  dependsOnWorkflowIds?: string[];
  assignmentStatus?: "UNASSIGNED" | "ASSIGNED" | "UNKNOWN";
  departmentIds?: string[];
  expectedReportVersion: number;
  reason?: string;
};

export type PatchWorkflow = {
  name?: string;
  description?: string;
  dependsOnWorkflowIds?: string[];
  assignmentStatus?: "UNASSIGNED" | "ASSIGNED" | "UNKNOWN";
  departmentIds?: string[];
  expectedReportVersion: number;
  reason?: string;
};

export type WorkflowResult = {
  workflow: Workflow;
  reportVersion: number;
};

export type DeleteWorkflowResult = {
  deletedWorkflowId: string;
  reportVersion: number;
};

export type AnalysisRequest =
  | {
      type: "ALL_REANALYZE";
      expectedReportVersion: number;
      reason: string;
    }
  | {
      type: "UNASSIGNED_ANALYZE";
      expectedReportVersion: number;
      reason?: string;
    };

export type AnalysisResult = {
  job: Job;
  reportVersion: number;
};

export type CloseRequest = {
  expectedReportVersion: number;
  reason?: string;
};

export type CloseResult = {
  project: Project;
  reportVersion: number;
  feedbackJob: Job;
};

export type RetryRequest = Record<string, never>;

export type RetryResult = {
  job: Job;
};

export type ProjectPage = {
  items: Project[];
  total: number;
  limit: number;
  offset: number;
};

export type ReportDiffPage = {
  items: ReportDiff[];
  total: number;
  limit: number;
  offset: number;
};

// Read legacy responses while the API migrates to multiple departments.
export function workflowDepartmentIds(workflow: Workflow): string[] {
  return (
    workflow.departmentIds ??
    (workflow.departmentId ? [workflow.departmentId] : [])
  );
}
