# 這是誰的鍋

面向 PM 的需求分析與跨部門分工工作台。依根目錄 `PROJECT_BRIEF.md` 製作可操作的前端示範。

```sh
npm install
npm run dev
```

開啟 http://localhost:3000 。

## 已實作

- 分析報告列表：搜尋、狀態篩選、更新時間排序。
- 新增需求分析：文字與 TXT / Markdown 輸入、文件預覽、輸入驗證、示範進度。
- 報告內容：上方橫向步驟列可跳至對應 Use Case 卡片；卡片包含建議協作部門標籤、情境說明與自動儲存的使用者回饋。
- 公司資料：以 `backend/examples/global-memory-software-company.json` 顯示組織圖，支援重新匯入部門 JSON。
- 響應式版面、鍵盤可用的連線表單、瀏覽器本機儲存。

## 示範限制

沒有串接真實 AI、登入、後端儲存或多人協作。新增分析使用固定示範範本，不會根據 PRD 語意推論。部門資料僅在此瀏覽器保存，匯入格式為 JSON。

資料保存在 `whose-pot:demo-company:v1` localStorage，僅供此瀏覽器使用；清除網站資料會清除修改。舊報告會以 Use Case 卡片呈現，並保留原有資料。

## 檢查

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

瀏覽器測試使用 Playwright，初次可執行 `npx playwright install chromium` 安裝瀏覽器。

保留 Next.js 靜態輸出與原有 Cloudflare 部署指令；本次實作未部署。
