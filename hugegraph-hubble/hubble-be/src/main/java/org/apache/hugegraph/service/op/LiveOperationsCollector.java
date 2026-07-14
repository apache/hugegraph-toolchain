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

import javax.annotation.PreDestroy;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.service.op.OperationsModels.Snapshot;
import org.apache.hugegraph.service.op.OperationsModels.SourceStatus;
import org.apache.hugegraph.service.op.OperationsModels.Topology;

@Service
public class LiveOperationsCollector implements OperationsCollector {

    private static final String EMPTY_CLUSTER =
            "{\"status\":0,\"data\":{\"pdList\":[],\"stores\":[]}}";
    private static final String EMPTY_STORES =
            "{\"status\":0,\"data\":{\"stores\":[]}}";
    private static final List<String> STORE_METRIC_GROUPS =
            Arrays.asList("system", "drive", "raft");
    private static final AtomicInteger THREAD_SEQUENCE = new AtomicInteger();

    private final boolean pdEnabled;
    private final String pdBase;
    private final String pdUsername;
    private final String pdPassword;
    private final String storeUsername;
    private final String storePassword;
    private final String serverIdentity;
    private final OperationsHttpClient http;
    private final OperationsPayloadParser parser;
    private final Clock clock;
    private final ExecutorService storeExecutor;
    private final int storeDeadlineMillis;
    private final Set<String> storeAllowedTargets;

