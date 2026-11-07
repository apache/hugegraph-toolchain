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

package org.apache.hugegraph.structure.auth;

import java.util.Map;
import java.util.Objects;

import org.apache.hugegraph.util.JsonUtil;

import com.fasterxml.jackson.annotation.JsonProperty;

public class HugeResource {

    public static final String ANY = "*";

    @JsonProperty("type")
    private HugeResourceType type = HugeResourceType.NONE;

    @JsonProperty("label")
    private String label = ANY;

    @JsonProperty("properties")
    private Map<String, Object> properties; // value can be predicated

    public HugeResource() {
        // pass
    }

    public HugeResource(HugeResourceType type) {
        this(type, ANY);
    }

    public HugeResource(HugeResourceType type, String label) {
        this(type, label, null);
    }

    public HugeResource(HugeResourceType type, String label,
                        Map<String, Object> properties) {
        this.type = type;
        this.label = label;
        this.properties = properties;
    }

    public HugeResourceType resourceType() {
        return this.type;
    }

    public String label() {
        return this.label;
    }

    public Map<String, Object> properties() {
        return this.properties;
    }

    @Override
    public boolean equals(Object object) {
        if (!(object instanceof HugeResource other)) {
            return false;
        }
        return this.type == other.type &&
               Objects.equals(this.label, other.label) &&
               Objects.equals(this.properties, other.properties);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.type, this.label, this.properties);
    }

    @Override
    public String toString() {
        return JsonUtil.toJson(this);
    }
}
