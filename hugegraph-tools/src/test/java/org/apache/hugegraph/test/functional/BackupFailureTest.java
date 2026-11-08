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

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.hugegraph.base.ToolClient;
import org.apache.hugegraph.cmd.SubCommands;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.exception.ToolsException;
import org.apache.hugegraph.manager.BackupManager;
import org.apache.hugegraph.rest.SerializeException;
import org.apache.hugegraph.structure.constant.HugeType;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.sun.net.httpserver.HttpServer;

public class BackupFailureTest {

    private static final String ERROR =
            "{\"exception\":\"java.lang.IllegalStateException\",\"message\":\"backend busy\"}";

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    private HttpServer server;
    private final AtomicInteger shardRequests = new AtomicInteger();
    private final AtomicInteger pageRequests = new AtomicInteger();
    private volatile int shardStatus;
    private volatile String shardBody;
    private volatile String pageBody;
    private volatile int schemaStatus;
    private volatile boolean successfulFirstPage;
    private boolean recordTimeout;

    @Before
    public void setup() throws Exception {
        this.shardStatus = 500;
        this.shardBody = ERROR;
        this.pageBody = ERROR;
        this.schemaStatus = 200;
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            int status = 200;
            String response;
            if (path.endsWith("/versions")) {
                response = "{\"versions\":{\"core\":\"1.8.0\",\"api\":\"0.71\"}}";
            } else if (path.endsWith("/graphs/hugegraph")) {
                String backend = this.successfulFirstPage ? "rocksdb" : "memory";
                response = "{\"name\":\"hugegraph\",\"backend\":\"" + backend + "\"}";
            } else if (path.endsWith("/vertices/shards") ||
                       path.endsWith("/edges/shards")) {
                this.shardRequests.incrementAndGet();
                status = this.shardStatus;
                response = this.shardBody;
            } else if (path.endsWith("/vertices/scan") ||
                       path.endsWith("/edges/scan")) {
                int request = this.pageRequests.incrementAndGet();
                status = 500;
                response = this.pageBody;
                if (this.successfulFirstPage && request == 1) {
                    status = 200;
                    response = "{\"vertices\":[{\"id\":1,\"label\":\"person\"," +
                               "\"properties\":{}}],\"page\":\"next\"}";
                } else if (this.successfulFirstPage && request > 3) {
                    // Keep a regression finite if the previous page is retried.
                    status = 200;
                    response = "{\"vertices\":[],\"page\":null}";
                }
            } else if (path.endsWith("/schema/propertykeys")) {
                status = this.schemaStatus;
                response = status == 200 ? "{\"propertykeys\":[]}" : ERROR;
            } else {
                status = 404;
                response = "{\"exception\":\"NotFoundException\",\"message\":\"" + path + "\"}";
            }
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, body.length);
            try (java.io.OutputStream output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        this.server.start();
    }

    @After
    public void teardown() {
        this.server.stop(0);
    }

    @Test
    public void testServerErrorOnShardsIsRetriedThenFails() throws Exception {
        BackupManager manager = this.manager(this.command(2));
        try {
            manager.backup(Collections.singletonList(HugeType.VERTEX));
            Assert.fail("Server errors on querying shards must fail backup");
        } catch (ToolsException e) {
            Assert.assertTrue(e.getMessage(),
                              e.getMessage().contains("querying shards of vertices"));
            Assert.assertTrue(e.toString(), e.getCause() instanceof ServerException);
            Assert.assertEquals(500, ((ServerException) e.getCause()).status());
            Assert.assertEquals("backend busy", e.getCause().getMessage());
        } finally {
            manager.close();
        }
        // The first request and two retries
        Assert.assertEquals(3, this.shardRequests.get());
    }

