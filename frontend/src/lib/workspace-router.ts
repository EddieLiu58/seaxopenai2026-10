"use client";

import { useSyncExternalStore } from "react";

export type WorkspaceRoute =
  | { page: "new" | "reports" | "company" }
  | { page: "project"; projectId: string; legacy: boolean }
  | { page: "not-found" };

export function projectHref(projectId: string) {
  return `#projects/${encodeURIComponent(projectId)}`;
}

function parseRoute(hash: string): WorkspaceRoute {
  const path = hash.replace(/^#/, "");
  if (!path) return { page: "new" };
  if (path === "new" || path === "reports" || path === "company") {
    return { page: path };
  }
  try {
    const legacy = !path.startsWith("projects/");
    const projectId = decodeURIComponent(legacy ? path : path.slice(9));
    if (!projectId.trim() || projectId.includes("/")) return { page: "not-found" };
    // Keep old #report-id bookmarks readable during the API migration.
    return { page: "project", projectId, legacy };
  } catch {
    return { page: "not-found" };
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function getSnapshot() {
  return window.location.hash;
}

function getServerSnapshot() {
  return "";
}

export function useWorkspaceRoute() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return parseRoute(hash);
}
