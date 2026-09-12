# Seax Backend

依 [spec.md](spec.md) 實作的 Java REST API，包含 PostgreSQL 持久化、workflow 相依圖、AI 分析、差異紀錄及結案回饋。

## 啟動

需要 Java 26、Docker 與 Docker Compose。Gradle Wrapper 固定 9.5.1；Spring Boot 4.1.1、springdoc 3.1.1。

以下命令在 `backend/` 執行：

```sh
docker compose up -d --wait
./gradlew bootRun
```

`JAVA_HOME` 必須指向 JDK 26。Flyway 在啟動時自動執行 `src/main/resources/db/migration/`，資料庫資料保存在 Compose named volume。`docker compose stop` 可停機並保留資料。

- API：`http://localhost:8080/api/v1`
- Swagger UI：`http://localhost:8080/swagger-ui/index.html`
- 完整 OpenAPI：`http://localhost:8080/openapi.json`（中文端點說明）

第一次啟動會讀取 [軟體公司組織範例](examples/global-memory-software-company.json)，建立含 10 個部門、職能描述與架構關係的 GlobalMemory v1。已有任何版本時不會覆蓋。設定 `SEED_GLOBAL_MEMORY=false` 可改成自行呼叫 `POST /api/v1/global-memory` 初始化；初始化只允許一次。

依本次 POC 的要求，`application.properties` 已放入提供的 API key，預設模型為 `gpt-5.5`。`OPENAI_API_KEY`、`OPENAI_MODEL` 環境變數仍可覆寫預設；未設定時才採用冒號後的值，設定成空字串會覆蓋預設值。自訂資料庫或其他環境設定可參考 `.env.example`。

## API 操作範例

```sh
curl http://localhost:8080/api/v1/global-memory

curl -X POST http://localhost:8080/api/v1/projects \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"name":"退款流程","userDoc":{"content":"先接受退款申請，審核和帳戶驗證都完成後再撥款。"}}'
```

建立回傳 202 與 `project`、空 `report`、`job`。以 `GET /api/v1/jobs/{jobId}` 輪詢進度，成功後用 `GET /api/v1/projects/{projectId}/report` 取得完整報告。`dependsOnWorkflowIds` 是直接前置工作；回傳陣列依相依關係做穩定拓撲排序。

手動新增使用 `POST /projects/{projectId}/workflows`；修改或刪除使用 `PATCH /workflows/{workflowId}`、`DELETE /workflows/{workflowId}`。寫入須提供最新的 `expectedReportVersion`。DELETE 使用 query，其餘使用 JSON body。修改相依後請重新讀取報告以更新完整順序。

歸屬狀態為 `ASSIGNED`、`UNASSIGNED`、`UNKNOWN`；「不知道」並不是虛擬部門。全部重新分析接受時會立即清除所有人工與 AI 歸屬，失敗不還原。未歸屬分析包含 UNKNOWN。單人結案後立即 CLOSED，回饋失敗不影響結案。

所有 POST 都需要 UUID `Idempotency-Key`。重送相同操作請保留同一 key 與 body；回放的是第一次成功 HTTP 回應，任務最新狀態要另外 GET。每個新操作使用新的 key。

```sh
curl -X POST http://localhost:8080/api/v1/jobs/JOB_ID/retry \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{}'
```

FAILED 任務可手動重試，沿用 Job ID 並新增三次嘗試預算。舊報告分析若版本已變更或專案已結案，就不能重試。FEEDBACK 使用每次嘗試時的最新 GlobalMemory。

## 任務與設定

API 與背景 worker 在同一個 Spring Boot 程序。任務、輸入快照、執行批次、錯誤與租約都保存在 PostgreSQL。自動重試最多三次，間隔 5 秒、30 秒；供應商 Retry-After 較長時優先。每次嘗試上限 120 秒，租約 150 秒、每 15 秒續租。過期 worker 不能提交舊結果。

| 環境變數 | 用途 |
|---|---|
| `DATABASE_URL` | JDBC URL，預設 `jdbc:postgresql://localhost:5432/seax` |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | PostgreSQL 帳密；本機範例預設 `seax` |
| `DATABASE_PORT` | Compose 對本機開放的 port；改動時同步更新 JDBC URL |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | 覆寫 POC 設定檔內的金鑰與預設模型 `gpt-5.5` |
| `PORT` | API port，預設 8080 |
| `CORS_ALLOWED_ORIGINS` | 允許的前端來源，以逗號分隔，預設 `http://localhost:3000` |
| `SEED_GLOBAL_MEMORY` | 是否在空資料庫載入組織範例，預設 true |
| `WORKER_ENABLED` | 是否自動執行任務，預設 true |
| `OPENAI_BASE_URL` | 相容 Responses API 的 base URL，預設 `https://api.openai.com/v1` |

