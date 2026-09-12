# Prompt 使用情境、輸入輸出與 API 對照

整理日期：2026-09-12。

依據：`C:\Users\User\IdeaProjects\seaxopenai2026-10\backend\spec.md`，SHA-256：`481588985190E5DA170A8C410344746024C93E50653205DDAEEC0B00D9048563`。

本文件整理目前規格的 AI 使用方式，供開發及 review 使用。Prompt 名稱為建議的內部命名，不代表已存在的檔案或 API。除首次拆解的輸出格式已由 spec 明定，其餘範例的外層封裝為建議；業務欄位與限制依 spec。本文未變更 spec，也不表示功能已實作。

## 1. 需要哪些 Prompt

目前可整理為 **3 種 Prompt 模板、4 種 Job**。首次分析包含拆解與歸屬兩階段；全部重新分析與僅未歸屬分析共用歸屬 Prompt。重試沿用原任務所需模板，無須新增一種判斷 Prompt。

| Prompt 建議名稱 | AI 要判斷什麼 | 預期輸入 | 預期 AI 輸出 | 使用的 Job |
|---|---|---|---|---|
| `workflow_decomposition` | 需求包含哪些工作，以及明確的直接前置關係 | UserDoc 的需求文字 | `workflows: [{key, name, description, dependsOnKeys}]` | INITIAL_ANALYSIS 第一階段 |
| `department_assignment` | 每個工作應由哪一個部門負責，或資訊不足而 UNKNOWN | 目標 Workflow 的識別 ID、名稱、描述，以及本次固定版本 GlobalMemory；ID 僅供對應輸出 | 每個目標 ID 恰好一筆 `assignmentStatus` 與 `departmentId` | INITIAL_ANALYSIS 第二階段、ALL_REANALYZE、UNASSIGNED_ANALYZE |
| `organization_feedback` | 從結案結果及修改歷程中，哪些部門職能描述需要改善 | 結案時最終 Report（含 Workflows 與相依）、完整 ReportDiff、每次執行開始時最新 GlobalMemory | 全部原部門的 `id`、`name`、`description`；只允許 description 改變 | FEEDBACK |

## 2. 觸發情境與對應 API

以下均為完整 API 路徑。所有 POST 需帶 UUID 格式的 `Idempotency-Key` header。表內 `{...}` 為欄位表示法；`?` 表示可省略。

| 使用情境 | API 與請求 | Job / Prompt | 後端提供給 AI 的輸入 | AI 輸出與處理 | API 即時回應 |
|---|---|---|---|---|---|
| 建立專案並拆解工作 | `POST /api/v1/projects`；`{name, userDoc: {content}}` | INITIAL_ANALYSIS / workflow_decomposition | UserDoc.content | 1–200 個工作，含暫時 key 與 dependsOnKeys；後端驗證圖並配置正式 UUID | 202 `{project, report, job}`；Report 起始 version 為 0 |
| 首次決定部門 | 同一個 `POST /api/v1/projects` 觸發，不另呼叫 API | 同一 INITIAL_ANALYSIS / department_assignment | 第一階段工作之 ID、名稱、描述＋接受任務時的 GlobalMemory | 每個工作 ASSIGNED＋有效部門 ID，或 UNKNOWN＋null；全部驗證後一次寫入工作、相依、Diff 及 Job 成功 | 沿用建立專案的 202；完成後另外查詢 |
| 全部重新分析部門 | `POST /api/v1/projects/{projectId}/analyses`；`{type: ALL_REANALYZE, expectedReportVersion, reason}` | ALL_REANALYZE / department_assignment | 所有既有工作的 ID、名稱、描述快照＋接受任務時的 GlobalMemory | 僅更新歸屬；接受請求時先清除所有 AI／USER 歸屬與 UNKNOWN，成功後整批套用 | 202 `{job, reportVersion}`；版本為清除後版本 |
| 僅分析未歸屬與不知道 | `POST /api/v1/projects/{projectId}/analyses`；`{type: UNASSIGNED_ANALYZE, expectedReportVersion, reason?}` | UNASSIGNED_ANALYZE / department_assignment | 接受時狀態為 UNASSIGNED／UNKNOWN 的目標 ID、名稱、描述快照＋固定 GlobalMemory | 僅更新目標歸屬，保留 ASSIGNED 項目；不預先清除 | 202 `{job, reportVersion}` |
| 結案後改善組織職能 | `POST /api/v1/projects/{projectId}/close`；`{expectedReportVersion, reason?}` | FEEDBACK / organization_feedback | 結案凍結的最終 Report、完整 ReportDiff＋每次執行時最新 GlobalMemory | 驗證全部部門 ID、名稱、數量不變，只更新 description；成功後建立新 GlobalMemory 版本 | 首次 202 `{project, reportVersion, feedbackJob}`；已結案用新 key 重送為 200，回傳同一任務 |
| 手動重試失敗任務 | `POST /api/v1/jobs/{jobId}/retry`；`{}` | 沿用原 Job type 及其 Prompt | 報告分析沿用原輸入；FEEDBACK 使用原結案快照及重新讀取的最新 GlobalMemory | 同原任務的輸出與驗證；同一 Job 新增執行批次 | 202 `{job}` |

