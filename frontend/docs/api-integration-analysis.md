# API 串接分析

分析日期：2026-09-12。以 `/Users/eddieliu/Desktop/api.html` 內嵌的 OpenAPI 3.1.0（Seax API 0.1.0）為最終契約，並參照 `backend/spec.md` 補足執行規則。本次僅分析，未修改應用程式或呼叫正式服務。

## 結論

API 共 14 個操作，base path 為 `/api/v1`，涵蓋組織初始化、專案、Workflow、重新歸屬、歷程、結案與非同步任務。主要流程可串接，但目前 Use Case 示範模型不能直接當作 API payload。

建議保留卡片式呈現，改以 Workflow 作為每張卡片的資料單位；前端維護載入狀態與草稿，伺服器管理正式資料。自由文字回饋、多部門協作標籤與反覆匯入公司資料，均不能宣稱現有 API 已支援。

`backend/2026-09-12-department-feedback-knowledge-design.md` 為不同版本的設計：包含多部門 `departmentIds`、不同任務狀態、成功後才替換歸屬等內容，與最終 HTML 不符。串接時不採用這些舊定義。

## 現況與修改位置

| 檔案 | 現況 | 串接調整 |
|---|---|---|
| `src/lib/workspace-store.ts` | 整份 Workspace 讀寫 localStorage，失敗回退示範資料 | 改管理 API 查詢結果、逐專案版本、任務與錯誤；正式模式失敗不能回退假資料 |
| `src/lib/workspace-data.ts` | Report 混合專案、需求、圖形及 Use Case；部門為名稱陣列 | 分開 Project、UserDoc、Report、Workflow、GlobalMemory、Job；以 UUID 關聯部門 |
| `src/components/workspace.tsx` / `NewReport` | 定時器產生固定範本 | POST 專案後輪詢 Job，成功再取得報告 |
| 同檔 / `ReportList` | 全部本機資料搜尋、狀態篩選與更新日期排序 | 分頁載入 Project；調整列表欄位及搜尋範圍 |
| 同檔 / `Company` | 匯入可覆蓋部門，忽略 relationshipsDescription；組織圖按固定部門名稱排列 | GET 共用組織資料；僅未初始化時 POST；保存並呈現組織關係文字 |
| `src/components/use-case-report.tsx` | 多部門、文字回饋逐字存本機 | 顯示 Workflow 的單部門、歸屬狀態、相依；編輯以明確提交保存 |
| `src/components/report-actions.tsx` | 定時器重分析；準備開案只改本機狀態 | 改為 analyses / close 與 Job 狀態；加入真正鎖定規則 |
| `src/components/workflow-editor.tsx` | 保留的舊圖形編輯元件，目前主畫面未使用 | 若要恢復圖形功能，另將邊轉為 dependsOnWorkflowIds；不能直接保存整份 nodes / edges |
| `next.config.ts` | `output: "export"`，部署靜態 out 目錄 | 由瀏覽器連後端，或另配置同來源代理 |

## 功能與 API 對照

以下路徑均加上 `/api/v1`。

| 功能 | 請求 | 串接要點 |
|---|---|---|
| 讀取公司資料 | GET `/global-memory` | 可用 version 查歷史；未初始化為 404，須區別版本不存在 |
| 首次匯入 | POST `/global-memory` | `{departments, relationshipsDescription}`；僅一次，已初始化回 409 |
| 新增需求 | POST `/projects` | `{name, userDoc:{content}}`；202 回傳 project、空 report、job |
| 專案列表 | GET `/projects?limit=50&offset=0` | 可篩 OPEN / CLOSED；回 items、total、limit、offset |
| 原始需求與任務關聯 | GET `/projects/{projectId}` | 取得 userDoc、reportVersion、activeAnalysisJobId、feedbackJobId |
| 分析結果 | GET `/projects/{projectId}/report` | 取得版本及拓撲排序的 workflows |
| 新增工作 | POST `/projects/{projectId}/workflows` | name、description、expectedReportVersion 必填 |
| 編輯工作 | PATCH `/workflows/{workflowId}` | 版本加實際修改欄位；可附修改理由 reason |
| 刪除工作 | DELETE `/workflows/{workflowId}` | expectedReportVersion 與選填 reason 放 query；被依賴時拒絕 |
| 重新判定歸屬 | POST `/projects/{projectId}/analyses` | ALL_REANALYZE 或 UNASSIGNED_ANALYZE；前者 reason 必填 |
| 修改紀錄 | GET `/projects/{projectId}/report-diffs` | 分頁讀取 before / after、reason、版本及事件 |
| 簽核結案 | POST `/projects/{projectId}/close` | expectedReportVersion；回 CLOSED 專案與 feedbackJob |
| 任務狀態 | GET `/jobs/{jobId}` | 使用真正狀態，無百分比進度欄位 |
| 手動重試 | POST `/jobs/{jobId}/retry` | body 為 `{}`；僅 FAILED 且符合後端狀態及版本限制 |

