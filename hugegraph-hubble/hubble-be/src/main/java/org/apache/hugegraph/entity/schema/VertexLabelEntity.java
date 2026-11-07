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

package org.apache.hugegraph.entity.schema;

import java.util.Date;
import java.util.List;
import java.util.Set;

import org.apache.hugegraph.structure.constant.IdStrategy;
import org.apache.hugegraph.util.HubbleUtil;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VertexLabelEntity implements SchemaLabelEntity, Timefiable {

    @JsonProperty("name")
    private String name;

    @JsonProperty("id_strategy")
    private IdStrategy idStrategy;

    @JsonProperty("properties")
    private Set<Property> properties;

    @JsonProperty("primary_keys")
    private List<String> primaryKeys;

    @JsonProperty("property_indexes")
    private List<PropertyIndex> propertyIndexes;

    @JsonProperty("open_label_index")
    private Boolean openLabelIndex;

    @JsonProperty("style")
    private VertexLabelStyle style;

    @JsonProperty("create_time")
    private Date createTime;

    @Override
    public Boolean getOpenLabelIndex() {
        return this.openLabelIndex != null ? this.openLabelIndex : Boolean.TRUE;
    }

    @Override
    public VertexLabelStyle getStyle() {
        return this.style != null ? this.style : new VertexLabelStyle();
    }

    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean hasStyle() {
        return this.style != null;
    }

    @Override
    public SchemaType getSchemaType() {
        return SchemaType.VERTEX_LABEL;
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof VertexLabelEntity other)) {
            return false;
        }
        return this.name.equals(other.name) &&
               this.idStrategy == other.idStrategy &&
               HubbleUtil.equalCollection(this.properties, other.properties) &&
               HubbleUtil.equalCollection(this.primaryKeys, other.primaryKeys) &&
               HubbleUtil.equalCollection(this.propertyIndexes,
                                          other.propertyIndexes) &&
               this.openLabelIndex == other.openLabelIndex;
    }

    @Override
    public int hashCode() {
        return this.name.hashCode();
    }
}
