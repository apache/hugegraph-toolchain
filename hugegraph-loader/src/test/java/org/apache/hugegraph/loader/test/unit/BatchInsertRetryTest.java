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

import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.loader.builder.Record;
import org.apache.hugegraph.loader.executor.LoadContext;
import org.apache.hugegraph.loader.executor.LoadOptions;
import org.apache.hugegraph.loader.mapping.EdgeMapping;
import org.apache.hugegraph.loader.mapping.InputStruct;
import org.apache.hugegraph.loader.metrics.LoadMetrics;
import org.apache.hugegraph.loader.metrics.LoadSummary;
import org.apache.hugegraph.loader.progress.LoadProgress;
import org.apache.hugegraph.loader.source.file.FileSource;
import org.apache.hugegraph.loader.task.BatchInsertTask;
import org.apache.hugegraph.structure.graph.Edge;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Batch insert retries against a local fake server
 */
public class BatchInsertRetryTest {

    private static final String VERSIONS =
            "{\"versions\":{\"version\":\"v1\",\"core\":\"1.8.0\"," +
            "\"gremlin\":\"3.8.1\",\"api\":\"0.72.0.0\"}}";

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private HttpServer server;
    private HugeClient client;
    private final AtomicInteger batchRequests = new AtomicInteger();
    private final List<Handler> batchHandlers = Collections.synchronizedList(new ArrayList<>());

