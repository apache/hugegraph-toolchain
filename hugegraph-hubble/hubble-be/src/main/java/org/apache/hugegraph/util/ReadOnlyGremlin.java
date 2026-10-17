/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hugegraph.util;

import java.util.Set;

import org.apache.hugegraph.exception.ExternalException;

/**
 * A deliberately small traversal grammar for automatically executed model output.
 * This accepts literal arguments, read steps and predicates, never Groovy scripts.
 * General scripts remain available through the ordinary Gremlin console.
 */
public final class ReadOnlyGremlin {

    private static final Set<String> STEPS = Set.of(
            "V", "E", "has", "hasId", "hasLabel", "hasKey", "hasValue", "hasNot",
            "out", "in", "both", "outE", "inE", "bothE", "outV", "inV", "bothV", "otherV",
            "values", "valueMap", "elementMap", "properties", "propertyMap", "label", "id", "key", "value",
            "count", "sum", "min", "max", "mean", "fold", "unfold", "dedup", "order", "by",
            "limit", "range", "tail", "skip", "sample", "group", "groupCount", "select", "project",
            "path", "simplePath", "cyclicPath", "repeat", "until", "emit", "times", "loops",
            "local", "union", "coalesce", "choose", "optional", "and", "or", "not", "where",
            "filter", "map", "flatMap", "identity", "constant", "as", "match", "is",
            "toList", "toSet", "next", "hasNext");

    private static final Set<String> PREDICATES = Set.of(
            "eq", "neq", "gt", "gte", "lt", "lte", "inside", "outside", "between", "within", "without",
            "and", "or", "not", "startingWith", "notStartingWith", "endingWith", "notEndingWith",
            "containing", "notContaining", "regex", "notRegex");

    private static final Set<String> CONSTANTS = Set.of(
            "true", "false", "null", "asc", "desc", "shuffle", "local", "global", "keys", "values",
            "first", "last", "all", "mixed", "id", "label", "key", "value",
            "T.id", "T.label", "T.key", "T.value",
            "Order.asc", "Order.desc", "Order.shuffle", "Scope.local", "Scope.global",
            "Column.keys", "Column.values", "Pop.first", "Pop.last", "Pop.all", "Pop.mixed");

    private ReadOnlyGremlin() {
    }

    public static void validate(String query) {
        if (query == null || query.isBlank() || query.length() > 10000) {
            throw invalid();
        }
        Parser parser = new Parser(query);
        parser.expectIdentifier("g");
        parser.expect('.');
        String start = parser.identifier();
        if (!"V".equals(start) && !"E".equals(start)) {
            throw invalid();
        }
        parser.arguments(0);
        parser.chain(STEPS, 0);
        parser.consume(';');
        parser.whitespace();
        if (parser.position != query.length()) {
            throw invalid();
        }
    }

    private static ExternalException invalid() {
        return new ExternalException("text2gql.read-only");
    }

    private static final class Parser {

        private final String text;
        private int position;

        private Parser(String text) {
            this.text = text;
        }

        private void chain(Set<String> methods, int depth) {
            while (this.consume('.')) {
                if (!methods.contains(this.identifier())) {
                    throw invalid();
                }
                this.arguments(depth);
            }
        }

        private void arguments(int depth) {
            if (depth > 40) {
                throw invalid();
            }
            this.expect('(');
            if (!this.consume(')')) {
                do {
                    this.expression(depth + 1);
                } while (this.consume(','));
                this.expect(')');
            }
        }

        private void expression(int depth) {
            if (depth > 40 || this.position >= this.text.length()) {
                throw invalid();
            }
            this.whitespace();
            if (this.position >= this.text.length()) {
                throw invalid();
            }
            char next = this.text.charAt(this.position);
            if (next == '\'' || next == '"') {
                this.string(next);
            } else if (next == '[') {
                this.position++;
                if (!this.consume(']')) {
                    do {
                        this.expression(depth + 1);
                    } while (this.consume(','));
                    this.expect(']');
                }
            } else if (Character.isDigit(next) || next == '-') {
                this.number();
            } else {
                String name = this.identifier();
                if ("__".equals(name)) {
                    this.expect('.');
                    if (!STEPS.contains(this.identifier())) {
                        throw invalid();
                    }
                    this.arguments(depth);
                    this.chain(STEPS, depth);
                } else if ("P".equals(name) || "TextP".equals(name)) {
                    this.expect('.');
                    this.predicate(this.identifier(), depth);
                } else if (PREDICATES.contains(name)) {
                    this.predicate(name, depth);
                } else {
                    if (this.consume('.')) {
                        name += "." + this.identifier();
                    }
                    if (!CONSTANTS.contains(name)) {
                        throw invalid();
                    }
                }
            }
        }

        private void predicate(String name, int depth) {
            if (!PREDICATES.contains(name)) {
                throw invalid();
            }
            this.arguments(depth);
            this.chain(PREDICATES, depth);
        }

        private void string(char quote) {
            this.position++;
            while (this.position < this.text.length()) {
                char ch = this.text.charAt(this.position++);
                if (ch == quote) {
                    return;
                }
                if (ch == '\n' || ch == '\r' || ch == '$' && quote == '"') {
                    throw invalid();
                }
                if (ch == '\\') {
                    if (this.position >= this.text.length() ||
                        "\\'\"nrtbf".indexOf(this.text.charAt(this.position++)) < 0) {
                        throw invalid();
                    }
                }
            }
            throw invalid();
        }

        private void number() {
            int start = this.position;
            if (this.text.charAt(this.position) == '-') {
                this.position++;
            }
            this.digits();
            if (this.consume('.')) {
                this.digits();
            }
            if (this.position < this.text.length() &&
                (this.text.charAt(this.position) == 'e' || this.text.charAt(this.position) == 'E')) {
                this.position++;
                if (!this.consume('-')) {
                    this.consume('+');
                }
                this.digits();
            }
            if (this.position == start) {
                throw invalid();
            }
        }

        private void digits() {
            int start = this.position;
            while (this.position < this.text.length() &&
                   Character.isDigit(this.text.charAt(this.position))) {
                this.position++;
            }
            if (start == this.position) {
                throw invalid();
            }
        }

        private String identifier() {
            this.whitespace();
            int start = this.position;
            while (this.position < this.text.length()) {
                char ch = this.text.charAt(this.position);
                if (ch != '_' && !Character.isLetterOrDigit(ch)) {
                    break;
                }
                this.position++;
            }
            if (start == this.position) {
                throw invalid();
            }
            return this.text.substring(start, this.position);
        }

        private void expectIdentifier(String expected) {
            if (!expected.equals(this.identifier())) {
                throw invalid();
            }
        }

        private void expect(char expected) {
            if (!this.consume(expected)) {
                throw invalid();
            }
        }

        private boolean consume(char expected) {
            this.whitespace();
            if (this.position < this.text.length() && this.text.charAt(this.position) == expected) {
                this.position++;
                return true;
            }
            return false;
        }

        private void whitespace() {
            while (this.position < this.text.length() && Character.isWhitespace(this.text.charAt(this.position))) {
                this.position++;
            }
        }
    }
}