## 資料與產品語意差異

1. **Use Case 與 Workflow**：API 沒有 Use Case 群組、協作部門陣列、獨立報告摘要、交付物或驗收欄位。以 Workflow UUID 作卡片 key，name / description 直接呈現。不要將額外 UI 欄位放入 JSON；schema 禁止額外欄位。
2. **歸屬**：單一 departmentId 配合 assignmentStatus。ASSIGNED 顯示部門；UNASSIGNED 顯示「未歸屬」；UNKNOWN 顯示「不知道」。後兩者均為 null 部門但意義不同。assignmentSource 由後端產生，前端不得送入。
3. **自由文字回饋**：沒有獨立 feedback 欄位或儲存端點。reason 是實際修改、分析或結案的理由，不等同可反覆編輯的每卡回饋；PATCH 只傳 reason 不合法。依最終 API，應改成修改工作時填理由，另在結案時填整體說明。若保留目前文字框，只能清楚標為本機草稿，不會自動進入組織記憶。
4. **狀態**：Project 只有 OPEN / CLOSED，原本「待確認／協作中／已準備開案」不能一對一映射。建議顯示「開放／已結案」，另外顯示任務狀態；不要從回饋是否填寫推導伺服器狀態。
5. **結案**：「準備開案」現有文案未表達永久鎖定。API close 後不能編輯、再分析或重開；按鈕應明確表達「確認分工並結案」。FEEDBACK 非同步執行且失敗不撤銷 CLOSED。只要符合首次成功、非空報告、無執行中分析等條件，即使有 UNKNOWN / UNASSIGNED 仍可結案。
6. **重分析**：只重新判定歸屬，保留工作 ID、名稱、描述與相依。ALL_REANALYZE 在受理時清除全部人工與 AI 歸屬，失敗不還原；UNASSIGNED_ANALYZE 涵蓋 UNASSIGNED 及 UNKNOWN，不動 ASSIGNED。不是重新生成 Use Case，也不會使用本機文字回饋重新拆解。
7. **公司資料**：不可再次初始化覆蓋；後續只由 FEEDBACK 改善部門 description。relationshipsDescription 是文字，不能據此假裝已有結構化父子節點。現有固定名稱組織圖不適用任意部門資料，應先以通用部門清單加關係說明呈現。
8. **列表**：ProjectPage 不含摘要、updatedAt、工作數、部門數或 Job 狀態，也沒有搜尋或排序 query。第一版建議以名稱、建立時間、OPEN / CLOSED 為主。若維持全文搜尋與報告更新時間排序，需取得全部相關分頁及額外報告資料，或由後端新增列表能力；不能只搜尋當前頁卻標示為全站搜尋。
9. **相依**：B.dependsOnWorkflowIds 包含 A 表示 A → B。列表相鄰不表示相依，不可將上方卡片索引直接解讀為必須依序執行。畫布座標可為本機偏好，正式相依要寫回工作 API。
10. **輸入限制**：名稱 1–200、需求 1–100000、工作描述 1–10000、reason 1–2000 Unicode code points，必填不能只有空白；空 reason 應省略。目前 2 字名稱、20 字需求與名稱 maxLength=80 是前端額外限制，需要統一。TXT / Markdown 可繼續由瀏覽器讀成文字，送 JSON，不送 multipart；整體 JSON body 上限 10 MiB。

## 建議串接架構

新增以下職責，名稱為實作建議，尚未建立程式：

- `src/lib/api/types.ts`：由 HTML 內嵌 OpenAPI 抽出可追蹤的 JSON 契約，再產生或維護 DTO；避免把舊 Report 強制轉型為 API Report。
- `src/lib/api/client.ts`：集中 base URL、JSON、錯誤格式、AbortSignal，以及 POST 冪等 header。
- `src/lib/api/projects.ts`、`workflows.ts`、`memory.ts`、`jobs.ts`：按領域封裝端點，UI 不散落 URL。
- 查詢與操作層：以 projectId 儲存詳情、Report 與 version，工作 mutation 成功後重新讀取報告及詳情；歷程按需讀取。
- 本機草稿與伺服器快取分開；初次正式載入應是 loading / empty / error，不以 initialWorkspace 代替。舊示範報告沒有遠端 ID 關聯，不自動上傳或合併。

現有 hash 導航可沿用，但報告 URL 的識別值應為 projectId，不能混用 report.id。切換專案時取消或隔離舊請求，避免晚到回應覆蓋目前專案。

### 非同步流程

