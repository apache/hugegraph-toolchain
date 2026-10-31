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

package org.apache.hugegraph.service.graph;

import com.google.common.collect.ImmutableSet;
import lombok.extern.log4j.Log4j2;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.hugegraph.config.HugeConfig;
import org.apache.hugegraph.driver.GraphManager;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.graph.EdgeEntity;
import org.apache.hugegraph.entity.graph.VertexEntity;
import org.apache.hugegraph.entity.graph.VertexQueryEntity;
import org.apache.hugegraph.entity.query.GraphView;
import org.apache.hugegraph.entity.schema.EdgeLabelEntity;
import org.apache.hugegraph.entity.schema.PropertyKeyEntity;
import org.apache.hugegraph.entity.schema.SchemaLabelEntity;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.source.file.ListFormat;
import org.apache.hugegraph.loader.util.DataTypeUtil;
import org.apache.hugegraph.loader.util.JsonUtil;
import org.apache.hugegraph.options.HubbleOptions;
import org.apache.hugegraph.service.auth.UserService;
import org.apache.hugegraph.service.schema.EdgeLabelService;
import org.apache.hugegraph.service.schema.PropertyKeyService;
import org.apache.hugegraph.service.schema.VertexLabelService;
import org.apache.hugegraph.structure.GraphElement;
import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.structure.graph.Vertex;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.util.Ex;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Log4j2
@Service
public class GraphService {

    @Autowired
    private PropertyKeyService pkService;
    @Autowired
    private VertexLabelService vlService;
    @Autowired
    private EdgeLabelService elService;

    @Autowired
    private UserService userService;
    @Autowired
    private HugeConfig config;

    public GraphView addVertex(HugeClient client, VertexEntity entity) {
        this.checkParamsValid(client, entity, true);
        Vertex vertex = this.buildVertex(client, entity);
        vertex = client.graph().addVertex(vertex);
        return GraphView.builder()
                        .vertices(ImmutableSet.of(
                                VertexQueryEntity.fromVertex(vertex)))
                        .edges(ImmutableSet.of())
                        .build();
    }

    public Vertex updateVertex(HugeClient client, String vertexId, VertexEntity entity) {
        this.checkParamsValid(client, entity, false);
        GraphManager graph = client.graph();
        Vertex vertex = this.buildVertex(client, entity, true);
        if (vertex.id() != null) {
            // The schema-resolved ID must retain its number/string type in the SDK path.
            return graph.appendVertexProperty(vertex);
        }
        return graph.updateVertexProperty(vertexId, vertex);
    }

    public void deleteVertex(HugeClient client, Object vertexId) {
        client.graph().deleteVertex(vertexId);
    }

    private Vertex buildVertex(HugeClient client, VertexEntity entity) {
        return this.buildVertex(client, entity, false);
    }

    private Vertex buildVertex(HugeClient client, VertexEntity entity, boolean updating) {
        Vertex vertex = new Vertex(entity.getLabel());
        VertexLabelEntity vl = this.vlService.get(entity.getLabel(), client);
        // Allowed front-end always pass id
        if (vl.getIdStrategy().isCustomize()) {
            Object vid = this.convertVertexId(vl.getIdStrategy(), entity.getId());
            vertex.id(vid);
        } else if (updating && vl.getIdStrategy() == IdStrategy.AUTOMATIC) {
            // The query response records the actual ID type, including snowflake.force_string.
            String idType = entity.getIdType();
            Ex.check(idType == null || "NUMBER".equals(idType),
                     "common.param.should-belong-to", "id_type", "NUMBER");
            if ("NUMBER".equals(idType)) {
                vertex.id(Long.parseLong(entity.getId()));
            }
        }
        this.fillProperties(client, vl, vertex, entity.getProperties());
        return vertex;
    }

    public GraphView addEdge(HugeClient client, EdgeEntity entity) {
        this.checkParamsValid(client, entity, true);
        GraphManager graph = client.graph();

        EdgeHolder edgeHolder = this.buildEdge(client, entity);
        Edge edge = graph.addEdge(edgeHolder.edge);
        Vertex source = edgeHolder.source;
        Vertex target = edgeHolder.target;
        return GraphView.builder()
                        .vertices(ImmutableSet.of(
                                VertexQueryEntity.fromVertex(source),
                                VertexQueryEntity.fromVertex(target)))
                        .edges(ImmutableSet.of(edge))
                        .build();
    }

    public void deleteEdge(HugeClient client, String edgeId) {
        client.graph().deleteEdge(edgeId);
    }

    public Edge updateEdge(HugeClient client, String edgeId, EdgeEntity entity) {
        this.checkParamsValid(client, entity, false);
        GraphManager graph = client.graph();
        EdgeHolder edgeHolder = this.buildEdge(client, entity);
        return graph.updateEdgeProperty(edgeId, edgeHolder.edge);
    }

