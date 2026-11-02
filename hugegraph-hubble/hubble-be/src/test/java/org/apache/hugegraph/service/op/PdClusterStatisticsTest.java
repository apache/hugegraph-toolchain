/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.service.op;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.Assert;
import org.junit.Test;

public class PdClusterStatisticsTest {

    @Test
    public void testConcurrentCallsShareOneNonBlockingCollection() throws Exception {
        MutableClock clock = new MutableClock(1000L);
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (PdClusterStatistics stats = new PdClusterStatistics(() -> {
            calls.incrementAndGet();
            started.countDown();
            try {
                if (!release.await(3, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test timed out");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
            return Map.of("graphs", 11L);
        }, clock, 60000L)) {
            PdClusterStatistics.Result cold = stats.sample();
            Assert.assertEquals("UNAVAILABLE", cold.getStatus().getAvailability());
            Assert.assertTrue(started.await(2, TimeUnit.SECONDS));
            for (int i = 0; i < 30; i++) {
                Assert.assertTrue(stats.sample().getFacts().isEmpty());
            }
            Assert.assertEquals(1, calls.get());
            release.countDown();
            PdClusterStatistics.Result result = await(stats,
                    value -> "AVAILABLE".equals(value.getStatus().getAvailability()));
            Assert.assertEquals(Map.of("graphs", 11L), result.getFacts());
            Assert.assertEquals(Long.valueOf(1000L), result.getStatus().getLastSuccessAt());
            for (int i = 0; i < 10; i++) {
                stats.sample();
            }
            Assert.assertEquals(1, calls.get());
        } finally {
            release.countDown();
        }
    }

    @Test
    public void testFailureIsRateLimitedAndLastGoodValueMarkedStale() throws Exception {
        MutableClock clock = new MutableClock(1000L);
        AtomicInteger calls = new AtomicInteger();
        try (PdClusterStatistics stats = new PdClusterStatistics(() -> {
            if (calls.incrementAndGet() == 1) {
                return Map.of("graphs", 11L);
            }
            throw new IllegalStateException("PD unavailable");
        }, clock, 60000L)) {
            stats.sample();
            await(stats, value -> "AVAILABLE".equals(value.getStatus().getAvailability()));
            clock.setMillis(61000L);
            PdClusterStatistics.Result stale = await(stats, value ->
                    "PARTIAL".equals(value.getStatus().getAvailability()) && calls.get() == 2);
            Assert.assertEquals(Map.of("graphs", 11L), stale.getFacts());
            Assert.assertTrue(stale.getStatus().isStale());
            Assert.assertEquals(Long.valueOf(1000L), stale.getStatus().getLastSuccessAt());
            for (int i = 0; i < 20; i++) {
                stats.sample();
            }
            Assert.assertEquals(2, calls.get());
        }
    }

    @Test
    public void testRefreshKeepsLastValueAndSignalsPollingUntilComplete() throws Exception {
        MutableClock clock = new MutableClock(1000L);
        AtomicInteger calls = new AtomicInteger();
        CountDownLatch refreshStarted = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try (PdClusterStatistics stats = new PdClusterStatistics(() -> {
            if (calls.incrementAndGet() == 1) {
                return Map.of("graphs", 11L);
            }
            refreshStarted.countDown();
            try {
                if (!release.await(3, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test timed out");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(e);
            }
            return Map.of("graphs", 12L);
        }, clock, 60000L)) {
            stats.sample();
            await(stats, value -> "AVAILABLE".equals(value.getStatus().getAvailability()));
            clock.setMillis(61000L);
            PdClusterStatistics.Result collecting = stats.sample();
            Assert.assertTrue(refreshStarted.await(2, TimeUnit.SECONDS));
            Assert.assertEquals("collecting", collecting.getStatus().getReason());
            Assert.assertEquals("AVAILABLE", collecting.getStatus().getAvailability());
            Assert.assertFalse(collecting.getStatus().isStale());
            Assert.assertEquals(Map.of("graphs", 11L), collecting.getFacts());
            release.countDown();
            PdClusterStatistics.Result refreshed = await(stats, value ->
                    Long.valueOf(12L).equals(value.getFacts().get("graphs")) &&
                    value.getStatus().getReason() == null);
            Assert.assertEquals(Long.valueOf(61000L), refreshed.getStatus().getLastSuccessAt());
        } finally {
            release.countDown();
        }
    }

    @Test
    public void testInitialFailureDoesNotBecomeZeroOrRetryImmediately() throws Exception {
        MutableClock clock = new MutableClock(1000L);
        AtomicInteger calls = new AtomicInteger();
        try (PdClusterStatistics stats = new PdClusterStatistics(() -> {
            calls.incrementAndGet();
            throw new IllegalStateException("malformed response");
        }, clock, 60000L)) {
            stats.sample();
            PdClusterStatistics.Result failed = await(stats, value ->
                    "collection_failed".equals(value.getStatus().getReason()));
            Assert.assertEquals("UNAVAILABLE", failed.getStatus().getAvailability());
            Assert.assertTrue(failed.getFacts().isEmpty());
            Assert.assertNull(failed.getStatus().getLastSuccessAt());
            for (int i = 0; i < 20; i++) {
                stats.sample();
            }
            Assert.assertEquals(1, calls.get());
        }
    }

    @Test
    public void testFailureDiagnosticsAreSanitizedAndClearedOnSuccess() throws Exception {
        MutableClock clock = new MutableClock(1000L);
        AtomicInteger calls = new AtomicInteger();
        try (PdClusterStatistics stats = new PdClusterStatistics(() -> {
            if (calls.incrementAndGet() == 1) {
                throw new UpstreamRequestException("upstream_http_status_503", null,
                        Map.of("request_path", "/v1/cluster", "http_status", 503));
            }
            return Map.of("graphs", 3L);
        }, clock, 60000L)) {
            stats.sample();
            PdClusterStatistics.Result failed = await(stats, value ->
                    "collection_failed".equals(value.getStatus().getReason()));
            Assert.assertEquals(Map.of("request_path", "/v1/cluster", "http_status", 503,
                                       "failure_reason", "upstream_rejected"),
                                failed.getStatus().getDiagnostics());
            clock.setMillis(61000L);
            PdClusterStatistics.Result success = await(stats, value ->
                    "AVAILABLE".equals(value.getStatus().getAvailability()));
            Assert.assertTrue(success.getStatus().getDiagnostics().isEmpty());
        }
    }

    @Test
    public void testParseClusterStatisticsRealPayloadAndKiBConversion() {
        OperationsPayloadParser parser = new OperationsPayloadParser(new ObjectMapper());
        String response = "{\"message\":\"OK\",\"status\":0,\"data\":{" +
                          "\"graphSize\":11,\"partitionSize\":12,\"shardCount\":3," +
                          "\"dataSize\":18715231,\"storeSize\":3}}";
        Assert.assertEquals(Map.of("graphs", 11L, "partitions", 12L,
                                   "replicas", 3L, "data_size_bytes", 19164396544L),
                            parser.parseClusterStatistics(response));
    }

    @Test
    public void testParseClusterStatisticsRejectsInvalidResponse() {
        OperationsPayloadParser parser = new OperationsPayloadParser(new ObjectMapper());
        String fields = "\"graphSize\":11,\"partitionSize\":12," +
                        "\"shardCount\":3,\"dataSize\":18715231";
        String[] invalid = {
            "{\"data\":{" + fields + "}}",
            "{\"status\":1,\"data\":{" + fields + "}}",
            "{\"status\":\"error\",\"data\":{" + fields + "}}",
            "{\"status\":0,\"data\":{\"graphSize\":11}}",
            "{\"status\":0,\"data\":{" + fields.replace("11", "-1") + "}}",
            "{\"status\":0,\"data\":{" + fields.replace("18715231", "-1") + "}}",
            "{\"status\":0,\"data\":{" +
                fields.replace("18715231", "9007199254740992") + "}}",
            "{\"status\":0,\"data\":{" +
                fields.replace("11", "9223372036854775808") + "}}"
        };
        for (String payload : invalid) {
            try {
                parser.parseClusterStatistics(payload);
                Assert.fail("Expected malformed response: " + payload);
            } catch (MalformedUpstreamException expected) {
                // No partial or overflowing data should be published as complete.
            }
        }
    }

    private static PdClusterStatistics.Result await(PdClusterStatistics stats,
                                                      Predicate<PdClusterStatistics.Result> ready)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        PdClusterStatistics.Result result;
        do {
            result = stats.sample();
            if (ready.test(result)) {
                return result;
            }
            Thread.sleep(5L);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("Timed out waiting for statistics");
    }

    private static final class MutableClock extends Clock {
        private final AtomicLong millis;

        private MutableClock(long millis) {
            this.millis = new AtomicLong(millis);
        }

        void setMillis(long value) {
            this.millis.set(value);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            if (!ZoneOffset.UTC.equals(zone)) {
                throw new UnsupportedOperationException();
            }
            return this;
        }

        @Override
        public Instant instant() {
            return Instant.ofEpochMilli(this.millis.get());
        }

        @Override
        public long millis() {
            return this.millis.get();
        }
    }
}
