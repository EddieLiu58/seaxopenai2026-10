package com.seax.backend.core;

import com.seax.backend.Json;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.*;
import java.util.function.Supplier;

/**
 * Transactional resource operations. Maps are intentional: they preserve the API's JSON contract at
 * its boundary.
 */
@Service
public final class CoreService {
    private final CoreJdbc jdbc;
    private final CoreTransactions tx;
    private final Clock clock;

    public CoreService(CoreJdbc jdbc, CoreTransactions tx, Clock clock) {
        this.jdbc = jdbc;
        this.tx = tx;
        this.clock = clock;
    }

    public record HttpResult(int status, Map<String, Object> body) {}

    public HttpResult post(
            String path,
            String idempotencyKey,
            Map<String, Object> body,
            Supplier<HttpResult> action) {
        UUID key = uuid(idempotencyKey, "Idempotency-Key 必須是 UUID。");
        String canonical = Json.write(body);
        return tx.execute(
                s -> {
                    jdbc.queryForList(
                            "select pg_advisory_xact_lock(hashtext(?),hashtext(?))",
                            path,
                            key.toString());
                    List<Map<String, Object>> old =
                            jdbc.queryForList(
                                    "select canonical_body::text body,status,response::text"
                                            + " response from idempotency_records where path=? and"
                                            + " key=? for update",
                                    path,
                                    key);
                    if (!old.isEmpty()) {
                        Map<String, Object> r = old.getFirst();
                        if (!canonical.equals(Json.write(Json.read((String) r.get("body")))))
                            throw ApiException.conflict("IDEMPOTENCY_KEY_REUSED", "冪等鍵已用於不同請求。");
                        return new HttpResult(
                                ((Number) r.get("status")).intValue(),
                                Json.read((String) r.get("response")));
                    }
                    HttpResult result = action.get();
                    jdbc.update(
                            "insert into"
                                + " idempotency_records(path,key,canonical_body,status,response,created_at)"
                                + " values(?,?,?::jsonb,?,?::jsonb,?)",
                            path,
                            key,
                            canonical,
                            result.status(),
                            Json.write(result.body()),
                            now());
                    return result;
                });
    }

    public Map<String, Object> initializeMemory(Map<String, Object> body) {
        return tx.execute(
                s -> {
                    allowed(body, "departments", "relationshipsDescription");
                    memoryLock();
                    if (jdbc.queryForObject("select count(*) from global_memory", Integer.class)
                            > 0)
                        throw ApiException.conflict(
                                "GLOBAL_MEMORY_ALREADY_INITIALIZED", "全域記憶已初始化。");
                    List<Map<String, Object>> departments =
                            maps(body.get("departments"), "departments");
                    if (departments.isEmpty() || departments.size() > 200) throw invalid();
                    Set<UUID> ids = new HashSet<>();
                    for (Map<String, Object> d : departments) {
                        allowed(d, "id", "name", "description");
                        UUID id = uuid(d.get("id"), "部門 ID 無效。");
                        if (!ids.add(id)) throw invalid();
                        text(d.get("name"), 1, 200, "部門名稱無效。");
                        text(d.get("description"), 1, 10000, "部門描述無效。");
                    }
                    String relationships =
                            text(body.get("relationshipsDescription"), 0, 100000, "部門關係說明無效。");
                    Instant at = now();
                    jdbc.update(
                            "insert into global_memory values(1,?::jsonb,?,'INITIAL',null,?)",
                            Json.write(departments),
                            relationships,
                            java.sql.Timestamp.from(at));
                    return memory(1);
                });
    }

    Map<String, Object> currentMemory() {
        return memory(null);
    }

    public Map<String, Object> memory(Integer version) {
        Integer v =
                version == null
                        ? jdbc.queryForObject(
                                "select max(version) from global_memory", Integer.class)
                        : version;
        if (v == null) throw ApiException.notFound();
        List<Map<String, Object>> rows =
                jdbc.queryForList(
                        "select version,departments::text"
                            + " departments,relationships_description,source,source_project_id,created_at"
                            + " from global_memory where version=?",
                        v);
        if (rows.isEmpty()) throw ApiException.notFound();
        Map<String, Object> r = rows.getFirst();
        return map(
                "version",
                r.get("version"),
                "departments",
                Json.read("{\"items\":" + r.get("departments") + "}").get("items"),
                "relationshipsDescription",
                r.get("relationships_description"),
                "source",
                r.get("source"),
                "sourceProjectId",
                r.get("source_project_id"),
                "createdAt",
                iso(r.get("created_at")));
    }

    // PostgreSQL JSON arrays are decoded through a wrapper so Json's public read-object helper
    // remains sufficient.
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> departments(int version) {
        String raw =
                jdbc.queryForObject(
                        "select departments::text from global_memory where version=?",
                        String.class,
                        version);
        return (List<Map<String, Object>>) Json.read("{\"items\":" + raw + "}").get("items");
    }

    public HttpResult createProject(Map<String, Object> body) {
        return tx.execute(
                s -> {
                    allowed(body, "name", "userDoc");
                    int mv = latestMemory();
                    String name = text(body.get("name"), 1, 200, "專案名稱無效。");
                    Map<String, Object> doc = obj(body.get("userDoc"), "userDoc");
                    allowed(doc, "content");
                    String content = text(doc.get("content"), 1, 100000, "需求內容無效。");
                    Instant at = now();
                    UUID project = UUID.randomUUID(),
                            report = UUID.randomUUID(),
                            job = UUID.randomUUID();
                    jdbc.update(
                            "insert into projects values(?,?, 'OPEN',?,null)", project, name, at);
                    jdbc.update("insert into user_docs values(?,?,?)", project, content, at);
                    jdbc.update("insert into reports values(?,?,0,?,?)", report, project, at, at);
                    Map<String, Object> input = map("content", content, "globalMemory", memory(mv));
                    insertJob(job, project, "INITIAL_ANALYSIS", mv, 0, input, at);
                    return new HttpResult(
                            202,
                            map(
                                    "project",
                                    project(project),
                                    "report",
                                    report(row("select * from reports where id=?", report)),
                                    "job",
                                    job(job)));
                });
    }

    public Map<String, Object> projects(String status, int limit, int offset) {
        return tx.read(() -> projectsSnapshot(status, limit, offset));
    }

    private Map<String, Object> projectsSnapshot(String status, int limit, int offset) {
        String where = status == null ? "" : " where status=?";
        List<Map<String, Object>> rows =
                status == null
                        ? jdbc.queryForList(
                                "select * from projects order by created_at desc,id desc limit ?"
                                        + " offset ?",
                                limit,
                                offset)
                        : jdbc.queryForList(
                                "select * from projects where status=? order by created_at desc,id"
                                        + " desc limit ? offset ?",
                                status,
                                limit,
                                offset);
        Integer total =
                status == null
                        ? jdbc.queryForObject("select count(*) from projects", Integer.class)
                        : jdbc.queryForObject(
                                "select count(*) from projects where status=?",
                                Integer.class,
                                status);
        return map(
                "items",
                rows.stream().map(this::project).toList(),
                "total",
                total,
                "limit",
                limit,
                "offset",
                offset);
    }

