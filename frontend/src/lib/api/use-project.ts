"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  errorMessage,
  isActiveJob,
  rememberedJobs,
  rememberJob,
} from "./client";
import type { Job, ProjectDetails, Report } from "./types";
import { refreshWorkspace } from "../workspace-store";
export type ProjectBundle = {
  details: ProjectDetails;
  report: Report;
  jobs: Job[];
};
export function useProject(projectId: string) {
  const [data, setData] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [cycle, setCycle] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      let [details, report] = await Promise.all([
        api.project(projectId, request.signal),
        api.report(projectId, request.signal),
      ]);
      const linkedIds = [
        details.activeAnalysisJobId,
        details.feedbackJobId,
      ].filter((id): id is string => !!id);
      const ids = [
        ...new Set([
          ...linkedIds,
          ...rememberedJobs(projectId, {
            analysis: details.activeAnalysisJobId,
            feedback: details.feedbackJobId,
          }),
        ]),
      ];
      const jobs = (
        await Promise.all(
          ids.map(async (id) => {
            try {
              return await api.job(id, request.signal);
            } catch (error) {
              if (
                !linkedIds.includes(id) &&
                error instanceof ApiError &&
                error.status === 404
              )
                return null;
              throw error;
            }
          }),
        )
      ).filter((job): job is Job => job !== null);
      const completedVersion = Math.max(
        0,
        ...jobs.map((job) =>
          job.status === "SUCCEEDED" &&
          job.result &&
          "reportVersion" in job.result
            ? job.result.reportVersion
            : 0,
        ),
      );
      if (
        report.version < completedVersion ||
        details.reportVersion !== report.version ||
        (details.activeAnalysisJobId &&
          jobs.some(
            (job) =>
              job.id === details.activeAnalysisJobId && !isActiveJob(job),
          ))
      ) {
        [details, report] = await Promise.all([
          api.project(projectId, request.signal),
          api.report(projectId, request.signal),
        ]);
      }
      if (mounted.current && current === generation.current) {
        jobs.forEach(rememberJob);
        setData({ details, report, jobs });
        setFresh(true);
        setError("");
      }
      return true;
    } catch (error) {
      if (request.signal.aborted) return false;
      if (mounted.current && current === generation.current) {
        setFresh(false);
        setError(errorMessage(error));
      }
      return false;
    } finally {
      if (mounted.current && current === generation.current) {
        setLoading(false);
        setCycle((value) => value + 1);
      }
    }
  }, [projectId]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => {
      if (mounted.current) return refresh();
    });
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [refresh]);
  const active =
    !!data?.details.activeAnalysisJobId || !!data?.jobs.some(isActiveJob);
  useEffect(() => {
    if (!active || busy) return;
    const timer = setTimeout(() => {
      void refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [active, busy, cycle, refresh]);
  useEffect(() => {
    const focus = () => {
      if (!lock.current) void refresh();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  const run = async (operation: () => Promise<unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    controller.current?.abort();
    ++generation.current;
    try {
      await operation();
      await refresh();
      void refreshWorkspace();
      return true;
    } catch (error) {
      // Reconcile ambiguous writes and stale versions before allowing another edit.
      const recovered = await refresh();
      if (mounted.current)
        setError(
          `${errorMessage(error)}${recovered ? "" : " 最新資料讀取失敗，請重新載入後再操作。"}`,
        );
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const analysisActive =
    !!data?.details.activeAnalysisJobId ||
    !!data?.jobs.some((job) => job.type !== "FEEDBACK" && isActiveJob(job));
  const locked =
    busy ||
    !fresh ||
    analysisActive ||
    data?.details.project.status === "CLOSED" ||
    !data ||
    data.report.version === 0;
  return { data, error, loading, busy, locked, refresh, run };
}
