# 後端開發文件

| 中文名詞 | 英文名詞      | 描述                                                                                                                  |
|----------|---------------|-----------------------------------------------------------------------------------------------------------------------|
| 需求文件 | UserDoc       | 使用者上傳的需求文件                                                                                                  |
| 專案     | Project       | 專案的唯一識別碼                                                                                                      |
| 工作任務 | Workflow      | 使用案例或工作流程等等的通用名稱                                                                                      |
| 分析報告 | Report        | AI 分析後的報告，使用者可以在上面修改                                                                                 |
| 全域記憶 | Global Memory | AI 以此作為分析組織歸屬的依據，原則上是組織架構圖。Global Memory 可以在每次專案結案後更新優化，例如更新組織架構圖敘述 |

## 概述

這是一個關於自動分析使用者上傳的 UserDoc 並產生 Workflows 與部門歸屬。組織間常常會發生
大家對彼此職能或業務不理解導致每次要進行新的需求處理時，不知道要找誰。這個系統旨在處理此問題，
透過回饋機制讓 AI 能夠更精準歸屬 Workflows。

這是快速的 POC，專案以最輕便的方式建置與部署。

### 上傳 UserDoc

使用者可以上傳純文字 UserDoc 到 Project，AI 會自動建議產出 Workflows，並利用 Global Memory
資訊歸屬部門，產出一份 Report。

系統會把 UserDoc 保存成一個 Project 層級的檔案，一個 Project 只有會一個 UserDoc。

### AI 全部重新分析歸屬

清掉 Project 下所有 Workflows 所有歸屬，重新分析並歸屬。需要儲存 ReportDiff

```json
{
  "type": "ALL_REANALYZE",
  "reason": "告訴我為什麼要重新分析"
}
```

### AI 未歸屬分析

僅針對 Project 下所有未有歸屬的 Workflow 重新分析並歸屬。需要儲存 ReportDiff

### 儲存變更

當 Workflow 被使用者新增、編輯、刪除時，會觸發儲存變更的動作，系統會記錄 ReportDiff

### 報告結案

當所有人都對這份報告取得共識以後，就可以對此專案按下完成，並把整個 ReportDiff
與 Report 結果送進回饋分析機制。

結案後 Project 就不能編輯了，並標記為結案

### 回饋機制

AI 會讀取專案的 Project 的 Workflow，與 Report 和所有的 ReportDiff 進行分析，並修改架構敘述作為 Global Memory。
期望下次組織歸屬可以更精準。

## tech stack

- Java 26 + Sprint Boot4 + Swagger
- Build Tool: Gradle
- AI: 使用 Open AI API
- 資料庫：PostgreSQL（docker compose ）
