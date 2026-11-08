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

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.apache.hugegraph.structure.constant.IndexType;
import org.apache.hugegraph.util.HubbleUtil;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PropertyIndex implements SchemaEntity {

    @JsonProperty("owner")
    private String owner;

    @JsonProperty("owner_type")
    private SchemaType ownerType;

    @JsonProperty("name")
    private String name;

    @JsonProperty("type")
    private IndexType type;

    @JsonProperty("fields")
    private List<String> fields;

    @Override
    public SchemaType getSchemaType() {
        return SchemaType.PROPERTY_INDEX;
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof PropertyIndex other)) {
            return false;
        }
        return this.owner.equals(other.owner) &&
               this.name.equals(other.name) &&
               this.type == other.type &&
               HubbleUtil.equalCollection(this.fields, other.fields);
    }

    @Override
    public int hashCode() {
        return this.name.hashCode();
    }
}
