"use client";
import { useSyncExternalStore } from "react";
import type { CreateWorkflow } from "./api/types";
import { getUseCases, initialWorkspace, type UseCase } from "./workspace-data";

export const demoStorageKey = "seax:demo-workflows:v1";
export type DemoWorkflow = UseCase & {
  assignmentStatus: "UNASSIGNED" | "ASSIGNED" | "UNKNOWN";
  departmentId: string | null;
  departmentIds?: string[];
  dependsOnWorkflowIds: string[];
  reason: string;
};
type Snapshot = { items: DemoWorkflow[]; ready: boolean; error: string };
const initial: Snapshot = { items: [], ready: false, error: "" };
let snapshot = initial;
const listeners = new Set<() => void>();
const baseIds = getUseCases(initialWorkspace.reports[0]).map((item) => item.id);
function read(): DemoWorkflow[] {
  const raw = localStorage.getItem(demoStorageKey);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length + baseIds.length > 200)
    throw new Error("Invalid demo data");
  const ids = new Set(baseIds);
  for (const item of value) {
    if (
      !item ||
      typeof item.id !== "string" ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      typeof item.description !== "string" ||
      !Array.isArray(item.departments) ||
      !item.departments.every((name: unknown) => typeof name === "string") ||
      !["UNASSIGNED", "ASSIGNED", "UNKNOWN"].includes(item.assignmentStatus) ||
      !(item.departmentId === null || typeof item.departmentId === "string") ||
      (item.departmentIds !== undefined &&
        (!Array.isArray(item.departmentIds) ||
          !item.departmentIds.every(
            (id: unknown) => typeof id === "string",
          ))) ||
      typeof item.reason !== "string" ||
      !Array.isArray(item.dependsOnWorkflowIds) ||
      !item.dependsOnWorkflowIds.every(
        (id: unknown) => typeof id === "string" && ids.has(id),
      )
    ) {
      throw new Error("Invalid demo data");
    }
    ids.add(item.id);
  }
  return value as DemoWorkflow[];
}
function emit() {
  listeners.forEach((listener) => listener());
}
function load() {
  try {
    snapshot = { items: read(), ready: true, error: "" };
  } catch {
    snapshot = {
      items: [],
      ready: true,
      error:
        "無法讀取示範報告的本機資料。原有資料未覆蓋，請檢查瀏覽器儲存設定。",
    };
  }
  emit();
}
function storageChanged(event: StorageEvent) {
  if (event.key === demoStorageKey || event.key === null) load();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("storage", storageChanged);
    load();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", storageChanged);
  };
}
export function useDemoWorkflows() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initial,
  );
}
export async function addDemoWorkflow(
  body: CreateWorkflow,
  departmentNames: string[],
) {
  const items = read();
  if (body.expectedReportVersion !== items.length) {
    load();
    throw new Error("示範報告已在其他分頁更新，請檢視最新版本後再送出。");
  }
  if (baseIds.length + items.length >= 200)
    throw new Error("工作數量已達 200 個上限。");
  const allowed = new Set([...baseIds, ...items.map((item) => item.id)]);
  if (body.dependsOnWorkflowIds?.some((id) => !allowed.has(id)))
    throw new Error("前置工作已不存在，請重新選擇。");
  const next: DemoWorkflow = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description,
    assignmentStatus: body.assignmentStatus || "UNASSIGNED",
    departmentId: null,
    departmentIds: body.departmentIds || [],
    departments: departmentNames,
    feedback: "",
    dependsOnWorkflowIds: body.dependsOnWorkflowIds || [],
    reason: body.reason || "",
  };
  try {
    localStorage.setItem(demoStorageKey, JSON.stringify([...items, next]));
  } catch {
    throw new Error(
      "瀏覽器無法儲存這筆 Workflow，請檢查儲存空間或權限後重試。",
    );
  }
  snapshot = { items: [...items, next], ready: true, error: "" };
  emit();
}
