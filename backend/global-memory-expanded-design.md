# GlobalMemory 擴充資料結構與 API 設計

日期：2026-09-12。狀態：供 review 的擴充設計，尚未修改 backend/spec.md 或實作 API。

基準：`C:\Users\User\IdeaProjects\seaxopenai2026-10\backend\spec.md`；SHA-256：`481588985190E5DA170A8C410344746024C93E50653205DDAEEC0B00D9048563`。

## 1. 設計選擇

GlobalMemory 是跨專案可用的永久資料集合，包含組織架構、部門特性與職責、上下游與交換內容、結案專案與 workflow、共同知識及證據。

採用「版本化組織知識＋結案案例索引＋可追溯知識項目」。資料庫可分表保存，API 組合回傳，不必在每個記憶版本複製全部歷史報告。

| 方案 | 取捨 |
|---|---|
| 全部塞進部門 description | 最簡單，但無法可靠區分專案特例、一般責任與事實來源。 |
| 本案採用：分開保存知識、案例、證據，以固定版本關聯 | 可追溯並可分頁；需新增關聯與 API 欄位。 |
| 獨立圖資料庫與完整知識治理流程 | 可擴展，但超出本次簡化 POC 的需要。 |

## 2. 邏輯結構

下列型別中 ID 均為 UUID，時間為 UTC ISO 8601；未特別註明的陣列可為空但不可為 null。範例檔 `global-memory-expanded-example.json` 為完整示意快照，不是實際組織資料。

| 欄位 | 型別 | 意義 |
|---|---|---|
| schemaVersion | integer | 資料契約版本，本擴充為 2；與內容版本分開。 |
| version | integer | 記憶內容版本，從 1 遞增。 |
| source | INITIAL / FEEDBACK | 初始化或結案回饋產生。 |
| sourceProjectId | UUID / null | 本次版本來源專案；INITIAL 為 null。 |
| createdAt | datetime | 版本提交時間。 |
| departments | Department[] | 版本內部門清單、特性、能力與職責。 |
| relationshipsDescription | string | 使用者提供的原始關係文字，保留作背景資料；POC 仍不由回饋改寫。 |
| relationships | DepartmentRelationship[] | 可查詢、有方向、有來源的部門關係。 |
| knowledgeItems | KnowledgeItem[] | 跨案規則、部門責任及專案安排等有來源的陳述。 |
| projectExperiences | ProjectExperience[] | 已成功納入記憶的結案案例，含當時工作內容與分配。 |
| evidence | Evidence[] | 原始來源與可核對文字，供知識項目引用。 |

### Department

| 欄位 | 型別 | 意義 |
|---|---|---|
| id、name | UUID、string | 穩定部門 ID、名称。 |
| description | string | 部門概要；從已支持的知識整理，不能成為無來源的新事實。 |
| knowledgeItemIds | UUID[] | 指向 FEATURE、RESPONSIBILITY、CAPABILITY 等知識項目。 |

不把能力與責任混為一談：不負責某事，不等於不具備執行能力。需要分開的知識項目與證據。

### DepartmentRelationship

| 欄位 | 型別 | 意義 |
|---|---|---|
| id | UUID | 關係識別碼，跨版本保持一致。 |
| type | REPORTS_TO / UPSTREAM_OF / COLLABORATES_WITH | 隸屬、業務上下游或平行協作。 |
| fromDepartmentId、toDepartmentId | UUID | REPORTS_TO 為下級→上級；UPSTREAM_OF 為提供方→接收方；協作為無方向，ID 固定排序保存。 |
| description | string | 關係與適用情境。 |
| exchangedItems | string[] | 交付資料或產物，例如使用者負向回饋。 |
| scope | Scope | 一般組織關係或僅限特定專案。 |
| evidenceIds | UUID[] | 至少一筆支持來源。 |

組織架構用 REPORTS_TO 表達；部門清單中沒有這種邊只代表尚未提供，不表示無上級。不同關係類型分開驗證：REPORTS_TO 不可循環，上下游互相交換則不以組織樹規則一律禁止。專案 workflow DAG 與部門關係是不同資料。

### KnowledgeItem 與 Scope

| 欄位 | 型別 | 意義 |
|---|---|---|
| id | UUID | 知識識別碼，跨版本保持一致。 |
| type | FEATURE / RESPONSIBILITY / CAPABILITY / COMMON_RULE / PROJECT_ARRANGEMENT | 部門特性、職責、能力、共同規則、本次專案安排。 |
| statement | string | 明確陳述，例如「搜尋功能由搜尋推薦部門負責」。 |
| departmentIds | UUID[] | 涉及部門；COMMON_RULE 可空，表示組織共通。 |
| scope | Scope | `{level: ORGANIZATION 或 PROJECT, projectId: UUID 或 null, conditions: string[]}`。PROJECT 必須指定專案，ORGANIZATION 必須為 null。 |
| evidenceIds | UUID[] | 至少一筆支持來源，不接受只有 AI 自述。 |

