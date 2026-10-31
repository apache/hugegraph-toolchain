/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
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

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.zip.GZIPInputStream;

import org.apache.hugegraph.entity.GraphConnection;
import org.apache.hugegraph.entity.enums.LoadStatus;
import org.apache.hugegraph.entity.load.FileMapping;
import org.apache.hugegraph.entity.load.LoadTask;
import org.apache.hugegraph.loader.HugeGraphLoader;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.progress.LoadProgress;
import org.apache.hugegraph.util.JsonUtil;
import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.sun.net.httpserver.HttpServer;

/** Real CSV/parser/semaphore/insert/cleanup pipeline against a controlled HTTP endpoint. */
public class LoadTaskCheckpointTest {

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test(timeout = 20000)
    public void testPauseAtBatchSemaphoreThenResumeDoesNotSkipUnsubmittedRows() throws Exception {
        try (InsertServer server = new InsertServer()) {
            server.holdFirstBatch = true;
            LoadTask task = this.task(server);
            HugeGraphLoader first = task.getLoader();
            Object manager = field(first, "manager");
            Semaphore semaphore = (Semaphore) field(manager, "batchSemaphore");
            ExecutorService runner = Executors.newSingleThreadExecutor();
            try {
                Future<?> running = runner.submit(task);
                Assert.assertTrue(server.firstBatch.await(5, TimeUnit.SECONDS));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (!semaphore.hasQueuedThreads() && System.nanoTime() < deadline) {
                    Thread.sleep(10);
                }
                Assert.assertTrue("The actual parser must wait on the native batch semaphore",
                                  semaphore.hasQueuedThreads());
                task.setStatus(LoadStatus.PAUSED);
                task.context().stopLoading();
                server.releaseBatch.countDown();
                running.get(5, TimeUnit.SECONDS);
                Assert.assertEquals(LoadStatus.PAUSED, task.getStatus());
                Assert.assertTrue(first.context().closed());
                Assert.assertTrue("The parsed waiting batch was never inserted", server.rows.size() < 10);
                this.resume(task);
                Assert.assertEquals(LoadStatus.SUCCEED, task.getStatus());
                Assert.assertEquals("Resume must include every unsubmitted row", 10, server.rows.size());
                this.assertNoCheckpoint(task, first);
                Assert.assertTrue(task.context().closed());
            } finally {
                server.releaseBatch.countDown();
                runner.shutdownNow();
                Assert.assertTrue(runner.awaitTermination(5, TimeUnit.SECONDS));
                first.shutdown();
                task.getLoader().shutdown();
            }
        }
    }

    @Test(timeout = 20000)
    public void testFailedSingleInsertThenResumeDoesNotSkipFailedRow() throws Exception {
        try (InsertServer server = new InsertServer()) {
            server.rejectName = "person2";
            LoadTask task = this.task(server);
            HugeGraphLoader first = task.getLoader();
            task.run();
            Assert.assertEquals(LoadStatus.FAILED, task.getStatus());
            Assert.assertEquals(Long.valueOf(9L), task.getConfirmedVertexWrites());
            Assert.assertEquals(Long.valueOf(0L), task.getConfirmedEdgeWrites());
            Assert.assertEquals(9, server.rows.size());
            Assert.assertFalse(server.rows.contains("person2"));
            Assert.assertTrue(first.context().closed());
            server.rejectName = null;
            this.resume(task);
            Assert.assertEquals(LoadStatus.SUCCEED, task.getStatus());
            // This is the resumed attempt, not the previous attempt plus retry.
            Assert.assertEquals(Long.valueOf(10L), task.getConfirmedVertexWrites());
            Assert.assertEquals("The failed row must be read and inserted on resume", 10, server.rows.size());
            Assert.assertTrue(server.rows.contains("person2"));
            this.assertNoCheckpoint(task, first);
            Assert.assertTrue(task.context().closed());
        }
    }

