package com.seax.backend.core;

import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public final class MemoryController {
    private final MemoryStore store;
    private final CoreTransactions transactions;

    public MemoryController(MemoryStore store, CoreTransactions transactions) {
        this.store = store; this.transactions = transactions;
    }

    @GetMapping("/global-memory/knowledge-items")
    Map<String,Object> knowledge(@RequestParam Map<String,String> query) {
        return collection("knowledgeItems", query, Set.of("departmentId", "type", "scopeLevel", "projectId"));
    }

    @GetMapping("/global-memory/relationships")
    Map<String,Object> relationships(@RequestParam Map<String,String> query) {
        return collection("relationships", query, Set.of("departmentId", "type"));
    }

    @GetMapping("/global-memory/experiences")
    Map<String,Object> experiences(@RequestParam Map<String,String> query) {
        return collection("projectExperiences", query, Set.of("departmentId", "projectId"));
    }

    @GetMapping("/global-memory/evidence")
    Map<String,Object> evidence(@RequestParam Map<String,String> query) {
        return collection("evidence", query, Set.of("knowledgeItemId", "relationshipId", "projectId"));
    }

    @GetMapping("/global-memory/experiences/{projectId}")
    Map<String,Object> experience(@PathVariable UUID projectId, @RequestParam int version) {
        positiveVersion(version);
        return transactions.read(() -> store.experience(version, projectId));
    }

    @GetMapping("/projects/{projectId}/analysis-results")
    Map<String,Object> analyses(@PathVariable UUID projectId, @RequestParam(required=false) UUID jobId,
                               @RequestParam(defaultValue="50") int limit, @RequestParam(defaultValue="0") int offset) {
        page(limit, offset);
        return transactions.read(() -> store.analyses(projectId, jobId, limit, offset));
    }

    @GetMapping("/jobs/{jobId}/feedback-result")
    Map<String,Object> feedback(@PathVariable UUID jobId) {
        return transactions.read(() -> store.feedbackResult(jobId));
    }

    private Map<String,Object> collection(String name, Map<String,String> query, Set<String> allowedFilters) {
        Set<String> allowed = new HashSet<>(allowedFilters);
        allowed.addAll(Set.of("version", "limit", "offset"));
        if (!allowed.containsAll(query.keySet())) throw invalid();
        int version = integer(query.get("version"));
        int limit = integer(query.getOrDefault("limit", "50"));
        int offset = integer(query.getOrDefault("offset", "0"));
        positiveVersion(version); page(limit, offset);
        Map<String,String> filters = new LinkedHashMap<>();
        query.forEach((key,value) -> {
            if (!allowedFilters.contains(key)) return;
            if (key.endsWith("Id")) {
                try {
                    UUID id = UUID.fromString(value);
                    if (!id.toString().equalsIgnoreCase(value)) throw invalid();
                    value = id.toString();
                } catch (IllegalArgumentException ex) { throw invalid(); }
            }
            if (key.equals("scopeLevel") && !Set.of("ORGANIZATION", "PROJECT").contains(value)) throw invalid();
            if (key.equals("type")) {
                Set<String> types = name.equals("relationships")
                        ? Set.of("REPORTS_TO", "UPSTREAM_OF", "COLLABORATES_WITH")
                        : Set.of("FEATURE", "RESPONSIBILITY", "CAPABILITY", "COMMON_RULE", "PROJECT_ARRANGEMENT");
                if (!types.contains(value)) throw invalid();
            }
            filters.put(key, value);
        });
        return transactions.read(() -> store.collection(version, name, filters, limit, offset));
    }

    private static int integer(String value) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException ex) { throw invalid(); }
    }
    private static void positiveVersion(int version) { if (version < 1) throw invalid(); }
    private static void page(int limit, int offset) { if (limit < 1 || limit > 200 || offset < 0) throw invalid(); }
    private static ApiException invalid() { return ApiException.bad("INVALID_REQUEST", "查詢參數無效。"); }
}
