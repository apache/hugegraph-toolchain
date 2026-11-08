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

package org.apache.hugegraph.spark.connector.builder;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CoderResult;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.apache.commons.collections.ListUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.spark.connector.client.HGLoadContext;
import org.apache.hugegraph.spark.connector.client.SchemaCache;
import org.apache.hugegraph.spark.connector.constant.Constants;
import org.apache.hugegraph.spark.connector.mapping.ElementMapping;
import org.apache.hugegraph.spark.connector.utils.DataTypeUtils;
import org.apache.hugegraph.structure.GraphElement;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.structure.schema.SchemaLabel;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.LongEncoding;

import com.google.common.collect.ImmutableList;

public abstract class ElementBuilder<GE extends GraphElement> {

    private final SchemaCache schema;

    // NOTE: CharsetEncoder is not thread safe
    private final CharsetEncoder encoder;

    private final ByteBuffer buffer;

    public ElementBuilder(HGLoadContext context) {
        this.schema = context.schemaCache();
        this.encoder = Constants.CHARSET.newEncoder();
        this.buffer = ByteBuffer.allocate(Constants.VERTEX_ID_LIMIT);
    }

    public abstract ElementMapping mapping();

    public abstract SchemaLabel schemaLabel();

    protected abstract boolean isIdField(String fieldName);

    public abstract List<GE> build(String[] names, Object[] values);

