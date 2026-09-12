"use client";
import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError, errorMessage } from "./api/client";
import type { GlobalMemory, Project } from "./api/types";
type Snapshot = {
  projects: Project[];
  memory: GlobalMemory | null;
  ready: boolean;
  loading: boolean;
  projectsError: string;
  memoryError: string;
};
const initial: Snapshot = {
  projects: [],
  memory: null,
  ready: false,
  loading: false,
  projectsError: "",
  memoryError: "",
};
let snapshot = initial;
let inFlight: Promise<void> | undefined;
const listeners = new Set<() => void>();
function set(value: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...value };
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  return snapshot;
}
function getServerSnapshot() {
  return initial;
}
export function refreshWorkspace(): Promise<void> {
  if (inFlight) return inFlight;
  set({ loading: true });
  inFlight = (async () => {
    await Promise.all([
      (async () => {
        try {
          const projects = new Map<string, Project>();
          let offset = 0;
          for (;;) {
            const page = await api.projects(offset);
            for (const project of page.items) projects.set(project.id, project);
            offset += page.items.length;
            if (offset >= page.total || page.items.length === 0) break;
          }
          set({ projects: [...projects.values()], projectsError: "" });
        } catch (error) {
          set({ projectsError: errorMessage(error) });
        }
      })(),
      (async () => {
        try {
          set({ memory: await api.memory(), memoryError: "" });
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 404 &&
            error.code === "RESOURCE_NOT_FOUND"
          )
            set({ memory: null, memoryError: "" });
          else set({ memoryError: errorMessage(error) });
        }
      })(),
    ]);
    set({ ready: true, loading: false });
  })().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
export function useWorkspaceStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void refreshWorkspace();
  }, []);
  return state;
}
