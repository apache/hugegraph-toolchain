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

    @Test
    public void testSpaceAdminOverviewContainsOnlyRedactedHealth() {
        DefaultOperationsDataService service = service(snapshot(), 5);
        HugeClient client = client("token-a");

        Map<String, Object> overview = service.overview(client,
                Set.of(OperationsCapabilityService.HEALTH_READ), false);

        Assert.assertFalse(overview.containsKey("nodes"));
        Assert.assertFalse(overview.containsKey("facts"));
        Assert.assertTrue(overview.containsKey("sources"));
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
        Node staleStore = ((java.util.List<Node>) nodes).stream()
                .filter(node -> "STORE".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        MetricStatus backend = staleStore.getMetricStatuses().get("backend");
        Assert.assertEquals("UNAVAILABLE", backend.getAvailability());
        Assert.assertEquals("upstream_unavailable", backend.getReason());
        Assert.assertTrue(backend.isStale());
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
                                                "upstream_unavailable"));
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
                         "upstream_timeout"));
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