    @Test
    public void testNonJsonShardsFailsBackup() throws Exception {
        this.shardStatus = 200;
        this.shardBody = "<html>proxy page</html>";
        BackupManager manager = this.manager(this.command(1));
        try {
            manager.backup(Collections.singletonList(HugeType.VERTEX));
            Assert.fail("Non-json shards must fail backup");
        } catch (ToolsException e) {
            Assert.assertTrue(e.toString(), e.getCause() instanceof SerializeException);
        } finally {
            manager.close();
        }
        Assert.assertEquals(2, this.shardRequests.get());
    }

    @Test
    public void testVertexPageFailureFailsBackup() throws Exception {
        this.assertPageFailure(HugeType.VERTEX);
    }

    @Test
    public void testEdgePageFailureFailsBackup() throws Exception {
        this.assertPageFailure(HugeType.EDGE);
    }

    @Test
    public void testSecondVertexPageFailureFailsBackup() throws Exception {
        this.successfulFirstPage = true;
        this.assertPageFailure(HugeType.VERTEX);
    }

    @Test
    public void testFailureStillPrintsRecordedTimeoutGuidance() throws Exception {
        // Another shard's timeout diagnostics must remain visible when this page fails.
        this.recordTimeout = true;
        this.pageBody = "{\"exception\":\"java.lang.IllegalStateException\"," +
                        "\"message\":\"Too many records\"}";
        String output = this.capturePageFailure(HugeType.VERTEX);
        Assert.assertTrue(output, output.contains("Timeout occurs when backup VERTEX"));
        Assert.assertTrue(output, output.contains("--timeout"));
        Assert.assertTrue(output, output.contains("--split-size"));
    }

    @Test
    public void testEdgeLimitStillPrintsFailureGuidance() throws Exception {
        this.pageBody = "{\"exception\":\"java.lang.IllegalStateException\"," +
                        "\"message\":\"Too many records\"}";
        String output = this.capturePageFailure(HugeType.EDGE);
        Assert.assertTrue(output, output.contains("Limit exceed occurs when backup EDGE"));
    }

    @Test
    public void testPageFailureWithoutMessageFailsBackup() throws Exception {
        // The timeout and limit checks must not hide an error that has no message
        this.shardStatus = 200;
        this.shardBody = "{\"shards\":[{\"start\":\"\",\"end\":\"\",\"length\":1}]}";
        this.pageBody = "{\"exception\":\"java.lang.IllegalStateException\"}";
        SubCommands.Backup command = this.command(1);
        BackupManager manager = this.manager(command);
        try {
            manager.backup(Collections.singletonList(HugeType.VERTEX));
            Assert.fail("Data page errors must fail backup");
        } catch (ToolsException e) {
            Throwable root = e;
            while (root.getCause() != null) {
                root = root.getCause();
            }
            Assert.assertTrue(root.toString(), root instanceof ServerException);
            Assert.assertEquals(500, ((ServerException) root).status());
        } finally {
            manager.close();
        }
        // The first request and one retry
        Assert.assertEquals(2, this.pageRequests.get());
        String prefix = HugeType.VERTEX.string();
        long failedShards = Files.readAllLines(Paths.get(command.logDir(),
                                                       prefix + "_failed_shards"))
                                 .stream().filter(line -> line.startsWith("Shard{")).count();
        Assert.assertEquals(1L, failedShards);
        // Neither a timeout nor a limit-exceed shard
        Assert.assertFalse(Files.exists(Paths.get(command.logDir(), prefix + "_timeout_shards")));
        Assert.assertFalse(Files.exists(Paths.get(command.logDir(),
                                                  prefix + "_limit_exceed_shards")));
    }