    public Map<String, Object> projectDetail(UUID id) {
        return tx.read(() -> projectDetailSnapshot(id));
    }

    private Map<String, Object> projectDetailSnapshot(UUID id) {
        Map<String, Object> p = project(id);
        Map<String, Object> r = row("select * from reports where project_id=?", id);
        UUID report = (UUID) r.get("id");
        List<Map<String, Object>> active =
                jdbc.queryForList(
                        "select id from jobs where project_id=? and type in"
                                + " ('INITIAL_ANALYSIS','ALL_REANALYZE','UNASSIGNED_ANALYZE') and"
                                + " status in ('QUEUED','RUNNING','RETRY_WAIT')",
                        id);
        List<Map<String, Object>> feedback =
                jdbc.queryForList("select id from jobs where project_id=? and type='FEEDBACK'", id);
        Map<String, Object> doc = row("select * from user_docs where project_id=?", id);
        return map(
                "project",
                p,
                "userDoc",
                map(
                        "projectId",
                        id,
                        "content",
                        doc.get("content"),
                        "createdAt",
                        iso(doc.get("created_at"))),
                "reportVersion",
                r.get("version"),
                "activeAnalysisJobId",
                active.isEmpty() ? null : active.getFirst().get("id"),
                "feedbackJobId",
                feedback.isEmpty() ? null : feedback.getFirst().get("id"));
    }

    public Map<String, Object> reportForProject(UUID projectId) {
        return tx.read(() -> reportForProjectSnapshot(projectId));
    }

    private Map<String, Object> reportForProjectSnapshot(UUID projectId) {
        project(projectId);
        return report(row("select * from reports where project_id=?", projectId));
    }

    public HttpResult createWorkflow(UUID projectId, Map<String, Object> body) {
        return tx.execute(
                s -> {
                    Locked lock = lock(projectId);
                    editable(lock, longValue(body.get("expectedReportVersion")));
                    allowed(
                            body,
                            "name",
                            "description",
                            "dependsOnWorkflowIds",
                            "assignmentStatus",
                            "departmentId",
                            "expectedReportVersion",
                            "reason");
                    if (count(lock.reportId()) >= 200)
                        throw ApiException.conflict("WORKFLOW_LIMIT_REACHED", "工作數量已達上限。");
                    Assignment assignment = assignment(body, null);
                    List<UUID> dependencies =
                            body.containsKey("dependsOnWorkflowIds")
                                    ? uuids(body.get("dependsOnWorkflowIds"))
                                    : List.of();
                    UUID id = UUID.randomUUID();
                    validateDeps(lock.reportId(), id, dependencies, now());
                    Instant at = now();
                    jdbc.update(
                            "insert into workflows values(?,?,?,?,?,?,?,?,?)",
                            id,
                            lock.reportId(),
                            text(body.get("name"), 1, 200, "工作名稱無效。"),
                            text(body.get("description"), 1, 10000, "工作描述無效。"),
                            assignment.status,
                            assignment.department,
                            assignment.source,
                            at,
                            at);
                    replaceDeps(lock.reportId(), id, dependencies);
                    Map<String, Object> after = workflow(id);
                    event(
                            lock,
                            "WORKFLOW_CREATED",
                            "APPLY",
                            "USER",
                            nullableReason(body),
                            null,
                            null,
                            List.of(change(id, "CREATE", null, after)));
                    return new HttpResult(
                            201, map("workflow", after, "reportVersion", lock.version() + 1));
                });
    }

    public Map<String, Object> patchWorkflow(UUID workflowId, Map<String, Object> body) {
        return tx.execute(
                s -> {
                    allowed(
                            body,
                            "name",
                            "description",
                            "dependsOnWorkflowIds",
                            "assignmentStatus",
                            "departmentId",
                            "expectedReportVersion",
                            "reason");
                    UUID
                            reportId =
                                    (UUID)
                                            row(
                                                            "select report_id from workflows where"
                                                                    + " id=?",
                                                            workflowId)
                                                    .get("report_id"),
                            projectId =
                                    jdbc.queryForObject(
                                            "select project_id from reports where id=?",
                                            UUID.class,
                                            reportId);
                    Locked lock = lock(projectId);
                    Map<String, Object> before = workflow(workflowId);
                    editable(lock, longValue(body.get("expectedReportVersion")));
                    if (!body.keySet().stream()
                            .anyMatch(
                                    k ->
                                            List.of(
                                                            "name",
                                                            "description",
                                                            "dependsOnWorkflowIds",
                                                            "assignmentStatus",
                                                            "departmentId")
                                                    .contains(k))) throw invalid();
                    String name =
                            body.containsKey("name")
                                    ? text(body.get("name"), 1, 200, "工作名稱無效。")
                                    : (String) before.get("name");
                    String desc =
                            body.containsKey("description")
                                    ? text(body.get("description"), 1, 10000, "工作描述無效。")
                                    : (String) before.get("description");
                    Assignment a = assignment(body, before);
                    List<UUID> deps =
                            body.containsKey("dependsOnWorkflowIds")
                                    ? uuids(body.get("dependsOnWorkflowIds"))
                                    : (List<UUID>) before.get("dependsOnWorkflowIds");
                    validateDeps(reportId, workflowId, deps, now());
                    nullableReason(body);
                    if (name.equals(before.get("name"))
                            && desc.equals(before.get("description"))
                            && a.equals(Assignment.of(before))
                            && ReportGraph.sameDependencies(
                                    deps, (List<UUID>) before.get("dependsOnWorkflowIds")))
                        return map("workflow", before, "reportVersion", lock.version());
                    jdbc.update(
                            "update workflows set"
                                + " name=?,description=?,assignment_status=?,department_id=?,assignment_source=?,updated_at=?"
                                + " where id=?",
                            name,
                            desc,
                            a.status,
                            a.department,
                            a.source,
                            now(),
                            workflowId);
                    replaceDeps(reportId, workflowId, deps);
                    Map<String, Object> after = workflow(workflowId);
                    event(
                            lock,
                            "WORKFLOW_UPDATED",
                            "APPLY",
                            "USER",
                            nullableReason(body),
                            null,
                            null,
                            List.of(change(workflowId, "UPDATE", before, after)));
                    return map("workflow", after, "reportVersion", lock.version() + 1);
                });
    }

