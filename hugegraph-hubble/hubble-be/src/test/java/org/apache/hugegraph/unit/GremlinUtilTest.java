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

package org.apache.hugegraph.unit;

import org.junit.Test;

import org.apache.tinkerpop.gremlin.process.traversal.Traversal;
import org.apache.tinkerpop.gremlin.process.traversal.step.filter.DiscardStep;
import org.apache.tinkerpop.gremlin.tinkergraph.structure.TinkerFactory;

import org.apache.hugegraph.exception.ExternalException;
import org.apache.hugegraph.testutil.Assert;
import org.apache.hugegraph.util.GremlinUtil;

public class GremlinUtilTest {

    private static final int LIMIT = 250;

    @Test
    public void testCommonReadSugarPreservesExplicitLimits() {
        String[] ordinary = {"g.V().has('name', 'Alice')", "g.E().hasLabel('knows')",
                             "g.V().order().by('name')", "g.V().count()",
                             "g.V().valueMap().count(local)"};
        for (String query : ordinary) {
            Assert.assertEquals(query + ".limit(300)", GremlinUtil.optimizeLimit(query, 300));
            Assert.assertEquals(query + ".limit(1001)", GremlinUtil.optimizePreviewLimit(query, 1001));
        }
        String explicit = "g.V().limit(10000).hasLabel('person')";
        Assert.assertEquals(explicit, GremlinUtil.optimizeLimit(explicit, 300));
        Assert.assertEquals(explicit + ".limit(1001)", GremlinUtil.optimizePreviewLimit(explicit, 1001));
    }

    @Test
    public void testPreviewDoesNotAppendASecondLimitAfterTerminalZero() {
        String[] queries = {"g.V().limit(0)", "g.E().limit(0L)",
                            "g.V().limit( +0 )", "g.V().limit(-0l)",
                            "g.V().limit(/* comment */ 0)",
                            "g.V().has('note', 'limit(0)').limit(0)",
                            "g.V().limit(0).toList()", "g.V().limit(0).next()",
                            "g.V().limit(0);", "g.V().limit(0) // zero\n"};
        for (String query : queries) {
            Assert.assertEquals(query, GremlinUtil.optimizeLimit(query, 300));
            Assert.assertEquals(query, GremlinUtil.optimizePreviewLimit(query, 1001));
        }
        Assert.assertEquals("g.V().limit(0); g.E().limit(1001)",
                            GremlinUtil.optimizePreviewLimit("g.V().limit(0); g.E()", 1001));
    }

    @Test
    public void testPreviewDoesNotInferZeroThroughOtherStepsOrArguments() {
        String[] queries = {"g.V().limit(0).count()", "g.V().limit(0).out()",
                            "g.V().limit(local, 0)", "g.V().has('limit', '0')",
                            "g.V().where(__.limit(0))", "g.V().limit(1)",
                            "g.V().limit(10000)"};
        for (String query : queries) {
            Assert.assertEquals(query + ".limit(1001)",
                                GremlinUtil.optimizePreviewLimit(query, 1001));
        }
        // Unknown Groovy expressions retain the ordinary execution path.
        String dynamic = "g.V().limit(x)";
        Assert.assertEquals(dynamic, GremlinUtil.optimizePreviewLimit(dynamic, 1001));
    }

    @Test
    public void testTinkerPopDoubleLimitCreatesDiscardStep() throws Exception {
        try (var graph = TinkerFactory.createModern(); var traversal = graph.traversal()) {
            Traversal.Admin<?, ?> doubleLimit = traversal.V().limit(0).limit(1001).asAdmin();
            doubleLimit.applyStrategies();
            Assert.assertTrue(doubleLimit.getSteps().stream().anyMatch(step -> step instanceof DiscardStep));

            Traversal.Admin<?, ?> singleLimit = traversal.V().limit(0).asAdmin();
            singleLimit.applyStrategies();
            Assert.assertFalse(singleLimit.getSteps().stream().anyMatch(step -> step instanceof DiscardStep));
        }
    }

    @Test
    public void testFinalConsumersReceiveLimitsBeforeTheirCall() {
        for (String consumer : new String[]{"toList()", "toSet()", "next()", "next(10)", "hasNext()"}) {
            String query = "g.V()." + consumer;
            Assert.assertEquals("g.V().limit(300)." + consumer, GremlinUtil.optimizeLimit(query, 300));
            Assert.assertEquals("g.V().limit(1001)." + consumer,
                                GremlinUtil.optimizePreviewLimit(query, 1001));
        }
        String materialized = "g.V().next().value('name')";
        Assert.assertEquals(materialized, GremlinUtil.optimizePreviewLimit(materialized, 1001));
    }

