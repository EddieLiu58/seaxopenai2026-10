package com.seax.backend.core;

import com.seax.backend.ai.AiClient;
import com.seax.backend.Json;
import com.seax.backend.ai.AiFailure;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Short database transactions surround bounded AI calls; execution tokens fence all writes. */
@Component
public final class DurableJobWorker implements AutoCloseable {
    private static final Logger log = LoggerFactory.getLogger(DurableJobWorker.class);
    private final CoreService core;
    private final AiClient ai;
    @Value("${seax.openai.max-input-characters:200000}")
    private int maxInputCharacters=200000;
    private final boolean enabled;
    private final Duration attemptTimeout;
    private final Duration heartbeatInterval;
    private final Semaphore slots = new Semaphore(4);
    private final ExecutorService calls = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService heartbeats =
            Executors.newScheduledThreadPool(
                    4, Thread.ofPlatform().daemon().name("job-heartbeat-", 0).factory());

    @Autowired
    public DurableJobWorker(
            CoreService core, AiClient ai, @Value("${seax.worker.enabled:true}") boolean enabled) {
        this(core, ai, enabled, Duration.ofSeconds(120), Duration.ofSeconds(15));
    }

    // Shorter durations let tests prove deadline and heartbeat behavior without waiting two
    // minutes.
    DurableJobWorker(
            CoreService core,
            AiClient ai,
            boolean enabled,
            Duration attemptTimeout,
            Duration heartbeatInterval) {
        this.core = core;
        this.ai = ai;
        this.enabled = enabled;
        this.attemptTimeout = attemptTimeout;
        this.heartbeatInterval = heartbeatInterval;
    }

    @Scheduled(fixedDelay = 1000)
    public void tick() {
        if (!enabled || !slots.tryAcquire()) return;
        try {
            calls.submit(
                    () -> {
                        try {
                            runOnce();
                        } catch (Exception e) {
                            log.error(
                                    "Background job claim failed ({})",
                                    e.getClass().getSimpleName());
                        } finally {
                            slots.release();
                        }
                    });
        } catch (RejectedExecutionException e) {
            slots.release();
        }
    }

