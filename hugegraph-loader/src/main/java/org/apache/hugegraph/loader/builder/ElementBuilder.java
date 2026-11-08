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

package org.apache.hugegraph.loader.builder;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetEncoder;
import java.nio.charset.CoderResult;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.apache.commons.collections.CollectionUtils;
import org.apache.commons.collections.ListUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.util.E;
import org.apache.hugegraph.util.LongEncoding;

import org.apache.hugegraph.loader.constant.Constants;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.filter.util.ShortIdConfig;
import org.apache.hugegraph.loader.mapping.ElementMapping;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.util.DataTypeUtil;
import org.apache.hugegraph.structure.GraphElement;
import org.apache.hugegraph.structure.constant.DataType;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.structure.schema.SchemaLabel;
import org.apache.hugegraph.structure.schema.VertexLabel;

import java.util.HashSet;

import com.google.common.collect.ImmutableList;

public abstract class ElementBuilder<GE extends GraphElement> {

    private final InputStruct struct;
    private final SchemaCache schema;

    // NOTE: CharsetEncoder is not thread safe
    private final CharsetEncoder encoder;
    private final ByteBuffer buffer;
    private LoadContext context;
    private boolean usePrefilter;
    private static HashSet<byte[]> bytesSet;
    private static HashSet<Long> longSet;

    public ElementBuilder(LoadContext context, InputStruct struct) {
        this.struct = struct;
        this.schema = context.schemaCache();
        this.encoder = Constants.CHARSET.newEncoder();
        this.buffer = ByteBuffer.allocate(Constants.VERTEX_ID_LIMIT);
        this.context = context;
        this.usePrefilter = this.context.options().usePrefilter;
        if (longSet == null) {
            synchronized (ElementBuilder.class) {
                if (longSet == null) {
                    longSet = new HashSet<>();
                    bytesSet = new HashSet<>();
                }
            }
        }
    }

    public abstract ElementMapping mapping();

    public abstract List<GE> build(String[] names, Object[] values);

    protected abstract SchemaLabel schemaLabel();

    protected abstract Collection<String> nonNullableKeys();

    protected abstract boolean isIdField(String fieldName);

    // Whether builder distinguishes header case sensitivity
    protected boolean headerCaseSensitive() {
        return this.struct.input().headerCaseSensitive();
    }

    protected boolean headerEqual(String header1, String header2) {
        if (this.headerCaseSensitive()) {
            return header1.equals(header2);
        } else {
            return header1.equalsIgnoreCase(header2);
        }
    }

    @SuppressWarnings("unchecked")
    protected Collection<String> nonNullableKeys(SchemaLabel schemaLabel) {
        return CollectionUtils.subtract(schemaLabel.properties(),
                                        schemaLabel.nullableKeys());
    }

