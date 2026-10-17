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

package org.apache.hugegraph.entity.enums;

import java.util.Locale;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Predicate;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.util.ReadOnlyCypher;
import org.apache.hugegraph.util.ReadOnlyGremlin;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** The generated query dialect owns its accepted code fences and execution guard. */
public enum QueryLanguage {

    GREMLIN("gremlin", Set.of("gremlin", "groovy"), ReadOnlyGremlin::validate, client -> true),
    CYPHER("cypher", Set.of("cypher"), ReadOnlyCypher::validate, HugeClient::supportsCypher);

    private final String value;
    private final Set<String> codeFences;
    private final Consumer<String> validator;
    private final Predicate<HugeClient> supported;

    QueryLanguage(String value, Set<String> codeFences, Consumer<String> validator,
                  Predicate<HugeClient> supported) {
        this.value = value;
        this.codeFences = codeFences;
        this.validator = validator;
        this.supported = supported;
    }

    @JsonValue
    public String value() {
        return this.value;
    }

    @JsonCreator
    public static QueryLanguage fromValue(String value) {
        for (QueryLanguage language : values()) {
            if (language.value.equals(value)) {
                return language;
            }
        }
        throw new ExternalException("text2gql.invalid-language");
    }

    public boolean acceptsCodeFence(String value) {
        return value.isEmpty() || this.codeFences.contains(value.toLowerCase(Locale.ROOT));
    }

    public void requireSupported(HugeClient client) {
        if (!this.supported.test(client)) {
            throw new ExternalException("text2gql.language-unavailable");
        }
    }

    public void validate(String query) {
        this.validator.accept(query);
    }
}
