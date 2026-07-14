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
import java.util.Collections;
import java.util.LinkedHashMap;
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
    public void testNonPdModeReturnsServerAndUnsupportedPdSources() {
        HugeClient client = serverClient();
        LiveOperationsCollector collector = collector(false, null);

        Snapshot snapshot = collector.collect(client, true);

        Assert.assertEquals("UP", snapshot.getStatus());
        Assert.assertEquals(1, snapshot.getNodes().size());
        Assert.assertEquals("SERVER", snapshot.getNodes().get(0).getType());
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
    public void testHealthOnlyDoesNotCallServerMetrics() {
        HugeClient client = serverClient();
        LiveOperationsCollector collector = collector(false, null);

        collector.collect(client, false);

        Mockito.verify(client, Mockito.never()).metrics();
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
    public void testPdDegradedStatusMakesOverallSnapshotDegraded()
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
        Assert.assertEquals("DEGRADED",
                            snapshot.getSources().get("pd").getStatus());
    }

    @Test
    public void testPdUnknownStatusMakesOverallSnapshotDegraded()
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
        Assert.assertEquals("UNKNOWN",
                            snapshot.getSources().get("pd").getStatus());
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
        Assert.assertFalse(store.getMetrics().toString().contains("secret"));
        OperationsModels.Node pdNode = snapshot.getNodes().stream()
                .filter(node -> "PD".equals(node.getType()))
                .findFirst().orElseThrow(AssertionError::new);
        Assert.assertTrue(pdNode.getMetrics().containsKey("system"));
        Assert.assertEquals(Long.valueOf(2000L), pdNode.getObservedAt());
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

    private static HttpServer pdServer(int clusterStatus, String cluster,
                                       int storesStatus, String stores)
                                       throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        stores = stores.replace("PD_TEST_PORT",
                                String.valueOf(server.getAddress().getPort()));
        context(server, "/v1/cluster", clusterStatus, cluster);
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
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }

    private static void delayedContext(HttpServer server, String path,
                                       int status, String body, long delayMillis) {
        server.createContext(path, exchange -> {
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

    private static String cluster() {
        return "{\"status\":0,\"data\":{\"state\":\"Cluster_OK\"," +
               "\"graphSize\":2," +
               "\"pdList\":[{\"restUrl\":\"http://pd:8620\"," +
               "\"state\":\"Up\",\"role\":\"Leader\"}]," +
               "\"pdLeader\":{\"restUrl\":\"http://pd:8620\"," +
               "\"state\":\"Up\",\"role\":\"Leader\"}," +
               "\"stores\":[{\"storeId\":1,\"state\":\"Up\"," +
               "\"capacity\":100,\"available\":40}]}}";
    }

    private static String stores() {
        return "{\"status\":0,\"data\":{\"stores\":[{" +
               "\"storeId\":\"1\",\"address\":\"127.0.0.1:8500\"," +
               "\"restAddress\":\"127.0.0.1:PD_TEST_PORT\"," +
               "\"state\":\"Up\"}]}}";
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

        private String response(java.net.URI target) {
            String path = target.getPath();
            if ("/v1/cluster".equals(path)) {
                return cluster();
            }
            if ("/v1/stores".equals(path)) {
                return this.stores;
            }
            if ("/v1/prom/targets-all".equals(path)) {
                return this.targets;
            }
            if ("/actuator/prometheus".equals(path)) {
                return "process_uptime_seconds{hg=\"pd\"} 12\n";
            }
            this.metrics.incrementAndGet();
            this.metricAuthorities.add(OperationsHttpClient.authority(target));
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
}
