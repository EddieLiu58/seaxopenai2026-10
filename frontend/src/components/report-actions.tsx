"use client";
import { useState } from "react";
import { api, rememberJob, validateText } from "@/lib/api/client";
import type { ProjectBundle } from "@/lib/api/use-project";
import { Button } from "./ui/button";
import { ErrorNotice } from "./api-shared";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export default function ReportActions({
  data,
  locked,
  busy,
  run,
  error,
}: {
  data: ProjectBundle;
  error: string;
  locked: boolean;
  busy: boolean;
  run: (operation: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [action, setAction] = useState<
    "ALL_REANALYZE" | "UNASSIGNED_ANALYZE" | "close" | null
  >(null);
  const [reason, setReason] = useState("");
  const closed = data.details.project.status === "CLOSED";
  const open = (value: typeof action) => {
    setReason("");
    setAction(value);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action) return;
    const success = await run(async () => {
      validateText(reason, "操作理由", 2000, action === "ALL_REANALYZE");
      const body = {
        expectedReportVersion: data.report.version,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      if (action === "close") {
        const result = await api.close(data.details.project.id, body);
        rememberJob(result.feedbackJob);
      } else {
        const result = await api.analyze(
          data.details.project.id,
          action === "ALL_REANALYZE"
            ? { ...body, type: action, reason: reason.trim() }
            : { ...body, type: action },
        );
        rememberJob(result.job);
      }
    });
    if (success) setAction(null);
  };
  return (
    <>
      <Button
        variant="outline"
        disabled={locked || !data.report.workflows.length}
        onClick={() => open("ALL_REANALYZE")}
      >
        全部重新分析
      </Button>
      <Button
        variant="outline"
        disabled={
          locked ||
          !data.report.workflows.some((w) => w.assignmentStatus !== "ASSIGNED")
        }
        onClick={() => open("UNASSIGNED_ANALYZE")}
      >
        分析未歸屬項目
      </Button>
      <Button
        disabled={locked || !data.report.workflows.length}
        onClick={() => open("close")}
      >
        {closed ? "已結案" : "確認分工並結案"}
      </Button>
      <Dialog
        open={action !== null}
        onOpenChange={(value) => {
          if (!busy && !value) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "close"
                ? "確認分工並結案"
                : action === "ALL_REANALYZE"
                  ? "全部重新分析"
                  : "分析未歸屬項目"}
            </DialogTitle>
            <DialogDescription>
              {action === "close"
                ? "結案後無法編輯、重新分析或重開。系統將在背景分析修改歷程並更新組織職能；回饋失敗不影響結案。"
                : action === "ALL_REANALYZE"
                  ? "送出後立即清除全部人工與 AI 歸屬。只重新判定部門，不重新拆解需求；失敗也不會還原舊歸屬。"
                  : "分析「未歸屬」與「不知道」的工作，保留已有部門歸屬的工作。"}
            </DialogDescription>
          </DialogHeader>
          <ErrorNotice message={error} />
          <form onSubmit={submit} className="api-form">
            <label>
              {action === "close"
                ? "結案說明（選填）"
                : action === "ALL_REANALYZE"
                  ? "操作理由（必填）"
                  : "操作理由（選填）"}
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
              />
            </label>
            <div className="heading-actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={busy || locked}>
                {busy ? "正在送出…" : "確認送出"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
