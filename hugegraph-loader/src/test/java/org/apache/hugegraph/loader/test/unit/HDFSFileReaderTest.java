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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.hugegraph.loader.reader.Readable;
import org.apache.hugegraph.loader.reader.hdfs.HDFSFileReader;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.hdfs.HDFSSource;
import org.apache.hugegraph.loader.util.JsonUtil;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class HDFSFileReaderTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void testEachDirectFileIsScannedOnce() throws Exception {
        File dir = this.folder.newFolder();
        Files.writeString(dir.toPath().resolve("person-1.csv"), "name\nmarko\n");
        Files.writeString(dir.toPath().resolve("person-2.csv"), "name\nvadas\n");

        this.assertScannedFiles(dir, Set.of("person-1.csv", "person-2.csv"));
    }

    @Test
    public void testScanPreservesFileAndDirectoryFilters() throws Exception {
        File dir = this.folder.newFolder();
        Files.writeString(dir.toPath().resolve("person.csv"), "name\nmarko\n");
        Files.writeString(dir.toPath().resolve("person.dat"), "name\nfiltered\n");
        Files.writeString(dir.toPath().resolve("empty.csv"), "");
        Path nested = Files.createDirectory(dir.toPath().resolve("nested"));
        Files.writeString(nested.resolve("person.csv"), "name\nvadas\n");
        Files.writeString(nested.resolve("person.dat"), "name\nfiltered\n");
        Path excluded = Files.createDirectory(dir.toPath().resolve("excluded"));
        Files.writeString(excluded.resolve("person.csv"), "name\nfiltered\n");

        this.assertScannedFiles(dir, Set.of("person.csv", "nested/person.csv"));
    }

    private void assertScannedFiles(File dir, Set<String> expected) throws Exception {
        File coreSite = this.folder.newFile();
        Files.writeString(coreSite.toPath(), "<configuration>" +
                          "<property><name>fs.defaultFS</name><value>file:///</value></property>" +
                          "<property><name>fs.file.impl.disable.cache</name><value>true</value></property>" +
                          "</configuration>");
        String json = JsonUtil.toJson(Map.of(
                "type", "HDFS", "path", dir.toString(), "core_site_path", coreSite.toString(),
                "file_filter", Map.of("extensions", List.of("csv")),
                "dir_filter", Map.of("exclude_regex", "excluded")));
        HDFSSource source = (HDFSSource) JsonUtil.fromJson(json, InputSource.class);
        ScannableReader reader = new ScannableReader(source);
        try {
            List<Readable> files = reader.scan();
            Assert.assertEquals(expected.size(), files.size());
            Assert.assertEquals(expected, files.stream().map(Readable::name).collect(Collectors.toSet()));
        } finally {
            reader.closeFileSystem(reader.fileSystem());
        }
    }

    private static final class ScannableReader extends HDFSFileReader {

        private ScannableReader(HDFSSource source) {
            super(source);
        }

        private List<Readable> scan() throws IOException {
            return this.scanReadables();
        }
    }
}
