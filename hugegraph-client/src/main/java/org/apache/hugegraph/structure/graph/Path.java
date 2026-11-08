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

package org.apache.hugegraph.structure.graph;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;

import org.apache.hugegraph.structure.constant.GraphAttachable;
import org.apache.hugegraph.driver.GraphManager;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.google.common.collect.ImmutableList;

public class Path implements GraphAttachable {

    @JsonProperty
    private List<Object> labels;
    @JsonProperty
    private List<Object> objects;
    @JsonProperty
    private Object crosspoint;

    public Path() {
        this(ImmutableList.of());
    }

    public Path(List<Object> objects) {
        this(null, objects);
    }

    public Path(Object crosspoint, List<Object> objects) {
        this.crosspoint = crosspoint;
        this.labels = new CopyOnWriteArrayList<>();
        this.objects = new CopyOnWriteArrayList<>(objects);
    }

    public List<Object> labels() {
        return Collections.unmodifiableList(this.labels);
    }

    public void labels(Object... labels) {
        this.labels.addAll(Arrays.asList(labels));
    }

    public List<Object> objects() {
        return Collections.unmodifiableList(this.objects);
    }

    public void objects(Object... objects) {
        this.objects.addAll(Arrays.asList(objects));
    }

    public Object crosspoint() {
        return this.crosspoint;
    }

    public void crosspoint(Object crosspoint) {
        this.crosspoint = crosspoint;
    }

    public int size() {
        return this.objects.size();
    }

    @Override
    public void attachManager(GraphManager manager) {
        for (Object object : this.objects) {
            if (object instanceof GraphAttachable attachable) {
                attachable.attachManager(manager);
            }
        }
        if (this.crosspoint instanceof GraphAttachable attachable) {
            attachable.attachManager(manager);
        }
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof Path other)) {
            return false;
        }
        return Objects.equals(this.labels, other.labels) &&
               Objects.equals(this.objects, other.objects) &&
               Objects.equals(this.crosspoint, other.crosspoint);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.labels, this.objects, this.crosspoint);
    }

    @Override
    public String toString() {
        return String.format("{labels=%s, objects=%s, crosspoint=%s}",
                             this.labels, this.objects, this.crosspoint);
    }
}