    @Test
    public void testCommonBoundsSurviveProjectionButNotLaterAdjacency() {
        for (String bound : new String[]{"limit(500)", "range(0,5000)", "tail(500)"}) {
            String query = "g.V()." + bound;
            Assert.assertEquals(query, GremlinUtil.optimizeLimit(query, 300));
            Assert.assertEquals(query + ".valueMap()",
                                GremlinUtil.optimizeLimit(query + ".valueMap()", 300));
            Assert.assertEquals(query + ".out().limit(300)",
                                GremlinUtil.optimizeLimit(query + ".out()", 300));
            Assert.assertEquals(query + ".out().limit(5)",
                                GremlinUtil.optimizeLimit(query + ".out().limit(5)", 300));
            Assert.assertEquals(query + ".limit(1001)", GremlinUtil.optimizePreviewLimit(query, 1001));
        }
        Assert.assertEquals("g.V().limit(10).bothE().inV().limit(300)",
                            GremlinUtil.optimizeLimit("g.V().limit(10).bothE().inV()", 300));
    }

    @Test
    public void testCollectionPreviewsUniformlyUseAsyncWithoutBoundInference() {
        for (String query : new String[]{"g.V().fold()", "g.V().limit(10).fold()",
                                         "g.V().group().by(label)", "g.V().limit(10).groupCount().by(label)",
                                         "g.V().project('neighbors').by(__.both().fold())"}) {
            Assert.assertEquals(query, GremlinUtil.optimizeLimit(query, 300));
            ExternalException error = (ExternalException) Assert.assertThrows(ExternalException.class,
                    () -> GremlinUtil.optimizePreviewLimit(query, 1001));
            Assert.assertEquals("gremlin.preview.collection_requires_async", error.getMessage());
        }
        String literal = "g.V().has('text', '.fold()').out()";
        Assert.assertEquals(literal + ".limit(1001)", GremlinUtil.optimizePreviewLimit(literal, 1001));
    }

    @Test
    public void testUnknownManualSyntaxAndWritesKeepTheirNativePath() {
        for (String query : new String[]{"g.addV('person')", "g.V().property('name', 'Alice').out()",
                                         "g.V().drop()", "def result = g.V()"}) {
            Assert.assertEquals(query, GremlinUtil.optimizeLimit(query, 300));
            Assert.assertEquals(query, GremlinUtil.optimizePreviewLimit(query, 1001));
        }
    }

    @Test
    public void testFormattingDoesNotSplitAnArgumentListOrTrailingDot() {
        for (String query : new String[]{"g.V().has(\n 'active', true\n).out()", "g.V().\n out()"}) {
            Assert.assertEquals(query + ".limit(300)", GremlinUtil.optimizeLimit(query, 300));
        }
    }

