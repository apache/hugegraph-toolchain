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

package org.apache.hugegraph.structure.gremlin;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import org.apache.hugegraph.serializer.PathDeserializer;
import org.apache.hugegraph.structure.constant.GraphAttachable;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.rest.SerializeException;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Path;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.util.E;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;

public class ResultSet {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GraphManager graphManager = null;

    @JsonProperty
    private List<Object> data;
    @JsonProperty
    private Map<String, ?> meta;

    static {
        SimpleModule module = new SimpleModule();
        module.addDeserializer(Path.class, new PathDeserializer());
        MAPPER.registerModule(module);
    }

    public void graphManager(GraphManager graphManager) {
        this.graphManager = graphManager;
    }

    public List<Object> data() {
        return this.data;
    }

    public int size() {
        return this.data.size();
    }

    public Result get(int index) {
        if (index >= this.data.size()) {
            return null;
        }

        Object object = this.data().get(index);
        if (object == null) {
            return null;
        }

        Class<?> clazz = this.parseResultClass(object);
        // Primitive type
        if (clazz.equals(object.getClass())) {
            return new Result(object);
        }

        try {
            String rawValue = MAPPER.writeValueAsString(object);
            object = MAPPER.readValue(rawValue, clazz);
            if (object instanceof GraphAttachable attachable) {
                attachable.attachManager(graphManager);
            }
            return new Result(object);
        } catch (Exception e) {
            throw new SerializeException(
                    "Failed to deserialize: %s", e, object);
        }
    }

    /**
     * TODO: Still need to constantly add and optimize
     */
    private Class<?> parseResultClass(Object object) {
        if (object.getClass().equals(LinkedHashMap.class)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) object;
            String type = (String) map.get("type");
            if (type != null) {
                if ("vertex".equals(type)) {
                    return Vertex.class;
                } else if ("edge".equals(type)) {
                    return Edge.class;
                }
            } else {
                if (map.get("labels") != null) {
                    return Path.class;
                }
            }
        }

        return object.getClass();
    }

    public Iterator<Result> iterator() {
        E.checkState(this.data != null, "Invalid response from server");
        E.checkState(this.graphManager != null, "Must hold a graph manager");

        return new Iterator<Result>() {

            private int index = 0;

            @Override
            public boolean hasNext() {
                return this.index < ResultSet.this.data.size();
            }

            @Override
            public Result next() {
                if (!this.hasNext()) {
                    throw new NoSuchElementException();
                }
                return get(this.index++);
            }

            @Override
            public void remove() {
                throw new UnsupportedOperationException();
            }
        };
    }
}