    private String capturePageFailure(HugeType type) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        PrintStream previous = System.out;
        try (PrintStream capture = new PrintStream(output, false, StandardCharsets.UTF_8)) {
            System.setOut(capture);
            this.assertPageFailure(type);
        } finally {
            System.setOut(previous);
        }
        return output.toString(StandardCharsets.UTF_8);
    }

    private void assertPageFailure(HugeType type) throws Exception {
        this.shardStatus = 200;
        this.shardBody = "{\"shards\":[{\"start\":\"\",\"end\":\"\",\"length\":1}]}";
        SubCommands.Backup command = this.command(1);
        BackupManager manager = this.manager(command);
        if (this.recordTimeout) {
            Files.writeString(Paths.get(command.logDir(), type.string() + "_timeout_shards"),
                              this.shardBody);
        }
        try {
            manager.backup(Collections.singletonList(type));
            Assert.fail("Data page errors must fail backup before migration restores it");
        } catch (ToolsException e) {
            Assert.assertTrue(e.getMessage(),
                              e.getMessage().contains("asynchronous tasks"));
            Throwable root = e;
            while (root.getCause() != null) {
                root = root.getCause();
            }
            Assert.assertTrue(root.toString(), root instanceof ServerException);
            Assert.assertEquals(this.pageBody.contains("Too many records") ?
                                "Too many records" : "backend busy", root.getMessage());
        } finally {
            manager.close();
        }
        Assert.assertEquals(this.successfulFirstPage ? 3 : 2,
                            this.pageRequests.get());
        long failedShards = Files.readAllLines(Paths.get(command.logDir(),
                                                       type.string() + "_failed_shards"))
                                 .stream().filter(line -> line.startsWith("Shard{")).count();
        Assert.assertEquals("Each failed shard should have one diagnostic entry", 1L, failedShards);
    }

    @Test
    public void testServerErrorOnSchemaFailsBackup() throws Exception {
        this.schemaStatus = 503;
        BackupManager manager = this.manager(this.command(1));
        try {
            manager.backup(Collections.singletonList(HugeType.PROPERTY_KEY));
            Assert.fail("Server errors on schema must fail backup");
        } catch (ServerException e) {
            Assert.assertEquals(503, e.status());
        } finally {
            manager.close();
        }
    }

    @Test
    public void testInvalidSplitSize() throws Exception {
        SubCommands.Backup command = this.command(1);
        command.splitSize(1024 * 1024L - 1);
        this.assertInitFails(command, "Split size must >= 1M");
    }

    @Test
    public void testLabelRequiresSingleElementType() throws Exception {
        SubCommands.Backup command = this.command(1);
        command.types(Arrays.asList(HugeType.VERTEX, HugeType.EDGE));
        command.label("person");
        this.assertInitFails(command, "The label can only be set when backup type is " +
                                      "vertex or edge");

        command.types(Collections.singletonList(HugeType.PROPERTY_KEY));
        this.assertInitFails(command, "The label can only be set");
    }

    private void assertInitFails(SubCommands.Backup command, String message)
                                 throws Exception {
        BackupManager manager = new BackupManager(this.connection());
        try {
            manager.init(command);
            Assert.fail("Invalid backup command must be rejected");
        } catch (IllegalArgumentException e) {
            Assert.assertTrue(e.getMessage(), e.getMessage().contains(message));
        } finally {
            manager.shutdown("backup");
            manager.close();
        }
    }

    private BackupManager manager(SubCommands.Backup command) {
        BackupManager manager = new BackupManager(this.connection());
        manager.init(command);
        return manager;
    }

    private SubCommands.Backup command(int retry) throws Exception {
        File backup = this.temporary.newFolder();
        SubCommands.Backup command = new SubCommands.Backup();
        command.directory(backup.getAbsolutePath());
        command.logDir(this.temporary.newFolder().getAbsolutePath());
        command.threadsNum = 2;
        command.retry(retry);
        command.types(Collections.singletonList(HugeType.VERTEX));
        return command;
    }

    private ToolClient.ConnectionInfo connection() {
        String url = "http://127.0.0.1:" + this.server.getAddress().getPort();
        return new ToolClient.ConnectionInfo(url, "hugegraph", null, null, 1000,
                                             null, null);
    }
}
