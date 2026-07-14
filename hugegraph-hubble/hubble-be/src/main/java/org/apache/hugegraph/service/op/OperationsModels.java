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

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

public final class OperationsModels {

    private OperationsModels() {
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static final class Node {

        private final String id;
        private final String type;
        private final String name;
        private final String role;
        private final String version;
        private final String status;
        private final Long observedAt;
        private final Map<String, Object> metrics;
        private final Map<String, MetricStatus> metricStatuses;

        public Node(String id, String type, String name, String role,
                    String version, String status, Long observedAt,
                    Map<String, Object> metrics) {
            this(id, type, name, role, version, status, observedAt, metrics,
                 Collections.emptyMap());
        }

        public Node(String id, String type, String name, String role,
                    String version, String status, Long observedAt,
                    Map<String, Object> metrics,
                    Map<String, MetricStatus> metricStatuses) {
            this.id = id;
            this.type = type;
            this.name = name;
            this.role = role;
            this.version = version;
            this.status = status;
            this.observedAt = observedAt;
            this.metrics = immutableMap(metrics);
            this.metricStatuses = immutableMap(metricStatuses);
        }

        public String getId() {
            return this.id;
        }

        public String getType() {
            return this.type;
        }

        public String getName() {
            return this.name;
        }

        public String getRole() {
            return this.role;
        }

        public String getVersion() {
            return this.version;
        }

        public String getStatus() {
            return this.status;
        }

        public Long getObservedAt() {
            return this.observedAt;
        }

        public Map<String, Object> getMetrics() {
            return this.metrics;
        }

        public Map<String, MetricStatus> getMetricStatuses() {
            return this.metricStatuses;
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static final class MetricStatus {

        private final String availability;
        private final Long observedAt;
        private final Long lastSuccessAt;
        private final boolean fresh;
        private final boolean stale;
        private final String reason;

        public MetricStatus(String availability, Long observedAt,
                            Long lastSuccessAt, boolean fresh, boolean stale,
                            String reason) {
            this.availability = availability;
            this.observedAt = observedAt;
            this.lastSuccessAt = lastSuccessAt;
            this.fresh = fresh;
            this.stale = stale;
            this.reason = reason;
        }

        public String getAvailability() {
            return this.availability;
        }

        public Long getObservedAt() {
            return this.observedAt;
        }

        public Long getLastSuccessAt() {
            return this.lastSuccessAt;
        }

        public boolean isFresh() {
            return this.fresh;
        }

        public boolean isStale() {
            return this.stale;
        }

        public String getReason() {
            return this.reason;
        }

        public MetricStatus stale(String staleReason) {
            return new MetricStatus(this.availability, this.observedAt,
                                    this.lastSuccessAt, false, true,
                                    staleReason);
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static final class Topology {

        private final String status;
        private final List<Node> nodes;
        private final Map<String, Long> facts;

        public Topology(String status, List<Node> nodes,
                        Map<String, Long> facts) {
            this.status = status;
            this.nodes = Collections.unmodifiableList(nodes);
            this.facts = Collections.unmodifiableMap(facts);
        }

        public String getStatus() {
            return this.status;
        }

        public List<Node> getNodes() {
            return this.nodes;
        }

        public Map<String, Long> getFacts() {
            return this.facts;
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static final class SourceStatus {

        private final String availability;
        private final String status;
        private final Long observedAt;
        private final Long lastSuccessAt;
        private final boolean fresh;
        private final boolean stale;
        private final String reason;

        public SourceStatus(String availability, String status, Long observedAt,
                            Long lastSuccessAt, boolean fresh, boolean stale,
                            String reason) {
            this.availability = availability;
            this.status = status;
            this.observedAt = observedAt;
            this.lastSuccessAt = lastSuccessAt;
            this.fresh = fresh;
            this.stale = stale;
            this.reason = reason;
        }

        public String getAvailability() {
            return this.availability;
        }

        public String getStatus() {
            return this.status;
        }

        public Long getObservedAt() {
            return this.observedAt;
        }

        public Long getLastSuccessAt() {
            return this.lastSuccessAt;
        }

        public boolean isFresh() {
            return this.fresh;
        }

        public boolean isStale() {
            return this.stale;
        }

        public String getReason() {
            return this.reason;
        }

        public SourceStatus stale(String staleReason) {
            return new SourceStatus(this.availability, this.status,
                                    this.observedAt, this.lastSuccessAt,
                                    false, true, staleReason);
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public static final class Snapshot {

        private final String status;
        private final long observedAt;
        private final boolean stale;
        private final String reason;
        private final Map<String, SourceStatus> sources;
        private final List<Node> nodes;
        private final Map<String, Long> facts;

        public Snapshot(String status, long observedAt, boolean stale,
                        String reason, Map<String, SourceStatus> sources,
                        List<Node> nodes, Map<String, Long> facts) {
            this.status = status;
            this.observedAt = observedAt;
            this.stale = stale;
            this.reason = reason;
            this.sources = Collections.unmodifiableMap(sources);
            this.nodes = Collections.unmodifiableList(nodes);
            this.facts = Collections.unmodifiableMap(facts);
        }

        public String getStatus() {
            return this.status;
        }

        public long getObservedAt() {
            return this.observedAt;
        }

        public boolean isStale() {
            return this.stale;
        }

        public String getReason() {
            return this.reason;
        }

        public Map<String, SourceStatus> getSources() {
            return this.sources;
        }

        public List<Node> getNodes() {
            return this.nodes;
        }

        public Map<String, Long> getFacts() {
            return this.facts;
        }

        public Snapshot stale(String staleReason) {
            Map<String, SourceStatus> staleSources = new java.util.LinkedHashMap<>();
            this.sources.forEach((name, source) ->
                    staleSources.put(name, source.stale(staleReason)));
            List<Node> staleNodes = new ArrayList<>();
            for (Node node : this.nodes) {
                Map<String, MetricStatus> statuses = new LinkedHashMap<>();
                node.getMetricStatuses().forEach((group, status) -> {
                    MetricStatus staleStatus = status.getLastSuccessAt() == null ?
                            status : new MetricStatus(
                            "UNAVAILABLE", status.getObservedAt(),
                            status.getLastSuccessAt(), false, true, staleReason);
                    statuses.put(group, staleStatus);
                });
                staleNodes.add(new Node(
                               node.getId(), node.getType(), node.getName(),
                               node.getRole(), node.getVersion(), node.getStatus(),
                               node.getObservedAt(), node.getMetrics(), statuses));
            }
            return new Snapshot("DEGRADED", this.observedAt, true, staleReason,
                                staleSources, staleNodes, this.facts);
        }
    }

    private static <K, V> Map<K, V> immutableMap(Map<K, V> values) {
        if (values == null || values.isEmpty()) {
            return Collections.emptyMap();
        }
        return Collections.unmodifiableMap(new LinkedHashMap<>(values));
    }
}