    public Map<String, Object> deleteWorkflow(UUID workflowId, long expected, String reason) {
        longValue(expected);
        if (reason != null) text(reason, 1, 2000, "理由無效。");
        return tx.execute(
                s -> {
                    UUID
                            reportId =
                                    (UUID)
                                            row(
                                                            "select report_id from workflows where"
                                                                    + " id=?",
                                                            workflowId)
                                                    .get("report_id"),
                            projectId =
                                    jdbc.queryForObject(
                                            "select project_id from reports where id=?",
                                            UUID.class,
                                            reportId);
                    Locked lock = lock(projectId);
                    Map<String, Object> before = workflow(workflowId);
                    editable(lock, expected);
                    List<UUID> children =
                            jdbc.queryForList(
                                    "select workflow_id from workflow_dependencies where"
                                            + " depends_on_workflow_id=? order by workflow_id",
                                    UUID.class,
                                    workflowId);
                    if (!children.isEmpty())
                        throw new ApiException(
                                HttpStatus.CONFLICT,
                                "WORKFLOW_HAS_DEPENDENTS",
                                "仍有工作依賴此工作。",
                                map("dependentWorkflowIds", children));
                    jdbc.update(
                            "delete from workflow_dependencies where workflow_id=?", workflowId);
                    jdbc.update("delete from workflows where id=?", workflowId);
                    event(
                            lock,
                            "WORKFLOW_DELETED",
                            "APPLY",
                            "USER",
                            reason,
                            null,
                            null,
                            List.of(change(workflowId, "DELETE", before, null)));
                    return map(
                            "deletedWorkflowId", workflowId, "reportVersion", lock.version() + 1);
                });
    }

    public HttpResult analyse(UUID projectId, Map<String, Object> body) {
        allowed(body, "type", "expectedReportVersion", "reason");
        return tx.execute(
                s -> {
                    Locked l = lock(projectId);
                    editable(l, longValue(body.get("expectedReportVersion")));
                    String type = text(body.get("type"), 1, 30, "分析類型無效。");
                    if (!Set.of("ALL_REANALYZE", "UNASSIGNED_ANALYZE").contains(type))
                        throw invalid();
                    String reason = nullableReason(body);
                    if (type.equals("ALL_REANALYZE") && reason == null) throw invalid();
                    List<Map<String, Object>> targets = workflows(l.reportId());
                    if (type.equals("ALL_REANALYZE") && targets.isEmpty())
                        throw ApiException.conflict("NO_WORKFLOWS", "沒有可分析的工作。");
                    if (type.equals("UNASSIGNED_ANALYZE"))
                        targets =
                                targets.stream()
                                        .filter(w -> !"ASSIGNED".equals(w.get("assignmentStatus")))
                                        .toList();
                    if (targets.isEmpty())
                        throw ApiException.conflict("NO_UNASSIGNED_WORKFLOWS", "沒有未歸屬工作。");
                    int memory = latestMemory();
                    long inputVersion = l.version();
                    UUID id = UUID.randomUUID();
                    if (type.equals("ALL_REANALYZE")) {
                        List<Map<String, Object>> changes = new ArrayList<>();
                        for (Map<String, Object> w : targets) {
                            Map<String, Object> b = workflow((UUID) w.get("id"));
                            jdbc.update(
                                    "update workflows set"
                                        + " assignment_status='UNASSIGNED',department_id=null,assignment_source=null,updated_at=?"
                                        + " where id=?",
                                    now(),
                                    w.get("id"));
                            changes.add(
                                    change(
                                            (UUID) w.get("id"),
                                            "UPDATE",
                                            b,
                                            workflow((UUID) w.get("id"))));
                        }
                        event(l, "ALL_REANALYZE", "CLEAR", "SYSTEM", reason, id, memory, changes);
                        inputVersion = l.version() + 1;
                    }
                    Map<String, Object> input =
                            map(
                                    "workflows",
                                    targets.stream()
                                            .map(
                                                    w ->
                                                            map(
                                                                    "id",
                                                                    w.get("id"),
                                                                    "name",
                                                                    w.get("name"),
                                                                    "description",
                                                                    w.get("description")))
                                            .toList(),
                                    "globalMemory",
                                    memory(memory));
                    input.put("reason", reason);
                    insertJob(id, projectId, type, memory, inputVersion, input, now());
                    return new HttpResult(202, map("job", job(id), "reportVersion", inputVersion));
                });
    }

    public Map<String, Object> diffs(UUID projectId, int limit, int offset) {
        return tx.read(() -> diffsSnapshot(projectId, limit, offset));
    }

    private Map<String, Object> diffsSnapshot(UUID projectId, int limit, int offset) {
        project(projectId);
        List<Map<String, Object>> rs =
                jdbc.queryForList(
                        "select * from report_diffs where project_id=? order by to_version limit ?"
                                + " offset ?",
                        projectId,
                        limit,
                        offset);
        int total =
                jdbc.queryForObject(
                        "select count(*) from report_diffs where project_id=?",
                        Integer.class,
                        projectId);
        return map(
                "items",
                rs.stream().map(this::diff).toList(),
                "total",
                total,
                "limit",
                limit,
                "offset",
                offset);
    }

    public HttpResult close(UUID projectId, Map<String, Object> body) {
        allowed(body, "expectedReportVersion", "reason");
        longValue(body.get("expectedReportVersion"));
        nullableReason(body);
        return tx.execute(
                s -> {
                    Locked l = lock(projectId);
                    if ("CLOSED".equals(l.status())) {
                        Map<String, Object> j =
                                row(
                                        "select * from jobs where project_id=? and type='FEEDBACK'",
                                        projectId);
                        return new HttpResult(
                                200,
                                map(
                                        "project",
                                        project(projectId),
                                        "reportVersion",
                                        l.version(),
                                        "feedbackJob",
                                        job(j)));
                    }
                    editable(l, longValue(body.get("expectedReportVersion")));
                    if (workflows(l.reportId()).isEmpty())
                        throw ApiException.conflict("NO_WORKFLOWS", "沒有工作。");
                    if (!initialSucceeded(projectId))
                        throw ApiException.conflict("INITIAL_ANALYSIS_REQUIRED", "首次分析尚未成功。");
                    Instant at = now();
                    jdbc.update(
                            "update projects set status='CLOSED',closed_at=? where id=?",
                            at,
                            projectId);
                    UUID id = UUID.randomUUID();
                    event(
                            l,
                            "PROJECT_CLOSED",
                            "APPLY",
                            "USER",
                            nullableReason(body),
                            id,
                            null,
                            List.of());
                    insertJob(
                            id,
                            projectId,
                            "FEEDBACK",
                            null,
                            l.version() + 1,
                            map(
                                    "report",
                                    report(row("select * from reports where id=?", l.reportId())),
                                    "reportDiffs",
                                    allDiffs(projectId)),
                            at);
                    return new HttpResult(
                            202,
                            map(
                                    "project",
                                    project(projectId),
                                    "reportVersion",
                                    l.version() + 1,
                                    "feedbackJob",
                                    job(id)));
                });
    }

    public Map<String, Object> getJob(UUID id) {
        return job(id);
    }

    public HttpResult retry(UUID id, Map<String, Object> body) {
        allowed(body);
        return retry(id);
    }