    public HashMap<String, Object> getVertexProperties(HugeClient client, String label) {
        VertexLabelEntity vlEntity = this.vlService.get(label,
                client);
        HashMap<String, Object> vertexPropertiesMap = new HashMap<>();
        vertexPropertiesMap.put("nonNullableProps", vlEntity.getNonNullableProps());
        vertexPropertiesMap.put("nullableProps", vlEntity.getNullableProps());
        vertexPropertiesMap.put("primaryKeys", vlEntity.getPrimaryKeys());
        return vertexPropertiesMap;
    }

    public HashMap<String, Object> getEdgeProperties(HugeClient client, String label) {
        EdgeLabelEntity elEntity = this.elService.get(label,
                client);
        HashMap<String, Object> edgePropertiesMap = new HashMap<>();
        edgePropertiesMap.put("nonNullableProps", elEntity.getNonNullableProps());
        edgePropertiesMap.put("nullableProps", elEntity.getNullableProps());
        edgePropertiesMap.put("sortKeys", elEntity.getSortKeys());
        return edgePropertiesMap;
    }

    public HashMap<String, Object> getVertexStyle(HugeClient client, List<String> labels) {
        HashMap<String, Object> vertexStyles = new HashMap<>();
        for (String label : labels) {
            VertexLabelEntity vlEntity = this.vlService.get(label,
                    client);
            vertexStyles.put(label, vlEntity.getStyle());
        }
        return vertexStyles;
    }

    public HashMap<String, Object> getEdgeStyle(HugeClient client, List<String> labels) {
        HashMap<String, Object> edgeStyles = new HashMap<>();
        for (String label : labels) {
            EdgeLabelEntity elEntity = this.elService.get(label,
                    client);
            edgeStyles.put(label, elEntity.getStyle());
        }
        return edgeStyles;
    }

    public GraphView importJson(HugeClient client, MultipartFile jsonFile) throws IOException {
        this.checkImportFile(jsonFile);
        File file = userService.multipartFileToFile(jsonFile);
        String content = FileUtils.readFileToString(file,
                                                    StandardCharsets.UTF_8);
        JSONObject jsonObject;
        try {
            jsonObject = new JSONObject(content);
        } catch (JSONException e) {
            throw new ExternalException("graph.import.invalid-json", e);
        }
        JSONArray verticesArray = this.getImportArray(jsonObject, "vertices");
        JSONArray edgesArray = this.getImportArray(jsonObject, "edges");
        this.checkImportPreview(jsonObject, verticesArray, edgesArray);
        List<VertexEntity> vertexEntities =
                JsonUtil.convertList(verticesArray.toString(),
                                     VertexEntity.class);
        List<EdgeEntity> edgeEntities =
                JsonUtil.convertList(edgesArray.toString(), EdgeEntity.class);

        List<Vertex> vertices = new ArrayList<>(vertexEntities.size());
        List<Object> vertexImportIds = new ArrayList<>(vertexEntities.size());
        Map<Object, Vertex> pendingVertices = new HashMap<>();
        for (VertexEntity entity : vertexEntities) {
            this.checkParamsValid(client, entity, true);
            Vertex vertex = this.buildVertex(client, entity);
            Object importId = this.importVertexId(client, entity, vertex);
            if (importId != null) {
                Ex.check(!pendingVertices.containsKey(importId),
                         "graph.import.vertex.duplicate-id", importId);
                pendingVertices.put(importId, vertex);
            }
            vertices.add(vertex);
            vertexImportIds.add(importId);
        }

        Map<String, Edge> edges = new HashMap<>();
        for (EdgeEntity entity : edgeEntities) {
            entity.setId(null);
            this.checkParamsValid(client, entity, true);
            this.buildEdge(client, entity, pendingVertices);
        }

        GraphManager graph = client.graph();
        Map<Object, Vertex> createdVertices = new HashMap<>(pendingVertices);
        List<Vertex> createdVertexList = new ArrayList<>(vertices.size());
        int acknowledgedVertices = 0;
        int acknowledgedEdges = 0;
        try {
            for (int i = 0; i < vertices.size(); i++) {
                Vertex vertex = vertices.get(i);
                Vertex created = graph.addVertex(vertex);
                // Count only calls which returned successfully. A failed call
                // may also have committed before its response was lost.
                acknowledgedVertices++;
                createdVertices.put(created.id(), created);
                Object importId = vertexImportIds.get(i);
                if (importId != null) {
                    createdVertices.put(importId, created);
                }
                createdVertexList.add(created);
            }
            for (EdgeEntity entity : edgeEntities) {
                EdgeHolder edgeHolder = this.buildEdge(client, entity,
                                                       createdVertices);
                Edge edge = graph.addEdge(edgeHolder.edge);
                acknowledgedEdges++;
                edges.put(edge.id(), edge);
            }
        } catch (RuntimeException e) {
            // Server writes can replace existing elements, and a failed request
            // can have committed before its response was lost. Deleting IDs
            // returned by earlier writes is therefore not a safe rollback.
            log.warn("Graph JSON import failed; changes may remain (failure type: {})",
                     e.getClass().getName());
            int status = 400;
            if (e instanceof ExternalException) {
                status = ((ExternalException) e).status();
            } else if (e instanceof ServerException) {
                int upstream = ((ServerException) e).status();
                if (upstream == 401 || upstream == 403) {
                    status = upstream;
                }
            }
            throw new ExternalException(status, "graph.import.partial-failure", e,
                                        acknowledgedVertices, acknowledgedEdges);
        }
        return GraphView.builder()
                .vertices(VertexQueryEntity.fromVertices(createdVertexList))
                .edges(edges.values())
                .build();
    }

