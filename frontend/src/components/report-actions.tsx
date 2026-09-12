"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { getUseCases, today, type Report } from "@/lib/workspace-data";
import { updateWorkspace } from "@/lib/workspace-store";

export default function ReportActions({ report, notify }: {
  report: Report;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const reanalyze = () => {
    if (timer.current) return;
    setBusy(true);
    timer.current = setTimeout(() => {
      // Demo only: retain the latest feedback, including edits made while waiting.
      updateWorkspace((workspace) => ({
        ...workspace,
        reports: workspace.reports.map((current) => current.id === report.id ? {
          ...current,
          useCases: getUseCases(current),
          status: "待確認",
          date: today(),
        } : current),
      }));
      timer.current = null;
      setBusy(false);
      notify("示範重新分析已完成，回饋已保留；尚未串接 AI，分析結果未重新推論。");
    }, 800);
  };
  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spinner" /> : <RotateCcw size={16} />}
            {busy ? "正在重新分析…" : "重新分析"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新分析此專案？</AlertDialogTitle>
            <AlertDialogDescription>
              目前為示範模式，尚未串接 AI；會保留現有 Use Case 與使用者回饋，並將報告改為待確認。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={reanalyze}>確認重新分析</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={busy || report.status === "已準備開案" || !getUseCases(report).length}>
            <CircleCheck size={16} />
            {report.status === "已準備開案" ? "已準備開案" : "準備開案"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認準備開案</AlertDialogTitle>
            <AlertDialogDescription>
              請確認「{report.title}」的 Use Case 與建議協作部門已討論完成。確認後將報告標記為已準備開案，並保留所有回饋。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回檢視</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              updateWorkspace((workspace) => ({
                ...workspace,
                reports: workspace.reports.map((current) => current.id === report.id
                  ? { ...current, status: "已準備開案", date: today() } : current),
              }));
              notify("報告已標記為已準備開案");
            }}>確認，準備開案</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
