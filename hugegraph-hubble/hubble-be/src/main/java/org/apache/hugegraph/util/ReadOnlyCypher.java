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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.apache.hugegraph.exception.ExternalException;

/**
 * A bounded, deliberately restricted Cypher grammar for Text2GQL execution.
 * This is not a complete Cypher parser. Only read clauses, literal expressions
 * and explicitly listed functions are accepted; unsupported syntax
 * must fail closed instead of being forwarded to the graph server.
 */
public final class ReadOnlyCypher {

    public static final int MAX_PATH_HOPS = 10;

    private static final int MAX_LENGTH = 10000;
    private static final int MAX_TOKENS = 4096;
    private static final int MAX_DEPTH = 32;
    private static final Set<String> KEYWORDS = Set.of(
            "MATCH", "OPTIONAL", "WHERE", "WITH", "RETURN", "ORDER", "BY", "SKIP", "LIMIT",
            "AS", "DISTINCT", "ASC", "ASCENDING", "DESC", "DESCENDING", "AND", "OR", "XOR",
            "NOT", "IN", "IS", "NULL", "TRUE", "FALSE", "STARTS", "ENDS", "CONTAINS",
            "CREATE", "INSERT", "MERGE", "SET", "REMOVE", "DELETE", "DETACH", "DROP", "CALL",
            "LOAD", "CSV", "UNION", "ALL", "FOREACH", "USE", "SHOW", "TERMINATE", "ALTER",
            "GRANT", "DENY", "REVOKE", "START", "STOP", "TRANSACTION", "TRANSACTIONS",
            "DATABASE", "DATABASES", "EXPLAIN", "PROFILE", "FINISH", "YIELD", "UNWIND",
            "CASE", "WHEN", "THEN", "ELSE", "END");
    private static final Set<String> FUNCTIONS = Set.of(
            "id", "elementid", "label", "labels", "type", "properties", "keys", "length", "size",
            "head", "last", "tail", "reverse", "coalesce", "exists", "count", "sum", "avg", "min",
            "max", "collect", "stdev", "stdevp", "percentilecont", "percentiledisc", "abs", "ceil",
            "ceiling", "floor", "round", "sign", "sqrt", "exp", "log", "log10", "rand", "left",
            "right", "trim", "ltrim", "rtrim", "toupper", "tolower", "replace", "substring", "split",
            "tostring", "tointeger", "tofloat", "toboolean", "range", "nodes", "relationships",
            "startnode", "endnode", "timestamp");

    private ReadOnlyCypher() {
    }

    public static Set<String> supportedFunctions() {
        return FUNCTIONS;
    }

    public static void validate(String query) {
        if (query == null || query.length() > MAX_LENGTH || query.isBlank()) {
            throw invalid();
        }
        new Parser(tokenize(query)).query();
    }

    private static ExternalException invalid() {
        return new ExternalException("text2gql.cypher.read-only");
    }

    private static List<Token> tokenize(String query) {
        List<Token> tokens = new ArrayList<>();
        int position = 0;
        while (position < query.length()) {
            char current = query.charAt(position);
            if (current == ' ' || current == '\t' || current == '\r' || current == '\n') {
                position++;
                continue;
            }
            int start = position;
            Kind kind;
            if (current == '\'' || current == '"' || current == '`') {
                position = quotedEnd(query, position, current);
                kind = current == '`' ? Kind.QUOTED_IDENTIFIER : Kind.STRING;
            } else if (current == '$') {
                // Text2GQL sends no parameter bindings, so accepting one could silently return no rows.
                throw invalid();
            } else if (identifierStart(current)) {
                position++;
                while (position < query.length() && identifierPart(query.charAt(position))) {
                    position++;
                }
                kind = Kind.WORD;
            } else if (digit(current)) {
                position = numberEnd(query, position);
                kind = Kind.NUMBER;
            } else {
                // Do not normalize comments or escapes: reject them before parsing.
                if (position + 1 < query.length()) {
                    String pair = query.substring(position, position + 2);
                    if (Set.of("//", "/*", "*/").contains(pair)) {
                        throw invalid();
                    }
                    if (Set.of("<=", ">=", "<>", "!=", "=~").contains(pair)) {
                        position++;
                    }
                }
                if ("()[]{}.,:+-*/%^=<>!;|".indexOf(current) < 0) {
                    throw invalid();
                }
                position++;
                kind = Kind.SYMBOL;
            }
            tokens.add(new Token(kind, query.substring(start, position)));
            if (tokens.size() > MAX_TOKENS) {
                throw invalid();
            }
        }
        tokens.add(new Token(Kind.END, ""));
        return tokens;
    }

