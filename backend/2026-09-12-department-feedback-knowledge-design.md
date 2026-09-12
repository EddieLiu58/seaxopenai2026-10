# 後端 POC 開發文件：依 backend/spec.md 簡化

- 更新：2026-09-12。
- 預設開發位置：C:/Users/User/IdeaProjects/seaxopenai2026-10/backend。
- 主要產品依據：該目錄 spec.md；衝突時遵循原 spec。
- 本版取代前版完整治理設計；archive-full-design 僅為歷史，不是本期要求。
- 本輪只更新文件與範本，未實作應用或驗證框架／模型可用性。

## 1. 核心流程

使用者上傳一份純文字 UserDoc，AI 整理成 Workflows，參考 Global Memory 建議部門歸屬，組成可編輯 Report。所有編輯及重分析保存 ReportDiff。取得共識後完成 Project，以最終 Workflows、Report、所有 ReportDiff 更新 Global Memory，讓下次分析使用新組織敘述。

| 名詞          | 定義                                      |
| ------------- | ----------------------------------------- |
| Project       | 一次專案分析容器與識別                    |
| UserDoc       | Project 唯一的一份純文字需求              |
| Workflow      | 專案內的工作流程／任務，不是全域 Use Case |
| Report        | 當前 Workflows 與歸屬的聚合結果           |
| ReportDiff    | 使用者修改或 AI 重分析的前後差異          |
| Global Memory | 組織架構與職能敘述，供 AI 分析            |

## 2. Context 與永久層

Context 保存 Project、唯一 UserDoc、目前 Workflows、完整 ReportDiff 與 AI 工作快照，全部存入 PostgreSQL。Report 是聚合 DTO，不建立另一套可獨立修改的 Report 資料。一般編輯與重分析不更新 Global Memory。

Global Memory 用版本化 JSONB 保存部門 ID、名稱、描述、職責與協作敘述。一次結案即可由 AI 產生新版本，經基本結構驗證後發布。不需要兩個專案、候選成熟度、原子事實證據表或額外逐項批准。保留來源 Project、Report revision 與基礎 Memory 版本，作最小追溯。

結案後 context 保留，但業務內容不可改寫；只有回饋工作狀態與結果可更新。主檔中的組織 ID 由初始資料定義，本期 AI 更新既有組織敘述，不加入新組織審核系統。

## 3. 上傳與初始分析

建立 Project，保存唯一純文字 UserDoc，自動排入初始分析。AI 讀文件與最新 Memory，產生 Workflow 名稱、描述及歸屬；成功後儲存初始 Report 與 INITIAL_ANALYSIS 差異，失敗保留文件供重試。

補充預設：用 PostgreSQL text 保存「Project 層級檔案」，不用物件儲存；POC 不提供替換 UserDoc API。Workflow departmentIds 為零到多個既有部門 ID；空陣列代表未歸屬，不加入 OWNER 等角色。這些是實作預設，不是原 spec 明定的基數或傳輸方式。

## 4. 編輯與重新歸屬

### 4.1 儲存變更

新增、修改、刪除 Workflow（含歸屬修改）皆與 ReportDiff 同一交易提交。Diff 保存 type、Workflow ID、完整 before/after、前後 reportRevision、時間及選填 reason。新增 before=null，刪除 after=null。刪除的歷史留在 Diff。

### 4.2 全部重新分析

接受 ALL_REANALYZE 與非空 reason。保留目前 Workflow 的 ID、名稱與描述，將全部歸屬清空作為本次 AI 輸入，重新分析全部歸屬，保存完整 ReportDiff。此明確操作允許覆蓋人工歸屬。

補充預設：不先清掉已保存結果；AI 成功且基礎 revision 未變後才交易替換，失敗保留原 Report。重新歸屬不等於重新生成 Workflows。

### 4.3 未歸屬分析

UNASSIGNED_REANALYZE 只處理 departmentIds=[] 的 Workflow，不改已有歸屬者。成功保存 Diff；若無目標回 noOp=true，不呼叫 AI、不增加 revision。

## 5. 結案與回饋

使用者取得共識後按完成。後端檢查 expectedReportRevision，在同一交易將 Project 設為 CLOSED，固定最終 Workflows／Report 與全部 ReportDiff 清單，建立 FEEDBACK 工作。

結案後不得編輯、刪除 Workflow、重新歸屬或替換 UserDoc。不提供結案修訂、重新開啟、投票或部分知識批准流程。原 spec 未規定未歸屬 Workflow 阻擋結案，本期不增加限制；AI 不可將未歸屬改寫成已確認責任。

AI 讀最新 Global Memory、結案 Workflows、Report 與所有 ReportDiff，產生新的組織敘述。Prompt 要求區分專案安排與通用職能；移除歸屬不等於沒有能力；沒有理由不得捏造；最終 Report 決定本案最終分工，Diff 解釋變更歷程。這些是分析原則，不增加人工審核。

結構與既有組織 ID 驗證成功後發布 Memory。Memory 更新不自動改寫其他 Project 的 Report，下次分析使用新版本，使用者可主動重分析開放中的 Project。

## 6. 建議最小資料模型

以下表與欄位為實作預設，原 spec 未規定精確 DDL。