    public HttpResult retry(UUID id) {
        return tx.execute(
                s -> {
                    Locked l = lockJobProject(id);
                    Map<String, Object> j =
                            job(row("select * from jobs where id=? for update", id));
                    if (!"FAILED".equals(j.get("status")))
                        throw ApiException.conflict("JOB_NOT_RETRYABLE", "任務不可重試。");
                    UUID p = (UUID) j.get("projectId");
                    if (!"FEEDBACK".equals(j.get("type"))) {
                        if ("CLOSED".equals(l.status()))
                            throw ApiException.conflict("PROJECT_CLOSED", "專案已結案。");
                        if (l.version() != ((Number) j.get("inputReportVersion")).longValue())
                            throw ApiException.conflict("STALE_JOB_INPUT", "任務輸入已過期。");
                        if (activeAnalysis(p))
                            throw ApiException.conflict("PROJECT_BUSY", "專案有進行中的分析。");
                    }
                    requireWrite(
                            jdbc.update(
                                    "update jobs set"
                                        + " status='QUEUED',attempts=0,batch=batch+1,next_retry_at=null,error=null,started_at=null,finished_at=null,lease_until=null,execution_token=null,result=null"
                                        + " where id=? and status='FAILED'",
                                    id));
                    return new HttpResult(202, map("job", job(id)));
                });
    }

    // worker-facing helpers
    Map<String, Object> claimOne() {
        return tx.execute(
                s -> {
                    jdbc.queryForList("select pg_advisory_xact_lock(834219, 1)");
                    recoverExpired();
                    List<Map<String, Object>> candidates =
                            jdbc.queryForList(
                                    "select id,project_id from jobs where status in"
                                        + " ('QUEUED','RETRY_WAIT') and (next_retry_at is null or"
                                        + " next_retry_at<=?) and (type<>'FEEDBACK' or not"
                                        + " exists(select 1 from jobs x where x.type='FEEDBACK' and"
                                        + " x.status='RUNNING')) order by case when type='FEEDBACK'"
                                        + " then 1 else 0 end,created_at,id",
                                    now());
                    for (Map<String, Object> candidate : candidates) {
                        if (jdbc.queryForList(
                                        "select id from projects where id=? for update skip locked",
                                        candidate.get("project_id"))
                                .isEmpty()) continue;
                        Map<String, Object> r =
                                row(
                                        "select * from jobs where id=? for update",
                                        candidate.get("id"));
                        if (!Set.of("QUEUED", "RETRY_WAIT").contains(r.get("status"))) continue;
                        if (r.get("next_retry_at") != null
                                && toInstant(r.get("next_retry_at")).isAfter(now())) continue;
                        if ("FEEDBACK".equals(r.get("type"))) {
                            memoryLock();
                            int version = latestMemory();
                            Map<String, Object> input = Json.read((String) r.get("input"));
                            input.put("globalMemory", memory(version));
                            jdbc.update(
                                    "update jobs set input=?::jsonb,global_memory_version=? where"
                                            + " id=?",
                                    Json.write(input),
                                    version,
                                    r.get("id"));
                            r.put("global_memory_version", version);
                        }
                        UUID token = UUID.randomUUID();
                        Instant at = now();
                        int attempt = ((Number) r.get("attempts")).intValue() + 1;
                        requireWrite(
                                jdbc.update(
                                        "update jobs set"
                                            + " status='RUNNING',attempts=?,started_at=?,lease_until=?,execution_token=?"
                                            + " where id=? and status in ('QUEUED','RETRY_WAIT')",
                                        attempt,
                                        at,
                                        at.plusSeconds(150),
                                        token,
                                        r.get("id")));
                        jdbc.update(
                                "insert into job_attempts values(?,?,?,?,?,?,?,null,null)",
                                UUID.randomUUID(),
                                r.get("id"),
                                r.get("batch"),
                                attempt,
                                token,
                                r.get("global_memory_version"),
                                at);
                        Map<String, Object> claim = job((UUID) r.get("id"));
                        claim.put("executionToken", token);
                        return claim;
                    }
                    return null;
                });
    }

    void finish(UUID id, UUID token, Map<String, Object> result) {
        tx.executeWithoutResult(
                s -> {
                    lockJobProject(id);
                    Map<String, Object> execution =
                            row("select * from jobs where id=? for update", id);
                    // A late deadline/ownership loss aborts the surrounding result transaction.
                    if (!owns(id, token))
                        throw new IllegalStateException("Job execution ownership lost");
                    if (Thread.currentThread().isInterrupted()
                            || !toInstant(execution.get("started_at"))
                                    .plusSeconds(120)
                                    .isAfter(now()))
                        throw new com.seax.backend.ai.AiFailure(
                                "AI_TIMEOUT", "AI 分析超過單次嘗試時間上限。", true);
                    requireWrite(
                            jdbc.update(
                                    "update jobs set"
                                        + " status='SUCCEEDED',result=?::jsonb,error=null,finished_at=?,lease_until=null"
                                        + " where id=? and status='RUNNING' and execution_token=?"
                                        + " and lease_until>? and started_at>?",
                                    Json.write(result),
                                    now(),
                                    id,
                                    token,
                                    now(),
                                    now().minusSeconds(120)));
                    requireWrite(
                            jdbc.update(
                                    "update job_attempts set finished_at=? where job_id=? and"
                                            + " execution_token=? and finished_at is null",
                                    now(),
                                    id,
                                    token));
                });
    }

    void fail(UUID id, UUID token, String code, String message, boolean retryable, Duration after) {
        tx.executeWithoutResult(
                s -> {
                    lockJobProject(id);
                    Map<String, Object> j =
                            job(row("select * from jobs where id=? for update", id));
                    if (!owns(id, token)) return;
                    int attempts = ((Number) j.get("attempts")).intValue();
                    Instant at = now();
                    boolean again = retryable && attempts < 3;
                    Duration base = Duration.ofSeconds(attempts == 1 ? 5 : 30);
                    Duration delay = after != null && after.compareTo(base) > 0 ? after : base;
                    Instant retry = again ? at.plus(delay) : null;
                    Map<String, Object> error =
                            map("code", code, "message", message, "retryable", retryable);
                    requireWrite(
                            jdbc.update(
                                    "update jobs set"
                                        + " status=?,next_retry_at=?,error=?::jsonb,finished_at=?,lease_until=null"
                                        + " where id=? and status='RUNNING' and execution_token=?"
                                        + " and lease_until>?",
                                    again ? "RETRY_WAIT" : "FAILED",
                                    retry,
                                    Json.write(error),
                                    at,
                                    id,
                                    token,
                                    now()));
                    requireWrite(
                            jdbc.update(
                                    "update job_attempts set finished_at=?,error=?::jsonb where"
                                        + " job_id=? and execution_token=? and finished_at is null",
                                    at,
                                    Json.write(error),
                                    id,
                                    token));
                });
    }

