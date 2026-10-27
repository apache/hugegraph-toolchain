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
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.apache.hugegraph.loader.builder.SchemaCache;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.reader.InputReader;
import org.apache.hugegraph.loader.reader.file.LocalFileReader;
import org.apache.hugegraph.loader.source.InputSource;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.util.JsonUtil;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class FileReaderTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void testConcurrentFilesWithHeaders() throws Exception {
        File dir = this.folder.newFolder();
        Set<String> expected = new HashSet<>();
        for (int i = 0; i < 8; i++) {
            List<String> lines = new ArrayList<>();
            lines.add("name");
            for (int j = 0; j < 2000; j++) {
                String line = "person-" + i + "-" + j;
                lines.add("# ignored comment for " + line);
                lines.add("");
                lines.add(line);
                expected.add(line);
            }
            Files.write(dir.toPath().resolve("person-" + i + ".csv"), lines);
        }
        this.assertConcurrentRows(this.source(dir), expected, 8);
    }

    @Test
    public void testConcurrentFilesWithEmptyFile() throws Exception {
        File dir = this.folder.newFolder();
        Files.write(dir.toPath().resolve("person-1.csv"), Arrays.asList("marko", "vadas", "josh"));
        Files.write(dir.toPath().resolve("person-2.csv"), Arrays.asList("peter", "li-nary"));
        Files.write(dir.toPath().resolve("person-3.csv"), Collections.emptyList());
        FileSource source = this.source(dir);
        source.header(new String[]{"name"});
        source.hasHeader(false);
        this.assertConcurrentRows(source, new HashSet<>(Arrays.asList("marko", "vadas", "josh", "peter", "li-nary")),
                                  3);
    }

    @Test
    public void testConcurrentFilesFilteredBySuffix() throws Exception {
        File dir = this.folder.newFolder();
        Files.write(dir.toPath().resolve("person.csv"), Arrays.asList("name", "marko", "vadas"));
        Files.write(dir.toPath().resolve("person.dat"), Arrays.asList("name", "filtered"));
        FileSource source = JsonUtil.fromJson("{\"path\":\"unused\",\"file_filter\":{\"extensions\":[\"csv\"]}}",
                                              FileSource.class);
        source.path(dir.toString());
        this.assertConcurrentRows(source, new HashSet<>(Arrays.asList("marko", "vadas")), 1);
    }

    @Test
    public void testChangedSkipPatternAfterSerialization() throws Exception {
        File dir = this.folder.newFolder();
        Files.write(dir.toPath().resolve("person.csv"),
                    Arrays.asList("name", "#keep", "ignored comment", "marko"));
        FileSource source = this.source(dir);
        Assert.assertTrue(source.skippedLine().matches("#keep"));
        source.skippedLine().regex("ignored.*");
        Assert.assertFalse(source.skippedLine().matches("#keep"));
        FileSource restored = (FileSource) JsonUtil.fromJson(JsonUtil.toJson(source), InputSource.class);
        this.assertConcurrentRows(restored, new HashSet<>(Arrays.asList("#keep", "marko")), 1);
    }

    private FileSource source(File dir) {
        FileSource source = new FileSource();
        source.path(dir.toString());
        return source;
    }

    private void assertConcurrentRows(FileSource source, Set<String> expected, int expectedFiles) throws Exception {
        InputStruct struct = new InputStruct(null, null);
        struct.id("files");
        struct.input(source);
        LoadOptions options = new LoadOptions();
        options.file = this.folder.newFile().toString();
        SchemaCache cache = new SchemaCache(Collections.emptyList(), Collections.emptyList(), Collections.emptyList());
        LoadContext context = LoadContext.forOffline(options, cache);
        List<InputReader> readers = new LocalFileReader(source).split();
        Assert.assertEquals(expectedFiles, readers.size());
        ExecutorService service = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<List<String>>> results = new ArrayList<>();
        try {
            for (InputReader reader : readers) {
                reader.init(context, struct);
                results.add(service.submit(() -> {
                    try {
                        Assert.assertTrue(start.await(10, TimeUnit.SECONDS));
                        List<String> rows = new ArrayList<>();
                        while (reader.hasNext()) {
                            rows.add(reader.next().rawLine());
                            reader.confirmOffset();
                        }
                        reader.confirmOffset();
                        context.newProgress().markLoaded(struct, reader, true);
                        return rows;
                    } finally {
                        reader.close();
                    }
                }));
            }
            start.countDown();
            List<String> actual = new ArrayList<>();
            for (Future<List<String>> result : results) {
                actual.addAll(result.get(10, TimeUnit.SECONDS));
            }
            Assert.assertEquals(expected.size(), actual.size());
            Assert.assertEquals(expected, new HashSet<>(actual));
            Assert.assertEquals(expectedFiles, context.newProgress().get(struct.id()).loadedItems().size());
            Assert.assertTrue(context.newProgress().get(struct.id()).loadingItems().isEmpty());
        } finally {
            start.countDown();
            service.shutdownNow();
            Assert.assertTrue(service.awaitTermination(10, TimeUnit.SECONDS));
            context.close();
        }
    }
}
