import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seax Studio｜讓想法，成為好用的體驗",
  description: "Seax Studio 品牌概念頁：探索數位設計、網站體驗與互動作品。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body><a className="skip-link" href="#main">跳至主要內容</a>{children}</body>
    </html>
  );
}
