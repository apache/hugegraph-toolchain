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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

import org.apache.hugegraph.base.Directory;
import org.apache.hugegraph.base.HdfsDirectory;
import org.apache.hugegraph.cmd.HugeGraphCommand;
import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.driver.SchemaManager;
import org.apache.hugegraph.structure.constant.GraphMode;
import org.apache.hugegraph.structure.constant.T;
import org.apache.hugegraph.structure.graph.Vertex;
import org.junit.Assert;
import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class BackupRestoreTest extends AuthTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    @Test
    public void testCompressedBackupRestore() throws Exception {
        this.backupRestore(true);
    }

    @Test
    public void testUncompressedBackupRestore() throws Exception {
        // Preserve the plain JSON backup format used by older Tools releases.
        this.backupRestore(false);
    }

    private void backupRestore(boolean compress) throws Exception {
        requireDisposableInstance(System.getProperty("tools.test.disposable"));
        String hdfs = System.getProperty("tools.test.hdfs", "file:///");
        String path = "file:///".equals(hdfs) ? this.temporary.newFolder("backup").toURI().toString() :
                      hdfs + "/tools-backup-" + UUID.randomUUID();
        Directory backup = new HdfsDirectory(path, Collections.singletonMap("fs.default.name", hdfs));
        try (HugeClient client = HugeClient.builder(URL, GRAPH)
                                           .configUser(USER_NAME, USER_PASSWORD)
                                           .build();
             AutoCloseable removeBackup = backup::removeDirectory) {
            backup.ensureDirectoryExist(true);
            try (AutoCloseable clearGraph = () ->
                         client.graphs().clearGraph(GRAPH, "I'm sure to delete all data");
                 AutoCloseable resetMode = () -> client.graphs().mode(GRAPH, GraphMode.NONE)) {
                File logs = this.temporary.newFolder("logs");
                client.graphs().clearGraph(GRAPH, "I'm sure to delete all data");
                SchemaManager schema = client.schema();
                schema.propertyKey("name").asText().create();
                schema.vertexLabel("person").properties("name")
                      .primaryKeys("name").create();
                schema.edgeLabel("knows").sourceLabel("person")
                      .targetLabel("person").create();
                Vertex first = client.graph().addVertex(T.LABEL, "person", "name", "Alice");
                Vertex second = client.graph().addVertex(T.LABEL, "person", "name", "李四");
                first.addEdge("knows", second);
                Assert.assertEquals("李四", client.graph().getVertex(second.id()).property("name"));

                this.command("backup", path, logs, "--compress", String.valueOf(compress));
                assertBackupFiles(backup, compress);
                client.graphs().clearGraph(GRAPH, "I'm sure to delete all data");
                Assert.assertTrue(client.graph().listVertices().isEmpty());
                client.graphs().mode(GRAPH, GraphMode.RESTORING);
                this.command("restore", path, logs);
                client.graphs().mode(GRAPH, GraphMode.NONE);

                Assert.assertEquals(1, client.schema().getPropertyKeys().size());
                Assert.assertEquals(1, client.schema().getVertexLabels().size());
                Assert.assertEquals(1, client.schema().getEdgeLabels().size());
                Assert.assertEquals(2, client.graph().listVertices().size());
                Assert.assertEquals(1, client.graph().listEdges().size());
                Assert.assertEquals("Alice", client.graph().getVertex(first.id()).property("name"));
                Assert.assertEquals("李四", client.graph().getVertex(second.id()).property("name"));
                assertBackupFiles(backup, compress);
            }
        }
    }

    static void requireDisposableInstance(String disposable) {
        Assume.assumeTrue("BackupRestoreTest clears hugegraph; set tools.test.disposable=true only " +
                          "for a disposable server instance", "true".equals(disposable));
    }

    private static void assertBackupFiles(Directory backup, boolean compress) {
        List<String> files = backup.files();
        // Hadoop's local filesystem can also produce checksum sidecars.
        files.removeIf(file -> file.startsWith(".") && file.endsWith(".crc"));
        Assert.assertFalse(files.isEmpty());
        for (String file : files) {
            Assert.assertEquals(file, compress, file.endsWith(".zip"));
        }
    }

    private void command(String operation, String backup, File logs, String... extra) {
        List<String> args = new ArrayList<>(Arrays.asList(
                "--throw-mode", "true", "--url", URL, "--graph", GRAPH,
                "--user", USER_NAME, "--password", USER_PASSWORD, operation,
                "--directory", backup, "--log", logs.getAbsolutePath(),
                "--thread-num", "2"));
        args.add("-Dfs.default.name=" + System.getProperty("tools.test.hdfs", "file:///"));
        args.addAll(Arrays.asList(extra));
        HugeGraphCommand.main(args.toArray(new String[0]));
    }
}