    protected VertexKVPairs newKVPairs(VertexLabel vertexLabel,
                                       boolean unfold) {
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomize()) {
            if (unfold) {
                return new VertexFlatIdKVPairs(vertexLabel);
            } else {
                return new VertexIdKVPairs(vertexLabel);
            }
        } else {
            assert idStrategy.isPrimaryKey();
            if (unfold) {
                return new VertexFlatPkKVPairs(vertexLabel);
            } else {
                return new VertexPkKVPairs(vertexLabel);
            }
        }
    }

    protected boolean isSelectedField(String fieldName) {
        ElementMapping mapping = this.mapping();
        Set<String> selectedFields = mapping.selectedFields();

        if (selectedFields.isEmpty()) {
            return true;
        }

        if (this.headerCaseSensitive()) {
            if (selectedFields.contains(fieldName)) {
                return true;
            }
        } else {
            for (String selectedField : selectedFields) {
                if (headerEqual(selectedField, fieldName)) {
                    return true;
                }
            }
        }

        return false;
    }

    protected boolean isIgnoredField(String fieldName) {
        ElementMapping mapping = this.mapping();
        Set<String> ignoredFields = mapping.ignoredFields();

        if (ignoredFields.isEmpty()) {
            return false;
        }

        if (this.headerCaseSensitive()) {
            if (ignoredFields.contains(fieldName)) {
                return true;
            }
        } else {
            for (String ignoredField : ignoredFields) {
                if (headerEqual(ignoredField, fieldName)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Retain only the key-value pairs needed by the current vertex or edge
     */
    protected boolean retainField(String fieldName, Object fieldValue) {
        ElementMapping mapping = this.mapping();
        Set<String> selectedFields = mapping.selectedFields();
        Set<String> ignoredFields = mapping.ignoredFields();
        // Retain selected fields or remove ignored fields
        if (!isSelectedField(fieldName)) {
            return false;
        }
        if (isIgnoredField(fieldName)) {
            return false;
        }

        String mappedKey = mappingField(fieldName);

        Set<String> nullableKeys = this.schemaLabel().nullableKeys();
        Set<Object> nullValues = mapping.nullValues();
        if (nullableKeys.isEmpty() || nullValues.isEmpty()) {
            return true;
        }

        // When fieldValue is empty and schema allows null
        if (fieldValue == null && nullableKeys.contains(mappedKey)) {
            return false;
        }

        return !nullableKeys.contains(mappedKey) ||
               !nullValues.contains(fieldValue);
    }

    protected void addProperty(GraphElement element, String key, Object value) {
        this.addProperty(element, key, value, true);
    }

    protected void addProperty(GraphElement element, String key, Object value,
                               boolean needConvert) {
        if (needConvert) {
            value = this.convertPropertyValue(key, value);
        }
        element.property(key, value);
    }

    protected void addProperties(GraphElement element,
                                 Map<String, Object> properties) {
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            this.checkFieldValue(key, value);
            value = this.convertPropertyValue(key, value);

            element.property(key, value);
        }
    }

    protected void checkNonNullableKeys(GraphElement element) {
        Set<String> keys = element.properties().keySet();
        // Check whether passed all non-null property
        Collection<String> requiredKeys = this.nonNullableKeys();
        if (!keys.containsAll(requiredKeys)) {
            @SuppressWarnings("unchecked")
            Collection<String> missed = CollectionUtils.subtract(requiredKeys,
                                                                 keys);
            E.checkArgument(false, "All non-null property keys %s of '%s' " +
                                   "must be set, but missed keys %s",
                            requiredKeys, this.schemaLabel().name(), missed);
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
        return this.mapping().mappingValue(fieldName, fieldStrValue,
                                           this.headerCaseSensitive());
    }

    protected String mappingField(String fileName) {
        return this.mapping().mappingField(fileName,
                                           this.headerCaseSensitive());
    }

    private void customizeId(VertexLabel vertexLabel, Vertex vertex,
                             String idField, Object idValue) {
        ShortIdConfig shortIdConfig = this.context.options().getShortIdConfig(vertexLabel.name());
        if (idField == null && shortIdConfig != null &&
            shortIdConfig.getPrimaryKeyField() != null) {
            return;
        }
        E.checkArgumentNotNull(idField, "The vertex id field can't be null");
        E.checkArgumentNotNull(idValue, "The vertex id value of field(%s)" +
                                        " can't be null", idField);
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (shortIdConfig != null) {
            DataType type =
                    this.context.options().getShortIdConfig(vertexLabel.name()).getIdFieldType();
            if (type.isText()) {
                idStrategy = IdStrategy.CUSTOMIZE_STRING;
            } else if (type.isUUID()) {
                idStrategy = IdStrategy.CUSTOMIZE_UUID;
            } else if (type.isNumber()) {
                idStrategy = IdStrategy.CUSTOMIZE_NUMBER;
            }
        }

        if (idStrategy.isCustomizeString()) {
            String id = (String) idValue.toString();
            this.checkVertexIdLength(id);
            vertex.id(id);
        } else if (idStrategy.isCustomizeNumber()) {
            Long id = DataTypeUtil.parseNumber(idField, idValue);
            vertex.id(id);
        } else {
            assert idStrategy.isCustomizeUuid();
            UUID id = DataTypeUtil.parseUUID(idField, idValue);
            vertex.id(id);
        }
    }

    private Object convertPropertyValue(String key, Object rawValue) {
        PropertyKey propertyKey = this.getPropertyKey(key);
        InputSource inputSource = this.struct.input();
        return DataTypeUtil.convert(rawValue, propertyKey, inputSource);
    }

    private void checkFieldValue(String fieldName, Object fieldValue) {
        if (this.mapping().mappingValues().isEmpty() ||
            !this.mapping().mappingValues().containsKey(fieldName)) {
            return;
        }
        // NOTE: The nullable values has been filtered before this
        E.checkArgument(fieldValue != null, "The field(%s) value can't be " +
                                            "null", fieldName);
        E.checkArgument(DataTypeUtil.isSimpleValue(fieldValue),
                        "The field(%s) value must be simple type, actual is " +
                        "'%s'", fieldName, fieldValue.getClass());
    }

    private boolean vertexIdEmpty(VertexLabel vertexLabel, Vertex vertex) {
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomizeString()) {
            Object vertexId = vertex.id();
            return vertexId == null || StringUtils.isEmpty((String) vertexId);
        }
        return false;
    }

    private void checkPrimaryValuesValid(VertexLabel vertexLabel,
                                         Object[] primaryValues) {
        List<String> primaryKeys = vertexLabel.primaryKeys();
        E.checkArgument(primaryKeys.size() == primaryValues.length,
                        "Missing some primary key values, expect %s, " +
                        "but only got %s for vertex label '%s'",
                        primaryKeys, Arrays.toString(primaryValues),
                        vertexLabel);
        for (int i = 0; i < primaryKeys.size(); i++) {
            E.checkArgument(primaryValues[i] != null,
                            "Make sure the value of the primary key '%s' is " +
                            "not empty, or check whether the headers or " +
                            "field_mapping are configured correctly",
                            primaryKeys.get(i));
        }
    }

    private String spliceVertexId(VertexLabel vertexLabel,
                                  Object... primaryValues) {
        StringBuilder vertexId = new StringBuilder();
        StringBuilder vertexKeysId = new StringBuilder();
        for (int i = 0; i < primaryValues.length; i++) {
            Object value = primaryValues[i];
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

    public abstract class VertexKVPairs {

        public final VertexLabel vertexLabel;
        // General properties
        public Map<String, Object> properties;

        public boolean headerCaseSensitive;

        public void headerCaseSensitive(boolean f) {
            this.headerCaseSensitive = f;
        }

        public VertexKVPairs(VertexLabel vertexLabel) {
            this.vertexLabel = vertexLabel;
            this.properties = null;

            this.headerCaseSensitive = true;
        }

        public abstract void extractFromVertex(String[] names,
                                               Object[] values);

        public abstract void extractFromEdge(String[] names, Object[] values,
                                             int[] fieldIndexes);

        public abstract List<Vertex> buildVertices(boolean withProperty);

        public List<Object> splitField(String key, Object value) {
            return DataTypeUtil.splitField(key, value, struct.input());
        }

        public boolean verifyVertex(VertexLabel vertexLabel, Object id) {
            if (usePrefilter) {
                if (vertexLabel.idStrategy().isCustomizeNumber()) {
                    Long longId = (Long) id;
                    boolean contains = longSet.contains(longId);
                    if (!contains) {
                        longSet.add(longId);
                    }
                    return contains;
                } else {
                    byte[] bytes =
                            id.toString().getBytes(StandardCharsets.UTF_8);
                    boolean contains = bytesSet.contains(
                            bytes);
                    if (!contains) {
                        bytesSet.add(bytes);
                    }
                    return contains;
                }
            }
            return false;
        }
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
                    String key = mappingField(fieldName);
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values,
                                    int[] fieldIndexes) {
            assert fieldIndexes.length == 1;
            String fieldName = names[fieldIndexes[0]];
            Object fieldValue = values[fieldIndexes[0]];
            this.idField = fieldName;
            this.idValue = mappingValue(fieldName, fieldValue);
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty) {
            Vertex vertex = new Vertex(vertexLabel.name());
            customizeId(vertexLabel, vertex, this.idField, this.idValue);
            if (vertexIdEmpty(vertexLabel, vertex)) {
                return ImmutableList.of();
            }
            if (withProperty && verifyVertex(vertexLabel, vertex.id())) {
                return ImmutableList.of();
            }
            if (withProperty) {
                String key = mappingField(this.idField);
                // The id field is also used as a general property
                if (vertexLabel.properties().contains(key)) {
                    addProperty(vertex, key, this.idValue);
                }
                addProperties(vertex, this.properties);
                checkNonNullableKeys(vertex);
            }
            return ImmutableList.of(vertex);
        }
    }

    public class VertexFlatIdKVPairs extends VertexKVPairs {

        // The idField(raw field), like: id
        private String idField;
        /*
         * The multiple idValues(spilted and mapped)
         * like: A|B|C -> [1,2,3]
         */
        private List<Object> idValues;

        public VertexFlatIdKVPairs(VertexLabel vertexLabel) {
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
                    List<Object> rawIdValues = splitField(fieldName,
                                                          fieldValue);
                    this.idValues = rawIdValues.stream().map(rawIdValue -> {
                        return mappingValue(fieldName, rawIdValue);
                    }).collect(Collectors.toList());
                } else {
                    String key = mappingField(fieldName);
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values,
                                    int[] fieldIndexes) {
            assert fieldIndexes.length == 1;
            String fieldName = names[fieldIndexes[0]];
            Object fieldValue = values[fieldIndexes[0]];
            this.idField = fieldName;
            List<Object> rawIdValues = splitField(fieldName, fieldValue);
            this.idValues = rawIdValues.stream().map(rawIdValue -> {
                return mappingValue(fieldName, rawIdValue);
            }).collect(Collectors.toList());
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty) {
            E.checkArgument(this.idValues != null,
                            "The flat id values shouldn't be null");
            List<Vertex> vertices = new ArrayList<>(this.idValues.size());
            for (Object idValue : this.idValues) {
                Vertex vertex = new Vertex(vertexLabel.name());
                customizeId(vertexLabel, vertex, this.idField, idValue);
                if (vertexIdEmpty(vertexLabel, vertex)) {
                    continue;
                }
                if (withProperty && verifyVertex(vertexLabel, vertex.id())) {
                    continue;
                }
                if (withProperty) {
                    String key = mappingField(this.idField);
                    // The id field is also used as a general property
                    if (vertexLabel.properties().contains(key)) {
                        addProperty(vertex, key, idValue);
                    }
                    addProperties(vertex, this.properties);
                    checkNonNullableKeys(vertex);
                }
                vertices.add(vertex);
            }
            return vertices;
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
            List<String> lowerCasePrimaryKeys
                    = primaryKeys.stream().map(k -> k.toLowerCase())
                                 .collect(Collectors.toList());

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
                String key = mappingField(fieldName);

                if (this.headerCaseSensitive) {
                    if (primaryKeys.contains(key)) {
                        // Don't put primary key/values into general properties
                        int index = primaryKeys.indexOf(key);
                        Object pkValue = mappingValue(fieldName, fieldValue);
                        this.pkValues[index] = pkValue;
                    } else {
                        Object value = mappingValue(fieldName, fieldValue);
                        this.properties.put(key, value);
                    }
                } else {
                    String lowerCaseKey = key.toLowerCase();
                    if (lowerCasePrimaryKeys.contains(lowerCaseKey)) {
                        // Don't put primary key/values into general properties
                        int index = lowerCasePrimaryKeys.indexOf(lowerCaseKey);
                        Object pkValue = mappingValue(fieldName, fieldValue);
                        this.pkValues[index] = pkValue;
                    } else {
                        Object value = mappingValue(fieldName, fieldValue);
                        this.properties.put(key, value);
                    }
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values,
                                    int[] fieldIndexes) {
            this.pkNames = new ArrayList<>(fieldIndexes.length);
            for (int fieldIndex : fieldIndexes) {
                String fieldName = names[fieldIndex];
                String mappingField = mappingField(fieldName);
                this.pkNames.add(mappingField);
            }
            List<String> primaryKeys = this.vertexLabel.primaryKeys();
            E.checkArgument(ListUtils.isEqualList(this.pkNames, primaryKeys),
                            "Make sure the primary key fields %s are " +
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
        public List<Vertex> buildVertices(boolean withProperty) {
            checkPrimaryValuesValid(vertexLabel, this.pkValues);
            for (int i = 0; i < this.pkNames.size(); i++) {
                if (isEmptyPkValue(this.pkValues[i])) {
                    return ImmutableList.of();
                }
                Object pkValue = convertPropertyValue(this.pkNames.get(i),
                                                      this.pkValues[i]);
                this.pkValues[i] = pkValue;
            }
            String id = spliceVertexId(vertexLabel, this.pkValues);
            checkVertexIdLength(id);

            Vertex vertex = new Vertex(vertexLabel.name());
            // NOTE: withProperty is true means that parsing vertex
            if (withProperty) {
                for (int i = 0; i < this.pkNames.size(); i++) {
                    addProperty(vertex, this.pkNames.get(i),
                                this.pkValues[i], false);
                }
                addProperties(vertex, this.properties);
                checkNonNullableKeys(vertex);
            } else {
                vertex.id(id);
            }
            if (withProperty && verifyVertex(vertexLabel, vertex.id())) {
                return ImmutableList.of();
            }
            return ImmutableList.of(vertex);
        }
    }

    /**
     * Vertex OLAP Property Parse
     */
    public class VertexOlapKVPairs extends VertexKVPairs {

        // The idField(raw field), like: id
        private String idField;
        /*
         * The field value
         */
        private Object fieldValue;

        public VertexOlapKVPairs(VertexLabel vertexLabel) {
            super(vertexLabel);
        }

        @Override
        public void extractFromVertex(String[] names, Object[] values) {
            // General OLAP properties
            this.properties = new HashMap<>();
            for (int i = 0; i < names.length; i++) {
                String fieldName = names[i];
                Object fieldValue = values[i];
                if (!retainField(fieldName, fieldValue)) {
                    continue;
                }
                if (isIdField(fieldName)) {
                    this.idField = fieldName;
                    this.fieldValue = fieldValue;
                } else {
                    String key = mappingField(fieldName);
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values,
                                    int[] fieldIndexes) {
            // pass OLAP properties for vertices
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty) {
            Vertex vertex = new Vertex(null);
            olapVertexId(vertexLabel, vertex, this.idField, fieldValue);
            if (withProperty) {
                String key = mappingField(this.idField);
                // The id field is also used as a general property
                if (vertexLabel.properties().contains(key)) {
                    addProperty(vertex, key, fieldValue);
                }
                addProperties(vertex, this.properties);
            }
            return ImmutableList.of(vertex);
        }
    }

    public void olapVertexId(VertexLabel vertexLabel, Vertex vertex,
                             String idField, Object idValue) {
        IdStrategy idStrategy = vertexLabel.idStrategy();
        if (idStrategy.isCustomizeString() || idStrategy.isPrimaryKey()) {
            String id = (String) idValue.toString();
            this.checkVertexIdLength(id);
            vertex.id(id);
        } else if (idStrategy.isCustomizeNumber() || idStrategy.isAutomatic()) {
            Long id = DataTypeUtil.parseNumber(idField, idValue);
            vertex.id(id);
        } else {
            assert idStrategy.isCustomizeUuid();
            UUID id = DataTypeUtil.parseUUID(idField, idValue);
            vertex.id(id);
        }
    }

    public class VertexFlatPkKVPairs extends VertexKVPairs {

        /*
         * The primary key name(mapped), must be single
         * like: p_name -> name
         */
        private String pkName;
        /*
         * The primary values(split and mapped)
         * like: m|v -> [marko,vadas]
         */
        private List<Object> pkValues;

        public VertexFlatPkKVPairs(VertexLabel vertexLabel) {
            super(vertexLabel);
        }

        @Override
        public void extractFromVertex(String[] names, Object[] values) {
            List<String> primaryKeys = vertexLabel.primaryKeys();
            E.checkArgument(primaryKeys.size() == 1,
                            "In case unfold is true, just supported " +
                            "a single primary key");
            this.pkName = primaryKeys.get(0);
            // General properties
            this.properties = new HashMap<>();
            boolean handledPk = false;
            for (int i = 0; i < names.length; i++) {
                String fieldName = names[i];
                Object fieldValue = values[i];
                if (!retainField(fieldName, fieldValue)) {
                    continue;
                }
                String key = mappingField(fieldName);
                if (!handledPk && primaryKeys.contains(key)) {
                    // Don't put primary key/values into general properties
                    List<Object> rawPkValues = splitField(fieldName,
                                                          fieldValue);
                    this.pkValues = rawPkValues.stream().map(rawPkValue -> {
                        return mappingValue(fieldName, rawPkValue);
                    }).collect(Collectors.toList());
                    handledPk = true;
                } else {
                    Object value = mappingValue(fieldName, fieldValue);
                    this.properties.put(key, value);
                }
            }
        }

        @Override
        public void extractFromEdge(String[] names, Object[] values,
                                    int[] fieldIndexes) {
            List<String> primaryKeys = vertexLabel.primaryKeys();
            E.checkArgument(fieldIndexes.length == 1 && primaryKeys.size() == 1,
                            "In case unfold is true, just supported " +
                            "a single primary key");
            String fieldName = names[fieldIndexes[0]];
            this.pkName = mappingField(fieldName);
            String primaryKey = primaryKeys.get(0);
            E.checkArgument(this.pkName.equals(primaryKey),
                            "Make sure the the primary key field '%s' is " +
                            "not empty, or check whether the headers or " +
                            "field_mapping are configured correctly",
                            primaryKey);
            Object fieldValue = values[fieldIndexes[0]];
            List<Object> rawPkValues = splitField(fieldName, fieldValue);
            this.pkValues = rawPkValues.stream().map(rawPkValue -> {
                return mappingValue(fieldName, rawPkValue);
            }).collect(Collectors.toList());
        }

        @Override
        public List<Vertex> buildVertices(boolean withProperty) {
            E.checkArgument(this.pkValues != null,
                            "The primary values shouldn't be null");
            List<Vertex> vertices = new ArrayList<>(this.pkValues.size());
            for (Object pkValue : this.pkValues) {
                if (isEmptyPkValue(pkValue)) {
                    continue;
                }
                pkValue = convertPropertyValue(this.pkName, pkValue);
                String id = spliceVertexId(vertexLabel, pkValue);
                checkVertexIdLength(id);

                Vertex vertex = new Vertex(vertexLabel.name());
                // NOTE: withProperty is true means that parsing vertex
                if (withProperty) {
                    addProperty(vertex, this.pkName, pkValue, false);
                    addProperties(vertex, this.properties);
                    checkNonNullableKeys(vertex);
                } else {
                    vertex.id(id);
                }
                if (withProperty && verifyVertex(vertexLabel, vertex.id())) {
                    continue;
                }
                vertices.add(vertex);
            }
            return vertices;
        }
    }
}