| 資料表                | 主要欄位                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| project               | id, name, status, report_revision, last_analysis_memory_version_id, closed_at                                                       |
| user_doc              | id, project_id UNIQUE, text, created_at                                                                                             |
| workflow              | id, project_id, title, description, department_ids JSONB, sort_order                                                                |
| report_diff           | id, project_id, type, reason, before_revision, after_revision, changes JSONB, created_at                                            |
| global_memory_version | id, version UNIQUE, base_version_id, source_project_id, source_report_revision, content JSONB, created_at                           |
| ai_job                | id, project_id, type, status, base_report_revision, input JSONB, output JSONB, attempt_count, next_retry_at, locked_at, error JSONB |

Report 是查詢 DTO；feedbackStatus 由結案 FEEDBACK 工作計算。Global Memory 取最高成功發布版本，初始版本 source_project_id=null。AI 未發布輸出留在 ai_job.output，不直接當成現行 Memory。

## 7. 非同步與一致性

使用 Spring 執行器及 PostgreSQL 工作表，不加訊息中介。工作狀態 PENDING、PROCESSING、COMPLETED、FAILED；保存快照、嘗試次數、重試時間與錯誤，啟動時恢復未完成工作。

- Workflow 修改與 Diff 同一交易；expectedReportRevision 避免覆蓋。
- AI 分析完成須檢查 Project 仍開放且 revision 未變；否則回報衝突，不覆蓋新編輯。
- FEEDBACK 失敗時 Project 仍 CLOSED。重試使用同一結案 Report／Diff，不提供修改報告的後門。
- Memory 發布比較 baseVersion；若別案先發布，以最新 Memory 重做同一結案回饋，不能直接覆蓋他案改進。
- 同一結案 Project 最多發布一次 Memory，以來源 Project 唯一約束及冪等處理防重複；已發布重試回既有結果。
- 回饋失敗保留現行有效 Memory，回傳 FAILED 與可重試資訊。不建立原子事實的過期摘要排除系統。
- 必須送入所有 ReportDiff；超出模型限制時明確失敗，不默默截成最近十筆。POC 不另建分批摘要系統。
- 修改與結案使用 Idempotency-Key，同 key 同內容回既有結果、不同內容回 409。

## 8. 建議 REST API

所有路徑以 /api/v1 開頭；以下為主 spec 的實作映射。

```http
POST   /projects
POST   /projects/{projectId}/user-doc
GET    /projects/{projectId}/report
GET    /projects/{projectId}/report-diffs
POST   /projects/{projectId}/workflows
PATCH  /projects/{projectId}/workflows/{workflowId}
DELETE /projects/{projectId}/workflows/{workflowId}
POST   /projects/{projectId}/analyses
POST   /projects/{projectId}/complete
GET    /ai-jobs/{jobId}
POST   /ai-jobs/{jobId}/retry
GET    /global-memory
```

analyses 支援 ALL_REANALYZE / UNASSIGNED_REANALYZE；首次分析由上傳觸發。AI 工作回 202 與 jobId；完成回 CLOSED 與 feedback jobId；CRUD 回新 revision。無未歸屬目標回 200/noOp=true。

Project 結案、revision 衝突、重複文件或無效重試回 409；不存在回 404；格式錯誤或空白必填 reason 回 400。Swagger 提供一致錯誤 JSON 與成功範例。

不提供 Meeting、候選批准、人工知識升降級、結案修訂及影響提示 API。

## 9. 技術與部署

主 spec：Java 26、Spring Boot 4（Sprint 為拼字誤植）、Gradle、Swagger、OpenAI API、PostgreSQL Docker Compose。採單體 Controller → Service → Repository。

輕量實作建議：JPA、Flyway、可替換 AI client；模型與金鑰使用環境變數，SDK／模型選型於實作時依可用性確認，不沿用舊版未驗證的固定模型預設。

Compose 啟動 PostgreSQL 並保留 named volume；應用可由 Gradle 啟動。無需 NoSQL、Redis、訊息中介或物件儲存。完整帳號角色與固定 Token 都不列為來源 spec 的必要需求；敏感設定不提交 Git。

## 10. 驗收

1. 一 Project 一份純文字 UserDoc，上傳後自動分析歸屬。
2. Workflow 新增、修改、刪除都與 ReportDiff 一起保存。
3. 全部重分析必填 reason，重做全部歸屬；Workflow ID 與文字不變。
4. 未歸屬分析只處理空 departmentIds，不改已有歸屬。
5. AI 失敗或 revision 衝突不丟失原 Report。
6. 完成後 Project 不可編輯或重分析，重試不得繞過封存。
7. 結案回饋包含最終 Workflows、Report 與所有 ReportDiff。
8. 一次結案可發布新 Memory，無兩案門檻及額外批准。
9. 回饋失敗保留舊 Memory、Project 仍 CLOSED，可重試且不重複發布。
10. 並行結案更新不覆蓋先前已發布成果。
11. 下次分析使用最新 Memory；既有 Report 不自動變動。
12. Swagger 可演示所有流程；日常測試使用 Stub／Mock，不呼叫付費 API。

差異說明見 spec-differences.md；資料範本見 feedback-data-examples-guide.md。主 spec 未定細節與本版預設清楚分開，不把建議當作既定來源要求。