預設 `gpt-5.5` 是有效的 API model ID，支援 Responses API 與 Structured Outputs，見 [OpenAI 官方模型文件](https://developers.openai.com/api/docs/models/gpt-5.5)。OpenAI 使用單次 HTTP Responses API 呼叫與 strict JSON schema，沒有 SDK 隱含重試。拆解只接收需求；歸屬只接收 workflow ID、名稱、描述和 GlobalMemory；結案回饋接收最終報告、完整差異與最新組織記憶。格式參考 [OpenAI 官方 Structured Outputs 文件](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 驗證與打包

執行 `./gradlew build` 會同時產生單一 HTML API 文件：`swagger/index.html`。直接用瀏覽器開啟即可離線閱讀，不需啟動後端或連網；Swagger UI 樣式、程式與 OpenAPI 契約均內嵌。此文件僅供閱讀，呼叫 API 請使用啟動後的 Swagger UI。只要產生文件時可執行 `./gradlew generateApiHtml`。

```sh
./gradlew test
# 整合測試需要先 docker compose up -d --wait
./gradlew integrationTest
./gradlew bootJar
```

2026-09-12 使用提供的 key 實際呼叫 `gpt-5.5`，服務回傳 `403 / model_not_found`（API project 尚無該模型權限）；設定保留使用者指定的 `gpt-5.5`，待權限開通或更換可存取的 key。

本次驗證通過 17 個單元測試與 27 個整合測試，並完成 JAR 啟動、Swagger 與 V1 → V2 資料庫升級檢查；既有組織資料完整保留。

一般測試涵蓋圖與 AI HTTP 錯誤處理。整合測試透過實際 HTTP / PostgreSQL 執行，AI 邊界使用可控制的測試回應，不需要真實金鑰或付費呼叫。每次建立獨立隨機 schema，結束後只刪除此 schema，保留既有資料。可用 `TEST_DATABASE_URL`、`TEST_DATABASE_USERNAME`、`TEST_DATABASE_PASSWORD` 指向其他測試 PostgreSQL。

更新 OpenAPI 契約時執行 `python3 scripts/generate_openapi.py`。JSON 契約位於 `src/main/resources/static/openapi.json`，Swagger UI 直接使用該檔。

本次範圍是後端；現有 frontend 仍需新增專案／報告操作介面並呼叫上述 API。

## GlobalMemory schemaVersion 2 擴充

本次擴充採用版本化知識、結案案例及原始證據。`GET /global-memory` 與初始化回應改為 metadata、departments、relationshipsDescription、counts；詳細集合透過以下 API 查詢，集合請求必須指定 `version`，分頁沿用同一版本。

| API（省略 `/api/v1`） | 內容 |
|---|---|
| `GET /global-memory/knowledge-items` | 知識、適用範圍及證據 ID |
| `GET /global-memory/relationships` | 隸屬、上下游或協作關係 |
| `GET /global-memory/experiences` | 結案案例摘要 |
| `GET /global-memory/experiences/{projectId}` | 完整凍結案例 |
| `GET /global-memory/evidence` | 可核對來源位置與摘錄 |
| `GET /projects/{projectId}/analysis-results` | 歸屬原因、候選、資訊缺口與引用 |
| `GET /jobs/{jobId}/feedback-result` | 成功發布結果及 HOLD／DISCARD 診斷 |

新歸屬分析使用 `classify_v2`，輸入為 workflow 文字及固定版本 `memoryContext`。ASSIGNED 必須有正向職責證據；UNKNOWN 保存原因碼與待補資訊，也是成功結果。人工改派不改寫歷史 AI 解釋。既有升級前任務保留原契約。

`feedback_v2` 使用凍結專案、完整報告與 Diff、最新完整記憶及来源目錄。模型只回傳部門概要、知識／關係候選及觀察；後端驗證並配置 ID、證據與案例。PROJECT 範圍不能自動升為 ORGANIZATION；結案確認分工不表示已執行。部門 ID、名稱及組織隸屬不由結案 AI 調整。超容量以不可重試的 `AI_INPUT_TOO_LARGE` 結束。

POC 暫沿用 `/api/v1`，回應格式已有變更，前端與既有消費者需要同步升級。完整欄位與查詢參數以 [OpenAPI JSON](src/main/resources/static/openapi.json) 為準。執行 `python scripts/generate_openapi.py` 可重建 JSON，產生前會檢查新版端點及 schema 引用。

本次僅完成離線 JDK 契約測試與 OpenAPI 產生器檢查；上方既有整合驗證紀錄屬擴充前版本，不能視為本次擴充已通過整合測試。待 Gradle 依賴可用後，執行 `./gradlew test integrationTest generateApiHtml`（整合測試需 PostgreSQL）驗證並重新產生 `swagger/index.html`。目前已保留既有離線資源並更新 HTML 內嵌 OpenAPI 契約；未新增真實模型呼叫。

新版 classify_v2 的 explanation 同步保存至既有 Workflow.assignmentReason；人工改派或重設時清空目前理由，歷史 analysis-results 保留。V3__workflow_assignment_reason.sql 保持原樣，擴充記憶使用 V4__expanded_memory.sql。
