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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;

import org.apache.hugegraph.service.op.OperationsModels.SourceStatus;

/** A single, rate-limited PD aggregation shared by all overview callers. */
final class PdClusterStatistics implements AutoCloseable {

    private final Supplier<Map<String, Long>> fetch;
    private final Clock clock;
    private final long intervalMillis;
    private final ExecutorService executor;
    private Map<String, Long> facts = Collections.emptyMap();
    private Long lastAttempt;
    private Long lastSuccess;
    private boolean inFlight;
    private boolean failed;
    private Map<String, Object> failureDetails = Collections.emptyMap();
    private boolean closed;

    PdClusterStatistics(Supplier<Map<String, Long>> fetch, Clock clock,
                        long intervalMillis) {
        if (intervalMillis <= 0) {
            throw new IllegalArgumentException("interval must be positive");
        }
        this.fetch = fetch;
        this.clock = clock;
        this.intervalMillis = intervalMillis;
        this.executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "hubble-pd-cluster-statistics");
            thread.setDaemon(true);
            return thread;
        });
    }

    synchronized Result sample() {
        long now = this.clock.millis();
        if (!this.closed && !this.inFlight &&
            (this.lastAttempt == null || now < this.lastAttempt ||
             now - this.lastAttempt >= this.intervalMillis)) {
            this.inFlight = true;
            this.lastAttempt = now;
            this.executor.execute(this::collect);
        }
        if (this.lastSuccess == null) {
            return new Result(Collections.emptyMap(),
                    new SourceStatus("UNAVAILABLE", "UNKNOWN", this.lastAttempt,
                                     null, false, false,
                                     this.inFlight ? "collecting" : "collection_failed",
                                     this.failureDetails));
        }
        boolean stale = this.failed;
        String reason = this.inFlight ? "collecting" : stale ? "statistics_stale" : null;
        return new Result(this.facts,
                new SourceStatus(stale ? "PARTIAL" : "AVAILABLE", "UP",
                                 this.lastAttempt, this.lastSuccess,
                                 !stale, stale, reason, this.failureDetails));
    }

    private void collect() {
        try {
            Map<String, Long> result = this.fetch.get();
            synchronized (this) {
                this.facts = Collections.unmodifiableMap(new LinkedHashMap<>(result));
                this.lastSuccess = this.clock.millis();
                this.failed = false;
                this.failureDetails = Collections.emptyMap();
            }
        } catch (RuntimeException e) {
            synchronized (this) {
                this.failed = true;
                Map<String, Object> details = new LinkedHashMap<>(
                        LiveOperationsCollector.diagnostics(e));
                details.put("failure_reason", LiveOperationsCollector.reason(e));
                this.failureDetails = Collections.unmodifiableMap(details);
            }
        } finally {
            synchronized (this) {
                this.inFlight = false;
            }
        }
    }

    @Override
    public synchronized void close() {
        this.closed = true;
        this.executor.shutdownNow();
    }

    static final class Result {
        private final Map<String, Long> facts;
        private final SourceStatus status;

        Result(Map<String, Long> facts, SourceStatus status) {
            this.facts = facts;
            this.status = status;
        }

        Map<String, Long> getFacts() {
            return this.facts;
        }

        SourceStatus getStatus() {
            return this.status;
        }
    }
}