    private Object importVertexId(HugeClient client, VertexEntity entity,
                                  Vertex vertex) {
        if (vertex.id() != null) {
            return vertex.id();
        }
        VertexLabelEntity vl = this.vlService.get(entity.getLabel(), client);
        if (vl.getIdStrategy().isPrimaryKey() && entity.getId() != null) {
            return this.convertVertexId(vl.getIdStrategy(), entity.getId());
        }
        return null;
    }

    private void checkImportFile(MultipartFile jsonFile) {
        Ex.check(jsonFile != null && !jsonFile.isEmpty(),
                 "common.param.cannot-be-null-or-empty", "file");
        long limit = this.importFileSizeLimit();
        Ex.check(jsonFile.getSize() <= limit,
                 "graph.import.file.exceed-limit", jsonFile.getSize(), limit);
    }

    private long importFileSizeLimit() {
        if (this.config == null) {
            return HubbleOptions.UPLOAD_SINGLE_FILE_SIZE_LIMIT.defaultValue();
        }
        return this.config.get(HubbleOptions.UPLOAD_SINGLE_FILE_SIZE_LIMIT);
    }

    private void checkImportPreview(JSONObject root, JSONArray... arrays) {
        Ex.check(!root.optBoolean("properties_truncated", false),
                 "graph.import.truncated-preview");
        // Validate both raw arrays before conversion or any graph writes, so
        // preview metadata cannot be lost by a future DTO/mapper change.
        for (JSONArray array : arrays) {
            for (int i = 0; i < array.length(); i++) {
                Object value = array.opt(i);
                if (value instanceof JSONObject) {
                    JSONObject element = (JSONObject) value;
                    Ex.check(!element.optBoolean("~hubble_properties_preview", false),
                             "graph.import.truncated-preview");
                }
            }
        }
    }

    private JSONArray getImportArray(JSONObject jsonObject, String name) {
        Ex.check(jsonObject.has(name), "graph.import.missing-field", name);
        Object value = jsonObject.get(name);
        Ex.check(value instanceof JSONArray, "graph.import.field-should-array",
                 name);
        return (JSONArray) value;
    }

    private void checkParamsValid(HugeClient client, VertexEntity entity,
                                  boolean create) {
        Ex.check(!StringUtils.isEmpty(entity.getLabel()),
                "common.param.cannot-be-null-or-empty", "label");
        // If schema doesn't exist, it will throw exception
        VertexLabelEntity vlEntity = this.vlService.get(entity.getLabel(),
                client);
        IdStrategy idStrategy = vlEntity.getIdStrategy();
        if (create) {
            Ex.check(idStrategy.isCustomize(), () -> entity.getId() != null,
                    "common.param.cannot-be-null", "id");
        } else {
            Ex.check(entity.getId() != null,
                    "common.param.cannot-be-null", "id");
        }

        Set<String> nonNullableProps = vlEntity.getNonNullableProps();
        Map<String, Object> properties = entity.getProperties();
        if (properties == null) {
            properties = Collections.emptyMap();
            entity.setProperties(properties);
        }
        if (create) {
            Ex.check(properties.keySet().containsAll(nonNullableProps),
                    "graph.vertex.all-nonnullable-prop.should-be-setted");
        }
    }

