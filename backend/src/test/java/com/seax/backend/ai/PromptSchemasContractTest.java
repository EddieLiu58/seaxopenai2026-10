package com.seax.backend.ai;

import java.util.*;

/** Dependency-free contract checks; run with java after compiling this class and PromptSchemas. */
public final class PromptSchemasContractTest {
    public static void main(String[] args) throws Exception {
        Class<?> contract;
        try { contract = Class.forName("com.seax.backend.ai.PromptSchemas"); }
        catch (ClassNotFoundException e) { throw new AssertionError("Version 2 prompt schemas are missing", e); }
        var method = contract.getDeclaredMethod("schema", String.class);
        Map<?, ?> classify = (Map<?, ?>) method.invoke(null, "classify_v2");
        Map<?, ?> feedback = (Map<?, ?>) method.invoke(null, "feedback_v2");
        strictObjects(classify);
        strictObjects(feedback);
        Map<?, ?> assignment = items(property(classify, "assignments"));
        fields(assignment, "workflowId", "assignmentStatus", "departmentId", "decisionCode", "explanation",
                "candidateDepartmentIds", "missingInformation", "knowledgeItemIds", "evidenceIds");
        equal(property(assignment, "assignmentStatus").get("enum"), List.of("ASSIGNED", "UNKNOWN"));
        equal(property(assignment, "departmentId").get("type"), List.of("string", "null"));
        equal(property(assignment, "decisionCode").get("enum"), List.of("MATCHED_RESPONSIBILITY",
                "INSUFFICIENT_WORKFLOW_DETAIL", "CONFLICTING_EVIDENCE", "MULTIPLE_PLAUSIBLE_DEPARTMENTS",
                "NO_RESPONSIBLE_DEPARTMENT", "INSUFFICIENT_ORGANIZATION_KNOWLEDGE"));
        equal(property(assignment, "explanation").get("maxLength"), 2000);
        fields(feedback, "departments", "knowledgeCandidates", "relationshipCandidates", "observations");
        fields(items(property(feedback, "departments")), "id", "name", "description",
                "supportingKnowledgeItemIds", "supportingCandidateKeys");
        Map<?, ?> knowledge = items(property(feedback, "knowledgeCandidates"));
        fields(knowledge, "key", "action", "existingId", "disposition", "rationale", "evidenceRefs",
                "type", "statement", "departmentIds", "scope");
        Map<?, ?> relationship = items(property(feedback, "relationshipCandidates"));
        fields(relationship, "key", "action", "existingId", "disposition", "rationale", "evidenceRefs",
                "type", "fromDepartmentId", "toDepartmentId", "description", "exchangedItems", "scope");
        equal(property(relationship, "type").get("enum"), List.of("UPSTREAM_OF", "COLLABORATES_WITH"));
        equal(property(knowledge, "action").get("enum"), List.of("ADD", "MERGE_EVIDENCE"));
        equal(property(knowledge, "disposition").get("enum"), List.of("PUBLISH", "HOLD", "DISCARD"));
        fields(property(knowledge, "scope"), "level", "projectId", "conditions");
        var refs = (List<?>) items(property(knowledge, "evidenceRefs")).get("anyOf");
        equal(refs.size(), 2);
        fields((Map<?, ?>) refs.get(0), "kind", "evidenceId");
        fields((Map<?, ?>) refs.get(1), "kind", "sourceDocumentId", "sourcePath", "excerpt");
        equal(property((Map<?, ?>) refs.get(0), "kind").get("enum"), List.of("EXISTING"));
        equal(property((Map<?, ?>) refs.get(1), "kind").get("enum"), List.of("DOCUMENT"));
        equal(property(knowledge, "evidenceRefs").get("maxItems"), 50);
        fields(items(property(feedback, "observations")), "workflowIds", "code", "explanation", "evidenceRefs");
        equal(property(feedback, "observations").get("maxItems"), 200);
        System.out.println("PASS: classify_v2 and feedback_v2 strict schema contracts");
    }

    private static Map<?, ?> property(Map<?, ?> schema, String key) {
        Object result = ((Map<?, ?>) schema.get("properties")).get(key);
        if (!(result instanceof Map<?, ?> map)) throw new AssertionError("Missing property " + key);
        return map;
    }
    private static Map<?, ?> items(Map<?, ?> schema) { return (Map<?, ?>) schema.get("items"); }
    private static void fields(Map<?, ?> schema, String... names) {
        equal(((Map<?, ?>) schema.get("properties")).keySet(), Set.of(names));
    }
    private static void equal(Object actual, Object expected) {
        if (!Objects.equals(actual, expected)) throw new AssertionError("Expected " + expected + ", got " + actual);
    }
    private static void strictObjects(Object node) {
        if (node instanceof Map<?, ?> map) {
            if ("object".equals(map.get("type"))) {
                equal(map.get("additionalProperties"), false);
                equal(new HashSet<>((List<?>) map.get("required")), ((Map<?, ?>) map.get("properties")).keySet());
            }
            map.values().forEach(PromptSchemasContractTest::strictObjects);
        } else if (node instanceof List<?> list) list.forEach(PromptSchemasContractTest::strictObjects);
    }
}
