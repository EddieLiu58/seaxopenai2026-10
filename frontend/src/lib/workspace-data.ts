import type { Node, Edge } from "@xyflow/react";
import companyExample from "../../../backend/examples/global-memory-software-company.json";
export type WorkData = {
  label: string;
  department: string;
  scope: string;
  delivery: string;
  acceptance: string;
  pending: string;
  reason: string;
  useCase: string;
  collaborators: string;
  history: string[];
  originalDepartment: string;
  [key: string]: unknown;
};
export type WorkNode = Node<WorkData>;
export type UseCase = {
  assignmentStatus?: "UNASSIGNED" | "ASSIGNED" | "UNKNOWN";
  departmentId?: string | null;
  departmentIds?: string[];
  dependsOnWorkflowIds?: string[];
  reason?: string;
  id: string;
  name: string;
  departments: string[];
  description: string;
  feedback: string;
};
export type Report = {
  id: string;
  // Existing demo reports use id until they have a separate API project ID.
  projectId?: string;
  title: string;
  description: string;
  status: "待確認" | "協作中" | "已準備開案";
  date: string;
  prd: string;
  cases: string[];
  nodes: WorkNode[];
  edges: Edge[];
  useCases?: UseCase[];
};
// Older browser reports keep their original workflow data during migration.
export function getUseCases(report: Report): UseCase[] {
  if (report.useCases) return report.useCases;
  const aliases: Record<string, string> = {
    產品部: "產品管理部", 設計部: "使用者體驗設計部",
    前端工程部: "前端開發部", 後端工程部: "後端開發部",
  };
  return report.cases.map((name, index) => {
    const nodes = report.nodes.filter((node) => node.data.useCase === name);
    return {
      id: `case-${index + 1}`,
      name,
      departments: [...new Set(nodes.flatMap(({ data }) =>
        [data.department, ...data.collaborators.split(/[、,，；;]/)]
          .map((value) => value.trim()).filter(Boolean)
          .map((value) => aliases[value] ?? value),
      ))],
      description: nodes.map(({ data }) => data.scope).join("\n") || report.description,
      feedback: "",
    };
  });
}
export type CompanyDepartment = {
  id: string;
  name: string;
  description: string;
};
export type Workspace = {
  version: 1;
  reports: Report[];
  departments: CompanyDepartment[];
};
export const defaultCompanyDepartments: CompanyDepartment[] =
  companyExample.departments.map((department) => ({
    id: department.id,
    name: department.name,
    description: department.description,
  }));
export const departments = [
  "產品部",
  "設計部",
  "前端工程部",
  "後端工程部",
  "品質保證部",
  "數據部",
];
export function makeNodes(cases: string[]): WorkNode[] {
  return [
    [
      "需求與使用者旅程",
      "產品部",
      "釐清需求範圍、使用者情境與成功指標。",
      "需求規格與驗收清單",
      140,
      0,
      cases[0],
    ],
    [
      "介面與互動設計",
      "設計部",
      "設計操作流程、畫面狀態與錯誤提示。",
      "設計稿與元件規格",
      0,
      155,
      cases[0],
    ],
    [
      "服務與資料介接",
      "後端工程部",
      "定義資料模型、API 契約及權限驗證。",
      "API 文件與測試環境",
      280,
      155,
      cases[1] || cases[0],
    ],
    [
      "前端功能開發",
      "前端工程部",
      "完成互動頁面、API 串接與響應式版面。",
      "可測試的前端版本",
      140,
      310,
      cases[0],
    ],
    [
      "整合測試與驗收",
      "品質保證部",
      "驗證主要情境、例外處理與跨裝置表現。",
      "測試報告與驗收結果",
      140,
      465,
      cases[2] || cases[1] || cases[0],
    ],
  ].map(([label, department, scope, delivery, x, y, useCase], i) => ({
    id: `n${i}`,
    type: "work",
    position: { x: Number(x), y: Number(y) },
    data: {
      label: String(label),
      department: String(department),
      originalDepartment: String(department),
      scope: String(scope),
      delivery: String(delivery),
      acceptance: "主要情境通過測試，並取得相關部門共識。",
      pending: i === 2 ? "確認 API 契約與資料權責。" : "",
      reason: "",
      useCase: String(useCase),
      collaborators: i === 2 ? "前端工程部、數據部" : "產品部",
      history: [],
    },
  }));
}
export function makeEdges(): Edge[] {
  return [
    ["n0", "n1"],
    ["n0", "n2"],
    ["n1", "n3"],
    ["n2", "n3"],
    ["n3", "n4"],
  ].map(([source, target], i) => ({
    id: `e${i}`,
    source,
    target,
    type: "smoothstep",
  }));
}
const seedTitles = [[
  "會員中心改版與權限整合",
  "統一會員資料與登入流程，建立清楚的跨部門協作邊界。",
  "協作中",
  "2026-09-12",
  ["會員資料管理", "角色與權限設定", "帳號安全驗證"],
]] as const;
export const initialWorkspace: Workspace = {
  version: 1,
  reports: seedTitles.map(([title, description, status, date, cases], i) => ({
    id: `report-${i + 1}`,
    title,
    description,
    status,
    date,
    cases: [...cases],
    prd: `# ${title}\n\n${description}\n\n使用情境：\n${cases.map((c) => `- ${c}`).join("\n")}\n\n本報告為示範內容，供體驗分工與流程編輯。`,
    nodes: makeNodes([...cases]),
    edges: makeEdges(),
  })),
  departments: defaultCompanyDepartments,
};
export const today = () => new Date().toLocaleDateString("sv-SE");