PROJECT_ARRANGEMENT 固定為 PROJECT 範圍；其他類型仍需明示 scope。跨案檢索可找出專案案例，但不能把其 scope 自動擴成 ORGANIZATION。相衝突而未解決的候選留在專案 context／回饋診斷，不能當有效的永久規則。

### ProjectExperience 與 WorkflowExperience

| 欄位 | 型別 | 意義 |
|---|---|---|
| projectId、projectName | UUID、string | 結案專案識別及名稱快照。 |
| reportId、reportVersion | UUID、integer | 凍結的結案報告版本，包含結案事件。 |
| closedAt | datetime | 專案結案時間。 |
| experienceMeaning | 固定 REPORT_APPROVED | 表示結案時確認的分工；不宣稱已實際執行。 |
| workflows | WorkflowExperience[] | 結案版本的完整工作清單。 |
| reportDiffIds | UUID[] | 完整結案歷程參照，原事件不可修改。 |

WorkflowExperience 使用原 Workflow 完整欄位：id、reportId、name、description、dependsOnWorkflowIds、assignmentStatus、departmentId、assignmentSource、createdAt、updatedAt。另有 evidenceIds 指向支援本項目的來源。

每個案例只能包含同一 Report 的工作；歸屬 ASSIGNED／UNKNOWN／UNASSIGNED 的原始語意完整保留。依 departmentId 查歷史經驗時，只把 ASSIGNED 算為該部門的分配紀錄。

### Evidence

| 欄位 | 型別 | 意義 |
|---|---|---|
| id | UUID | 證據 ID。 |
| sourceType | INITIAL_INPUT / CLOSED_REPORT / REPORT_DIFF | 使用者初始化資料、結案報告或修改事件。 |
| sourceProjectId、reportId、reportVersion | UUID / null、UUID / null、integer / null | 專案來源定位；INITIAL_INPUT 均 null。 |
| workflowId、reportDiffId | UUID / null | 精確工作或事件定位；不適用為 null。 |
| sourcePath | string | 在不可變來源資料中的 JSON Pointer，例如 `/changes/0/after/description`。 |
| excerpt | string | 該欄位的原文摘錄；不存模型編造的引文。 |

初始化原始 payload 必須不可變保存。後端驗證 sourcePath 可解析、excerpt 符合來源，且項目來自指定的結案快照。文字匹配只能證明引文存在，不能代替語意判斷：仍需確認來源確實支持該結論的類型與範圍。

## 3. Context 與永久層的寫入界線

| 時點 | Context／專案資料 | GlobalMemory |
|---|---|---|
| OPEN | UserDoc、目前 Report、全部 Diff、AI 分析原因與引用、候選知識 | 不納入此專案新知識或案例。 |
| CLOSED，FEEDBACK 未成功 | 保存凍結報告與歷程，可查詢專案；候選回饋尚未生效 | 保持上一個成功版本。 |
| FEEDBACK 成功 | 保留原始資料供追溯 | 同交易加入此結案案例、證據及有支持的知識／關係，建立新版本。 |
| FEEDBACK 失敗 | 專案維持 CLOSED，可重試 | 不部分發布，也不重複加入案例。 |

結案案例即使沒有可泛化的新知識，仍可作為歷史經驗加入。UNKNOWN 不妨礙保存案例，但不能衍生已確認部門責任。明確只有「本次由搜推處理」時，存 PROJECT_ARRANGEMENT；不能推導「廣告沒有能力」。

每個 GlobalMemory 版本需保存關係、知識、證據與案例的版本成員集合；舊版本查詢不能意外讀到之後新增或修改的資料。既有案例不可修改，可使用不可變快照參照避免重複儲存。

## 4. API 調整提案

以下沿用 `/api/v1` 路徑，schemaVersion 提升為 2，需要前後端同步更新；schemaVersion 本身不是相容性保證。既有部署若已有外部消費者，應另開 API v2，不能靜默破壞既有契約。

