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

import org.apache.hugegraph.entity.enums.QueryLanguage;
import org.apache.hugegraph.exception.ExternalException;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Text2GqlRequest {

    private String question;

    private String source = "custom";

    private QueryLanguage language = QueryLanguage.GREMLIN;

    @JsonProperty("base_url")
    private String baseUrl;

    @JsonProperty(value = "api_key", access = JsonProperty.Access.WRITE_ONLY)
    private String apiKey;

    private String model;

    private String prompt;

    @JsonProperty("prompt")
    public void readPrompt(JsonNode value) {
        if (value != null && !value.isNull() && !value.isTextual()) {
            throw new ExternalException("text2gql.invalid-prompts");
        }
        this.prompt = value == null || value.isNull() ? null : value.textValue();
    }

    public void setPrompt(String value) {
        this.prompt = value;
    }

    private Repair repair;

    @Getter
    public static final class Repair {

        private final String query;
        private final String error;

        public Repair(String query, String error) {
            this.query = query;
            this.error = error;
        }

        @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
        public static Repair fromJson(JsonNode value) {
            JsonNode query = value == null ? null : value.get("query");
            JsonNode error = value == null ? null : value.get("error");
            if (value == null || !value.isObject() || error == null || !error.isTextual() ||
                (query != null && !query.isNull() && !query.isTextual())) {
                throw new ExternalException("text2gql.invalid-request");
            }
            return new Repair(query == null || query.isNull() ? null : query.textValue(), error.textValue());
        }
    }
}
