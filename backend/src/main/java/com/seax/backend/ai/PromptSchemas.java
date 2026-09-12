package com.seax.backend.ai;

import java.util.*;

/** Versioned provider contracts. Cross-field, identity and evidence checks remain server-side. */
final class PromptSchemas {
    private PromptSchemas() {}

    static String prompt(String operation) {
        return switch (operation) {
            case "classify_v2" -> """
                    For every supplied workflow return exactly one assignment, preserving workflowId.
                    Use ONLY workflow name, description and memoryContext. projectId, if supplied,
                    is solely for scope checks; identifiers are not responsibility clues.
                    Check scope and conditions before using knowledge, relationships or experiences.
                    Capability is not responsibility. Another project's assignment may support context
                    but cannot establish current ownership. Upstream/collaboration is not ownership.
                    ASSIGNED requires a clear workflow, applicable positive responsibility evidence,
                    exactly one justified existing department, and no unresolved same-scope conflict
                    or applicable exclusion. Negative evidence about others alone is insufficient.
                    Otherwise return UNKNOWN, departmentId null, and an actionable missingInformation
                    entry; never guess or return UNASSIGNED. Check in order: unclear workflow =>
                    INSUFFICIENT_WORKFLOW_DETAIL; unresolved contradictory evidence => CONFLICTING_EVIDENCE;
                    multiple applicable departments with no boundary => MULTIPLE_PLAUSIBLE_DEPARTMENTS;
                    explicit sufficient evidence that ALL existing departments exclude the work =>
                    NO_RESPONSIBLE_DEPARTMENT; otherwise INSUFFICIENT_ORGANIZATION_KNOWLEDGE.
                    No retrieval hit is insufficient knowledge, not proof of no responsible department.
                    ASSIGNED uses MATCHED_RESPONSIBILITY, candidateDepartmentIds containing only the
                    selected department, empty missingInformation, and at least one positive evidenceId.
                    MULTIPLE_PLAUSIBLE_DEPARTMENTS needs at least two candidateDepartmentIds.
                    CONFLICTING_EVIDENCE must cite both sides. Other UNKNOWN candidates may be empty.
                    Cite only knowledgeItemIds and evidenceIds actually supplied in memoryContext;
                    explanation is a concise public summary supported by the citations, at most 2000
                    characters. Do not edit workflows or add departments. Output only assignments JSON.
                    """;
            case "feedback_v2" -> """
                    Analyze contractVersion 2 using the frozen CLOSED project, complete finalReport,
                    complete reportDiffs, latest globalMemory and sourceDocuments catalog.
                    Closing means REPORT_APPROVED, not proof that work was actually performed.
                    Return ONLY departments, knowledgeCandidates, relationshipCandidates, observations.
                    Include every original department exactly once with unchanged id and name.
                    Each department contains description, supportingKnowledgeItemIds and
                    supportingCandidateKeys. Preserve its description verbatim unless supported by
                    existing ORGANIZATION knowledge or this response's PUBLISH ORGANIZATION knowledge.
                    Changed summaries cannot introduce conclusions absent from their supporting items;
                    PROJECT, HOLD or DISCARD candidates cannot support an organization summary.
                    Candidate keys are nonblank temporary local keys unique across BOTH candidate arrays,
                    at most 200 characters. Never create formal UUIDs, metadata, versions, timestamps,
                    ProjectExperience or Evidence entities. Only reuse input identifiers where required.
                    ADD has existingId null. MERGE_EVIDENCE references an existing same-kind item and
                    only adds evidence; preserve its type, statement/description, subjects and scope.
                    Do not delete or overwrite existing rules. Unresolved conflicts must be HOLD;
                    unsupported inferences must be DISCARD. PUBLISH requires supporting evidenceRefs.
                    Distinguish FEATURE, RESPONSIBILITY, CAPABILITY, COMMON_RULE and PROJECT_ARRANGEMENT.
                    A project allocation supports PROJECT scope only; even repeated allocations do not
                    establish permanent responsibility. PROJECT_ARRANGEMENT always has PROJECT scope.
                    PROJECT scope uses this project's id; ORGANIZATION uses projectId null and requires
                    explicit general evidence. Preserve all applicable conditions. Nonparticipation does
                    not imply lack of responsibility or capability. UNKNOWN/UNASSIGNED workflows cannot
                    create PUBLISH conclusions of confirmed ownership; preserve uncertainty in observations.
                    Relationships allow only UPSTREAM_OF or COLLABORATES_WITH, existing departments,
                    no self links; sort the department IDs for undirected collaboration. Never REPORTS_TO.
                    Workflow ordering alone cannot establish departmental upstream relationships: sources
                    must support provider, receiver and exchangedItems. Project collaboration stays PROJECT.
                    EvidenceRef is EXACTLY either {kind:EXISTING,evidenceId} referencing globalMemory.evidence,
                    or {kind:DOCUMENT,sourceDocumentId,sourcePath,excerpt} referencing sourceDocuments.
                    Never mix these fields. sourcePath is a JSON Pointer relative to that document's
                    root and resolves to a string; excerpt is a nonempty exact substring of that source.
                    The catalog's payloadPointer locates the document in the input. Existing AI
                    explanations are not new evidence. Verify the quote supports the conclusion's scope,
                    not merely that matching text exists. Do not invent sources or consult UserDoc.
                    Observations contain workflowIds, code, explanation, evidenceRefs, with code one of
                    UNKNOWN_ASSIGNMENT, UNASSIGNED_ASSIGNMENT, UNRESOLVED_CONFLICT, INSUFFICIENT_EVIDENCE,
                    NO_GENERALIZABLE_CHANGE. No generalizable knowledge is a valid outcome: retain
                    descriptions and allow empty candidates, without forcing improvements.
                    Maximum 400 candidates TOTAL, 200 observations, 50 evidenceRefs per item,
                    50 conditions/exchangedItems per item. Required text must not be blank.
                    """;
            default -> throw new IllegalArgumentException("Unknown versioned AI operation");
        };
    }