    private LoadTask task(InsertServer server) throws Exception {
        Path input = this.folder.newFile("people.csv").toPath();
        StringBuilder csv = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            csv.append("person").append(i).append('\n');
        }
        Files.writeString(input, csv);
        Path mapping = this.folder.newFile("mapping.json").toPath();
        Files.writeString(mapping, JsonUtil.toJson(Map.of("vertices", List.of(Map.of(
                "label", "person", "input", Map.of("type", "FILE", "path", input.toString(),
                "format", "CSV", "header", List.of("name"), "charset", "UTF-8"))))));
        LoadOptions options = new LoadOptions();
        options.host = "127.0.0.1";
        options.port = server.server.getAddress().getPort();
        options.file = mapping.toString();
        options.batchSize = server.holdFirstBatch ? 4 : 1;
        options.batchInsertThreads = 1;
        options.singleInsertThreads = 1;
        options.retryTimes = 0;
        GraphConnection connection = new GraphConnection();
        connection.setId(1);
        FileMapping file = new FileMapping().setId(1).setJobId(1).setName("people.csv").setTotalLines(10);
        return new LoadTask(options, connection, file);
    }

    private void resume(LoadTask task) {
        // The same native reconnect path used after LoadTaskService joins the old callback.
        task.getOptions().incrementalMode = true;
        task.reconnect("current-token");
        task.setStatus(LoadStatus.RUNNING);
        task.run();
    }

    private void assertNoCheckpoint(LoadTask task, HugeGraphLoader loader) {
        Assert.assertFalse("Hubble must not persist parsed offsets as inserted-row checkpoints",
                           Files.exists(Path.of(LoadProgress.format(task.getOptions(), loader.context().timestamp()))));
    }

    private static Object field(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }

    private static class InsertServer implements AutoCloseable {

        private final HttpServer server;
        private final ExecutorService handlers = Executors.newCachedThreadPool();
        private final Set<String> rows = ConcurrentHashMap.newKeySet();
        private final CountDownLatch firstBatch = new CountDownLatch(1);
        private final CountDownLatch releaseBatch = new CountDownLatch(1);
        private volatile boolean holdFirstBatch;
        private volatile String rejectName;
        private String mode = "NONE";

        private InsertServer() throws Exception {
            this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            this.server.setExecutor(this.handlers);
            this.server.createContext("/", exchange -> {
                Object response = Map.of();
                int status = 200;
                String path = exchange.getRequestURI().getPath();
                if (path.equals("/versions")) {
                    response = Map.of("versions", Map.of("core", "1.8.0", "api", "0.74"));
                } else if (path.endsWith("/mode/owners") && exchange.getRequestMethod().equals("GET")) {
                    // Keep this checkpoint fixture on the legacy enum-mode path.
                    status = 404;
                    response = Map.of("exception", "jakarta.ws.rs.NotFoundException",
                                      "message", "HTTP 404 Not Found");
                } else if (path.endsWith("/mode")) {
                    if (exchange.getRequestMethod().equals("PUT")) {
                        this.mode = JsonUtil.fromJson(new String(exchange.getRequestBody().readAllBytes(),
                                                               StandardCharsets.UTF_8), String.class);
                    } else {
                        response = Map.of("mode", this.mode);
                    }
                } else if (path.endsWith("/schema/propertykeys")) {
                    response = Map.of("propertykeys", List.of(Map.of("id", 1, "name", "name", "data_type", "TEXT",
                            "cardinality", "SINGLE", "aggregate_type", "NONE", "properties", List.of())));
                } else if (path.endsWith("/schema/vertexlabels")) {
                    response = Map.of("vertexlabels", List.of(Map.of("id", 1, "name", "person",
                            "id_strategy", "PRIMARY_KEY", "primary_keys", List.of("name"),
                            "properties", List.of("name"), "nullable_keys", List.of(), "enable_label_index", true)));
                } else if (path.endsWith("/schema/edgelabels")) {
                    response = Map.of("edgelabels", List.of());
                } else if (path.endsWith("/vertices/batch") || path.endsWith("/vertices")) {
                    if (path.endsWith("/batch") && this.holdFirstBatch) {
                        this.firstBatch.countDown();
                        try {
                            if (!this.releaseBatch.await(10, TimeUnit.SECONDS)) {
                                throw new IllegalStateException("Batch release deadline expired");
                            }
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(e);
                        }
                    }
                    InputStream input = exchange.getRequestBody();
                    if ("gzip".equals(exchange.getRequestHeaders().getFirst("Content-Encoding"))) {
                        input = new GZIPInputStream(input);
                    }
                    String body = new String(input.readAllBytes(), StandardCharsets.UTF_8);
                    List<?> vertices = path.endsWith("/batch") ? JsonUtil.fromJson(body, List.class) :
                                         Collections.singletonList(JsonUtil.fromJson(body, Map.class));
                    List<String> names = new ArrayList<>();
                    for (Object value : vertices) {
                        Map<?, ?> vertex = (Map<?, ?>) value;
                        names.add((String) ((Map<?, ?>) vertex.get("properties")).get("name"));
                    }
                    if (this.rejectName != null && names.contains(this.rejectName)) {
                        status = 500;
                        response = Map.of("exception", "class java.lang.IllegalStateException",
                                          "message", "controlled insert failure");
                    } else {
                        this.rows.addAll(names);
                        response = path.endsWith("/batch") ? names : Map.of("id", names.get(0), "label", "person",
                                "properties", Map.of("name", names.get(0)));
                    }
                } else {
                    status = 404;
                    response = Map.of("message", "Unsupported test endpoint " + path);
                }
                byte[] body = JsonUtil.toJson(response).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, body.length);
                try (OutputStream output = exchange.getResponseBody()) {
                    output.write(body);
                }
            });
            this.server.start();
        }

        @Override
        public void close() throws Exception {
            this.releaseBatch.countDown();
            this.server.stop(0);
            this.handlers.shutdownNow();
            Assert.assertTrue(this.handlers.awaitTermination(5, TimeUnit.SECONDS));
        }
    }
}
