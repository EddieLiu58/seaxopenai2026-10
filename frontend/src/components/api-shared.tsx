"use client";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
export function Loading({
  children = "正在讀取資料…",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spinner" />
      {children}
    </div>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="api-notice form-error" role="alert">
      <span>{message}</span>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          重新載入
        </Button>
      )}
    </div>
  );
}
export function ProjectStatus({ closed }: { closed: boolean }) {
  return (
    <span className={`status ${closed ? "status-ready" : "status-pending"}`}>
      {closed ? "已結案" : "開放中"}
    </span>
  );
}
export function displayDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
