package com.seax.backend.core;

import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.*;

/** Validates and gives the sole canonical presentation order for a report DAG. */
public final class ReportGraph {
    public record Node(UUID id, UUID reportId, List<UUID> dependsOn, Instant createdAt) {}

    private final Map<UUID, Node> nodes;

    public ReportGraph(Collection<Node> nodes) {
        this.nodes = new HashMap<>();
        for (Node node : nodes) this.nodes.put(node.id(), node);
        validateAll(this.nodes);
    }

    public List<Node> topologicallySorted() {
        Map<UUID, Integer> incoming = new HashMap<>();
        Map<UUID, List<UUID>> outgoing = new HashMap<>();
        nodes.values()
                .forEach(
                        n -> {
                            incoming.put(n.id(), n.dependsOn().size());
                            outgoing.put(n.id(), new ArrayList<>());
                        });
        nodes.values().forEach(n -> n.dependsOn().forEach(p -> outgoing.get(p).add(n.id())));
        Comparator<Node> order =
                Comparator.comparing(Node::createdAt).thenComparing(node -> node.id().toString());
        PriorityQueue<Node> ready = new PriorityQueue<>(order);
        nodes.values().stream().filter(n -> incoming.get(n.id()) == 0).forEach(ready::add);
        List<Node> result = new ArrayList<>();
        while (!ready.isEmpty()) {
            Node n = ready.remove();
            result.add(n);
            for (UUID child : outgoing.get(n.id()))
                if (incoming.merge(child, -1, Integer::sum) == 0) ready.add(nodes.get(child));
        }
        if (result.size() != nodes.size()) throw cycle();
        return result;
    }

    public void validateReplacement(UUID workflowId, Collection<UUID> dependencies) {
        Node node = nodes.get(workflowId);
        if (node == null) throw invalid();
        Map<UUID, Node> proposed = new HashMap<>(nodes);
        proposed.put(
                workflowId,
                new Node(node.id(), node.reportId(), canonical(dependencies), node.createdAt()));
        validateAll(proposed);
    }

    public static List<UUID> canonical(Collection<UUID> ids) {
        if (ids == null) throw invalid();
        List<UUID> result = new ArrayList<>(ids);
        if (result.stream().anyMatch(Objects::isNull)
                || new HashSet<>(result).size() != result.size()
                || result.size() > 199) throw invalid();
        result.sort(Comparator.comparing(UUID::toString));
        return List.copyOf(result);
    }

    public static boolean sameDependencies(Collection<UUID> left, Collection<UUID> right) {
        return canonical(left).equals(canonical(right));
    }

    private static void validateAll(Map<UUID, Node> graph) {
        for (Node n : graph.values())
            for (UUID parent : n.dependsOn()) {
                if (parent.equals(n.id())
                        || !graph.containsKey(parent)
                        || !graph.get(parent).reportId().equals(n.reportId())) throw invalid();
            }
        Map<UUID, Integer> marks = new HashMap<>();
        for (UUID id : graph.keySet()) visit(id, graph, marks);
    }

    private static void visit(UUID id, Map<UUID, Node> graph, Map<UUID, Integer> marks) {
        int mark = marks.getOrDefault(id, 0);
        if (mark == 1) throw cycle();
        if (mark == 2) return;
        marks.put(id, 1);
        for (UUID p : graph.get(id).dependsOn()) visit(p, graph, marks);
        marks.put(id, 2);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_WORKFLOW_DEPENDENCY", "工作相依關係無效。");
    }

    private static ApiException cycle() {
        return new ApiException(HttpStatus.CONFLICT, "WORKFLOW_DEPENDENCY_CYCLE", "工作相依關係不能形成循環。");
    }
}