    private static int quotedEnd(String text, int start, char quote) {
        int position = start + 1;
        while (position < text.length()) {
            char current = text.charAt(position++);
            if (current == quote) {
                if (quote == '`' && position < text.length() && text.charAt(position) == '`') {
                    position++;
                    continue;
                }
                if (quote == '`' && position == start + 2) {
                    throw invalid();
                }
                return position;
            }
            if (current < ' ' || Character.isSurrogate(current)) {
                throw invalid();
            }
            if (current == '\\') {
                // Unicode escapes can be interpreted before Cypher tokenization.
                if (quote == '`' || position == text.length() ||
                    "\\\"'nrtbf".indexOf(text.charAt(position++)) < 0) {
                    throw invalid();
                }
            }
        }
        throw invalid();
    }

    private static int numberEnd(String text, int start) {
        int position = start;
        while (position < text.length() && digit(text.charAt(position))) {
            position++;
        }
        if (position + 1 < text.length() && text.charAt(position) == '.' &&
            digit(text.charAt(position + 1))) {
            position++;
            while (position < text.length() && digit(text.charAt(position))) {
                position++;
            }
        }
        if (position < text.length() && (text.charAt(position) == 'e' || text.charAt(position) == 'E')) {
            position++;
            if (position < text.length() && (text.charAt(position) == '+' || text.charAt(position) == '-')) {
                position++;
            }
            int digitsStart = position;
            while (position < text.length() && digit(text.charAt(position))) {
                position++;
            }
            if (position == digitsStart) {
                throw invalid();
            }
        }
        return position;
    }

    private static boolean digit(char value) {
        return value >= '0' && value <= '9';
    }

    private static boolean identifierStart(char value) {
        return value == '_' || Character.isLetter(value);
    }

    private static boolean identifierPart(char value) {
        return identifierStart(value) || digit(value);
    }

    private enum Kind {
        WORD, QUOTED_IDENTIFIER, STRING, NUMBER, SYMBOL, END
    }

    private static final class Token {

        private final Kind kind;
        private final String text;

        private Token(Kind kind, String text) {
            this.kind = kind;
            this.text = text;
        }
    }

    private static final class Parser {

        private final List<Token> tokens;
        private int position;

        private Parser(List<Token> tokens) {
            this.tokens = tokens;
        }

        private void query() {
            while (!this.at("RETURN")) {
                if (this.consume("MATCH")) {
                    this.patterns();
                    this.where();
                } else if (this.consume("OPTIONAL")) {
                    this.expect("MATCH");
                    this.patterns();
                    this.where();
                } else if (this.consume("WITH")) {
                    this.projections();
                    this.modifiers();
                    this.where();
                } else {
                    throw invalid();
                }
            }
            this.expect("RETURN");
            this.projections();
            this.modifiers();
            this.consume(";");
            if (this.current().kind != Kind.END) {
                throw invalid();
            }
        }

        private void where() {
            if (this.consume("WHERE")) {
                this.expression(0, 0);
            }
        }

        private void projections() {
            this.consume("DISTINCT");
            do {
                if (!this.consume("*")) {
                    this.expression(0, 0);
                    if (this.consume("AS")) {
                        this.identifier();
                    }
                }
            } while (this.consume(","));
        }

        private void modifiers() {
            if (this.consume("ORDER")) {
                this.expect("BY");
                do {
                    this.expression(0, 0);
                    if (!this.consume("ASC") && !this.consume("ASCENDING") && !this.consume("DESC")) {
                        this.consume("DESCENDING");
                    }
                } while (this.consume(","));
            }
            if (this.consume("SKIP")) {
                this.expression(0, 0);
            }
            if (this.consume("LIMIT")) {
                this.expression(0, 0);
            }
        }

        private void patterns() {
            do {
                if (this.isIdentifier() && this.tokens.get(this.position + 1).text.equals("=")) {
                    this.identifier();
                    this.expect("=");
                }
                this.node();
                while (this.at("-") || this.at("<")) {
                    boolean incoming = this.consume("<");
                    this.expect("-");
                    if (this.consume("[")) {
                        this.relationship();
                        this.expect("]");
                    }
                    this.expect("-");
                    if (!incoming) {
                        this.consume(">");
                    }
                    this.node();
                }
            } while (this.consume(","));
        }

        private void node() {
            this.expect("(");
            if (this.isIdentifier()) {
                this.identifier();
            }
            while (this.consume(":")) {
                this.schemaName();
            }
            this.patternProperties();
            this.expect(")");
        }

        private void relationship() {
            if (this.isIdentifier()) {
                this.identifier();
            }
            if (this.consume(":")) {
                this.schemaName();
                while (this.consume("|")) {
                    this.consume(":");
                    this.schemaName();
                }
            }
            if (this.consume("*")) {
                this.pathLength();
            }
            this.patternProperties();
        }

        private void pathLength() {
            int lower = this.pathBound();
            if (this.consume(".")) {
                this.expect(".");
                int upper = this.pathBound();
                // Cypher defaults an omitted lower bound to one hop.
                if (upper < 0 || (lower < 0 ? 1 : lower) > upper) {
                    throw invalid();
                }
            } else if (lower < 0) {
                throw invalid();
            }
        }