    /** Claims and finishes at most one ready job; available with automatic scheduling disabled. */
    public void runOnce() {
        Map<String, Object> job = core.claimOne();
        if (job == null) return;
        UUID id = uuid(job.get("id")), token = uuid(job.get("executionToken"));
        long deadline = System.nanoTime() + attemptTimeout.toNanos();
        AtomicBoolean leaseLost = new AtomicBoolean();
        Future<?> operation = calls.submit(() -> execute(job, id, token, deadline, leaseLost));
        ScheduledFuture<?> heartbeat =
                heartbeats.scheduleAtFixedRate(
                        () -> {
                            try {
                                if (!core.heartbeat(id, token)) {
                                    leaseLost.set(true);
                                    operation.cancel(true);
                                }
                            } catch (Exception e) {
                                // A transient renewal failure does not grant ownership; apply still
                                // verifies the lease.
                                log.warn(
                                        "Could not renew job {} ({})",
                                        id,
                                        e.getClass().getSimpleName());
                            }
                        },
                        heartbeatInterval.toNanos(),
                        heartbeatInterval.toNanos(),
                        TimeUnit.NANOSECONDS);
        try {
            operation.get(remaining(deadline).toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException e) {
            operation.cancel(true);
            fail(id, token, new AiFailure("AI_TIMEOUT", "AI 分析超過單次嘗試時間上限。", true));
        } catch (InterruptedException e) {
            operation.cancel(true);
            // Keep the durable lease for restart recovery when the process itself is stopping.
            Thread.currentThread().interrupt();
        } catch (CancellationException e) {
            // Ownership was lost. The current owner or expired-lease recovery controls this job
            // now.
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            log.debug("Job {} attempt failed", id, cause);
            if (cause instanceof AiFailure failure) fail(id, token, failure);
            else if (cause instanceof ApiException failure) {
                String code =
                        "MEMORY_VERSION_CONFLICT".equals(failure.code())
                                ? failure.code()
                                : "AI_INVALID_OUTPUT";
                fail(id, token, new AiFailure(code, "AI 結果驗證或組織記憶版本檢查失敗。", true));
            } else {
                log.error("Job {} failed internally ({})", id, cause.getClass().getSimpleName());
                fail(id, token, new AiFailure("INTERNAL_ERROR", "任務執行發生未預期錯誤。", true));
            }
        } catch (AiFailure failure) {
            operation.cancel(true);
            fail(id, token, failure);
        } finally {
            heartbeat.cancel(false);
        }
    }

    private void execute(
            Map<String, Object> job, UUID id, UUID token, long deadline, AtomicBoolean leaseLost) {
        Map<String, Object> input = core.jobInput(id);
        switch ((String) job.get("type")) {
            case "INITIAL_ANALYSIS" -> initial(id, token, input, deadline, leaseLost);
            case "FEEDBACK" -> {
                boolean expanded=CoreService.expanded(input);
                Map<String,Object> request=expanded ? AiInputAssembler.feedback(input) : Map.of(
                        "report",input.get("report"),"reportDiffs",input.get("reportDiffs"),"globalMemory",input.get("globalMemory"));
                var result=generate(expanded ? "feedback_v2" : "feedback",request,deadline);
                ensureCurrent(deadline,leaseLost);
                if(expanded) core.applyExpandedFeedback(id,token,result);
                else {
                    if(!result.keySet().equals(Set.of("departments")))throw invalid();
                    core.applyFeedback(id,token,objects(result.get("departments")));
                }
            }
            default -> {
                boolean expanded=CoreService.expanded(input);
                Map<String,Object> request=expanded ? object(input.get("classificationInput")) : Map.of(
                        "workflows",classifierWorkflows(objects(input.get("workflows"))),"globalMemory",input.get("globalMemory"));
                var result=generate(expanded ? "classify_v2" : "classify",request,deadline);
                var assignments=assignments(result,expanded);
                ensureCurrent(deadline,leaseLost);
                core.applyClassifications(id,token,assignments);
            }
        }
    }

    private void initial(
            UUID id,
            UUID token,
            Map<String, Object> input,
            long deadline,
            AtomicBoolean leaseLost) {
        boolean expanded=CoreService.expanded(input);
        List<Map<String,Object>> workflows;
        if(expanded && input.containsKey("preparedWorkflows")) workflows=objects(input.get("preparedWorkflows"));
        else {
            var split=generate("split",Map.of("content",input.get("content")),deadline);
            if(!split.keySet().equals(Set.of("workflows")))throw invalid();
            workflows=prepareSplit(objects(split.get("workflows")));
            if(expanded) {
                ensureCurrent(deadline,leaseLost);
                input=core.checkpointInitial(id,token,workflows);
                workflows=objects(input.get("preparedWorkflows"));
            }
        }
        Set<String> expectedIds=new HashSet<>();
        workflows.forEach(w->expectedIds.add(w.get("id").toString()));
        Map<String,Object> request=expanded ? object(input.get("classificationInput")) : Map.of(
                "workflows",classifierWorkflows(workflows),"globalMemory",input.get("globalMemory"));
        var result=generate(expanded ? "classify_v2" : "classify",request,deadline);
        var assignments=assignments(result,expanded);
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> assignment : assignments) {
            String workflowId = uuid(assignment.get("workflowId")).toString();
            if (!expectedIds.contains(workflowId) || !seen.add(workflowId)) throw invalid();
            assignment.put("workflowId", workflowId);
        }
        if (seen.size() != workflows.size()) throw invalid();
        ensureCurrent(deadline, leaseLost);
        core.applyInitial(id, token, workflows, assignments);
    }

    private List<Map<String, Object>> prepareSplit(List<Map<String, Object>> supplied) {
        if (supplied.isEmpty() || supplied.size() > 200) throw invalid();
        Map<String, UUID> keys = new HashMap<>();
        List<Map<String, Object>> workflows = new ArrayList<>();
        for (var suppliedWorkflow : supplied) {
            if (!suppliedWorkflow
                    .keySet()
                    .equals(Set.of("key", "name", "description", "dependsOnKeys"))) throw invalid();
            Map<String, Object> workflow = new LinkedHashMap<>(suppliedWorkflow);
            String key = text(workflow.get("key"), 200);
            text(workflow.get("name"), 200);
            text(workflow.get("description"), 10000);
            UUID id = UUID.randomUUID();
            if (keys.putIfAbsent(key, id) != null) throw invalid();
            workflow.put("id", id.toString());
            workflows.add(workflow);
        }
        List<ReportGraph.Node> graph = new ArrayList<>();
        UUID report = new UUID(0, 0);
        for (var workflow : workflows) {
            if (!(workflow.get("dependsOnKeys") instanceof List<?> raw)) throw invalid();
            List<UUID> dependencies = new ArrayList<>();
            for (Object dependency : raw) {
                UUID predecessor = keys.get(text(dependency, 200));
                if (predecessor == null) throw invalid();
                dependencies.add(predecessor);
            }
            graph.add(
                    new ReportGraph.Node(
                            uuid(workflow.get("id")),
                            report,
                            ReportGraph.canonical(dependencies),
                            Instant.EPOCH));
        }
        new ReportGraph(graph).topologicallySorted();
        return workflows;
    }

