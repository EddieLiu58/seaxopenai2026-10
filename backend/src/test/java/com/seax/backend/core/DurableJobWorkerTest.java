package com.seax.backend.core;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.seax.backend.ai.*;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

class DurableJobWorkerTest {
    final CoreService core = mock(CoreService.class);
    final UUID id = UUID.randomUUID(), token = UUID.randomUUID();

    void claim(String type, Map<String, Object> input) {
        when(core.claimOne()).thenReturn(Map.of("id", id, "executionToken", token, "type", type));
        when(core.jobInput(id)).thenReturn(input);
        when(core.heartbeat(id, token)).thenReturn(true);
    }

    @Test
    void malformedSplitNeverReachesClassification() {
        claim("INITIAL_ANALYSIS", Map.of("content", "x", "globalMemory", Map.of()));
        AiClient ai = mock(AiClient.class);
        when(ai.generate(eq("split"), anyMap(), any()))
                .thenReturn(
                        Map.of(
                                "workflows",
                                List.of(
                                        Map.of(
                                                "key",
                                                "A",
                                                "name",
                                                "A",
                                                "description",
                                                "A",
                                                "dependsOnKeys",
                                                List.of("B")),
                                        Map.of(
                                                "key",
                                                "B",
                                                "name",
                                                "B",
                                                "description",
                                                "B",
                                                "dependsOnKeys",
                                                List.of("A")))));
        try (var worker =
                new DurableJobWorker(
                        core, ai, false, Duration.ofSeconds(1), Duration.ofSeconds(1))) {
            worker.runOnce();
        }
        verify(ai, never()).generate(eq("classify"), anyMap(), any());
        verify(core)
                .fail(
                        eq(id),
                        eq(token),
                        eq("AI_INVALID_OUTPUT"),
                        anyString(),
                        eq(true),
                        eq(Duration.ZERO));
    }

    @Test
    void attemptDeadlineCancelsProviderAndFailsOnce() throws Exception {
        claim("UNASSIGNED_ANALYZE", Map.of("workflows", List.of(), "globalMemory", Map.of()));
        var interrupted = new CountDownLatch(1);
        AiClient ai =
                (operation, input, timeout) -> {
                    try {
                        new CountDownLatch(1).await();
                    } catch (InterruptedException e) {
                        interrupted.countDown();
                        Thread.currentThread().interrupt();
                        throw new AiFailure("WORKER_INTERRUPTED", "interrupted", true);
                    }
                    throw new AssertionError();
                };
        try (var worker =
                new DurableJobWorker(
                        core, ai, false, Duration.ofMillis(100), Duration.ofSeconds(1))) {
            worker.runOnce();
        }
        assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
        verify(core)
                .fail(
                        eq(id),
                        eq(token),
                        eq("AI_TIMEOUT"),
                        anyString(),
                        eq(true),
                        eq(Duration.ZERO));
        verify(core, never()).applyClassifications(any(), any(), any());
    }

    @Test
    void heartbeatRunsWhileProviderIsBlocked() {
        claim("UNASSIGNED_ANALYZE", Map.of("workflows", List.of(), "globalMemory", Map.of()));
        var beat = new CountDownLatch(1);
        when(core.heartbeat(id, token))
                .thenAnswer(
                        call -> {
                            beat.countDown();
                            return true;
                        });
        AiClient ai =
                (operation, input, timeout) -> {
                    try {
                        assertThat(beat.await(1, TimeUnit.SECONDS)).isTrue();
                    } catch (InterruptedException e) {
                        throw new RuntimeException(e);
                    }
                    return Map.of("assignments", List.of());
                };
        try (var worker =
                new DurableJobWorker(
                        core, ai, false, Duration.ofSeconds(2), Duration.ofMillis(20))) {
            worker.runOnce();
        }
        verify(core, atLeastOnce()).heartbeat(id, token);
        verify(core).applyClassifications(id, token, List.of());
        verify(core, never()).fail(any(), any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void splitAndClassificationShareOneDecreasingTimeBudget() {
        claim("INITIAL_ANALYSIS", Map.of("content", "x", "globalMemory", Map.of()));
        var splitBudget = new java.util.concurrent.atomic.AtomicReference<Duration>();
        var classifyBudget = new java.util.concurrent.atomic.AtomicReference<Duration>();
        AiClient ai =
                (operation, input, timeout) -> {
                    if (operation.equals("split")) {
                        splitBudget.set(timeout);
                        return Map.of(
                                "workflows",
                                List.of(
                                        Map.of(
                                                "key",
                                                "A",
                                                "name",
                                                "A",
                                                "description",
                                                "A description",
                                                "dependsOnKeys",
                                                List.of())));
                    }
                    classifyBudget.set(timeout);
                    @SuppressWarnings("unchecked")
                    var workflows = (List<Map<String, Object>>) input.get("workflows");
                    assertThat(workflows.getFirst().keySet())
                            .containsExactlyInAnyOrder("id", "name", "description");
                    var assignment = new LinkedHashMap<String, Object>();
                    assignment.put("workflowId", workflows.getFirst().get("id"));
                    assignment.put("assignmentStatus", "UNKNOWN");
                    assignment.put("departmentId", null);
                    return Map.of("assignments", List.of(assignment));
                };
        try (var worker =
                new DurableJobWorker(
                        core, ai, false, Duration.ofSeconds(2), Duration.ofSeconds(1))) {
            worker.runOnce();
        }
        assertThat(classifyBudget.get()).isLessThan(splitBudget.get());
        @SuppressWarnings({"rawtypes", "unchecked"})
        org.mockito.ArgumentCaptor<List<Map<String, Object>>> split =
                org.mockito.ArgumentCaptor.forClass((Class) List.class);
        @SuppressWarnings({"rawtypes", "unchecked"})
        org.mockito.ArgumentCaptor<List<Map<String, Object>>> assignments =
                org.mockito.ArgumentCaptor.forClass((Class) List.class);
        verify(core).applyInitial(eq(id), eq(token), split.capture(), assignments.capture());
        assertThat(assignments.getValue().getFirst())
                .containsEntry("workflowId", split.getValue().getFirst().get("id"))
                .doesNotContainKey("key");
    }

    @Test
    void disablingSchedulingKeepsManualExecutionAvailable() {
        when(core.claimOne()).thenReturn(null);
        try (var worker =
                new DurableJobWorker(
                        core,
                        mock(AiClient.class),
                        false,
                        Duration.ofSeconds(1),
                        Duration.ofSeconds(1))) {
            worker.tick();
            verifyNoInteractions(core);
            worker.runOnce();
            verify(core).claimOne();
        }
    }
}
