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

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.MetricsManager;
import org.apache.hugegraph.driver.VersionManager;
import org.apache.hugegraph.service.op.OperationsModels.Snapshot;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.Mockito;

public class LiveOperationsCollectorTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.ofEpochMilli(2000L), ZoneOffset.UTC);

    @Test
    public void testMemberDiscoveryDoesNotReadPartitionSummary()
           throws IOException {
        HttpServer pd = pdServer(200, members("Cluster_OK"), 200, stores());
        AtomicInteger clusterRequests = new AtomicInteger();
        pd.createContext("/v1/cluster", exchange -> {
            clusterRequests.incrementAndGet();
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        Snapshot snapshot;
        LiveOperationsCollector collector = collector(true, pd);
        try {
            snapshot = collector.collect(serverClient(), false);
        } finally {
            collector.close();
            pd.stop(0);
        }

        Assert.assertEquals(0, clusterRequests.get());
        Assert.assertEquals("UP", snapshot.getStatus());
        Assert.assertEquals("AVAILABLE", snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("Cluster_OK", snapshot.getSources().get("pd").getClusterState());
        OperationsModels.Node pdNode = snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType())).findFirst().orElseThrow();
        Assert.assertEquals("LEADER", pdNode.getRole());
        Assert.assertEquals("UP", pdNode.getStatus());
        Assert.assertEquals("1.8.0", pdNode.getVersion());
        Assert.assertEquals(Long.valueOf(1L), snapshot.getFacts().get("stores"));
        Assert.assertEquals(Long.valueOf(1L), snapshot.getFacts().get("stores_up"));
        Assert.assertFalse(snapshot.getFacts().containsKey("graphs"));
        Assert.assertFalse(snapshot.getFacts().containsKey("partitions"));
        Assert.assertFalse(snapshot.getFacts().containsKey("replicas"));
        Assert.assertNull(snapshot.getSources().get("pd").getDataState());
    }

    @Test
    public void testMemberDiscoveryPreservesClusterWarningWithUpNodes()
           throws IOException {
        HttpServer pd = pdServer(200, members("Cluster_Not_Ready"), 200, stores());
        LiveOperationsCollector collector = collector(true, pd);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), false);
        } finally {
            collector.close();
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("cluster_not_ready", snapshot.getReason());
        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals("Cluster_Not_Ready", snapshot.getSources().get("pd").getClusterState());
        Assert.assertTrue(snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .allMatch(node -> "UP".equals(node.getStatus())));
    }

    @Test
    public void testUnavailableMembersDoesNotFallBackToPartitionScan()
           throws IOException {
        HttpServer pd = pdServer(503, "unavailable", 200, stores());
        AtomicInteger clusterRequests = new AtomicInteger();
        pd.createContext("/v1/cluster", exchange -> {
            clusterRequests.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        LiveOperationsCollector collector = collector(true, pd);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), false);
        } finally {
            collector.close();
            pd.stop(0);
        }

        Assert.assertEquals(0, clusterRequests.get());
        Assert.assertEquals("UNAVAILABLE", snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("upstream_rejected", snapshot.getSources().get("pd").getReason());
        Assert.assertEquals(Map.of("request_path", "/v1/members", "http_status", 503),
                            snapshot.getSources().get("pd").getDiagnostics());
        Assert.assertEquals(Long.valueOf(1L), snapshot.getFacts().get("stores"));
    }

    @Test
    public void testNonPdModeReturnsServerAndUnsupportedPdSources() {
        HugeClient client = serverClient();
        LiveOperationsCollector collector = collector(false, null);

        Snapshot snapshot = collector.collect(client, true);

        Assert.assertEquals("UP", snapshot.getStatus());
        Assert.assertEquals(1, snapshot.getNodes().size());
        Assert.assertEquals("SERVER", snapshot.getNodes().get(0).getType());
        Assert.assertEquals("Server", snapshot.getNodes().get(0).getName());
        Assert.assertTrue(snapshot.getNodes().get(0).getMetrics()
                                  .containsKey("system"));
        Assert.assertTrue(snapshot.getNodes().get(0).getMetrics()
                                  .containsKey("backend"));
        Assert.assertEquals("AVAILABLE", snapshot.getNodes().get(0)
                .getMetricStatuses().get("system").getAvailability());
        Assert.assertEquals("AVAILABLE", snapshot.getNodes().get(0)
                .getMetricStatuses().get("backend").getAvailability());
        Assert.assertEquals("UNSUPPORTED",
                            snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("UNSUPPORTED",
                            snapshot.getSources().get("stores").getAvailability());
    }

    @Test
    public void testEmbeddedBackendFailureDoesNotExposeExceptionOrReportSuccess() {
        HugeClient client = serverClient();
        for (boolean allFailed : new boolean[]{false, true}) {
            Map<String, Map<String, Object>> backend = new LinkedHashMap<>();
            backend.put("private-graph", Map.of("backend", "hstore",
                                               "exception", "private-password /private/path"));
            if (!allFailed) {
                backend.put("healthy-graph", Map.of("backend", "hstore", "nodes", 2));
            }
            Mockito.when(client.metrics().backend()).thenReturn(backend);
            Snapshot snapshot = collector(false, null).collect(client, true);
            OperationsModels.Node server = snapshot.getNodes().get(0);
            MetricStatus status = server.getMetricStatuses().get("backend");

            Assert.assertEquals("DEGRADED", snapshot.getStatus());
            Assert.assertEquals("UNAVAILABLE", status.getAvailability());
            Assert.assertEquals("backend_metrics_failed", status.getReason());
            Assert.assertEquals(Collections.singletonMap("failed_graphs", 1L), status.getDiagnostics());
            Assert.assertEquals("UP", server.getStatus());
            Assert.assertEquals("AVAILABLE", server.getMetricStatuses()
                                                   .get("system").getAvailability());
            @SuppressWarnings("unchecked")
            Map<String, Object> summary = (Map<String, Object>) server.getMetrics().get("backend");
            Assert.assertEquals(1L, summary.get("failed_graphs"));
            Assert.assertEquals(allFailed ? 1L : 2L, summary.get("graphs"));
            Assert.assertFalse(summary.toString().contains("private"));
            Assert.assertFalse(summary.toString().contains("exception"));
        }
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testBackendFailureRetainsCurrentCountWhenSuccessfulValuesAreCached() {
        HugeClient client = serverClient();
        Mockito.when(client.metrics().backend()).thenReturn(
                Map.of("healthy-graph", Map.of("backend", "hstore", "nodes", 2)),
                Map.of("private-graph", Map.of("backend", "hstore", "exception", "private-message")));
        LiveOperationsCollector collector = collector(false, null);
        DefaultOperationsDataService service = new DefaultOperationsDataService(collector, 5, CLOCK);
        Set<String> capabilities = Set.of(OperationsCapabilityService.HEALTH_READ,
                                         OperationsCapabilityService.TOPOLOGY_READ,
                                         OperationsCapabilityService.METRICS_READ);
        try {
            service.overview(client, capabilities, false);
            Map<String, Object> result = service.overview(client, capabilities, true);
            OperationsModels.Node server = ((java.util.List<OperationsModels.Node>) result.get("nodes")).get(0);
            MetricStatus backend = server.getMetricStatuses().get("backend");

            Assert.assertEquals("UNAVAILABLE", backend.getAvailability());
            Assert.assertEquals("backend_metrics_failed", backend.getReason());
            Assert.assertEquals(Collections.singletonMap("failed_graphs", 1L), backend.getDiagnostics());
            Assert.assertTrue(backend.isStale());
            Assert.assertEquals(Long.valueOf(2000L), backend.getLastSuccessAt());
            Map<String, Object> oldMetrics = (Map<String, Object>) server.getMetrics().get("backend");
            Assert.assertEquals(0L, oldMetrics.get("failed_graphs"));
            Assert.assertEquals(2L, oldMetrics.get("nodes"));
            Assert.assertFalse(backend.getDiagnostics().toString().contains("private"));
        } finally {
            collector.close();
        }
    }

    @Test
    public void testHealthOnlyDoesNotCallServerMetrics() {
        HugeClient client = serverClient();
        LiveOperationsCollector collector = collector(false, null);

        collector.collect(client, false);

        Mockito.verify(client, Mockito.never()).metrics();
    }

    @Test
    public void testPdModeCollectsEveryDiscoveredServer()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        LiveOperationsCollector.ServerClientProvider servers =
                new LiveOperationsCollector.ServerClientProvider() {
            @Override
            public java.util.List<String> urls() {
                return Arrays.asList("http://server-a:8080",
                                     "http://server-b:8080");
            }

            @Override
            public HugeClient create(String url, String authContext,
                                     int timeout) {
                return serverClient();
            }
        };
        HugeClient requestClient = serverClient();
        Mockito.when(requestClient.getAuthContext()).thenReturn("Bearer token");
        LiveOperationsCollector collector = collector(true, pd, servers);

        Snapshot snapshot;
        try {
            snapshot = collector.collect(requestClient, false);
        } finally {
            collector.close();
            pd.stop(0);
        }

        Assert.assertEquals(2L, snapshot.getNodes().stream()
                                .filter(node -> "SERVER".equals(node.getType()))
                                .count());
        snapshot.getNodes().stream()
                .filter(node -> "SERVER".equals(node.getType()))
                .forEach(node -> Assert.assertEquals(
                         "Server " + node.getId().substring("server-".length()),
                         node.getName()));
        Assert.assertEquals("UP", snapshot.getSources().get("server")
                                          .getStatus());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("server")
                                    .getAvailability());
    }

    @Test
    public void testPdModeDoesNotInventServerWhenDiscoveryIsEmpty()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        LiveOperationsCollector.ServerClientProvider servers =
                new LiveOperationsCollector.ServerClientProvider() {
            @Override
            public java.util.List<String> urls() {
                return Collections.emptyList();
            }

            @Override
            public HugeClient create(String url, String authContext,
                                     int timeout) {
                throw new AssertionError("Server probe must not start");
            }
        };
        LiveOperationsCollector collector = collector(true, pd, servers);

        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), false);
        } finally {
            collector.close();
            pd.stop(0);
        }

        Assert.assertFalse(snapshot.getNodes().stream()
                                   .anyMatch(node -> "SERVER".equals(
                                             node.getType())));
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("server")
                                    .getAvailability());
        Assert.assertEquals("topology_fields_unavailable",
                            snapshot.getSources().get("server").getReason());
    }

    @Test
    public void testPdServerDiscoveryUsesOperationsDeadline()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        LiveOperationsCollector.ServerClientProvider servers =
                new LiveOperationsCollector.ServerClientProvider() {
            @Override
            public java.util.List<String> urls() {
                try {
                    Thread.sleep(10000L);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                }
                return Collections.emptyList();
            }

            @Override
            public HugeClient create(String url, String authContext,
                                     int timeout) {
                throw new AssertionError("Server probe must not start");
            }
        };
        LiveOperationsCollector collector = collector(true, pd, servers, 50);

        long started = System.nanoTime();
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), false);
        } finally {
            collector.close();
            pd.stop(0);
        }
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

        Assert.assertTrue(elapsed < 3000L);
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("server")
                                    .getAvailability());
        Assert.assertEquals("upstream_deadline",
                            snapshot.getSources().get("server").getReason());
    }

    @Test
    public void testNonPdModeIsDownWhenOnlySupportedSourceFails() {
        Snapshot snapshot = collector(false, null).collect(
                            unavailableServerClient(), false);

        Assert.assertEquals("DOWN", snapshot.getStatus());
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("server")
                                    .getAvailability());
    }

    @Test
    public void testPdModeIsDownWhenAllSupportedSourcesFail()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        LiveOperationsCollector collector = collector(true, pd);
        pd.stop(0);

        Snapshot snapshot = collector.collect(unavailableServerClient(), false);

        Assert.assertEquals("DOWN", snapshot.getStatus());
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("server")
                                    .getAvailability());
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testServerFailureWithAvailablePdIsDegraded()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(unavailableServerClient(),
                                                   false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("pd").getAvailability());
    }

    @Test
    public void testPdStoresFailureKeepsServerAndClusterTopology()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 500, "failure");
        HugeClient client = serverClient();
        LiveOperationsCollector collector = collector(true, pd);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(client, true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("UNAVAILABLE",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertTrue(snapshot.getNodes().stream()
                                  .anyMatch(node -> "PD".equals(node.getType())));
        Assert.assertTrue(snapshot.getNodes().stream()
                                  .anyMatch(node -> "SERVER".equals(node.getType())));
        OperationsModels.Node store = store(snapshot);
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("backend").getAvailability());
        for (String group : new String[]{"system", "drive", "raft"}) {
            Assert.assertEquals("UNAVAILABLE", store.getMetricStatuses()
                                                      .get(group)
                                                      .getAvailability());
        }
    }

    @Test
    public void testClusterWarningDoesNotOverrideHealthyPdNodes()
           throws IOException {
        String degraded = cluster().replace("Cluster_OK", "Cluster_Warn");
        HttpServer pd = pdServer(200, degraded, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("cluster_warn", snapshot.getReason());
        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
    }

    @Test
    public void testPdNotReadyKeepsPdSourceAlignedWithNodes()
           throws IOException {
        String notReady = cluster().replace("Cluster_OK", "Cluster_Not_Ready");
        HttpServer pd = pdServer(200, notReady, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        OperationsModels.SourceStatus pdSource = snapshot.getSources().get("pd");
        Assert.assertEquals("AVAILABLE", pdSource.getAvailability());
        Assert.assertTrue(pdSource.isFresh());
        Assert.assertEquals("UP", pdSource.getStatus());
        Assert.assertNull(pdSource.getReason());
        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("cluster_not_ready", snapshot.getReason());
        long pdCount = snapshot.getNodes().stream()
                               .filter(node -> "PD".equals(node.getType()))
                               .count();
        Assert.assertEquals(1L, pdCount);
        Assert.assertTrue(snapshot.getNodes().stream()
                                  .filter(node -> "PD".equals(node.getType()))
                                  .allMatch(node -> "UP".equals(node.getStatus())));
    }

    @Test
    public void testDataFailureDegradesCollectionWithoutMarkingPdProcessDown()
           throws IOException {
        HttpServer pd = pdServer(200, cluster().replace(
                "\"state\":\"Cluster_OK\"", "\"state\":\"Cluster_OK\",\"dataState\":\"PState_Fault\""),
                200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        OperationsModels.SourceStatus source = snapshot.getSources().get("pd");
        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("data_fault", snapshot.getReason());
        Assert.assertEquals("PARTIAL", source.getAvailability());
        Assert.assertEquals("UP", source.getStatus());
        Assert.assertEquals("data_fault", source.getReason());
        Assert.assertEquals("Cluster_OK", source.getClusterState());
        Assert.assertEquals("PState_Fault", source.getDataState());
        Assert.assertTrue(snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .allMatch(node -> "UP".equals(node.getStatus())));
    }

    @Test
    public void testOfflinePdDegradesPdSourceWhileClusterHasQuorum()
           throws IOException {
        String cluster = "{\"status\":0,\"data\":{" +
                         "\"state\":\"Cluster_OK\"," +
                         "\"pdList\":[" +
                         "{\"restUrl\":\"http://pd-1:8620\"," +
                         "\"state\":\"Up\",\"role\":\"Leader\"}," +
                         "{\"raftUrl\":\"pd-2:8610\"," +
                         "\"state\":\"Offline\",\"role\":\"Follower\"}]," +
                         "\"pdLeader\":{\"restUrl\":\"http://pd-1:8620\"," +
                         "\"state\":\"Up\",\"role\":\"Leader\"}}}";
        HttpServer pd = pdServer(200, cluster, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("DEGRADED",
                            snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals(1L, snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .filter(node -> "DOWN".equals(node.getStatus()))
                .count());
    }

    @Test
    public void testOfflineStoreDegradesStoreSource() throws IOException {
        String stores = "{\"status\":0,\"data\":{\"stores\":[" +
                        "{\"storeId\":\"1\",\"address\":\"store-1:8500\"," +
                        "\"state\":\"Up\"}," +
                        "{\"storeId\":\"2\",\"address\":\"store-2:8500\"," +
                        "\"state\":\"Offline\"}]}}";
        HttpServer pd = pdServer(200, cluster(), 200, stores);
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("DEGRADED",
                            snapshot.getSources().get("stores").getStatus());
        Assert.assertEquals(Long.valueOf(2L),
                            snapshot.getFacts().get("stores"));
        Assert.assertEquals(Long.valueOf(1L),
                            snapshot.getFacts().get("stores_up"));
        Assert.assertEquals(1L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "DOWN".equals(node.getStatus()))
                .count());
    }

    @Test
    public void testPdMetricsFailureDoesNotChangeHealthyNodeStatus()
           throws IOException {
        String notReady = cluster().replace("Cluster_OK", "Cluster_Not_Ready");
        HttpServer pd = HttpServer.create(new InetSocketAddress(0), 0);
        String storePayload = stores().replace(
                "PD_TEST_PORT", String.valueOf(pd.getAddress().getPort()));
        context(pd, "/v1/members", 200, notReady.replace(
                "http://pd:8620", "http://127.0.0.1:" + pd.getAddress().getPort()));
        context(pd, "/v1/stores", 200, storePayload);
        context(pd, "/actuator/prometheus", 500, "unavailable");
        pd.start();
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        OperationsModels.SourceStatus source =
                snapshot.getSources().get("pd");
        Assert.assertEquals("PARTIAL", source.getAvailability());
        Assert.assertEquals("UP", source.getStatus());
        Assert.assertEquals("upstream_rejected", source.getReason());
    }

    @Test
    public void testUnknownClusterStateDoesNotOverrideHealthyPdNodes()
           throws IOException {
        String unknown = cluster().replace("Cluster_OK", "Cluster_Starting");
        HttpServer pd = pdServer(200, unknown, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("DEGRADED", snapshot.getStatus());
        Assert.assertEquals("cluster_state_unknown", snapshot.getReason());
        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
    }

    @Test
    public void testUsesOnlyConfiguredPdServiceForClusterState() {
        LeaderAwareHttpClient http = new LeaderAwareHttpClient("pd-1");
        LiveOperationsCollector collector = leaderAwareCollector(http);

        Snapshot snapshot = collector.collect(serverClient(), false);

        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals(0, http.leaderRequests());
    }

    @Test
    public void testUnmatchedPdAddressNeverAttributesMetricsToLeader()
           throws IOException {
        HttpServer pd = pdServer(200, cluster().replace("http://pd:8620",
                                                        "http://pd-alias:8620"),
                                 200, stores());
        AtomicInteger probes = new AtomicInteger();
        pd.removeContext("/actuator/prometheus");
        pd.createContext("/actuator/prometheus", exchange -> {
            probes.incrementAndGet();
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals(1, probes.get());
        Assert.assertEquals("PARTIAL", snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("pd_metrics_unmapped", snapshot.getSources().get("pd").getReason());
        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals(1, snapshot.getSources().get("pd").getDiagnostics()
                .get("affected_node_count"));
        Assert.assertEquals(List.of("system"), snapshot.getSources().get("pd").getDiagnostics()
                .get("failed_metric_groups"));
        Map<?, ?> endpoint = (Map<?, ?>) snapshot.getSources().get("pd").getDiagnostics()
                .get("pd_endpoint_metrics");
        MetricStatus endpointStatus = (MetricStatus) endpoint.get("metric_status");
        Assert.assertEquals("UNAVAILABLE", endpointStatus.getAvailability());
        Assert.assertEquals("/actuator/prometheus", endpointStatus.getDiagnostics().get("request_path"));
        Assert.assertFalse(endpoint.containsKey("metrics"));
        OperationsModels.Node leader = snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        Assert.assertEquals("LEADER", leader.getRole());
        Assert.assertFalse(leader.getMetrics().containsKey("system"));
        Assert.assertEquals("UNSUPPORTED", leader.getMetricStatuses().get("system").getAvailability());
        Assert.assertEquals("metrics_not_collected", leader.getMetricStatuses().get("system").getReason());
    }

    @Test
    public void testUnmatchedPdEndpointSampleIsNeverAssignedToMembers() throws IOException {
        String cluster = new ObjectMapper().writeValueAsString(Map.of("status", 0,
                "data", Map.of("state", "Cluster_OK", "pdList", List.of(
                        Map.of("restUrl", "http://pd-a:8620", "state", "Up", "role", "Leader"),
                        Map.of("restUrl", "http://pd-b:8620", "state", "Up", "role", "Follower")))));
        HttpServer pd = pdServer(200, cluster, 200, stores());
        AtomicInteger probes = new AtomicInteger();
        pd.removeContext("/actuator/prometheus");
        pd.createContext("/actuator/prometheus", exchange -> {
            probes.incrementAndGet();
            byte[] bytes = ("process_cpu_usage 0.125\njvm_threads_live_threads 8\n" +
                            "untrusted_private_metric 42\n").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }
        Assert.assertEquals(1, probes.get());
        Assert.assertEquals("PARTIAL", snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("pd_metrics_unmapped", snapshot.getSources().get("pd").getReason());
        Map<?, ?> endpoint = (Map<?, ?>) snapshot.getSources().get("pd").getDiagnostics()
                .get("pd_endpoint_metrics");
        Map<?, ?> metrics = (Map<?, ?>) endpoint.get("metrics");
        Assert.assertEquals(0.125D, metrics.get("process_cpu_usage"));
        Assert.assertEquals(8D, metrics.get("threads_live"));
        Assert.assertFalse(metrics.containsKey("untrusted_private_metric"));
        Assert.assertEquals("AVAILABLE", ((MetricStatus) endpoint.get("metric_status")).getAvailability());
        for (OperationsModels.Node node : snapshot.getNodes()) {
            if ("PD".equals(node.getType())) {
                Assert.assertFalse(node.getMetrics().containsKey("system"));
                Assert.assertEquals("metrics_not_collected", node.getMetricStatuses().get("system").getReason());
            }
        }
    }

    @Test
    public void testUnmatchedPdEndpointSampleIsNotCollectedForTopologyOnly() throws IOException {
        HttpServer pd = pdServer(200, cluster().replace("http://pd:8620", "http://pd-alias:8620"),
                                 200, stores());
        AtomicInteger probes = new AtomicInteger();
        pd.removeContext("/actuator/prometheus");
        pd.createContext("/actuator/prometheus", exchange -> {
            probes.incrementAndGet();
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }
        Assert.assertEquals(0, probes.get());
        Assert.assertFalse(snapshot.getSources().get("pd").getDiagnostics().containsKey("pd_endpoint_metrics"));
    }

    @Test
    public void testMalformedUnmatchedPdSampleDoesNotExposePayload() throws IOException {
        HttpServer pd = pdServer(200, cluster().replace("http://pd:8620", "http://pd-alias:8620"),
                                 200, stores());
        pd.removeContext("/actuator/prometheus");
        pd.createContext("/actuator/prometheus", exchange -> {
            byte[] bytes = "untrusted_secret_metric 99\n".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }
        Map<?, ?> endpoint = (Map<?, ?>) snapshot.getSources().get("pd").getDiagnostics()
                .get("pd_endpoint_metrics");
        MetricStatus result = (MetricStatus) endpoint.get("metric_status");
        Assert.assertEquals("MALFORMED", result.getAvailability());
        Assert.assertFalse(endpoint.containsKey("metrics"));
        Assert.assertFalse(new ObjectMapper().writeValueAsString(snapshot).contains("untrusted_secret_metric"));
        Assert.assertEquals("pd_metrics_unmapped", snapshot.getSources().get("pd").getReason());
    }

    @Test
    public void testUnmatchedPdMetricsDoesNotAttributeFailureToDiscoveredNodes()
           throws IOException {
        String cluster = new ObjectMapper().writeValueAsString(Map.of("status", 0,
                "data", Map.of("state", "Cluster_OK", "pdList", List.of(
                        Map.of("restUrl", "http://pd-a:8620", "state", "Up", "role", "Leader"),
                        Map.of("restUrl", "http://pd-b:8620", "state", "Up", "role", "Follower"),
                        Map.of("restUrl", "http://pd-c:8620", "state", "Up", "role", "Follower")))));
        HttpServer pd = pdServer(200, cluster, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("UP", snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals(1, snapshot.getSources().get("pd").getDiagnostics().get("affected_node_count"));
        for (OperationsModels.Node node : snapshot.getNodes()) {
            if ("PD".equals(node.getType())) {
                Assert.assertEquals("UP", node.getStatus());
                Assert.assertFalse(node.getMetrics().containsKey("system"));
                Assert.assertEquals("UNSUPPORTED", node.getMetricStatuses().get("system").getAvailability());
                Assert.assertEquals("metrics_not_collected", node.getMetricStatuses().get("system").getReason());
            }
        }
    }

    @Test
    public void testPdMetricsAttachToMatchedFollowerRatherThanLeader()
           throws IOException {
        String cluster = "{\"status\":0,\"data\":{\"state\":\"Cluster_OK\"," +
                         "\"pdList\":[{\"restUrl\":\"http://pd-leader:8620\"," +
                         "\"state\":\"Up\",\"role\":\"Leader\"},{" +
                         "\"restUrl\":\"http://pd:8620\",\"state\":\"Up\"," +
                         "\"role\":\"Follower\"}],\"pdLeader\":{" +
                         "\"restUrl\":\"http://pd-leader:8620\",\"state\":\"Up\"}}}";
        HttpServer pd = pdServer(200, cluster, 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("AVAILABLE", snapshot.getSources().get("pd").getAvailability());
        for (OperationsModels.Node node : snapshot.getNodes()) {
            if (!"PD".equals(node.getType())) {
                continue;
            }
            boolean leader = "LEADER".equals(node.getRole());
            Assert.assertEquals(!leader, node.getMetrics().containsKey("system"));
            Assert.assertEquals(leader ? "UNSUPPORTED" : "AVAILABLE",
                                node.getMetricStatuses().get("system").getAvailability());
        }
    }

    @Test
    public void testPdMetricsMatchCanonicalAdvertisedUrl() throws IOException {
        for (String address : new String[]{"http://pd:8620/", "PD_TEST_AUTHORITY"}) {
            HttpServer pd = pdServer(200, cluster().replace("http://pd:8620", address),
                                     200, stores());
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(serverClient(), true);
            } finally {
                pd.stop(0);
            }

            Assert.assertEquals("AVAILABLE", snapshot.getSources().get("pd").getAvailability());
            OperationsModels.Node node = snapshot.getNodes().stream()
                    .filter(value -> "PD".equals(value.getType()))
                    .findFirst().orElseThrow(AssertionError::new);
            Assert.assertTrue(node.getMetrics().containsKey("system"));
            Assert.assertEquals("AVAILABLE", node.getMetricStatuses().get("system").getAvailability());
        }
    }

    @Test
    public void testStoreTargetsPreferDedicatedEndpointWithoutBroadDiscovery()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        context(pd, "/v1/prom/targets/store", 200,
                targets("127.0.0.1:" + pd.getAddress().getPort()));
        AtomicInteger fallback = fallbackTargets(pd);
        storeMetricContexts(pd);
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals(0, fallback.get());
        Assert.assertEquals("AVAILABLE", snapshot.getSources().get("stores").getAvailability());
    }

    @Test
    public void testMalformedTargetDiscoveryRetainsActualPreferredOrFallbackPath()
           throws IOException {
        for (boolean preferred : new boolean[]{true, false}) {
            HttpServer pd = pdServer(200, cluster(), 200, stores());
            context(pd, "/v1/prom/targets/store", preferred ? 200 : 404, "{bad");
            AtomicInteger legacyRequests = new AtomicInteger();
            pd.createContext("/v1/prom/targets-all", exchange -> {
                legacyRequests.incrementAndGet();
                byte[] bytes = "{bad".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
            });
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(serverClient(), true);
            } finally {
                pd.stop(0);
            }

            String path = preferred ? "/v1/prom/targets/store" : "/v1/prom/targets-all";
            Assert.assertEquals(preferred ? 0 : 1, legacyRequests.get());
            OperationsModels.SourceStatus source = snapshot.getSources().get("stores");
            Assert.assertEquals("PARTIAL", source.getAvailability());
            Assert.assertEquals("malformed_response", source.getReason());
            Assert.assertEquals(Collections.singletonMap("request_path", path), source.getDiagnostics());
            for (String group : new String[]{"system", "drive", "raft"}) {
                MetricStatus status = store(snapshot).getMetricStatuses().get(group);
                Assert.assertEquals("MALFORMED", status.getAvailability());
                Assert.assertEquals(Collections.singletonMap("request_path", path), status.getDiagnostics());
            }
        }
    }

    @Test
    public void testStoreTargetsFallbackOnlyWhenEndpointIsUnsupported()
           throws IOException {
        for (int status : new int[]{404, 405, 401, 403, 500, 200}) {
            HttpServer pd = pdServer(200, cluster(), 200, stores());
            context(pd, "/v1/prom/targets/store", status, "{malformed");
            AtomicInteger fallback = fallbackTargets(pd);
            storeMetricContexts(pd);
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(serverClient(), true);
            } finally {
                pd.stop(0);
            }

            boolean unsupported = status == 404 || status == 405;
            Assert.assertEquals(unsupported ? 1 : 0, fallback.get());
            Assert.assertEquals(unsupported ? "AVAILABLE" : "PARTIAL",
                                snapshot.getSources().get("stores").getAvailability());
        }
    }

    @Test
    public void testStoreMetricsUseOnlyPdDiscoveredTarget() throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200,
                "[{\"targets\":[\"" + base + "\"],\"labels\":{" +
                "\"__app_name\":\"store\",\"__scheme__\":\"http\"}}]");
        context(pd, "/metrics/system", 200,
                "{\"heap\":{\"used\":64,\"secret\":\"drop\"}}");
        context(pd, "/metrics/drive", 200,
                "{\"/secret\":{\"total_space\":10," +
                "\"usable_space\":4,\"size_unit\":\"MB\"}}");
        context(pd, "/metrics/raft", 200,
                "{\"0\":{\"enabled\":true,\"metrics\":{}}}");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        OperationsModels.Node store = snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        Assert.assertTrue(store.getMetrics().containsKey("system"));
        Assert.assertTrue(store.getMetrics().containsKey("drive"));
        Assert.assertTrue(store.getMetrics().containsKey("raft"));
        for (String group : new String[]{"system", "drive", "raft",
                                         "backend"}) {
            Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                                    .get(group).getAvailability());
        }
        Assert.assertEquals(Long.valueOf(2000L), store.getObservedAt());
        Assert.assertEquals(100L,
                            snapshot.getFacts().get("capacity_total_bytes"));
        Assert.assertEquals(60L,
                            snapshot.getFacts().get("capacity_used_bytes"));
        Assert.assertFalse(store.getMetrics().toString().contains("secret"));
        OperationsModels.Node pdNode = snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        Assert.assertTrue(pdNode.getMetrics().containsKey("system"));
        Assert.assertEquals(Long.valueOf(2000L), pdNode.getObservedAt());
    }

    @Test
    public void testDirectMetricFailurePreservesPdStoreStatus() {
        RecordingHttpClient http = new RecordingHttpClient(
                storesWithDifferentRestAddresses(),
                targets("127.0.0.1:8520", "127.0.0.1:9520"));
        http.unavailableAuthority("127.0.0.1:9520");
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals("UP",
                            snapshot.getSources().get("pd").getStatus());
        Assert.assertEquals("UP",
                            snapshot.getSources().get("stores").getStatus());
        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Long.valueOf(2L),
                            snapshot.getFacts().get("stores"));
        Assert.assertEquals(Long.valueOf(2L),
                            snapshot.getFacts().get("stores_up"));
        Assert.assertEquals(0L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "DOWN".equals(node.getStatus()))
                .count());
        Assert.assertEquals(1L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "upstream_unavailable".equals(
                        node.getMetricStatuses().get("system").getReason()))
                .count());
    }

    @Test
    public void testDirectMetricFailurePreservesPdReportedDownStore() {
        RecordingHttpClient http = new RecordingHttpClient(
                storesWithDifferentRestAddresses().replace("\"Up\"", "\"Offline\""),
                targets("127.0.0.1:8520", "127.0.0.1:9520"));
        http.unavailableAuthority("127.0.0.1:9520");
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals("DOWN",
                            snapshot.getSources().get("stores").getStatus());
        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Long.valueOf(0L),
                            snapshot.getFacts().get("stores_up"));
        Assert.assertEquals(2L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "DOWN".equals(node.getStatus()))
                .count());
    }

    @Test
    public void testMalformedStoresKeepValidPdTopologyAndFacts()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, "{bad");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("MALFORMED",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Map.of("request_path", "/v1/stores"),
                            snapshot.getSources().get("stores").getDiagnostics());
        Assert.assertTrue(snapshot.getNodes().stream()
                                  .anyMatch(node -> "PD".equals(node.getType())));
        Assert.assertEquals(2L, snapshot.getFacts().get("graphs"));
    }

    @Test
    public void testAllMissingStoreMetricEndpointsAreUnsupported()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200,
                "[{\"targets\":[\"" + base + "\"],\"labels\":{" +
                "\"__app_name\":\"store\",\"__scheme__\":\"http\"}}]");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("UNSUPPORTED",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals("unsupported_version",
                            snapshot.getSources().get("stores").getReason());
        OperationsModels.Node store = store(snapshot);
        for (String group : new String[]{"system", "drive", "raft"}) {
            MetricStatus metric = store.getMetricStatuses().get(group);
            Assert.assertEquals("UNSUPPORTED", metric.getAvailability());
            Assert.assertEquals("unsupported_version", metric.getReason());
        }
    }

    @Test
    public void testUnsupportedStoreMetricsDoNotHideConfirmedTopologyFailures()
           throws IOException {
        for (String status : new String[]{"UP", "DEGRADED", "DOWN"}) {
            String stores = stores();
            if ("DOWN".equals(status)) {
                stores = stores.replace("\"Up\"", "\"Offline\"");
            } else if ("DEGRADED".equals(status)) {
                stores = stores.replace("}]}}", "},{\"storeId\":\"2\",\"address\":\"127.0.0.1:8501\"," +
                        "\"restAddress\":\"127.0.0.1:PD_TEST_PORT\",\"state\":\"Offline\"}]}}");
            }
            String cluster = cluster().replace("http://pd:8620", "http://127.0.0.1:PD_TEST_PORT");
            HttpServer pd = pdServer(200, cluster, 200, stores);
            context(pd, "/v1/prom/targets-all", 200,
                    targets("127.0.0.1:" + pd.getAddress().getPort()));
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(serverClient(), true);
            } finally {
                pd.stop(0);
            }

            Assert.assertEquals("UNSUPPORTED", snapshot.getSources().get("stores").getAvailability());
            Assert.assertEquals(status, snapshot.getSources().get("stores").getStatus());
            Assert.assertEquals("UP".equals(status) ? "UP" : "DEGRADED", snapshot.getStatus());
        }
    }

    @Test
    public void testPartialStoreMetricsIncludeUnsupportedGroupDiagnostics()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200, targets(base));
        context(pd, "/metrics/system", 200, "{\"heap\":{\"used\":1}}");
        context(pd, "/metrics/drive", 200, "{\"disk\":{\"total_space\":10}}");
        context(pd, "/metrics/raft", 404, "private-response");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("PARTIAL", snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Map.of("affected_node_count", 1,
                                   "failed_metric_groups", Collections.singletonList("raft")),
                            snapshot.getSources().get("stores").getDiagnostics());
        MetricStatus metric = store(snapshot).getMetricStatuses().get("raft");
        Assert.assertEquals("UNSUPPORTED", metric.getAvailability());
        Assert.assertEquals(Map.of("request_path", "/metrics/raft", "http_status", 404,
                                   "metric_group", "raft"), metric.getDiagnostics());
    }

    @Test
    public void testMalformedStoreRestAddressRetainsDiscoveryPath() throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200,
                stores().replace("127.0.0.1:PD_TEST_PORT", "invalid address"));
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }
        Assert.assertEquals("malformed_response", snapshot.getSources().get("stores").getReason());
        Assert.assertEquals(Map.of("request_path", "/v1/stores"),
                            snapshot.getSources().get("stores").getDiagnostics());
        for (String group : new String[]{"system", "drive", "raft"}) {
            MetricStatus status = store(snapshot).getMetricStatuses().get(group);
            Assert.assertEquals("MALFORMED", status.getAvailability());
            Assert.assertEquals(Map.of("request_path", "/v1/stores"), status.getDiagnostics());
        }
    }

    @Test
    public void testStoreFailureSummaryExcludesTopologyPlaceholders() {
        RecordingHttpClient http = new RecordingHttpClient(storesWithDifferentRestAddresses(),
                targets("127.0.0.1:8520", "127.0.0.1:9520"));
        http.unavailableAuthority("127.0.0.1:8520");
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }
        Assert.assertEquals("PARTIAL", snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Map.of("affected_node_count", 1,
                                  "failed_metric_groups", Arrays.asList("system", "drive", "raft")),
                            snapshot.getSources().get("stores").getDiagnostics());
        Assert.assertEquals(1L, snapshot.getNodes().stream().filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "topology_fields_unavailable".equals(
                        node.getMetricStatuses().get("backend").getReason())).count());
    }

    @Test
    public void testMalformedMetricDiscoveryResponsesRetainPaths()
           throws IOException {
        for (String path : new String[]{"/actuator/prometheus", "/v1/prom/targets-all"}) {
            HttpServer pd = pdServer(200, cluster(), 200, stores());
            if ("/actuator/prometheus".equals(path)) {
                pd.removeContext(path);
            }
            context(pd, path, 200, "private-malformed-response");
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(serverClient(), true);
            } finally {
                pd.stop(0);
            }

            String type = "/actuator/prometheus".equals(path) ? "PD" : "STORE";
            String source = "PD".equals(type) ? "pd" : "stores";
            Assert.assertEquals("malformed_response", snapshot.getSources().get(source).getReason());
            Assert.assertEquals(Map.of("request_path", path),
                                snapshot.getSources().get(source).getDiagnostics());
            snapshot.getNodes().stream().filter(node -> type.equals(node.getType()))
                    .flatMap(node -> node.getMetricStatuses().values().stream())
                    .filter(status -> "MALFORMED".equals(status.getAvailability()))
                    .forEach(status -> Assert.assertEquals(Map.of("request_path", path),
                                                          status.getDiagnostics()));
            Assert.assertTrue(snapshot.getNodes().stream().filter(node -> type.equals(node.getType()))
                    .flatMap(node -> node.getMetricStatuses().values().stream())
                    .anyMatch(status -> "MALFORMED".equals(status.getAvailability())));
        }
    }

    @Test
    public void testOversizedDiscoveryResponsesKeepSourceDiagnostics()
           throws IOException {
        for (String path : new String[]{"/v1/stores", "/v1/members",
                                        "/v1/prom/targets-all"}) {
            HttpServer pd = pdServer(200, "/v1/members".equals(path) ?
                                          "x".repeat(9000) : cluster(),
                                     200, "/v1/stores".equals(path) ?
                                          "x".repeat(9000) : stores());
            if ("/v1/prom/targets-all".equals(path)) {
                context(pd, path, 200, "x".repeat(9000));
            }
            Snapshot snapshot;
            try {
                snapshot = collector(true, pd).collect(
                           serverClient(), "/v1/prom/targets-all".equals(path));
            } finally {
                pd.stop(0);
            }

            String source = "/v1/members".equals(path) ? "pd" : "stores";
            Assert.assertEquals("response_too_large",
                                snapshot.getSources().get(source).getReason());
            Assert.assertEquals(Map.of("request_path", path,
                                       "max_response_bytes", 8192L,
                                       "response_bytes", 9000L,
                                       "response_size_exact", true),
                                snapshot.getSources().get(source).getDiagnostics());
        }
    }

    @Test
    public void testStoreMetricFailureKeepsSpecificSafeReason()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200,
                "[{\"targets\":[\"" + base + "\"],\"labels\":{" +
                "\"__app_name\":\"store\",\"__scheme__\":\"http\"}}]");
        context(pd, "/metrics/system", 200, "x".repeat(9000));
        context(pd, "/metrics/drive", 200,
                "{\"disk\":{\"total_space\":10}}");
        context(pd, "/metrics/raft", 200,
                "{\"0\":{\"enabled\":true}}");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals("response_too_large",
                            snapshot.getSources().get("stores").getReason());
        OperationsModels.Node store = store(snapshot);
        Assert.assertEquals("UNAVAILABLE", store.getMetricStatuses()
                                                .get("system").getAvailability());
        Assert.assertEquals("response_too_large", store.getMetricStatuses()
                                                   .get("system").getReason());
        Assert.assertEquals(Map.of("request_path", "/metrics/system",
                                   "max_response_bytes", 8192L,
                                   "response_bytes", 9000L,
                                   "response_size_exact", true,
                                   "metric_group", "system"),
                            store.getMetricStatuses().get("system").getDiagnostics());
        Assert.assertEquals(Map.of("affected_node_count", 1,
                                   "failed_metric_groups", Collections.singletonList("system")),
                            snapshot.getSources().get("stores").getDiagnostics());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("drive").getAvailability());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("raft").getAvailability());
    }

    @Test
    public void testMalformedSingleStoreMetricKeepsOtherGroupsAvailable()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200,
                "[{\"targets\":[\"" + base + "\"],\"labels\":{" +
                "\"__app_name\":\"store\",\"__scheme__\":\"http\"}}]");
        context(pd, "/metrics/system", 200, "{bad");
        context(pd, "/metrics/drive", 200,
                "{\"disk\":{\"total_space\":10}}");
        context(pd, "/metrics/raft", 200,
                "{\"0\":{\"enabled\":true}}");
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        OperationsModels.Node store = store(snapshot);
        Assert.assertEquals("MALFORMED", store.getMetricStatuses()
                                              .get("system").getAvailability());
        Assert.assertEquals("malformed_response", store.getMetricStatuses()
                                                   .get("system").getReason());
        Assert.assertEquals(Map.of("request_path", "/metrics/system", "metric_group", "system"),
                            store.getMetricStatuses().get("system").getDiagnostics());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("drive").getAvailability());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("raft").getAvailability());
    }

    @Test
    public void testTimedOutSingleStoreMetricKeepsOtherGroupsAvailable()
           throws IOException {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        String base = "127.0.0.1:" + pd.getAddress().getPort();
        context(pd, "/v1/prom/targets-all", 200,
                "[{\"targets\":[\"" + base + "\"],\"labels\":{" +
                "\"__app_name\":\"store\",\"__scheme__\":\"http\"}}]");
        context(pd, "/metrics/system", 200,
                "{\"heap\":{\"used\":1}}");
        context(pd, "/metrics/drive", 200,
                "{\"disk\":{\"total_space\":10}}");
        delayedContext(pd, "/metrics/raft", 200,
                       "{\"0\":{\"enabled\":true}}", 200L);
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd, 50, 8192)
                       .collect(serverClient(), true);
        } finally {
            pd.stop(0);
        }

        OperationsModels.Node store = store(snapshot);
        Assert.assertEquals("UNAVAILABLE", store.getMetricStatuses()
                                                .get("raft").getAvailability());
        Assert.assertEquals("upstream_timeout", store.getMetricStatuses()
                                                 .get("raft").getReason());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("system").getAvailability());
        Assert.assertEquals("AVAILABLE", store.getMetricStatuses()
                                              .get("drive").getAvailability());
    }

    @Test
    public void testRestAddressDisambiguatesStoresOnSameHost() {
        String stores = storesWithDifferentRestAddresses();
        RecordingHttpClient http = new RecordingHttpClient(stores,
                                     targets("127.0.0.1:8520",
                                             "127.0.0.1:9520"));
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(2L, snapshot.getNodes().stream()
                                       .filter(node -> "STORE".equals(
                                               node.getType())).count());
        Assert.assertEquals(6, http.metricRequests());
        Assert.assertEquals(new java.util.HashSet<>(java.util.Arrays.asList(
                            "127.0.0.1:8520", "127.0.0.1:9520")),
                            http.metricAuthorities());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testLegacyStoreWithoutRestAddressIsNeverRead() {
        RecordingHttpClient http = new RecordingHttpClient(
                                     storesWithoutRestAddress(), targets(
                                     "127.0.0.1:8520",
                                     "127.0.0.1:9520"));
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(0, http.metricRequests());
        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
        Assert.assertEquals("metrics_target_missing",
                            snapshot.getSources().get("stores").getReason());
        Assert.assertEquals("metrics_target_missing",
                            store(snapshot).getMetricStatuses().get("system")
                                           .getReason());
    }

    @Test
    public void testChangedRestPortRejectsStalePdTarget() {
        RecordingHttpClient http = new RecordingHttpClient(
                                     storesWithRestAddresses(1, 9520),
                                     targets("127.0.0.1:8520"));
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(0, http.metricRequests());
        Assert.assertEquals("metrics_target_missing",
                            snapshot.getSources().get("stores").getReason());
    }

    @Test
    public void testOperatorAllowlistRejectsWrongOrigin() {
        RecordingHttpClient http = new RecordingHttpClient(
                storesWithRestAddresses(1, 8520),
                targets("127.0.0.1:8520"));
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, "http://pd:8620", "hubble", "secret",
                "store-hubble", "store-secret", "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                4, 1000, Collections.singleton(
                         "http://store.internal:8520"));
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(0, http.metricRequests());
        Assert.assertEquals("metrics_target_untrusted",
                            snapshot.getSources().get("stores").getReason());
    }

    @Test
    public void testOperatorAllowlistAcceptsExactPrivateStoreOrigin() {
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"1\",\"address\":" +
                        "\"store.internal:8500\",\"restAddress\":" +
                        "\"store.internal:8520\",\"state\":\"Up\"}]}}";
        RecordingHttpClient http = new RecordingHttpClient(
                                     stores, targets("store.internal:8520"));
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, "http://pd:8620", "hubble", "secret",
                "store-hubble", "store-secret", "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                4, 1000, Collections.singleton(
                         "http://store.internal:8520"));
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(3, http.metricRequests());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testOperatorAllowlistRejectsWrongPort() {
        RecordingHttpClient http = new RecordingHttpClient(
                storesWithRestAddresses(1, 8520),
                targets("127.0.0.1:8520"));
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, "http://pd:8620", "hubble", "secret",
                "store-hubble", "store-secret", "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                4, 1000, Collections.singleton("http://127.0.0.1:9520"));
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(0, http.metricRequests());
        Assert.assertEquals("metrics_target_untrusted",
                            snapshot.getSources().get("stores").getReason());
    }

    @Test
    public void testOperatorAllowlistAcceptsConfiguredHttpsOrigin() {
        RecordingHttpClient http = new RecordingHttpClient(
                storesWithRestAddresses(1, 8520),
                targetsWithScheme("https", "127.0.0.1:8520"));
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, "http://pd:8620", "hubble", "secret",
                "store-hubble", "store-secret", "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                4, 1000, Collections.singleton("https://127.0.0.1:8520"));
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(3, http.metricRequests());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testDefaultOperatorAllowlistAcceptsIpv6Loopback() {
        String stores = "{\"status\":0,\"data\":{\"stores\":[{" +
                        "\"storeId\":\"1\",\"address\":" +
                        "\"[::1]:8500\",\"restAddress\":\"[::1]:8520\"," +
                        "\"state\":\"Up\"}]}}";
        RecordingHttpClient http = new RecordingHttpClient(
                                     stores, targets("[::1]:8520"));
        LiveOperationsCollector collector = collector(http, 4, 1000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(3, http.metricRequests());
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testStoreFanoutSupportsThreeThirtyAndThreeHundredNodes() {
        for (int stores : new int[]{3, 30, 300}) {
            RecordingHttpClient http = new RecordingHttpClient(
                                         storesWithRestAddresses(stores, 8520),
                                         targets("127.0.0.1:8520"));
            LiveOperationsCollector collector = collector(http, 8, 5000);
            Snapshot snapshot;
            try {
                snapshot = collector.collect(serverClient(), true);
            } finally {
                collector.close();
            }
            Assert.assertEquals(stores * 3, http.metricRequests());
            Assert.assertEquals(stores, snapshot.getNodes().stream()
                                               .filter(node -> "STORE".equals(
                                                       node.getType())).count());
        }
    }

    @Test
    public void testStoreFanoutIsBoundedAndPreservesCompletedResults() {
        RecordingHttpClient http = new RecordingHttpClient(
                                     storesWithRestAddresses(30, 8520),
                                     targets("127.0.0.1:8520"));
        http.delayMillis(10L);
        LiveOperationsCollector collector = collector(http, 4, 5000);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertTrue(http.maxConcurrentRequests() > 1);
        Assert.assertTrue(http.maxConcurrentRequests() <= 4);
        Assert.assertEquals("AVAILABLE",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
    }

    @Test
    public void testStoreFanoutDeadlineCancelsPendingNodesAndReleasesThreads()
           throws InterruptedException {
        RecordingHttpClient http = new RecordingHttpClient(
                                     storesWithRestAddresses(30, 8520),
                                     targets("127.0.0.1:8520"));
        http.delayMillis(10000L);
        LiveOperationsCollector collector = collector(http, 4, 50);
        long started = System.nanoTime();
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }
        long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

        Assert.assertTrue(elapsed < 3000L);
        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores")
                                    .getAvailability());
        Assert.assertEquals("upstream_deadline",
                            snapshot.getSources().get("stores").getReason());
        Assert.assertEquals("UP",
                            snapshot.getSources().get("stores").getStatus());
        Assert.assertEquals(Long.valueOf(30L),
                            snapshot.getFacts().get("stores_up"));
        Assert.assertTrue(snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .allMatch(node -> "UP".equals(node.getStatus()) &&
                                  "UNAVAILABLE".equals(node.getMetricStatuses()
                                                         .get("system").getAvailability())));
        Assert.assertEquals(0, http.activeRequests());
    }

    @Test
    public void testStoreFanoutDeadlinePreservesFastNodeResults() {
        RecordingHttpClient http = new RecordingHttpClient(
                                     storesWithDifferentRestAddresses(),
                                     targets("127.0.0.1:8520",
                                             "127.0.0.1:9520"));
        http.delayAuthority("127.0.0.1:9520", 10000L);
        LiveOperationsCollector collector = collector(http, 2, 250);
        Snapshot snapshot;
        try {
            snapshot = collector.collect(serverClient(), true);
        } finally {
            collector.close();
        }

        Assert.assertEquals(1L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "AVAILABLE".equals(node.getMetricStatuses()
                                                     .get("system")
                                                     .getAvailability()))
                .count());
        Assert.assertEquals(1L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "upstream_deadline".equals(
                        node.getMetricStatuses().get("system").getReason()))
                .count());
        Assert.assertEquals(0L, snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .filter(node -> "DOWN".equals(node.getStatus()))
                .count());
        Assert.assertEquals("UP",
                            snapshot.getSources().get("stores").getStatus());
        Assert.assertEquals("PARTIAL",
                            snapshot.getSources().get("stores").getAvailability());
        Assert.assertEquals(Long.valueOf(2L),
                            snapshot.getFacts().get("stores_up"));
    }

    @Test
    public void testMalformedPdIsClassifiedWithoutLeakingPayload()
           throws IOException {
        HttpServer pd = pdServer(200, "{bad", 200, stores());
        Snapshot snapshot;
        try {
            snapshot = collector(true, pd).collect(serverClient(), false);
        } finally {
            pd.stop(0);
        }

        Assert.assertEquals("MALFORMED",
                            snapshot.getSources().get("pd").getAvailability());
        Assert.assertEquals("malformed_response",
                            snapshot.getSources().get("pd").getReason());
        Assert.assertEquals(Map.of("request_path", "/v1/members"),
                            snapshot.getSources().get("pd").getDiagnostics());
    }

    @Test
    public void testMalformedPdMembersDoNotEnterMetricMappingOrHideOtherSources()
           throws IOException {
        for (String memberField : new String[]{"", ",\"pdList\":null",
                                                ",\"pdList\":{}", ",\"pdList\":123"}) {
            String payload = "{\"status\":0,\"data\":{\"state\":\"Cluster_OK\"," +
                             "\"pdLeader\":{\"restUrl\":\"http://private-canary:8620/private-path\"}" +
                             memberField + "}}";
            HttpServer pd = pdServer(200, payload, 200, stores());
            pd.removeContext("/actuator/prometheus");
            AtomicInteger metricRequests = new AtomicInteger();
            pd.createContext("/actuator/prometheus", exchange -> {
                metricRequests.incrementAndGet();
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
            });
            context(pd, "/v1/prom/targets/store", 200,
                    targets("127.0.0.1:" + pd.getAddress().getPort()));
            storeMetricContexts(pd);
            LiveOperationsCollector collector = collector(true, pd);
            Snapshot snapshot;
            try {
                snapshot = collector.collect(serverClient(), true);
            } finally {
                collector.close();
                pd.stop(0);
            }

            OperationsModels.SourceStatus source = snapshot.getSources().get("pd");
            Assert.assertEquals("MALFORMED", source.getAvailability());
            Assert.assertEquals("malformed_response", source.getReason());
            Assert.assertEquals(Set.of("request_path"), source.getDiagnostics().keySet());
            Assert.assertTrue(Set.of("/v1/cluster", "/v1/members")
                                 .contains(source.getDiagnostics().get("request_path")));
            Assert.assertEquals(0, metricRequests.get());
            Assert.assertFalse(snapshot.getNodes().stream().anyMatch(node -> "PD".equals(node.getType())));
            Assert.assertEquals("AVAILABLE", snapshot.getSources().get("server").getAvailability());
            Assert.assertEquals("AVAILABLE", snapshot.getSources().get("stores").getAvailability());
            Assert.assertFalse(new ObjectMapper().writeValueAsString(snapshot).contains("private-canary"));
            Assert.assertFalse(new ObjectMapper().writeValueAsString(snapshot).contains("private-path"));
        }
    }

    private static LiveOperationsCollector collector(boolean pdEnabled,
                                                      HttpServer pd) {
        return collector(pdEnabled, pd, 1000, 8192);
    }

    private static LiveOperationsCollector collector(boolean pdEnabled,
                                                      HttpServer pd,
                                                      int readTimeout,
                                                      int maxResponseBytes) {
        String pdBase = pd == null ? null : "http://127.0.0.1:" +
                                              pd.getAddress().getPort();
        OperationsHttpClient http = new OperationsHttpClient(
                                    1000, readTimeout, maxResponseBytes);
        return new LiveOperationsCollector(pdEnabled, pdBase, "hubble", "secret",
                "store-hubble", "store-secret",
                "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                16, 5000, pd == null ? Collections.singleton(
                        "http://127.0.0.1:8520") : Collections.singleton(
                        "http://127.0.0.1:" + pd.getAddress().getPort()));
    }

    private static LiveOperationsCollector collector(
            boolean pdEnabled, HttpServer pd,
            LiveOperationsCollector.ServerClientProvider servers) {
        return collector(pdEnabled, pd, servers, 5000);
    }

    private static LiveOperationsCollector collector(
            boolean pdEnabled, HttpServer pd,
            LiveOperationsCollector.ServerClientProvider servers,
            int deadlineMillis) {
        String pdBase = "http://127.0.0.1:" + pd.getAddress().getPort();
        return new LiveOperationsCollector(
                pdEnabled, pdBase, "hubble", "secret", "store-hubble",
                "store-secret", "server-under-test",
                new OperationsHttpClient(1000, 1000, 8192),
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                16, deadlineMillis, Collections.singleton(pdBase), servers);
    }

    @Test
    public void testPdReadinessIsIndependentFromRegistrationAndRetains503State() throws Exception {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        context(pd, "/v1/ready", 503,
                "{\"ready\":false,\"state\":\"STATE_ERROR\",\"isLeader\":false}");
        LiveOperationsCollector collector = collector(true, pd);
        try {
            Snapshot snapshot = collector.collect(serverClient(), true);
            OperationsModels.Node node = snapshot.getNodes().stream()
                    .filter(item -> "PD".equals(item.getType())).findFirst().orElseThrow();
            Assert.assertEquals("UP", node.getStatus());
            Assert.assertEquals("DEGRADED", snapshot.getStatus());
            Assert.assertEquals("NOT_READY", node.getReadiness().getStatus());
            Assert.assertEquals("STATE_ERROR", node.getReadiness().getState());
            Assert.assertEquals("pd_raft_error", node.getReadiness().getReason());
            Assert.assertEquals(503, node.getReadiness().getDiagnostics().get("http_status"));
        } finally {
            collector.close();
            pd.stop(0);
        }
    }

    @Test
    public void testStoreStartingAndOnlineDoNotRewritePdRegistration() throws Exception {
        for (String state : new String[]{"STARTING", "ONLINE", "STOPPING"}) {
            HttpServer pd = pdServer(200, cluster(), 200, stores());
            context(pd, "/v1/ready", 200, "{\"ready\":true,\"state\":\"STATE_FOLLOWER\"}");
            context(pd, "/-/state", 200, "{\"status\":0,\"text\":\"" + state + "\"}");
            context(pd, "/v1/prom/targets/store", 200,
                    targets("127.0.0.1:" + pd.getAddress().getPort()));
            storeMetricContexts(pd);
            LiveOperationsCollector collector = collector(true, pd);
            try {
                OperationsModels.Node node = store(collector.collect(serverClient(), true));
                Assert.assertEquals("UP", node.getStatus());
                Assert.assertEquals("ONLINE".equals(state) ? "READY" : "NOT_READY",
                                    node.getReadiness().getStatus());
                Assert.assertEquals(state, node.getReadiness().getState());
                Assert.assertEquals("AVAILABLE", node.getMetricStatuses().get("system").getAvailability());
            } finally {
                collector.close();
                pd.stop(0);
            }
        }
    }

    @Test
    public void testStoreLifecycleIsIndependentOfReadinessAndOldStore404() throws Exception {
        for (String state : new String[]{"STARTING", "STARTED", "STOPPING", "UNAVAILABLE", "404"}) {
            HttpServer pd = pdServer(200, cluster(), 200, stores());
            context(pd, "/v1/ready", 200, "{\"ready\":true,\"state\":\"STATE_FOLLOWER\"}");
            context(pd, "/-/state", 200, "{\"status\":0,\"text\":\"STARTING\"}");
            if (!"404".equals(state)) {
                context(pd, "/-/lifecycle", 200, "{\"status\":0,\"text\":\"" + state + "\"}");
            }
            context(pd, "/v1/prom/targets/store", 200, targets("127.0.0.1:" + pd.getAddress().getPort()));
            storeMetricContexts(pd);
            LiveOperationsCollector collector = collector(true, pd);
            try {
                OperationsModels.Node node = store(collector.collect(serverClient(), true));
                Assert.assertEquals("UP", node.getStatus());
                Assert.assertEquals("NOT_READY", node.getReadiness().getStatus());
                Assert.assertEquals("STARTING", node.getReadiness().getState());
                Assert.assertEquals("AVAILABLE", node.getMetricStatuses().get("system").getAvailability());
                Assert.assertEquals("404".equals(state) ? "UNKNOWN" : state,
                                    node.getProcessLifecycle().getState());
                if ("404".equals(state)) {
                    Assert.assertEquals("unsupported_version", node.getProcessLifecycle().getReason());
                }
            } finally {
                collector.close();
                pd.stop(0);
            }
        }
    }

    @Test
    public void testSlowLifecycleDoesNotConsumeReadinessOrMetricBudget() throws Exception {
        java.util.concurrent.ExecutorService upstream = java.util.concurrent.Executors.newCachedThreadPool();
        HttpServer pd = pdServer(200, cluster(), 200, stores(), upstream);
        context(pd, "/v1/ready", 200, "{\"ready\":true,\"state\":\"STATE_FOLLOWER\"}");
        context(pd, "/-/state", 200, "{\"status\":0,\"text\":\"ONLINE\"}");
        delayedContext(pd, "/-/lifecycle", 200, "{\"status\":0,\"text\":\"STARTED\"}", 1000L);
        context(pd, "/v1/prom/targets/store", 200, targets("127.0.0.1:" + pd.getAddress().getPort()));
        storeMetricContexts(pd);
        String base = "http://127.0.0.1:" + pd.getAddress().getPort();
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, base, "hubble", "secret", "store-hubble", "store-secret", "server-under-test",
                new OperationsHttpClient(1000, 2000, 8192), new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                1, 500, Set.of(base));
        try {
            long started = System.nanoTime();
            OperationsModels.Node node = store(collector.collect(serverClient(), true));
            long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            Assert.assertTrue("Lifecycle must share the bounded Store collection budget", elapsed < 900L);
            Assert.assertEquals("READY", node.getReadiness().getStatus());
            Assert.assertEquals("AVAILABLE", node.getMetricStatuses().get("system").getAvailability());
            Assert.assertEquals("UNKNOWN", node.getProcessLifecycle().getState());
            Assert.assertEquals("upstream_deadline", node.getProcessLifecycle().getReason());
        } finally {
            collector.close();
            pd.stop(0);
            upstream.shutdownNow();
        }
    }

    @Test
    public void testMetricDeadlineRetainsAlreadyCompletedStoreReadiness() throws Exception {
        java.util.concurrent.ExecutorService upstream = java.util.concurrent.Executors.newCachedThreadPool();
        HttpServer pd = pdServer(200, cluster(), 200, stores(), upstream);
        context(pd, "/v1/ready", 200, "{\"ready\":true,\"state\":\"STATE_FOLLOWER\"}");
        context(pd, "/-/state", 200, "{\"status\":0,\"text\":\"ONLINE\"}");
        context(pd, "/v1/prom/targets/store", 200,
                targets("127.0.0.1:" + pd.getAddress().getPort()));
        delayedContext(pd, "/metrics/system", 200, "{\"heap\":{\"used\":1}}", 1000L);
        LiveOperationsCollector collector = collector(true, pd, null, 300);
        try {
            OperationsModels.Node node = store(collector.collect(serverClient(), true));
            Assert.assertEquals("UP", node.getStatus());
            Assert.assertEquals("READY", node.getReadiness().getStatus());
            Assert.assertEquals("ONLINE", node.getReadiness().getState());
            Assert.assertEquals(200, node.getReadiness().getDiagnostics().get("http_status"));
            Assert.assertEquals("upstream_deadline", node.getMetricStatuses().get("system").getReason());
        } finally {
            collector.close();
            pd.stop(0);
            upstream.shutdownNow();
        }
    }

    @Test
    public void testSlowStoreReadinessDoesNotConsumeMetricWorkersOrDeadline() throws Exception {
        java.util.concurrent.ExecutorService upstream = java.util.concurrent.Executors.newCachedThreadPool();
        HttpServer pd = pdServer(200, cluster(), 200, stores(), upstream);
        context(pd, "/v1/ready", 200, "{\"ready\":true,\"state\":\"STATE_FOLLOWER\"}");
        delayedContext(pd, "/-/state", 200, "{\"status\":0,\"text\":\"ONLINE\"}", 1000L);
        context(pd, "/v1/prom/targets/store", 200,
                targets("127.0.0.1:" + pd.getAddress().getPort()));
        storeMetricContexts(pd);
        String base = "http://127.0.0.1:" + pd.getAddress().getPort();
        LiveOperationsCollector collector = new LiveOperationsCollector(
                true, base, "hubble", "secret", "store-hubble", "store-secret",
                "server-under-test", new OperationsHttpClient(1000, 2000, 8192),
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                1, 500, Set.of(base));
        try {
            long started = System.nanoTime();
            OperationsModels.Node node = store(collector.collect(serverClient(), true));
            long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            Assert.assertTrue("Readiness must share the bounded Store collection budget", elapsed < 900L);
            for (String group : new String[]{"system", "drive", "raft"}) {
                Assert.assertEquals("AVAILABLE", node.getMetricStatuses().get(group).getAvailability());
            }
            Assert.assertEquals("UP", node.getStatus());
            Assert.assertEquals("UNKNOWN", node.getReadiness().getStatus());
            Assert.assertEquals("upstream_deadline", node.getReadiness().getReason());
        } finally {
            collector.close();
            pd.stop(0);
            upstream.shutdownNow();
        }
    }

    @Test
    public void testPdReadinessReportsActualProxyPathForSuccessAndStructured503() throws Exception {
        for (int status : new int[]{200, 503}) {
            HttpServer pd = pdServer(200, cluster(), 200, "{\"status\":0,\"data\":{\"stores\":[]}}");
            String base = "http://127.0.0.1:" + pd.getAddress().getPort();
            String payload = cluster().replace("http://pd:8620", base + "/pd");
            context(pd, "/pd/v1/cluster", 200, payload);
            context(pd, "/pd/v1/members", 200, payload);
            context(pd, "/pd/v1/stores", 200, "{\"status\":0,\"data\":{\"stores\":[]}}");
            context(pd, "/pd/v1/prom/targets/store", 200, "[]");
            context(pd, "/pd/actuator/prometheus", 200, "process_uptime_seconds 12\n");
            context(pd, "/pd/v1/ready", status,
                    "{\"ready\":" + (status == 200) + ",\"state\":\"STATE_FOLLOWER\"}");
            LiveOperationsCollector collector = new LiveOperationsCollector(
                    true, base + "/pd", "hubble", "secret", "store-hubble", "store-secret",
                    "server-under-test", new OperationsHttpClient(1000, 1000, 8192),
                    new OperationsPayloadParser(new ObjectMapper()), CLOCK, 1, 1000, Set.of(base));
            try {
                OperationsModels.Readiness result = collector.collect(serverClient(), true).getNodes().stream()
                        .filter(node -> "PD".equals(node.getType())).findFirst().orElseThrow().getReadiness();
                Assert.assertEquals(status == 200 ? "READY" : "NOT_READY", result.getStatus());
                Assert.assertEquals("/pd/v1/ready", result.getDiagnostics().get("request_path"));
                Assert.assertEquals(status, result.getDiagnostics().get("http_status"));
            } finally {
                collector.close();
                pd.stop(0);
            }
        }
    }

    @Test
    public void testUnknownReadinessEndpointIsUnsupportedWithoutDowngradingRegistration() throws Exception {
        HttpServer pd = pdServer(200, cluster(), 200, stores());
        LiveOperationsCollector collector = collector(true, pd);
        try {
            OperationsModels.Node node = collector.collect(serverClient(), true).getNodes().stream()
                    .filter(item -> "PD".equals(item.getType())).findFirst().orElseThrow();
            Assert.assertEquals("UP", node.getStatus());
            Assert.assertEquals("UNSUPPORTED", node.getReadiness().getStatus());
            Assert.assertEquals("unsupported_version", node.getReadiness().getReason());
        } finally {
            collector.close();
            pd.stop(0);
        }
    }

    private static LiveOperationsCollector collector(RecordingHttpClient http,
                                                      int threads,
                                                      int deadlineMillis) {
        return new LiveOperationsCollector(true, "http://pd:8620", "hubble",
                "secret", "store-hubble", "store-secret",
                "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                threads, deadlineMillis, new java.util.LinkedHashSet<>(
                        java.util.Arrays.asList("http://127.0.0.1:8520",
                                              "http://127.0.0.1:9520",
                                              "http://[::1]:8520")));
    }

    private static LiveOperationsCollector leaderAwareCollector(
            LeaderAwareHttpClient http) {
        return new LiveOperationsCollector(
                true, "http://pd-service:8620", "hubble", "secret",
                "store-hubble", "store-secret", "server-under-test", http,
                new OperationsPayloadParser(new ObjectMapper()), CLOCK,
                4, 1000, Collections.singleton("http://127.0.0.1:8520"));
    }

    private static HugeClient serverClient() {
        HugeClient client = Mockito.mock(HugeClient.class);
        VersionManager version = Mockito.mock(VersionManager.class);
        Mockito.when(version.getCoreVersion()).thenReturn("1.7.0");
        Mockito.when(client.versionManager()).thenReturn(version);
        MetricsManager metrics = Mockito.mock(MetricsManager.class);
        Map<String, Map<String, Object>> system = new LinkedHashMap<>();
        system.put("heap", Collections.singletonMap("used", 128L));
        Mockito.when(metrics.system()).thenReturn(system);
        Map<String, Map<String, Object>> backend = new LinkedHashMap<>();
        Map<String, Object> graph = new LinkedHashMap<>();
        graph.put("backend", "hstore");
        graph.put("nodes", 1L);
        backend.put("secret-graph-name", graph);
        Mockito.when(metrics.backend()).thenReturn(backend);
        Mockito.when(client.metrics()).thenReturn(metrics);
        return client;
    }

    private static HugeClient unavailableServerClient() {
        HugeClient client = Mockito.mock(HugeClient.class);
        VersionManager version = Mockito.mock(VersionManager.class);
        Mockito.when(version.getCoreVersion())
               .thenThrow(new IllegalStateException("unavailable"));
        Mockito.when(client.versionManager()).thenReturn(version);
        return client;
    }

    @Test
    public void testRaftSummaryAvoidsDetailedRegistriesAndFallsBackOnlyWhenAbsent() throws IOException {
        for (int status : new int[]{200, 404, 405, 401, 500}) {
            HttpServer pd = pdServer(200, members("Cluster_OK"), 200, stores());
            context(pd, "/v1/prom/targets/store", 200,
                    targets("127.0.0.1:" + pd.getAddress().getPort()));
            context(pd, "/metrics/system", 200, "{}");
            context(pd, "/metrics/drive", 200, "{}");
            context(pd, "/metrics/raft/summary", status, "{\"groups\":12000,\"enabled_groups\":11999}");
            AtomicInteger detailed = new AtomicInteger();
            pd.createContext("/metrics/raft", exchange -> {
                detailed.incrementAndGet();
                byte[] body = "{\"partition-1\":{\"enabled\":true}}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            LiveOperationsCollector collector = collector(true, pd);
            Snapshot snapshot;
            try {
                snapshot = collector.collect(serverClient(), true);
            } finally {
                collector.close();
                pd.stop(0);
            }
            boolean fallback = status == 404 || status == 405;
            Assert.assertEquals(fallback ? 1 : 0, detailed.get());
            MetricStatus metric = store(snapshot).getMetricStatuses().get("raft");
            if (status == 200 || fallback) {
                Assert.assertEquals("AVAILABLE", metric.getAvailability());
                Assert.assertEquals(fallback ? 1L : 12000L,
                                    ((Map<?, ?>) store(snapshot).getMetrics().get("raft")).get("groups"));
            } else {
                Assert.assertEquals("UNAVAILABLE", metric.getAvailability());
                Assert.assertEquals("/metrics/raft/summary", metric.getDiagnostics().get("request_path"));
                Assert.assertEquals(status, metric.getDiagnostics().get("http_status"));
            }
        }
    }

    private static void storeMetricContexts(HttpServer pd) {
        context(pd, "/metrics/system", 200, "{\"heap\":{\"used\":1}}");
        context(pd, "/metrics/drive", 200, "{\"disk\":{\"total_space\":10}}");
        context(pd, "/metrics/raft", 200, "{\"0\":{\"enabled\":true}}");
    }

    private static AtomicInteger fallbackTargets(HttpServer pd) {
        AtomicInteger calls = new AtomicInteger();
        pd.createContext("/v1/prom/targets-all", exchange -> {
            calls.incrementAndGet();
            byte[] bytes = targets("127.0.0.1:" + pd.getAddress().getPort())
                           .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        return calls;
    }

    private static HttpServer pdServer(int clusterStatus, String cluster,
                                       int storesStatus, String stores)
                                       throws IOException {
        return pdServer(clusterStatus, cluster, storesStatus, stores, null);
    }

    private static HttpServer pdServer(int clusterStatus, String cluster,
                                       int storesStatus, String stores,
                                       java.util.concurrent.Executor executor)
                                       throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        if (executor != null) {
            server.setExecutor(executor);
        }
        cluster = cluster.replace("PD_TEST_PORT",
                                  String.valueOf(server.getAddress().getPort()));
        stores = stores.replace("PD_TEST_PORT",
                                String.valueOf(server.getAddress().getPort()));
        cluster = cluster.replace("http://pd:8620",
                                  "http://127.0.0.1:" + server.getAddress().getPort())
                         .replace("PD_TEST_AUTHORITY", "127.0.0.1:" + server.getAddress().getPort());
        context(server, "/v1/members", clusterStatus, cluster);
        context(server, "/v1/stores", storesStatus, stores);
        context(server, "/actuator/prometheus", 200,
                "process_uptime_seconds{hg=\"pd\"} 12\n" +
                "system_cpu_count{hg=\"pd\"} 2\n");
        server.start();
        return server;
    }

    private static void context(HttpServer server, String path, int status,
                                String body) {
        server.createContext(path, exchange -> {
            if (!path.equals(exchange.getRequestURI().getPath())) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }

    private static void delayedContext(HttpServer server, String path,
                                       int status, String body, long delayMillis) {
        server.createContext(path, exchange -> {
            if (!path.equals(exchange.getRequestURI().getPath())) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            try {
                Thread.sleep(delayMillis);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
    }

    private static OperationsModels.Node store(Snapshot snapshot) {
        return snapshot.getNodes().stream()
                .filter(node -> "STORE".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
    }

    private static String members(String state) {
        return "{\"status\":0,\"data\":{\"state\":\"" + state + "\"," +
               "\"numOfService\":1,\"numOfNormalService\":1,\"stateCountMap\":{\"Up\":1}," +
               "\"pdList\":[{\"restUrl\":\"http://pd:8620\",\"state\":\"Up\"," +
               "\"serviceVersion\":\"1.8.0\",\"role\":\"Leader\"}]," +
               "\"pdLeader\":{\"restUrl\":\"http://pd:8620\",\"state\":\"Up\"," +
               "\"serviceVersion\":\"1.8.0\",\"role\":\"Leader\"}}}";
    }

    private static String cluster() {
        return "{\"status\":0,\"data\":{\"state\":\"Cluster_OK\"," +
               "\"graphSize\":2," +
               "\"pdList\":[{\"restUrl\":\"http://pd:8620\"," +
               "\"state\":\"Up\",\"role\":\"Leader\"}]," +
               "\"pdLeader\":{\"restUrl\":\"http://pd:8620\"," +
               "\"state\":\"Up\",\"role\":\"Leader\"}," +
               "\"stores\":[{\"storeId\":1,\"state\":\"Up\"," +
               "\"partitionCount\":12}]}}";
    }

    private static String stores() {
        return "{\"status\":0,\"data\":{\"stores\":[{" +
               "\"storeId\":\"1\",\"address\":\"127.0.0.1:8500\"," +
               "\"restAddress\":\"127.0.0.1:PD_TEST_PORT\"," +
               "\"state\":\"Up\",\"capacity\":100,\"available\":40}]}}";
    }

    private static String storesWithoutRestAddress() {
        return "{\"status\":0,\"data\":{\"stores\":[{" +
               "\"storeId\":\"1\",\"address\":\"127.0.0.1:8500\"," +
               "\"state\":\"Up\"}]}}";
    }

    private static String storesWithRestAddresses(int count, int port) {
        StringBuilder builder = new StringBuilder(
                "{\"status\":0,\"data\":{\"stores\":[");
        for (int i = 1; i <= count; i++) {
            if (i > 1) {
                builder.append(',');
            }
            builder.append("{\"storeId\":\"").append(i)
                   .append("\",\"address\":\"127.0.0.1:8500\",")
                   .append("\"restAddress\":\"127.0.0.1:")
                   .append(port).append("\",\"state\":\"Up\"}");
        }
        return builder.append("]}}").toString();
    }

    private static String storesWithDifferentRestAddresses() {
        return "{\"status\":0,\"data\":{\"stores\":[{" +
               "\"storeId\":\"1\",\"address\":\"127.0.0.1:8500\"," +
               "\"restAddress\":\"127.0.0.1:8520\",\"state\":\"Up\"},{" +
               "\"storeId\":\"2\",\"address\":\"127.0.0.1:9500\"," +
               "\"restAddress\":\"127.0.0.1:9520\",\"state\":\"Up\"}]}}";
    }

    private static String targets(String... authorities) {
        return targetsWithScheme("http", authorities);
    }

    private static String targetsWithScheme(String scheme,
                                            String... authorities) {
        StringBuilder builder = new StringBuilder("[{\"targets\":[");
        for (int i = 0; i < authorities.length; i++) {
            if (i > 0) {
                builder.append(',');
            }
            builder.append('\"').append(authorities[i]).append('\"');
        }
        return builder.append("],\"labels\":{" +
                              "\"__app_name\":\"store\"," +
                              "\"__scheme__\":\"").append(scheme)
                      .append("\"}}]").toString();
    }

    private static final class RecordingHttpClient
                         extends OperationsHttpClient {

        private final String stores;
        private final String targets;
        private final AtomicInteger active;
        private final AtomicInteger maximum;
        private final AtomicInteger metrics;
        private final Set<String> metricAuthorities;
        private volatile long delayMillis;
        private volatile String delayAuthority;
        private volatile String unavailableAuthority;

        private RecordingHttpClient(String stores, String targets) {
            super(1000, 1000, 8192);
            this.stores = stores;
            this.targets = targets;
            this.active = new AtomicInteger();
            this.maximum = new AtomicInteger();
            this.metrics = new AtomicInteger();
            this.metricAuthorities = java.util.concurrent.ConcurrentHashMap
                                    .newKeySet();
        }

        @Override
        public String get(java.net.URI target, String username, String password,
                          Set<String> allowedTargets) {
            return this.response(target);
        }

        @Override
        public String get(java.net.URI target, String username, String password) {
            return this.response(target);
        }

        @Override
        public String get(java.net.URI target, String username, String password,
                          Set<String> allowedTargets, String accept) {
            return this.response(target);
        }

        @Override
        public ProbeResponse probe(java.net.URI target, String username, String password,
                                   Set<String> allowedTargets) {
            throw new UpstreamRequestException("upstream_http_status_404", null,
                                               Map.of("request_path", target.getPath(), "http_status", 404));
        }

        private String response(java.net.URI target) {
            String path = target.getPath();
            if ("/v1/members".equals(path)) {
                return cluster();
            }
            if ("/v1/stores".equals(path)) {
                return this.stores;
            }
            if ("/v1/prom/targets/store".equals(path) ||
                "/v1/prom/targets-all".equals(path)) {
                return this.targets;
            }
            if ("/actuator/prometheus".equals(path)) {
                return "process_uptime_seconds{hg=\"pd\"} 12\n";
            }
            this.metrics.incrementAndGet();
            String authority = OperationsHttpClient.authority(target);
            this.metricAuthorities.add(authority);
            if (authority.equals(this.unavailableAuthority)) {
                throw new UpstreamRequestException("upstream_unavailable");
            }
            int current = this.active.incrementAndGet();
            this.maximum.accumulateAndGet(current, Math::max);
            try {
                if (this.delayMillis > 0L &&
                    (this.delayAuthority == null || this.delayAuthority.equals(
                            OperationsHttpClient.authority(target)))) {
                    Thread.sleep(this.delayMillis);
                }
                if (path.endsWith("/drive")) {
                    return "{\"disk\":{\"total_space\":10}}";
                }
                if (path.endsWith("/raft/summary")) {
                    return "{\"groups\":1,\"enabled_groups\":1}";
                }
                if (path.endsWith("/raft")) {
                    return "{\"0\":{\"enabled\":true}}";
                }
                return "{\"heap\":{\"used\":1}}";
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new UpstreamRequestException("upstream_timeout", e);
            } finally {
                this.active.decrementAndGet();
            }
        }

        private void delayMillis(long delayMillis) {
            this.delayMillis = delayMillis;
        }

        private void delayAuthority(String authority, long delayMillis) {
            this.delayAuthority = authority;
            this.delayMillis = delayMillis;
        }

        private void unavailableAuthority(String authority) {
            this.unavailableAuthority = authority;
        }

        private int metricRequests() {
            return this.metrics.get();
        }

        private int activeRequests() {
            return this.active.get();
        }

        private int maxConcurrentRequests() {
            return this.maximum.get();
        }

        private Set<String> metricAuthorities() {
            return this.metricAuthorities;
        }
    }

    private static final class LeaderAwareHttpClient
                         extends OperationsHttpClient {

        private final String leaderHost;
        private final AtomicInteger leaderRequests;

        private LeaderAwareHttpClient(String leaderHost) {
            super(1000, 1000, 8192);
            this.leaderHost = leaderHost;
            this.leaderRequests = new AtomicInteger();
        }

        @Override
        public String get(java.net.URI target, String username, String password,
                          Set<String> allowedTargets) {
            return this.response(target);
        }

        @Override
        public String get(java.net.URI target, String username,
                          String password) {
            return this.response(target);
        }

        @Override
        public ProbeResponse probe(java.net.URI target, String username, String password,
                                   Set<String> allowedTargets) {
            throw new UpstreamRequestException("upstream_http_status_404", null,
                                               Map.of("request_path", target.getPath(), "http_status", 404));
        }

        private String response(java.net.URI target) {
            if ("/v1/members".equals(target.getPath())) {
                if (!"pd-service".equals(target.getHost())) {
                    this.leaderRequests.incrementAndGet();
                    return leaderCluster("Cluster_OK", this.leaderHost);
                }
                return leaderCluster("Cluster_Not_Ready", this.leaderHost);
            }
            if ("/v1/stores".equals(target.getPath())) {
                return stores();
            }
            throw new AssertionError("Unexpected operations target " + target);
        }

        private int leaderRequests() {
            return this.leaderRequests.get();
        }
    }

    private static String leaderCluster(String state, String leaderHost) {
        return "{\"status\":0,\"data\":{\"state\":\"" + state + "\"," +
               "\"graphSize\":2,\"pdList\":[{\"restUrl\":\"" +
               leaderHost + ":8620\",\"state\":\"Up\"," +
               "\"role\":\"Leader\"}],\"pdLeader\":{\"restUrl\":\"" +
               leaderHost + ":8620\",\"state\":\"Up\"," +
               "\"role\":\"Leader\"},\"stores\":[]}}";
    }
}
