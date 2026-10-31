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

package org.apache.hugegraph.service.schema;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiConsumer;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import org.apache.hugegraph.common.Constant;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.entity.schema.ConflictCheckEntity;
import org.apache.hugegraph.entity.schema.ConflictDetail;
import org.apache.hugegraph.entity.schema.ConflictStatus;
import org.apache.hugegraph.entity.schema.Property;
import org.apache.hugegraph.entity.schema.PropertyIndex;
import org.apache.hugegraph.entity.schema.SchemaConflict;
import org.apache.hugegraph.entity.schema.SchemaEntity;
import org.apache.hugegraph.entity.schema.SchemaType;
import org.apache.hugegraph.entity.schema.VertexLabelEntity;
import org.apache.hugegraph.entity.schema.VertexLabelStyle;
import org.apache.hugegraph.entity.schema.VertexLabelUpdateEntity;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.structure.SchemaElement;
import org.apache.hugegraph.structure.schema.EdgeLabel;
import org.apache.hugegraph.structure.schema.IndexLabel;
import org.apache.hugegraph.structure.schema.PropertyKey;
import org.apache.hugegraph.structure.schema.VertexLabel;
import org.apache.hugegraph.util.Ex;
import org.apache.hugegraph.util.JsonUtil;

import lombok.extern.log4j.Log4j2;

@Log4j2
@Service
public class VertexLabelService extends SchemaService {

    private static final List<String> DEFAULT_LABEL_COLORS = List.of(
            "#967572", "#567B75", "#647FA2", "#8A7191",
            "#B57A43", "#B12C86", "#AD6D70", "#718464",
            "#567F8C", "#776E94", "#A36E56", "#837D5E");

    @Autowired
    private PropertyKeyService pkService;
    @Autowired
    private PropertyIndexService piService;

    public List<VertexLabelEntity> list(HugeClient client) {
        return this.list(Collections.emptyList(), client);
    }

    public List<VertexLabelEntity> list(Collection<String> names,
                                        HugeClient client) {
        return this.list(names, client, true);
    }

    public List<VertexLabelEntity> list(Collection<String> names,
                                        HugeClient client,
                                        boolean emptyAsAll) {
        List<VertexLabel> vertexLabels;
        if (CollectionUtils.isEmpty(names)) {
            if (emptyAsAll) {
                vertexLabels = client.schema().getVertexLabels();
            } else {
                vertexLabels = new ArrayList<>();
            }
        } else {
            vertexLabels = client.schema().getVertexLabels(new ArrayList<>(names));
        }
        List<IndexLabel> indexLabels = client.schema().getIndexLabels();

        List<VertexLabelEntity> results = new ArrayList<>(vertexLabels.size());
        vertexLabels.forEach(vertexLabel -> {
            results.add(join(vertexLabel, indexLabels, client));
        });
        return results;
    }

    public VertexLabelEntity get(String name, HugeClient client) {
        try {
            VertexLabel vertexLabel = client.schema().getVertexLabel(name);
            List<IndexLabel> indexLabels = client.schema().getIndexLabels();
            return join(vertexLabel, indexLabels, client);
        } catch (ServerException e) {
            if (e.status() == Constant.STATUS_NOT_FOUND) {
                throw new ExternalException("schema.vertexlabel.not-exist",
                                            e, name);
            }
            throw new ExternalException("schema.vertexlabel.get.failed",
                                        e, name);
        }
    }

    public void checkExist(String name, HugeClient client) {
        // Throw exception if it doesn't exist
        this.get(name, client);
    }

    public void checkNotExist(String name, HugeClient client) {
        try {
            this.get(name, client);
        } catch (ExternalException e) {
            Throwable cause = e.getCause();
            if (cause instanceof ServerException &&
                ((ServerException) cause).status() == Constant.STATUS_NOT_FOUND) {
                return;
            }
            throw e;
        }
        throw new ExternalException("schema.vertexlabel.exist", name);
    }

    public List<String> getLinkEdgeLabels(String name, HugeClient client) {
        List<EdgeLabel> edgeLabels = client.schema().getEdgeLabels();
        List<String> results = new ArrayList<>();
        for (EdgeLabel edgeLabel : edgeLabels) {
            if (edgeLabel.linkedVertexLabel(name)) {
                results.add(edgeLabel.name());
            }
        }
        return results;
    }

    public void add(VertexLabelEntity entity, HugeClient client) {
        VertexLabel vertexLabel = convert(entity, client);
        try {
            client.schema().addVertexLabel(vertexLabel);
        } catch (Exception e) {
            throw new ExternalException("schema.vertexlabel.create.failed",
                                        e, entity.getName());
        }
        try {
            List<IndexLabel> indexLabels = collectIndexLabels(entity, client);
            this.piService.addBatch(indexLabels, client);
        } catch (Exception e) {
            client.schema().removeVertexLabel(vertexLabel.name());
            throw new ExternalException("schema.vertexlabel.create.failed",
                    e, entity.getName());
        }
    }

