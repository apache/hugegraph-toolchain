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

package org.apache.hugegraph.test.functional;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.IOUtils;
import org.apache.hugegraph.base.LocalDirectory;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.google.common.collect.ImmutableList;

public class LocalDirectoryTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testPlainAndCompressedBackupStreams() throws Exception {
        LocalDirectory directory = this.directory();
        byte[] expected = "{\"vertices\": [{\"name\": \"李四\"}]}"
                          .getBytes(StandardCharsets.UTF_8);
        for (boolean compress : new boolean[]{false, true}) {
            try (OutputStream out = directory.outputStream("vertices", compress, true)) {
                out.write(expected);
            }
            try (InputStream in = directory.inputStream("vertices" + directory.suffix(compress))) {
                Assert.assertArrayEquals(expected, IOUtils.toByteArray(in));
            }
        }
        Assert.assertEquals(ImmutableList.of("vertices", "vertices.zip"),
                            ImmutableList.sortedCopyOf(directory.files()));
    }

    @Test
    public void testPlainOutputAppendsWithoutOverride() throws Exception {
        LocalDirectory directory = this.directory();
        try (OutputStream out = directory.outputStream("edges", false, true)) {
            out.write("a".getBytes(StandardCharsets.UTF_8));
        }
        try (OutputStream out = directory.outputStream("edges", false, false)) {
            out.write("b".getBytes(StandardCharsets.UTF_8));
        }
        try (InputStream in = directory.inputStream("edges")) {
            Assert.assertEquals("ab", IOUtils.toString(in, StandardCharsets.UTF_8));
        }
        try (OutputStream out = directory.outputStream("edges", false, true)) {
            out.write("c".getBytes(StandardCharsets.UTF_8));
        }
        try (InputStream in = directory.inputStream("edges")) {
            Assert.assertEquals("c", IOUtils.toString(in, StandardCharsets.UTF_8));
        }
    }

    @Test
    public void testInvalidCompressedBackup() throws Exception {
        LocalDirectory directory = this.directory();
        File broken = new File(directory.directory(), "broken.zip");
        Files.write(broken.toPath(), "invalid zip".getBytes(StandardCharsets.UTF_8));

        Assert.assertThrows(ClientException.class, () -> directory.inputStream("broken.zip"),
                            e -> Assert.assertContains("Failed to read from local file",
                                                       e.getMessage()));
    }

    @Test
    public void testEmptyCompressedBackup() throws Exception {
        LocalDirectory directory = this.directory();
        File empty = new File(directory.directory(), "empty.zip");
        try (ZipOutputStream ignored = new ZipOutputStream(new FileOutputStream(empty))) {
            // A valid zip archive without any entry
        }

        Assert.assertThrows(ClientException.class, () -> directory.inputStream("empty.zip"));
    }

    @Test
    public void testMissingBackupFile() throws Exception {
        LocalDirectory directory = this.directory();

        Assert.assertThrows(ClientException.class, () -> directory.inputStream("missing"));
        Assert.assertThrows(ClientException.class, () -> directory.inputStream("missing.zip"));
    }

    @Test
    public void testOutputToMissingDirectory() throws Exception {
        File parent = this.temporary.newFolder();
        LocalDirectory directory = new LocalDirectory(new File(parent, "absent").getPath());

        Assert.assertThrows(ClientException.class,
                            () -> directory.outputStream("vertices", true, true),
                            e -> Assert.assertContains("Failed to write to local file",
                                                       e.getMessage()));
    }

    @Test
    public void testFilesListsOnlyRegularFiles() throws Exception {
        LocalDirectory directory = this.directory();
        Files.write(new File(directory.directory(), "vertices").toPath(), new byte[0]);
        Assert.assertTrue(new File(directory.directory(), "nested").mkdir());

        Assert.assertEquals(ImmutableList.of("vertices"), directory.files());

        LocalDirectory missing = new LocalDirectory(
                new File(directory.directory(), "absent").getPath());
        Assert.assertEquals(ImmutableList.of(), missing.files());
    }

    @Test
    public void testEnsureDirectoryExist() throws Exception {
        File parent = this.temporary.newFolder();
        File target = new File(parent, "a/b");
        LocalDirectory directory = new LocalDirectory(target.getPath());

        Assert.assertThrows(IllegalStateException.class,
                            () -> directory.ensureDirectoryExist(false),
                            e -> Assert.assertContains("The directory does not exist",
                                                       e.getMessage()));
        Assert.assertFalse(target.exists());

        directory.ensureDirectoryExist(true);
        Assert.assertTrue(target.isDirectory());
        // Existing directory is accepted in both modes
        directory.ensureDirectoryExist(false);
        directory.ensureDirectoryExist(true);
    }

    @Test
    public void testEnsureDirectoryExistWithSameNameFile() throws Exception {
        File file = this.temporary.newFile("conflict");
        LocalDirectory directory = new LocalDirectory(file.getPath());

        Assert.assertThrows(IllegalStateException.class,
                            () -> directory.ensureDirectoryExist(true),
                            e -> Assert.assertContains("a file with same name exists",
                                                       e.getMessage()));
        Assert.assertTrue(file.isFile());
    }

    @Test
    public void testRemoveDirectory() throws Exception {
        LocalDirectory directory = this.directory();
        Files.write(new File(directory.directory(), "vertices").toPath(), new byte[1]);

        directory.removeDirectory();
        Assert.assertFalse(new File(directory.directory()).exists());

        Assert.assertThrows(IllegalStateException.class, directory::removeDirectory,
                            e -> Assert.assertContains("The directory does not exist",
                                                       e.getMessage()));
    }

    @Test
    public void testConstructDir() {
        Assert.assertEquals("./hugegraph",
                            LocalDirectory.constructDir(null, "hugegraph").directory());
        Assert.assertEquals("./hugegraph",
                            LocalDirectory.constructDir("", "hugegraph").directory());
        Assert.assertEquals("/backup",
                            LocalDirectory.constructDir("/backup", "hugegraph").directory());
        Assert.assertThrows(IllegalArgumentException.class, () -> new LocalDirectory(""));
        Assert.assertThrows(IllegalArgumentException.class, () -> new LocalDirectory(null));
    }

    private LocalDirectory directory() throws Exception {
        return new LocalDirectory(this.temporary.newFolder().getPath());
    }
}
