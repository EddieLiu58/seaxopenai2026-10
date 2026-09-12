package com.seax.backend.core;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1")
public final class CoreController {
    private final CoreService core;

    public CoreController(CoreService core) {
        this.core = core;
    }

    @PostMapping("/global-memory")
    ResponseEntity<Map<String, Object>> initialize(
            @RequestHeader("Idempotency-Key") String key, @RequestBody Map<String, Object> body) {
        return post(
                "/global-memory",
                key,
                body,
                () -> new CoreService.HttpResult(201, core.initializeMemory(body)));
    }

    @GetMapping("/global-memory")
    Map<String, Object> memory(@RequestParam(required = false) Integer version) {
        if (version != null && version < 1)
            throw ApiException.bad("INVALID_REQUEST", "version 必須為正整數。");
        return core.memory(version);
    }

    @PostMapping("/projects")
    ResponseEntity<Map<String, Object>> createProject(
            @RequestHeader("Idempotency-Key") String key, @RequestBody Map<String, Object> body) {
        return post("/projects", key, body, () -> core.createProject(body));
    }

    @GetMapping("/projects")
    Map<String, Object> projects(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        if (status != null && !Set.of("OPEN", "CLOSED").contains(status))
            throw ApiException.bad("INVALID_REQUEST", "status 無效。");
        page(limit, offset);
        return core.projects(status, limit, offset);
    }

    @GetMapping("/projects/{projectId}")
    Map<String, Object> project(@PathVariable UUID projectId) {
        return core.projectDetail(projectId);
    }

    @GetMapping("/projects/{projectId}/report")
    Map<String, Object> report(@PathVariable UUID projectId) {
        return core.reportForProject(projectId);
    }

    @PostMapping("/projects/{projectId}/workflows")
    ResponseEntity<Map<String, Object>> createWorkflow(
            @PathVariable UUID projectId,
            @RequestHeader("Idempotency-Key") String key,
            @RequestBody Map<String, Object> body) {
        return post(
                "/projects/" + projectId + "/workflows",
                key,
                body,
                () -> core.createWorkflow(projectId, body));
    }

    @PatchMapping("/workflows/{workflowId}")
    Map<String, Object> patch(
            @PathVariable UUID workflowId, @RequestBody Map<String, Object> body) {
        return core.patchWorkflow(workflowId, body);
    }

    @DeleteMapping("/workflows/{workflowId}")
    Map<String, Object> delete(
            @PathVariable UUID workflowId,
            @RequestParam long expectedReportVersion,
            @RequestParam(required = false) String reason) {
        return core.deleteWorkflow(workflowId, expectedReportVersion, reason);
    }

    @PostMapping("/projects/{projectId}/analyses")
    ResponseEntity<Map<String, Object>> analyse(
            @PathVariable UUID projectId,
            @RequestHeader("Idempotency-Key") String key,
            @RequestBody Map<String, Object> body) {
        return post(
                "/projects/" + projectId + "/analyses",
                key,
                body,
                () -> core.analyse(projectId, body));
    }

    @GetMapping("/projects/{projectId}/report-diffs")
    Map<String, Object> diffs(
            @PathVariable UUID projectId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        page(limit, offset);
        return core.diffs(projectId, limit, offset);
    }

    @PostMapping("/projects/{projectId}/close")
    ResponseEntity<Map<String, Object>> close(
            @PathVariable UUID projectId,
            @RequestHeader("Idempotency-Key") String key,
            @RequestBody Map<String, Object> body) {
        return post(
                "/projects/" + projectId + "/close", key, body, () -> core.close(projectId, body));
    }

    @GetMapping("/jobs/{jobId}")
    Map<String, Object> job(@PathVariable UUID jobId) {
        return core.getJob(jobId);
    }

    @PostMapping("/jobs/{jobId}/retry")
    ResponseEntity<Map<String, Object>> retry(
            @PathVariable UUID jobId,
            @RequestHeader("Idempotency-Key") String key,
            @RequestBody Map<String, Object> body) {
        return post("/jobs/" + jobId + "/retry", key, body, () -> core.retry(jobId, body));
    }

    private ResponseEntity<Map<String, Object>> post(
            String path,
            String key,
            Map<String, Object> body,
            java.util.function.Supplier<CoreService.HttpResult> action) {
        CoreService.HttpResult r = core.post(path, key, body, action);
        return ResponseEntity.status(r.status()).body(r.body());
    }

    private static void page(int limit, int offset) {
        if (limit < 1 || limit > 200 || offset < 0)
            throw ApiException.bad("INVALID_REQUEST", "分頁參數無效。");
    }
}
