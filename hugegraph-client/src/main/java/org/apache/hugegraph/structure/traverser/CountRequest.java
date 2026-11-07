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

import java.util.ArrayList;
import java.util.List;

import org.apache.hugegraph.api.API;
import org.apache.hugegraph.structure.constant.Traverser;
import org.apache.hugegraph.util.E;

import com.fasterxml.jackson.annotation.JsonProperty;

public class CountRequest {

    @JsonProperty("source")
    private Object source;
    @JsonProperty("steps")
    private List<EdgeStep> steps;
    @JsonProperty("contains_traversed")
    public boolean containsTraversed;
    @JsonProperty("dedup_size")
    public long dedupSize;

    private CountRequest() {
        this.source = null;
        this.steps = new ArrayList<>();
        this.containsTraversed = false;
        this.dedupSize = Traverser.DEFAULT_DEDUP_SIZE;
    }

    public static Builder builder() {
        return new Builder();
    }

    @Override
    public String toString() {
        return String.format("CountRequest{source=%s,steps=%s," +
                             "containsTraversed=%s,dedupSize=%s}",
                             this.source, this.steps, this.containsTraversed,
                             this.dedupSize);
    }

    public static class Builder {

        private final CountRequest request;
        private final List<EdgeStep.Builder> stepBuilders;

        private Builder() {
            this.request = new CountRequest();
            this.stepBuilders = new ArrayList<>();
        }

        public Builder source(Object source) {
            E.checkArgumentNotNull(source, "The source can't be null");
            this.request.source = source;
            return this;
        }

        public EdgeStep.Builder steps() {
            EdgeStep.Builder builder = EdgeStep.builder();
            this.stepBuilders.add(builder);
            return builder;
        }

        public Builder containsTraversed(boolean containsTraversed) {
            this.request.containsTraversed = containsTraversed;
            return this;
        }

        public Builder dedupSize(long dedupSize) {
            checkDedupSize(dedupSize);
            this.request.dedupSize = dedupSize;
            return this;
        }

        public CountRequest build() {
            E.checkArgumentNotNull(this.request.source,
                                   "The source can't be null");
            for (EdgeStep.Builder builder : this.stepBuilders) {
                this.request.steps.add(builder.build());
            }
            E.checkArgument(this.request.steps != null &&
                            !this.request.steps.isEmpty(),
                            "The steps can't be null or empty");
            checkDedupSize(this.request.dedupSize);
            return this.request;
        }
    }

    private static void checkDedupSize(long dedupSize) {
        E.checkArgument(dedupSize >= 0L || dedupSize == API.NO_LIMIT,
                        "The dedup size must be >= 0 or == %s, but got: %s",
                        API.NO_LIMIT, dedupSize);
    }
}
