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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.service.op.OperationsModels.Snapshot;
import org.apache.hugegraph.service.op.OperationsModels.SourceStatus;

@Service
public class DefaultOperationsDataService implements OperationsDataService {

    private final OperationsCollector collector;
    private final long ttlMillis;
    private final Clock clock;
    private final Cache<String, CacheEntry> cache;
    private final Map<String, CompletableFuture<Snapshot>> inFlight;

    @Autowired
    public DefaultOperationsDataService(OperationsCollector collector,
                                        HugeConfig config) {
        this(collector, config.get(HubbleOptions.OPERATIONS_CACHE_TTL),
             config.get(HubbleOptions.OPERATIONS_CACHE_MAX_ENTRIES),
             Clock.systemUTC());
    }

    DefaultOperationsDataService(OperationsCollector collector, int ttlSeconds,
                                 Clock clock) {
        this(collector, ttlSeconds,
             HubbleOptions.OPERATIONS_CACHE_MAX_ENTRIES.defaultValue(), clock);
    }

    DefaultOperationsDataService(OperationsCollector collector, int ttlSeconds,
                                 int maxEntries, Clock clock) {
        this.collector = collector;
        this.ttlMillis = ttlSeconds * 1000L;
        this.clock = clock;
        this.cache = CacheBuilder.newBuilder()
                                 .maximumSize(maxEntries)
                                 .build();
        this.inFlight = new ConcurrentHashMap<>();
    }

    @Override
    public Map<String, Object> overview(HugeClient client,
                                        Set<String> capabilities,
                                        boolean refresh) {
        Snapshot snapshot = this.snapshot(client, capabilities, refresh);
        boolean topology = capabilities.contains(
                           OperationsCapabilityService.TOPOLOGY_READ);
        return this.overview(snapshot, topology);
    }

    @Override
    public Map<String, Object> nodes(HugeClient client,
                                     Set<String> capabilities,
                                     String type, String status, String query,
                                     int page, int pageSize, String sort,
                                     String order) {
        Snapshot snapshot = this.snapshot(client, capabilities, false);
        String normalizedType = normalize(type);
        String normalizedStatus = normalize(status);
        String normalizedQuery = normalize(query);
        List<Node> filtered = snapshot.getNodes().stream()
                .filter(node -> normalizedType == null ||
                                normalizedType.equals(node.getType()))
                .filter(node -> normalizedStatus == null ||
                                normalizedStatus.equals(node.getStatus()))
                .filter(node -> normalizedQuery == null ||
                                node.getName().toUpperCase(Locale.ROOT)
                                    .contains(normalizedQuery))
                .sorted(this.nodeComparator(sort, order))
                .collect(Collectors.toList());
        long requestedFrom = (long) (page - 1) * pageSize;
        int from = (int) Math.min(requestedFrom, filtered.size());
        int to = Math.min(from + pageSize, filtered.size());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", new ArrayList<>(filtered.subList(from, to)));
        result.put("total", filtered.size());
        result.put("page", page);
        result.put("page_size", pageSize);
        result.put("observed_at", snapshot.getObservedAt());
        result.put("stale", snapshot.isStale());
        return result;
    }

    private Comparator<Node> nodeComparator(String sort, String order) {
        Comparator<String> strings = Comparator.nullsLast(
                                     String.CASE_INSENSITIVE_ORDER);
        Comparator<Long> numbers = Comparator.nullsLast(Long::compareTo);
        Comparator<Node> comparator;
        switch (sort) {
            case "type":
                comparator = Comparator.comparing(Node::getType, strings);
                break;
            case "status":
                comparator = Comparator.comparing(Node::getStatus, strings);
                break;
            case "observed_at":
                comparator = Comparator.comparing(Node::getObservedAt,
                                                  numbers);
                break;
            case "name":
            default:
                comparator = Comparator.comparing(Node::getName, strings);
                break;
        }
        if ("desc".equals(order)) {
            comparator = comparator.reversed();
        }
        return comparator.thenComparing(Node::getId, strings);
    }

