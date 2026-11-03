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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.common.cache.Cache;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.service.op.OperationsModels.Node;
import org.apache.hugegraph.service.op.OperationsModels.MetricStatus;
import org.apache.hugegraph.service.op.OperationsModels.Snapshot;
import org.apache.hugegraph.service.op.OperationsModels.SourceStatus;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

public class DefaultOperationsDataServiceTest {

    private static final Clock CLOCK = Clock.fixed(
            Instant.ofEpochMilli(2000L), ZoneOffset.UTC);

    @SuppressWarnings("unchecked")
    @Test
    public void testFailedRefreshMarksPreviousReadinessStale() throws Exception {
        Snapshot original = fullSnapshot();
        java.util.List<Node> readyNodes = original.getNodes().stream()
                .map(node -> node.withReadiness(new OperationsModels.Readiness(
                        "READY", 1000L, "STATE_FOLLOWER", null, false,
                        Map.of("request_path", "/v1/ready", "http_status", 200))))
                .collect(java.util.stream.Collectors.toList());
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() > 0) {
                throw new UpstreamRequestException("upstream_timeout");
            }
            return new Snapshot(original.getStatus(), original.getObservedAt(), false, null,
                                original.getSources(), readyNodes, original.getFacts());
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(collector, 5, CLOCK);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(OperationsCapabilityService.HEALTH_READ,
                                          OperationsCapabilityService.TOPOLOGY_READ);
        service.overview(client, capabilities, false);
        Map<String, Object> response = service.overview(client, capabilities, true);
        java.util.List<Node> nodes = (java.util.List<Node>) response.get("nodes");
        Assert.assertTrue(nodes.stream().allMatch(node -> node.getReadiness().isStale()));
        JsonNode serialized = new ObjectMapper().valueToTree(nodes.get(0));
        Assert.assertEquals(1000L, serialized.path("readiness").path("observed_at").asLong());
        Assert.assertTrue(serialized.path("readiness").path("stale").asBoolean());
    }

    @Test
    public void testClusterHealthCopiesRetainRawStatesAndSerializeSafely() {
        SourceStatus source = new SourceStatus("PARTIAL", "UP", 2000L,
                                               1000L, true, false,
                                               "data_fault")
                .withDiagnostics(Collections.singletonMap("request_path", "/v1/members"));
        SourceStatus withHealth = source.withClusterHealth(
                                  "Cluster_OK", "PState_Fault");
        Assert.assertEquals(source.getDiagnostics(), withHealth.getDiagnostics());
        SourceStatus stale = withHealth.withDiagnostics(
                Collections.singletonMap("http_status", 503)).stale("refresh_failed");
        Assert.assertEquals(Collections.singletonMap("http_status", 503), stale.getDiagnostics());
        JsonNode serialized = new ObjectMapper().valueToTree(stale);

        Assert.assertNull(source.getClusterState());
        Assert.assertNull(source.getDataState());
        Assert.assertEquals("UP", stale.getStatus());
        Assert.assertEquals("Cluster_OK", serialized.path("cluster_state").asText());
        Assert.assertEquals("PState_Fault", serialized.path("data_state").asText());
        Assert.assertEquals(Long.valueOf(1000L), stale.getLastSuccessAt());
        Assert.assertTrue(stale.isStale());
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testSourceCacheMergeRetainsCurrentRawClusterHealth() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                return fullSnapshotWithClusterHealth();
            }
            Map<String, SourceStatus> sources = new LinkedHashMap<>();
            sources.put("pd", new SourceStatus("UNAVAILABLE", "UNKNOWN",
                        2000L, null, false, false, "upstream_unavailable")
                        .withClusterHealth("Cluster_Warn", "PState_Warn"));
            return new Snapshot("DEGRADED", 2000L, false, null, sources,
                                Collections.emptyList(), Collections.emptyMap());
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(OperationsCapabilityService.HEALTH_READ,
                                          OperationsCapabilityService.TOPOLOGY_READ);
        HugeClient client = client("token-a");

        service.overview(client, capabilities, false);
        Map<String, Object> result = service.overview(client, capabilities, true);
        Map<String, SourceStatus> sources = (Map<String, SourceStatus>) result.get("sources");
        SourceStatus pd = sources.get("pd");

        Assert.assertEquals("Cluster_Warn", pd.getClusterState());
        Assert.assertEquals("PState_Warn", pd.getDataState());
        Assert.assertEquals("UP", pd.getStatus());
        Assert.assertEquals(Long.valueOf(1000L), pd.getLastSuccessAt());
        Assert.assertTrue(pd.isStale());
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testUnavailableSourceRetainsLastKnownRawClusterHealthAsStale() {
        for (String reason : new String[]{"upstream_timeout", "upstream_rejected"}) {
            AtomicInteger calls = new AtomicInteger();
            OperationsCollector collector = (client, metrics) -> {
                if (calls.getAndIncrement() == 0) {
                    return fullSnapshotWithClusterHealth();
                }
                SourceStatus failure = new SourceStatus("UNAVAILABLE", "UNKNOWN",
                        2000L, null, false, false, reason)
                        .withDiagnostics(Collections.singletonMap("request_path", "/v1/members"));
                return new Snapshot("DEGRADED", 2000L, false, null,
                        Collections.singletonMap("pd", failure), Collections.emptyList(), Collections.emptyMap());
            };
            DefaultOperationsDataService service = new DefaultOperationsDataService(collector, 5, CLOCK);
            Set<String> capabilities = Set.of(OperationsCapabilityService.HEALTH_READ,
                                              OperationsCapabilityService.TOPOLOGY_READ);
            HugeClient client = client("token-a");

            service.overview(client, capabilities, false);
            Map<String, Object> result = service.overview(client, capabilities, true);
            SourceStatus pd = ((Map<String, SourceStatus>) result.get("sources")).get("pd");

            Assert.assertEquals("UNAVAILABLE", pd.getAvailability());
            Assert.assertEquals("Cluster_OK", pd.getClusterState());
            Assert.assertEquals("PState_Fault", pd.getDataState());
            Assert.assertEquals(reason, pd.getReason());
            Assert.assertEquals(Collections.singletonMap("request_path", "/v1/members"), pd.getDiagnostics());
            Assert.assertEquals("UP", pd.getStatus());
            Assert.assertEquals(Long.valueOf(1000L), pd.getLastSuccessAt());
            Assert.assertTrue(pd.isStale());
            Assert.assertEquals(true, result.get("stale"));
            Assert.assertTrue(((java.util.List<Node>) result.get("nodes")).stream()
                    .anyMatch(node -> "PD".equals(node.getType()) && "UP".equals(node.getStatus())));
        }
    }

    @Test
    public void testSpaceAdminOverviewContainsOnlyRedactedHealth() {
        Snapshot snapshot = snapshot();
        Map<String, SourceStatus> sources = new LinkedHashMap<>(snapshot.getSources());
        sources.put("pd", new SourceStatus("PARTIAL", "UP", 2000L, 2000L,
                                          true, false, "data_fault")
                        .withClusterHealth("Cluster_OK", "PState_Fault"));
        Snapshot withHealth = new Snapshot("DEGRADED", snapshot.getObservedAt(),
                                          false, null, sources, snapshot.getNodes(),
                                          snapshot.getFacts());
        DefaultOperationsDataService service = service(withHealth, 5);
        HugeClient client = client("token-a");

        Map<String, Object> overview = service.overview(client,
                Set.of(OperationsCapabilityService.HEALTH_READ), false);

        Assert.assertFalse(overview.containsKey("nodes"));
        Assert.assertFalse(overview.containsKey("facts"));
        Assert.assertTrue(overview.containsKey("sources"));
        JsonNode serialized = new ObjectMapper().valueToTree(overview);
        Assert.assertEquals("Cluster_OK", serialized.path("sources").path("pd")
                                                  .path("cluster_state").asText());
        Assert.assertEquals("PState_Fault", serialized.path("sources").path("pd")
                                                    .path("data_state").asText());
    }

    @Test
    public void testAdminNodesAreFilteredAndPaginated() {
        DefaultOperationsDataService service = service(snapshot(), 5);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ,
                OperationsCapabilityService.METRICS_READ);

        Map<String, Object> result = service.nodes(client, capabilities,
                                                   "STORE", "UP", "store",
                                                   1, 1, "name", "asc");

        Assert.assertEquals(2, result.get("total"));
        Assert.assertEquals(1, ((java.util.List<?>) result.get("items")).size());
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testNodeDiagnosticsIgnorePaginationAndFiltersWithoutCopyingMetrics() {
        java.util.List<Node> nodes = new java.util.ArrayList<>();
        MetricStatus placeholder = new MetricStatus("UNSUPPORTED", 2000L, null,
                false, false, "topology_fields_unavailable");
        for (int i = 0; i < 25; i++) {
            nodes.add(new Node(String.format("store-%012d", i), "STORE", "healthy-" + i,
                    null, "1.8.0", "UP", 2000L, Collections.emptyMap(), Map.of("backend", placeholder)));
        }
        Map<String, MetricStatus> statuses = new LinkedHashMap<>();
        statuses.put("system", new MetricStatus("UNAVAILABLE", 2000L, null,
                false, false, "upstream_rejected")
                .withDiagnostics(Map.of("request_path", "/metrics/system", "http_status", 503)));
        statuses.put("raft", new MetricStatus("UNSUPPORTED", 2000L, null,
                false, false, "unsupported_version"));
        statuses.put("drive", new MetricStatus("AVAILABLE", 2000L, 2000L, true, false, null));
        statuses.put("backend", placeholder);
        nodes.add(new Node("store-ffffffffffff", "STORE", "z-failing", null, "1.7.0",
                "UP", 2000L, Map.of("drive", Map.of("private_metric", "private-value")), statuses));
        SourceStatus source = new SourceStatus("PARTIAL", "UP", 2000L, 1000L,
                                               false, false, "store_metrics_partial");
        Snapshot snapshot = new Snapshot("DEGRADED", 2000L, false, null,
                Map.of("stores", source), nodes, Collections.emptyMap());
        DefaultOperationsDataService service = service(snapshot, 5);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(OperationsCapabilityService.TOPOLOGY_READ);

        Map<String, Object> first = service.nodes(client, capabilities,
                "STORE", null, null, 1, 20, "name", "asc");
        Assert.assertEquals(20, ((java.util.List<?>) first.get("items")).size());
        java.util.List<Map<String, Object>> diagnostics =
                (java.util.List<Map<String, Object>>) first.get("diagnostic_nodes");
        Assert.assertEquals(1, diagnostics.size());
        Assert.assertEquals(Set.of("id", "type", "name", "status", "metric_statuses"),
                            diagnostics.get(0).keySet());
        Assert.assertEquals("store-ffffffffffff", diagnostics.get(0).get("id"));
        Map<String, MetricStatus> failures =
                (Map<String, MetricStatus>) diagnostics.get(0).get("metric_statuses");
        Assert.assertEquals(Set.of("system", "raft"), failures.keySet());
        Assert.assertEquals(Map.of("request_path", "/metrics/system", "http_status", 503),
                            failures.get("system").getDiagnostics());
        Assert.assertFalse(diagnostics.toString().contains("private"));

        Map<String, Object> filtered = service.nodes(client, capabilities,
                "PD", "DOWN", "no-match", 9, 20, "name", "asc");
        Assert.assertTrue(((java.util.List<?>) filtered.get("items")).isEmpty());
        Assert.assertEquals(diagnostics, filtered.get("diagnostic_nodes"));
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testUnsupportedDiagnosticsRemainVisibleForUnhealthyTopology() {
        for (String health : new String[]{"DOWN", "DEGRADED", "UP"}) {
            Map<String, Object> details = Map.of("request_path", "/metrics/raft", "http_status", 404);
            MetricStatus metric = new MetricStatus("UNSUPPORTED", 2000L, null,
                    false, false, "unsupported_version").withDiagnostics(details);
            Node node = new Node("store-old", "STORE", "Store old", null, "1.7.0", health,
                    2000L, Collections.emptyMap(), Map.of("raft", metric));
            SourceStatus source = new SourceStatus("UNSUPPORTED", health, 2000L, null,
                    false, false, "unsupported_version");
            Snapshot snapshot = new Snapshot(health, 2000L, false, null,
                    Map.of("stores", source), Collections.singletonList(node), Collections.emptyMap());
            Map<String, Object> result = service(snapshot, 5).nodes(client("token-a"),
                    Set.of(OperationsCapabilityService.TOPOLOGY_READ),
                    "PD", "UP", "no-match", 1, 20, "name", "asc");
            Assert.assertTrue(((java.util.List<?>) result.get("items")).isEmpty());
            java.util.List<Map<String, Object>> diagnostics =
                    (java.util.List<Map<String, Object>>) result.get("diagnostic_nodes");
            if ("UP".equals(health)) {
                Assert.assertTrue(diagnostics.isEmpty());
            } else {
                Assert.assertEquals(1, diagnostics.size());
                Map<String, MetricStatus> statuses =
                        (Map<String, MetricStatus>) diagnostics.get(0).get("metric_statuses");
                Assert.assertEquals(details, statuses.get("raft").getDiagnostics());
            }
        }
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testUncollectedPdFollowersAreExcludedFromSourceDiagnostics() {
        for (boolean stale : new boolean[]{false, true}) {
            MetricStatus failed = new MetricStatus("UNAVAILABLE", 2000L, null,
                    false, false, "upstream_rejected")
                    .withDiagnostics(Map.of("request_path", "/actuator/prometheus", "http_status", 503));
            MetricStatus uncollected = new MetricStatus("UNSUPPORTED", 2000L, null,
                    false, stale, "metrics_not_collected");
            Node leader = new Node("pd-leader", "PD", "PD leader", "LEADER", "1.8.0", "UP",
                    2000L, Collections.emptyMap(), Map.of("system", failed));
            Node follower = new Node("pd-follower", "PD", "PD follower", "FOLLOWER", "1.8.0", "UP",
                    2000L, Collections.emptyMap(), Map.of("system", uncollected));
            SourceStatus source = new SourceStatus("PARTIAL", "UP", 2000L, null,
                    false, false, "upstream_rejected");
            Snapshot snapshot = new Snapshot("DEGRADED", 2000L, false, null,
                    Map.of("pd", source), Arrays.asList(leader, follower), Collections.emptyMap());
            Map<String, Object> result = service(snapshot, 5).nodes(client("token-a"),
                    Set.of(OperationsCapabilityService.TOPOLOGY_READ),
                    "PD", null, null, 1, 20, "name", "asc");
            java.util.List<Map<String, Object>> diagnostics =
                    (java.util.List<Map<String, Object>>) result.get("diagnostic_nodes");
            Assert.assertEquals(1, diagnostics.size());
            Assert.assertEquals("pd-leader", diagnostics.get(0).get("id"));
        }
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testUnmappedDirectPdPeersAppearInDiagnostics() {
        MetricStatus uncollected = new MetricStatus("UNSUPPORTED", 2000L, null,
                false, false, "metrics_not_collected");
        Node follower = new Node("pd-follower", "PD", "PD follower", "FOLLOWER", "1.8.0", "UP",
                2000L, Collections.emptyMap(), Map.of("system", uncollected));
        SourceStatus source = new SourceStatus("PARTIAL", "UP", 2000L, null,
                false, false, "pd_metrics_partial").withDiagnostics(Map.of("pd_peer_metrics", true));
        Snapshot snapshot = new Snapshot("DEGRADED", 2000L, false, null,
                Map.of("pd", source), Collections.singletonList(follower), Collections.emptyMap());
        Map<String, Object> result = service(snapshot, 5).nodes(client("token-a"),
                Set.of(OperationsCapabilityService.TOPOLOGY_READ),
                "STORE", null, null, 1, 20, "name", "asc");
        java.util.List<Map<String, Object>> diagnostics =
                (java.util.List<Map<String, Object>>) result.get("diagnostic_nodes");
        Assert.assertEquals(1, diagnostics.size());
        Assert.assertEquals("pd-follower", diagnostics.get(0).get("id"));
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testEmptyNodeListRetainsSourceFailureDiagnostics() {
        Map<String, Object> diagnostics = Map.of(
                "request_path", "/v1/stores", "max_response_bytes", 8192L,
                "response_bytes", 9000L, "response_size_exact", true);
        SourceStatus source = new SourceStatus(
                "UNAVAILABLE", "UNKNOWN", 2000L, null, false, false,
                "response_too_large").withDiagnostics(diagnostics);
        Snapshot snapshot = new Snapshot(
                "DEGRADED", 2000L, false, null,
                Collections.singletonMap("stores", source),
                Collections.emptyList(), Collections.emptyMap());
        DefaultOperationsDataService service = service(snapshot, 5);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        Map<String, Object> result = service.nodes(client("token-a"), capabilities,
                                                   "STORE", null, null, 1, 20,
                                                   "name", "asc");

        Assert.assertEquals(0, result.get("total"));
        Assert.assertTrue(((java.util.List<?>) result.get("items")).isEmpty());
        Map<String, SourceStatus> sources =
                (Map<String, SourceStatus>) result.get("sources");
        Assert.assertEquals("response_too_large", sources.get("stores").getReason());
        Assert.assertEquals(diagnostics, sources.get("stores").getDiagnostics());
    }

    @Test
    public void testNodesUseStableGlobalSortingBeforePagination() {
        DefaultOperationsDataService service = service(snapshot(), 5);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        Map<String, Object> first = service.nodes(client("token-a"), capabilities,
                                                  null, null, null, 1, 1,
                                                  "name", "desc");
        Map<String, Object> second = service.nodes(client("token-a"), capabilities,
                                                   null, null, null, 2, 1,
                                                   "name", "desc");

        @SuppressWarnings("unchecked")
        java.util.List<Node> firstItems =
                (java.util.List<Node>) first.get("items");
        @SuppressWarnings("unchecked")
        java.util.List<Node> secondItems =
                (java.util.List<Node>) second.get("items");
        Assert.assertTrue(firstItems.get(0).getName().compareToIgnoreCase(
                          secondItems.get(0).getName()) >= 0);
    }

    @Test
    public void testExplicitNodesRefreshReplacesCachedSnapshotWithinTtl() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            Snapshot result = snapshot();
            return new Snapshot(result.getStatus(), 2000L + calls.incrementAndGet(),
                                false, result.getReason(), result.getSources(),
                                result.getNodes(), result.getFacts());
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        Map<String, Object> first = service.nodes(client, capabilities,
                null, null, null, 1, 20, "name", "asc");
        Map<String, Object> cached = service.nodes(client, capabilities,
                null, null, null, 1, 20, "name", "asc", false);
        Assert.assertEquals(1, calls.get());
        Assert.assertEquals(2001L, first.get("observed_at"));
        Assert.assertEquals(first.get("observed_at"), cached.get("observed_at"));

        Map<String, Object> refreshed = service.nodes(client, capabilities,
                null, null, null, 1, 20, "name", "asc", true);
        Map<String, Object> subsequent = service.nodes(client, capabilities,
                null, null, null, 1, 20, "name", "asc");
        Assert.assertEquals(2, calls.get());
        Assert.assertEquals(2002L, refreshed.get("observed_at"));
        Assert.assertEquals(refreshed.get("observed_at"), subsequent.get("observed_at"));
    }

    @Test
    public void testCacheIsIsolatedByCurrentServerCredential() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            calls.incrementAndGet();
            return snapshot();
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ);

        service.overview(client("token-a"), capabilities, false);
        service.overview(client("token-a"), capabilities, false);
        service.overview(client("token-b"), capabilities, false);

        Assert.assertEquals(2, calls.get());
    }

    @Test
    public void testCacheEvictsEntriesBeyondDefaultBound() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            calls.incrementAndGet();
            return snapshot();
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ);

        for (int i = 0; i <= 1024; i++) {
            service.overview(client("token-" + i), capabilities, false);
        }
        @SuppressWarnings("unchecked")
        Cache<String, ?> cache = (Cache<String, ?>) ReflectionTestUtils.getField(
                                 service, "cache");
        cache.cleanUp();

        Assert.assertTrue(cache.size() <= 1024L);
        Assert.assertEquals(1025, calls.get());
    }

    @Test
    public void testCollectionFailureDoesNotLeaveInFlightEntry() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                throw new UpstreamRequestException("upstream_timeout");
            }
            return snapshot();
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ);

        Assert.assertThrows(UpstreamRequestException.class, () ->
                service.overview(client("token-a"), capabilities, false));
        Map<String, Object> result = service.overview(
                client("token-a"), capabilities, false);

        Assert.assertEquals("UP", result.get("status"));
        Assert.assertEquals(2, calls.get());
    }

    @Test
    public void testRefreshFailurePreservesLastSuccessAsStale() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                return fullSnapshot();
            }
            throw new UpstreamRequestException("upstream_timeout");
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client, capabilities, false);
        Map<String, Object> stale = service.overview(client, capabilities, true);

        Assert.assertEquals("DEGRADED", stale.get("status"));
        Assert.assertEquals(true, stale.get("stale"));
        Assert.assertEquals(3, ((java.util.List<?>) stale.get("nodes")).size());
        Assert.assertEquals("refresh_failed", stale.get("reason"));
        @SuppressWarnings("unchecked")
        java.util.List<Node> staleNodes =
                (java.util.List<Node>) stale.get("nodes");
        MetricStatus backend = staleNodes.stream()
                .filter(node -> "STORE".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new)
                .getMetricStatuses().get("backend");
        Assert.assertEquals("UNAVAILABLE", backend.getAvailability());
        Assert.assertEquals("refresh_failed", backend.getReason());
        Assert.assertTrue(backend.isStale());
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testPartialRefreshPreservesOnlyFailedSourceDataAsStale() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                return fullSnapshot();
            }
            return partialSnapshot();
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client, capabilities, false);
        Map<String, Object> result = service.overview(client, capabilities,
                                                       true);

        Assert.assertEquals("DEGRADED", result.get("status"));
        Assert.assertEquals(true, result.get("stale"));
        java.util.List<?> nodes = (java.util.List<?>) result.get("nodes");
        Assert.assertEquals(3, nodes.size());
        @SuppressWarnings("unchecked")
        Map<String, SourceStatus> sources =
                (Map<String, SourceStatus>) result.get("sources");
        Assert.assertEquals("UNAVAILABLE",
                            sources.get("stores").getAvailability());
        Assert.assertTrue(sources.get("stores").isStale());
        Assert.assertEquals(Long.valueOf(1000L),
                            sources.get("stores").getLastSuccessAt());
        Assert.assertEquals(Collections.singletonMap("request_path", "/v1/stores"),
                            sources.get("stores").getDiagnostics());
        Node staleStore = ((java.util.List<Node>) nodes).stream()
                .filter(node -> "STORE".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        MetricStatus backend = staleStore.getMetricStatuses().get("backend");
        Assert.assertEquals("UNAVAILABLE", backend.getAvailability());
        Assert.assertEquals("upstream_unavailable", backend.getReason());
        Assert.assertTrue(backend.isStale());
        Assert.assertEquals(Long.valueOf(1000L), backend.getLastSuccessAt());
        Assert.assertEquals(sources.get("stores").getDiagnostics(),
                            backend.getDiagnostics());
    }

    @Test
    public void testPartialRefreshPreservesCurrentClusterReason() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                return fullSnapshot();
            }
            Snapshot partial = partialSnapshot();
            return new Snapshot(partial.getStatus(), partial.getObservedAt(),
                                false, "cluster_not_ready",
                                partial.getSources(), partial.getNodes(),
                                partial.getFacts());
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        HugeClient client = client("token-a");
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client, capabilities, false);
        Map<String, Object> result = service.overview(client, capabilities,
                                                       true);

        Assert.assertEquals("cluster_not_ready", result.get("reason"));
        Assert.assertEquals(true, result.get("stale"));
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testPdFailureKeepsFreshStoreCapacityFacts() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) ->
                calls.getAndIncrement() == 0 ?
                factSnapshot("AVAILABLE", "AVAILABLE", 100L, 1000L) :
                factSnapshot("UNAVAILABLE", "AVAILABLE", null, 2000L);
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client("token-a"), capabilities, false);
        Map<String, Object> result = service.overview(client("token-a"),
                                                      capabilities, true);

        Map<String, Long> facts = (Map<String, Long>) result.get("facts");
        Assert.assertEquals(Long.valueOf(100L),
                            facts.get("data_size_bytes"));
        Assert.assertEquals(Long.valueOf(2000L),
                            facts.get("capacity_total_bytes"));
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testPdFailureKeepsFreshStoreCounts() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) ->
                calls.getAndIncrement() == 0 ?
                factSnapshot("AVAILABLE", "AVAILABLE", 100L, 1000L, 3L, 3L) :
                factSnapshot("UNAVAILABLE", "AVAILABLE", null, 2000L, 2L, 2L);
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client("token-a"), capabilities, false);
        Map<String, Object> result = service.overview(client("token-a"),
                                                      capabilities, true);

        Map<String, Long> facts = (Map<String, Long>) result.get("facts");
        Assert.assertEquals(Long.valueOf(2L), facts.get("stores"));
        Assert.assertEquals(Long.valueOf(2L), facts.get("stores_up"));
    }

    @SuppressWarnings("unchecked")
    @Test
    public void testStoreFailureKeepsFreshPdFacts() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) ->
                calls.getAndIncrement() == 0 ?
                factSnapshot("AVAILABLE", "AVAILABLE", 100L, 1000L) :
                factSnapshot("AVAILABLE", "UNAVAILABLE", 200L, null);
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ);

        service.overview(client("token-a"), capabilities, false);
        Map<String, Object> result = service.overview(client("token-a"),
                                                      capabilities, true);

        Map<String, Long> facts = (Map<String, Long>) result.get("facts");
        Assert.assertEquals(Long.valueOf(200L),
                            facts.get("data_size_bytes"));
        Assert.assertEquals(Long.valueOf(1000L),
                            facts.get("capacity_total_bytes"));
    }

    @Test
    public void testPartialRefreshReusesOnlyFailedMetricGroup() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) ->
                calls.getAndIncrement() == 0 ? metricSnapshot(false) :
                                               metricSnapshot(true);
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ,
                OperationsCapabilityService.METRICS_READ);

        service.overview(client("token-a"), capabilities, false);
        Map<String, Object> result = service.overview(client("token-a"),
                                                      capabilities, true);

        @SuppressWarnings("unchecked")
        java.util.List<Node> nodes = (java.util.List<Node>) result.get("nodes");
        Node store = nodes.get(0);
        Assert.assertEquals("DOWN", result.get("status"));
        Assert.assertEquals("fresh-store", store.getName());
        Assert.assertEquals("DOWN", store.getStatus());
        Assert.assertEquals(Collections.singletonMap("used", 10L),
                            store.getMetrics().get("system"));
        Assert.assertEquals(Collections.singletonMap("total", 30L),
                            store.getMetrics().get("drive"));
        MetricStatus system = store.getMetricStatuses().get("system");
        Assert.assertEquals("UNAVAILABLE", system.getAvailability());
        Assert.assertEquals(Long.valueOf(1000L), system.getLastSuccessAt());
        Assert.assertTrue(system.isStale());
        Assert.assertEquals("upstream_timeout", system.getReason());
        Assert.assertEquals(Map.of("request_path", "/metrics/system",
                                   "metric_group", "system"),
                            system.getDiagnostics());
        Assert.assertTrue(store.getMetricStatuses().get("drive").isFresh());
    }

    @Test
    public void testPartialMetricsKeepFreshLeaderTopology() {
        AtomicInteger calls = new AtomicInteger();
        OperationsCollector collector = (client, metrics) -> {
            if (calls.getAndIncrement() == 0) {
                return leaderSnapshot("pd-000000000001", "LEADER", "AVAILABLE");
            }
            return leaderSnapshot("pd-000000000002", "LEADER", "PARTIAL");
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ,
                OperationsCapabilityService.TOPOLOGY_READ,
                OperationsCapabilityService.METRICS_READ);

        service.overview(client("token-a"), capabilities, false);
        Map<String, Object> result = service.overview(client("token-a"),
                                                      capabilities, true);

        @SuppressWarnings("unchecked")
        java.util.List<Node> nodes = (java.util.List<Node>) result.get("nodes");
        Assert.assertTrue(nodes.stream().anyMatch(
                          node -> "pd-000000000002".equals(node.getId()) &&
                                  "LEADER".equals(node.getRole())));
        Assert.assertFalse((Boolean) result.get("stale"));
    }

    @Test
    public void testConcurrentForcedRefreshesShareInFlightCollection()
           throws Exception {
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch collectorEntered = new CountDownLatch(1);
        CountDownLatch releaseCollector = new CountDownLatch(1);
        CountDownLatch secondCollection = new CountDownLatch(1);
        OperationsCollector collector = (client, metrics) -> {
            int call = calls.incrementAndGet();
            if (call > 1) {
                secondCollection.countDown();
            }
            collectorEntered.countDown();
            try {
                releaseCollector.await(2, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
            return snapshot();
        };
        DefaultOperationsDataService service = new DefaultOperationsDataService(
                collector, 5, CLOCK);
        Set<String> capabilities = Set.of(
                OperationsCapabilityService.HEALTH_READ);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CyclicBarrier start = new CyclicBarrier(2);
        AtomicReference<Thread> firstThread = new AtomicReference<>();
        AtomicReference<Thread> secondThread = new AtomicReference<>();
        try {
            Future<?> first = executor.submit(() -> {
                firstThread.set(Thread.currentThread());
                forcedRefresh(service, capabilities, start);
            });
            Future<?> second = executor.submit(() -> {
                secondThread.set(Thread.currentThread());
                forcedRefresh(service, capabilities, start);
            });
            Assert.assertTrue(collectorEntered.await(1, TimeUnit.SECONDS));
            Assert.assertTrue(awaitInFlightJoin(firstThread.get(),
                                                secondThread.get()));
            Assert.assertEquals(1L, secondCollection.getCount());
            releaseCollector.countDown();
            first.get(2, TimeUnit.SECONDS);
            second.get(2, TimeUnit.SECONDS);
        } finally {
            releaseCollector.countDown();
            executor.shutdownNow();
        }

        Assert.assertEquals(1, calls.get());
    }

    private static boolean awaitInFlightJoin(Thread first, Thread second) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1L);
        while (System.nanoTime() < deadline) {
            if (joiningInFlight(first) || joiningInFlight(second)) {
                return true;
            }
            Thread.yield();
        }
        return false;
    }

    private static boolean joiningInFlight(Thread thread) {
        for (StackTraceElement frame : thread.getStackTrace()) {
            if (DefaultOperationsDataService.class.getName()
                                                  .equals(frame.getClassName()) &&
                "await".equals(frame.getMethodName())) {
                return true;
            }
        }
        return false;
    }

    private static void forcedRefresh(DefaultOperationsDataService service,
                                      Set<String> capabilities,
                                      CyclicBarrier start) {
        try {
            start.await(1, TimeUnit.SECONDS);
            service.overview(client("token-a"), capabilities, true);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static DefaultOperationsDataService service(Snapshot snapshot,
                                                        int ttlSeconds) {
        return new DefaultOperationsDataService((client, metrics) -> snapshot,
                                                ttlSeconds, CLOCK);
    }

    private static HugeClient client(String token) {
        HugeClient client = Mockito.mock(HugeClient.class);
        Mockito.when(client.getAuthContext()).thenReturn(token);
        return client;
    }

    private static Snapshot snapshot() {
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("server", new SourceStatus("AVAILABLE", "UP", 1000L,
                                                1000L, true, false, null));
        Map<String, Long> facts = new LinkedHashMap<>();
        facts.put("stores", 2L);
        return new Snapshot("UP", 1000L, false, null, sources,
                Arrays.asList(node("pd-000000000001", "PD", "pd", "UP"),
                              node("store-000000000001", "STORE", "store-a",
                                   "UP"),
                              node("store-000000000002", "STORE", "store-b",
                                   "UP")), facts);
    }

    private static Snapshot fullSnapshotWithClusterHealth() {
        Snapshot snapshot = fullSnapshot();
        Map<String, SourceStatus> sources = new LinkedHashMap<>(snapshot.getSources());
        sources.put("pd", new SourceStatus("PARTIAL", "UP", 1000L,
                        1000L, true, false, "data_fault")
                        .withClusterHealth("Cluster_OK", "PState_Fault"));
        return new Snapshot("DEGRADED", snapshot.getObservedAt(), false,
                            "data_fault", sources, snapshot.getNodes(), snapshot.getFacts());
    }

    private static Snapshot fullSnapshot() {
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("server", available());
        sources.put("pd", available());
        sources.put("stores", available());
        Map<String, Long> facts = new LinkedHashMap<>();
        facts.put("stores", 1L);
        return new Snapshot("UP", 1000L, false, null, sources,
                Arrays.asList(node("server-000000000001", "SERVER", "server",
                                   "UP"),
                              node("pd-000000000001", "PD", "pd", "UP"),
                              metricNode("store-000000000001", "store", "UP",
                                         "backend", 1L, 1000L)), facts);
    }

    private static Snapshot partialSnapshot() {
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("server", available());
        sources.put("pd", available());
        sources.put("stores", new SourceStatus("UNAVAILABLE", "UNKNOWN",
                                                2000L, null, false, false,
                                                "upstream_unavailable")
                .withDiagnostics(Collections.singletonMap("request_path", "/v1/stores")));
        return new Snapshot("DEGRADED", 2000L, false, null, sources,
                Arrays.asList(node("server-000000000001", "SERVER", "server",
                                   "UP"),
                              node("pd-000000000001", "PD", "pd", "UP")),
                Collections.emptyMap());
    }

    private static Snapshot leaderSnapshot(String id, String role,
                                           String availability) {
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("pd", new SourceStatus(availability, "UP", 2000L,
                                            2000L, true, false,
                                            "PARTIAL".equals(availability) ?
                                            "metrics_unavailable" : null));
        Node pd = new Node(id, "PD", "pd", role, "1.7.0", "UP", 2000L,
                           Collections.emptyMap());
        return new Snapshot("PARTIAL".equals(availability) ? "DEGRADED" : "UP",
                            2000L, false, null, sources,
                            Collections.singletonList(pd),
                            Collections.emptyMap());
    }

    private static Snapshot metricSnapshot(boolean partial) {
        long observedAt = partial ? 2000L : 1000L;
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("stores", new SourceStatus(
                    partial ? "PARTIAL" : "AVAILABLE", partial ? "DOWN" : "UP",
                    observedAt, observedAt, !partial, false,
                    partial ? "upstream_timeout" : null));
        Map<String, Object> metrics = new LinkedHashMap<>();
        Map<String, MetricStatus> statuses = new LinkedHashMap<>();
        if (partial) {
            metrics.put("drive", Collections.singletonMap("total", 30L));
            statuses.put("system", new MetricStatus(
                         "UNAVAILABLE", observedAt, null, false, false,
                         "upstream_timeout")
                    .withDiagnostics(Map.of("request_path", "/metrics/system",
                                            "metric_group", "system")));
            statuses.put("drive", new MetricStatus(
                         "AVAILABLE", observedAt, observedAt, true, false, null));
        } else {
            metrics.put("system", Collections.singletonMap("used", 10L));
            metrics.put("drive", Collections.singletonMap("total", 20L));
            statuses.put("system", new MetricStatus(
                         "AVAILABLE", observedAt, observedAt, true, false, null));
            statuses.put("drive", new MetricStatus(
                         "AVAILABLE", observedAt, observedAt, true, false, null));
        }
        Node node = new Node("store-000000000001", "STORE",
                             partial ? "fresh-store" : "old-store", null,
                             "1.7.0", partial ? "DOWN" : "UP", observedAt,
                             metrics, statuses);
        return new Snapshot(partial ? "DOWN" : "UP", observedAt, false,
                            null, sources, Collections.singletonList(node),
                            Collections.emptyMap());
    }

    private static Snapshot factSnapshot(String pdAvailability,
                                         String storesAvailability,
                                         Long dataSize, Long capacity) {
        return factSnapshot(pdAvailability, storesAvailability, dataSize,
                            capacity, 3L, 3L);
    }

    private static Snapshot factSnapshot(String pdAvailability,
                                         String storesAvailability,
                                         Long dataSize, Long capacity,
                                         Long stores, Long storesUp) {
        Map<String, SourceStatus> sources = new LinkedHashMap<>();
        sources.put("pd", factSource(pdAvailability));
        sources.put("pd_cluster_stats", factSource(
                    dataSize == null ? "UNAVAILABLE" : "AVAILABLE"));
        sources.put("stores", factSource(storesAvailability));
        Map<String, Long> facts = new LinkedHashMap<>();
        if (dataSize != null) {
            facts.put("data_size_bytes", dataSize);
        }
        if (capacity != null) {
            facts.put("capacity_total_bytes", capacity);
            facts.put("capacity_used_bytes", capacity / 2L);
        }
        if (stores != null) {
            facts.put("stores", stores);
        }
        if (storesUp != null) {
            facts.put("stores_up", storesUp);
        }
        String status = "AVAILABLE".equals(pdAvailability) &&
                        "AVAILABLE".equals(storesAvailability) ?
                        "UP" : "DEGRADED";
        return new Snapshot(status, 2000L, false, null, sources,
                            Collections.emptyList(), facts);
    }

    private static SourceStatus factSource(String availability) {
        boolean available = "AVAILABLE".equals(availability);
        return new SourceStatus(availability, available ? "UP" : "UNKNOWN",
                                2000L, available ? 2000L : null, available,
                                false, available ? null :
                                "upstream_unavailable");
    }

    private static SourceStatus available() {
        return new SourceStatus("AVAILABLE", "UP", 1000L, 1000L, true,
                                false, null);
    }

    private static Node node(String id, String type, String name,
                             String status) {
        return new Node(id, type, name, null, "1.7.0", status, 1000L,
                        Collections.emptyMap());
    }

    private static Node metricNode(String id, String name, String status,
                                   String group, long value, long observedAt) {
        Map<String, Object> metrics = Collections.singletonMap(
                                      group, Collections.singletonMap("value",
                                                                      value));
        Map<String, MetricStatus> statuses = Collections.singletonMap(
                group, new MetricStatus("AVAILABLE", observedAt, observedAt,
                                        true, false, null));
        return new Node(id, "STORE", name, null, "1.7.0", status, observedAt,
                        metrics, statuses);
    }
}