    @Autowired
    public LiveOperationsCollector(HugeConfig config, ObjectMapper mapper) {
        this(config.get(HubbleOptions.PD_ENABLED),
             pdBase(config.get(HubbleOptions.SERVER_PROTOCOL),
                    config.get(HubbleOptions.PD_SERVER)),
             config.get(HubbleOptions.OPERATIONS_PD_USERNAME),
             config.get(HubbleOptions.OPERATIONS_PD_PASSWORD),
             config.get(HubbleOptions.OPERATIONS_STORE_USERNAME),
             config.get(HubbleOptions.OPERATIONS_STORE_PASSWORD),
             config.get(HubbleOptions.PD_ENABLED) ?
             "pd-discovered-server" : config.get(HubbleOptions.SERVER_URL),
             new OperationsHttpClient(
                     config.get(HubbleOptions.OPERATIONS_CONNECT_TIMEOUT),
                     config.get(HubbleOptions.OPERATIONS_READ_TIMEOUT),
                     config.get(HubbleOptions.OPERATIONS_MAX_RESPONSE_BYTES)),
             new OperationsPayloadParser(mapper), Clock.systemUTC(),
             config.get(HubbleOptions.OPERATIONS_STORE_THREADS),
             config.get(HubbleOptions.OPERATIONS_STORE_DEADLINE),
             new java.util.LinkedHashSet<>(config.get(
                     HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS)));
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock) {
        this(pdEnabled, pdBase, pdUsername, pdPassword, storeUsername,
             storePassword, serverIdentity, http, parser, clock, 16, 5000,
             defaultStoreAllowedTargets());
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock,
                            int storeThreads, int storeDeadlineMillis) {
        this(pdEnabled, pdBase, pdUsername, pdPassword, storeUsername,
             storePassword, serverIdentity, http, parser, clock, storeThreads,
             storeDeadlineMillis, defaultStoreAllowedTargets());
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock,
                            int storeThreads, int storeDeadlineMillis,
                            Set<String> storeAllowedTargets) {
        if (storeThreads <= 0 || storeDeadlineMillis <= 0) {
            throw new IllegalArgumentException(
                      "Store metric collection limits must be positive");
        }
        this.pdEnabled = pdEnabled;
        this.pdBase = pdBase;
        this.pdUsername = pdUsername;
        this.pdPassword = pdPassword;
        this.storeUsername = storeUsername;
        this.storePassword = storePassword;
        this.serverIdentity = serverIdentity;
        this.http = http;
        this.parser = parser;
        this.clock = clock;
        this.storeDeadlineMillis = storeDeadlineMillis;
        if (storeAllowedTargets == null || storeAllowedTargets.isEmpty()) {
            throw new IllegalArgumentException(
                      "Store metric allowed targets must not be empty");
        }
        this.storeAllowedTargets = storeAllowedTargets.stream()
                .map(URI::create)
                .map(OperationsHttpClient::origin)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        this.storeExecutor = Executors.newFixedThreadPool(
                storeThreads, runnable -> {
                    Thread thread = new Thread(
                            runnable, "hubble-store-metrics-" +
                                      THREAD_SEQUENCE.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
    }

    @PreDestroy
    public void close() {
        this.storeExecutor.shutdownNow();
        try {
            this.storeExecutor.awaitTermination(1L, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public Snapshot collect(HugeClient client, boolean includeMetrics) {
        long now = this.clock.millis();
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        List<Node> nodes = new ArrayList<>();
        Map<String, Long> facts = new LinkedHashMap<>();
        this.collectServer(client, includeMetrics, now, sources, nodes);
        if (this.pdEnabled) {
            this.collectPd(includeMetrics, now, sources, nodes, facts);
        } else {
            sources.put("pd", unsupported());
            sources.put("stores", unsupported());
        }
        return new Snapshot(this.overallStatus(sources), now, false, null,
                            sources, nodes, facts);
    }

    private void collectServer(HugeClient client, boolean includeMetrics,
                               long now, Map<String, SourceStatus> sources,
                               List<Node> nodes) {
        try {
            String version = client.versionManager().getCoreVersion();
            Map<String, Object> metrics = Collections.emptyMap();
            Map<String, MetricStatus> metricStatuses = Collections.emptyMap();
            String availability = "AVAILABLE";
            String reason = null;
            if (includeMetrics) {
                metrics = new LinkedHashMap<>();
                metricStatuses = new LinkedHashMap<>();
                try {
                    Map<String, Object> system = this.safeSystemMetrics(
                                                 client.metrics().system());
                    metrics.put("system", system);
                    metricStatuses.put("system", availableMetric(now));
                } catch (RuntimeException e) {
                    availability = "PARTIAL";
                    reason = metricReason(e);
                    metricStatuses.put("system", metricStatus(e, now, false));
                }
                try {
                    metrics.put("backend", this.safeBackendMetrics(
                                client.metrics().backend()));
                    metricStatuses.put("backend", availableMetric(now));
                } catch (RuntimeException e) {
                    availability = "PARTIAL";
                    reason = mergeReason(reason, metricReason(e));
                    metricStatuses.put("backend", metricStatus(e, now, false));
                }
            }
            String id = stableId("server", this.serverIdentity);
            nodes.add(new Node(id, "SERVER", "HugeGraph Server", null,
                               version, "UP", now, metrics, metricStatuses));
            sources.put("server", new SourceStatus(availability, "UP", now,
                                                    now, true, false, reason));
        } catch (RuntimeException e) {
            sources.put("server", unavailable("upstream_unavailable", now));
        }
    }

    private void collectPd(boolean includeMetrics, long now,
                           Map<String, SourceStatus> sources,
                           List<Node> nodes, Map<String, Long> facts) {
        String cluster = null;
        String stores = null;
        SourceStatus pdStatus;
        SourceStatus storesStatus;
        try {
            cluster = this.get("/v1/cluster");
            pdStatus = available("UP", now);
        } catch (RuntimeException e) {
            pdStatus = unavailable(reason(e), now);
        }
        try {
            stores = this.get("/v1/stores");
            storesStatus = available("UP", now);
        } catch (RuntimeException e) {
            storesStatus = unavailable(reason(e), now);
        }
        boolean clusterParsed = false;
        boolean storesParsed = false;
        if (cluster != null) {
            try {
                Topology topology = this.parser.parseTopology(cluster,
                                                              EMPTY_STORES,
                                                              now);
                this.mergeNodes(nodes, topology.getNodes());
                facts.putAll(topology.getFacts());
                pdStatus = available(topology.getStatus(), now);
                clusterParsed = true;
            } catch (MalformedUpstreamException e) {
                pdStatus = malformed(now);
            }
        }
        if (stores != null) {
            try {
                Topology topology = this.parser.parseTopology(EMPTY_CLUSTER,
                                                              stores, now);
                this.mergeNodes(nodes, topology.getNodes());
                storesParsed = true;
            } catch (MalformedUpstreamException e) {
                storesStatus = malformed(now);
            }
        }
        if (includeMetrics && clusterParsed) {
            pdStatus = this.collectPdMetrics(now, pdStatus, nodes);
        }
        if (includeMetrics && storesParsed) {
            storesStatus = this.collectStoreMetrics(stores, now, storesStatus,
                                                     nodes);
        } else if (includeMetrics) {
            this.applyStoreMetricStatus(nodes, this.metricStatus(storesStatus,
                                                                 now));
        }
        sources.put("pd", pdStatus);
        sources.put("stores", storesStatus);
    }

    private void mergeNodes(List<Node> nodes, List<Node> additions) {
        for (Node addition : additions) {
            int existingIndex = -1;
            for (int i = 0; i < nodes.size(); i++) {
                if (nodes.get(i).getId().equals(addition.getId())) {
                    existingIndex = i;
                    break;
                }
            }
            if (existingIndex < 0) {
                nodes.add(addition);
                continue;
            }
            Node existing = nodes.get(existingIndex);
            Map<String, Object> metrics = new LinkedHashMap<>(
                                                  existing.getMetrics());
            metrics.putAll(addition.getMetrics());
            Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                           existing.getMetricStatuses());
            addition.getMetricStatuses().forEach((group, metricStatus) -> {
                if (!addition.getMetrics().containsKey(group) &&
                    existing.getMetrics().containsKey(group)) {
                    return;
                }
                statuses.put(group, metricStatus);
            });
            String version = addition.getVersion() == null ?
                             existing.getVersion() : addition.getVersion();
            String nodeStatus = "UNKNOWN".equals(addition.getStatus()) ?
                                existing.getStatus() : addition.getStatus();
            nodes.set(existingIndex, new Node(
                      addition.getId(), addition.getType(), addition.getName(),
                      addition.getRole(), version, nodeStatus,
                      addition.getObservedAt(), metrics, statuses));
        }
    }

    private SourceStatus collectPdMetrics(long now, SourceStatus status,
                                          List<Node> nodes) {
        int index = this.pdNodeIndex(nodes);
        if (index < 0) {
            return new SourceStatus("PARTIAL", status.getStatus(), now,
                                    status.getLastSuccessAt(), false, false,
                                    "pd_metrics_unmapped");
        }
        Map<String, Object> system = null;
        MetricStatus selectedStatus;
        String failureReason = null;
        try {
            system = this.parser.parsePdPrometheusMetrics(
                    this.http.get(URI.create(this.pdBase +
                                             "/actuator/prometheus"),
                                  this.pdUsername, this.pdPassword,
                                  Collections.emptySet(), "text/plain"));
            selectedStatus = availableMetric(now);
        } catch (RuntimeException e) {
            selectedStatus = metricStatus(e, now, true);
            failureReason = selectedStatus.getReason();
        }
        for (int i = 0; i < nodes.size(); i++) {
            Node node = nodes.get(i);
            if (!"PD".equals(node.getType())) {
                continue;
            }
            Map<String, Object> metrics = new LinkedHashMap<>(node.getMetrics());
            Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                                   node.getMetricStatuses());
            if (i == index) {
                if (system != null) {
                    metrics.put("system", system);
                }
                statuses.put("system", selectedStatus);
            } else {
                statuses.put("system", unsupportedMetric(
                             now, "metrics_not_collected"));
            }
            nodes.set(i, new Node(node.getId(), node.getType(), node.getName(),
                                  node.getRole(), node.getVersion(),
                                  node.getStatus(), node.getObservedAt(), metrics,
                                  statuses));
        }
        if (failureReason != null) {
            return new SourceStatus("PARTIAL", status.getStatus(), now,
                                    status.getLastSuccessAt(), false, false,
                                    failureReason);
        }
        return status;
    }

    private int pdNodeIndex(List<Node> nodes) {
        String configuredId = stableId("pd", this.pdBase);
        int first = -1;
        for (int i = 0; i < nodes.size(); i++) {
            Node node = nodes.get(i);
            if (!"PD".equals(node.getType())) {
                continue;
            }
            if (configuredId.equals(node.getId())) {
                return i;
            }
            if ("LEADER".equals(node.getRole())) {
                first = i;
            } else if (first < 0) {
                first = i;
            }
        }
        return first;
    }

    private SourceStatus collectStoreMetrics(String stores, long now,
                                             SourceStatus status,
                                             List<Node> nodes) {
        try {
            Map<String, String> restAddresses =
                    this.parser.parseStoreRestAddresses(stores);
            Map<String, URI> targets = this.parser.parseStoreMetricTargets(
                                       this.get("/v1/prom/targets-all"));
            Set<String> allowedTargets = new java.util.LinkedHashSet<>();
            boolean partial = false;
            int successfulGroups = 0;
            String failureReason = null;
            List<StoreMetricJob> jobs = new ArrayList<>();
            for (int i = 0; i < nodes.size(); i++) {
                Node node = nodes.get(i);
                if (!"STORE".equals(node.getType())) {
                    continue;
                }
                StoreTarget target = storeTarget(node.getId(), restAddresses,
                                                 targets,
                                                 this.storeAllowedTargets);
                if (target.getUri() == null) {
                    partial = true;
                    failureReason = mergeReason(failureReason,
                                                target.getReason());
                    Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                                   node.getMetricStatuses());
                    for (String group : STORE_METRIC_GROUPS) {
                        statuses.put(group, unavailableMetric(
                                     now, target.getReason()));
                    }
                    nodes.set(i, copyNode(node, node.getMetrics(), statuses));
                    continue;
                }
                allowedTargets.add(OperationsHttpClient.origin(
                                   target.getUri()));
                jobs.add(new StoreMetricJob(i, node, target.getUri()));
            }
            if (allowedTargets.isEmpty()) {
                allowedTargets.add("no_trusted_store_target");
            }
            List<Future<StoreMetricResult>> futures = this.storeExecutor.invokeAll(
                    jobs.stream().map(job -> (java.util.concurrent.Callable<
                            StoreMetricResult>) () -> this.collectStoreMetric(
                                    job, allowedTargets, now))
                        .collect(Collectors.toList()),
                    this.storeDeadlineMillis, TimeUnit.MILLISECONDS);
            for (int i = 0; i < jobs.size(); i++) {
                StoreMetricJob job = jobs.get(i);
                StoreMetricResult result;
                try {
                    result = futures.get(i).get();
                } catch (CancellationException e) {
                    result = StoreMetricResult.failure(job,
                                                       "upstream_deadline", now);
                } catch (ExecutionException e) {
                    result = StoreMetricResult.failure(
                             job, "upstream_unavailable", now);
                }
                nodes.set(job.getNodeIndex(), result.getNode());
                successfulGroups += result.getSuccessfulGroups();
                if (result.getFailureReason() != null) {
                    partial = true;
                    failureReason = mergeReason(failureReason,
                                                result.getFailureReason());
                }
            }
            if (partial) {
                return metricFailureStatus(status, now, successfulGroups,
                                           failureReason);
            }
            return status;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            this.applyStoreMetricStatus(nodes,
                    unavailableMetric(now, "upstream_interrupted"));
            return metricFailureStatus(status, now, 0,
                                       "upstream_interrupted");
        } catch (RuntimeException e) {
            this.applyStoreFailureStatuses(nodes, now, e);
            return metricFailureStatus(status, now, 0, metricReason(e));
        }
    }

    private StoreMetricResult collectStoreMetric(StoreMetricJob job,
                                                  Set<String> allowedTargets,
                                                  long now) {
        Map<String, Object> metrics = new LinkedHashMap<>(
                                                job.getNode().getMetrics());
        Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                           job.getNode().getMetricStatuses());
        int successfulGroups = 0;
        String failureReason = null;
        for (String group : STORE_METRIC_GROUPS) {
            if (Thread.currentThread().isInterrupted()) {
                failureReason = mergeReason(failureReason,
                                            "upstream_deadline");
                statuses.put(group, unavailableMetric(now,
                                                      "upstream_deadline"));
                continue;
            }
            try {
                URI endpoint = job.getTarget().resolve("/metrics/" + group);
                String payload = this.http.get(endpoint, this.storeUsername,
                                               this.storePassword,
                                               allowedTargets);
                metrics.put(group, this.parser.parseStoreMetrics(group, payload));
                statuses.put(group, availableMetric(now));
                successfulGroups++;
            } catch (RuntimeException e) {
                failureReason = mergeReason(failureReason, metricReason(e));
                statuses.put(group, metricStatus(e, now, true));
            }
        }
        return new StoreMetricResult(copyNode(job.getNode(), metrics, statuses),
                                     successfulGroups, failureReason);
    }

    private static StoreTarget storeTarget(String nodeId,
                                           Map<String, String> restAddresses,
                                           Map<String, URI> targets,
                                           Set<String> allowedTargets) {
        String restAddress = restAddresses.get(nodeId);
        if (restAddress != null) {
            URI exact = targets.get(restAddress);
            if (exact != null && !allowedTargets.contains(
                    OperationsHttpClient.origin(exact))) {
                return new StoreTarget(null, "metrics_target_untrusted");
            }
            return exact == null ?
                   new StoreTarget(null, "metrics_target_missing") :
                   new StoreTarget(exact, null);
        }
        return new StoreTarget(null, "metrics_target_missing");
    }

    private static Set<String> defaultStoreAllowedTargets() {
        return new java.util.LinkedHashSet<>(Arrays.asList(
               "http://127.0.0.1:8520", "http://[::1]:8520"));
    }

    private void applyStoreFailureStatuses(List<Node> nodes, long now,
                                           RuntimeException error) {
        this.applyStoreMetricStatus(nodes, metricStatus(error, now, true));
    }

    private void applyStoreMetricStatus(List<Node> nodes,
                                        MetricStatus failure) {
        for (int i = 0; i < nodes.size(); i++) {
            Node node = nodes.get(i);
            if (!"STORE".equals(node.getType())) {
                continue;
            }
            Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                                   node.getMetricStatuses());
            for (String group : STORE_METRIC_GROUPS) {
                statuses.put(group, failure);
            }
            nodes.set(i, copyNode(node, node.getMetrics(), statuses));
        }
    }

    private MetricStatus metricStatus(SourceStatus source, long now) {
        if ("MALFORMED".equals(source.getAvailability())) {
            return new MetricStatus("MALFORMED", now, null, false, false,
                                    source.getReason());
        }
        if ("UNSUPPORTED".equals(source.getAvailability())) {
            return unsupportedMetric(now, source.getReason());
        }
        return unavailableMetric(now, source.getReason());
    }

    private static SourceStatus metricFailureStatus(SourceStatus status,
                                                    long now,
                                                    int successfulGroups,
                                                    String failureReason) {
        String availability = successfulGroups == 0 &&
                              "unsupported_version".equals(failureReason) ?
                              "UNSUPPORTED" : "PARTIAL";
        return new SourceStatus(availability, status.getStatus(), now,
                                status.getLastSuccessAt(), false, false,
                                failureReason == null ?
                                "store_metrics_partial" : failureReason);
    }

    private static String mergeReason(String current, String addition) {
        if (current == null || current.equals(addition)) {
            return addition;
        }
        return "store_metrics_partial";
    }

    private static String metricReason(RuntimeException error) {
        if (error instanceof UpstreamRequestException &&
            "upstream_http_status_404".equals(error.getMessage())) {
            return "unsupported_version";
        }
        return reason(error);
    }

    private static MetricStatus metricStatus(RuntimeException error, long now,
                                             boolean versionedEndpoint) {
        String reason = metricReason(error);
        if (versionedEndpoint && "unsupported_version".equals(reason)) {
            return unsupportedMetric(now, reason);
        }
        if (error instanceof MalformedUpstreamException) {
            return new MetricStatus("MALFORMED", now, null, false, false,
                                    reason);
        }
        return unavailableMetric(now, reason);
    }

    private static MetricStatus availableMetric(long now) {
        return new MetricStatus("AVAILABLE", now, now, true, false, null);
    }

    private static MetricStatus unavailableMetric(long now, String reason) {
        return new MetricStatus("UNAVAILABLE", now, null, false, false, reason);
    }

    private static MetricStatus unsupportedMetric(long now, String reason) {
        return new MetricStatus("UNSUPPORTED", now, null, false, false, reason);
    }

    private static Node copyNode(Node node, Map<String, Object> metrics,
                                 Map<String, MetricStatus> statuses) {
        return new Node(node.getId(), node.getType(), node.getName(),
                        node.getRole(), node.getVersion(), node.getStatus(),
                        node.getObservedAt(), metrics, statuses);
    }

    private String get(String path) {
        URI target = URI.create(this.pdBase + path);
        return this.http.get(target, this.pdUsername, this.pdPassword);
    }

    private Map<String, Object> safeSystemMetrics(
            Map<String, Map<String, Object>> upstream) {
        Map<String, Object> result = new LinkedHashMap<>();
        this.copyGroup(upstream, result, "basic",
                       "mem_total", "mem_used", "processors", "uptime",
                       "systemload_average");
        this.copyGroup(upstream, result, "heap", "used", "max", "committed");
        this.copyGroup(upstream, result, "nonheap", "used", "max",
                       "committed");
        this.copyGroup(upstream, result, "thread", "count", "daemon", "peak");
        this.copyGroup(upstream, result, "garbage_collector",
                       "g1_young_generation_count",
                       "g1_young_generation_time",
                       "g1_old_generation_count",
                       "g1_old_generation_time", "time_unit");
        return result;
    }

    private Map<String, Object> safeBackendMetrics(
            Map<String, Map<String, Object>> upstream) {
        long graphs = 0L;
        long nodes = 0L;
        Map<String, Long> backends = new LinkedHashMap<>();
        if (upstream != null) {
            for (Map<String, Object> graph : upstream.values()) {
                if (graph == null) {
                    continue;
                }
                graphs++;
                Object nodeCount = graph.get("nodes");
                if (nodeCount instanceof Number) {
                    nodes += ((Number) nodeCount).longValue();
                }
                Object backend = graph.get("backend");
                if (backend instanceof String &&
                    !((String) backend).trim().isEmpty()) {
                    String name = ((String) backend).trim();
                    backends.put(name, backends.getOrDefault(name, 0L) + 1L);
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("graphs", graphs);
        result.put("nodes", nodes);
        result.put("backend_counts", backends);
        return result;
    }

    private void copyGroup(Map<String, Map<String, Object>> upstream,
                           Map<String, Object> target, String group,
                           String... allowedFields) {
        Map<String, Object> values = upstream == null ? null :
                                     upstream.get(group);
        if (values == null) {
            return;
        }
        Map<String, Object> safe = new LinkedHashMap<>();
        Arrays.stream(allowedFields).forEach(field -> {
            Object value = values.get(field);
            if (value instanceof Number || value instanceof Boolean ||
                value instanceof String) {
                safe.put(field, value);
            }
        });
        if (!safe.isEmpty()) {
            target.put(group, safe);
        }
    }

    private String overallStatus(Map<String, SourceStatus> sources) {
        List<SourceStatus> supported = sources.values().stream()
                .filter(source -> !"UNSUPPORTED".equals(
                                  source.getAvailability()))
                .collect(java.util.stream.Collectors.toList());
        if (!supported.isEmpty() && supported.stream().allMatch(
                                      LiveOperationsCollector::failedSource)) {
            return "DOWN";
        }
        boolean degraded = supported.stream().anyMatch(source -> {
            return !"AVAILABLE".equals(source.getAvailability()) ||
                   "DEGRADED".equals(source.getStatus()) ||
                   "DOWN".equals(source.getStatus()) ||
                   "UNKNOWN".equals(source.getStatus());
        });
        return degraded ? "DEGRADED" : "UP";
    }

    private static boolean failedSource(SourceStatus source) {
        return "UNAVAILABLE".equals(source.getAvailability()) ||
               "MALFORMED".equals(source.getAvailability()) ||
               "DOWN".equals(source.getStatus());
    }

    private static SourceStatus available(String status, long now) {
        return new SourceStatus("AVAILABLE", status, now, now, true, false,
                                null);
    }

    private static SourceStatus unavailable(String reason, long now) {
        return new SourceStatus("UNAVAILABLE", "UNKNOWN", now, null, false,
                                false, reason);
    }

    private static SourceStatus malformed(long now) {
        return new SourceStatus("MALFORMED", "UNKNOWN", now, null, false,
                                false, "malformed_response");
    }

    private static SourceStatus unsupported() {
        return new SourceStatus("UNSUPPORTED", "UNKNOWN", null, null, false,
                                false, "deployment_mode_unsupported");
    }

    private static String reason(RuntimeException error) {
        if (error instanceof UpstreamResponseTooLargeException) {
            return "response_too_large";
        }
        if (error instanceof MalformedUpstreamException) {
            return "malformed_response";
        }
        String message = error.getMessage();
        if ("upstream_timeout".equals(message)) {
            return "upstream_timeout";
        }
        if (message != null && message.startsWith("upstream_http_status_")) {
            return "upstream_rejected";
        }
        return "upstream_unavailable";
    }

    private static final class StoreTarget {

        private final URI uri;
        private final String reason;

        private StoreTarget(URI uri, String reason) {
            this.uri = uri;
            this.reason = reason;
        }

        private URI getUri() {
            return this.uri;
        }

        private String getReason() {
            return this.reason;
        }
    }

    private static final class StoreMetricJob {

        private final int nodeIndex;
        private final Node node;
        private final URI target;

        private StoreMetricJob(int nodeIndex, Node node, URI target) {
            this.nodeIndex = nodeIndex;
            this.node = node;
            this.target = target;
        }

        private int getNodeIndex() {
            return this.nodeIndex;
        }

        private Node getNode() {
            return this.node;
        }

        private URI getTarget() {
            return this.target;
        }
    }

    private static final class StoreMetricResult {

        private final Node node;
        private final int successfulGroups;
        private final String failureReason;

        private StoreMetricResult(Node node, int successfulGroups,
                                  String failureReason) {
            this.node = node;
            this.successfulGroups = successfulGroups;
            this.failureReason = failureReason;
        }

        private static StoreMetricResult failure(StoreMetricJob job,
                                                 String reason, long now) {
            Map<String, MetricStatus> statuses = new LinkedHashMap<>(
                                           job.getNode().getMetricStatuses());
            for (String group : STORE_METRIC_GROUPS) {
                statuses.put(group, unavailableMetric(now, reason));
            }
            return new StoreMetricResult(copyNode(job.getNode(),
                                                   job.getNode().getMetrics(),
                                                   statuses), 0, reason);
        }

        private Node getNode() {
            return this.node;
        }

        private int getSuccessfulGroups() {
            return this.successfulGroups;
        }

        private String getFailureReason() {
            return this.failureReason;
        }
    }

    private static String pdBase(String protocol, String server) {
        if (server == null || server.trim().isEmpty()) {
            throw new IllegalArgumentException("PD operations target is empty");
        }
        String value = server.trim();
        String base = value.contains("://") ? value : protocol + "://" + value;
        URI target = URI.create(base);
        OperationsHttpClient.validateTarget(target, Collections.emptySet());
        String normalized = target.toString();
        return normalized.endsWith("/") ?
               normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private static String stableId(String type, String identity) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    (type + ':' + identity).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(type).append('-');
            for (int i = 0; i < 6; i++) {
                result.append(String.format("%02x", digest[i]));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
