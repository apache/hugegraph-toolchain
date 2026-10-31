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

import java.math.BigInteger;
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

    private static final Set<String> COLLECTIONS = Set.of("fold", "group", "groupCount");
    private static final Set<String> CONSUMERS = Set.of("toList", "toSet", "next", "hasNext");

    private static final Set<String> BOUNDS = Set.of("limit", "range", "tail");

    private static final Set<String> ADJACENCY = Set.of(
            "out", "in", "both", "outE", "inE", "bothE", "outV", "inV", "bothV", "otherV");

    private static final Set<String> PREDICATES = Set.of(
            "eq", "neq", "gt", "gte", "lt", "lte", "inside", "outside", "between", "within", "without",
            "and", "or", "not", "startingWith", "notStartingWith", "endingWith", "notEndingWith",
            "containing", "notContaining", "regex", "notRegex");

    private static final Set<String> TEXT_PREDICATES = Set.of("contains");

    private static final Set<String> CONSTANTS = Set.of(
            "true", "false", "null", "asc", "desc", "shuffle", "local", "global", "keys", "values",
            "first", "last", "all", "mixed", "id", "label", "key", "value",
            "T.id", "T.label", "T.key", "T.value",
            "Order.asc", "Order.desc", "Order.shuffle", "Scope.local", "Scope.global",
            "Column.keys", "Column.values", "Pop.first", "Pop.last", "Pop.all", "Pop.mixed");

    private ReadOnlyGremlin() {
    }

    public static void validate(String query) {
        parse(query);
    }

    static Syntax parse(String query) {
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
        int insertion = parser.consumerFollowed ? -1 :
                        parser.consumerPosition >= 0 ? parser.consumerPosition : query.length();
        return new Syntax(parser.explicitLimit, parser.collection, insertion,
                          parser.terminalZeroLimit);
    }

    // Syntactic facts only: no output, cardinality or collection-shape inference.
    record Syntax(boolean explicitLimit, boolean collection, int limitPosition,
                  boolean terminalZeroLimit) {
    }

    private static ExternalException invalid() {
        return new ExternalException("text2gql.read-only");
    }

    private static final class Parser {

        private final String text;
        private int position;
        private boolean explicitLimit;
        private boolean collection;
        private int consumerPosition = -1;
        private boolean consumerFollowed;
        private boolean terminalZeroLimit;

        private Parser(String text) {
            this.text = text;
        }

        private void chain(Set<String> methods, int depth) {
            while (this.consume('.')) {
                int dotPosition = this.position - 1;
                String name = this.identifier();
                if (!methods.contains(name)) {
                    throw invalid();
                }
                if (methods == STEPS) {
                    this.collection |= COLLECTIONS.contains(name);
                    if (depth == 0) {
                        if (ADJACENCY.contains(name)) {
                            this.explicitLimit = false;
                        } else if (BOUNDS.contains(name)) {
                            this.explicitLimit = true;
                        }
                        this.consumerFollowed |= this.consumerPosition >= 0;
                        if (CONSUMERS.contains(name)) {
                            this.consumerPosition = dotPosition;
                        }
                    }
                }
                int argumentsStart = this.position;
                this.arguments(depth);
                if (methods == STEPS && depth == 0 && !CONSUMERS.contains(name)) {
                    // A terminal global limit(0) already bounds the result to zero.
                    // Do not infer cardinality through later traversal steps.
                    this.terminalZeroLimit = "limit".equals(name) &&
                                             this.isLiteralZeroLimit(argumentsStart);
                }
            }
        }

        private boolean isLiteralZeroLimit(int argumentsStart) {
            String arguments = this.text.substring(argumentsStart, this.position).trim();
            if (!arguments.startsWith("(") || !arguments.endsWith(")")) {
                return false;
            }
            String value = arguments.substring(1, arguments.length() - 1).trim();
            // Limit matching to simple integral literals. Dynamic expressions,
            // local scope and other spellings retain the normal preview cap.
            return "0".equals(value) || "+0".equals(value) || "-0".equals(value) ||
                   "0L".equals(value) || "+0L".equals(value) || "-0L".equals(value) ||
                   "0l".equals(value) || "+0l".equals(value) || "-0l".equals(value);
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
            } else if (Character.isDigit(next) || next == '-' || next == '+') {
                this.number();
            } else {
                String name = this.identifier();
                this.whitespace();
                if ("__".equals(name)) {
                    this.expect('.');
                    this.anonymousTraversal(this.identifier(), depth);
                } else if (STEPS.contains(name) && this.next('(')) {
                    this.anonymousTraversal(name, depth);
                } else if ("P".equals(name) || "TextP".equals(name) || "Text".equals(name)) {
                    this.expect('.');
                    this.predicate(this.identifier(), depth,
                                   "Text".equals(name) ? TEXT_PREDICATES : PREDICATES);
                } else if (PREDICATES.contains(name)) {
                    this.predicate(name, depth, PREDICATES);
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

        private void anonymousTraversal(String name, int depth) {
            if (!STEPS.contains(name)) {
                throw invalid();
            }
            this.collection |= COLLECTIONS.contains(name);
            this.arguments(depth);
            this.chain(STEPS, depth);
        }

        private void predicate(String name, int depth, Set<String> methods) {
            if (!methods.contains(name)) {
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
            if (this.next('-') || this.next('+')) {
                this.position++;
            }
            int digitsStart = this.position;
            int radix = 10;
            boolean decimal = false;
            if (this.next('0') && this.position + 1 < this.text.length()) {
                char prefix = Character.toLowerCase(this.text.charAt(this.position + 1));
                if (prefix == 'x' || prefix == 'b') {
                    radix = prefix == 'x' ? 16 : 2;
                    this.position += 2;
                    digitsStart = this.position;
                }
            }
            this.digits(radix);
            int digitsEnd = this.position;
            if (radix == 10 && this.next('.')) {
                decimal = true;
                this.position++;
                this.digits(10);
            }
            if (radix == 10 && (this.next('e') || this.next('E'))) {
                decimal = true;
                this.position++;
                if (this.next('-') || this.next('+')) {
                    this.position++;
                }
                this.digits(10);
            }
            char suffix = 0;
            if (this.position < this.text.length()) {
                char next = Character.toLowerCase(this.text.charAt(this.position));
                if ("ilg".indexOf(next) >= 0 || radix == 10 && "df".indexOf(next) >= 0) {
                    suffix = next;
                    this.position++;
                }
            }
            if (decimal && (suffix == 'i' || suffix == 'l')) {
                throw invalid();
            }
            if (decimal || suffix == 'd' || suffix == 'f') {
                return;
            }
            String digits = this.text.substring(digitsStart, digitsEnd).replace("_", "");
            if (radix == 10 && digits.length() > 1 && digits.charAt(0) == '0') {
                radix = 8;
            }
            try {
                BigInteger value = new BigInteger(digits, radix);
                if (this.text.charAt(start) == '-') {
                    value = value.negate();
                }
                if (suffix == 'i') {
                    value.intValueExact();
                } else if (suffix == 'l') {
                    value.longValueExact();
                }
                return;
            } catch (NumberFormatException | ArithmeticException ignored) {
                throw invalid();
            }
        }

        private void digits(int radix) {
            int start = this.position;
            boolean lastDigit = false;
            while (this.position < this.text.length()) {
                char next = this.text.charAt(this.position);
                if (Character.digit(next, radix) >= 0 && next < 128) {
                    lastDigit = true;
                } else if (next == '_' && this.position > start) {
                    lastDigit = false;
                } else {
                    break;
                }
                this.position++;
            }
            if (start == this.position || !lastDigit) {
                throw invalid();
            }
        }

        private boolean next(char expected) {
            return this.position < this.text.length() && this.text.charAt(this.position) == expected;
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
