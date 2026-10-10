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

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.exception.ExceptionUtils;
import org.apache.hugegraph.loader.exception.LoadException;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.mapping.LoadMapping;
import org.apache.hugegraph.loader.source.SourceType;
import org.apache.hugegraph.loader.source.file.FileFormat;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.source.jdbc.JDBCSource;
import org.apache.hugegraph.loader.source.jdbc.JDBCVendor;
import org.apache.hugegraph.rest.SerializeException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class LoadMappingTest {

    private static final String FILE_INPUT =
            "{\"type\": \"file\", \"path\": \"/tmp/vertex_person.csv\", " +
            "\"format\": \"CSV\", \"charset\": \"UTF-8\"}";
    private static final String VERTICES =
            "[{\"label\": \"person\", \"field_mapping\": {\"name\": \"name\"}}]";

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testParseV2Mapping() throws IOException {
        LoadMapping mapping = LoadMapping.of(this.write(mapping(struct("1", FILE_INPUT,
                                                                       VERTICES))));

        Assert.assertEquals(1, mapping.structs().size());
        InputStruct struct = mapping.structs().get(0);
        Assert.assertEquals("1", struct.id());
        Assert.assertEquals(SourceType.FILE, struct.input().type());
        FileSource source = (FileSource) struct.input();
        Assert.assertEquals("/tmp/vertex_person.csv", source.path());
        Assert.assertEquals(FileFormat.CSV, source.format());
        Assert.assertEquals(1, struct.vertices().size());
        Assert.assertEquals("person", struct.vertices().get(0).label());
        Assert.assertTrue(struct.edges().isEmpty());
    }

    @Test
    public void testParseJdbcVendorIgnoresCase() throws IOException {
        String input = "{\"type\": \"jdbc\", \"vendor\": \"mysql\", " +
                       "\"url\": \"jdbc:mysql://127.0.0.1:3306\", \"database\": \"load\", " +
                       "\"table\": \"person\", \"username\": \"root\", \"password\": \"\"}";

        LoadMapping mapping = LoadMapping.of(this.write(mapping(struct("1", input,
                                                                       VERTICES))));

        JDBCSource source = (JDBCSource) mapping.structs().get(0).input();
        Assert.assertEquals(JDBCVendor.MYSQL, source.vendor());
    }

    @Test
    public void testMissingMappingFile() {
        String path = new File(this.temporary.getRoot(), "absent.json").getPath();

        Assert.assertThrows(LoadException.class, () -> LoadMapping.of(path), e -> {
            Assert.assertContains("Failed to read mapping mapping file", e.getMessage());
        });
    }

    @Test
    public void testMalformedMappingFile() throws IOException {
        String path = this.write("{\"version\": \"2.0\", \"structs\": [");

        Assert.assertThrows(LoadException.class, () -> LoadMapping.of(path));
    }

    @Test
    public void testUnsupportedVersion() throws IOException {
        String path = this.write("{\"version\": \"3.0\", \"structs\": []}");

        Assert.assertThrows(LoadException.class, () -> LoadMapping.of(path), e -> {
            Assert.assertContains("Failed to parse mapping mapping file", e.getMessage());
            Assert.assertContains("Invalid version '3.0'", e.getCause().getMessage());
        });

        String numeric = this.write("{\"version\": 2.0, \"structs\": []}");
        Assert.assertThrows(LoadException.class, () -> LoadMapping.of(numeric), e -> {
            Assert.assertContains("The version value must be String class",
                                  e.getCause().getMessage());
        });
    }

    @Test
    public void testInputWithoutType() throws IOException {
        String input = "{\"path\": \"/tmp/vertex_person.csv\", \"format\": \"CSV\"}";
        String path = this.write(mapping(struct("1", input, VERTICES)));

        // Deserializer errors aren't wrapped with the mapping file path
        Assert.assertThrows(SerializeException.class, () -> LoadMapping.of(path), e -> {
            Assert.assertContains("Invalid json, expect 'type'",
                                  ExceptionUtils.getRootCause(e).getMessage());
        });
    }

    @Test
    public void testUnsupportedInputType() throws IOException {
        String input = "{\"type\": \"ftp\", \"path\": \"/tmp/vertex_person.csv\"}";
        String path = this.write(mapping(struct("1", input, VERTICES)));

        Assert.assertThrows(SerializeException.class, () -> LoadMapping.of(path), e -> {
            Assert.assertContains("No enum constant",
                                  ExceptionUtils.getRootCause(e).getMessage());
            Assert.assertContains("FTP", ExceptionUtils.getRootCause(e).getMessage());
        });
    }

    @Test
    public void testInvalidStructs() throws IOException {
        String empty = this.write("{\"version\": \"2.0\", \"structs\": []}");
        this.assertInvalid(empty, "The structs can't be null or empty");

        String duplicated = this.write(mapping(struct("1", FILE_INPUT, VERTICES) + "," +
                                               struct("1", FILE_INPUT, VERTICES)));
        this.assertInvalid(duplicated, "The structs cannot contain the same id mapping");

        String noElements = this.write(mapping(struct("1", FILE_INPUT, "[]")));
        this.assertInvalid(noElements, "The mapping.vertices and mapping.edges can't be " +
                                       "empty at same time");

        String noId = this.write(mapping(struct("", FILE_INPUT, VERTICES)));
        this.assertInvalid(noId, "The mapping.id can't be null or empty");
    }

    private void assertInvalid(String path, String message) {
        Assert.assertThrows(LoadException.class, () -> LoadMapping.of(path), e -> {
            Assert.assertContains("Invalid mapping file", e.getMessage());
            Assert.assertContains(message, e.getCause().getMessage());
        });
    }

    private String write(String json) throws IOException {
        File file = this.temporary.newFile();
        FileUtils.writeStringToFile(file, json, StandardCharsets.UTF_8);
        return file.getPath();
    }

    private static String mapping(String structs) {
        return "{\"version\": \"2.0\", \"structs\": [" + structs + "]}";
    }

    private static String struct(String id, String input, String vertices) {
        return "{\"id\": \"" + id + "\", \"input\": " + input + ", " +
               "\"vertices\": " + vertices + "}";
    }
}
