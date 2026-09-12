"use client";
import { useState } from "react";
import { api, errorMessage, validateText } from "@/lib/api/client";
import type {
  Department,
  Report,
  Workflow,
  PatchWorkflow,
  CreateWorkflow,
} from "@/lib/api/types";
import { workflowDepartmentIds } from "@/lib/api/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { ErrorNotice } from "./api-shared";
export function WorkflowForm({
  workflow,
  report,
  departments,
  disabled,
  run,
  done,
  create,
  reasonHint = "說明為什麼調整，供結案回饋使用。",
}: {
  workflow?: Workflow;
  report: Report;
  departments: Department[];
  disabled: boolean;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  done: () => void;
  create?: (body: CreateWorkflow) => Promise<unknown>;
  reasonHint?: string;
}) {
  const [name, setName] = useState(workflow?.name || "");
  const [description, setDescription] = useState(workflow?.description || "");
  const [assignment, setAssignment] = useState(
    workflow?.assignmentStatus || "UNASSIGNED",
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    workflow ? workflowDepartmentIds(workflow) : [],
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(report.version);
  const stale = version !== report.version;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      validateText(name, "工作名稱", 200);
      validateText(description, "流程描述", 10000);
      validateText(reason, "修改理由", 2000, false);
    } catch (error) {
      setError(errorMessage(error));
      return;
    }
    const status = departmentIds.length
      ? "ASSIGNED"
      : assignment === "UNKNOWN"
        ? "UNKNOWN"
        : "UNASSIGNED";
    const body = {
      name: name.trim(),
      description,
      assignmentStatus: status,
      departmentIds,
      expectedReportVersion: version,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    } as const;
    let patch: PatchWorkflow | undefined;
    if (workflow) {
      patch = {
        expectedReportVersion: version,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      if (body.name !== workflow.name) patch.name = body.name;
      if (body.description !== workflow.description)
        patch.description = body.description;
      if (
        body.assignmentStatus !== workflow.assignmentStatus ||
        body.departmentIds.length !== workflowDepartmentIds(workflow).length ||
        body.departmentIds.some(
          (id) => !workflowDepartmentIds(workflow).includes(id),
        )
      ) {
        patch.assignmentStatus = body.assignmentStatus;
        patch.departmentIds = body.departmentIds;
      }
      if (
        !["name", "description", "assignmentStatus", "departmentIds"].some(
          (key) => key in patch!,
        )
      ) {
        setError("請修改至少一個工作欄位；理由須伴隨實際修改送出。");
        return;
      }
    }
    if (
      await run(() =>
        workflow
          ? api.patchWorkflow(workflow.id, patch!)
          : create
            ? create(body)
            : api.createWorkflow(report.projectId, body),
      )
    )
      done();
    else
      setError("未完成儲存，草稿已保留。請檢視頁面上的錯誤與最新報告後再試。");
  };
  return (
    <form className="api-form" onSubmit={save}>
      <label>
        工作名稱
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        流程描述
        <Textarea
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={disabled}
        />
      </label>
      <fieldset className="department-options" disabled={disabled}>
        <legend>部門歸屬（可複選）</legend>
        {departments.map((department) => (
          <label key={department.id}>
            <input
              type="checkbox"
              checked={departmentIds.includes(department.id)}
              onChange={(event) =>
                setDepartmentIds((ids) =>
                  event.target.checked
                    ? [...ids, department.id]
                    : ids.filter((id) => id !== department.id),
                )
              }
            />
            {department.name}
          </label>
        ))}
        {departmentIds
          .filter(
            (id) => !departments.some((department) => department.id === id),
          )
          .map((id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked
                onChange={() =>
                  setDepartmentIds((ids) => ids.filter((value) => value !== id))
                }
              />
              部門資料尚未載入（{id}）
            </label>
          ))}
        {!departments.length && <p>目前沒有可選擇的部門。</p>}
        {!departmentIds.length && (
          <label>
            歸屬狀態
            <select
              className="api-select"
              value={assignment === "UNKNOWN" ? "UNKNOWN" : "UNASSIGNED"}
              onChange={(event) =>
                setAssignment(
                  event.target.value as Workflow["assignmentStatus"],
                )
              }
            >
              <option value="UNASSIGNED">未歸屬</option>
              <option value="UNKNOWN">不知道</option>
            </select>
          </label>
        )}
      </fieldset>
      <label>
        修改理由（選填）
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={disabled}
          placeholder={reasonHint}
        />
      </label>
      {stale && (
        <div className="api-notice">
          <p>
            報告版本已由 {version} 更新為 {report.version}。
            {workflow
              ? `目前工作內容：${workflow.name} — ${workflow.description}`
              : "請重新檢視目前報告。"}{" "}
            草稿仍保留。
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setVersion(report.version)}
          >
            已檢視，使用最新版本送出草稿
          </Button>
        </div>
      )}
      <ErrorNotice message={error} />
      <div className="heading-actions">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={done}
        >
          取消編輯
        </Button>
        <Button type="submit" disabled={disabled || stale}>
          {workflow ? "儲存修改" : "確認新增"}
        </Button>
      </div>
    </form>
  );
}
