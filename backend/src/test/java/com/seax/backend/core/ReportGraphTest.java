package com.seax.backend.core;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

class ReportGraphTest {
    private static final UUID REPORT = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID A = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID B = UUID.fromString("00000000-0000-0000-0000-000000000020");
    private static final UUID C = UUID.fromString("00000000-0000-0000-0000-000000000030");
    private static final UUID D = UUID.fromString("00000000-0000-0000-0000-000000000040");

    @Test
    void ordersDiamondByDependenciesThenCreatedAtAndId() {
        var graph =
                new ReportGraph(
                        List.of(
                                node(A, List.of(), 1), node(B, List.of(A), 3),
                                node(C, List.of(A), 2), node(D, List.of(B, C), 4)));

        assertEquals(
                List.of(A, C, B, D),
                graph.topologicallySorted().stream().map(ReportGraph.Node::id).toList());
    }

    @Test
    void rejectsAProposedIndirectCycle() {
        var graph = new ReportGraph(List.of(node(A, List.of(), 1), node(B, List.of(A), 2)));

        var failure =
                assertThrows(ApiException.class, () -> graph.validateReplacement(A, List.of(B)));

        assertEquals("WORKFLOW_DEPENDENCY_CYCLE", failure.code());
    }

    @Test
    void rejectsDuplicateAndForeignDependencies() {
        var graph = new ReportGraph(List.of(node(A, List.of(), 1), node(B, List.of(A), 2)));
        assertEquals(
                "INVALID_WORKFLOW_DEPENDENCY",
                assertThrows(ApiException.class, () -> graph.validateReplacement(B, List.of(A, A)))
                        .code());
        assertEquals(
                "INVALID_WORKFLOW_DEPENDENCY",
                assertThrows(
                                ApiException.class,
                                () -> graph.validateReplacement(B, List.of(UUID.randomUUID())))
                        .code());
    }

    @Test
    void dependencyOrderDoesNotCreateAChange() {
        assertTrue(ReportGraph.sameDependencies(List.of(C, A, B), List.of(B, C, A)));
    }

    private ReportGraph.Node node(UUID id, List<UUID> dependsOn, long second) {
        return new ReportGraph.Node(id, REPORT, dependsOn, Instant.ofEpochSecond(second));
    }
}
