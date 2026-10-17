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

package org.apache.hugegraph.entity.query;

import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.hugegraph.exception.ExternalException;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Text2GqlSettingsRequest {

    private Boolean enabled;

    @JsonProperty("connection_type")
    private String connectionType;

    @JsonProperty("base_url")
    private String baseUrl;

    private String model;

    private Map<String, String> prompts;

    /** Reject JSON scalar coercion so saved templates are always intentional text. */
    @JsonProperty("prompts")
    public void readPrompts(JsonNode value) {
        if (value == null || !value.isObject()) {
            throw new ExternalException("text2gql.invalid-prompts");
        }
        Map<String, String> parsed = new LinkedHashMap<>();
        value.properties().forEach(entry -> {
            if ((!"gremlin".equals(entry.getKey()) && !"cypher".equals(entry.getKey())) ||
                !entry.getValue().isTextual()) {
                throw new ExternalException("text2gql.invalid-prompts");
            }
            parsed.put(entry.getKey(), entry.getValue().textValue());
        });
        this.prompts = parsed;
    }

    @JsonProperty(value = "api_key", access = JsonProperty.Access.WRITE_ONLY)
    private String apiKey;

    @JsonProperty("clear_api_key")
    private boolean clearApiKey;
}