    @Before
    public void setup() throws IOException {
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.endsWith("/versions")) {
                reply(exchange, 200, VERSIONS);
            } else if (path.endsWith("/graph/edges/batch")) {
                int index = this.batchRequests.getAndIncrement();
                Handler handler = index < this.batchHandlers.size() ?
                                  this.batchHandlers.get(index) :
                                  e -> reply(e, 201, "[\"e1\"]");
                handler.handle(exchange);
            } else {
                reply(exchange, 404, "{\"exception\":\"NotFoundException\"," +
                                     "\"message\":\"" + path + "\"}");
            }
        });
        this.server.start();
        this.client = HugeClient.builder("http://127.0.0.1:" +
                                         this.server.getAddress().getPort(),
                                         "DEFAULT", "hugegraph")
                                .configTimeout(1)
                                .build();
    }

    @After
    public void teardown() {
        if (this.client != null) {
            this.client.close();
        }
        this.server.stop(0);
    }

    @Test
    public void testServerErrorIsRetriedUntilSuccess() throws Exception {
        this.batchHandlers.add(e -> reply(e, 500, serverError("java.lang.IllegalStateException",
                                                              "backend busy")));
        this.batchHandlers.add(e -> reply(e, 503, "<html>Service Unavailable</html>"));
        LoadContext context = this.context(3);
        InputStruct struct = edgeStruct(context);
        EdgeMapping mapping = struct.edges().get(0);

        new BatchInsertTask(context, struct, mapping, batch()).execute();

        Assert.assertEquals(3, this.batchRequests.get());
        Assert.assertEquals(1L, context.summary().metrics(struct).insertSuccess(mapping));
    }

    @Test
    public void testServerErrorFailsAfterRetries() throws Exception {
        for (int i = 0; i < 3; i++) {
            this.batchHandlers.add(e -> reply(e, 500, serverError(
                                   "java.lang.IllegalStateException", "backend busy")));
        }
        LoadContext context = this.context(2);
        InputStruct struct = edgeStruct(context);
        EdgeMapping mapping = struct.edges().get(0);

        Assert.assertThrows(ServerException.class, () -> {
            new BatchInsertTask(context, struct, mapping, batch()).execute();
        }, e -> {
            Assert.assertEquals(500, ((ServerException) e).status());
        });
        // The first request and two retries
        Assert.assertEquals(3, this.batchRequests.get());
        Assert.assertEquals(0L, context.summary().metrics(struct).insertSuccess(mapping));
    }

    @Test
    public void testIllegalArgumentIsNotRetried() throws Exception {
        this.batchHandlers.add(e -> reply(e, 400, serverError(
                               "class java.lang.IllegalArgumentException",
                               "Invalid edge label 'knows'")));
        LoadContext context = this.context(3);
        InputStruct struct = edgeStruct(context);
        EdgeMapping mapping = struct.edges().get(0);

        Assert.assertThrows(ServerException.class, () -> {
            new BatchInsertTask(context, struct, mapping, batch()).execute();
        }, e -> {
            Assert.assertEquals("Invalid edge label 'knows'", e.getMessage());
        });
        Assert.assertEquals(1, this.batchRequests.get());
    }

    @Test
    public void testUnacceptableMessageIsNotRetried() throws Exception {
        this.batchHandlers.add(e -> reply(e, 500, serverError(
                               "java.lang.IllegalStateException",
                               "The server is being shutting down")));
        LoadContext context = this.context(3);
        InputStruct struct = edgeStruct(context);
        EdgeMapping mapping = struct.edges().get(0);

        Assert.assertThrows(ServerException.class, () -> {
            new BatchInsertTask(context, struct, mapping, batch()).execute();
        });
        Assert.assertEquals(1, this.batchRequests.get());
    }

    private LoadContext context(int retryTimes) throws Exception {
        LoadOptions options = new LoadOptions();
        options.retryTimes = retryTimes;
        // No sleep between retries
        options.retryInterval = 0;
        options.file = this.folder.newFile("mapping.json").getAbsolutePath();
        LoadContext context = (LoadContext) allocateInstance(LoadContext.class);
        setField(context, "timestamp", "test");
        setField(context, "closed", false);
        setField(context, "stopReason", null);
        setField(context, "noError", true);
        setField(context, "options", options);
        setField(context, "summary", new LoadSummary());
        setField(context, "oldProgress", new LoadProgress());
        setField(context, "newProgress", new LoadProgress());
        setField(context, "loggers", new ConcurrentHashMap<>());
        setField(context, "client", this.client);
        setField(context, "indirectClient", this.client);
        setField(context, "schemaCache", null);
        setField(context, "parseGroup", null);
        return context;
    }

    private static InputStruct edgeStruct(LoadContext context) {
        EdgeMapping mapping = new EdgeMapping(Arrays.asList("s"), false,
                                              Arrays.asList("t"), false);
        mapping.label("knows");
        InputStruct struct = new InputStruct(new ArrayList<>(), new ArrayList<>());
        struct.id("1");
        struct.input(new FileSource());
        struct.add(mapping);
        context.summary().inputMetricsMap().put(struct.id(), new LoadMetrics(struct));
        return struct;
    }

    private static List<Record> batch() {
        Edge edge = new Edge("knows");
        edge.sourceLabel("person");
        edge.targetLabel("person");
        edge.sourceId("1:marko");
        edge.targetId("1:vadas");
        return Collections.singletonList(new Record("marko,vadas", edge));
    }

    private static String serverError(String exception, String message) {
        return "{\"exception\":\"" + exception + "\",\"message\":\"" + message + "\"}";
    }

    private static void reply(HttpExchange exchange, int status, String body)
                              throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private static Object allocateInstance(Class<?> type) throws Exception {
        Class<?> unsafeClass;
        try {
            unsafeClass = Class.forName("sun.misc.Unsafe");
        } catch (ClassNotFoundException e) {
            unsafeClass = Class.forName("jdk.internal.misc.Unsafe");
        }
        Field field = unsafeClass.getDeclaredField("theUnsafe");
        field.setAccessible(true);
        Object unsafe = field.get(null);
        Method method = unsafe.getClass().getMethod("allocateInstance", Class.class);
        return method.invoke(unsafe, type);
    }

    private static void setField(Object target, String name, Object value)
                                 throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    @FunctionalInterface
    private interface Handler {

        void handle(HttpExchange exchange) throws IOException;
    }
}