    Map<String, Object> jobInput(UUID id) {
        Map<String, Object> r = row("select input::text input from jobs where id=?", id);
        return Json.read((String) r.get("input"));
    }

    void applyClassifications(UUID id, UUID token, List<Map<String, Object>> assignments) {
        tx.execute(
                s -> {
                    Locked l = lockJobProject(id);
                    Map<String, Object> j =
                            job(row("select * from jobs where id=? for update", id));
                    if (!owns(id, token)) return;
                    if (!"OPEN".equals(l.status())
                            || l.version() != ((Number) j.get("inputReportVersion")).longValue())
                        throw ApiException.conflict("STALE_JOB_INPUT", "任務輸入已過期。");
                    int memory = ((Number) j.get("globalMemoryVersion")).intValue();
                    Set<UUID> valid =
                            departments(memory).stream()
                                    .map(d -> uuid(d.get("id"), "invalid"))
                                    .collect(java.util.stream.Collectors.toSet());
                    Map<UUID, Map<String, Object>> expected =
                            maps(jobInput(id).get("workflows"), "workflows").stream()
                                    .collect(
                                            java.util.stream.Collectors.toMap(
                                                    w -> uuid(w.get("id"), "invalid"), w -> w));
                    if (assignments.size() != expected.size()) throw invalidAi();
                    Set<UUID> seen = new HashSet<>();
                    List<Map<String, Object>> changes = new ArrayList<>();
                    for (Map<String, Object> a : assignments) {
                        if (!a.keySet()
                                .equals(Set.of("workflowId", "assignmentStatus", "departmentId")))
                            throw invalidAi();
                        UUID wid = uuid(a.get("workflowId"), "invalid");
                        if (!seen.add(wid) || !expected.containsKey(wid)) throw invalidAi();
                        String st = text(a.get("assignmentStatus"), 1, 20, "invalid");
                        Object did = a.get("departmentId");
                        if ("ASSIGNED".equals(st)) {
                            UUID d = uuid(did, "invalid");
                            if (!valid.contains(d)) throw invalidAi();
                        } else if (!"UNKNOWN".equals(st) || did != null) throw invalidAi();
                        Map<String, Object> b = workflow(wid);
                        jdbc.update(
                                "update workflows set"
                                    + " assignment_status=?,department_id=?,assignment_source='AI',updated_at=?"
                                    + " where id=?",
                                st,
                                did == null ? null : uuid(did, "invalid"),
                                now(),
                                wid);
                        changes.add(change(wid, "UPDATE", b, workflow(wid)));
                    }
                    String type = (String) j.get("type");
                    event(
                            l,
                            type,
                            "APPLY",
                            "AI",
                            (String) jobInput(id).get("reason"),
                            id,
                            memory,
                            changes);
                    finish(id, token, map("reportVersion", l.version() + 1));
                });
    }

    void applyInitial(
            UUID id,
            UUID token,
            List<Map<String, Object>> split,
            List<Map<String, Object>> assignments) {
        tx.execute(
                s -> {
                    Locked l = lockJobProject(id);
                    Map<String, Object> j =
                            job(row("select * from jobs where id=? for update", id));
                    if (!owns(id, token)) return;
                    if (!"OPEN".equals(l.status()) || l.version() != 0)
                        throw ApiException.conflict("STALE_JOB_INPUT", "任務輸入已過期。");
                    if (split.isEmpty() || split.size() > 200) throw invalidAi();
                    Map<String, UUID> keys = new HashMap<>();
                    Set<UUID> allocated = new HashSet<>();
                    for (Map<String, Object> w : split) {
                        String key = text(w.get("key"), 1, 200, "invalid");
                        UUID wid = uuid(w.get("id"), "invalid");
                        if (!allocated.add(wid) || keys.putIfAbsent(key, wid) != null)
                            throw invalidAi();
                        text(w.get("name"), 1, 200, "invalid");
                        text(w.get("description"), 1, 10000, "invalid");
                    }
                    List<Map<String, Object>> a = assignments;
                    Set<UUID> assignmentIds = new HashSet<>();
                    for (Map<String, Object> assignment : a) {
                        if (!assignment
                                        .keySet()
                                        .equals(
                                                Set.of(
                                                        "workflowId",
                                                        "assignmentStatus",
                                                        "departmentId"))
                                || !assignmentIds.add(
                                        uuid(assignment.get("workflowId"), "invalid")))
                            throw invalidAi();
                    }
                    if (!assignmentIds.equals(allocated)) throw invalidAi();
                    int memory = ((Number) j.get("globalMemoryVersion")).intValue();
                    Set<UUID> valid =
                            departments(memory).stream()
                                    .map(d -> uuid(d.get("id"), "invalid"))
                                    .collect(java.util.stream.Collectors.toSet());
                    if (a.size() != split.size()) throw invalidAi();
                    Set<UUID> seen = new HashSet<>();
                    Instant at = now();
                    for (Map<String, Object> w : split) {
                        UUID wid = keys.get(w.get("key"));
                        Map<String, Object> as =
                                a.stream()
                                        .filter(
                                                x ->
                                                        wid.equals(
                                                                uuid(
                                                                        x.get("workflowId"),
                                                                        "invalid")))
                                        .findFirst()
                                        .orElseThrow(CoreService::invalidAi);
                        if (!seen.add(wid)) throw invalidAi();
                        String st = text(as.get("assignmentStatus"), 1, 20, "invalid");
                        Object dep = as.get("departmentId");
                        if ("ASSIGNED".equals(st) && valid.contains(uuid(dep, "invalid"))) {
                        } else if ("UNKNOWN".equals(st) && dep == null) {
                        } else throw invalidAi();
                        jdbc.update(
                                "insert into workflows values(?,?,?,?,?,?,?,?,?)",
                                wid,
                                l.reportId(),
                                w.get("name"),
                                w.get("description"),
                                st,
                                dep == null ? null : uuid(dep, "invalid"),
                                "AI",
                                at,
                                at);
                    }
                    for (Map<String, Object> w : split) {
                        List<String> ks = strings(w.get("dependsOnKeys"));
                        Set<String> set = new HashSet<>(ks);
                        if (set.size() != ks.size() || set.contains(w.get("key")))
                            throw invalidAi();
                        List<UUID> deps = ks.stream().map(keys::get).toList();
                        if (deps.contains(null)) throw invalidAi();
                        replaceDeps(l.reportId(), keys.get(w.get("key")), deps);
                    }
                    validateDeps(l.reportId(), null, List.of(), at);
                    List<Map<String, Object>> changes =
                            workflows(l.reportId()).stream()
                                    .map(w -> change((UUID) w.get("id"), "CREATE", null, w))
                                    .toList();
                    event(l, "INITIAL_ANALYSIS", "APPLY", "AI", null, id, memory, changes);
                    finish(id, token, map("reportVersion", 1L));
                });
    }