    protected VertexKVPairs newKVPairs(VertexLabel vertexLabel) {
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomize()) {
            return new VertexIdKVPairs(vertexLabel);
        } else {
            assert idStrategy.isPrimaryKey();
            return new VertexPkKVPairs(vertexLabel);
        }
    }

    /**
     * Retain only the key-value pairs needed by the current vertex or edge
     */
    protected boolean retainField(String fieldName, Object fieldValue) {
        ElementMapping mapping = this.mapping();
        Set<String> selectedFields = mapping.selectedFields();
        Set<String> ignoredFields = mapping.ignoredFields();
        // Retain selected fields or remove ignored fields
        if (!selectedFields.isEmpty() && !selectedFields.contains(fieldName)) {
            return false;
        }
        return ignoredFields.isEmpty() || !ignoredFields.contains(fieldName);
    }

    protected void addProperty(GraphElement element, String key, Object value) {
        value = this.convertPropertyValue(key, value);
        element.property(key, value);
    }

    protected void addProperties(GraphElement element, Map<String, Object> properties) {
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            value = this.convertPropertyValue(key, value);
            element.property(key, value);
        }
    }

    protected PropertyKey getPropertyKey(String name) {
        return this.schema.getPropertyKey(name);
    }

    protected VertexLabel getVertexLabel(String name) {
        return this.schema.getVertexLabel(name);
    }

    protected EdgeLabel getEdgeLabel(String name) {
        return this.schema.getEdgeLabel(name);
    }

    protected Object mappingValue(String fieldName, Object fieldValue) {
        if (this.mapping().mappingValues().isEmpty()) {
            return fieldValue;
        }
        String fieldStrValue = String.valueOf(fieldValue);
        return this.mapping().mappingValue(fieldName, fieldStrValue);
    }

    private void customizeId(VertexLabel vertexLabel, Vertex vertex,
                             String idField, Object idValue) {
        E.checkArgumentNotNull(idField, "The vertex id field can't be null");
        E.checkArgumentNotNull(idValue, "The vertex id value can't be null");
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomizeString()) {
            String id = (String) idValue;
            this.checkVertexIdLength(id);
            vertex.id(id);
        } else if (idStrategy.isCustomizeNumber()) {
            Long id = DataTypeUtils.parseNumber(idField, idValue);
            vertex.id(id);
        } else {
            assert idStrategy.isCustomizeUuid();
            UUID id = DataTypeUtils.parseUUID(idField, idValue);
            vertex.id(id);
        }
    }

    private Object convertPropertyValue(String key, Object rawValue) {
        PropertyKey propertyKey = this.getPropertyKey(key);
        return DataTypeUtils.convert(rawValue, propertyKey);
    }

    private boolean vertexIdEmpty(VertexLabel vertexLabel, Vertex vertex) {
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomizeString()) {
            Object vertexId = vertex.id();
            return vertexId == null || StringUtils.isEmpty((String) vertexId);
        }
        return false;
    }

    private void checkPrimaryValuesValid(VertexLabel vertexLabel, Object[] primaryValues) {
        List<String> primaryKeys = vertexLabel.primaryKeys();
        E.checkArgument(primaryKeys.size() == primaryValues.length,
                        "Missing some primary key values, expect %s, " +
                        "but only got %s for vertex label '%s'",
                        primaryKeys, Arrays.toString(primaryValues), vertexLabel);

        for (int i = 0; i < primaryKeys.size(); i++) {
            E.checkArgument(primaryValues[i] != null,
                            "Make sure the value of the primary key '%s' is " +
                            "not empty, or check whether the headers or " +
                            "field_mapping are configured correctly",
                            primaryKeys.get(i));
        }
    }

    private String spliceVertexId(VertexLabel vertexLabel, Object... primaryValues) {
        StringBuilder vertexId = new StringBuilder();
        StringBuilder vertexKeysId = new StringBuilder();
        for (Object value : primaryValues) {
            String pkValue;
            if (value instanceof Number || value instanceof Date) {
                pkValue = LongEncoding.encodeNumber(value);
            } else {
                pkValue = String.valueOf(value);
            }
            if (StringUtils.containsAny(pkValue, Constants.SEARCH_LIST)) {
                pkValue = StringUtils.replaceEach(pkValue,
                                                  Constants.SEARCH_LIST,
                                                  Constants.TARGET_LIST);
            }
            vertexKeysId.append(pkValue);
            vertexKeysId.append("!");
        }
        vertexId.append(vertexLabel.id()).append(":").append(vertexKeysId);
        vertexId.deleteCharAt(vertexId.length() - 1);
        return vertexId.toString();
    }

    private void checkVertexIdLength(String id) {
        this.encoder.reset();
        this.buffer.clear();
        CoderResult r = this.encoder.encode(CharBuffer.wrap(id.toCharArray()),
                                            this.buffer, true);
        E.checkArgument(r.isUnderflow(),
                        "The vertex id length exceeds limit %s : '%s'",
                        Constants.VERTEX_ID_LIMIT, id);
    }

    private boolean isEmptyPkValue(Object pkValue) {
        if (pkValue == null) {
            return true;
        }
        if (pkValue instanceof String pkValueStr) {
            return pkValueStr.isEmpty();
        }
        return false;
    }

    public abstract static class VertexKVPairs {

        public final VertexLabel vertexLabel;

        // General properties
        public Map<String, Object> properties;

        public VertexKVPairs(VertexLabel vertexLabel) {
            this.vertexLabel = vertexLabel;
            this.properties = null;
        }

        public abstract void extractFromVertex(String[] names, Object[] values);

        public abstract void extractFromEdge(String[] names, Object[] values, int[] fieldIndexes);

        public abstract List<Vertex> buildVertices(boolean withProperty, boolean withId);
    }

    public class VertexIdKVPairs extends VertexKVPairs {

        // The idField(raw field), like: id
        private String idField;

        // The single idValue(mapped), like: A -> 1
        private Object idValue;

        public VertexIdKVPairs(VertexLabel vertexLabel) {
            super(vertexLabel);
        }

        @Override
        public void extractFromVertex(String[] names, Object[] values) {
            // General properties
            this.properties = new HashMap<>();
            for (int i = 0; i < names.length; i++) {
                String fieldName = names[i];
                Object fieldValue = values[i];
                if (!retainField(fieldName, fieldValue)) {
                    continue;
                }
                if (isIdField(fieldName)) {
                    this.idField = fieldName;
                    this.idValue = mappingValue(fieldName, fieldValue);
                } else {
                    String key = mapping().mappingField(fieldName);
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values, int[] fieldIndexes) {
            assert fieldIndexes.length == 1;
            String fieldName = names[fieldIndexes[0]];
            Object fieldValue = values[fieldIndexes[0]];
            this.idField = fieldName;
            this.idValue = mappingValue(fieldName, fieldValue);
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty, boolean withId) {
            Vertex vertex = new Vertex(vertexLabel.name());
            customizeId(vertexLabel, vertex, this.idField, this.idValue);
            // empty string id ("")
            if (vertexIdEmpty(vertexLabel, vertex)) {
                return ImmutableList.of();
            }
            if (withProperty) {
                String key = mapping().mappingField(this.idField);
                // The id field is also used as a general property
                if (vertexLabel.properties().contains(key)) {
                    addProperty(vertex, key, this.idValue);
                }
                addProperties(vertex, this.properties);
            }
            return ImmutableList.of(vertex);
        }
    }

    public class VertexPkKVPairs extends VertexKVPairs {

        /*
         * The primary key names(mapped), allowed multiple
         * like: [p_name,p_age] -> [name,age]
         */
        private List<String> pkNames;

        /*
         * The primary values(mapped), length is the same as pkNames
         * like: [m,2] -> [marko,18]
         */
        private Object[] pkValues;

        public VertexPkKVPairs(VertexLabel vertexLabel) {
            super(vertexLabel);
        }

        @Override
        public void extractFromVertex(String[] names, Object[] values) {
            List<String> primaryKeys = this.vertexLabel.primaryKeys();
            this.pkNames = primaryKeys;
            this.pkValues = new Object[primaryKeys.size()];
            // General properties
            this.properties = new HashMap<>();
            for (int i = 0; i < names.length; i++) {
                String fieldName = names[i];
                Object fieldValue = values[i];
                if (!retainField(fieldName, fieldValue)) {
                    continue;
                }
                String key = mapping().mappingField(fieldName);
                if (primaryKeys.contains(key)) {
                    // Don't put primary key/values into general properties
                    int index = primaryKeys.indexOf(key);
                    Object pkValue = mappingValue(fieldName, fieldValue);
                    this.pkValues[index] = pkValue;
                } else {
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values, int[] fieldIndexes) {
            this.pkNames = new ArrayList<>(fieldIndexes.length);
            for (int fieldIndex : fieldIndexes) {
                String fieldName = names[fieldIndex];
                String mappingField = mapping().mappingField(fieldName);
                this.pkNames.add(mappingField);
            }
            List<String> primaryKeys = this.vertexLabel.primaryKeys();
            E.checkArgument(ListUtils.isEqualList(this.pkNames, primaryKeys),
                            "Make sure the the primary key fields %s are " +
                            "not empty, or check whether the headers or " +
                            "field_mapping are configured correctly",
                            primaryKeys);
            this.pkValues = new Object[this.pkNames.size()];
            for (int i = 0; i < fieldIndexes.length; i++) {
                String fieldName = names[fieldIndexes[i]];
                Object fieldValue = values[fieldIndexes[i]];
                Object pkValue = mappingValue(fieldName, fieldValue);
                this.pkValues[i] = pkValue;
            }
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty, boolean withId) {
            checkPrimaryValuesValid(vertexLabel, this.pkValues);
            for (int i = 0; i < this.pkNames.size(); i++) {
                if (isEmptyPkValue(this.pkValues[i])) {
                    return ImmutableList.of();
                }
                Object pkValue = convertPropertyValue(this.pkNames.get(i), this.pkValues[i]);
                this.pkValues[i] = pkValue;
            }
            String id = spliceVertexId(vertexLabel, this.pkValues);
            checkVertexIdLength(id);

            Vertex vertex = new Vertex(vertexLabel.name());
            // NOTE: withProperty is true means that parsing vertex
            if (withProperty) {
                for (int i = 0; i < this.pkNames.size(); i++) {
                    addProperty(vertex, this.pkNames.get(i), this.pkValues[i]);
                }
                addProperties(vertex, this.properties);
            }
            if (withId) {
                vertex.id(id);
            } else {
                vertex.id(null);
            }
            return ImmutableList.of(vertex);
        }
    }
}
