package com.seax.backend.core;

import java.nio.charset.StandardCharsets;
import java.util.*;

/** Deterministic, version-bound input selection. Never uses current assignment as evidence. */
public final class AiInputAssembler {
    private AiInputAssembler() {}

    public static Map<String,Object> classification(Object projectId,
            List<Map<String,Object>> workflows, Map<String,Object> memory) {
        List<Map<String,Object>> clean = workflows.stream().map(w -> map(
                "id", w.get("id"), "name", w.get("name"), "description", w.get("description"))).toList();
        Set<String> query = new HashSet<>();
        clean.forEach(w -> query.addAll(terms(w.get("name") + " " + w.get("description"))));
        List<Map<String,Object>> cases = objects(memory.get("projectExperiences")).stream()
                .filter(p -> !Objects.toString(p.get("projectId")).equals(Objects.toString(projectId)))
                .filter(p -> score(p, query) > 0)
                .sorted(Comparator.<Map<String,Object>>comparingInt(p -> score(p, query)).reversed()
                        .thenComparing(p -> Objects.toString(p.get("projectId"))))
                .limit(20).toList();
        Set<String> projectIds = new HashSet<>();
        cases.forEach(p -> projectIds.add(Objects.toString(p.get("projectId"))));
        projectIds.add(Objects.toString(projectId));
        // Always include all organization rules/boundaries; do not filter away negative evidence.
        List<Map<String,Object>> knowledge = scoped(objects(memory.get("knowledgeItems")),projectIds);
        List<Map<String,Object>> relationships = scoped(objects(memory.get("relationships")),projectIds);
        Set<String> evidenceIds = new HashSet<>();
        for (var k : knowledge) collectIds(k.get("evidenceIds"), evidenceIds);
        for (var r : relationships) collectIds(r.get("evidenceIds"), evidenceIds);
        for (var p : cases) for (var w : objects(p.get("workflows"))) collectIds(w.get("evidenceIds"),evidenceIds);
        var evidence = objects(memory.get("evidence")).stream()
                .filter(e -> evidenceIds.contains(Objects.toString(e.get("id")))).toList();
        Set<String> found = new HashSet<>();
        evidence.forEach(e -> found.add(Objects.toString(e.get("id"))));
        if (!found.containsAll(evidenceIds)) throw new IllegalArgumentException("Memory evidence is incomplete");
        var context=map("schemaVersion",memory.getOrDefault("schemaVersion",1),"version",memory.get("version"),
                "departments",memory.get("departments"),"relationshipsDescription",memory.get("relationshipsDescription"),
                "knowledgeItems",knowledge,"relationships",relationships,"projectExperiences",cases,"evidence",evidence);
        return map("projectId",projectId,"workflows",clean,"memoryContext",context,
                "retrievalManifest",map("strategy","LEXICAL_BIGRAM_V1","complete",true,
                        "globalMemoryVersion",memory.get("version"),
                        "projectIds",cases.stream().map(p->p.get("projectId")).toList(),
                        "knowledgeItemIds",knowledge.stream().map(k->k.get("id")).toList(),
                        "evidenceIds",evidenceIds.stream().sorted().toList()));
    }

    public static Map<String,Object> feedback(Map<String,Object> jobInput) {
        var report=object(jobInput.getOrDefault("finalReport",jobInput.get("report")));
        var diffs=objects(jobInput.get("reportDiffs"));
        List<Map<String,Object>> sources=new ArrayList<>();
        sources.add(source(report.get("projectId"),report.get("id"),report.get("version"),null,"CLOSED_REPORT","/finalReport"));
        for(int i=0;i<diffs.size();i++) {
            var diff=diffs.get(i);
            sources.add(source(report.get("projectId"),report.get("id"),diff.get("toVersion"),diff.get("id"),"REPORT_DIFF","/reportDiffs/"+i));
        }
        return map("contractVersion",2,"project",jobInput.get("project"),"finalReport",report,
                "reportDiffs",diffs,"globalMemory",jobInput.get("globalMemory"),"sourceDocuments",sources);
    }

    private static Map<String,Object> source(Object project,Object report,Object version,Object diff,String type,String pointer) {
        String identity=type+":"+report+":"+version+":"+diff;
        return map("id",UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString(),
                "sourceType",type,"projectId",project,"reportId",report,"reportVersion",version,
                "reportDiffId",diff,"payloadPointer",pointer);
    }
    private static List<Map<String,Object>> scoped(List<Map<String,Object>> list,Set<String> ids) {
        return list.stream().filter(k -> {
            var scope=object(k.get("scope"));
            return "ORGANIZATION".equals(scope.get("level"))||ids.contains(Objects.toString(scope.get("projectId")));
        }).toList();
    }
    private static int score(Map<String,Object> p,Set<String> query) {
        StringBuilder text=new StringBuilder(Objects.toString(p.get("projectName"),""));
        for(var w:objects(p.get("workflows")))text.append(' ').append(w.get("name")).append(' ').append(w.get("description"));
        var terms=terms(text.toString());terms.retainAll(query);return terms.size();
    }
    private static Set<String> terms(String value) {
        var result=new HashSet<String>();
        for(var word:value.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")) {
            if(word.isEmpty())continue;
            result.add(word);
            int[] cps=word.codePoints().toArray();
            for(int i=0;i+1<cps.length;i++)result.add(new String(cps,i,2));
        }
        return result;
    }
    private static void collectIds(Object value,Set<String> target) { if(value instanceof List<?> list)list.forEach(x->target.add(Objects.toString(x))); }
    @SuppressWarnings("unchecked") private static Map<String,Object> object(Object value) {
        if(!(value instanceof Map<?,?>))throw new IllegalArgumentException("Expected object");return (Map<String,Object>)value;
    }
    private static List<Map<String,Object>> objects(Object value) {
        if(value==null)return List.of();
        if(!(value instanceof List<?> list))throw new IllegalArgumentException("Expected list");
        return list.stream().map(AiInputAssembler::object).toList();
    }
    private static Map<String,Object> map(Object... values) {
        Map<String,Object> result=new LinkedHashMap<>();
        for(int i=0;i<values.length;i+=2)result.put((String)values[i],values[i+1]);return result;
    }
}