        private int pathBound() {
            if (this.current().kind != Kind.NUMBER) {
                return -1;
            }
            String value = this.current().text;
            int bound = 0;
            for (int i = 0; i < value.length(); i++) {
                char current = value.charAt(i);
                if (!digit(current)) {
                    throw invalid();
                }
                bound = bound * 10 + current - '0';
                // Check each digit so long numeric tokens cannot overflow.
                if (bound > MAX_PATH_HOPS) {
                    throw invalid();
                }
            }
            this.position++;
            return bound;
        }

        private void patternProperties() {
            if (this.consume("{")) {
                this.map(0);
            }
        }

        private void expression(int minimum, int depth) {
            if (depth > MAX_DEPTH) {
                throw invalid();
            }
            this.atom(depth);
            while (true) {
                int precedence = this.precedence();
                if (precedence < minimum) {
                    return;
                }
                String operator = this.current().text.toUpperCase(Locale.ROOT);
                this.position++;
                if ("IS".equals(operator)) {
                    this.consume("NOT");
                    this.expect("NULL");
                } else {
                    if ("STARTS".equals(operator) || "ENDS".equals(operator)) {
                        this.expect("WITH");
                    }
                    this.expression(precedence + 1, depth + 1);
                }
            }
        }

        private int precedence() {
            String operator = this.current().text.toUpperCase(Locale.ROOT);
            if (this.current().kind != Kind.WORD && this.current().kind != Kind.SYMBOL) {
                return -1;
            }
            switch (operator) {
                case "OR":
                    return 1;
                case "XOR":
                    return 2;
                case "AND":
                    return 3;
                case "=":
                case "<>":
                case "!=":
                case "<":
                case ">":
                case "<=":
                case ">=":
                case "=~":
                case "IN":
                case "IS":
                case "STARTS":
                case "ENDS":
                case "CONTAINS":
                    return 4;
                case "+":
                case "-":
                    return 5;
                case "*":
                case "/":
                case "%":
                    return 6;
                case "^":
                    return 7;
                default:
                    return -1;
            }
        }

        private void atom(int depth) {
            if (depth > MAX_DEPTH) {
                throw invalid();
            }
            if (this.consume("NOT")) {
                this.expression(4, depth + 1);
                return;
            }
            if (this.consume("+") || this.consume("-")) {
                this.expression(8, depth + 1);
                return;
            }
            Token token = this.current();
            if (this.consume("(")) {
                this.expression(0, depth + 1);
                this.expect(")");
            } else if (this.consume("[")) {
                if (!this.consume("]")) {
                    do {
                        this.expression(0, depth + 1);
                    } while (this.consume(","));
                    this.expect("]");
                }
            } else if (this.consume("{")) {
                this.map(depth + 1);
            } else if (token.kind == Kind.STRING || token.kind == Kind.NUMBER ||
                       this.at("TRUE") || this.at("FALSE") || this.at("NULL")) {
                this.position++;
            } else if (token.kind == Kind.WORD && this.tokens.get(this.position + 1).text.equals("(")) {
                this.function(depth + 1);
            } else {
                this.identifier();
            }
            while (true) {
                if (this.consume(".")) {
                    this.schemaName();
                } else if (this.consume("[")) {
                    this.expression(0, depth + 1);
                    this.expect("]");
                } else {
                    return;
                }
            }
        }

        private void map(int depth) {
            if (!this.consume("}")) {
                do {
                    this.schemaName();
                    this.expect(":");
                    this.expression(0, depth + 1);
                } while (this.consume(","));
                this.expect("}");
            }
        }

        private void function(int depth) {
            String name = this.current().text.toLowerCase(Locale.ROOT);
            if (!FUNCTIONS.contains(name)) {
                throw invalid();
            }
            this.position++;
            this.expect("(");
            if (this.consume("*")) {
                if (!"count".equals(name)) {
                    throw invalid();
                }
                this.expect(")");
                return;
            }
            if (!this.consume(")")) {
                this.consume("DISTINCT");
                do {
                    this.expression(0, depth + 1);
                } while (this.consume(","));
                this.expect(")");
            }
        }

        private boolean isIdentifier() {
            Token token = this.current();
            return token.kind == Kind.QUOTED_IDENTIFIER ||
                   token.kind == Kind.WORD && !KEYWORDS.contains(token.text.toUpperCase(Locale.ROOT));
        }

        private void identifier() {
            if (!this.isIdentifier()) {
                throw invalid();
            }
            this.position++;
        }

        private void schemaName() {
            Kind kind = this.current().kind;
            if (kind != Kind.WORD && kind != Kind.QUOTED_IDENTIFIER) {
                throw invalid();
            }
            this.position++;
        }

        private Token current() {
            return this.tokens.get(this.position);
        }

        private boolean at(String text) {
            Token token = this.current();
            return (token.kind == Kind.WORD || token.kind == Kind.SYMBOL) && token.text.equalsIgnoreCase(text);
        }

        private boolean consume(String text) {
            if (!this.at(text)) {
                return false;
            }
            this.position++;
            return true;
        }

        private void expect(String text) {
            if (!this.consume(text)) {
                throw invalid();
            }
        }
    }
}
