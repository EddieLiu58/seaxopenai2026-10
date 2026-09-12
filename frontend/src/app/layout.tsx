import type { Metadata } from "next";
import "./globals.css";
import SkipLink from "@/components/skip-link";
export const metadata: Metadata = {
  title: "這是誰的鍋｜把分工理清，讓協作發生",
  description: "從 PRD 拆解到部門分工，建立可追溯的協作流程與公司共識。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}