    private void checkParamsValid(HugeClient client, EdgeEntity entity,
                                  boolean create) {
        Ex.check(!StringUtils.isEmpty(entity.getLabel()),
                "common.param.cannot-be-null-or-empty", "label");
        // If schema doesn't exist, it will throw exception
        EdgeLabelEntity elEntity = this.elService.get(entity.getLabel(), client);
        if (create) {
            Ex.check(entity.getId() == null,
                    "common.param.must-be-null", "id");
        } else {
            Ex.check(entity.getId() != null,
                    "common.param.cannot-be-null", "id");
        }
        Ex.check(entity.getSourceId() != null,
                "common.param.cannot-be-null", "source_id");
        Ex.check(entity.getTargetId() != null,
                "common.param.cannot-be-null", "target_id");

        Set<String> nonNullableProps = elEntity.getNonNullableProps();
        Map<String, Object> properties = entity.getProperties();
        if (properties == null) {
            properties = Collections.emptyMap();
            entity.setProperties(properties);
        }
        if (create) {
            Ex.check(properties.keySet().containsAll(nonNullableProps),
                    "graph.edge.all-nonnullable-prop.should-be-setted");
        }
    }

    private EdgeHolder buildEdge(HugeClient client, EdgeEntity entity) {
        return this.buildEdge(client, entity, Collections.emptyMap());
    }

    private EdgeHolder buildEdge(HugeClient client, EdgeEntity entity,
                                 Map<Object, Vertex> pendingVertices) {
        GraphManager graph = client.graph();
        EdgeLabelEntity el = this.elService.get(entity.getLabel(), client);
        VertexLabelEntity sourceVl = this.vlService.get(el.getSourceLabel(),
                                                        client);
        VertexLabelEntity targetVl = this.vlService.get(el.getTargetLabel(),
                                                        client);
        Object realSourceId = this.convertVertexId(sourceVl.getIdStrategy(),
                                                   entity.getSourceId());
        Object realTargetId = this.convertVertexId(targetVl.getIdStrategy(),
                                                   entity.getTargetId());
        Vertex sourceVertex = pendingVertices.get(realSourceId);
        if (sourceVertex == null) {
            sourceVertex = graph.getVertex(realSourceId);
        }
        Vertex targetVertex = pendingVertices.get(realTargetId);
        if (targetVertex == null) {
            targetVertex = graph.getVertex(realTargetId);
        }

        Ex.check(sourceVertex != null && targetVertex != null,
                 "gremlin.edges.linked-vertex.not-exist");

        Ex.check(el.getSourceLabel().equals(sourceVertex.label()) &&
                 el.getTargetLabel().equals(targetVertex.label()),
                 "graph.edge.link-unmatched-vertex", entity.getLabel(),
                 el.getSourceLabel(), el.getTargetLabel(),
                 sourceVertex.label(), targetVertex.label());

        Edge edge = new Edge(entity.getLabel());
        edge.source(sourceVertex);
        edge.target(targetVertex);
        this.fillProperties(client, el, edge, entity.getProperties());
        return new EdgeHolder(edge, sourceVertex, targetVertex);
    }

    private Object convertVertexId(IdStrategy idStrategy, String rawId) {
        if (idStrategy.isCustomizeString() || idStrategy.isPrimaryKey()) {
            return rawId;
        } else if (idStrategy.isCustomizeNumber()) {
            return DataTypeUtil.parseNumber("id", rawId);
        } else if (idStrategy.isCustomizeUuid()) {
            return DataTypeUtil.parseUUID("id", rawId);
        }
        Ex.check(false, "Unsupported vertex id strategy: %s", idStrategy);
        return rawId;
    }

    private void fillProperties(HugeClient client, SchemaLabelEntity schema,
                                GraphElement element,
                                Map<String, Object> properties) {
        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            String key = entry.getKey();
            Object rawValue = entry.getValue();
            // Skip nullable property
            if (schema.getNullableProps().contains(key)) {
                if (rawValue instanceof String &&
                    StringUtils.isEmpty((String) rawValue)) {
                    continue;
                }
            }
            PropertyKeyEntity pkEntity = this.pkService.get(key, client);
            PropertyKey propertyKey = PropertyKeyService.convert(pkEntity,
                                                                 client);
            Ex.check(propertyKey != null, "The property key '%s' is not found",
                     key);
            Object value;
            try {
                // DataTypeUtil.convert in loader need param InputSource
                FileSource source = new FileSource();
                ListFormat listFormat = new ListFormat("", "", ",");
                source.listFormat(listFormat);
                value = DataTypeUtil.convert(rawValue, propertyKey, source);
            } catch (IllegalArgumentException e) {
                throw new ExternalException("graph.property.convert.failed",
                                            e, key, rawValue);
            }
            element.property(key, value);
        }
    }

    private static class EdgeHolder {

        private Edge edge;
        private Vertex source;
        private Vertex target;

        public EdgeHolder(Edge edge, Vertex source, Vertex target) {
            this.edge = edge;
            this.source = source;
            this.target = target;
        }
    }
}
