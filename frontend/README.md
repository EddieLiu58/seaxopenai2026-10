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
- 報告內容：可編輯流程圖、使用情境篩選、部門分工、修改原因、交接連線、原始 PRD。
- 公司資料：文件上傳、原文編輯、刪除、公司記憶與來源報告。
- 準備開案：檢查待確認事項、人工確認共識、報告快照及記憶累積。
- 響應式版面、鍵盤可用的連線表單、瀏覽器本機儲存。

## 示範限制

沒有串接真實 AI、登入、後端儲存或多人協作。新增分析使用固定示範範本，不會根據 PRD 語意推論。公司文件與記憶尚未用於自動分析。文件每份最大 1 MB，僅 TXT / Markdown。

資料保存在 `whose-pot:demo-company:v1` localStorage，僅供此瀏覽器使用；清除網站資料會清除修改。完成開案的報告在本版為唯讀。

## 檢查

```sh
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

瀏覽器測試使用 Playwright，初次可執行 `npx playwright install chromium` 安裝瀏覽器。

保留 Next.js 靜態輸出與原有 Cloudflare 部署指令；本次實作未部署。
