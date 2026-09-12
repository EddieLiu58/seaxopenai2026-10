package com.seax.backend;

import static org.assertj.core.api.Assertions.*;

import com.seax.backend.ai.*;
import com.seax.backend.core.DurableJobWorker;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.net.URI;
import java.net.http.*;
import java.sql.DriverManager;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;

@Tag("integration")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "seax.seed.enabled=false",
            "seax.worker.enabled=false",
            "logging.level.com.seax.backend.core.DurableJobWorker=DEBUG"
        })
@Import(BackendIntegrationTest.Fakes.class)
class BackendIntegrationTest {
    static final String SCHEMA = "test_" + UUID.randomUUID().toString().replace("-", "");
    static final String DB_URL =
            System.getenv()
                    .getOrDefault("TEST_DATABASE_URL", "jdbc:postgresql://localhost:5432/seax");
    static final String DB_USER = System.getenv().getOrDefault("TEST_DATABASE_USERNAME", "seax");
    static final String DB_PASSWORD =
            System.getenv().getOrDefault("TEST_DATABASE_PASSWORD", "seax");

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) throws Exception {
        try (var connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
                var statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + SCHEMA);
        }
        registry.add(
                "spring.datasource.url",
                () -> DB_URL + (DB_URL.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA);
        registry.add("spring.datasource.username", () -> DB_USER);
        registry.add("spring.datasource.password", () -> DB_PASSWORD);
        registry.add("spring.flyway.default-schema", () -> SCHEMA);
    }

    @AfterAll
    static void removeTestSchema() throws Exception {
        try (var connection = DriverManager.getConnection(DB_URL, DB_USER, DB_PASSWORD);
                var statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA " + SCHEMA + " CASCADE");
        }
    }

    @org.springframework.beans.factory.annotation.Value("${local.server.port}")
    int port;

    @Autowired DurableJobWorker worker;
    @Autowired ScriptedAi ai;
    @Autowired MutableClock clock;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean JdbcTemplate jdbc;
    @Autowired com.seax.backend.core.CoreService core;
    final HttpClient http = HttpClient.newHttpClient();
    Map<String, Object> memory;

    @BeforeEach
    void reset() throws Exception {
        jdbc.execute("TRUNCATE global_memory, projects, idempotency_records CASCADE");
        ai.reset();
        clock.now = Instant.parse("2026-09-12T00:00:00Z");
        memory =
                Json.read(
                        new String(
                                Objects.requireNonNull(
                                                getClass()
                                                        .getResourceAsStream(
                                                                "/examples/global-memory-software-company.json"))
                                        .readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    void initializationRequiresMemoryAndNeverOverwritesIt() {
        error(post("/projects", projectBody(), 409), "GLOBAL_MEMORY_NOT_INITIALIZED");
        String key = UUID.randomUUID().toString();
        var initial = call("POST", "/global-memory", memory, key, 201);
        assertThat(initial.get("version")).isEqualTo(1);
        assertThat(list(initial, "departments")).hasSize(10);
        assertThat(call("POST", "/global-memory", memory, key, 201)).isEqualTo(initial);
        error(post("/global-memory", memory, 409), "GLOBAL_MEMORY_ALREADY_INITIALIZED");
        assertThat(get("/global-memory", 200)).isEqualTo(initial);
        assertThat(get("/global-memory?version=1", 200)).isEqualTo(initial);
        error(call("POST", "/projects", projectBody(), null, 400), "INVALID_REQUEST");
    }

    @Test
    void completeLifecyclePreservesGraphAuditsUnknownAndCloseDespiteFeedbackFailure() {
        seed();
        var created = post("/projects", projectBody(), 202);
        String project = id(map(created, "project")), job = id(map(created, "job"));
        assertThat(map(created, "report").get("version")).isEqualTo(0);
        error(
                post("/projects/" + project + "/close", Map.of("expectedReportVersion", 0), 409),
                "PROJECT_BUSY");
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200))
                .containsEntry("status", "SUCCEEDED")
                .containsEntry("attempts", 1);
        var report = report(project);
        assertThat(list(report, "workflows")).hasSize(4);
        assertThat(report.get("version")).isEqualTo(1);
        var byName = workflowsByName(report);
        String a = id(byName.get("A")),
                b = id(byName.get("B")),
                c = id(byName.get("C")),
                d = id(byName.get("D"));
        var ordered = list(report, "workflows").stream().map(w -> (String) w.get("name")).toList();
        assertThat(ordered.indexOf("A")).isLessThan(ordered.indexOf("B"));
        assertThat(ordered.indexOf("D")).isGreaterThan(ordered.indexOf("C"));
        list(report, "workflows")
                .forEach(
                        w ->
                                assertThat(w)
                                        .containsEntry("assignmentStatus", "UNKNOWN")
                                        .containsEntry("departmentId", null));
        String department = (String) list(memory, "departments").getFirst().get("id");
        var assigned =
                patch(b, Map.of("expectedReportVersion", 1, "departmentId", department), 200);
        assertThat(map(assigned, "workflow"))
                .containsEntry("assignmentStatus", "ASSIGNED")
                .containsEntry("assignmentSource", "USER");
        var reverseDependencies =
                new ArrayList<>((List<?>) byName.get("D").get("dependsOnWorkflowIds"));
        Collections.reverse(reverseDependencies);
        var reordered =
                patch(
                        d,
                        Map.of(
                                "expectedReportVersion",
                                2,
                                "dependsOnWorkflowIds",
                                reverseDependencies),
                        200);
        assertThat(reordered.get("reportVersion")).isEqualTo(2);
        assertThat(
                        patch(
                                        b,
                                        Map.of(
                                                "expectedReportVersion",
                                                2,
                                                "description",
                                                "B description"),
                                        200)
                                .get("reportVersion"))
                .isEqualTo(2);
        error(
                patch(
                        a,
                        Map.of("expectedReportVersion", 2, "dependsOnWorkflowIds", List.of(d)),
                        409),
                "WORKFLOW_DEPENDENCY_CYCLE");
        error(
                patch(
                        a,
                        Map.of("expectedReportVersion", 2, "dependsOnWorkflowIds", List.of(a)),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        var deleteError =
                call("DELETE", "/workflows/" + a + "?expectedReportVersion=2", null, null, 409);
        error(deleteError, "WORKFLOW_HAS_DEPENDENTS");
        assertThat(map(map(deleteError, "error"), "details").get("dependentWorkflowIds"))
                .isEqualTo(List.of(b, c).stream().sorted().toList());
        String analysisKey = UUID.randomUUID().toString();
        var analysisBody =
                Map.of("expectedReportVersion", 2, "type", "ALL_REANALYZE", "reason", "重新判斷");
        var analysis =
                call("POST", "/projects/" + project + "/analyses", analysisBody, analysisKey, 202);
        assertThat(
                        call(
                                "POST",
                                "/projects/" + project + "/analyses",
                                analysisBody,
                                analysisKey,
                                202))
                .isEqualTo(analysis);
        assertThat(analysis.get("reportVersion")).isEqualTo(3);
        var cleared = report(project);
        list(cleared, "workflows")
                .forEach(
                        w ->
                                assertThat(w)
                                        .containsEntry("assignmentStatus", "UNASSIGNED")
                                        .containsEntry("assignmentSource", null)
                                        .containsEntry("departmentId", null));
        assertThat(workflowsByName(cleared).get("D").get("dependsOnWorkflowIds"))
                .isEqualTo(List.of(b, c).stream().sorted().toList());
        worker.runOnce();
        assertThat(report(project).get("version")).isEqualTo(4);
        assertThat(ai.lastClassify.keySet()).containsExactlyInAnyOrder("workflows", "globalMemory");
        list(ai.lastClassify, "workflows")
                .forEach(
                        w ->
                                assertThat(w.keySet())
                                        .containsExactlyInAnyOrder("id", "name", "description"));
        String closeKey = UUID.randomUUID().toString();
        var close =
                call(
                        "POST",
                        "/projects/" + project + "/close",
                        Map.of("expectedReportVersion", 4),
                        closeKey,
                        202);
        assertThat(map(close, "project")).containsEntry("status", "CLOSED");
        String feedback = id(map(close, "feedbackJob"));
        ai.failure = new AiFailure("AI_AUTH_ERROR", "Bad credentials", false);
        worker.runOnce();
        assertThat(get("/jobs/" + feedback, 200)).containsEntry("status", "FAILED");
        assertThat(map(get("/projects/" + project, 200), "project"))
                .containsEntry("status", "CLOSED");
        error(
                patch(a, Map.of("expectedReportVersion", 5, "name", "change"), 409),
                "PROJECT_CLOSED");
        var repeat =
                post("/projects/" + project + "/close", Map.of("expectedReportVersion", 0), 200);
        assertThat(id(map(repeat, "feedbackJob"))).isEqualTo(feedback);
        assertThat(
                        call(
                                "POST",
                                "/projects/" + project + "/close",
                                Map.of("expectedReportVersion", 4),
                                closeKey,
                                202))
                .isEqualTo(close);
        ai.failure = null;
        var retry = post("/jobs/" + feedback + "/retry", Map.of(), 202);
        assertThat(map(retry, "job")).containsEntry("attempts", 0);
        worker.runOnce();
        assertThat(get("/jobs/" + feedback, 200)).containsEntry("status", "SUCCEEDED");
        assertThat(get("/global-memory", 200))
                .containsEntry("version", 2)
                .containsEntry("sourceProjectId", project);
        assertThat(get("/global-memory?version=1", 200).get("relationshipsDescription"))
                .isEqualTo(memory.get("relationshipsDescription"));
        var diffs = list(get("/projects/" + project + "/report-diffs", 200), "items");
        assertThat(diffs).hasSize(5);
        assertThat(diffs.get(2))
                .containsEntry("phase", "CLEAR")
                .containsEntry("eventType", "ALL_REANALYZE")
                .containsEntry("jobId", id(map(analysis, "job")));
        assertThat(list(diffs.getFirst(), "changes").getFirst().keySet())
                .contains("before", "after", "changedFields");
        assertThat(ai.lastFeedback).containsKeys("report", "reportDiffs", "globalMemory");
    }

    @Test
    void unassignedAnalysisTargetsUnknownAndPreservesAssignedWorkflow() {
        seed();
        var p = createAndRun();
        String project = id(p);
        var workflows = list(report(project), "workflows");
        String assigned = id(workflows.getFirst());
        String dept = (String) list(memory, "departments").getFirst().get("id");
        patch(assigned, Map.of("expectedReportVersion", 1, "departmentId", dept), 200);
        var original = workflowsById(report(project)).get(assigned);
        post(
                "/projects/" + project + "/analyses",
                Map.of("expectedReportVersion", 2, "type", "UNASSIGNED_ANALYZE"),
                202);
        worker.runOnce();
        assertThat(list(ai.lastClassify, "workflows")).hasSize(3);
        assertThat(workflowsById(report(project)).get(assigned)).isEqualTo(original);
        assertThat(report(project).get("version")).isEqualTo(3);
        ai.department = dept;
        post(
                "/projects/" + project + "/analyses",
                Map.of("expectedReportVersion", 3, "type", "UNASSIGNED_ANALYZE"),
                202);
        worker.runOnce();
        error(
                post(
                        "/projects/" + project + "/analyses",
                        Map.of("expectedReportVersion", 4, "type", "UNASSIGNED_ANALYZE"),
                        409),
                "NO_UNASSIGNED_WORKFLOWS");
    }

    @Test
    void invalidAiOutputIsAtomicRetriesThreeTimesAndManualRetryReusesSnapshot() {
        seed();
        ai.invalidSplit = true;
        var created = post("/projects", projectBody(), 202);
        String project = id(map(created, "project")), job = id(map(created, "job"));
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200))
                .containsEntry("status", "RETRY_WAIT")
                .containsEntry("attempts", 1);
        assertThat(map(get("/jobs/" + job, 200), "error"))
                .containsEntry("code", "AI_INVALID_OUTPUT");
        assertThat(report(project).get("version")).isEqualTo(0);
        assertThat(list(report(project), "workflows")).isEmpty();
        clock.advance(6);
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200)).containsEntry("attempts", 2);
        clock.advance(31);
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200))
                .containsEntry("status", "FAILED")
                .containsEntry("attempts", 3);
        ai.invalidSplit = false;
        String key = UUID.randomUUID().toString();
        var retry = call("POST", "/jobs/" + job + "/retry", Map.of(), key, 202);
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200))
                .containsEntry("status", "SUCCEEDED")
                .containsEntry("attempts", 1);
        assertThat(call("POST", "/jobs/" + job + "/retry", Map.of(), key, 202)).isEqualTo(retry);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM job_attempts WHERE job_id=?",
                                Integer.class,
                                UUID.fromString(job)))
                .isEqualTo(4);
    }

    @Test
    void staleFailedAnalysisCannotRetryAndFailedReanalysisKeepsClearedAssignments() {
        seed();
        var p = createAndRun();
        String project = id(p), workflow = id(list(report(project), "workflows").getFirst());
        ai.failure = new AiFailure("AI_AUTH_ERROR", "bad key", false);
        var analysis =
                post(
                        "/projects/" + project + "/analyses",
                        Map.of(
                                "expectedReportVersion",
                                1,
                                "type",
                                "ALL_REANALYZE",
                                "reason",
                                "再分析"),
                        202);
        worker.runOnce();
        assertThat(workflowsById(report(project)).get(workflow))
                .containsEntry("assignmentStatus", "UNASSIGNED");
        patch(workflow, Map.of("expectedReportVersion", 2, "name", "new name"), 200);
        error(
                post("/jobs/" + id(map(analysis, "job")) + "/retry", Map.of(), 409),
                "STALE_JOB_INPUT");
    }

    @Test
    void concurrentIdempotencyAndOptimisticEditsHaveOneEffect() throws Exception {
        seed();
        String key = UUID.randomUUID().toString();
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = pool.submit(() -> call("POST", "/projects", projectBody(), key, 202));
            var two = pool.submit(() -> call("POST", "/projects", projectBody(), key, 202));
            var created = one.get(10, TimeUnit.SECONDS);
            assertThat(two.get(10, TimeUnit.SECONDS)).isEqualTo(created);
            assertThat(get("/projects", 200).get("total")).isEqualTo(1);
            error(
                    call(
                            "POST",
                            "/projects",
                            Map.of("name", "different", "userDoc", Map.of("content", "x")),
                            key,
                            409),
                    "IDEMPOTENCY_KEY_REUSED");
            worker.runOnce();
            String project = id(map(created, "project"));
            var workflows = workflowsByName(report(project));
            String b = id(workflows.get("B")), c = id(workflows.get("C"));
            var edit1 =
                    pool.submit(
                            () ->
                                    raw(
                                            "PATCH",
                                            "/workflows/" + b,
                                            Map.of(
                                                    "expectedReportVersion",
                                                    1,
                                                    "dependsOnWorkflowIds",
                                                    List.of(c)),
                                            null));
            var edit2 =
                    pool.submit(
                            () ->
                                    raw(
                                            "PATCH",
                                            "/workflows/" + c,
                                            Map.of(
                                                    "expectedReportVersion",
                                                    1,
                                                    "dependsOnWorkflowIds",
                                                    List.of(b)),
                                            null));
            assertThat(List.of(edit1.get().statusCode(), edit2.get().statusCode()))
                    .containsExactlyInAnyOrder(200, 409);
            assertThat(report(project).get("version")).isEqualTo(2);
        }
    }

    @Test
    void manualCrudValidatesReferencesAndRetainsDeleteSnapshot() {
        seed();
        String project = id(createAndRun());
        var original = list(report(project), "workflows").getFirst();
        String predecessor = id(original);
        var added =
                post(
                        "/projects/" + project + "/workflows",
                        Map.of(
                                "expectedReportVersion",
                                1,
                                "name",
                                "E",
                                "description",
                                "Extra",
                                "dependsOnWorkflowIds",
                                List.of(predecessor),
                                "assignmentStatus",
                                "UNKNOWN"),
                        201);
        String workflow = id(map(added, "workflow"));
        assertThat(map(added, "workflow")).containsEntry("assignmentSource", "USER");
        error(
                patch(
                        workflow,
                        Map.of(
                                "expectedReportVersion",
                                2,
                                "dependsOnWorkflowIds",
                                List.of(predecessor, predecessor)),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 2, "assignmentStatus", "ASSIGNED"),
                        400),
                "INVALID_REQUEST");
        error(
                patch(
                        workflow,
                        Map.of(
                                "expectedReportVersion",
                                2,
                                "reportId",
                                UUID.randomUUID().toString()),
                        400),
                "INVALID_REQUEST");
        var cleared =
                patch(
                        workflow,
                        Json.read("{\"expectedReportVersion\":2,\"departmentId\":null}"),
                        200);
        assertThat(map(cleared, "workflow"))
                .containsEntry("assignmentStatus", "UNASSIGNED")
                .containsEntry("assignmentSource", null);
        call("DELETE", "/workflows/" + workflow + "?expectedReportVersion=3", null, null, 200);
        var diffs = list(get("/projects/" + project + "/report-diffs", 200), "items");
        var change = list(diffs.getLast(), "changes").getFirst();
        assertThat(change).containsEntry("operation", "DELETE").containsEntry("after", null);
        assertThat(map(change, "before").get("dependsOnWorkflowIds"))
                .isEqualTo(List.of(predecessor));
    }

    @Test
    void assignmentTransitionsAndInvalidTargetSetsRespectInputContracts() {
        seed();
        String project = id(createAndRun()), another = id(createAndRun());
        String workflow = id(list(report(project), "workflows").getFirst());
        String foreign = id(list(report(another), "workflows").getFirst());
        String department = (String) list(memory, "departments").getFirst().get("id");
        patch(workflow, Map.of("expectedReportVersion", 1, "departmentId", department), 200);
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 2, "assignmentStatus", "ASSIGNED"),
                        400),
                "INVALID_REQUEST");
        var unknown =
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 2, "assignmentStatus", "UNKNOWN"),
                        200);
        assertThat(map(unknown, "workflow"))
                .containsEntry("departmentId", null)
                .containsEntry("assignmentStatus", "UNKNOWN")
                .containsEntry("assignmentSource", "USER");
        error(
                patch(
                        workflow,
                        Map.of(
                                "expectedReportVersion",
                                3,
                                "dependsOnWorkflowIds",
                                List.of(foreign)),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        error(
                patch(
                        workflow,
                        Map.of(
                                "expectedReportVersion",
                                3,
                                "dependsOnWorkflowIds",
                                List.of(UUID.randomUUID().toString())),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        error(
                patch(workflow, Map.of("expectedReportVersion", 3.5, "name", "invalid"), 400),
                "INVALID_REQUEST");
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 3, "name", "A", "reason", " "),
                        400),
                "INVALID_REQUEST");
        var analysis =
                post(
                        "/projects/" + project + "/analyses",
                        Map.of("type", "UNASSIGNED_ANALYZE", "expectedReportVersion", 3),
                        202);
        var before = report(project);
        ai.classifyTransform =
                result -> {
                    var assignments = list(result, "assignments");
                    assignments.getFirst().remove("departmentId");
                    return result;
                };
        worker.runOnce();
        assertThat(map(get("/jobs/" + id(map(analysis, "job")), 200), "error"))
                .containsEntry("code", "AI_INVALID_OUTPUT");
        assertThat(report(project)).isEqualTo(before);
    }

    @Test
    void expiredLastAttemptIsRecoveredWithoutResettingBudget() {
        seed();
        var created = post("/projects", projectBody(), 202);
        String job = id(map(created, "job"));
        UUID token = UUID.randomUUID();
        jdbc.update(
                "UPDATE jobs SET"
                    + " status='RUNNING',attempts=3,execution_token=?,lease_until=?,started_at=?"
                    + " WHERE id=?",
                token,
                java.sql.Timestamp.from(clock.instant().minusSeconds(1)),
                java.sql.Timestamp.from(clock.instant().minusSeconds(160)),
                UUID.fromString(job));
        jdbc.update(
                "INSERT INTO"
                    + " job_attempts(id,job_id,batch,attempt,execution_token,global_memory_version,started_at)"
                    + " VALUES(?,?,1,3,?,1,?)",
                UUID.randomUUID(),
                UUID.fromString(job),
                token,
                java.sql.Timestamp.from(clock.instant().minusSeconds(160)));
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200))
                .containsEntry("status", "FAILED")
                .containsEntry("attempts", 3);
        assertThat(map(get("/jobs/" + job, 200), "error"))
                .containsEntry("code", "WORKER_INTERRUPTED");
        assertThat(
                        jdbc.queryForObject(
                                "SELECT count(*) FROM job_attempts WHERE job_id=? AND finished_at"
                                        + " IS NOT NULL",
                                Integer.class,
                                UUID.fromString(job)))
                .isEqualTo(1);
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200)).containsEntry("attempts", 3);
    }

    @Test
    void staleWorkerCannotCommitAfterExecutionTokenChanges() throws Exception {
        seed();
        var created = post("/projects", projectBody(), 202);
        String job = id(map(created, "job")), project = id(map(created, "project"));
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        ai.classifyTransform =
                result -> {
                    entered.countDown();
                    try {
                        if (!release.await(10, TimeUnit.SECONDS))
                            throw new AssertionError("release timed out");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(e);
                    }
                    return result;
                };
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var run = pool.submit(worker::runOnce);
            try {
                assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
                jdbc.update(
                        "UPDATE jobs SET execution_token=? WHERE id=?",
                        UUID.randomUUID(),
                        UUID.fromString(job));
            } finally {
                release.countDown();
            }
            run.get(10, TimeUnit.SECONDS);
        }
        assertThat(report(project).get("version")).isEqualTo(0);
        assertThat(list(report(project), "workflows")).isEmpty();
        assertThat(get("/jobs/" + job, 200)).containsEntry("status", "RUNNING");
    }

    @Test
    void expiredLeaseCannotApplyEvenBeforeAnotherWorkerClaimsIt() throws Exception {
        seed();
        var created = post("/projects", projectBody(), 202);
        String job = id(map(created, "job")), project = id(map(created, "project"));
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        ai.classifyTransform =
                result -> {
                    entered.countDown();
                    try {
                        if (!release.await(10, TimeUnit.SECONDS))
                            throw new AssertionError("release timed out");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(e);
                    }
                    return result;
                };
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var run = pool.submit(worker::runOnce);
            try {
                assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
                clock.advance(151);
            } finally {
                release.countDown();
            }
            run.get(10, TimeUnit.SECONDS);
        }
        assertThat(report(project).get("version")).isEqualTo(0);
        assertThat(list(report(project), "workflows")).isEmpty();
        assertThat(get("/jobs/" + job, 200).get("status")).isNotEqualTo("SUCCEEDED");
    }

    @Test
    void waitingFeedbackYieldsAndRetryUsesLatestMemoryWithoutLosingHistory() {
        seed();
        String first = id(createAndRun());
        clock.advance(1);
        String second = id(createAndRun());
        String job1 =
                id(
                        map(
                                post(
                                        "/projects/" + first + "/close",
                                        Map.of("expectedReportVersion", 1),
                                        202),
                                "feedbackJob"));
        clock.advance(1);
        String job2 =
                id(
                        map(
                                post(
                                        "/projects/" + second + "/close",
                                        Map.of("expectedReportVersion", 1),
                                        202),
                                "feedbackJob"));
        ai.failure = new AiFailure("AI_RATE_LIMITED", "limited", true, Duration.ofSeconds(60));
        worker.runOnce();
        assertThat(get("/jobs/" + job1, 200)).containsEntry("status", "RETRY_WAIT");
        ai.failure = null;
        worker.runOnce();
        assertThat(get("/jobs/" + job2, 200)).containsEntry("status", "SUCCEEDED");
        assertThat(get("/global-memory", 200))
                .containsEntry("version", 2)
                .containsEntry("sourceProjectId", second);
        var previousDescriptions =
                list(get("/global-memory", 200), "departments").stream()
                        .map(d -> d.get("description"))
                        .toList();
        clock.advance(61);
        worker.runOnce();
        assertThat(
                        list(map(ai.lastFeedback, "globalMemory"), "departments").stream()
                                .map(d -> d.get("description")))
                .containsExactlyElementsOf(previousDescriptions);
        assertThat(
                        list(get("/global-memory", 200), "departments").stream()
                                .map(d -> (String) d.get("description")))
                .allMatch(d -> d.endsWith(" Improved. Improved."));
        assertThat(get("/jobs/" + job1, 200))
                .containsEntry("status", "SUCCEEDED")
                .containsEntry("globalMemoryVersion", 2);
        assertThat(get("/global-memory", 200))
                .containsEntry("version", 3)
                .containsEntry("sourceProjectId", first);
        assertThat(
                        jdbc.queryForList(
                                "SELECT global_memory_version FROM job_attempts WHERE job_id=?"
                                        + " ORDER BY attempt",
                                Integer.class,
                                UUID.fromString(job1)))
                .containsExactly(1, 2);
        assertThat(get("/global-memory?version=1", 200).get("departments"))
                .isEqualTo(memory.get("departments"));
    }

    @Test
    void invalidClassificationDepartmentIsRejectedAsAnAtomicBatch() {
        seed();
        String project = id(createAndRun());
        var analysis =
                post(
                        "/projects/" + project + "/analyses",
                        Map.of("type", "ALL_REANALYZE", "expectedReportVersion", 1, "reason", "驗證"),
                        202);
        ai.department = UUID.randomUUID().toString();
        worker.runOnce();
        var job = get("/jobs/" + id(map(analysis, "job")), 200);
        assertThat(job).containsEntry("status", "RETRY_WAIT");
        assertThat(map(job, "error")).containsEntry("code", "AI_INVALID_OUTPUT");
        assertThat(report(project).get("version")).isEqualTo(2);
        list(report(project), "workflows")
                .forEach(w -> assertThat(w).containsEntry("assignmentStatus", "UNASSIGNED"));
        assertThat(list(get("/projects/" + project + "/report-diffs", 200), "items")).hasSize(2);
    }

    @Test
    void malformedBodiesAndBoundariesReturnContractErrorsAndSwaggerIsComplete() throws Exception {
        error(get("/projects?limit=0", 400), "INVALID_REQUEST");
        error(get("/projects/not-a-uuid", 400), "INVALID_REQUEST");
        error(get("/projects/1-1-1-1-1", 400), "INVALID_REQUEST");
        var malformed =
                http.send(
                        HttpRequest.newBuilder(URI.create(url("/projects")))
                                .header("Content-Type", "application/json")
                                .header("Idempotency-Key", UUID.randomUUID().toString())
                                .POST(HttpRequest.BodyPublishers.ofString("{"))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertThat(malformed.statusCode()).isEqualTo(400);
        seed();
        error(
                post("/projects", Map.of("name", " ", "userDoc", Map.of("content", "x")), 400),
                "INVALID_REQUEST");
        assertThat(
                        post(
                                "/projects",
                                Map.of("name", "😀".repeat(200), "userDoc", Map.of("content", "x")),
                                202))
                .containsKey("project");
        var oversized =
                http.send(
                        HttpRequest.newBuilder(URI.create(url("/projects")))
                                .header("Content-Type", "application/json")
                                .POST(
                                        HttpRequest.BodyPublishers.ofString(
                                                " ".repeat(10 * 1024 * 1024 + 1)))
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertThat(oversized.statusCode()).isEqualTo(413);
        var openapi =
                http.send(
                        HttpRequest.newBuilder(
                                        URI.create("http://localhost:" + port + "/openapi.json"))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());
        assertThat(openapi.statusCode()).isEqualTo(200);
        var paths = map(Json.read(openapi.body()), "paths");
        assertThat(paths.values().stream().mapToInt(v -> ((Map<?, ?>) v).size()).sum())
                .isEqualTo(14);
        paths.keySet()
                .forEach(
                        path ->
                                assertThat(path.substring(1).split("/").length)
                                        .isLessThanOrEqualTo(3));
    }

    @Test
    void strictBodiesUnicodeDependenciesAndClosedValidation() {
        var extraMemory = Json.copy(memory);
        list(extraMemory, "departments").getFirst().put("extra", true);
        error(post("/global-memory", extraMemory, 400), "INVALID_REQUEST");
        seed();
        error(
                post(
                        "/projects",
                        Map.of("name", "Refund", "userDoc", Map.of("content", "x", "extra", 1)),
                        400),
                "INVALID_REQUEST");
        error(
                post(
                        "/projects",
                        Map.of("name", "\u3000\u00a0", "userDoc", Map.of("content", "x")),
                        400),
                "INVALID_REQUEST");
        String project = id(createAndRun());
        String workflow = id(list(report(project), "workflows").getFirst());
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 1, "name", "x", "extra", true),
                        400),
                "INVALID_REQUEST");
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 1, "dependsOnWorkflowIds", List.of("bad")),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        error(
                call(
                        "DELETE",
                        "/workflows/" + workflow + "?expectedReportVersion=-1",
                        null,
                        null,
                        400),
                "INVALID_REQUEST");
        error(
                call(
                        "DELETE",
                        "/workflows/" + workflow + "?expectedReportVersion=1&reason=%E3%80%80",
                        null,
                        null,
                        400),
                "INVALID_REQUEST");
        String job =
                id(
                        map(
                                post(
                                        "/projects/" + project + "/close",
                                        Map.of("expectedReportVersion", 1),
                                        202),
                                "feedbackJob"));
        error(post("/projects/" + project + "/close", Map.of(), 400), "INVALID_REQUEST");
        error(
                post(
                        "/projects/" + project + "/close",
                        Map.of("expectedReportVersion", 1, "reason", ""),
                        400),
                "INVALID_REQUEST");
        error(post("/jobs/" + job + "/retry", Map.of("extra", true), 400), "INVALID_REQUEST");
    }

    @Test
    void publicJobsUseExactSchemaAndClassifiedIdsBecomeReportIds() {
        seed();
        var created = post("/projects", projectBody(), 202);
        assertThat(map(created, "job").keySet())
                .containsExactlyInAnyOrder(
                        "id",
                        "projectId",
                        "type",
                        "status",
                        "attempts",
                        "maxAttempts",
                        "nextRetryAt",
                        "globalMemoryVersion",
                        "inputReportVersion",
                        "error",
                        "createdAt",
                        "startedAt",
                        "finishedAt",
                        "result");
        worker.runOnce();
        assertThat(
                        list(report(id(map(created, "project"))), "workflows").stream()
                                .map(w -> w.get("id")))
                .containsExactlyInAnyOrderElementsOf(
                        list(ai.lastClassify, "workflows").stream().map(w -> w.get("id")).toList());
    }

    @Test
    void immutableHistoryRejectsUpdatesAndDeletes() {
        seed();
        createAndRun();
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "INSERT INTO report_diffs SELECT"
                                            + " gen_random_uuid(),project_id,report_id,event_type,phase,source,actor_id,reason,job_id,global_memory_version,from_version,to_version,changes,created_at"
                                            + " FROM report_diffs LIMIT 1"))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        String otherProject = id(createAndRun());
        assertThatThrownBy(
                        () ->
                                jdbc.update(
                                        "INSERT INTO report_diffs SELECT"
                                            + " gen_random_uuid(),?,report_id,event_type,phase,source,actor_id,reason,null,global_memory_version,10,11,changes,created_at"
                                            + " FROM report_diffs WHERE project_id<>? LIMIT 1",
                                        UUID.fromString(otherProject),
                                        UUID.fromString(otherProject)))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        for (String table : List.of("global_memory", "report_diffs", "idempotency_records")) {
            String column =
                    table.equals("global_memory")
                            ? "version"
                            : table.equals("report_diffs") ? "to_version" : "status";
            assertThatThrownBy(
                            () -> jdbc.update("UPDATE " + table + " SET " + column + "=" + column))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThatThrownBy(() -> jdbc.update("DELETE FROM " + table))
                    .isInstanceOf(org.springframework.dao.DataAccessException.class);
        }
    }

    @Test
    void providerBackoffNeverShortensMandatoryDelay() {
        seed();
        String job = id(map(post("/projects", projectBody(), 202), "job"));
        ai.failure = new AiFailure("AI_RATE_LIMITED", "limited", true, Duration.ofSeconds(1));
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200).get("nextRetryAt"))
                .isEqualTo(clock.instant().plusSeconds(5).toString());
        clock.advance(5);
        worker.runOnce();
        assertThat(get("/jobs/" + job, 200).get("nextRetryAt"))
                .isEqualTo(clock.instant().plusSeconds(30).toString());
        ai.failure = new AiFailure("AI_RATE_LIMITED", "limited", true, Duration.ofSeconds(90));
        String other = id(map(post("/projects", projectBody(), 202), "job"));
        worker.runOnce();
        assertThat(get("/jobs/" + other, 200).get("nextRetryAt"))
                .isEqualTo(clock.instant().plusSeconds(90).toString());
    }

    @Test
    void concurrentMemoryInitializationHasOneConflictAndNoFailedKeyRecord() throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var tasks = new ArrayList<Future<Integer>>();
            for (int i = 0; i < 2; i++)
                tasks.add(
                        pool.submit(
                                () -> {
                                    gate.await();
                                    return raw(
                                                    "POST",
                                                    "/global-memory",
                                                    memory,
                                                    UUID.randomUUID().toString())
                                            .statusCode();
                                }));
            gate.countDown();
            assertThat(
                            List.of(
                                    tasks.get(0).get(10, TimeUnit.SECONDS),
                                    tasks.get(1).get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM global_memory", Integer.class))
                    .isEqualTo(1);
            assertThat(
                            jdbc.queryForObject(
                                    "SELECT count(*) FROM idempotency_records", Integer.class))
                    .isEqualTo(1);
        }
    }

    @Test
    void simultaneousClaimersRunOnlyOneFeedbackAndRetriesCannotResetIt() throws Exception {
        seed();
        String first = id(createAndRun());
        String second = id(createAndRun());
        post("/projects/" + first + "/close", Map.of("expectedReportVersion", 1), 202);
        post("/projects/" + second + "/close", Map.of("expectedReportVersion", 1), 202);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var a =
                    pool.submit(
                            () -> {
                                gate.await();
                                return claim();
                            });
            var b =
                    pool.submit(
                            () -> {
                                gate.await();
                                return claim();
                            });
            gate.countDown();
            var claims = Arrays.asList(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
            assertThat(claims.stream().filter(Objects::nonNull).count()).isEqualTo(1);
            var running = claims.stream().filter(Objects::nonNull).findFirst().orElseThrow();
            UUID job = (UUID) running.get("id");
            assertThatThrownBy(
                            () ->
                                    jdbc.update(
                                            "UPDATE jobs SET status='RUNNING' WHERE type='FEEDBACK'"
                                                + " AND id<>?",
                                            job))
                    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            invokeCore(
                    "fail",
                    new Class<?>[] {
                        UUID.class,
                        UUID.class,
                        String.class,
                        String.class,
                        boolean.class,
                        Duration.class
                    },
                    job,
                    running.get("executionToken"),
                    "AI_AUTH_ERROR",
                    "failed",
                    false,
                    Duration.ZERO);
            // Eliminate the other queued feedback so any claimed work below is the retried job.
            jdbc.update("UPDATE jobs SET status='FAILED' WHERE type='FEEDBACK' AND id<>?", job);
            var readFailed = new CountDownLatch(1);
            var resumeRetry = new CountDownLatch(1);
            var retryArmed = new java.util.concurrent.atomic.AtomicBoolean(true);
            org.mockito.Mockito.doAnswer(
                            invocation -> {
                                Object rows = invocation.callRealMethod();
                                if (retryArmed.compareAndSet(true, false)) {
                                    readFailed.countDown();
                                    assertThat(resumeRetry.await(10, TimeUnit.SECONDS)).isTrue();
                                }
                                return rows;
                            })
                    .when(jdbc)
                    .queryForList(
                            org.mockito.ArgumentMatchers.eq(
                                    "select * from jobs where id=? for update"),
                            org.mockito.ArgumentMatchers.any(Object[].class));
            try {
                var retryA =
                        pool.submit(
                                () ->
                                        raw(
                                                        "POST",
                                                        "/jobs/" + job + "/retry",
                                                        Map.of(),
                                                        UUID.randomUUID().toString())
                                                .statusCode());
                assertThat(readFailed.await(10, TimeUnit.SECONDS)).isTrue();
                var retryB =
                        pool.submit(
                                () ->
                                        raw(
                                                        "POST",
                                                        "/jobs/" + job + "/retry",
                                                        Map.of(),
                                                        UUID.randomUUID().toString())
                                                .statusCode());
                awaitProjectLockWait();
                resumeRetry.countDown();
                assertThat(
                                List.of(
                                        retryA.get(10, TimeUnit.SECONDS),
                                        retryB.get(10, TimeUnit.SECONDS)))
                        .containsExactlyInAnyOrder(202, 409);
            } finally {
                resumeRetry.countDown();
            }
            Map<String, Object> retried = claim();
            assertThat(retried).containsEntry("id", job).containsEntry("attempts", 1);
            error(post("/jobs/" + job + "/retry", Map.of(), 409), "JOB_NOT_RETRYABLE");
            assertThat(jdbc.queryForObject("SELECT batch FROM jobs WHERE id=?", Integer.class, job))
                    .isEqualTo(2);
        }
    }

    @Test
    void feedbackVersionConflictKeepsActualAttemptInputAndNoMemoryWrite() {
        seed();
        String project = id(createAndRun());
        post("/projects/" + project + "/close", Map.of("expectedReportVersion", 1), 202);
        Map<String, Object> job = claim();
        jdbc.update(
                "INSERT INTO global_memory SELECT"
                    + " 2,departments,relationships_description,'INITIAL',null,created_at FROM"
                    + " global_memory WHERE version=1");
        assertThatThrownBy(
                        () ->
                                invokeCore(
                                        "applyFeedback",
                                        new Class<?>[] {UUID.class, UUID.class, List.class},
                                        job.get("id"),
                                        job.get("executionToken"),
                                        list(memory, "departments")))
                .isInstanceOf(com.seax.backend.core.ApiException.class)
                .hasMessageContaining("組織記憶");
        assertThat(jdbc.queryForObject("SELECT max(version) FROM global_memory", Integer.class))
                .isEqualTo(2);
        assertThat(
                        jdbc.queryForObject(
                                "SELECT global_memory_version FROM job_attempts WHERE job_id=?",
                                Integer.class,
                                job.get("id")))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM feedback_records", Integer.class))
                .isZero();
    }

    @Test
    void analysisReasonsAndCloseJobLinkSurviveInFeedbackHistoryOnly() {
        seed();
        String project = id(createAndRun());
        var analysis =
                post(
                        "/projects/" + project + "/analyses",
                        Map.of(
                                "expectedReportVersion",
                                1,
                                "type",
                                "UNASSIGNED_ANALYZE",
                                "reason",
                                "Keep this rationale"),
                        202);
        worker.runOnce();
        assertThat(ai.lastClassify).doesNotContainKey("reason");
        var diffs = list(get("/projects/" + project + "/report-diffs", 200), "items");
        assertThat(diffs.getLast())
                .containsEntry("reason", "Keep this rationale")
                .containsEntry("jobId", id(map(analysis, "job")));
        var close =
                post("/projects/" + project + "/close", Map.of("expectedReportVersion", 2), 202);
        worker.runOnce();
        var history = list(ai.lastFeedback, "reportDiffs");
        assertThat(history.getLast()).containsEntry("jobId", id(map(close, "feedbackJob")));
        assertThat(history.stream().anyMatch(d -> "Keep this rationale".equals(d.get("reason"))))
                .isTrue();
    }

    @Test
    void reportReadKeepsOneSnapshotAcrossConcurrentWriterCommit() throws Exception {
        seed();
        String project = id(createAndRun());
        String workflow = id(list(report(project), "workflows").getFirst());
        var readVersion = new CountDownLatch(1);
        var resumeRead = new CountDownLatch(1);
        var armed = new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(
                        invocation -> {
                            Object rows = invocation.callRealMethod();
                            if (armed.compareAndSet(true, false)) {
                                readVersion.countDown();
                                assertThat(resumeRead.await(10, TimeUnit.SECONDS)).isTrue();
                            }
                            return rows;
                        })
                .when(jdbc)
                .queryForList(
                        org.mockito.ArgumentMatchers.eq("select * from reports where project_id=?"),
                        org.mockito.ArgumentMatchers.any(Object[].class));
        try (var pool = Executors.newSingleThreadExecutor()) {
            var reading = pool.submit(() -> report(project));
            assertThat(readVersion.await(10, TimeUnit.SECONDS)).isTrue();
            patch(workflow, Map.of("expectedReportVersion", 1, "name", "Changed after read"), 200);
            resumeRead.countDown();
            var snapshot = reading.get(10, TimeUnit.SECONDS);
            assertThat(snapshot).containsEntry("version", 1);
            assertThat(list(snapshot, "workflows").stream().map(w -> w.get("name")))
                    .doesNotContain("Changed after read");
            assertThat(report(project)).containsEntry("version", 2);
        } finally {
            resumeRead.countDown();
        }
    }

    @Test
    void applicationWaitingForProjectLockCannotCommitExpiredLease() throws Exception {
        seed();
        var created = post("/projects", projectBody(), 202);
        UUID project = UUID.fromString(id(map(created, "project")));
        var classified = new CountDownLatch(1);
        var allowApply = new CountDownLatch(1);
        ai.classifyTransform =
                result -> {
                    classified.countDown();
                    try {
                        assertThat(allowApply.await(10, TimeUnit.SECONDS)).isTrue();
                    } catch (InterruptedException e) {
                        throw new RuntimeException(e);
                    }
                    return result;
                };
        try (var pool = Executors.newSingleThreadExecutor()) {
            var running = pool.submit(worker::runOnce);
            assertThat(classified.await(10, TimeUnit.SECONDS)).isTrue();
            try (var connection = testConnection()) {
                connection.setAutoCommit(false);
                try (var lock =
                        connection.prepareStatement(
                                "SELECT id FROM projects WHERE id=? FOR UPDATE")) {
                    lock.setObject(1, project);
                    lock.executeQuery();
                }
                allowApply.countDown();
                awaitProjectLockWait();
                clock.advance(151);
                connection.commit();
            }
            running.get(10, TimeUnit.SECONDS);
            assertThat(report(project.toString())).containsEntry("version", 0);
            assertThat(list(report(project.toString()), "workflows")).isEmpty();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM report_diffs", Integer.class))
                    .isZero();
        } finally {
            allowApply.countDown();
        }
    }

    @Test
    void lateDeadlineRollsBackAlreadyWrittenWorkflowsAndDiffs() {
        seed();
        var created = post("/projects", projectBody(), 202);
        var armed = new java.util.concurrent.atomic.AtomicBoolean(true);
        org.mockito.Mockito.doAnswer(
                        invocation -> {
                            Object count = invocation.callRealMethod();
                            if (armed.compareAndSet(true, false)) clock.advance(121);
                            return count;
                        })
                .when(jdbc)
                .update(
                        org.mockito.ArgumentMatchers.eq(
                                "insert into workflows values(?,?,?,?,?,?,?,?,?)"),
                        org.mockito.ArgumentMatchers.any(Object[].class));
        worker.runOnce();
        String project = id(map(created, "project"));
        assertThat(report(project)).containsEntry("version", 0);
        assertThat(list(report(project), "workflows")).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM report_diffs", Integer.class))
                .isZero();
        assertThat(get("/jobs/" + id(map(created, "job")), 200))
                .containsEntry("status", "RETRY_WAIT");
    }

    @Test
    void patchRereadsBeforeSnapshotAfterWaitingForProjectLock() throws Exception {
        seed();
        String project = id(createAndRun());
        var original = list(report(project), "workflows").getFirst();
        String workflow = id(original);
        try (var pool = Executors.newSingleThreadExecutor();
                var connection = testConnection()) {
            connection.setAutoCommit(false);
            try (var lock =
                    connection.prepareStatement("SELECT id FROM projects WHERE id=? FOR UPDATE")) {
                lock.setObject(1, UUID.fromString(project));
                lock.executeQuery();
            }
            var pending =
                    pool.submit(
                            () ->
                                    patch(
                                            workflow,
                                            Map.of(
                                                    "expectedReportVersion",
                                                    2,
                                                    "description",
                                                    "My new description"),
                                            200));
            awaitProjectLockWait();
            // Commit a concurrent writer's name update while the PATCH waits for ownership.
            try (var update =
                    connection.prepareStatement(
                            "UPDATE workflows SET name='Concurrent name' WHERE id=?")) {
                update.setObject(1, UUID.fromString(workflow));
                update.executeUpdate();
            }
            try (var update =
                    connection.prepareStatement(
                            "UPDATE reports SET version=2 WHERE project_id=?")) {
                update.setObject(1, UUID.fromString(project));
                update.executeUpdate();
            }
            connection.commit();
            var edited = pending.get(10, TimeUnit.SECONDS);
            assertThat(map(edited, "workflow")).containsEntry("name", "Concurrent name");
            var diff = list(get("/projects/" + project + "/report-diffs", 200), "items").getLast();
            var change = list(diff, "changes").getFirst();
            assertThat(map(change, "before")).containsEntry("name", "Concurrent name");
            assertThat((List<String>) change.get("changedFields")).doesNotContain("name");
        }
    }

    @Test
    void unknownFieldsAreRejectedAtEveryRequestBoundary() {
        var badMemory = Json.copy(memory);
        badMemory.put("extra", true);
        error(post("/global-memory", badMemory, 400), "INVALID_REQUEST");
        seed();
        var badProject = new LinkedHashMap<>(projectBody());
        badProject.put("extra", true);
        error(post("/projects", badProject, 400), "INVALID_REQUEST");
        String project = id(createAndRun());
        error(
                post(
                        "/projects/" + project + "/workflows",
                        Map.of(
                                "name",
                                "x",
                                "description",
                                "x",
                                "expectedReportVersion",
                                1,
                                "extra",
                                true),
                        400),
                "INVALID_REQUEST");
        error(
                post(
                        "/projects/" + project + "/analyses",
                        Map.of(
                                "type",
                                "UNASSIGNED_ANALYZE",
                                "expectedReportVersion",
                                1,
                                "extra",
                                true),
                        400),
                "INVALID_REQUEST");
        error(
                post(
                        "/projects/" + project + "/close",
                        Map.of("expectedReportVersion", 1, "extra", true),
                        400),
                "INVALID_REQUEST");
        String workflow = id(list(report(project), "workflows").getFirst());
        var nullDependency = new ArrayList<>();
        nullDependency.add(null);
        error(
                patch(
                        workflow,
                        Map.of("expectedReportVersion", 1, "dependsOnWorkflowIds", nullDependency),
                        400),
                "INVALID_WORKFLOW_DEPENDENCY");
        error(
                patch(
                        UUID.randomUUID().toString(),
                        Map.of("expectedReportVersion", 1, "name", "missing"),
                        404),
                "RESOURCE_NOT_FOUND");
        post("/projects/" + project + "/close", Map.of("expectedReportVersion", 1), 202);
        var job = claim();
        var badOutput = Json.copy(memory);
        list(badOutput, "departments").getFirst().put("extra", true);
        assertThatThrownBy(
                        () ->
                                invokeCore(
                                        "applyFeedback",
                                        new Class<?>[] {UUID.class, UUID.class, List.class},
                                        job.get("id"),
                                        job.get("executionToken"),
                                        list(badOutput, "departments")))
                .isInstanceOf(com.seax.backend.core.ApiException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM global_memory", Integer.class))
                .isEqualTo(1);
    }

    java.sql.Connection testConnection() throws Exception {
        return DriverManager.getConnection(
                DB_URL + (DB_URL.contains("?") ? "&" : "?") + "currentSchema=" + SCHEMA,
                DB_USER,
                DB_PASSWORD);
    }

    void awaitProjectLockWait() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (jdbc.queryForObject(
                            "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()"
                                + " AND wait_event_type='Lock' AND query LIKE 'select * from"
                                + " projects where id=%'",
                            Integer.class)
                    > 0) return;
            Thread.sleep(10);
        }
        fail("worker did not wait for project lock");
    }

    @SuppressWarnings("unchecked")
    Map<String, Object> claim() {
        return (Map<String, Object>) invokeCore("claimOne", new Class<?>[0]);
    }

    Object invokeCore(String name, Class<?>[] signature, Object... args) {
        try {
            var method = com.seax.backend.core.CoreService.class.getDeclaredMethod(name, signature);
            method.setAccessible(true);
            return method.invoke(core, args);
        } catch (java.lang.reflect.InvocationTargetException e) {
            if (e.getCause() instanceof RuntimeException runtime) throw runtime;
            throw new RuntimeException(e.getCause());
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    void seed() {
        post("/global-memory", memory, 201);
    }

    Map<String, Object> createAndRun() {
        var result = post("/projects", projectBody(), 202);
        worker.runOnce();
        var job = get("/jobs/" + id(map(result, "job")), 200);
        assertThat(job)
                .withFailMessage("Initial analysis failed: %s", job)
                .containsEntry("status", "SUCCEEDED");
        return map(result, "project");
    }

    Map<String, Object> projectBody() {
        return Map.of("name", "Refund", "userDoc", Map.of("content", "A then B and C then D"));
    }

    Map<String, Object> report(String project) {
        return get("/projects/" + project + "/report", 200);
    }

    Map<String, Object> patch(String id, Object body, int expected) {
        return call("PATCH", "/workflows/" + id, body, null, expected);
    }

    Map<String, Object> get(String path, int expected) {
        return call("GET", path, null, null, expected);
    }

    Map<String, Object> post(String path, Object body, int expected) {
        return call("POST", path, body, UUID.randomUUID().toString(), expected);
    }

    Map<String, Object> call(String method, String path, Object body, String key, int expected) {
        var response = raw(method, path, body, key);
        assertThat(response.statusCode())
                .withFailMessage(
                        "%s %s expected %s, got %s: %s",
                        method, path, expected, response.statusCode(), response.body())
                .isEqualTo(expected);
        return Json.read(response.body());
    }

    HttpResponse<String> raw(String method, String path, Object body, String key) {
        var request =
                HttpRequest.newBuilder(URI.create(url(path)))
                        .timeout(Duration.ofSeconds(20))
                        .header("Content-Type", "application/json");
        if (key != null) request.header("Idempotency-Key", key);
        request.method(
                method,
                body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(Json.write(body)));
        try {
            return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    String url(String path) {
        return "http://localhost:" + port + "/api/v1" + path;
    }

    static String id(Map<String, Object> m) {
        return (String) m.get("id");
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> map(Map<String, Object> m, String field) {
        return (Map<String, Object>) m.get(field);
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> list(Map<String, Object> m, String field) {
        return (List<Map<String, Object>>) m.get(field);
    }

    static Map<String, Map<String, Object>> workflowsByName(Map<String, Object> report) {
        return index(report, "name");
    }

    static Map<String, Map<String, Object>> workflowsById(Map<String, Object> report) {
        return index(report, "id");
    }

    static Map<String, Map<String, Object>> index(Map<String, Object> report, String field) {
        var result = new HashMap<String, Map<String, Object>>();
        list(report, "workflows").forEach(w -> result.put((String) w.get(field), w));
        return result;
    }

    static void error(Map<String, Object> body, String code) {
        assertThat(map(body, "error")).containsEntry("code", code).containsKey("details");
    }

    @TestConfiguration
    static class Fakes {
        @Bean
        @Primary
        ScriptedAi scriptedAi() {
            return new ScriptedAi();
        }

        @Bean
        @Primary
        MutableClock mutableClock() {
            return new MutableClock();
        }
    }

    static class MutableClock extends Clock {
        volatile Instant now = Instant.parse("2026-09-12T00:00:00Z");

        void advance(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    static class ScriptedAi implements AiClient {
        volatile AiFailure failure;
        volatile boolean invalidSplit;
        volatile String department;
        Map<String, Object> lastClassify, lastFeedback;
        Function<Map<String, Object>, Map<String, Object>> classifyTransform = Function.identity();

        void reset() {
            failure = null;
            invalidSplit = false;
            department = null;
            lastClassify = null;
            lastFeedback = null;
            classifyTransform = Function.identity();
        }

        @Override
        public Map<String, Object> generate(
                String operation, Map<String, Object> input, Duration timeout) {
            if (failure != null) throw failure;
            return switch (operation) {
                case "split" ->
                        Map.of(
                                "workflows",
                                List.of(
                                        wf("A", invalidSplit ? List.of("D") : List.of()),
                                        wf("B", List.of("A")),
                                        wf("C", List.of("A")),
                                        wf("D", List.of("B", "C"))));
                case "classify" -> {
                    lastClassify = Json.copy(input);
                    yield classifyTransform.apply(
                            Map.of(
                                    "assignments",
                                    list(input, "workflows").stream()
                                            .map(
                                                    w -> {
                                                        var result =
                                                                new LinkedHashMap<String, Object>();
                                                        result.put("workflowId", w.get("id"));
                                                        result.put(
                                                                "assignmentStatus",
                                                                department == null
                                                                        ? "UNKNOWN"
                                                                        : "ASSIGNED");
                                                        result.put("departmentId", department);
                                                        return result;
                                                    })
                                            .toList()));
                }
                case "feedback" -> {
                    lastFeedback = Json.copy(input);
                    yield Map.of(
                            "departments",
                            list(map(input, "globalMemory"), "departments").stream()
                                    .map(
                                            d ->
                                                    Map.of(
                                                            "id",
                                                            d.get("id"),
                                                            "name",
                                                            d.get("name"),
                                                            "description",
                                                            d.get("description") + " Improved."))
                                    .toList());
                }
                default -> throw new IllegalArgumentException(operation);
            };
        }

        Map<String, Object> wf(String key, List<String> deps) {
            return Map.of(
                    "key",
                    key,
                    "name",
                    key,
                    "description",
                    key + " description",
                    "dependsOnKeys",
                    deps);
        }
    }
}
