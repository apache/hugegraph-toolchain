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

package org.apache.hugegraph.loader.test.unit;

import org.apache.hugegraph.loader.exception.ReadException;
import org.apache.hugegraph.loader.parser.CsvLineParser;
import org.apache.hugegraph.loader.parser.JsonLineParser;
import org.apache.hugegraph.loader.parser.TextLineParser;
import org.apache.hugegraph.loader.reader.line.Line;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Test;

public class LineParserTest {

    private static final String[] HEADER = {"name", "age", "city"};

    @Test
    public void testTextLineParser() {
        TextLineParser parser = new TextLineParser("|");

        Line line = parser.parse(HEADER, "marko|29|Beijing");
        Assert.assertArrayEquals(HEADER, line.names());
        Assert.assertArrayEquals(new Object[]{"marko", "29", "Beijing"}, line.values());
        Assert.assertEquals("marko|29|Beijing", line.rawLine());

        // Empty columns are kept
        Assert.assertArrayEquals(new Object[]{"marko", "", "Beijing"},
                                 parser.parse(HEADER, "marko||Beijing").values());
    }

    @Test
    public void testTextLineParserDefaultDelimiter() {
        TextLineParser parser = new TextLineParser(null);

        Assert.assertEquals("\t", parser.delimiter());
        Assert.assertArrayEquals(new Object[]{"marko", "29", "Beijing"},
                                 parser.parse(HEADER, "marko\t29\tBeijing").values());
    }

    @Test
    public void testTextLineParserFillsMissingTailColumns() {
        TextLineParser parser = new TextLineParser(",");

        Line line = parser.parse(HEADER, "marko");
        Assert.assertArrayEquals(new Object[]{"marko", "", ""}, line.values());
    }

    @Test
    public void testTextLineParserIgnoresEmptyExtraColumns() {
        TextLineParser parser = new TextLineParser(",");

        Line line = parser.parse(HEADER, "marko,29,Beijing,,");
        Assert.assertArrayEquals(new Object[]{"marko", "29", "Beijing"}, line.values());
    }

    @Test
    public void testTextLineParserRejectsNonEmptyExtraColumns() {
        TextLineParser parser = new TextLineParser(",");

        Assert.assertThrows(ReadException.class, () -> {
            parser.parse(HEADER, "marko,29,Beijing,extra");
        }, e -> {
            Assert.assertContains("The column length '4' doesn't match with header length '3'",
                                  e.getMessage());
            Assert.assertEquals("marko,29,Beijing,extra", ((ReadException) e).line());
        });
        Assert.assertThrows(ReadException.class, () -> {
            parser.parse(HEADER, "marko,29,Beijing,extra,");
        });
    }

    @Test
    public void testCsvLineParserWithQuotes() {
        CsvLineParser parser = new CsvLineParser();

        Assert.assertEquals(",", parser.delimiter());
        Line line = parser.parse(HEADER, "\"marko, jr\",29,\"say \"\"hi\"\"\"");
        Assert.assertArrayEquals(new Object[]{"marko, jr", "29", "say \"hi\""}, line.values());

        Assert.assertArrayEquals(new Object[]{"marko", "29", ""},
                                 parser.parse(HEADER, "marko,29").values());
        Assert.assertThrows(ReadException.class, () -> {
            parser.parse(HEADER, "marko,29,Beijing,extra");
        });
    }

    @Test
    public void testCsvLineParserWithEmptyLine() {
        CsvLineParser parser = new CsvLineParser();

        Assert.assertThrows(ReadException.class, () -> {
            parser.split("");
        }, e -> {
            Assert.assertContains("Parse line '' error", e.getMessage());
        });
    }

    @Test
    public void testJsonLineParser() {
        JsonLineParser parser = new JsonLineParser();

        Line line = parser.parse(null, "{\"name\": \"marko\", \"age\": 29, \"tags\": [\"a\"]}");
        Assert.assertArrayEquals(new String[]{"name", "age", "tags"}, line.names());
        Assert.assertEquals("marko", line.values()[0]);
        Assert.assertEquals(29, line.values()[1]);

        line.retainAll(new String[]{"age"});
        Assert.assertArrayEquals(new String[]{"age"}, line.names());
        Assert.assertArrayEquals(new Object[]{29}, line.values());
    }

    @Test
    public void testJsonLineParserDoesNotSplit() {
        JsonLineParser parser = new JsonLineParser();

        Assert.assertThrows(UnsupportedOperationException.class, () -> {
            parser.split("{}");
        });
    }
}
