# Seax Studio 前端起始專案

Next.js App Router、React、TypeScript、Tailwind CSS 4、ESLint。繁體中文的響應式品牌概念首頁，包含作品分類與 FAQ。

## 本機開發

使用 Node.js 24 LTS 與 npm。

```bash
npm ci
npm run dev
```

開啟 http://localhost:3000。

## 驗證與正式建置

```bash
npm run lint
npm run typecheck
npm run build
```

`npm run build` 會產生 Cloudflare Pages 要部署的 `out/` 目錄。若要在本機預覽靜態輸出，可執行 `npm run preview`。

本機 direct upload 到 Cloudflare Pages：

```bash
npm run deploy:cloudflare
```

## 修改位置

- `src/app/page.tsx`：首頁結構與文案
- `src/app/layout.tsx`：語系與 SEO metadata
- `src/app/globals.css`：設計 tokens 與響應式樣式
- `src/content/site.ts`：品牌名稱、作品與常見問題
- `src/components/project-gallery.tsx`：作品分類互動
- `docs/design-system.md`：初版設計決策

Seax Studio 與作品皆為可替換的概念內容。本版範圍為前端，不需環境變數或外部服務。

技術依據：https://nextjs.org/docs/app/getting-started/installation

## 部署到 Cloudflare Pages

本專案使用 Next.js Static HTML Export，適合目前的純前端內容網站。

在 Cloudflare Dashboard 依序選擇 Workers & Pages → Create application → Pages → Import an existing Git repository，連接 GitHub repository 後使用以下設定：

| 設定 | 值 |
| --- | --- |
| Framework preset | `Next.js (Static HTML Export)` |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `out` |

Cloudflare 官方指南：[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) 與 [Deploy a static Next.js site](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)。本專案使用 direct upload，因此每次需要執行 `npm run deploy:cloudflare` 才會重新部署。

## 此環境的建置設定

此環境的 Turbopack 正式建置發生本機連接埠權限錯誤，因此 `dev` 與 `build` 明確使用 Next.js 支援的 `--webpack` 模式。日後在支援的環境中可移除此旗標，重新驗證 Turbopack。
