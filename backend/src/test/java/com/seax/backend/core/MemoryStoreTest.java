package com.seax.backend.core;

import com.seax.backend.Json;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MemoryStoreTest {
    private final CoreJdbc jdbc = mock(CoreJdbc.class);
    private final MemoryStore store = new MemoryStore(jdbc);

    @Test void legacyVersionsHaveNoInventedProvenance() {
        when(jdbc.queryForList(anyString(), eq(1))).thenReturn(List.of());
        Map<String,Object> full = store.expand(Map.of("version", 1, "departments", List.of()));
        assertThat(full.get("schemaVersion")).isEqualTo(1);
        for (String name : List.of("relationships", "knowledgeItems", "projectExperiences", "evidence"))
            assertThat((List<?>) full.get(name)).isEmpty();
    }

    @Test void filtersBeforePaginationAndCountsAllMatches() {
        String department = UUID.randomUUID().toString();
        List<Map<String,Object>> knowledge = new ArrayList<>();
        for (int n=1; n<=7; n++) knowledge.add(Map.of("id", new UUID(0,n).toString(), "type", "FEATURE",
                "departmentIds", List.of(n % 2 == 0 ? department : UUID.randomUUID().toString())));
        setup(Map.of("schemaVersion", 2, "knowledgeItems", knowledge), List.of());
        Map<String,Object> result = store.collection(2, "knowledgeItems", Map.of("departmentId", department), 1, 1);
        assertThat(result.get("total")).isEqualTo(3);
        assertThat((List<?>)result.get("items")).hasSize(1);
        assertThat(((Map<?,?>)((List<?>)result.get("items")).getFirst()).get("id")).isEqualTo(new UUID(0,4).toString());
    }

    @Test void unknownWorkflowsNeverCountAsDepartmentExperience() {
        String department = UUID.randomUUID().toString();
        setup(Map.of("schemaVersion", 2), List.of(Map.of("projectId", UUID.randomUUID().toString(), "closedAt", "2026-09-12T00:00:00Z",
                "workflows", List.of(Map.of("assignmentStatus", "UNKNOWN", "departmentId", department)))));
        assertThat(store.collection(2, "projectExperiences", Map.of("departmentId", department), 50, 0).get("total")).isEqualTo(0);
    }

    @Test void missingVersionIs404EvenWhenCollectionWouldBeEmpty() {
        when(jdbc.queryForList(anyString(), eq(999))).thenReturn(List.of());
        assertThatThrownBy(() -> store.collection(999, "evidence", Map.of(), 50, 0))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.status().value()).isEqualTo(404));
    }

    @Test void evidenceReferenceFiltersIntersect() {
        String a = UUID.randomUUID().toString(), b = UUID.randomUUID().toString();
        String k = UUID.randomUUID().toString(), r = UUID.randomUUID().toString();
        setup(Map.of("schemaVersion", 2,
                "knowledgeItems", List.of(Map.of("id", k, "evidenceIds", List.of(a,b))),
                "relationships", List.of(Map.of("id", r, "evidenceIds", List.of(b))),
                "evidence", List.of(Map.of("id", a), Map.of("id", b))), List.of());
        assertThat(store.collection(2, "evidence", Map.of("knowledgeItemId", k, "relationshipId", r), 50, 0).get("items"))
                .isEqualTo(List.of(Map.of("id", b)));
        assertThat(store.collection(2, "evidence", Map.of("knowledgeItemId", UUID.randomUUID().toString(), "relationshipId", r), 50, 0).get("total"))
                .isEqualTo(0);
    }

    private void setup(Map<String,Object> payload, List<Map<String,Object>> experiences) {
        when(jdbc.queryForList(anyString(), eq(2))).thenAnswer(call -> {
            String sql = call.getArgument(0);
            if (sql.contains("from global_memory")) return List.of(Map.of("version", 2));
            if (sql.contains("from memory_extensions")) return List.of(Map.of("payload", Json.write(payload)));
            return experiences.stream().map(e -> Map.<String,Object>of("snapshot", Json.write(e))).toList();
        });
    }
}
