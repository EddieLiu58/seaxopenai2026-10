"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  initialWorkspace,
  getUseCases,
  defaultCompanyDepartments,
} from "@/lib/workspace-data";
import { addDemoWorkflow, useDemoWorkflows } from "@/lib/demo-workflows";
import type { Report as ApiReport, Workflow } from "@/lib/api/types";
import { errorMessage } from "@/lib/api/client";
import { WorkflowForm } from "./workflow-form";
import UseCaseReport from "./use-case-report";
import { Button } from "./ui/button";
import { ErrorNotice } from "./api-shared";

export function DemoReport() {
  const { items, ready, error: storageError } = useDemoWorkflows();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const base = initialWorkspace.reports[0];
  const useCases = [...getUseCases(base), ...items];
  const report = { ...base, useCases };
  const apiReport: ApiReport = {
    id: "demo-report",
    projectId: "demo-report",
    version: items.length,
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
    workflows: useCases.map(
      (item) =>
        ({
          id: item.id,
          reportId: "demo-report",
          name: item.name,
          description: item.description,
          assignmentStatus: item.assignmentStatus || "UNASSIGNED",
          departmentId: item.departmentId || null,
          departmentIds: item.departmentIds,
          assignmentSource: null,
          dependsOnWorkflowIds: item.dependsOnWorkflowIds || [],
          createdAt: "2026-09-12T00:00:00Z",
          updatedAt: "2026-09-12T00:00:00Z",
        }) as Workflow,
    ),
  };
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
      setSaved(true);
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="report-heading">
        <div>
          <a href="#reports" className="back-link">
            返回報告列表
          </a>
          <div className="report-title">
            <h1>{base.title}</h1>
            <span className="status">示範報告</span>
          </div>
          <p>
            可手動新增
            Workflow，修改僅保存在此瀏覽器，不會送至正式專案或組織記憶。
          </p>
        </div>
        <div className="heading-actions">
          <Button
            disabled={
              !ready || !!storageError || busy || useCases.length >= 200
            }
            aria-expanded={adding}
            onClick={() => {
              setSaved(false);
              setAdding(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            新增流程
          </Button>
        </div>
      </div>
      <ErrorNotice message={storageError || error} />
      {saved && (
        <p className="api-notice" role="status">
          已新增流程 並儲存在此瀏覽器。
        </p>
      )}
      {adding && (
        <section
          className="use-case-card"
          aria-labelledby="demo-workflow-title"
        >
          <h2 id="demo-workflow-title">新增流程</h2>
          <p>使用示範部門清單，體驗流程與部門分工。</p>
          <WorkflowForm
            report={apiReport}
            departments={defaultCompanyDepartments}
            disabled={busy || !!storageError}
            run={run}
            done={() => setAdding(false)}
            create={(body) =>
              addDemoWorkflow(
                body,
                defaultCompanyDepartments
                  .filter((department) =>
                    body.departmentIds?.includes(department.id),
                  )
                  .map((department) => department.name),
              )
            }
            reasonHint="記錄這筆示範工作新增的原因，僅保存在本機。"
          />
        </section>
      )}
      <UseCaseReport report={report} />
    </>
  );
}