    void applyFeedback(UUID id, UUID token, List<Map<String, Object>> output) {
        tx.execute(
                s -> {
                    lockJobProject(id);
                    Map<String, Object> j =
                            job(row("select * from jobs where id=? for update", id));
                    if (!owns(id, token)) return;
                    memoryLock();
                    int current = latestMemory();
                    if (current != ((Number) j.get("globalMemoryVersion")).intValue())
                        throw ApiException.conflict("MEMORY_VERSION_CONFLICT", "組織記憶版本已更新。");
                    List<Map<String, Object>> old = departments(current);
                    if (output.size() != old.size()) throw invalidAi();
                    Map<UUID, Map<String, Object>> before =
                            old.stream()
                                    .collect(
                                            java.util.stream.Collectors.toMap(
                                                    d -> uuid(d.get("id"), "invalid"), d -> d));
                    for (Map<String, Object> d : output) {
                        if (!d.keySet().equals(Set.of("id", "name", "description")))
                            throw invalidAi();
                        UUID did = uuid(d.get("id"), "invalid");
                        Map<String, Object> orig = before.remove(did);
                        if (orig == null || !Objects.equals(orig.get("name"), d.get("name")))
                            throw invalidAi();
                        text(d.get("description"), 1, 10000, "invalid");
                    }
                    if (!before.isEmpty()) throw invalidAi();
                    UUID p = (UUID) j.get("projectId");
                    if (jdbc.queryForObject(
                                    "select count(*) from feedback_records where project_id=?",
                                    Integer.class,
                                    p)
                            > 0) {
                        finish(id, token, map("globalMemoryVersion", current));
                        return;
                    }
                    Map<String, Object> oldMemory = memory(current);
                    int next = current + 1;
                    jdbc.update(
                            "insert into global_memory values(?,?,?,'FEEDBACK',?,?)",
                            next,
                            Json.write(output),
                            oldMemory.get("relationshipsDescription"),
                            p,
                            now());
                    jdbc.update("insert into feedback_records values(?,?,?)", p, next, now());
                    finish(id, token, map("globalMemoryVersion", next));
                });
    }

    boolean heartbeat(UUID jobId, UUID token) {
        return tx.execute(
                s ->
                        jdbc.update(
                                        "update jobs set lease_until=? where id=? and"
                                                + " status='RUNNING' and execution_token=? and"
                                                + " lease_until>?",
                                        now().plusSeconds(150),
                                        jobId,
                                        token,
                                        now())
                                == 1);
    }

    private void recoverExpired() {
        Instant at = now();
        List<Map<String, Object>> rs =
                jdbc.queryForList(
                        "select id from jobs where status='RUNNING' and lease_until<=? order by"
                                + " project_id,id",
                        at);
        for (Map<String, Object> candidate : rs) {
            lockJobProject((UUID) candidate.get("id"));
            Map<String, Object> r =
                    row("select * from jobs where id=? for update", candidate.get("id"));
            if (!"RUNNING".equals(r.get("status"))
                    || r.get("lease_until") == null
                    || toInstant(r.get("lease_until")).isAfter(at)) continue;
            int a = ((Number) r.get("attempts")).intValue();
            boolean again = a < 3;
            Map<String, Object> e =
                    map("code", "WORKER_INTERRUPTED", "message", "工作程序中斷。", "retryable", true);
            requireWrite(
                    jdbc.update(
                            "update jobs set"
                                + " status=?,next_retry_at=?,error=?::jsonb,finished_at=?,lease_until=null"
                                + " where id=? and status='RUNNING' and execution_token=? and"
                                + " lease_until<=?",
                            again ? "RETRY_WAIT" : "FAILED",
                            again ? at.plusSeconds(a == 1 ? 5 : 30) : null,
                            Json.write(e),
                            at,
                            r.get("id"),
                            r.get("execution_token"),
                            at));
            requireWrite(
                    jdbc.update(
                            "update job_attempts set finished_at=?,error=?::jsonb where job_id=?"
                                + " and execution_token=? and finished_at is null",
                            at,
                            Json.write(e),
                            r.get("id"),
                            r.get("execution_token")));
        }
    }

    private boolean owns(UUID id, UUID token) {
        return jdbc.queryForObject(
                        "select count(*) from jobs where id=? and status='RUNNING' and"
                                + " execution_token=? and lease_until>?",
                        Integer.class,
                        id,
                        token,
                        now())
                == 1;
    }

    private void insertJob(
            UUID id,
            UUID project,
            String type,
            Integer memory,
            long inputVersion,
            Map<String, Object> input,
            Instant at) {
        if ("FEEDBACK".equals(type) && memory == null) {
            memory = latestMemory();
            input = new LinkedHashMap<>(input);
            input.put("globalMemory", memory(memory));
        }
        jdbc.update(
                "insert into"
                    + " jobs(id,project_id,type,status,attempts,max_attempts,batch,next_retry_at,global_memory_version,input_report_version,input,result,error,created_at,started_at,finished_at,lease_until,execution_token)"
                    + " values(?,?,?,'QUEUED',0,3,1,null,?,?,?::jsonb,null,null,?,null,null,null,null)",
                id,
                project,
                type,
                memory,
                inputVersion,
                Json.write(input),
                at);
    }

    private Locked lock(UUID p) {
        Map<String, Object> pr = row("select * from projects where id=? for update", p);
        Map<String, Object> r = row("select * from reports where project_id=?", p);
        return new Locked(
                p,
                (UUID) r.get("id"),
                ((Number) r.get("version")).longValue(),
                (String) pr.get("status"));
    }

    private record Locked(UUID projectId, UUID reportId, long version, String status) {}

