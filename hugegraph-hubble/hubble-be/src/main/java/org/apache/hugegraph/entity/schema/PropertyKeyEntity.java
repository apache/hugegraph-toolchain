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

import org.apache.hugegraph.structure.constant.Cardinality;
import org.apache.hugegraph.structure.constant.DataType;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PropertyKeyEntity implements SchemaEntity, Timefiable {

    @JsonProperty("name")
    private String name;

    @JsonProperty("data_type")
    private DataType dataType;

    @JsonProperty("cardinality")
    private Cardinality cardinality;

    @JsonProperty("create_time")
    private Date createTime;

    @Override
    public SchemaType getSchemaType() {
        return SchemaType.PROPERTY_KEY;
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof PropertyKeyEntity other)) {
            return false;
        }
        return this.name.equals(other.name) &&
               this.dataType == other.dataType &&
               this.cardinality == other.cardinality;
    }

    @Override
    public int hashCode() {
        return this.name.hashCode();
    }
}