202 僅代表任務已接受，不代表 AI 完成。首次分析兩階段共用同一次 Job 嘗試的 120 秒上限。

## 3. Prompt 輸入與輸出細節

### 3.1 workflow_decomposition

輸入範例，外層 `content` 為建議的 Prompt 資料封裝：

```json
{
  "content": "先建立退款申請，再執行退款審核。"
}
```

AI 輸出範例，結構已由 spec 明定：

```json
{
  "workflows": [
    {
      "key": "refund_application",
      "name": "退款申請",
      "description": "建立使用者提交退款申請的流程。",
      "dependsOnKeys": []
    },
    {
      "key": "refund_review",
      "name": "退款審核",
      "description": "對已提交的退款申請進行審核。",
      "dependsOnKeys": ["refund_application"]
    }
  ]
}
```

| 項目 | 規則 |
|---|---|
| 判斷依據 | UserDoc；此階段不決定部門。 |
| 暫時 key | 本次結果內唯一、非空，最多 200 字元；不出現在公開 Report。 |
| 相依 | 僅建立需求足以支持的直接前置關係；不確定時不臆造。空陣列表示未建立前置限制。 |
| 數量／文字 | 工作 1–200 個；名稱 1–200 字元、描述 1–10,000 字元，必填文字不可只有空白。 |
| 後端驗證 | key 參照存在、無重複／自我相依／循環，驗證後映射正式 UUID。 |
| 寫入時機 | 歸屬階段也成功後才整批提交，不能留下部分工作。 |

### 3.2 department_assignment

建議內部輸入為 `{workflows: [{id, name, description}], globalMemory: GlobalMemory}`。GlobalMemory 採 spec 完整模型；其業務內容為 departments 與 relationshipsDescription，版本資訊供後端追蹤。下例使用一個部門的示意組織資料：

```json
{
  "workflows": [
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "name": "退款審核",
      "description": "對已提交的退款申請進行審核。"
    }
  ],
  "globalMemory": {
    "version": 1,
    "departments": [
      {
        "id": "00000000-0000-4000-8000-000000000021",
        "name": "客服部門",
        "description": "負責受理及審核使用者退款申請。"
      }
    ],
    "relationshipsDescription": "",
    "source": "INITIAL",
    "sourceProjectId": null,
    "createdAt": "2026-09-12T08:00:00Z"
  }
}
```

建議內部輸出範例；`assignments` 與 `workflowId` 為本文件建議的封裝命名，spec 已要求每個目標恰好一筆結果及以下狀態欄位：

```json
{
  "assignments": [
    {
      "workflowId": "00000000-0000-4000-8000-000000000011",
      "assignmentStatus": "ASSIGNED",
      "departmentId": "00000000-0000-4000-8000-000000000021"
    }
  ]
}
```

資訊不足的有效結果範例：

```json
{
  "assignments": [
    {
      "workflowId": "00000000-0000-4000-8000-000000000011",
      "assignmentStatus": "UNKNOWN",
      "departmentId": null
    }
  ]
}
```