    static Map<String, Object> schema(String operation) {
        return switch (operation) {
            case "classify_v2" -> object(Map.of("assignments", array(object(Map.of(
                    "workflowId", text(200),
                    "assignmentStatus", choices("ASSIGNED", "UNKNOWN"),
                    "departmentId", nullableString(),
                    "decisionCode", choices("MATCHED_RESPONSIBILITY", "INSUFFICIENT_WORKFLOW_DETAIL",
                            "CONFLICTING_EVIDENCE", "MULTIPLE_PLAUSIBLE_DEPARTMENTS",
                            "NO_RESPONSIBLE_DEPARTMENT", "INSUFFICIENT_ORGANIZATION_KNOWLEDGE"),
                    "explanation", text(2000),
                    "candidateDepartmentIds", array(text(200)),
                    "missingInformation", array(text(2000)),
                    "knowledgeItemIds", array(text(200)),
                    "evidenceIds", array(text(200)))))));
            case "feedback_v2" -> feedback();
            default -> throw new IllegalArgumentException("Unknown versioned AI operation");
        };
    }

    private static Map<String, Object> feedback() {
        var knowledge = candidate(Map.of(
                "type", choices("FEATURE", "RESPONSIBILITY", "CAPABILITY", "COMMON_RULE", "PROJECT_ARRANGEMENT"),
                "statement", text(10000), "departmentIds", array(text(200)), "scope", scope()));
        var relationship = candidate(Map.of(
                "type", choices("UPSTREAM_OF", "COLLABORATES_WITH"),
                "fromDepartmentId", text(200), "toDepartmentId", text(200),
                "description", text(10000), "exchangedItems", array(text(2000), 50), "scope", scope()));
        return object(Map.of(
                "departments", array(object(Map.of(
                        "id", text(200), "name", text(200), "description", text(10000),
                        "supportingKnowledgeItemIds", array(text(200)), "supportingCandidateKeys", array(text(200))))),
                "knowledgeCandidates", array(knowledge, 400),
                "relationshipCandidates", array(relationship, 400),
                "observations", array(object(Map.of(
                        "workflowIds", array(text(200)),
                        "code", choices("UNKNOWN_ASSIGNMENT", "UNASSIGNED_ASSIGNMENT", "UNRESOLVED_CONFLICT",
                                "INSUFFICIENT_EVIDENCE", "NO_GENERALIZABLE_CHANGE"),
                        "explanation", text(2000), "evidenceRefs", evidenceRefs())), 200)));
    }

    private static Map<String, Object> candidate(Map<String, Object> fields) {
        var properties = new LinkedHashMap<String, Object>();
        properties.put("key", text(200));
        properties.put("action", choices("ADD", "MERGE_EVIDENCE"));
        properties.put("existingId", nullableString());
        properties.put("disposition", choices("PUBLISH", "HOLD", "DISCARD"));
        properties.put("rationale", text(2000));
        properties.put("evidenceRefs", evidenceRefs());
        properties.putAll(fields);
        return object(properties);
    }

    private static Map<String, Object> scope() {
        return object(Map.of("level", choices("ORGANIZATION", "PROJECT"),
                "projectId", nullableString(), "conditions", array(text(2000), 50)));
    }

    private static Map<String, Object> evidenceRefs() {
        return array(Map.of("anyOf", List.of(
                object(Map.of("kind", choices("EXISTING"), "evidenceId", text(200))),
                object(Map.of("kind", choices("DOCUMENT"), "sourceDocumentId", text(200),
                        "sourcePath", Map.of("type", "string"), "excerpt", text(2000))))), 50);
    }

    private static Map<String, Object> text(int maxLength) {
        return Map.of("type", "string", "minLength", 1, "maxLength", maxLength);
    }
    private static Map<String, Object> nullableString() {
        return Map.of("type", List.of("string", "null"));
    }
    private static Map<String, Object> choices(String... values) {
        return Map.of("type", "string", "enum", List.of(values));
    }
    private static Map<String, Object> array(Map<String, Object> items) {
        return Map.of("type", "array", "items", items);
    }
    private static Map<String, Object> array(Map<String, Object> items, int maxItems) {
        return Map.of("type", "array", "items", items, "maxItems", maxItems);
    }
    private static Map<String, Object> object(Map<String, Object> properties) {
        return Map.of("type", "object", "properties", properties,
                "required", properties.keySet().stream().sorted().toList(), "additionalProperties", false);
    }
}
