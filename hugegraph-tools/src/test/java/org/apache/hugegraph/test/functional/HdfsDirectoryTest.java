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

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

import org.apache.commons.io.IOUtils;
import org.apache.hugegraph.base.HdfsDirectory;
import org.apache.hugegraph.rest.ClientException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class HdfsDirectoryTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testPlainAndCompressedBackupStreams() throws Exception {
        HdfsDirectory directory = this.directory();
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
    }

    @Test
    public void testInvalidCompressedBackup() throws Exception {
        HdfsDirectory directory = this.directory();
        try (OutputStream out = directory.outputStream("broken.zip", false, true)) {
            out.write("invalid zip".getBytes(StandardCharsets.UTF_8));
        }
        Assert.assertThrows(ClientException.class, () -> directory.inputStream("broken.zip"));
    }

    private HdfsDirectory directory() throws Exception {
        // Exercise Hadoop's actual stream implementations without a remote server.
        return new HdfsDirectory(this.temporary.newFolder().toURI().toString(),
                                 Collections.singletonMap("fs.default.name", "file:///"));
    }
}