    @Override
    public Map<String, Object> node(HugeClient client,
                                    Set<String> capabilities,
                                    String nodeId, boolean refresh) {
        Snapshot snapshot = this.snapshot(client, capabilities, refresh);
        Node found = snapshot.getNodes().stream()
                .filter(node -> node.getId().equals(nodeId))
                .findFirst().orElseThrow(OperationsNodeNotFoundException::new);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("node", found);
        result.put("sources", snapshot.getSources());
        result.put("observed_at", snapshot.getObservedAt());
        result.put("stale", snapshot.isStale());
        return result;
    }

    private Snapshot snapshot(HugeClient client, Set<String> capabilities,
                              boolean refresh) {
        boolean includeMetrics = capabilities.contains(
                                 OperationsCapabilityService.METRICS_READ);
        String key = this.cacheKey(client.getAuthContext(), includeMetrics);
        long now = this.clock.millis();
        CacheEntry current = this.cache.getIfPresent(key);
        if (!refresh && current != null && now - current.createdAt <
            this.ttlMillis) {
            return current.snapshot;
        }
        CompletableFuture<Snapshot> future = new CompletableFuture<>();
        CompletableFuture<Snapshot> existing = this.inFlight.putIfAbsent(key,
                                                                          future);
        if (existing != null) {
            return await(existing);
        }
        try {
            current = this.cache.getIfPresent(key);
            now = this.clock.millis();
            if (!refresh && current != null && now - current.createdAt <
                this.ttlMillis) {
                future.complete(current.snapshot);
                return current.snapshot;
            }
            Snapshot collected = this.collector.collect(client, includeMetrics);
            if (current != null) {
                collected = this.mergeFailedSources(collected, current.snapshot);
            }
            this.cache.put(key, new CacheEntry(collected, now));
            future.complete(collected);
            return collected;
        } catch (RuntimeException e) {
            if (current != null) {
                Snapshot stale = current.snapshot.stale("refresh_failed");
                this.cache.put(key, new CacheEntry(stale, now));
                future.complete(stale);
                return stale;
            }
            future.completeExceptionally(e);
            throw e;
        } finally {
            this.inFlight.remove(key, future);
        }
    }

    private static Snapshot await(CompletableFuture<Snapshot> future) {
        try {
            return future.join();
        } catch (CompletionException e) {
            if (e.getCause() instanceof RuntimeException) {
                throw (RuntimeException) e.getCause();
            }
            throw e;
        }
    }

    private Snapshot mergeFailedSources(Snapshot current, Snapshot previous) {
        Map<String, SourceStatus> sources = new LinkedHashMap<>(
                                                   current.getSources());
        List<Node> nodes = new ArrayList<>(current.getNodes());
        Map<String, Long> facts = new LinkedHashMap<>(current.getFacts());
        boolean stale = false;
        for (Map.Entry<String, SourceStatus> entry : sources.entrySet()) {
            String sourceName = entry.getKey();
            SourceStatus source = entry.getValue();
            SourceStatus old = previous.getSources().get(sourceName);
            if ("PARTIAL".equals(source.getAvailability())) {
                String nodeType = nodeType(sourceName);
                boolean groupStale = nodeType != null &&
                                     this.mergeFailedMetricGroups(
                                     nodes, previous.getNodes(), nodeType);
                if (groupStale) {
                    stale = true;
                    sources.put(sourceName, new SourceStatus(
                                source.getAvailability(), source.getStatus(),
                                source.getObservedAt(), source.getLastSuccessAt(),
                                false, true, source.getReason()));
                }
                continue;
            }
            if (!failed(source) || old == null ||
                old.getLastSuccessAt() == null) {
                continue;
            }
            stale = true;
            sources.put(sourceName, new SourceStatus(
                    source.getAvailability(), old.getStatus(),
                    source.getObservedAt(), old.getLastSuccessAt(), false,
                    true, source.getReason()));
            String nodeType = nodeType(sourceName);
            if (nodeType != null) {
                nodes.removeIf(node -> nodeType.equals(node.getType()));
                previous.getNodes().stream()
                        .filter(node -> nodeType.equals(node.getType()))
                        .map(node -> staleNode(node, source))
                        .forEach(nodes::add);
            }
            if ("pd".equals(sourceName)) {
                facts.clear();
                facts.putAll(previous.getFacts());
            }
        }
        if (!stale) {
            return current;
        }
        String status = "DOWN".equals(current.getStatus()) ? "DOWN" :
                        "DEGRADED";
        return new Snapshot(status, current.getObservedAt(), true,
                            "partial_refresh_failed", sources, nodes, facts);
    }