    private void editable(Locked lock, long expected) {
        if (!"OPEN".equals(lock.status())) throw ApiException.conflict("PROJECT_CLOSED", "專案已結案。");
        if (lock.version() != expected)
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "REPORT_VERSION_CONFLICT",
                    "報告已更新，請重新讀取後再操作。",
                    map("expectedReportVersion", expected, "actualReportVersion", lock.version()));
        if (activeAnalysis(lock.projectId()))
            throw ApiException.conflict("PROJECT_BUSY", "專案有進行中的分析。");
        if (!initialSucceeded(lock.projectId()))
            throw ApiException.conflict("INITIAL_ANALYSIS_REQUIRED", "首次分析尚未成功。");
    }

    private boolean initialSucceeded(UUID p) {
        return jdbc.queryForObject(
                        "select count(*) from jobs where project_id=? and type='INITIAL_ANALYSIS'"
                                + " and status='SUCCEEDED'",
                        Integer.class,
                        p)
                > 0;
    }

    private boolean activeAnalysis(UUID p) {
        return jdbc.queryForObject(
                        "select count(*) from jobs where project_id=? and type in"
                                + " ('INITIAL_ANALYSIS','ALL_REANALYZE','UNASSIGNED_ANALYZE') and"
                                + " status in ('QUEUED','RUNNING','RETRY_WAIT')",
                        Integer.class,
                        p)
                > 0;
    }

    private void event(
            Locked l,
            String type,
            String phase,
            String source,
            String reason,
            UUID job,
            Integer memory,
            List<Map<String, Object>> changes) {
        long next = l.version() + 1;
        Instant at = now();
        jdbc.update("update reports set version=?,updated_at=? where id=?", next, at, l.reportId());
        jdbc.update(
                "insert into report_diffs values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(),
                l.projectId(),
                l.reportId(),
                type,
                phase,
                source,
                null,
                reason,
                job,
                memory,
                l.version(),
                next,
                Json.write(changes),
                at);
    }

    private void validateDeps(UUID report, UUID self, List<UUID> deps, Instant at) {
        List<ReportGraph.Node> nodes =
                workflows(report).stream()
                        .map(
                                w ->
                                        new ReportGraph.Node(
                                                (UUID) w.get("id"),
                                                report,
                                                (List<UUID>) w.get("dependsOnWorkflowIds"),
                                                Instant.parse((String) w.get("createdAt"))))
                        .toList();
        for (UUID dependency : deps)
            if (nodes.stream().noneMatch(node -> node.id().equals(dependency)))
                throw new ApiException(
                        HttpStatus.BAD_REQUEST, "INVALID_WORKFLOW_DEPENDENCY", "工作相依關係無效。");
        if (self != null && nodes.stream().anyMatch(node -> node.id().equals(self)))
            new ReportGraph(nodes).validateReplacement(self, deps);
        else new ReportGraph(nodes).topologicallySorted();
    }

    private void replaceDeps(UUID report, UUID workflow, List<UUID> deps) {
        jdbc.update("delete from workflow_dependencies where workflow_id=?", workflow);
        for (UUID d : ReportGraph.canonical(deps))
            jdbc.update("insert into workflow_dependencies values(?,?,?)", report, workflow, d);
    }

    private int count(UUID report) {
        return jdbc.queryForObject(
                "select count(*) from workflows where report_id=?", Integer.class, report);
    }

    private int latestMemory() {
        Integer x = jdbc.queryForObject("select max(version) from global_memory", Integer.class);
        if (x == null) throw ApiException.conflict("GLOBAL_MEMORY_NOT_INITIALIZED", "尚未初始化全域記憶。");
        return x;
    }

    private Map<String, Object> project(UUID id) {
        return project(row("select * from projects where id=?", id));
    }

    private Map<String, Object> project(Map<String, Object> r) {
        return map(
                "id",
                r.get("id"),
                "name",
                r.get("name"),
                "status",
                r.get("status"),
                "createdAt",
                iso(r.get("created_at")),
                "closedAt",
                iso(r.get("closed_at")));
    }

    private Map<String, Object> report(Map<String, Object> r) {
        UUID id = (UUID) r.get("id");
        return map(
                "id",
                id,
                "projectId",
                r.get("project_id"),
                "version",
                r.get("version"),
                "createdAt",
                iso(r.get("created_at")),
                "updatedAt",
                iso(r.get("updated_at")),
                "workflows",
                workflows(id));
    }

    private List<Map<String, Object>> workflows(UUID report) {
        List<Map<String, Object>> rows =
                jdbc.queryForList(
                        "select w.*,coalesce(array_agg(d.depends_on_workflow_id) filter(where"
                            + " d.depends_on_workflow_id is not null),'{}') deps from workflows w"
                            + " left join workflow_dependencies d on d.workflow_id=w.id where"
                            + " w.report_id=? group by w.id",
                        report);
        Map<UUID, ReportGraph.Node> graph = new HashMap<>();
        for (Map<String, Object> r : rows) {
            UUID id = (UUID) r.get("id");
            List<UUID> ds = arrayUuids(r.get("deps"));
            graph.put(id, new ReportGraph.Node(id, report, ds, toInstant(r.get("created_at"))));
            r.put("depList", ds);
        }
        return new ReportGraph(graph.values())
                .topologicallySorted().stream()
                        .map(
                                n -> {
                                    Map<String, Object> r =
                                            rows.stream()
                                                    .filter(x -> n.id().equals(x.get("id")))
                                                    .findFirst()
                                                    .orElseThrow();
                                    return workflowMap(r, (List<UUID>) r.get("depList"));
                                })
                        .toList();
    }

    private Map<String, Object> workflow(UUID id) {
        Map<String, Object> r = row("select * from workflows where id=?", id);
        List<UUID> ds =
                jdbc.queryForList(
                        "select depends_on_workflow_id from workflow_dependencies where"
                                + " workflow_id=? order by depends_on_workflow_id",
                        UUID.class,
                        id);
        return workflowMap(r, ds);
    }

    private Map<String, Object> workflowMap(Map<String, Object> r, List<UUID> ds) {
        return map(
                "id",
                r.get("id"),
                "reportId",
                r.get("report_id"),
                "name",
                r.get("name"),
                "description",
                r.get("description"),
                "dependsOnWorkflowIds",
                ReportGraph.canonical(ds),
                "assignmentStatus",
                r.get("assignment_status"),
                "departmentId",
                r.get("department_id"),
                "assignmentSource",
                r.get("assignment_source"),
                "createdAt",
                iso(r.get("created_at")),
                "updatedAt",
                iso(r.get("updated_at")));
    }

    private Map<String, Object> job(UUID id) {
        return job(row("select * from jobs where id=?", id));
    }

    private Map<String, Object> job(Map<String, Object> r) {
        Object input = r.get("input");
        return map(
                "id",
                r.get("id"),
                "projectId",
                r.get("project_id"),
                "type",
                r.get("type"),
                "status",
                r.get("status"),
                "attempts",
                r.get("attempts"),
                "maxAttempts",
                r.get("max_attempts"),
                "nextRetryAt",
                iso(r.get("next_retry_at")),
                "globalMemoryVersion",
                r.get("global_memory_version"),
                "inputReportVersion",
                r.get("input_report_version"),
                "error",
                r.get("error") == null ? null : Json.read((String) r.get("error")),
                "createdAt",
                iso(r.get("created_at")),
                "startedAt",
                iso(r.get("started_at")),
                "finishedAt",
                iso(r.get("finished_at")),
                "result",
                r.get("result") == null ? null : Json.read((String) r.get("result")));
    }

    private Map<String, Object> diff(Map<String, Object> r) {
        return map(
                "id",
                r.get("id"),
                "projectId",
                r.get("project_id"),
                "reportId",
                r.get("report_id"),
                "eventType",
                r.get("event_type"),
                "phase",
                r.get("phase"),
                "source",
                r.get("source"),
                "actorId",
                r.get("actor_id"),
                "reason",
                r.get("reason"),
                "jobId",
                r.get("job_id"),
                "globalMemoryVersion",
                r.get("global_memory_version"),
                "fromVersion",
                r.get("from_version"),
                "toVersion",
                r.get("to_version"),
                "changes",
                Json.read("{\"items\":" + r.get("changes") + "}").get("items"),
                "createdAt",
                iso(r.get("created_at")));
    }

    private List<Map<String, Object>> allDiffs(UUID p) {
        return jdbc
                .queryForList(
                        "select * from report_diffs where project_id=? order by to_version", p)
                .stream()
                .map(this::diff)
                .toList();
    }

    private static Map<String, Object> change(
            UUID id, String op, Map<String, Object> b, Map<String, Object> a) {
        List<String> fields;
        if ("CREATE".equals(op)) fields = new ArrayList<>(a.keySet());
        else if ("DELETE".equals(op)) fields = new ArrayList<>(b.keySet());
        else {
            fields = new ArrayList<>();
            for (String k : b.keySet())
                if (!Objects.equals(b.get(k), a.get(k)) && !k.equals("createdAtInstant"))
                    fields.add(k);
        }
        return map(
                "workflowId",
                id,
                "operation",
                op,
                "changedFields",
                fields,
                "before",
                withoutInternal(b),
                "after",
                withoutInternal(a));
    }

    private static Map<String, Object> withoutInternal(Map<String, Object> x) {
        if (x == null) return null;
        Map<String, Object> y = new LinkedHashMap<>(x);
        y.remove("createdAtInstant");
        return y;
    }

    private record Assignment(String status, UUID department, String source) {
        static Assignment of(Map<String, Object> w) {
            return new Assignment(
                    (String) w.get("assignmentStatus"),
                    (UUID) w.get("departmentId"),
                    (String) w.get("assignmentSource"));
        }
    }

    private Assignment assignment(Map<String, Object> body, Map<String, Object> old) {
        boolean statusPresent = body.containsKey("assignmentStatus"),
                departmentPresent = body.containsKey("departmentId");
        if (!statusPresent && !departmentPresent)
            return old == null ? new Assignment("UNASSIGNED", null, null) : Assignment.of(old);
        String status =
                statusPresent
                        ? text(body.get("assignmentStatus"), 1, 20, "歸屬狀態無效。")
                        : body.get("departmentId") == null ? "UNASSIGNED" : "ASSIGNED";
        Object department =
                departmentPresent
                        ? body.get("departmentId")
                        : (old == null ? null : old.get("departmentId"));
        if ("ASSIGNED".equals(status)) {
            if (statusPresent && !departmentPresent) throw invalid();
            UUID id = uuid(department, "部門 ID 無效。");
            if (!departmentExists(id)) throw invalid();
            return new Assignment(status, id, "USER");
        }
        if ("UNKNOWN".equals(status) || "UNASSIGNED".equals(status)) {
            if (departmentPresent && department != null) throw invalid();
            return new Assignment(status, null, "UNASSIGNED".equals(status) ? null : "USER");
        }
        throw invalid();
    }

    private boolean departmentExists(UUID id) {
        return departments(latestMemory()).stream()
                .anyMatch(d -> id.equals(uuid(d.get("id"), "invalid")));
    }

    private Map<String, Object> row(String sql, Object... args) {
        List<Map<String, Object>> r = jdbc.queryForList(sql, args);
        if (r.isEmpty()) throw ApiException.notFound();
        return r.getFirst();
    }

    private static Instant toInstant(Object x) {
        if (x instanceof Instant i) return i;
        if (x instanceof OffsetDateTime o) return o.toInstant();
        if (x instanceof java.sql.Timestamp t) return t.toInstant();
        return Instant.parse(String.valueOf(x));
    }

    private Instant now() {
        return clock.instant();
    }

    private static String iso(Object x) {
        return x == null ? null : toInstant(x).toString();
    }

    private static Map<String, Object> map(Object... xs) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < xs.length; i += 2) m.put((String) xs[i], xs[i + 1]);
        return m;
    }

    private static Map<String, Object> obj(Object x, String n) {
        if (!(x instanceof Map<?, ?> m)) throw invalid();
        Map<String, Object> r = new LinkedHashMap<>();
        m.forEach((k, v) -> r.put(String.valueOf(k), v));
        return r;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object x, String n) {
        if (!(x instanceof List<?> l)) throw invalid();
        return l.stream().map(v -> obj(v, n)).toList();
    }

    private static List<String> strings(Object x) {
        if (!(x instanceof List<?> l)) throw invalid();
        return l.stream()
                .map(
                        v -> {
                            if (!(v instanceof String s)) throw invalid();
                            return s;
                        })
                .toList();
    }

    private static List<UUID> uuids(Object x) {
        if (!(x instanceof List<?> l))
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, "INVALID_WORKFLOW_DEPENDENCY", "工作相依關係無效。");
        try {
            return ReportGraph.canonical(l.stream().map(v -> uuid(v, "工作相依關係無效。")).toList());
        } catch (ApiException e) {
            throw ApiException.bad("INVALID_WORKFLOW_DEPENDENCY", "工作相依關係無效。");
        }
    }

    private static UUID uuid(Object x, String msg) {
        if (x instanceof UUID u) return u;
        if (!(x instanceof String text)
                || !text.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))
            throw ApiException.bad("INVALID_REQUEST", msg);
        return UUID.fromString(text);
    }

    private static String text(Object x, int min, int max, String msg) {
        if (!(x instanceof String s)
                || s.codePointCount(0, s.length()) < min
                || s.codePointCount(0, s.length()) > max
                || (min > 0
                        && s.codePoints()
                                .allMatch(
                                        c ->
                                                Character.isWhitespace(c)
                                                        || Character.isSpaceChar(c))))
            throw ApiException.bad("INVALID_REQUEST", msg);
        return s;
    }

    private static long longValue(Object x) {
        if (!(x instanceof Number n) || n.longValue() < 0 || n.doubleValue() != n.longValue())
            throw invalid();
        return n.longValue();
    }

    private static String nullableReason(Map<String, Object> b) {
        if (!b.containsKey("reason")) return null;
        return text(b.get("reason"), 1, 2000, "理由無效。");
    }

    private static void allowed(Map<String, Object> body, String... keys) {
        if (!Set.of(keys).containsAll(body.keySet())) throw invalid();
    }

    private void memoryLock() {
        jdbc.queryForList("select pg_advisory_xact_lock(834219, 2)");
    }

    private Locked lockJobProject(UUID jobId) {
        UUID project =
                (UUID) row("select project_id from jobs where id=?", jobId).get("project_id");
        return lock(project);
    }

    private static void requireWrite(int rows) {
        if (rows != 1) throw new IllegalStateException("Job execution ownership lost");
    }

    private static ApiException invalid() {
        return ApiException.bad("INVALID_REQUEST", "請求內容無效。");
    }

    private static ApiException invalidAi() {
        return new ApiException(HttpStatus.BAD_REQUEST, "AI_INVALID_OUTPUT", "AI 輸出格式無效。");
    }

    private static List<UUID> arrayUuids(Object a) {
        if (a instanceof java.sql.Array x)
            try {
                return Arrays.stream((Object[]) x.getArray()).map(v -> (UUID) v).toList();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        return List.of();
    }
}
