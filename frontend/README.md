# 這是誰的鍋

專案分析與跨部門分工工作台，依 `docs/openapi.json`（由使用者提供的 `api.html` 抽出）串接 Seax API 0.1.0。保留一筆可手動新增流程 的前端示範報告，其餘專案皆從後端載入。

## 啟動

```sh
npm install
cp .env.example .env.local
# 將 NEXT_PUBLIC_API_BASE_URL 改為可連線的後端網址，包含 /api/v1
npm run dev
```

開啟 http://localhost:3000 。未設定 `NEXT_PUBLIC_API_BASE_URL` 時，使用同來源 `/api/v1`。

目前 API base URL 為 `https://retro-agreement-seeing-reuters.trycloudflare.com/api/v1`，已填入 `.env.example` 與本機 `.env.local`。本儲存庫的 `backend/` 仍只有規格與範例，服務由此網址提供。後端跨來源時需允許前端 origin、GET / POST / PATCH / DELETE / OPTIONS，以及 Content-Type / Idempotency-Key headers。公開設定只放 API URL，不放 AI 金鑰。

保留 Next.js `output: "export"` 與 Cloudflare Pages 部署。API URL 於建置時注入，變更後需重新建置；若使用同來源 `/api/v1`，需另配置 API 代理，靜態輸出本身不提供後端。

## 已串接的流程

- 部門清單讀取；未初始化時匯入 `{departments, relationshipsDescription}` JSON，僅允許初始化一次。
- 部門清單維持組織階層圖與右側職掌詳情。依關係文字中的明確隸屬敘述呈現；未載明隸屬的部門另列，完整關係文字可展開閱讀。
- 專案列表完整讀取所有分頁，名稱搜尋、OPEN / CLOSED 篩選、建立時間排序；不為列表逐筆讀取完整報告。
- 新增需求以 JSON 純文字提交，TXT / Markdown 由瀏覽器先讀成文字。
- 依 projectId 讀取詳情及報告；查詢 Job 狀態，處理排隊、分析中、等待重試、成功、失敗與手動重試。
- 正式報告右上方「新增流程」可手動新增流程，填寫名稱、描述、部門歸屬與理由；亦支援修改、UNKNOWN / UNASSIGNED、刪除與修改歷程。
- 修改只送有變更的欄位，單純編輯描述不將 AI 歸屬改成人工指定。
- 全部／未歸屬重新分析；全部分析立即清除原歸屬，失敗不還原。分析期間鎖定編輯。
- 結案後唯讀；獨立追蹤與重試組織回饋，回饋失敗不撤銷結案。
- 所有 POST 帶 UUID Idempotency-Key；網路回應不明時，同路徑與相同內容重送沿用 key。
- 報告寫入帶 expectedReportVersion；衝突重新讀取，保留草稿，由使用者檢視最新版本後再送出。

## 路由與示範資料

- `/#new`：新增分析。
- `/#reports`：專案列表及一筆獨立示範報告。
- `/#company`：部門清單。
- `/#projects/{projectId}`：正式專案報告；projectId 與 report.id 分開。
- `/#projects/demo-report`：可新增流程 的本機示範；舊 `/#report-1` 保留為該示範的別名。

示範可新增流程，包含部門歸屬與理由，保存於 `seax:demo-workflows:v1` localStorage，重新整理及舊連結均可繼續查看。示範使用內建部門資料，即使 API 無法連線仍可操作；不觸發分析或結案，不送至 API，也不計入正式專案數。API 失敗顯示錯誤，不生成假結果。舊 `whose-pot:demo-company:v1` 資料不再讀取、不自動上傳，既有瀏覽器儲存內容不會刪除。

API 沒有每卡自由文字回饋欄位；介面改為編輯工作時填修改理由，結案時填整體說明。修改歷程及結案理由由後端承接。

## 任務恢復的契約限制

執行中分析及回饋以 ProjectDetails 的任務 ID 恢復。前端另外在 localStorage 記住本瀏覽器最後一次分析／回饋 Job ID，以便 FAILED 後重試；sessionStorage 僅保存尚未確認的 POST 識別碼，不保存正式專案內容。

目前 API 沒有任務列表或 latestAnalysisJobId。如果 FAILED 後 activeAnalysisJobId 為 null，且換瀏覽器或清除本機資料，前端可能無法找回首次失敗的分析 Job。完整跨裝置恢復需要後端補充查詢能力。

## 檢查

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Playwright 測試以 API 契約回應攔截驗證 UI → HTTP → UI，涵蓋冪等重送、版本衝突、工作操作、分析鎖定、結案回饋、深連結與手機版。

2026-09-12 已透過本機瀏覽器實際連線上述 API：部門清單與專案列表均回 200，讀取 10 個部門、0 筆正式專案，建立分析按鈕可用，列表保留 1 筆前端唯讀示範，無瀏覽器錯誤。本次真實驗證為唯讀，未新增專案或觸發 AI／組織回饋。已重新建置靜態輸出並包含此 API URL。

CORS 預檢：`http://localhost:3000` 通過；`https://system-boundary.pages.dev` 回傳 403 `Invalid CORS request`。要從該線上來源連線，需在後端 `CORS_ALLOWED_ORIGINS` 加入 `https://system-boundary.pages.dev` 並重新載入設定。本次未部署前端，亦未變更後端設定。

同日恢復部門階層圖後再次驗證：帶 `Origin: http://localhost:3000` 的真實 GET 亦回傳 403 `Invalid CORS request`，與稍早狀態不同。需在後端重新確認允許來源；部門圖的階層解析、桌面／手機點選及版面已由契約測試驗證。

前端已移除前置工作設定與顯示。新增流程不傳 dependsOnWorkflowIds；編輯也不傳此欄位，以保留後端既有相依資料。

部門歸屬介面支援複選；示範報告將多個部門存於本機。前端新增／修改採用擬定的 `departmentIds: string[]`，不傳 `departmentId`，並相容讀取舊回應。提供的 API 0.1.0 合約仍只有單一 `departmentId`；正式服務須同步支援陣列欄位後才能完成複選串接。取消所有部門時傳送空陣列，並保留 `UNASSIGNED`／`UNKNOWN` 狀態。