    public void update(VertexLabelUpdateEntity entity, HugeClient client) {
        VertexLabel vertexLabel = convert(entity, client);
        // All existed indexlabels
        List<IndexLabel> existedIndexLabels = client.schema().getIndexLabels();
        List<String> existedIndexLabelNames = collectNames(existedIndexLabels);

        List<String> addedIndexLabelNames = entity.getAppendPropertyIndexNames();
        List<IndexLabel> addedIndexLabels = convertIndexLabels(
                                            entity.getAppendPropertyIndexes(),
                                            client, true, entity.getName());

        List<String> removedIndexLabelNames = entity.getRemovePropertyIndexes();

        if (addedIndexLabelNames != null) {
            for (String name : addedIndexLabelNames) {
                if (existedIndexLabelNames.contains(name)) {
                    throw new ExternalException(
                              "schema.vertexlabel.update.append-index-existed",
                              entity.getName(), name);
                }
            }
        }
        if (removedIndexLabelNames != null) {
            for (String name : removedIndexLabelNames) {
                if (!existedIndexLabelNames.contains(name)) {
                    throw new ExternalException(
                              "schema.vertexlabel.update.remove-index-unexisted",
                              entity.getName(), name);
                }
            }
        }

        try {
            // NOTE: property can append but doesn't support eliminate now
            client.schema().appendVertexLabel(vertexLabel);
        } catch (Exception e) {
            throw new ExternalException("schema.vertexlabel.update.failed", e,
                                        entity.getName());
        }
        this.piService.addBatch(addedIndexLabels, client);
        this.piService.removeBatch(removedIndexLabelNames, client);
    }

    public void remove(String name, HugeClient client) {
        client.schema().removeVertexLabelAsync(name);
    }

    public boolean checkUsing(String name, HugeClient client) {
        List<EdgeLabel> edgeLabels = client.schema().getEdgeLabels();
        for (EdgeLabel edgeLabel : edgeLabels) {
            if (edgeLabel.linkedVertexLabel(name)) {
                return true;
            }
        }
        return false;
    }

    public ConflictDetail checkConflict(ConflictCheckEntity entity,
                                        HugeClient client,
                                        boolean compareEachOther) {
        ConflictDetail detail = new ConflictDetail(SchemaType.VERTEX_LABEL);
        if (CollectionUtils.isEmpty(entity.getVlEntities())) {
            return detail;
        }

        this.pkService.checkConflict(entity.getPkEntities(), detail,
                                     client, compareEachOther);
        this.piService.checkConflict(entity.getPiEntities(), detail,
                                     client, compareEachOther);
        this.checkConflict(entity.getVlEntities(), detail,
                           client, compareEachOther);
        return detail;
    }

    public void checkConflict(List<VertexLabelEntity> entities,
                              ConflictDetail detail, HugeClient client,
                              boolean compareEachOther) {
        if (CollectionUtils.isEmpty(entities)) {
            return;
        }

        Map<String, VertexLabelEntity> originEntities = new HashMap<>();
        for (VertexLabelEntity entity : this.list(client)) {
            originEntities.put(entity.getName(), entity);
        }
        for (VertexLabelEntity entity : entities) {
            if (detail.anyPropertyKeyConflict(entity.getPropNames())) {
                detail.add(entity, ConflictStatus.DEP_CONFLICT);
                continue;
            }
            if (detail.anyPropertyIndexConflict(entity.getIndexProps())) {
                detail.add(entity, ConflictStatus.DEP_CONFLICT);
                continue;
            }
            VertexLabelEntity originEntity = originEntities.get(entity.getName());
            ConflictStatus status = SchemaEntity.compare(entity, originEntity);
            detail.add(entity, status);
        }
        // Compare resued entities with each other
        if (compareEachOther) {
            compareWithEachOther(detail, SchemaType.VERTEX_LABEL);
        }
    }

    public void reuse(ConflictDetail detail, HugeClient client) {
        // Assume that the conflict detail is valid
        Ex.check(!detail.hasConflict(), "schema.cannot-reuse-conflict");

        List<PropertyKey> propertyKeys = this.pkService.filter(detail, client);
        if (!propertyKeys.isEmpty()) {
            try {
                this.pkService.addBatch(propertyKeys, client);
            } catch (Exception e) {
                throw new ExternalException("schema.propertykey.reuse.failed", e);
            }
        }

        List<VertexLabel> vertexLabels = this.filter(detail, client);
        // Filter propertykeys and propertyindexes
        if (!vertexLabels.isEmpty()) {
            try {
                this.addBatch(vertexLabels, client);
            } catch (Exception e) {
                this.pkService.removeBatch(propertyKeys, client);
                throw new ExternalException("schema.vertexlabel.reuse.failed", e);
            }
        }

        List<IndexLabel> indexLabels = this.piService.filter(detail, client);
        if (!indexLabels.isEmpty()) {
            try {
                this.piService.addBatch(indexLabels, client);
            } catch (Exception e) {
                this.removeBatch(vertexLabels, client);
                this.pkService.removeBatch(propertyKeys, client);
                throw new ExternalException("schema.propertyindex.reuse.failed", e);
            }
        }
    }

