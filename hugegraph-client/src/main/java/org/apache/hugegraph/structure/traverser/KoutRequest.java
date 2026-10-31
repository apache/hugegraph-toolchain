/*
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

package org.apache.hugegraph.structure.traverser;

import org.apache.hugegraph.api.traverser.TraversersAPI;
import org.apache.hugegraph.structure.constant.Traverser;
import org.apache.hugegraph.util.E;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;

public class KoutRequest {

    @JsonProperty("source")
    private Object source;
    @JsonProperty("steps")
    public Steps steps;
    @JsonProperty("max_depth")
    public int maxDepth;
    @JsonProperty("nearest")
    public boolean nearest = true;
    @JsonProperty("count_only")
    public boolean countOnly = false;
    @JsonProperty("capacity")
    public long capacity = Traverser.DEFAULT_CAPACITY;
    @JsonProperty("limit")
    public long limit = Traverser.DEFAULT_LIMIT;
    @JsonProperty("with_vertex")
    public boolean withVertex = false;
    @JsonProperty("with_path")
    public boolean withPath = false;
    @JsonProperty("with_edge")
    public boolean withEdge = false;
    @JsonProperty("traverse_mode")
    @JsonAlias("algorithm")
    public String traverseMode;

    private KoutRequest() {
        this.source = null;
        this.steps = null;
        this.maxDepth = Traverser.DEFAULT_MAX_DEPTH;
        this.nearest = true;
        this.countOnly = false;
        this.capacity = Traverser.DEFAULT_CAPACITY;
        this.limit = Traverser.DEFAULT_PATHS_LIMIT;
        this.withVertex = false;
        this.withPath = false;
        this.withEdge = false;
        this.traverseMode = Traverser.TRAVERSE_MODE_BFS;
    }

    public static Builder builder() {
        return new Builder();
    }

    @Override
    public String toString() {
        return String.format("KoutRequest{source=%s,steps=%s,maxDepth=%s" +
                             "nearest=%s,countOnly=%s,capacity=%s," +
                             "limit=%s,withVertex=%s,withPath=%s," +
                             "withEdge=%s,traverseMode=%s}",
                             this.source, this.steps, this.maxDepth,
                             this.nearest, this.countOnly, this.capacity,
                             this.limit, this.withVertex, this.withPath,
                             this.withEdge, this.traverseMode);
    }

    public static class Builder {

        private final KoutRequest request;
        private Steps.Builder stepsBuilder;

        private Builder() {
            this.request = new KoutRequest();
            this.stepsBuilder = Steps.builder();
        }

        public Builder source(Object source) {
            E.checkNotNull(source, "source");
            this.request.source = source;
            return this;
        }

        public Steps.Builder steps() {
            Steps.Builder builder = Steps.builder();
            this.stepsBuilder = builder;
            return builder;
        }

        public Builder maxDepth(int maxDepth) {
            TraversersAPI.checkPositive(maxDepth, "max depth");
            this.request.maxDepth = maxDepth;
            return this;
        }

        public Builder nearest(boolean nearest) {
            this.request.nearest = nearest;
            return this;
        }

        public Builder countOnly(boolean countOnly) {
            this.request.countOnly = countOnly;
            return this;
        }

        public Builder capacity(long capacity) {
            TraversersAPI.checkCapacity(capacity);
            this.request.capacity = capacity;
            return this;
        }

        public Builder limit(long limit) {
            TraversersAPI.checkLimit(limit);
            this.request.limit = limit;
            return this;
        }

        public Builder withVertex(boolean withVertex) {
            this.request.withVertex = withVertex;
            return this;
        }

        public Builder withPath(boolean withPath) {
            this.request.withPath = withPath;
            return this;
        }

        public Builder withEdge(boolean withEdge) {
            this.request.withEdge = withEdge;
            return this;
        }

        public KoutRequest build() {
            E.checkNotNull(this.request.source, "The source can't be null");
            this.request.steps = this.stepsBuilder.build();
            E.checkNotNull(this.request.steps, "steps");
            TraversersAPI.checkPositive(this.request.maxDepth, "max depth");
            TraversersAPI.checkCapacity(this.request.capacity);
            TraversersAPI.checkLimit(this.request.limit);
            if (this.request.countOnly) {
                E.checkArgument(!this.request.withVertex &&
                                !this.request.withPath && !this.request.withEdge,
                                "Can't return vertex or path or edge" +
                                "when count only is true");
            }
            return this.request;
        }
    }
}
