/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.service.space;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ForbiddenException;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.AuthModeService;
import org.apache.hugegraph.structure.Task;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.HubbleUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class DirectVermeerService {

    @Autowired
    private VermeerClient backend;
    @Autowired
    private HugeConfig config;

    @Autowired
    private AuthModeService authMode;

    private final ObjectMapper mapper = new ObjectMapper();

    public boolean configured() {
        return this.backend.configured();
    }

    public boolean supported() {
        // Native HugeGraph loading reads partitions from PD and Store.
        return this.config.get(HubbleOptions.PD_ENABLED);
    }

    public boolean permitted(HugeClient client) {
        return this.authMode.anonymous() || client.auth().isSuperAdmin();
    }

    public boolean available() {
        if (!this.configured()) {
            return false;
        }
        try {
            // Readiness is scoped by the authenticated service credential.
            Map<String, Object> workers = this.backend.request("GET", "workers/availability", null);
            return Boolean.TRUE.equals(workers.get("available"));
        } catch (VermeerClient.ConfigurationException e) {
            throw e;
        } catch (RuntimeException e) {
            return false;
        }
    }

    public Map<String, Object> graphs() {
        return this.backend.request("GET", "graphs", null);
    }

    public Map<String, Object> graph(String graphspace, String graph) {
        String name = name(graphspace, graph);
        List<Map<String, Object>> graphs = HubbleUtil.uncheckedCast(
                this.graphs().getOrDefault("graphs", List.of()));
        for (Map<String, Object> item : graphs) {
            if (name.equals(item.get("name"))) {
                return Map.of("graph", item);
            }
        }
        return Map.of();
    }

    public Map<String, Object> statistics(HugeClient client) {
        authorize(client);
        E.checkState(this.available(), "Vermeer workers are not ready");
        Map<String, Object> loaded = HubbleUtil.uncheckedCast(
                this.graph(client.getGraphSpaceName(), client.getGraphName()).get("graph"));
        E.checkState(loaded != null && "loaded".equals(loaded.get("status")),
                     "Load this graph from OLAP graph compute before collecting Vermeer statistics");
        // Native graph JSON omits zero counters. These are counts of the loaded
        // graph, not a live Server scan and not per-label statistics.
        long vertices = statisticCount(loaded.getOrDefault("vertex_count", 0));
        long edges = statisticCount(loaded.getOrDefault("edge_count", 0));
        Map<String, Object> result = new HashMap<>();
        result.put("vertex_count", Long.toString(vertices));
        result.put("edge_count", Long.toString(edges));
        result.put("update_time", loaded.get("update_time"));
        result.put("source", "vermeer");
        result.put("approximate", false);
        return result;
    }

    private static long statisticCount(Object value) {
        try {
            long count = Long.parseLong(String.valueOf(value));
            if (count >= 0) {
                return count;
            }
        } catch (NumberFormatException ignored) {
            // Do not echo malformed upstream values into the public error.
        }
        throw new ExternalException("Vermeer returned invalid graph counts; " +
                                    "reload the graph or check the Vermeer service logs");
    }

    public Map<String, Object> load(HugeClient client, boolean force,
                                    Map<String, Object> options) {
        authorize(client);
        Map<String, Object> graph = HubbleUtil.uncheckedCast(
                this.graph(client.getGraphSpaceName(), client.getGraphName()).get("graph"));
        if (graph != null && "error".equals(graph.get("status"))) {
            // A failed initial load leaves a graph that native load/reload both
            // reject. Unload that failed graph so the user can retry loading.
            this.deleteGraph(client);
            graph = null;
        }
        String taskType = graph == null ? "load" : force ? "reload" : "load";
        Map<String, String> params = new HashMap<>();
        // Only loader tuning is user-controlled. Targets and credentials are not.
        for (String key : List.of("load.parallel", "load.use_outedge",
                                  "load.use_out_degree", "load.use_property")) {
            if (options != null && options.get(key) != null) {
                params.put(key, options.get(key).toString());
            }
        }
        params.putIfAbsent("load.parallel", "4");
        params.putIfAbsent("load.use_outedge", "1");
        params.putIfAbsent("load.use_out_degree", "1");
        params.put("load.type", "hugegraph");
        params.put("load.hg_pd_peers", json(List.of(
                this.config.get(HubbleOptions.PD_PEERS).split(","))));
        params.put("load.hugegraph_name", client.getGraphSpaceName() + "/" +
                   client.getGraphName() + "/g");
        return this.submit(client, taskType, params);
    }

    public Map<String, Object> compute(HugeClient client, Map<String, Object> options) {
        authorize(client);
        E.checkArgument(options != null && options.get("compute.algorithm") != null,
                        "compute.algorithm is required");
        String algorithm = options.get("compute.algorithm").toString();
        E.checkArgument(Set.of("pagerank", "wcc", "lpa", "degree", "closeness_centrality",
                               "betweenness_centrality", "triangle_count", "kcore", "sssp", "ppr",
                               "scc", "clustering_coefficient", "depth", "slpa",
                               "cycle_detection", "louvain", "louvain_weighted",
                               "kout", "jaccard")
                           .contains(algorithm), "Unsupported Vermeer algorithm: %s", algorithm);
        if ("cycle_detection".equals(algorithm)) {
            this.validateCycleFilter(options, "vertex");
            this.validateCycleFilter(options, "edge");
            E.checkArgument(!hasText(options.get("filter.vertex_expr")) &&
                            !hasText(options.get("filter.edge_expr")),
                            "Property filters require verified loaded properties; " +
                            "the current Vermeer integration cannot verify them");
        }
        if ("louvain_weighted".equals(algorithm)) {
            E.checkArgument(!hasText(options.get("louvain.edge_weight_property")),
                            "Weighted properties require verified loaded properties; " +
                            "the current Vermeer integration cannot verify them");
        }
        Map<String, String> params = new HashMap<>();
        options.forEach((key, value) -> {
            E.checkArgument(key.startsWith("compute.") ||
                            key.startsWith(algorithm + ".") ||
                            (("louvain_weighted".equals(algorithm) || "louvain".equals(algorithm)) &&
                             Set.of("louvain.resolution", "louvain.threshold", "louvain.step",
                                    "louvain.edge_weight_property").contains(key)) ||
                            ("cycle_detection".equals(algorithm) &&
                             Set.of("cycle.max_length", "cycle.min_length", "cycle.max_cycles",
                                    "cycle.mode", "filter.vertex_expr", "filter.edge_expr",
                                    "filter.vertex_properties", "filter.edge_properties").contains(key)) ||
                            "output.need_statistics".equals(key),
                            "Unsupported Vermeer parameter: %s", key);
            if (value != null) {
                params.put(key, value.toString());
            }
        });
        if ("slpa".equals(algorithm) && params.containsKey("slpa.k")) {
            int k = integerParameter(params.get("slpa.k"), "slpa.k");
            E.checkArgument(k == -1 || k >= 1, "slpa.k must be -1 or at least 1");
        }
        if ("clustering_coefficient".equals(algorithm) && params.containsKey("compute.max_step")) {
            int steps = integerParameter(params.get("compute.max_step"), "compute.max_step");
            E.checkArgument(steps >= 2, "clustering_coefficient requires at least 2 steps");
        }
        if (("louvain".equals(algorithm) || "louvain_weighted".equals(algorithm)) &&
            params.containsKey("compute.max_step")) {
            int steps = integerParameter(params.get("compute.max_step"), "compute.max_step");
            int minimum = "louvain".equals(algorithm) ? 2 : 3;
            E.checkArgument(steps >= minimum, "%s requires at least %s steps", algorithm, minimum);
        }
        if ("kout".equals(algorithm) || "jaccard".equals(algorithm)) {
            String source = params.get(algorithm + ".source");
            // K-out's Vermeer default is "1"; Jaccard has no usable default.
            E.checkArgument(!"jaccard".equals(algorithm) ||
                            (source != null && !source.isBlank()),
                            "jaccard.source is required");
            E.checkArgument(source == null || !source.isBlank(),
                            "%s.source must not be blank", algorithm);
            if ("kout".equals(algorithm) && params.containsKey("kout.direction")) {
                E.checkArgument(Set.of("in", "out", "both").contains(params.get("kout.direction")),
                                "Invalid kout.direction");
            }
            if (params.containsKey("compute.max_step")) {
                int steps;
                try {
                    steps = Integer.parseInt(params.get("compute.max_step"));
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("compute.max_step must be an integer", e);
                }
                E.checkArgument("kout".equals(algorithm) ? steps >= 1 && steps <= 254 : steps >= 2,
                                "Invalid compute.max_step for %s", algorithm);
            }
        }
        // Hubble reads Vermeer's bounded in-memory query cache. The no-op
        // writer avoids durable worker-local files while output.need_query
        // retains values for the preview and task result APIs.
        params.put("output.type", "none");
        params.put("output.need_query", "1");
        return this.submit(client, "compute", params);
    }

    private static int integerParameter(String value, String name) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " must be an integer", e);
        }
    }

    private static boolean hasText(Object value) {
        return value != null && !value.toString().isBlank();
    }

    private void validateCycleFilter(Map<String, Object> options, String type) {
        Object exprValue = options.get("filter." + type + "_expr");
        Object propsValue = options.get("filter." + type + "_properties");
        E.checkArgument(exprValue == null || exprValue instanceof String,
                        "Filter expression must be a string");
        E.checkArgument(propsValue == null || propsValue instanceof String,
                        "Filter properties must be a JSON string array");
        String expr = exprValue == null ? "" : ((String) exprValue).trim();
        String props = propsValue == null ? "[]" : (String) propsValue;
        JsonNode parsed;
        try {
            parsed = this.mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                                .readTree(props);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Filter properties must be a JSON string array", e);
        }
        E.checkArgument(parsed != null && parsed.isArray(), "Filter properties must be a JSON string array");
        for (JsonNode property : parsed) {
            E.checkArgument(property.isTextual() && !property.textValue().isBlank(),
                            "Filter properties must contain nonempty strings");
        }
        E.checkArgument(expr.isEmpty() == parsed.isEmpty(),
                        "Filter expression and properties must be provided together");
    }

    private Map<String, Object> submit(HugeClient client, String type,
                                       Map<String, String> params) {
        Map<String, Object> result = this.backend.request("POST", "tasks/create",
                Map.of("graph", name(client), "task_type", type, "params", params));
        Map<String, Object> task = HubbleUtil.uncheckedCast(result.get("task"));
        return Map.of("task_id", publicId(task));
    }

    public Task task(HugeClient client, int id, boolean includeResult) {
        authorize(client);
        Map<String, Object> raw = this.scopedTask(client, id);
        Task task = this.convert(raw);
        if (includeResult && task.success() && "compute".equals(raw.get("task_type"))) {
            Map<String, Object> values;
            try {
                values = this.resultValues(id, 0, 1000);
            } catch (VermeerClient.ValuesNotFoundException e) {
                // Only confirmed value-cache absence preserves metadata alone.
                return task;
            }
            Map<String, Object> data = new HashMap<>(task.asMap());
            data.put(Task.P.RESULT, json(values));
            return this.mapper.convertValue(data, Task.class);
        }
        return task;
    }

    public Map<String, Object> results(HugeClient client, int id, int cursor, int limit) {
        authorize(client);
        this.scopedTask(client, id);
        E.checkArgument(cursor >= 0 && limit > 0 && limit <= 10000,
                        "Invalid result cursor or limit");
        return this.resultValues(id, cursor, limit);
    }

    private Map<String, Object> resultValues(int id, int cursor, int limit) {
        Map<String, Object> result = new HashMap<>(this.backend.request(
                "GET", "tasks/value/" + nativeId(id) +
                "?cursor=" + cursor + "&limit=" + (limit + 1), null));
        List<?> vertices = HubbleUtil.uncheckedCast(result.getOrDefault("vertices", List.of()));
        int count = Math.min(vertices.size(), limit);
        // Native pages have no total or continuation flag. Peek one value ahead,
        // then leave it at the next cursor so an exact final page has no phantom successor.
        result.put("vertices", new ArrayList<>(vertices.subList(0, count)));
        result.put("cursor", cursor + count);
        result.put("has_more", vertices.size() > limit);
        return result;
    }

    /** Bounded result page and adjacency from the currently loaded Vermeer snapshot. */
    public Map<String, Object> previewEdges(HugeClient client, int id, int cursor, int limit) {
        authorize(client);
        E.checkArgument(cursor >= 0 && limit > 0 && limit <= 30 && cursor <= Integer.MAX_VALUE - limit,
                        "Invalid preview cursor or limit");
        Map<String, Object> rawTask;
        try {
            rawTask = HubbleUtil.uncheckedCast(
                    this.backend.requestPreview("GET", "task/" + nativeId(id), null).get("task"));
        } catch (VermeerClient.PreviewTooLargeException e) {
            return Map.of("result_status", "too_large");
        }
        if (rawTask == null || !name(client).equals(rawTask.get("graph_name"))) {
            throw new ForbiddenException("Task does not belong to this graph");
        }
        E.checkState("compute".equals(rawTask.get("task_type")) &&
                     "complete".equals(rawTask.get("status")),
                     "Task is not a completed Vermeer compute task");
        Map<String, Object> values;
        try {
            values = this.backend.requestPreview(
                    "GET", "tasks/value/" + nativeId(id) + "?cursor=" + cursor +
                    "&limit=" + (limit + 1), null);
        } catch (VermeerClient.ValuesNotFoundException e) {
            // Vermeer uses this response for both empty and removed values.
            return Map.of("result_status", "expired");
        } catch (VermeerClient.PreviewTooLargeException e) {
            return Map.of("result_status", "too_large");
        }
        Object rawVertices = values.getOrDefault("vertices", List.of());
        E.checkState(rawVertices instanceof List<?> && ((List<?>) rawVertices).size() <= limit + 1,
                     "Invalid Vermeer preview result");
        List<?> all = (List<?>) rawVertices;
        int count = Math.min(all.size(), limit);
        List<?> vertices = new ArrayList<>(all.subList(0, count));
        Map<String, Object> result = new HashMap<>();
        result.put("result_status", "available");
        result.put("vertices", vertices);
        result.put("cursor", cursor + count);
        result.put("has_more", all.size() > limit);
        result.put("edges", List.of());
        result.put("edges_status", "unavailable");
        result.put("scanned", 0);
        result.put("truncated", false);
        List<String> ids = new ArrayList<>();
        int totalBytes = 0;
        boolean idsTooLarge = false;
        for (Object entry : vertices) {
            E.checkState(entry instanceof Map<?, ?> && ((Map<?, ?>) entry).get("ID") instanceof String,
                         "Invalid Vermeer preview vertex");
            String vertex = (String) ((Map<?, ?>) entry).get("ID");
            E.checkState(!vertex.isEmpty(), "Invalid Vermeer preview vertex ID");
            int size = vertex.getBytes(StandardCharsets.UTF_8).length;
            totalBytes += size;
            // Keep valid computation values available even when an ID cannot
            // be safely included in the bounded adjacency request.
            idsTooLarge |= size > 256 || totalBytes > 16384;
            ids.add(vertex);
        }
        if (idsTooLarge) {
            return result;
        }
        if (ids.isEmpty()) {
            result.put("edges_status", "available");
            return result;
        }
        try {
            Map<String, Object> response = this.backend.requestPreview("POST", "graphs/" +
                    URLEncoder.encode(name(client), StandardCharsets.UTF_8).replace("+", "%20") +
                    "/preview-edges", Map.of("vertices", ids));
            Object edges = response.getOrDefault("edges", List.of());
            E.checkState(edges instanceof List<?> && ((List<?>) edges).size() <= 30,
                         "Invalid Vermeer preview edges");
            Set<String> allowed = Set.copyOf(ids);
            List<Map<String, String>> checked = new ArrayList<>();
            for (Object item : (List<?>) edges) {
                E.checkState(item instanceof Map<?, ?>, "Invalid Vermeer preview edge");
                Map<?, ?> edge = (Map<?, ?>) item;
                E.checkState(edge.get("source") instanceof String && edge.get("target") instanceof String &&
                             allowed.contains(edge.get("source")) && allowed.contains(edge.get("target")),
                             "Invalid Vermeer preview edge endpoint");
                checked.add(Map.of("source", (String) edge.get("source"),
                                   "target", (String) edge.get("target")));
            }
            Object scanned = response.get("scanned");
            Object truncated = response.get("truncated");
            E.checkState(scanned instanceof Number && ((Number) scanned).longValue() >= 0 &&
                         ((Number) scanned).longValue() <= 3000 && truncated instanceof Boolean,
                         "Invalid Vermeer preview metadata");
            result.put("edges", checked);
            result.put("edges_status", "available");
            result.put("scanned", scanned);
            result.put("truncated", truncated);
        } catch (RuntimeException e) {
            // An old Vermeer or a failed edge query must not hide valid task values.
            // Neither is evidence that the computation failed or the graph has no edges.
        }
        return result;
    }

    public List<Task> tasks(HugeClient client) {
        if (!this.supported() || !this.permitted(client)) {
            return List.of();
        }
        List<Map<String, Object>> items = HubbleUtil.uncheckedCast(
                this.backend.request("GET", "tasks?limit=10000", null)
                            .getOrDefault("tasks", List.of()));
        List<Task> result = new ArrayList<>();
        for (Map<String, Object> item : items) {
            if (name(client).equals(item.get("graph_name"))) {
                result.add(this.convert(item));
            }
        }
        return result;
    }

    public Task cancel(HugeClient client, int id) {
        authorize(client);
        this.scopedTask(client, id);
        this.backend.request("GET", "task/cancel/" + nativeId(id), null);
        return this.task(client, id, false);
    }

    public void deleteGraph(HugeClient client) {
        authorize(client);
        this.unloadGraph(client);
    }

    public void deleteGraphIfPresent(HugeClient client) {
        this.deleteGraphsIfPresent(client, List.of(client.getGraphName()));
    }

    public void deleteGraphsIfPresent(HugeClient client, List<String> graphs) {
        if (!this.supported() || graphs.isEmpty()) {
            // A standalone source cannot have been loaded by this PD adapter.
            return;
        }
        String space = client.getGraphSpaceName();
        String originalGraph = client.getGraphName();
        Map<String, String> names = new HashMap<>();
        graphs.forEach(graph -> names.put(name(space, graph), graph));
        // Source deletion must not depend on interactive compute availability.
        // If no copy exists, leave source deletion to Server's original rights.
        // Presence is private; unloading still requires the direct authorization.
        try {
            // Check every member before unloading any copy. Reload briefly removes
            // its graph record, so graph presence alone cannot exclude accepted work.
            List<Map<String, Object>> pending = HubbleUtil.uncheckedCast(
                    this.backend.request("GET", "tasks?type=todo&limit=10000", null)
                                .getOrDefault("tasks", List.of()));
            if (pending.size() >= 10000) {
                throw new ExternalException("Unable to verify the complete Vermeer task queue");
            }
            for (Map<String, Object> task : pending) {
                String graph = names.get(task.get("graph_name"));
                if (graph != null && Set.of("load", "reload").contains(task.get("task_type")) &&
                    !Set.of("complete", "loaded", "error", "canceled").contains(task.get("status"))) {
                    client.assignGraph(space, graph);
                    authorize(client);
                    throw new ExternalException("Finish or cancel the Vermeer load before deleting its source");
                }
            }
            for (String graph : graphs) {
                client.assignGraph(space, graph);
                if (this.graph(space, graph).containsKey("graph")) {
                    authorize(client);
                    this.unloadGraph(client);
                }
            }
        } finally {
            client.assignGraph(space, originalGraph);
        }
    }

    private void unloadGraph(HugeClient client) {
        this.backend.request("DELETE", "graphs/" +
                URLEncoder.encode(name(client), StandardCharsets.UTF_8), null);
    }

    private Map<String, Object> scopedTask(HugeClient client, int id) {
        Map<String, Object> task = HubbleUtil.uncheckedCast(
                this.backend.request("GET", "task/" + nativeId(id), null).get("task"));
        if (task == null || !name(client).equals(task.get("graph_name"))) {
            throw new ForbiddenException("Task does not belong to this graph");
        }
        return task;
    }

    private Task convert(Map<String, Object> task) {
        String type = "compute".equals(task.get("task_type")) ? "compute" : "load";
        String status = task.getOrDefault("status", "created").toString();
        status = switch (status) {
            case "complete", "loaded" -> "success";
            case "error" -> "failed";
            case "canceled" -> "cancelled";
            case "created", "waiting" -> "queued";
            default -> "running";
        };
        Map<String, Object> result = new HashMap<>();
        result.put(Task.P.ID, publicId(task));
        result.put(Task.P.TYPE, "vermeer-task:" + type);
        Map<String, String> params = HubbleUtil.uncheckedCast(task.getOrDefault("params", Map.of()));
        result.put(Task.P.NAME, params.getOrDefault("compute.algorithm", "Vermeer " + type));
        result.put(Task.P.STATUS, status);
        result.put(Task.P.CREATE, time(task.get("create_time")));
        result.put(Task.P.UPDATE, time(task.get("update_time")));
        result.put(Task.P.RESULT, task.get("error_message"));
        return this.mapper.convertValue(result, Task.class);
    }

    private static long time(Object value) {
        return value == null ? 0L : OffsetDateTime.parse(value.toString()).toInstant().toEpochMilli();
    }

    private static int publicId(Map<String, Object> task) {
        int id = ((Number) task.get("id")).intValue();
        E.checkState(id > 0, "Invalid Vermeer task id");
        return -id;
    }

    private static long nativeId(int id) {
        E.checkArgument(id < 0, "Invalid direct Vermeer task id");
        return -(long) id;
    }

    private static String name(HugeClient client) {
        return name(client.getGraphSpaceName(), client.getGraphName());
    }

    private static String name(String space, String graph) {
        return space + "-" + graph;
    }

    private void authorize(HugeClient client) {
        this.requireSupported();
        // authClient resolves the connection and GraphSpace access. A graph
        // read additionally verifies the caller's permission before using a
        // shared Vermeer service credential or reading raw Store partitions.
        if (!this.permitted(client)) {
            throw new ForbiddenException(
                    "Direct Vermeer access requires a super administrator in authenticated mode");
        }
        client.graph().listVertices(1);
    }

    private void requireSupported() {
        if (!this.supported()) {
            throw new ExternalException("Direct Vermeer requires pd.enabled=true");
        }
    }

    private static String json(Object value) {
        try {
            return new ObjectMapper().writeValueAsString(value);
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("Invalid Vermeer parameters", e);
        }
    }
}
