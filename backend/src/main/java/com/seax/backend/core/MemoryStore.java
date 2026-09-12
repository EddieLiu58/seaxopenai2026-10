package com.seax.backend.core;

import com.seax.backend.Json;
import org.springframework.stereotype.Component;
import java.util.*;

/** Immutable extensions and fixed-version case membership; caller owns write transactions. */
@Component
final class MemoryStore {
    private final CoreJdbc jdbc;

    MemoryStore(CoreJdbc jdbc) { this.jdbc = jdbc; }

    void saveInitialSource(Map<String,Object> body) {
        jdbc.update("insert into memory_initial_sources(version,payload) values(1,?::jsonb)", Json.write(body));
    }

    Map<String,Object> initialSource() {
        List<Map<String,Object>> rows = jdbc.queryForList("select payload::text payload from memory_initial_sources where version=1");
        if (rows.isEmpty()) throw ApiException.notFound();
        return Json.read((String) rows.getFirst().get("payload"));
    }

    Map<String, Object> expand(Map<String, Object> base) {
        int version = ((Number) base.get("version")).intValue();
        Map<String, Object> full = new LinkedHashMap<>(base);
        List<Map<String, Object>> extensions = jdbc.queryForList(
                "select payload::text payload from memory_extensions where version=?", version);
        full.put("schemaVersion", 1);
        for (String name : List.of("knowledgeItems", "relationships", "evidence", "projectExperiences"))
            full.put(name, List.of());
        if (!extensions.isEmpty()) {
            full.putAll(Json.read((String) extensions.getFirst().get("payload")));
            full.put("projectExperiences", jdbc.queryForList(
                    "select e.snapshot::text snapshot from memory_experiences m join experiences e"
                    + " on e.project_id=m.project_id where m.version=? order by e.project_id", version)
                    .stream().map(r -> Json.read((String) r.get("snapshot"))).toList());
        }
        return full;
    }

    void save(Map<String, Object> full) {
        int version = ((Number) full.get("version")).intValue();
        Map<String, Object> extension = new LinkedHashMap<>(full);
        // Base columns remain authoritative; department extensions are preserved in payload.
        for (String key : List.of("projectExperiences", "version", "source", "sourceProjectId", "createdAt", "relationshipsDescription"))
            extension.remove(key);
        jdbc.update("insert into memory_extensions(version,payload) values(?,?::jsonb)", version, Json.write(extension));
        for (Map<String, Object> experience : objects(full.get("projectExperiences"))) {
            UUID projectId = UUID.fromString(experience.get("projectId").toString());
            String snapshot = Json.write(experience);
            jdbc.update("insert into experiences(project_id,snapshot) values(?,?::jsonb) on conflict(project_id) do nothing", projectId, snapshot);
            Boolean identical = jdbc.queryForObject("select snapshot=?::jsonb from experiences where project_id=?", Boolean.class, snapshot, projectId);
            if (!Boolean.TRUE.equals(identical))
                throw ApiException.conflict("IMMUTABLE_EXPERIENCE", "已發布的結案案例不可變更。");
            jdbc.update("insert into memory_experiences(version,project_id) values(?,?)", version, projectId);
        }
    }

    void saveAnalysis(UUID jobId, UUID projectId, long reportVersion, int memoryVersion,
                      List<Map<String, Object>> results, UUID analysisId) {
        jdbc.update("insert into analysis_results(analysis_id,job_id,project_id,report_version,global_memory_version,results) values(?,?,?,?,?,?::jsonb)",
                analysisId, jobId, projectId, reportVersion, memoryVersion, Json.write(results));
    }

    void saveFeedback(UUID jobId, Map<String, Object> result) {
        Map<String, Object> payload = map("jobId", jobId.toString(),
                "globalMemoryVersion", result.get("globalMemoryVersion"),
                "publication", result.get("publication"), "diagnostics", result.get("diagnostics"));
        jdbc.update("insert into feedback_results(job_id,payload) values(?,?::jsonb)", jobId, Json.write(payload));
    }

    Map<String, Object> analyses(UUID projectId, UUID jobId, int limit, int offset) {
        if (jdbc.queryForList("select id from projects where id=?", projectId).isEmpty()) throw ApiException.notFound();
        String clause = " where project_id=?" + (jobId == null ? "" : " and job_id=?");
        Object[] args = jobId == null ? new Object[]{projectId} : new Object[]{projectId, jobId};
        long total = jdbc.queryForObject("select count(*) from analysis_results" + clause, Long.class, args);
        List<Object> pageArgs = new ArrayList<>(Arrays.asList(args));
        pageArgs.add(limit); pageArgs.add(offset);
        List<Map<String,Object>> items = jdbc.queryForList("select analysis_id,job_id,report_version,global_memory_version,results::text results from analysis_results"
                + clause + " order by report_version,analysis_id limit ? offset ?", pageArgs.toArray()).stream()
                .map(r -> map("analysisId", r.get("analysis_id"), "jobId", r.get("job_id"), "reportVersion", r.get("report_version"),
                        "globalMemoryVersion", r.get("global_memory_version"), "results", Json.read("{\"items\":" + r.get("results") + "}").get("items"))).toList();
        return map("items", items, "total", total, "limit", limit, "offset", offset);
    }

