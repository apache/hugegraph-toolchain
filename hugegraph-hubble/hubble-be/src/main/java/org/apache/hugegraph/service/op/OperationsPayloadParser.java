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

package org.apache.hugegraph.service.op;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.Lifecycle;
import org.apache.hugegraph.service.op.OperationsModels.Readiness;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.service.op.OperationsModels.Topology;

public class OperationsPayloadParser {

    private final ObjectMapper mapper;

    public OperationsPayloadParser(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    Lifecycle parseStoreLifecycle(String payload, int httpStatus, long observedAt) {
        try {
            JsonNode root = this.mapper.readTree(payload);
            JsonNode code = root == null ? null : root.get("status");
            String state = root == null ? null : this.text(root, "text");
            if (httpStatus != 200 || code == null || !code.isIntegralNumber() ||
                !code.canConvertToInt() || code.intValue() != 0 ||
                !List.of("STARTING", "STARTED", "STOPPING", "UNAVAILABLE").contains(state == null ? "" : state)) {
                throw new MalformedUpstreamException("store_lifecycle");
            }
            return new Lifecycle(state, observedAt, null, false);
        } catch (Exception e) {
            return new Lifecycle("UNKNOWN", observedAt, "response_unrecognized", false);
        }
    }

    Readiness parseReadiness(String type, String payload, int httpStatus,
                              long observedAt, String requestPath) {
        Map<String, Object> details = Map.of("request_path", requestPath,
                                           "http_status", httpStatus);
        try {
            JsonNode root = this.mapper.readTree(payload);
            if (root == null || !root.isObject()) {
                throw new MalformedUpstreamException("readiness");
            }
            if (root.path("status").asInt(0) == -1 &&
                root.path("error").asText("").toLowerCase(Locale.ROOT).contains("unauthorized")) {
                return new Readiness("UNKNOWN", observedAt, null,
                                     "readiness_auth_rejected", false, details);
            }
            String state;
            boolean ready;
            String reason;
            if ("PD".equals(type)) {
                JsonNode flag = root.get("ready");
                state = this.text(root, "state");
                if (flag == null || !flag.isBoolean() ||
                    !List.of("STATE_UNINITIALIZED", "STATE_LEADER", "STATE_FOLLOWER",
                             "STATE_TRANSFERRING", "STATE_CANDIDATE", "STATE_ERROR",
                             "STATE_SHUTTING", "STATE_SHUTDOWN").contains(state == null ? "" : state)) {
                    throw new MalformedUpstreamException("readiness");
                }
                ready = flag.booleanValue();
                if (ready && (httpStatus != 200 ||
                              !List.of("STATE_LEADER", "STATE_FOLLOWER").contains(state))) {
                    throw new MalformedUpstreamException("readiness");
                }
                reason = ready ? null : "STATE_ERROR".equals(state) ? "pd_raft_error" :
                         "STATE_SHUTDOWN".equals(state) || "STATE_SHUTTING".equals(state) ?
                         "pd_raft_shutdown" : "pd_quorum_not_ready";
            } else {
                JsonNode code = root.get("status");
                state = this.text(root, "text");
                if (httpStatus != 200 || code == null || !code.isIntegralNumber() || code.asInt(-1) != 0 ||
                    !List.of("ONLINE", "STARTING", "STOPPING").contains(state == null ? "" : state)) {
                    throw new MalformedUpstreamException("readiness");
                }
                ready = "ONLINE".equals(state);
                reason = ready ? null : "STARTING".equals(state) ? "store_starting" : "store_stopping";
            }
            return new Readiness(ready ? "READY" : "NOT_READY", observedAt,
                                 state, reason, false, details);
        } catch (Exception e) {
            // Never expose an upstream error envelope or infer readiness from HTTP 200.
            return new Readiness("UNKNOWN", observedAt, null,
                                 "readiness_response_unrecognized", false, details);
        }
    }

    public Topology parseTopology(String clusterPayload, String storesPayload) {
        return this.parseTopology(clusterPayload, storesPayload, null);
    }

    public Topology parseTopology(String clusterPayload, String storesPayload,
                                  Long observedAt) {
        JsonNode cluster = this.data(clusterPayload, "pd_cluster");
        JsonNode stores = this.data(storesPayload, "pd_stores");
        List<Node> nodes = new ArrayList<>();
        Map<String, Node> pdNodes = new LinkedHashMap<>();
        JsonNode leader = cluster.get("pdLeader");
        if (leader != null && !leader.isNull()) {
            this.requireObject(leader, "pd_cluster");
        }
        String leaderId = leader != null && leader.isObject() ?
                          this.pdId(leader) : null;
        JsonNode pdList = this.requiredArray(cluster, "pdList", "pd_cluster");
        for (JsonNode pd : pdList) {
            this.requireObject(pd, "pd_cluster");
            this.addPd(pdNodes, pd,
                       leaderId != null && leaderId.equals(this.pdId(pd)),
                       leaderId != null, observedAt);
        }
        if (leader != null && leader.isObject()) {
            this.addPd(pdNodes, leader, true, true, observedAt);
        }
        nodes.addAll(pdNodes.values());

        Map<String, JsonNode> storeNodes = new LinkedHashMap<>();
        JsonNode clusterStores = cluster.get("stores");
        if (clusterStores != null) {
            this.indexStores(storeNodes, this.requiredArray(
                             cluster, "stores", "pd_cluster"));
        }
        this.indexStores(storeNodes, this.requiredArray(
                         stores, "stores", "pd_stores"));
        for (Map.Entry<String, JsonNode> entry : storeNodes.entrySet()) {
            nodes.add(this.store(entry.getKey(), entry.getValue(), observedAt));
        }

        Map<String, Long> facts = new LinkedHashMap<>();
        this.putLong(facts, "graphs", cluster.get("graphSize"));
        this.putLong(facts, "partitions", cluster.get("partitionSize"));
        this.putLong(facts, "replicas", cluster.get("shardCount"));
        this.putLong(facts, "stores", cluster.get("storeSize"));
        this.putLong(facts, "stores_up", cluster.get("onlineStoreSize"));
        this.putKilobytesAsBytes(facts, "data_size_bytes",
                                 cluster.get("dataSize"));
        this.putCapacityFacts(facts, storeNodes.values());
        String clusterState = this.text(cluster, "state");
        String dataState = this.text(cluster, "dataState");
        String status = this.clusterStatus(clusterState);
        String reason = this.clusterReason(clusterState);
        String dataStatus = this.dataStatus(dataState);
        if (dataState != null && severity(dataStatus) >= severity(status) &&
            !"UP".equals(dataStatus)) {
            status = dataStatus;
            reason = this.dataReason(dataState);
        }
        return new Topology(status, reason, nodes, facts,
                            clusterState, dataState);
    }

    public Map<String, String> parseStoreHosts(String storesPayload) {
        JsonNode stores = this.data(storesPayload, "pd_stores");
        Map<String, String> result = new LinkedHashMap<>();
        JsonNode values = this.requiredArray(stores, "stores", "pd_stores");
        for (JsonNode store : values) {
            this.requireObject(store, "pd_stores");
            String rawId = this.identity(store, "storeId");
            String address = this.text(store, "address");
            if (rawId == null || address == null) {
                continue;
            }
            String host = host(address);
            if (host != null) {
                result.put(this.stableId("store", rawId), host);
            }
        }
        return result;
    }

    public Map<String, String> parseStoreRestAddresses(String storesPayload) {
        JsonNode stores = this.data(storesPayload, "pd_stores");
        Map<String, String> result = new LinkedHashMap<>();
        JsonNode values = this.requiredArray(stores, "stores", "pd_stores");
        for (JsonNode store : values) {
            this.requireObject(store, "pd_stores");
            String rawId = this.identity(store, "storeId");
            String restAddress = this.text(store, "restAddress");
            if (rawId == null || restAddress == null) {
                continue;
            }
            try {
                URI uri = URI.create("http://" + restAddress);
                OperationsHttpClient.validateTarget(uri, Collections.emptySet());
                result.put(this.stableId("store", rawId),
                           OperationsHttpClient.authority(uri));
            } catch (RuntimeException e) {
                throw new MalformedUpstreamException("pd_store_rest_address", e);
            }
        }
        return result;
    }

    public Map<String, URI> parseStoreMetricTargets(String payload) {
        try {
            JsonNode root = this.mapper.readTree(payload);
            if (!root.isArray()) {
                throw new MalformedUpstreamException("pd_prom_targets");
            }
            Map<String, URI> result = new LinkedHashMap<>();
            for (JsonNode group : root) {
                this.requireObject(group, "pd_prom_targets");
                JsonNode labels = group.get("labels");
                this.requireObject(labels, "pd_prom_targets");
                if (!"store".equals(this.text(labels, "__app_name"))) {
                    continue;
                }
                String scheme = this.text(labels, "__scheme__");
                if (scheme == null) {
                    scheme = "http";
                }
                JsonNode targets = this.requiredArray(group, "targets",
                                                      "pd_prom_targets");
                for (JsonNode target : targets) {
                    if (!target.isTextual()) {
                        throw new MalformedUpstreamException(
                                  "pd_prom_targets");
                    }
                    String authority = target.textValue().trim();
                    URI uri = URI.create(scheme + "://" + authority);
                    OperationsHttpClient.validateTarget(uri,
                                                        Collections.emptySet());
                    result.put(OperationsHttpClient.authority(uri), uri);
                }
            }
            return result;
        } catch (MalformedUpstreamException e) {
            throw e;
        } catch (Exception e) {
            throw new MalformedUpstreamException("pd_prom_targets", e);
        }
    }

    public Map<String, Object> parseStoreMetrics(String group,
                                                  String payload) {
        try {
            JsonNode root = this.mapper.readTree(payload);
            if (!root.isObject()) {
                throw new MalformedUpstreamException("store_" + group);
            }
            if ("system".equals(group)) {
                return this.systemMetrics(root);
            }
            if ("drive".equals(group)) {
                return this.driveMetrics(root);
            }
            if ("raft_summary".equals(group)) {
                JsonNode groups = root.path("groups");
                JsonNode enabled = root.path("enabled_groups");
                if (!groups.isIntegralNumber() || !groups.canConvertToLong() ||
                    !enabled.isIntegralNumber() || !enabled.canConvertToLong() ||
                    groups.longValue() < 0L || enabled.longValue() < 0L ||
                    enabled.longValue() > groups.longValue()) {
                    throw new MalformedUpstreamException("store_raft_summary");
                }
                return Map.of("groups", groups.longValue(), "enabled_groups", enabled.longValue());
            }
            if ("raft".equals(group)) {
                return this.raftMetrics(root);
            }
            throw new IllegalArgumentException("Unknown Store metric group");
        } catch (MalformedUpstreamException | IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new MalformedUpstreamException("store_" + group, e);
        }
    }

    public Map<String, Object> parsePdPrometheusMetrics(String payload) {
        Map<String, Object> result = new LinkedHashMap<>();
        double heap = 0D;
        double nonheap = 0D;
        boolean hasHeap = false;
        boolean hasNonheap = false;
        for (String rawLine : payload.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            Double value = prometheusValue(line);
            if (value == null) {
                continue;
            }
            if (prometheusMetric(line, "process_uptime_seconds")) {
                result.put("uptime_seconds", value);
            } else if (prometheusMetric(line, "system_cpu_count")) {
                result.put("cpu_count", value);
            } else if (prometheusMetric(line, "jvm_threads_live_threads")) {
                result.put("threads_live", value);
            } else if (prometheusMetric(line, "process_cpu_usage")) {
                result.put("process_cpu_usage", value);
            } else if (prometheusMetric(line, "system_cpu_usage")) {
                result.put("system_cpu_usage", value);
            } else if (line.startsWith("jvm_memory_used_bytes{") &&
                       line.contains("area=\"heap\"")) {
                heap += value;
                hasHeap = true;
            } else if (line.startsWith("jvm_memory_used_bytes{") &&
                       line.contains("area=\"nonheap\"")) {
                nonheap += value;
                hasNonheap = true;
            }
        }
        if (hasHeap) {
            result.put("heap_used_bytes", heap);
        }
        if (hasNonheap) {
            result.put("nonheap_used_bytes", nonheap);
        }
        if (result.isEmpty()) {
            throw new MalformedUpstreamException("pd_prometheus");
        }
        return result;
    }

    private static boolean prometheusMetric(String line, String name) {
        if (!line.startsWith(name) || line.length() == name.length()) {
            return false;
        }
        char boundary = line.charAt(name.length());
        return boundary == '{' || Character.isWhitespace(boundary);
    }

    private JsonNode data(String payload, String source) {
        try {
            JsonNode root = this.mapper.readTree(payload);
            JsonNode status = root.get("status");
            JsonNode data = root.get("data");
            if (status == null || status.asInt(-1) != 0 || data == null ||
                !data.isObject()) {
                throw new MalformedUpstreamException(source);
            }
            return data;
        } catch (MalformedUpstreamException e) {
            throw e;
        } catch (Exception e) {
            throw new MalformedUpstreamException(source, e);
        }
    }

    private void addPd(Map<String, Node> nodes, JsonNode pd, boolean leader,
                       boolean authoritativeLeader, Long observedAt) {
        String id = this.pdId(pd);
        if (id == null) {
            return;
        }
        String role = leader ? "LEADER" : authoritativeLeader ? "FOLLOWER" :
                      this.role(this.text(pd, "role"));
        nodes.put(id, new Node(id, "PD", "PD " + this.shortId(id), role,
                               this.text(pd, "serviceVersion"),
                               this.health(this.text(pd, "state")),
                               observedAt,
                               Collections.emptyMap()));
    }

    String pdMetricNodeId(String clusterPayload, String configuredBase) {
        String configured = canonicalPdEndpoint(configuredBase, null);
        if (configured == null) {
            return null;
        }
        String scheme = URI.create(configuredBase).getScheme();
        String matchedId = null;
        for (JsonNode member : this.pdMembers(clusterPayload)) {
            String endpoint = canonicalPdEndpoint(this.text(member, "restUrl"), scheme);
            if (configured.equals(endpoint)) {
                String id = this.pdId(member);
                if (matchedId != null && !matchedId.equals(id)) {
                    return null;
                }
                matchedId = id;
            }
        }
        return matchedId;
    }

    Map<String, Object> pdMetricMappingDiagnostics(String clusterPayload, String configuredBase) {
        String configured = canonicalPdEndpoint(configuredBase, null);
        String configuredOrigin = endpointOrigin(configured);
        String scheme = configured == null ? null : URI.create(configured).getScheme();
        Map<String, Map<String, Object>> members = new LinkedHashMap<>();
        int matched = 0;
        for (JsonNode member : this.pdMembers(clusterPayload)) {
            String id = this.pdId(member);
            if (id == null || members.containsKey(id)) {
                continue;
            }
            String endpoint = canonicalPdEndpoint(this.text(member, "restUrl"), scheme);
            String origin = endpointOrigin(endpoint);
            boolean exact = configured != null && configured.equals(endpoint);
            if (exact) {
                matched++;
            }
            Map<String, Object> comparison = new LinkedHashMap<>();
            comparison.put("node_id", id);
            comparison.put("endpoint_valid", endpoint != null);
            comparison.put("origin", origin);
            comparison.put("origin_matches", configuredOrigin != null && configuredOrigin.equals(origin));
            comparison.put("base_path_matches", configured != null && endpoint != null &&
                    URI.create(configured).getRawPath().equals(URI.create(endpoint).getRawPath()));
            members.put(id, comparison);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("configured_origin", configuredOrigin);
        result.put("status", configured == null ? "invalid_endpoint" : matched > 1 ? "ambiguous" :
                             matched == 0 ? "no_match" : "matched");
        result.put("matched_nodes", matched);
        result.put("discovered_nodes", members.size());
        result.put("members", members.values().stream()
                .sorted(Comparator.comparing(member ->
                        !Boolean.TRUE.equals(member.get("origin_matches")) ||
                        !Boolean.TRUE.equals(member.get("base_path_matches"))))
                .limit(10).toList());
        result.put("omitted_members", Math.max(0, members.size() - 10));
        return result;
    }

    private List<JsonNode> pdMembers(String clusterPayload) {
        JsonNode cluster = this.data(clusterPayload, "pd_cluster");
        List<JsonNode> members = new ArrayList<>();
        this.requiredArray(cluster, "pdList", "pd_cluster").forEach(members::add);
        JsonNode leader = cluster.get("pdLeader");
        if (leader != null && leader.isObject()) {
            members.add(leader);
        }
        return members;
    }

    private static String endpointOrigin(String endpoint) {
        return endpoint == null ? null : OperationsHttpClient.origin(URI.create(endpoint));
    }

    private static String canonicalPdEndpoint(String address, String configuredScheme) {
        if (address == null) {
            return null;
        }
        try {
            String endpoint = configuredScheme != null && !address.contains("://") ?
                              configuredScheme + "://" + address : address;
            URI target = URI.create(endpoint).normalize();
            if (target.getRawQuery() != null) {
                return null;
            }
            String path = target.getRawPath();
            if (path == null) {
                path = "";
            } else if (path.endsWith("/")) {
                path = path.substring(0, path.length() - 1);
            }
            return OperationsHttpClient.origin(target) + path;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String pdId(JsonNode pd) {
        String identity = this.text(pd, "restUrl");
        if (identity == null) {
            identity = this.text(pd, "raftUrl");
        }
        if (identity == null) {
            return null;
        }
        return this.stableId("pd", identity);
    }

    private void indexStores(Map<String, JsonNode> stores, JsonNode values) {
        for (JsonNode store : values) {
            this.requireObject(store, "pd_stores");
            String id = this.identity(store, "storeId");
            if (id != null) {
                stores.put(id, store);
            }
        }
    }

    private Node store(String rawId, JsonNode store, Long observedAt) {
        String id = this.stableId("store", rawId);
        Map<String, Object> metrics = new LinkedHashMap<>();
        this.putMetric(metrics, "capacity_bytes", store.get("capacity"));
        this.putMetric(metrics, "available_bytes", store.get("available"));
        this.putMetric(metrics, "partitions", store.get("partitionCount"));
        this.putMetric(metrics, "leaders", store.get("leaderCount"));
        Map<String, Object> groups = metrics.isEmpty() ?
                                     Collections.emptyMap() :
                                     Collections.singletonMap("backend",
                                                              metrics);
        Map<String, MetricStatus> statuses = new LinkedHashMap<>();
        if (metrics.isEmpty()) {
            statuses.put("backend", new MetricStatus(
                         "UNSUPPORTED", observedAt, null, false, false,
                         "topology_fields_unavailable"));
        } else {
            statuses.put("backend", new MetricStatus(
                         "AVAILABLE", observedAt, observedAt, true, false,
                         null));
        }
        return new Node(id, "STORE", "Store " + this.shortId(id), null,
                        this.firstText(store, "version", "serviceVersion"),
                        this.health(this.text(store, "state")), observedAt,
                        groups, statuses);
    }

    private Map<String, Object> systemMetrics(JsonNode root) {
        Map<String, Object> result = new LinkedHashMap<>();
        this.copyMetricGroup(root, result, "basic", "mem_total", "mem_used",
                             "processors", "uptime", "systemload_average");
        this.copyMetricGroup(root, result, "heap", "used", "max",
                             "committed");
        this.copyMetricGroup(root, result, "nonheap", "used", "max",
                             "committed");
        this.copyMetricGroup(root, result, "thread", "count", "daemon",
                             "peak");
        return result;
    }

    private Map<String, Object> driveMetrics(JsonNode root) {
        long total = 0L;
        long usable = 0L;
        long free = 0L;
        boolean hasTotal = false;
        boolean hasUsable = false;
        boolean hasFree = false;
        String unit = null;
        for (JsonNode drive : root) {
            Long value = this.longValue(drive.get("total_space"));
            if (value != null) {
                total += value;
                hasTotal = true;
            }
            value = this.longValue(drive.get("usable_space"));
            if (value != null) {
                usable += value;
                hasUsable = true;
            }
            value = this.longValue(drive.get("free_space"));
            if (value != null) {
                free += value;
                hasFree = true;
            }
            String currentUnit = this.text(drive, "size_unit");
            if (unit == null) {
                unit = currentUnit;
            } else if (currentUnit != null && !unit.equals(currentUnit)) {
                unit = null;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        if (hasTotal) {
            result.put("total_space", total);
        }
        if (hasUsable) {
            result.put("usable_space", usable);
        }
        if (hasFree) {
            result.put("free_space", free);
        }
        if (unit != null) {
            result.put("size_unit", unit);
        }
        return result;
    }

    private Map<String, Object> raftMetrics(JsonNode root) {
        long groups = 0L;
        long enabled = 0L;
        for (JsonNode value : root) {
            groups++;
            if (value.path("enabled").asBoolean(false)) {
                enabled++;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("groups", groups);
        result.put("enabled_groups", enabled);
        return result;
    }

    private void copyMetricGroup(JsonNode root, Map<String, Object> result,
                                 String group, String... fields) {
        JsonNode values = root.path(group);
        if (!values.isObject()) {
            return;
        }
        Map<String, Object> safe = new LinkedHashMap<>();
        for (String field : fields) {
            JsonNode value = values.get(field);
            if (value != null && value.isValueNode() && !value.isNull()) {
                safe.put(field, value.isNumber() ? value.numberValue() :
                                value.asText());
            }
        }
        if (!safe.isEmpty()) {
            result.put(group, safe);
        }
    }

    private static String host(String address) {
        try {
            URI uri = URI.create(address.contains("://") ? address :
                                 "tcp://" + address);
            return uri.getHost() == null ? null :
                   uri.getHost().toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Double prometheusValue(String line) {
        int split = line.lastIndexOf(' ');
        if (split < 0 || split == line.length() - 1) {
            return null;
        }
        try {
            double value = Double.parseDouble(line.substring(split + 1));
            return Double.isFinite(value) ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void putLong(Map<String, Long> target, String key, JsonNode value) {
        Long number = this.longValue(value);
        if (number != null) {
            target.put(key, number);
        }
    }

    private void putKilobytesAsBytes(Map<String, Long> target, String key,
                                     JsonNode value) {
        Long kilobytes = this.longValue(value);
        if (kilobytes == null || kilobytes < 0L) {
            return;
        }
        try {
            target.put(key, Math.multiplyExact(kilobytes, 1024L));
        } catch (ArithmeticException ignored) {
            // An overflowing upstream value is unavailable, never a fake size.
        }
    }

    private void putCapacityFacts(Map<String, Long> target,
                                  Iterable<JsonNode> stores) {
        long total = 0L;
        long available = 0L;
        boolean found = false;
        try {
            for (JsonNode store : stores) {
                Long storeTotal = this.longValue(store.get("capacity"));
                Long storeAvailable = this.longValue(store.get("available"));
                if (storeTotal == null || storeAvailable == null ||
                    storeTotal < 0L || storeAvailable < 0L ||
                    storeAvailable > storeTotal) {
                    return;
                }
                total = Math.addExact(total, storeTotal);
                available = Math.addExact(available, storeAvailable);
                found = true;
            }
            if (found) {
                target.put("capacity_total_bytes", total);
                target.put("capacity_used_bytes",
                           Math.subtractExact(total, available));
            }
        } catch (ArithmeticException ignored) {
            // Partial or overflowing capacity is less useful than unavailable.
        }
    }

    private void putMetric(Map<String, Object> target, String key,
                           JsonNode value) {
        Long number = this.longValue(value);
        if (number != null) {
            target.put(key, number);
        }
    }

    private Long longValue(JsonNode value) {
        if (value == null || value.isNull() || !value.canConvertToLong()) {
            return null;
        }
        return value.longValue();
    }

    private String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = this.text(node, field);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual()) {
            throw new MalformedUpstreamException("upstream_field_" + field);
        }
        String text = value.asText().trim();
        return text.isEmpty() ? null : text;
    }

    private String identity(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        if (!value.isTextual() && !value.isIntegralNumber()) {
            throw new MalformedUpstreamException("upstream_field_" + field);
        }
        String identity = value.asText().trim();
        return identity.isEmpty() ? null : identity;
    }

    private JsonNode requiredArray(JsonNode parent, String field,
                                   String source) {
        JsonNode value = parent.get(field);
        if (value == null || !value.isArray()) {
            throw new MalformedUpstreamException(source);
        }
        return value;
    }

    private void requireObject(JsonNode value, String source) {
        if (value == null || !value.isObject()) {
            throw new MalformedUpstreamException(source);
        }
    }

    private static int severity(String status) {
        switch (status) {
            case "DOWN":
                return 3;
            case "DEGRADED":
                return 2;
            case "UNKNOWN":
                return 1;
            default:
                return 0;
        }
    }

    private String dataStatus(String state) {
        if (state == null) {
            return "UP";
        }
        switch (state.toUpperCase(Locale.ROOT)) {
            case "PSTATE_NORMAL":
                return "UP";
            case "PSTATE_FAULT":
                return "DOWN";
            default:
                return "DEGRADED";
        }
    }

    private String dataReason(String state) {
        switch (state.toUpperCase(Locale.ROOT)) {
            case "PSTATE_WARN":
                return "data_warn";
            case "PSTATE_OFFLINE":
                return "data_offline";
            case "PSTATE_FAULT":
                return "data_fault";
            default:
                return "data_state_unknown";
        }
    }

    private String clusterStatus(String state) {
        if (state == null) {
            return "UNKNOWN";
        }
        String value = state.toUpperCase(Locale.ROOT);
        switch (value) {
            case "CLUSTER_OK":
            case "OK":
            case "UP":
                return "UP";
            case "CLUSTER_WARN":
            case "CLUSTER_NOT_READY":
            case "CLUSTER_OFFLINE":
            case "WARN":
            case "WARNING":
            case "DEGRADED":
            case "NOT_READY":
            case "OFFLINE":
                return "DEGRADED";
            case "CLUSTER_FAULT":
            case "FAULT":
            case "DOWN":
                return "DOWN";
            default:
                return "UNKNOWN";
        }
    }

    private String clusterReason(String state) {
        if (state == null) {
            return "cluster_state_missing";
        }
        String value = state.toUpperCase(Locale.ROOT);
        switch (value) {
            case "CLUSTER_OK":
            case "OK":
            case "UP":
                return null;
            case "CLUSTER_WARN":
            case "WARN":
            case "WARNING":
            case "DEGRADED":
                return "cluster_warn";
            case "CLUSTER_NOT_READY":
            case "NOT_READY":
                return "cluster_not_ready";
            case "CLUSTER_OFFLINE":
            case "OFFLINE":
                return "cluster_offline";
            case "CLUSTER_FAULT":
            case "FAULT":
            case "DOWN":
                return "cluster_fault";
            default:
                return "cluster_state_unknown";
        }
    }

    private String health(String state) {
        if (state == null) {
            return "UNKNOWN";
        }
        String value = state.toUpperCase(Locale.ROOT);
        if (value.equals("UP") || value.equals("ONLINE") ||
            value.equals("OK")) {
            return "UP";
        }
        if (value.equals("DOWN") || value.equals("OFFLINE") ||
            value.equals("EXITING") || value.equals("TOMBSTONE")) {
            return "DOWN";
        }
        return "UNKNOWN";
    }

    private String role(String role) {
        return role == null ? null : role.toUpperCase(Locale.ROOT);
    }

    private String stableId(String type, String identity) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] value = digest.digest((type + ':' + identity)
                                         .getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(type).append('-');
            for (int i = 0; i < 6; i++) {
                result.append(String.format("%02x", value[i]));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private String shortId(String id) {
        return id.substring(id.indexOf('-') + 1, id.indexOf('-') + 7);
    }
}