| 項目 | 規則 |
|---|---|
| 歸屬依據 | 僅 Workflow 名稱、描述與 GlobalMemory；識別 ID 用於對應結果。 |
| 不帶入歸屬 Prompt | UserDoc、dependsOnWorkflowIds、前置工作的部門、舊歸屬、舊 ReportDiff、此次分析請求的 reason。 |
| UNKNOWN | 無適合部門、資訊不足或候選無法區分時使用；不能回傳 UNASSIGNED。全部 UNKNOWN 也可成功。 |
| 保留欄位 | 重分析不新增、刪除工作，也不修改 ID、名稱、描述與相依關係。 |
| 後端補值 | assignmentSource 設為 AI；版本、時間、Diff 由後端建立。 |
| 錯誤區別 | 逾時、API 失敗或格式錯誤按 Job 失敗處理，不能偽裝為 UNKNOWN。 |

### 3.3 organization_feedback

建議內部封裝與內容如下；欄位名稱為建議，資料內容依 spec：

| 輸入欄位 | 內容 | 固定或更新 |
|---|---|---|
| `finalReport` | Report 欄位及完整 Workflows，包含最終歸屬、來源與 dependsOnWorkflowIds | 結案時凍結，每次重試相同 |
| `reportDiffs` | 完整 ReportDiff 事件；包含 before／after、changedFields、reason、source 及版本等 | 結案時凍結，每次重試相同；不能只讀列表第一頁 |
| `globalMemory` | 最新已提交的完整 GlobalMemory | 每次執行嘗試重新讀取 |

建議內部輸出範例，假設原組織表只有以下一個部門；實際必須回傳全部原部門：

```json
{
  "departments": [
    {
      "id": "00000000-0000-4000-8000-000000000021",
      "name": "客服部門",
      "description": "負責受理及審核使用者退款申請，審核前須取得申請內容。"
    }
  ]
}
```

AI 不負責產生新版本號、sourceProjectId 或時間。後端保留原 relationshipsDescription，驗證部門 ID、名稱與數量後，建立 `source = FEEDBACK`、`sourceProjectId = 結案專案 ID` 的新版本。

UNKNOWN 不能當成已確認歸屬；UNASSIGNED 也沒有已指定部門。結案是確認報告，不代表已追蹤並證明工作實際執行完成。單一專案的相依關係不能直接等同永久部門上下游規則。

## 4. 查詢結果與不呼叫 AI 的 API

| 情境 | API | 回應／處理 | 是否呼叫 AI |
|---|---|---|---|
| 初始化組織表 | `POST /api/v1/global-memory` | body 為 `{departments: [{id, name, description}], relationshipsDescription}`；201 GlobalMemory v1，只允許一次 | 否 |
| 查詢組織表 | `GET /api/v1/global-memory?version=1` | 200 GlobalMemory；省略 version 取最新 | 否 |
| 查詢專案列表 | `GET /api/v1/projects` | status 可選；分頁 Project 列表 | 否 |
| 查詢專案詳情 | `GET /api/v1/projects/{projectId}` | project、userDoc、reportVersion、activeAnalysisJobId、feedbackJobId | 否 |
| 查詢任務 | `GET /api/v1/jobs/{jobId}` | Job＋result；報告分析成功為 `{reportVersion}`，回饋成功為 `{globalMemoryVersion}`，其餘 null | 否 |
| 查詢報告結果 | `GET /api/v1/projects/{projectId}/report` | 完整 Report＋workflows；依圖做穩定拓撲排序 | 否 |
| 查詢修改歷程 | `GET /api/v1/projects/{projectId}/report-diffs` | 按 toVersion 升冪的分頁 ReportDiff | 否 |
| 手動新增工作 | `POST /api/v1/projects/{projectId}/workflows` | body：name、description、expectedReportVersion，另可帶 dependsOnWorkflowIds、assignmentStatus、departmentId、reason；201 `{workflow, reportVersion}` | 否 |
| 手動修改工作 | `PATCH /api/v1/workflows/{workflowId}` | body：expectedReportVersion＋至少一個可改工作欄位，reason 可選；200 `{workflow, reportVersion}` | 否 |
| 手動刪除工作 | `DELETE /api/v1/workflows/{workflowId}` | query：expectedReportVersion、可選 reason，無 body；200 `{deletedWorkflowId, reportVersion}` | 否 |