    private List<Map<String, Object>> classifierWorkflows(List<Map<String, Object>> workflows) {
        return workflows.stream()
                .map(
                        w ->
                                Map.of(
                                        "id",
                                        w.get("id"),
                                        "name",
                                        w.get("name"),
                                        "description",
                                        w.get("description")))
                .toList();
    }

    private List<Map<String, Object>> assignments(Map<String, Object> response, boolean expanded) {
        if (!response.keySet().equals(Set.of("assignments"))) throw invalid();
        List<Map<String, Object>> assignments = objects(response.get("assignments"));
        for (var assignment : assignments) {
            if (!assignment.keySet().equals(expanded ? Set.of("workflowId","assignmentStatus","departmentId",
                    "decisionCode","explanation","candidateDepartmentIds","missingInformation","knowledgeItemIds","evidenceIds")
                    : Set.of("workflowId","assignmentStatus","departmentId","assignmentReason")))
                throw invalid();
            uuid(assignment.get("workflowId"));
            text(assignment.get(expanded ? "explanation" : "assignmentReason"), 2000);
            if ("UNKNOWN".equals(assignment.get("assignmentStatus"))) {
                if (assignment.get("departmentId") != null) throw invalid();
            } else if ("ASSIGNED".equals(assignment.get("assignmentStatus")))
                uuid(assignment.get("departmentId"));
            else throw invalid();
        }
        return assignments;
    }

    private Map<String,Object> generate(String operation,Map<String,Object> input,long deadline) {
        String serialized=Json.write(input);
        if(maxInputCharacters<1 || serialized.codePointCount(0,serialized.length())>maxInputCharacters)
            throw new AiFailure("AI_INPUT_TOO_LARGE","AI 輸入超過設定容量，未截斷資料。",false);
        return ai.generate(operation,input,remaining(deadline));
    }
    @SuppressWarnings("unchecked") private static Map<String,Object> object(Object value) {
        if(!(value instanceof Map<?,?>))throw invalid();return (Map<String,Object>)value;
    }

    private static List<Map<String, Object>> objects(Object value) {
        if (!(value instanceof List<?> list)) throw invalid();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> object)) throw invalid();
            Map<String, Object> copy = new LinkedHashMap<>();
            object.forEach((key, field) -> copy.put(String.valueOf(key), field));
            result.add(copy);
        }
        return result;
    }

    private static UUID uuid(Object value) {
        if (value instanceof UUID id) return id;
        if (!(value instanceof String text)
                || !text.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))
            throw invalid();
        return UUID.fromString(text);
    }

    private static String text(Object value, int max) {
        if (!(value instanceof String s)
                || s.codePoints()
                        .allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c))
                || s.codePointCount(0, s.length()) > max) throw invalid();
        return s;
    }

    private static Duration remaining(long deadline) {
        long nanos = deadline - System.nanoTime();
        if (nanos <= 0) throw new AiFailure("AI_TIMEOUT", "AI 分析超過單次嘗試時間上限。", true);
        return Duration.ofNanos(nanos);
    }

    private static void ensureCurrent(long deadline, AtomicBoolean lost) {
        remaining(deadline);
        if (lost.get() || Thread.currentThread().isInterrupted())
            throw new AiFailure("WORKER_INTERRUPTED", "任務執行權已失效。", true);
    }

    private static AiFailure invalid() {
        return new AiFailure("AI_INVALID_OUTPUT", "AI 輸出格式無效。", true);
    }

    private void fail(UUID id, UUID token, AiFailure failure) {
        core.fail(
                id,
                token,
                failure.code(),
                failure.getMessage(),
                failure.retryable(),
                failure.retryAfter());
    }

    @Override
    @PreDestroy
    public void close() {
        calls.shutdownNow();
        heartbeats.shutdownNow();
    }
}
