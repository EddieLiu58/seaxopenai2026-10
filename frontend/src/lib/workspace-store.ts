"use client";
import { useSyncExternalStore, type SetStateAction } from "react";
import { initialWorkspace, type Workspace } from "./workspace-data";
const storageKey = "whose-pot:demo-company:v1";
type Snapshot = { data: Workspace; ready: boolean; error: string };
const serverSnapshot: Snapshot = {
  data: initialWorkspace,
  ready: false,
  error: "",
};
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((listener) => listener());
}
function validWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const w = value as Workspace;
  return (
    w.version === 1 &&
    Array.isArray(w.reports) &&
    Array.isArray(w.departments) &&
    w.reports.every(
      (r) =>
        typeof r.id === "string" &&
        typeof r.title === "string" &&
        typeof r.description === "string" &&
        typeof r.prd === "string" &&
        typeof r.date === "string" &&
        (r.useCases === undefined || (Array.isArray(r.useCases) &&
          new Set(r.useCases.map((item) => item?.id)).size === r.useCases.length &&
          r.useCases.every((item) => item && typeof item.id === "string" &&
            typeof item.name === "string" && typeof item.description === "string" &&
            typeof item.feedback === "string" && Array.isArray(item.departments) &&
            item.departments.every((department) => typeof department === "string")))) &&
        ["待確認", "協作中", "已準備開案"].includes(r.status) &&
        Array.isArray(r.cases) &&
        r.cases.every((c) => typeof c === "string") &&
        Array.isArray(r.nodes) &&
        Array.isArray(r.edges) &&
        r.nodes.every(
          (n) =>
            n &&
            typeof n.id === "string" &&
            n.position &&
            typeof n.position.x === "number" &&
            typeof n.position.y === "number" &&
            n.data &&
            [
              "label",
              "department",
              "scope",
              "delivery",
              "acceptance",
              "pending",
              "reason",
              "useCase",
              "collaborators",
              "originalDepartment",
            ].every((k) => typeof n.data[k] === "string") &&
            Array.isArray(n.data.history),
        ) &&
        r.edges.every(
          (e) =>
            typeof e.id === "string" &&
            r.nodes.some((n) => n.id === e.source) &&
            r.nodes.some((n) => n.id === e.target),
        ),
    ) &&
    w.departments.every(
      (d) =>
        d &&
        typeof d.id === "string" &&
        typeof d.name === "string" &&
        typeof d.description === "string",
    )
  );
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!snapshot.ready) {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : initialWorkspace;
      const migrated =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
        !Array.isArray((parsed as { departments?: unknown }).departments)
          ? { ...parsed, departments: initialWorkspace.departments }
          : parsed;
      if (!validWorkspace(migrated)) throw new Error("Invalid local workspace");
      snapshot = { data: migrated, ready: true, error: "" };
    } catch {
      snapshot = {
        data: initialWorkspace,
        ready: true,
        error: "無法讀取本機資料，目前使用示範資料。你仍可操作並匯出備份。",
      };
    }
    emit();
  }
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return serverSnapshot;
}
export function updateWorkspace(action: SetStateAction<Workspace>) {
  const next = typeof action === "function" ? action(snapshot.data) : action;
  let error = "";
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    error = "此瀏覽器無法儲存變更，離開前請匯出備份。";
  }
  snapshot = { data: next, ready: true, error };
  emit();
}
export function useWorkspaceStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function getHash() {
  try {
    return decodeURIComponent(location.hash.slice(1)) || "new";
  } catch {
    return "new";
  }
}
export function useWorkspaceView() {
  return useSyncExternalStore(subscribeHash, getHash, () => "new");
}