列表分頁為 limit（預設 50，上限 200）及 offset（預設 0）。手動修改名稱、描述、相依或歸屬都不自動呼叫 AI，需另送 analyses 請求。

報告分析完成後，以 Job.result.reportVersion 確認完成版本，再讀取 Report；Report API 取得的是當前報告，若之後又有操作，版本可能更高。回饋完成後可用 Job.result.globalMemoryVersion 查詢該次產生的指定 GlobalMemory 版本。

## 5. 程式檢核與失敗處理

以下由後端確定性邏輯負責，不需要額外 Prompt。

| 檢核／動作 | 規則 |
|---|---|
| API 前置條件 | 未初始化不能建專案；首次分析成功前禁止手動修改、其他分析及結案。 |
| 狀態／版本 | 分析進行中拒絕修改、其他分析與結案；手動變更、分析、結案比對 expectedReportVersion。 |
| 無分析目標 | ALL 無工作為 NO_WORKFLOWS；UNASSIGNED 無目標為 NO_UNASSIGNED_WORKFLOWS；均 409 且不建 Job。 |
| 相依合法性 | 檢查同 Report、存在、無重複／自我相依／循環；刪除有直接依賴者時拒絕，回傳 WORKFLOW_HAS_DEPENDENTS。 |
| 歸屬輸出 | 目標 ID 集合完全吻合，每個恰好一次；ASSIGNED 配有效部門，UNKNOWN 配 null；字數及 schema 合法。 |
| ALL 失敗 | 保留 CLEAR 後的 UNASSIGNED，不恢復舊歸屬。 |
| UNASSIGNED 失敗 | 保留原目標 UNASSIGNED／UNKNOWN，已有 ASSIGNED 也不變。 |
| 結案／回饋 | 同交易保存結案快照及建 FEEDBACK；失敗不撤銷 CLOSED；每個專案只有一個 FEEDBACK。 |
| 回饋輸出 | 只允許改 description；不新增、刪除、改名部門，不改 ID 或 relationshipsDescription。 |
| 記憶提交 | 同時最多一個 FEEDBACK 執行；每次讀最新版本、提交比對版本；新 GlobalMemory、任務成功及回饋唯一紀錄同交易寫入。 |
| 自動重試 | 每次 Job 嘗試總上限 120 秒；最多 3 次，等待 5／30 秒或供應商更長要求；SDK 隱含重試關閉。 |
| 可重試類型 | 連線、逾時、限流／5xx、AI 輸出驗證失敗、記憶版本衝突；金鑰／權限及永久請求錯誤直接 FAILED。 |
| 手動重試 | FAILED 才可；同 Job 新批次 3 次，保留歷史。報告分析須 OPEN 且版本未變；ALL 不重複 CLEAR。 |
| 重複請求／worker | POST 冪等、交易鎖、執行租約及執行權識別碼，防止重複套用與過期結果提交。 |

## 6. 先前期待但目前 spec 尚未定義的能力

| 能力 | 目前狀態與影響 |
|---|---|
| AI 回傳部門判斷原因 | 目前歸屬模型未定義 explanation／evidence 欄位。ReportDiff.reason 是使用者操作理由，不能當成 AI 判斷原因。 |
| 引用歷史專案佐證職責 | GlobalMemory 沒有歷史案例集合或逐項來源；目前歸屬 Prompt 不包含跨專案檢索結果。 |
| 區分本次專案安排與永久職責／能力 | 目前沒有專門的分類輸出、證據欄位或相應檢核契約；不能宣稱此能力已被規格保證。 |
| 結構化組織架構與上下游 | 目前以 relationshipsDescription 文字保存；回饋不能更新此欄位。 |
| 永久保存共同知識及案例來源 | 可改善部門 description，但未定義獨立知識項目；sourceProjectId 只表示產生本版本的專案。 |

以上為需求差異紀錄，不列為已存在的 Prompt 或 API。若後續 spec 納入，需同步更新資料模型、Prompt 輸入輸出、驗證規則及 API 回應。

另見同目錄 `global-memory-expanded-design.md` 與 `global-memory-expanded-example.json`：這兩份為依使用者期待提出的擴充設計，包含案例、證據、知識範圍、AI 原因回傳與 API 調整；本文件前述表格仍描述現行 spec 契約。
