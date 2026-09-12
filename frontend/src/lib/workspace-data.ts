import type { Node, Edge } from "@xyflow/react";
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
export type Report = {
  id: string;
  title: string;
  description: string;
  status: "待確認" | "協作中" | "已準備開案";
  date: string;
  prd: string;
  cases: string[];
  nodes: WorkNode[];
  edges: Edge[];
};
export type CompanyDoc = {
  id: string;
  name: string;
  category: string;
  date: string;
  content: string;
};
export type Memory = {
  id: string;
  reportId: string;
  title: string;
  date: string;
  content: string;
};
export type Workspace = {
  version: 1;
  reports: Report[];
  docs: CompanyDoc[];
  memories: Memory[];
};
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
const seedTitles = [
  [
    "會員中心改版與權限整合",
    "統一會員資料與登入流程，建立清楚的跨部門協作邊界。",
    "協作中",
    "2026-09-12",
    ["會員資料管理", "角色與權限設定", "帳號安全驗證"],
  ],
  [
    "訂單退款流程優化",
    "串聯客服、金流與訂單系統，縮短退款處理時間。",
    "待確認",
    "2026-09-11",
    ["申請退款", "退款審核"],
  ],
  [
    "數據儀表板 2.0",
    "整合營運指標，讓各團隊使用一致的數據定義。",
    "待確認",
    "2026-09-10",
    ["指標查詢", "報表匯出"],
  ],
  [
    "站內通知中心",
    "集中管理系統通知與個人訂閱偏好。",
    "協作中",
    "2026-09-09",
    ["通知收件匣", "訂閱設定"],
  ],
  [
    "企業方案訂閱管理",
    "規劃企業方案升降級與帳務管理流程。",
    "已準備開案",
    "2026-09-08",
    ["方案管理", "帳務查詢"],
  ],
  [
    "新用戶引導流程",
    "優化首次使用體驗，協助用戶完成關鍵設定。",
    "已準備開案",
    "2026-09-05",
    ["首次設定", "教學引導"],
  ],
] as const;
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
    nodes: makeNodes([...cases]).map((n) =>
      status === "已準備開案" ? { ...n, data: { ...n.data, pending: "" } } : n,
    ),
    edges: makeEdges(),
  })),
  docs: [
    {
      id: "d1",
      name: "公司組織架構.md",
      category: "組織架構",
      date: "2026-09-10",
      content:
        "產品部：需求定義與優先順序\n設計部：使用體驗與視覺設計\n前端工程部：使用者介面\n後端工程部：API 與資料服務\n品質保證部：測試與驗收\n數據部：數據定義與分析",
    },
    {
      id: "d2",
      name: "部門職掌與責任範圍.txt",
      category: "部門職掌",
      date: "2026-09-10",
      content:
        "API 由後端工程部主責；前端工程部負責介接；資料定義由數據部協作確認。",
    },
    {
      id: "d3",
      name: "產品開發協作流程.md",
      category: "既有流程",
      date: "2026-09-08",
      content: "需求釐清 → 設計與技術規劃 → 開發 → 整合測試 → 驗收。",
    },
  ],
  memories: [
    {
      id: "m1",
      reportId: "report-5",
      title: "企業方案訂閱管理",
      date: "2026-09-08",
      content:
        "方案異動由後端工程部主責，前端工程部協作呈現。適用情境：企業方案升降級。示範共識紀錄。",
    },
    {
      id: "m2",
      reportId: "report-6",
      title: "新用戶引導流程",
      date: "2026-09-05",
      content:
        "引導體驗由設計部規劃，產品部確認完成條件。適用情境：新用戶首次使用。示範共識紀錄。",
    },
  ],
};
export const today = () => new Date().toLocaleDateString("sv-SE");