    Map<String, Object> feedbackResult(UUID jobId) {
        List<Map<String,Object>> jobs = jdbc.queryForList("select type,status from jobs where id=?", jobId);
        if (jobs.isEmpty()) throw ApiException.notFound();
        if (!"FEEDBACK".equals(jobs.getFirst().get("type")))
            throw ApiException.conflict("WRONG_JOB_TYPE", "此工作不是回饋工作。");
        List<Map<String,Object>> rows = jdbc.queryForList("select payload::text payload from feedback_results where job_id=?", jobId);
        if (!"SUCCEEDED".equals(jobs.getFirst().get("status")) || rows.isEmpty())
            throw ApiException.conflict("FEEDBACK_RESULT_NOT_READY", "回饋結果尚未可用。");
        return Json.read((String) rows.getFirst().get("payload"));
    }

    Map<String, Object> collection(int version, String name, Map<String,String> filters, int limit, int offset) {
        Map<String,Object> full = fixed(version);
        Set<String> evidenceIds = new HashSet<>();
        boolean references = filters.containsKey("knowledgeItemId") || filters.containsKey("relationshipId");
        for (String source : List.of("knowledgeItems", "relationships")) {
            String id = filters.get(source.equals("knowledgeItems") ? "knowledgeItemId" : "relationshipId");
            if (id == null) continue;
            Set<String> matching = new HashSet<>();
            objects(full.get(source)).stream().filter(r -> id.equals(String.valueOf(r.get("id"))))
                    .forEach(r -> values(r.get("evidenceIds")).forEach(v -> matching.add(v.toString())));
            if (evidenceIds.isEmpty() && !(source.equals("relationships") && filters.containsKey("knowledgeItemId"))) evidenceIds.addAll(matching);
            else evidenceIds.retainAll(matching);
        }
        List<Map<String,Object>> matches = objects(full.get(name)).stream()
                .filter(item -> matches(name, item, filters))
                .filter(item -> !references || evidenceIds.contains(String.valueOf(item.get("id"))))
                .sorted(name.equals("projectExperiences")
                        ? Comparator.<Map<String,Object>,String>comparing(r -> String.valueOf(r.get("closedAt"))).thenComparing(r -> String.valueOf(r.get("projectId"))).reversed()
                        : Comparator.comparing(r -> String.valueOf(r.get("id"))))
                .toList();
        List<Map<String,Object>> items = matches.stream().skip(offset).limit(limit)
                .map(item -> name.equals("projectExperiences") ? summary(item) : item).toList();
        return map("version", version, "items", items, "total", matches.size(), "limit", limit, "offset", offset);
    }

    Map<String,Object> experience(int version, UUID projectId) {
        fixedVersion(version);
        List<Map<String,Object>> rows = jdbc.queryForList("select e.snapshot::text snapshot from memory_experiences m join experiences e on e.project_id=m.project_id where m.version=? and m.project_id=?", version, projectId);
        if (rows.isEmpty()) throw ApiException.notFound();
        return map("version", version, "experience", Json.read((String) rows.getFirst().get("snapshot")));
    }

    private Map<String,Object> fixed(int version) {
        fixedVersion(version);
        return expand(Map.of("version", version));
    }

    private void fixedVersion(int version) {
        if (jdbc.queryForList("select version from global_memory where version=?", version).isEmpty()) throw ApiException.notFound();
    }

    private static boolean matches(String name, Map<String,Object> item, Map<String,String> filters) {
        Map<String,Object> scope = item.get("scope") instanceof Map<?,?> s ? cast(s) : Map.of();
        for (Map.Entry<String,String> filter : filters.entrySet()) {
            String key = filter.getKey(), value = filter.getValue();
            boolean match = switch (key) {
                case "knowledgeItemId", "relationshipId" -> true;
                case "departmentId" -> name.equals("projectExperiences") ? assignedDepartments(item).contains(value)
                        : name.equals("relationships") ? value.equals(String.valueOf(item.get("fromDepartmentId"))) || value.equals(String.valueOf(item.get("toDepartmentId")))
                        : values(item.get("departmentIds")).stream().anyMatch(v -> value.equals(v.toString()));
                case "scopeLevel" -> value.equals(scope.get("level"));
                case "projectId" -> value.equals(String.valueOf(name.equals("evidence") ? item.get("sourceProjectId")
                        : name.equals("projectExperiences") ? item.get("projectId") : scope.get("projectId")));
                default -> value.equals(String.valueOf(item.get(key)));
            };
            if (!match) return false;
        }
        return true;
    }

    private static Set<String> assignedDepartments(Map<String,Object> item) {
        Set<String> ids = new TreeSet<>();
        objects(item.get("workflows")).stream().filter(w -> "ASSIGNED".equals(w.get("assignmentStatus")) && w.get("departmentId") != null)
                .forEach(w -> ids.add(w.get("departmentId").toString()));
        return ids;
    }

    private static Map<String,Object> summary(Map<String,Object> item) {
        Map<String,Object> result = new LinkedHashMap<>(item);
        result.remove("workflows"); result.remove("reportDiffIds");
        result.put("workflowCount", objects(item.get("workflows")).size());
        result.put("departmentIds", new ArrayList<>(assignedDepartments(item)));
        return result;
    }

    private static List<?> values(Object value) { return value instanceof List<?> list ? list : List.of(); }
    private static List<Map<String,Object>> objects(Object value) { return values(value).stream().map(v -> cast((Map<?,?>) v)).toList(); }
    @SuppressWarnings("unchecked") private static Map<String,Object> cast(Map<?,?> map) { return (Map<String,Object>) map; }
    private static Map<String,Object> map(Object... pairs) {
        Map<String,Object> result = new LinkedHashMap<>();
        for (int i=0; i<pairs.length; i+=2) result.put((String)pairs[i], pairs[i+1]);
        return result;
    }
}