    @Test
    public void testSuffixAppend() {
        // Matched suffixes get '.limit(N)' appended
        Assert.assertEquals("g.V().limit(250)",
                            GremlinUtil.optimizeLimit("g.V()", LIMIT));
        Assert.assertEquals("g.V().out().limit(250)",
                            GremlinUtil.optimizeLimit("g.V().out()", LIMIT));
        Assert.assertEquals("g.E().limit(250)",
                            GremlinUtil.optimizeLimit("g.E()", LIMIT));
        Assert.assertEquals("g.V().hasLabel('person').limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel('person')", LIMIT));
        // Scalar reductions keep their complete input; the limit follows them.
        Assert.assertEquals("g.V().count().limit(250)",
                            GremlinUtil.optimizeLimit("g.V().count()", LIMIT));
        // Multi-line: each line is optimized independently
        Assert.assertEquals("g.V().limit(250)\ng.V().count().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V()\ng.V().count()", LIMIT));
    }

    @Test
    public void testMultilineChainReceivesOnlyOneTailLimit() {
        Assert.assertEquals("g.V()\n  .hasLabel(\"person\")\n  " +
                            ".out().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V()\n  .hasLabel(\"person\")\n  .out()",
                            LIMIT));
        Assert.assertEquals("g.V() // continue\n  .out().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V() // continue\n  .out()", LIMIT));
        Assert.assertEquals("g.V()\n/* keep traversing */\n" +
                            ".out().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V()\n/* keep traversing */\n.out()",
                            LIMIT));
    }

    @Test
    public void testApostropheInCommentDoesNotDisableLimit() {
        // An apostrophe inside a comment must not be read as a string
        // delimiter, otherwise the rest of the script is treated as one
        // unterminated string and never receives its limit.
        String optimized = GremlinUtil.optimizeLimit(
                "// don't limit this\ng.V()", 250);
        Assert.assertTrue(optimized, optimized.endsWith(".limit(250)"));
        Assert.assertTrue(optimized, optimized.startsWith("// don't limit"));
    }

    @Test
    public void testQuoteInCommentDoesNotLeakIntoNextStatement() {
        String optimized = GremlinUtil.optimizeLimit(
                "// it's here\ng.V();g.E()", 10);
        Assert.assertEquals("// it's here\ng.V().limit(10);g.E().limit(10)",
                            optimized);
    }

    @Test
    public void testIgnoredCommentLine() {
        Assert.assertEquals("// g.V()\ng.E().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "// g.V()\ng.E()", LIMIT));
    }

    @Test
    public void testTrailingLineCommentKeepsLimitBeforeComment() {
        Assert.assertEquals("g.V().limit(250) // trailing",
                            GremlinUtil.optimizeLimit(
                            "g.V() // trailing", LIMIT));
    }

    @Test
    public void testBlockCommentDoesNotAffectStatementParsing() {
        Assert.assertEquals("g.V().limit(250) /* '; \\\" */;" +
                            "g.E().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V() /* '; \\\" */;g.E()", LIMIT));
        Assert.assertEquals("g.V().limit(250) /* line one\n" +
                            "line two */\ng.E().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V() /* line one\nline two */\ng.E()", LIMIT));
    }

    @Test
    public void testPlainMultiStatement() {
        Assert.assertEquals("g.V().limit(250);g.E().limit(250)",
                            GremlinUtil.optimizeLimit("g.V();g.E()", LIMIT));
        Assert.assertEquals("g.V().count().limit(250);g.E().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().count();g.E()", LIMIT));
        // Trailing separator kept, no limit appended to the empty tail
        Assert.assertEquals("g.V().limit(250);",
                            GremlinUtil.optimizeLimit("g.V();", LIMIT));
    }

    @Test
    public void testSemicolonInsideSingleQuotedString() {
        // The ';' inside the quoted string is not a statement separator
        Assert.assertEquals("g.V().hasLabel('a;b').limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel('a;b')", LIMIT));
        Assert.assertEquals("g.V().hasLabel('a;b').limit(250);" +
                            "g.E().limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel('a;b');g.E()", LIMIT));
    }

    @Test
    public void testSemicolonInsideDoubleQuotedString() {
        Assert.assertEquals("g.V().hasLabel(\"a;b\").limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel(\"a;b\")", LIMIT));
    }

    @Test
    public void testEscapedQuoteInsideString() {
        // The escaped quote does not close the string, so the ';' and the
        // fake suffix inside it are ignored
        Assert.assertEquals("g.V().hasLabel('it\\'s;x').limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel('it\\'s;x')", LIMIT));
        Assert.assertEquals("g.V().hasLabel(\"say \\\";\\\" ok\").limit(250)",
                            GremlinUtil.optimizeLimit(
                            "g.V().hasLabel(\"say \\\";\\\" ok\")", LIMIT));
    }

    @Test
    public void testNewlineInsideStringNotSeparator() {
        // A '\n' inside quotes must not be treated as a line separator
        String gremlin = "g.V().hasLabel('a\nb')";
        Assert.assertEquals("g.V().hasLabel('a\nb').limit(250)",
                            GremlinUtil.optimizeLimit(gremlin, LIMIT));
    }

    @Test
    public void testUnclosedQuoteNotOptimized() {
        // Never append '.limit(N)' inside an unterminated string literal
        String gremlin = "g.V().hasLabel('unclosed";
        Assert.assertEquals(gremlin,
                            GremlinUtil.optimizeLimit(gremlin, LIMIT));
    }

    @Test
    public void testUnsupportedGroovyLiteralsAreNotOptimized() {
        String slashy = "def x = /g.V()\\n/\ng.E()";
        Assert.assertEquals(slashy,
                            GremlinUtil.optimizeLimit(slashy, LIMIT));

        String dollarSlashy = "def x = $/g.V()/$\ng.E()";
        Assert.assertEquals(dollarSlashy,
                            GremlinUtil.optimizeLimit(dollarSlashy, LIMIT));

        String tripleQuoted = "def x = '''g.V()\ng.E()'''\ng.V()";
        Assert.assertEquals(tripleQuoted,
                            GremlinUtil.optimizeLimit(tripleQuoted, LIMIT));

        String division = "def half = 4 / 2\ng.V()";
        Assert.assertEquals(division,
                            GremlinUtil.optimizeLimit(division, LIMIT));
    }
}