    public List<VertexLabel> filter(ConflictDetail detail, HugeClient client) {
        return detail.getVlConflicts().stream()
                     .filter(c -> c.getStatus() == ConflictStatus.PASSED)
                     .map(SchemaConflict::getEntity)
                     .map(e -> convert(e, client))
                     .collect(Collectors.toList());
    }

    public void addBatch(List<VertexLabel> vertexLabels, HugeClient client) {
        BiConsumer<HugeClient, VertexLabel> consumer = (hugeClient, vl) -> {
            hugeClient.schema().addVertexLabel(vl);
        };
        addBatch(vertexLabels, client, consumer, SchemaType.VERTEX_LABEL);
    }

    public void removeBatch(List<VertexLabel> vertexLabels, HugeClient client) {
        List<String> names = collectNames(vertexLabels);
        BiFunction<HugeClient, String, Long> func = (hugeClient, name) -> {
            return hugeClient.schema().removeVertexLabelAsync(name);
        };
        removeBatch(names, client, func, SchemaType.VERTEX_LABEL);
    }

    private VertexLabelEntity join(VertexLabel vertexLabel,
                                   List<IndexLabel> indexLabels,
                                   HugeClient client) {
        if (vertexLabel == null) {
            return null;
        }
        Set<Property> properties = collectProperties(vertexLabel, client);
        List<PropertyIndex> propertyIndexes =
                collectPropertyIndexes(vertexLabel,
                                       indexLabels);
        return VertexLabelEntity.builder()
                                .name(vertexLabel.name())
                                .properties(properties)
                                .idStrategy(vertexLabel.idStrategy())
                                .primaryKeys(vertexLabel.primaryKeys())
                                .propertyIndexes(propertyIndexes)
                                .openLabelIndex(vertexLabel.enableLabelIndex())
                                .style(getStyle(vertexLabel))
                                .createTime(getCreateTime(vertexLabel))
                                .build();
    }

    private static VertexLabelStyle getStyle(SchemaElement element) {
        String styleValue = (String) element.userdata().get(USER_KEY_STYLE);
        if (styleValue != null) {
            return JsonUtil.fromJson(styleValue, VertexLabelStyle.class);
        } else {
            return defaultStyle(element.name());
        }
    }

    private static VertexLabelStyle defaultStyle(String name) {
        VertexLabelStyle style = new VertexLabelStyle();
        int colorIndex = Math.floorMod(name.hashCode(), DEFAULT_LABEL_COLORS.size());
        style.setColor(DEFAULT_LABEL_COLORS.get(colorIndex));
        return style;
    }

    private static VertexLabel convert(VertexLabelEntity entity,
                                       HugeClient client) {
        if (entity == null) {
            return null;
        }

        VertexLabelStyle style = entity.hasStyle() ? entity.getStyle() : defaultStyle(entity.getName());
        return client.schema().vertexLabel(entity.getName())
                     .idStrategy(entity.getIdStrategy())
                     .properties(toStringArray(entity.getPropNames()))
                     .primaryKeys(toStringArray(entity.getPrimaryKeys()))
                     .nullableKeys(toStringArray(entity.getNullableProps()))
                     .enableLabelIndex(entity.getOpenLabelIndex())
                     .userdata(USER_KEY_CREATE_TIME, entity.getCreateTime())
                     .userdata(USER_KEY_STYLE, JsonUtil.toJson(style))
                     .build();
    }

    private static VertexLabel convert(VertexLabelUpdateEntity entity,
                                       HugeClient client) {
        if (entity == null) {
            return null;
        }
        Set<String> properties = new HashSet<>();
        if (entity.getAppendProperties() != null) {
            entity.getAppendProperties().forEach(p -> {
                properties.add(p.getName());
            });
        }

        VertexLabel.Builder builder;
        builder = client.schema().vertexLabel(entity.getName())
                        .properties(toStringArray(properties))
                        .nullableKeys(toStringArray(properties));

        VertexLabel vertexLabel = builder.build();
        Map<String, Object> userdata = vertexLabel.userdata();

        /*
         * The style requires the front end to pass in the full amount
         * TODO: use builder or setter, now use builder throw exception
         * "Can't access builder which is completed"
         */
        VertexLabelStyle style = entity.getStyle();
        if (style != null) {
            userdata.put(USER_KEY_STYLE, JsonUtil.toJson(style));
        }
        return vertexLabel;
    }
}