    private boolean mergeFailedMetricGroups(List<Node> current,
                                            List<Node> previous,
                                            String nodeType) {
        boolean stale = false;
        for (int i = 0; i < current.size(); i++) {
            Node node = current.get(i);
            if (!nodeType.equals(node.getType())) {
                continue;
            }
            Node old = previous.stream()
                    .filter(candidate -> candidate.getId().equals(node.getId()))
                    .findFirst().orElse(null);
            if (old == null) {
                continue;
            }
            Map<String, Object> metrics = new LinkedHashMap<>(node.getMetrics());
            Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                                   node.getMetricStatuses());
            boolean nodeStale = false;
            for (Map.Entry<String, MetricStatus> statusEntry :
                 node.getMetricStatuses().entrySet()) {
                String group = statusEntry.getKey();
                MetricStatus status = statusEntry.getValue();
                MetricStatus oldStatus = old.getMetricStatuses().get(group);
                if (!metricFailed(status) || oldStatus == null ||
                    oldStatus.getLastSuccessAt() == null ||
                    !old.getMetrics().containsKey(group)) {
                    continue;
                }
                metrics.put(group, old.getMetrics().get(group));
                statuses.put(group, new MetricStatus(
                             status.getAvailability(), status.getObservedAt(),
                             oldStatus.getLastSuccessAt(), false, true,
                             status.getReason()));
                nodeStale = true;
            }
            if (nodeStale) {
                current.set(i, copyNode(node, metrics, statuses));
                stale = true;
            }
        }
        return stale;
    }

    private static boolean metricFailed(MetricStatus status) {
        return "UNAVAILABLE".equals(status.getAvailability()) ||
               "MALFORMED".equals(status.getAvailability());
    }

    private static Node staleNode(Node node, SourceStatus source) {
        Map<String, MetricStatus> statuses = new LinkedHashMap<>();
        node.getMetricStatuses().forEach((group, status) -> {
            MetricStatus staleStatus = status.getLastSuccessAt() == null ?
                    status : new MetricStatus(
                    source.getAvailability(), source.getObservedAt(),
                    status.getLastSuccessAt(), false, true, source.getReason());
            statuses.put(group, staleStatus);
        });
        return copyNode(node, node.getMetrics(), statuses);
    }

    private static Node copyNode(Node node, Map<String, Object> metrics,
                                 Map<String, MetricStatus> statuses) {
        return new Node(node.getId(), node.getType(), node.getName(),
                        node.getRole(), node.getVersion(), node.getStatus(),
                        node.getObservedAt(), metrics, statuses);
    }

    private static boolean failed(SourceStatus source) {
        return "UNAVAILABLE".equals(source.getAvailability()) ||
               "MALFORMED".equals(source.getAvailability());
    }

    private static String nodeType(String source) {
        if ("server".equals(source)) {
            return "SERVER";
        }
        if ("pd".equals(source)) {
            return "PD";
        }
        if ("stores".equals(source)) {
            return "STORE";
        }
        return null;
    }

    private Map<String, Object> overview(Snapshot snapshot, boolean topology) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", snapshot.getStatus());
        result.put("observed_at", snapshot.getObservedAt());
        result.put("stale", snapshot.isStale());
        result.put("reason", snapshot.getReason());
        result.put("sources", snapshot.getSources());
        if (topology) {
            result.put("nodes", snapshot.getNodes());
            result.put("facts", snapshot.getFacts());
        }
        return result;
    }

    private String cacheKey(String credential, boolean metrics) {
        String secret = credential == null ? "" : credential;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(secret.getBytes(StandardCharsets.UTF_8));
            StringBuilder key = new StringBuilder(metrics ? "m:" : "h:");
            for (int i = 0; i < 12; i++) {
                key.append(String.format("%02x", bytes[i]));
            }
            return key.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static String normalize(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private static final class CacheEntry {

        private final Snapshot snapshot;
        private final long createdAt;

        private CacheEntry(Snapshot snapshot, long createdAt) {
            this.snapshot = snapshot;
            this.createdAt = createdAt;
        }
    }
}