1. GET 公司資料，確認已初始化後允許建立。
2. POST projects，立即保存回傳的 projectId、report、jobId；202 只表示受理。
3. 輪詢 GET jobs。建議初始約 1–2 秒，再按情況放慢；取消重疊輪詢，離頁停止，重返後重新取得任務關聯。這是前端策略，不是 API 要求。
4. QUEUED / RUNNING / RETRY_WAIT 顯示排隊、分析中、等待重試，不能自行計時宣稱完成。RETRY_WAIT 已由後端處理，勿每輪呼叫 retry。
5. SUCCEEDED 後重新 GET report 與 project 詳情；FAILED 顯示 error，保留需求與專案，提供符合規則的重試。
6. 分析期間禁用新增、修改、刪除、再分析及結案；CLOSED 持續只讀。
7. 結案成功立即顯示已結案，另追蹤 feedbackJob；成功後刷新最新 GlobalMemory，失敗提供回饋任務重試。

### 寫入一致性

- 所有 POST 使用 UUID Idempotency-Key。每個新的使用者操作建立一次，同一操作遭網路中斷時以相同 key 與相同 body 重送；修改 body 後是新操作。必要時暫存待確認請求，以支援重新整理後恢復。
- 寫入攜帶最新 expectedReportVersion；同一報告的編輯提交應序列化，不能多張卡片同時用舊版本寫入。
- 409 REPORT_VERSION_CONFLICT 時刷新正式資料、保留未送出草稿並提示重新檢視，不自行覆寫或無限重送。
- 分別處理 PROJECT_BUSY、PROJECT_CLOSED、INITIAL_ANALYSIS_REQUIRED、STALE_JOB_INPUT、NO_WORKFLOWS、NO_UNASSIGNED_WORKFLOWS。
- WORKFLOW_HAS_DEPENDENTS 顯示 dependentWorkflowIds 對應名稱，先讓使用者解除相依；循環錯誤保留修改草稿。
- PATCH / DELETE 網路回應不明時先重新讀取資料確認，不以 POST 的冪等機制假設其結果。成功寫入後以回傳版本為準，重新取得完整拓撲排序。

## 尚待後端環境或契約補足

1. **實際連線位置**：HTML 只提供相對路徑，未提供正式／測試網域。靜態前端需要完整 API base URL（例如由公開建置設定指定），或另有 `/api/v1` 同來源代理。若跨來源，後端須允許前端 origin、所需方法及 Content-Type / Idempotency-Key headers；靜態 out 本身不提供代理服務。
2. **認證**：OpenAPI 沒有 security 定義，`spec.md` 將登入與權限列為 POC 範圍外。若實際服務另有 cookie / token，須再確認，不先自行假設。
3. **失敗任務恢復**：ProjectDetails 只有 activeAnalysisJobId，沒有 latestAnalysisJobId 或 job 列表。依欄位名稱與 active 定義，需確認 FAILED 後是否仍可取得原分析 Job ID；若變 null，跨瀏覽器或清除儲存後可能找不到首次失敗任務以重試。本機保存 jobId 只能緩解，不能完整解決。建議補 latestAnalysisJobId 或任務列表。
4. **列表能力**：如需保留原本摘要、統計、更新時間排序與全域搜尋，需協議投影欄位與查詢參數；目前契約不提供。

上述缺口不妨礙先實作 DTO、client 與讀取流程；真實端到端驗證需要可存取的後端服務。

## 實作順序與驗收

1. 固定契約快照、DTO、client、錯誤及冪等處理；建立正式資料與草稿邊界。
2. 串公司資料、專案列表、詳情、報告讀取；調整卡片到 Workflow 欄位。
3. 串新增需求、Job 輪詢、重整恢復與失敗重試，完成第一條真實分析流程。
4. 串工作編輯與修改理由、版本衝突、相依關係及歷程。
5. 串兩種重新歸屬、結案、回饋任務及公司資料刷新。

重點驗收：建立逾時重送不重複建案；刷新後恢復執行中任務；分析失敗不生成示範結果；UNKNOWN 正確呈現；過期版本不覆寫；全部重新歸屬失敗仍顯示清除後狀態；循環及被依賴刪除錯誤可理解；結案後不能再編輯；回饋失敗仍維持 CLOSED；未初始化與重複初始化有明確處理；分頁搜尋不誤稱全部結果。

分析驗證範圍：已抽取並讀取 HTML 的 14 個 API 操作與 27 個 schema，對照目前前端資料、主要互動和 backend/spec.md。未測試伺服器可用性、CORS、實際 HTTP 回應或 AI 任務。

## 實作進度補記

前端現已依本分析串接 API；操作流程與環境設定見 `frontend/README.md`。保留一筆獨立唯讀示範報告，舊本機工作空間不再作為正式資料來源。`docs/openapi.json` 是本次採用的契約快照。上方「尚未建立程式」等文字為分析當時狀態，後續以程式及 README 為準。2026-09-12 已設定使用者提供的 `https://retro-agreement-seeing-reuters.trycloudflare.com/api/v1` 並通過瀏覽器唯讀驗證（公司資料、專案列表）；尚未以真實服務執行寫入及 AI 任務驗收。