| API | 建議契約與回傳 |
|---|---|
| `POST /api/v1/global-memory` | 接受 departments、relationshipsDescription，以及可選 relationships、knowledgeItems、evidence。新增陣列預設空；INITIAL_INPUT 證據指向同次不可變 payload。不可透過初始化偽造結案案例。後端設定 schemaVersion、version、source、時間。 |
| `GET /api/v1/global-memory?version=2` | 回傳版本 metadata、departments、relationshipsDescription 與 counts（relationships、knowledgeItems、projectExperiences、evidence）。省略 version 取最新；大量集合由下列 API 分頁讀取。 |
| `GET /api/v1/global-memory/relationships` | query：version 必填、departmentId／type 可選、limit／offset；回傳 `{version, items, total, limit, offset}`。 |
| `GET /api/v1/global-memory/knowledge-items` | query：version 必填，departmentId／type／scopeLevel／projectId 可選，分頁同上。 |
| `GET /api/v1/global-memory/experiences` | query：version 必填，departmentId／projectId 可選，分頁。列表回傳專案 metadata、workflowCount 與 departmentIds，不內嵌全部工作。 |
| `GET /api/v1/global-memory/experiences/{projectId}` | query：version 必填；回傳 `{version, experience}`，experience 包含完整結案 workflows 與 reportDiffIds。不在該版本成員集合中則 404。 |
| `GET /api/v1/global-memory/evidence` | query：version 必填，knowledgeItemId／relationshipId／projectId 可選，分頁；回傳可核對來源。 |
| `POST /api/v1/projects/{projectId}/close` | 請求與即時回應沿用原 spec；後續 FEEDBACK 改為產生擴充記憶。 |
| `GET /api/v1/jobs/{jobId}` | 原 result 保留；報告分析成功另回傳 analysisId；FEEDBACK 成功仍以 globalMemoryVersion 定位發布結果。 |
| `GET /api/v1/projects/{projectId}/analysis-results` | 新增分頁查詢不可變分析紀錄，支援 jobId；每筆含 analysisId、jobId、reportVersion、globalMemoryVersion、results。 |

analysis-results 每個結果包含 workflowId、assignmentStatus、departmentId、explanation（給使用者的简短判斷摘要）、knowledgeItemIds、evidenceIds。引用必須屬於該次固定 GlobalMemory 版本且確實提供給模型；UNKNOWN 也回傳無法決定的原因。此處不要求揭露模型內部思考過程。

人工修改後原 AI 分析紀錄仍保留，其 reportVersion 表明它是過去判斷，不能把它顯示成使用者手動分配的原因。使用者原本的 ReportDiff.reason 與 AI explanation 分開保存。

新列表 limit 預設 50、範圍 1–200，offset 非負；UUID 清單依 UUID 排序，案例依 closedAt、projectId 降冪，分析依 reportVersion 升冪。多頁查詢必須使用第一步取得的固定 version，避免頁間混入新版本。所有路徑扣除 `/api/v1` 後最多三層。

## 5. AI 輸入與回饋調整

原本 3 種 Prompt 類型仍可沿用，但 assignment 與 feedback 的契約擴充：

| Prompt／處理 | 調整 |
|---|---|
| workflow_decomposition | 維持只從 UserDoc 拆解工作及相依。 |
| 案例检索（後端） | 依目標工作的名稱／描述，在固定 GlobalMemory 版本找相關知識與結案案例；保存實際選入的 ID 清單及內容快照。不需新增生成式 AI Prompt，POC 可先採文字檢索。 |
| department_assignment | 輸入部門概要、適用知識／關係及檢索到的結案案例與證據。輸出原歸屬欄位，加 explanation、knowledgeItemIds、evidenceIds。本次工作的相依與前置部門仍不作額外依據。 |
| organization_feedback | 輸入凍結 Report、完整 Diff、最新 GlobalMemory；輸出 descriptionUpdates、relationshipCandidates、knowledgeCandidates。候選可暫用 key，正式 ID 與 Evidence 由後端配置。 |
| 回饋發布（後端） | 驗證來源、欄位及 scope；僅發布來源足以支持的項目。未解衝突候選留在回饋診斷；無支持的新結論可略過，仍可發布結案案例。 |

同一報告分析的自動／手動重試沿用固定記憶版本及檢索快照。FEEDBACK 每次重新讀最新記憶。保留既有版本衝突重試、租約、單一 FEEDBACK 執行與 sourceProjectId 唯一生效規則。

目前 spec 僅准回饋改 description；本提案擴為新增有證據的關係與知識。部門新增、刪除、改名及隸屬組織架構調整仍不交給結案 AI 自動執行；REPORTS_TO 只由初始化資料提供。專案協作關係可存 PROJECT 範圍，一般上下游需有明確一般性證據。

## 6. 核心驗收情境

1. OPEN 專案不出現在任何永久案例或知識集合中。
2. 回饋成功後案例、證據及知識同版本可查；失敗時全部不生效。
3. 「本次搜推處理、不需廣告參與」只產生專案安排，不能自動產生廣告缺乏能力的知識。
4. AI 解釋能引用固定版本內的來源；不存在的 ID、錯誤摘錄或跨版本引用遭拒。
5. UNKNOWN 案例保留，但不列為某部門的已確認承接經驗。
6. 舊 GlobalMemory 版本及舊 AI 分析結果在新版發布後仍可重現。
7. 人工修改後不會將過去 AI 解釋冒充為目前人工歸屬原因。
8. 同一專案 FEEDBACK 重試只產生一次生效結果，多頁查詢固定 version 不混版。
