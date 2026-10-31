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

import jakarta.annotation.PreDestroy;

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
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.HugeClientPoolService;
import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.Readiness;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.service.op.OperationsModels.Snapshot;
import org.apache.hugegraph.service.op.OperationsModels.SourceStatus;
import org.apache.hugegraph.service.op.OperationsModels.Lifecycle;
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
    private final ExecutorService readinessExecutor;
    private final ExecutorService lifecycleExecutor;
    private final int storeDeadlineMillis;
    private final Set<String> storeAllowedTargets;
    private final ServerClientProvider serverClients;

    @Autowired
    public LiveOperationsCollector(HugeConfig config, ObjectMapper mapper,
                                   HugeClientPoolService clientPool) {
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
                     HubbleOptions.OPERATIONS_STORE_ALLOWED_TARGETS)),
             serverClients(clientPool));
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock) {
        this(pdEnabled, pdBase, pdUsername, pdPassword, storeUsername,
             storePassword, serverIdentity, http, parser, clock, 16, 5000,
             defaultStoreAllowedTargets(), null);
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock,
                            int storeThreads, int storeDeadlineMillis) {
        this(pdEnabled, pdBase, pdUsername, pdPassword, storeUsername,
             storePassword, serverIdentity, http, parser, clock, storeThreads,
             storeDeadlineMillis, defaultStoreAllowedTargets(), null);
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock,
                            int storeThreads, int storeDeadlineMillis,
                            Set<String> storeAllowedTargets) {
        this(pdEnabled, pdBase, pdUsername, pdPassword, storeUsername,
             storePassword, serverIdentity, http, parser, clock, storeThreads,
             storeDeadlineMillis, storeAllowedTargets, null);
    }

    LiveOperationsCollector(boolean pdEnabled, String pdBase,
                            String pdUsername, String pdPassword,
                            String storeUsername, String storePassword,
                            String serverIdentity, OperationsHttpClient http,
                            OperationsPayloadParser parser, Clock clock,
                            int storeThreads, int storeDeadlineMillis,
                            Set<String> storeAllowedTargets,
                            ServerClientProvider serverClients) {
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
        this.serverClients = serverClients;
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
        this.readinessExecutor = Executors.newFixedThreadPool(
                storeThreads, runnable -> {
                    Thread thread = new Thread(
                            runnable, "hubble-store-readiness-" + THREAD_SEQUENCE.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
        // Lifecycle is optional and must not consume readiness workers.
        this.lifecycleExecutor = Executors.newFixedThreadPool(
                storeThreads, runnable -> {
                    Thread thread = new Thread(
                            runnable, "hubble-store-lifecycle-" + THREAD_SEQUENCE.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                });
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
        this.readinessExecutor.shutdownNow();
        this.lifecycleExecutor.shutdownNow();
        try {
            this.storeExecutor.awaitTermination(1L, TimeUnit.SECONDS);
            this.readinessExecutor.awaitTermination(1L, TimeUnit.SECONDS);
            this.lifecycleExecutor.awaitTermination(1L, TimeUnit.SECONDS);
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
        String clusterReason = null;
        if (this.pdEnabled) {
            clusterReason = this.collectPd(includeMetrics, now, sources, nodes,
                                           facts);
        } else {
            sources.put("pd", unsupported());
            sources.put("stores", unsupported());
        }
        String status = this.overallStatus(sources);
        if (nodes.stream().anyMatch(node -> node.getReadiness() != null &&
                                           "NOT_READY".equals(node.getReadiness().getStatus()))) {
            if (clusterReason == null) {
                clusterReason = "service_not_ready";
            }
        }
        if (clusterReason != null && "UP".equals(status)) {
            status = "DEGRADED";
        }
        return new Snapshot(status, now, false, clusterReason,
                            sources, nodes, facts);
    }

    private void collectServer(HugeClient client, boolean includeMetrics,
                               long now, Map<String, SourceStatus> sources,
                               List<Node> nodes) {
        long started = System.nanoTime();
        List<String> urls;
        try {
            urls = this.discoveredServerURLs();
        } catch (RuntimeException e) {
            sources.put("server", unavailable(metricReason(e), now));
            return;
        }
        if (urls.isEmpty()) {
            if (this.pdEnabled && this.serverClients != null) {
                sources.put("server", unavailable(
                            "topology_fields_unavailable", now));
                return;
            }
            this.collectSingleServer(client, this.serverIdentity,
                                     "Server", includeMetrics, now,
                                     sources, nodes);
            return;
        }
        int up = 0;
        boolean partial = false;
        String reason = null;
        String authContext = client.getAuthContext();
        List<Future<ServerResult>> futures;
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(
                             System.nanoTime() - started);
        long remainingMillis = Math.max(
                               1L, this.storeDeadlineMillis - elapsedMillis);
        try {
            futures = this.storeExecutor.invokeAll(
                    urls.stream().map(url ->
                            (java.util.concurrent.Callable<ServerResult>) () ->
                            this.collectDiscoveredServer(
                                 url, authContext, includeMetrics, now))
                        .collect(Collectors.toList()),
                    remainingMillis, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            sources.put("server", unavailable("upstream_interrupted", now));
            return;
        }
        for (int i = 0; i < urls.size(); i++) {
            ServerResult result;
            String url = urls.get(i);
            try {
                result = futures.get(i).get();
            } catch (CancellationException e) {
                result = ServerResult.failure(url, now, "upstream_deadline");
            } catch (ExecutionException e) {
                result = ServerResult.failure(url, now,
                                              "upstream_unavailable");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                result = ServerResult.failure(url, now,
                                              "upstream_interrupted");
            }
            nodes.add(result.getNode());
            if ("UP".equals(result.getNode().getStatus())) {
                up++;
            }
            if (result.isPartial()) {
                partial = true;
                reason = mergeServerReason(reason, result.getReason());
            }
        }
        String status = up == urls.size() ? "UP" :
                        up == 0 ? "DOWN" : "DEGRADED";
        String availability = up == 0 ? "UNAVAILABLE" :
                              partial ? "PARTIAL" : "AVAILABLE";
        sources.put("server", new SourceStatus(
                    availability, status, now, up > 0 ? now : null,
                    up > 0 && !partial, false, reason));
    }

    private ServerResult collectDiscoveredServer(String url,
                                                  String authContext,
                                                  boolean includeMetrics,
                                                  long now) {
        HugeClient server = null;
        try {
            server = this.serverClients.create(
                     url, authContext,
                     Math.max(1, this.storeDeadlineMillis / 1000));
            return this.serverResult(
                   server, url, serverName(url), includeMetrics, now);
        } catch (RuntimeException e) {
            return ServerResult.failure(url, now, metricReason(e));
        } finally {
            if (server != null) {
                server.close();
            }
        }
    }

    private List<String> discoveredServerURLs() {
        if (!this.pdEnabled || this.serverClients == null) {
            return Collections.emptyList();
        }
        Future<List<String>> discovery = this.storeExecutor.submit(() ->
                this.serverClients.urls().stream()
                    .filter(url -> url != null && !url.trim().isEmpty())
                    .distinct()
                    .collect(Collectors.toList()));
        try {
            return discovery.get(this.storeDeadlineMillis,
                                 TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            discovery.cancel(true);
            throw new UpstreamRequestException("upstream_deadline", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            discovery.cancel(true);
            throw new UpstreamRequestException("upstream_interrupted", e);
        } catch (ExecutionException e) {
            throw new UpstreamRequestException("upstream_unavailable",
                                               e.getCause());
        }
    }

    private static ServerClientProvider serverClients(
            HugeClientPoolService clientPool) {
        return new ServerClientProvider() {
            @Override
            public List<String> urls() {
                return clientPool.discoveredServerURLs();
            }

            @Override
            public HugeClient create(String url, String authContext,
                                     int timeout) {
                return clientPool.createDiscoveredServerClient(
                       url, authContext, timeout);
            }
        };
    }

    private void collectSingleServer(HugeClient client, String identity,
                                     String name, boolean includeMetrics,
                                     long now,
                                     Map<String, SourceStatus> sources,
                                     List<Node> nodes) {
        try {
            ServerResult result = this.serverResult(client, identity, name,
                                                    includeMetrics, now);
            nodes.add(result.getNode());
            sources.put("server", new SourceStatus(
                        result.isPartial() ? "PARTIAL" : "AVAILABLE",
                        "UP", now, now, !result.isPartial(), false,
                        result.getReason()));
        } catch (RuntimeException e) {
            sources.put("server", unavailable("upstream_unavailable", now));
        }
    }

    private ServerResult serverResult(HugeClient client, String identity,
                                      String name, boolean includeMetrics,
                                      long now) {
        String version = client.versionManager().getCoreVersion();
        Map<String, Object> metrics = Collections.emptyMap();
        Map<String, MetricStatus> metricStatuses = Collections.emptyMap();
        boolean partial = false;
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
                partial = true;
                reason = metricReason(e);
                metricStatuses.put("system", metricStatus(e, now, false));
            }
            try {
                Map<String, Object> backend = this.safeBackendMetrics(
                                              client.metrics().backend());
                metrics.put("backend", backend);
                if (((Number) backend.get("failed_graphs")).longValue() > 0L) {
                    partial = true;
                    reason = mergeServerReason(reason, "backend_metrics_failed");
                    metricStatuses.put("backend", unavailableMetric(
                                       now, "backend_metrics_failed")
                            .withDiagnostics(Map.of("failed_graphs", backend.get("failed_graphs"))));
                } else {
                    metricStatuses.put("backend", availableMetric(now));
                }
            } catch (RuntimeException e) {
                partial = true;
                reason = mergeServerReason(reason, metricReason(e));
                metricStatuses.put("backend", metricStatus(e, now, false));
            }
        }
        Node node = new Node(stableId("server", identity), "SERVER", name,
                             null, version, "UP", now, metrics,
                             metricStatuses);
        return new ServerResult(node, partial, reason);
    }

    private static String mergeServerReason(String current, String addition) {
        if (current == null || current.equals(addition)) {
            return addition;
        }
        return "server_metrics_partial";
    }

    private static String serverName(String url) {
        return "Server " +
               stableId("server", url).substring("server-".length());
    }

    private String collectPd(boolean includeMetrics, long now,
                             Map<String, SourceStatus> sources,
                             List<Node> nodes, Map<String, Long> facts) {
        String cluster = null;
        String stores = null;
        String clusterReason = null;
        SourceStatus pdStatus;
        SourceStatus storesStatus;
        try {
            // Member discovery must not trigger the partition scan in /v1/cluster.
            cluster = this.get("/v1/members");
            pdStatus = available("UP", now);
        } catch (RuntimeException e) {
            pdStatus = unavailable(reason(e), now).withDiagnostics(diagnostics(e));
        }
        try {
            stores = this.get("/v1/stores");
            storesStatus = available("UP", now);
        } catch (RuntimeException e) {
            storesStatus = unavailable(reason(e), now).withDiagnostics(diagnostics(e));
        }
        boolean clusterParsed = false;
        boolean storesParsed = false;
        String clusterState = null;
        String dataState = null;
        if (cluster != null) {
            try {
                Topology topology = this.parser.parseTopology(cluster,
                                                              EMPTY_STORES,
                                                              now);
                this.mergeNodes(nodes, topology.getNodes());
                facts.putAll(topology.getFacts());
                clusterReason = topology.getReason();
                clusterState = topology.getClusterState();
                dataState = topology.getDataState();
                pdStatus = available(this.nodeStatus(topology.getNodes(), "PD"),
                                     now);
                if (dataState != null && !"PState_Normal".equalsIgnoreCase(dataState)) {
                    pdStatus = new SourceStatus("PARTIAL", pdStatus.getStatus(),
                                                now, now, true, false, clusterReason);
                }
                clusterParsed = true;
            } catch (MalformedUpstreamException e) {
                pdStatus = malformed(now).withDiagnostics(Map.of("request_path", "/v1/members"));
            }
        }
        if (stores != null) {
            try {
                Topology topology = this.parser.parseTopology(EMPTY_CLUSTER,
                                                              stores, now);
                this.mergeNodes(nodes, topology.getNodes());
                facts.putAll(topology.getFacts());
                storesStatus = available(this.nodeStatus(
                                         topology.getNodes(), "STORE"), now);
                this.reconcileStoreFacts(nodes, facts);
                storesParsed = true;
            } catch (MalformedUpstreamException e) {
                storesStatus = malformed(now).withDiagnostics(Map.of("request_path", "/v1/stores"));
            }
        }
        if (includeMetrics && clusterParsed) {
            pdStatus = this.collectPdMetrics(now, pdStatus, nodes, cluster);
            this.collectPdReadiness(now, nodes, cluster);
        }
        if (includeMetrics && storesParsed) {
            storesStatus = this.collectStoreMetrics(stores, now, storesStatus,
                                                     nodes);
            storesStatus = withStatus(storesStatus,
                                      this.nodeStatus(nodes, "STORE"));
            this.reconcileStoreFacts(nodes, facts);
        } else if (includeMetrics) {
            this.applyStoreMetricStatus(nodes, this.metricStatus(storesStatus,
                                                                 now));
        }
        sources.put("pd", pdStatus.withClusterHealth(clusterState, dataState));
        sources.put("stores", storesStatus);
        return clusterReason;
    }

    private void collectPdReadiness(long now, List<Node> nodes, String cluster) {
        int selected = this.pdNodeIndex(nodes, cluster);
        Readiness observed = selected < 0 ? null : this.probeReadiness(
                "PD", URI.create(this.pdBase + "/v1/ready"),
                this.pdUsername, this.pdPassword, Collections.emptySet(), now);
        for (int i = 0; i < nodes.size(); i++) {
            Node node = nodes.get(i);
            if ("PD".equals(node.getType())) {
                nodes.set(i, node.withReadiness(i == selected ? observed :
                          new Readiness("UNKNOWN", null, null,
                                        selected < 0 ? "readiness_target_unmapped" :
                                        "readiness_not_probed", false, Collections.emptyMap())));
            }
        }
    }

    private Readiness probeReadiness(String type, URI target,
                                     String username, String password,
                                     Set<String> allowedTargets, long now) {
        try {
            OperationsHttpClient.ProbeResponse response = this.http.probe(
                    target, username, password, allowedTargets);
            return this.parser.parseReadiness(type, response.getBody(),
                                              response.getStatus(), now, target.getRawPath());
        } catch (RuntimeException e) {
            String failure = metricReason(e);
            Map<String, Object> details = new LinkedHashMap<>(diagnostics(e));
            details.put("request_path", target.getRawPath());
            return new Readiness("unsupported_version".equals(failure) ?
                                 "UNSUPPORTED" : "UNKNOWN", now, null,
                                 failure, false, details);
        }
    }

    private String nodeStatus(List<Node> nodes, String type) {
        long total = nodes.stream()
                          .filter(node -> type.equals(node.getType()))
                          .count();
        long up = nodes.stream()
                       .filter(node -> type.equals(node.getType()))
                       .filter(node -> "UP".equals(node.getStatus()))
                       .count();
        long down = nodes.stream()
                         .filter(node -> type.equals(node.getType()))
                         .filter(node -> "DOWN".equals(node.getStatus()))
                         .count();
        if (total == 0L) {
            return "UNKNOWN";
        }
        if (up == total) {
            return "UP";
        }
        if (down == total) {
            return "DOWN";
        }
        return "DEGRADED";
    }

    private void reconcileStoreFacts(List<Node> nodes,
                                     Map<String, Long> facts) {
        long stores = nodes.stream()
                           .filter(node -> "STORE".equals(node.getType()))
                           .count();
        long storesUp = nodes.stream()
                             .filter(node -> "STORE".equals(node.getType()))
                             .filter(node -> "UP".equals(node.getStatus()))
                             .count();
        facts.put("stores", stores);
        facts.put("stores_up", storesUp);
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
                                          List<Node> nodes, String cluster) {
        int index = this.pdNodeIndex(nodes, cluster);
        if (index < 0) {
            for (int i = 0; i < nodes.size(); i++) {
                Node node = nodes.get(i);
                if ("PD".equals(node.getType())) {
                    Map<String, MetricStatus> statuses = new LinkedHashMap<>(node.getMetricStatuses());
                    statuses.put("system", unsupportedMetric(now, "metrics_not_collected"));
                    nodes.set(i, copyNode(node, node.getMetrics(), statuses));
                }
            }
            Map<String, Object> details = new LinkedHashMap<>(status.getDiagnostics());
            // Only the configured endpoint is scraped; unmatched members have
            // no attributed metric request or node-level failure.
            details.put("affected_node_count", 1);
            details.put("failed_metric_groups", List.of("system"));
            details.put("pd_metric_mapping", this.parser.pdMetricMappingDiagnostics(cluster, this.pdBase));
            // A Service or proxy may route to a different member on each
            // request. Preserve its bounded response as an endpoint sample,
            // never as a member metric or a cluster aggregate.
            Map<String, Object> endpoint = new LinkedHashMap<>();
            try {
                endpoint.put("metrics", this.parser.parsePdPrometheusMetrics(
                        this.http.get(URI.create(this.pdBase + "/actuator/prometheus"),
                                      this.pdUsername, this.pdPassword,
                                      Collections.emptySet(), "text/plain")));
                endpoint.put("metric_status", availableMetric(now));
            } catch (RuntimeException e) {
                Map<String, Object> failure = new LinkedHashMap<>(diagnostics(e));
                failure.putIfAbsent("request_path", "/actuator/prometheus");
                endpoint.put("metric_status", metricStatus(e, now, true).withDiagnostics(failure));
            }
            details.put("pd_endpoint_metrics", endpoint);
            return new SourceStatus("PARTIAL", status.getStatus(), now,
                                    status.getLastSuccessAt(), false, false,
                                    preferredReason(status,
                                                    "pd_metrics_unmapped"), details);
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
            Map<String, Object> details = new LinkedHashMap<>(diagnostics(e));
            details.putIfAbsent("request_path", "/actuator/prometheus");
            selectedStatus = metricStatus(e, now, true).withDiagnostics(details);
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
                                    preferredReason(status, failureReason), selectedStatus.getDiagnostics());
        }
        return status;
    }

    private static String preferredReason(SourceStatus status,
                                          String fallback) {
        return status.getReason() == null ? fallback : status.getReason();
    }

    private int pdNodeIndex(List<Node> nodes, String cluster) {
        String configuredId = this.parser.pdMetricNodeId(cluster, this.pdBase);
        for (int i = 0; i < nodes.size(); i++) {
            Node node = nodes.get(i);
            if (!"PD".equals(node.getType())) {
                continue;
            }
            if (node.getId().equals(configuredId)) {
                return i;
            }
        }
        return -1;
    }

    private SourceStatus collectStoreMetrics(String stores, long now,
                                             SourceStatus status,
                                             List<Node> nodes) {
        List<Future<Readiness>> readiness = new ArrayList<>();
        List<Future<Lifecycle>> lifecycles = new ArrayList<>();
        try {
            Map<String, String> restAddresses;
            try {
                restAddresses = this.parser.parseStoreRestAddresses(stores);
            } catch (MalformedUpstreamException e) {
                Map<String, Object> details = Map.of("request_path", "/v1/stores");
                this.applyStoreMetricStatus(nodes, metricStatus(e, now, true).withDiagnostics(details));
                return metricFailureStatus(status, now, 0, metricReason(e)).withDiagnostics(details);
            }
            String targetPath = "/v1/prom/targets/store";
            String targetPayload;
            try {
                targetPayload = this.get(targetPath);
            } catch (UpstreamRequestException e) {
                if (!"upstream_http_status_404".equals(e.getMessage()) &&
                    !"upstream_http_status_405".equals(e.getMessage())) {
                    throw e;
                }
                targetPath = "/v1/prom/targets-all";
                targetPayload = this.get(targetPath);
            }
            Map<String, URI> targets;
            try {
                targets = this.parser.parseStoreMetricTargets(targetPayload);
            } catch (MalformedUpstreamException e) {
                Map<String, Object> details = Map.of("request_path", targetPath);
                this.applyStoreMetricStatus(nodes, metricStatus(e, now, true).withDiagnostics(details));
                return metricFailureStatus(status, now, 0, metricReason(e)).withDiagnostics(details);
            }
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
                    nodes.set(i, copyNode(node, node.getMetrics(), statuses).withReadiness(
                            new Readiness("UNKNOWN", now, null, target.getReason(),
                                          false, Collections.emptyMap())));
                    continue;
                }
                allowedTargets.add(OperationsHttpClient.origin(
                                   target.getUri()));
                jobs.add(new StoreMetricJob(i, node, target.getUri()));
            }
            if (allowedTargets.isEmpty()) {
                allowedTargets.add("no_trusted_store_target");
            }
            // A slow optional probe must not consume any metric worker or its deadline.
            long readinessDeadline = System.nanoTime() +
                                     TimeUnit.MILLISECONDS.toNanos(this.storeDeadlineMillis);
            for (StoreMetricJob job : jobs) {
                readiness.add(this.readinessExecutor.submit(() -> this.probeReadiness(
                        "STORE", job.getTarget().resolve("/-/state"),
                        this.storeUsername, this.storePassword, allowedTargets, now)));
                lifecycles.add(this.lifecycleExecutor.submit(() -> this.probeLifecycle(
                        job.getTarget().resolve("/-/lifecycle"), allowedTargets, now)));
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
                // Metric transport failures do not override PD-reported node health.
                nodes.set(job.getNodeIndex(), result.getNode());
                successfulGroups += result.getSuccessfulGroups();
                if (result.getFailureReason() != null) {
                    partial = true;
                    failureReason = mergeReason(failureReason,
                                                result.getFailureReason());
                }
            }
            for (int i = 0; i < jobs.size(); i++) {
                StoreMetricJob job = jobs.get(i);
                Readiness observation = this.readinessResult(
                        readiness.get(i), job, now, readinessDeadline);
                nodes.set(job.getNodeIndex(), nodes.get(job.getNodeIndex()).withReadiness(observation));
            }
            for (int i = 0; i < jobs.size(); i++) {
                StoreMetricJob job = jobs.get(i);
                Lifecycle observation = this.lifecycleResult(lifecycles.get(i), now, readinessDeadline);
                nodes.set(job.getNodeIndex(), nodes.get(job.getNodeIndex()).withProcessLifecycle(observation));
            }
            if (partial) {
                return metricFailureStatus(status, now, successfulGroups, failureReason)
                       .withDiagnostics(storeFailureSummary(nodes));
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
            return metricFailureStatus(status, now, 0, metricReason(e))
                   .withDiagnostics(diagnostics(e));
        } finally {
            readiness.forEach(future -> future.cancel(true));
            lifecycles.forEach(future -> future.cancel(true));
        }
    }

    private Lifecycle probeLifecycle(URI target, Set<String> allowedTargets, long now) {
        try {
            OperationsHttpClient.ProbeResponse response = this.http.probe(
                    target, this.storeUsername, this.storePassword, allowedTargets);
            return this.parser.parseStoreLifecycle(response.getBody(), response.getStatus(), now);
        } catch (RuntimeException e) {
            return new Lifecycle("UNKNOWN", now, metricReason(e), false);
        }
    }

    private Lifecycle lifecycleResult(Future<Lifecycle> future, long now, long deadline)
                                      throws InterruptedException {
        try {
            return future.get(Math.max(0L, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (CancellationException | TimeoutException e) {
            return new Lifecycle("UNKNOWN", now, "upstream_deadline", false);
        } catch (ExecutionException e) {
            return new Lifecycle("UNKNOWN", now, "upstream_unavailable", false);
        }
    }

    private Readiness readinessResult(Future<Readiness> future, StoreMetricJob job,
                                       long now, long deadline) throws InterruptedException {
        String failure;
        try {
            return future.get(Math.max(0L, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (CancellationException | TimeoutException e) {
            failure = "upstream_deadline";
        } catch (ExecutionException e) {
            failure = "upstream_unavailable";
        }
        return new Readiness("UNKNOWN", now, null, failure, false,
                             Map.of("request_path", job.getTarget().resolve("/-/state").getRawPath()));
    }

    private static Map<String, Object> storeFailureSummary(List<Node> nodes) {
        int affected = 0;
        Set<String> groups = new java.util.LinkedHashSet<>();
        for (Node node : nodes) {
            if (!"STORE".equals(node.getType())) {
                continue;
            }
            boolean failed = false;
            for (Map.Entry<String, MetricStatus> entry : node.getMetricStatuses().entrySet()) {
                String availability = entry.getValue().getAvailability();
                if ("UNAVAILABLE".equals(availability) || "MALFORMED".equals(availability) ||
                    "UNSUPPORTED".equals(availability) &&
                    "unsupported_version".equals(entry.getValue().getReason())) {
                    failed = true;
                    groups.add(entry.getKey());
                }
            }
            if (failed) {
                affected++;
            }
        }
        return Map.of("affected_node_count", affected,
                      "failed_metric_groups", new ArrayList<>(groups));
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
            boolean raft = "raft".equals(group);
            URI endpoint = job.getTarget().resolve(raft ? "/metrics/raft/summary" : "/metrics/" + group);
            try {
                String payload;
                String parserGroup = raft ? "raft_summary" : group;
                try {
                    payload = this.http.get(endpoint, this.storeUsername,
                                            this.storePassword, allowedTargets);
                } catch (UpstreamRequestException e) {
                    // Older Store versions expose only the detailed endpoint.
                    // Do not amplify authorization, transport or server errors.
                    if (!raft || !("upstream_http_status_404".equals(e.getMessage()) ||
                                   "upstream_http_status_405".equals(e.getMessage()))) {
                        throw e;
                    }
                    endpoint = job.getTarget().resolve("/metrics/raft");
                    parserGroup = "raft";
                    payload = this.http.get(endpoint, this.storeUsername,
                                            this.storePassword, allowedTargets);
                }
                metrics.put(group, this.parser.parseStoreMetrics(parserGroup, payload));
                statuses.put(group, availableMetric(now));
                successfulGroups++;
            } catch (RuntimeException e) {
                failureReason = mergeReason(failureReason, metricReason(e));
                Map<String, Object> details = new LinkedHashMap<>(diagnostics(e));
                details.put("request_path", endpoint.getRawPath());
                details.put("metric_group", group);
                statuses.put(group, metricStatus(e, now, true).withDiagnostics(details));
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
            nodes.set(i, copyNode(node, node.getMetrics(), statuses).withReadiness(
                    node.getReadiness() == null ?
                    new Readiness("UNKNOWN", failure.getObservedAt(), null, failure.getReason(),
                                  false, failure.getDiagnostics()) : node.getReadiness()));
        }
    }

    private MetricStatus metricStatus(SourceStatus source, long now) {
        if ("MALFORMED".equals(source.getAvailability())) {
            return new MetricStatus("MALFORMED", now, null, false, false,
                                    source.getReason(), source.getDiagnostics());
        }
        if ("UNSUPPORTED".equals(source.getAvailability())) {
            return unsupportedMetric(now, source.getReason())
                   .withDiagnostics(source.getDiagnostics());
        }
        return unavailableMetric(now, source.getReason())
               .withDiagnostics(source.getDiagnostics());
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
            return unsupportedMetric(now, reason).withDiagnostics(diagnostics(error));
        }
        if (error instanceof MalformedUpstreamException) {
            return new MetricStatus("MALFORMED", now, null, false, false,
                                    reason, diagnostics(error));
        }
        return unavailableMetric(now, reason).withDiagnostics(diagnostics(error));
    }

    private static Map<String, Object> diagnostics(RuntimeException error) {
        return error instanceof UpstreamRequestException ?
               ((UpstreamRequestException) error).getDiagnostics() : Collections.emptyMap();
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
                        node.getObservedAt(), metrics, statuses)
                        .withReadiness(node.getReadiness())
                        .withProcessLifecycle(node.getProcessLifecycle());
    }

    private static SourceStatus withStatus(SourceStatus source,
                                           String status) {
        return new SourceStatus(source.getAvailability(), status,
                                source.getObservedAt(),
                                source.getLastSuccessAt(), source.isFresh(),
                                source.isStale(), source.getReason(), source.getDiagnostics());
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
        long failures = 0L;
        Map<String, Long> backends = new LinkedHashMap<>();
        if (upstream != null) {
            for (Map<String, Object> graph : upstream.values()) {
                if (graph == null) {
                    continue;
                }
                graphs++;
                if (graph.get("exception") != null) {
                    failures++;
                }
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
        result.put("failed_graphs", failures);
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
                                  source.getAvailability()) ||
                                  "DOWN".equals(source.getStatus()) ||
                                  "DEGRADED".equals(source.getStatus()))
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
        return available(status, now, null);
    }

    private static SourceStatus available(String status, long now,
                                          String reason) {
        return new SourceStatus("AVAILABLE", status, now, now, true, false,
                                reason);
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
        if ("upstream_timeout".equals(message) ||
            "upstream_deadline".equals(message) ||
            "upstream_interrupted".equals(message)) {
            return message;
        }
        if (message != null && message.startsWith("upstream_http_status_")) {
            return "upstream_rejected";
        }
        return "upstream_unavailable";
    }

    private static final class ServerResult {

        private final Node node;
        private final boolean partial;
        private final String reason;

        private ServerResult(Node node, boolean partial, String reason) {
            this.node = node;
            this.partial = partial;
            this.reason = reason;
        }

        private Node getNode() {
            return this.node;
        }

        private boolean isPartial() {
            return this.partial;
        }

        private String getReason() {
            return this.reason;
        }

        private static ServerResult failure(String url, long now,
                                            String reason) {
            Node node = new Node(stableId("server", url), "SERVER",
                                 serverName(url), null, null, "DOWN", now,
                                 Collections.emptyMap(),
                                 Collections.emptyMap());
            return new ServerResult(node, true, reason);
        }
    }

    interface ServerClientProvider {

        List<String> urls();

        HugeClient create(String url, String authContext, int timeout);
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
            Node failed = copyNode(job.getNode(), job.getNode().getMetrics(), statuses);
            return new StoreMetricResult(failed, 0, reason);
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
