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

package org.apache.hugegraph.unit;

import java.io.IOException;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.apache.hugegraph.driver.HugeClient;
import org.apache.hugegraph.exception.ServerException;
import org.apache.hugegraph.rest.SerializeException;
import org.apache.hugegraph.testutil.Assert;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * Failures at the HTTP boundary, served by a local fake server.
 * Transport failures are rethrown by the rest client as the original
 * IOException rather than wrapped in a ClientException.
 */
public class HugeClientFakeServerTest extends BaseUnitTest {

    private static final String VERSIONS =
            "{\"versions\":{\"version\":\"v1\",\"core\":\"1.8.0\"," +
            "\"gremlin\":\"3.8.1\",\"api\":\"0.72.0.0\"}}";

    private HttpServer server;
    private ExecutorService executor;
    private final CountDownLatch release = new CountDownLatch(1);
    private final List<String> paths = new CopyOnWriteArrayList<>();
    private volatile Handler versions;
    private volatile Handler others;

    @Before
    public void setup() throws IOException {
        this.versions = exchange -> reply(exchange, 200, VERSIONS);
        this.others = exchange -> reply(exchange, 200, "{}");
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            this.paths.add(path);
            if (path.endsWith("/versions")) {
                this.versions.handle(exchange);
            } else {
                this.others.handle(exchange);
            }
        });
        this.executor = Executors.newCachedThreadPool();
        this.server.setExecutor(this.executor);
        this.server.start();
    }

    @After
    public void teardown() {
        this.release.countDown();
        this.server.stop(0);
        this.executor.shutdownNow();
    }

    @Test
    public void testVersionsErrorWithHtmlBody() {
        String html = "<html><body>503 Service Unavailable</body></html>";
        this.versions = exchange -> reply(exchange, 503, html);

        ServerException e = (ServerException) Assert.assertThrows(ServerException.class,
                                                                  this::client);
        Assert.assertEquals(503, e.status());
        Assert.assertEquals(html, e.getMessage());
        Assert.assertNull(e.exception());
    }

    @Test
    public void testVersionsWithNonJsonBody() {
        this.versions = exchange -> reply(exchange, 200, "not json");

        Assert.assertThrows(SerializeException.class, this::client);
    }

    @Test
    public void testVersionsWithUnsupportedApiVersion() {
        this.versions = exchange -> reply(exchange, 200,
                                          "{\"versions\":{\"version\":\"v1\"," +
                                          "\"core\":\"0.9.0\",\"api\":\"0.20\"}}");

        Assert.assertThrows(IllegalStateException.class, this::client, e -> {
            Assert.assertContains("hugegraph-api in server", e.getMessage());
        });
    }

    @Test
    public void testVersionsConnectionDropped() {
        this.versions = HttpExchange::close;

        Assert.assertThrows(IOException.class, this::client);
    }

    @Test
    public void testServerErrorJsonOnGraphRequest() {
        this.others = exchange -> reply(exchange, 400,
                                        "{\"exception\":\"java.lang.IllegalArgumentException\"," +
                                        "\"message\":\"Invalid vertex id 'x'\"," +
                                        "\"cause\":\"\"}");

        try (HugeClient client = this.client()) {
            ServerException e = (ServerException) Assert.assertThrows(
                    ServerException.class, () -> client.graph().getVertex("x"));
            Assert.assertEquals(400, e.status());
            Assert.assertEquals("java.lang.IllegalArgumentException", e.exception());
            Assert.assertEquals("Invalid vertex id 'x'", e.getMessage());
            Assert.assertNull(e.getCause());
        }
        Assert.assertContains("/graphspaces/DEFAULT/graphs/hugegraph/graph/vertices/",
                              this.paths.get(this.paths.size() - 1));
    }

    @Test
    public void testServerErrorHtmlOnGraphRequest() {
        String html = "<html>502 Bad Gateway</html>";
        this.others = exchange -> reply(exchange, 502, html);

        try (HugeClient client = this.client()) {
            ServerException e = (ServerException) Assert.assertThrows(
                    ServerException.class, () -> client.graph().getVertex("x"));
            Assert.assertEquals(502, e.status());
            Assert.assertEquals(html, e.getMessage());
        }
    }

    @Test
    public void testNonJsonBodyOnGraphRequest() {
        this.others = exchange -> reply(exchange, 200, "<html>ok</html>");

        try (HugeClient client = this.client()) {
            Assert.assertThrows(SerializeException.class,
                                () -> client.graph().getVertex("x"));
        }
    }

    @Test
    public void testSlowGraphRequestTimesOut() {
        this.others = exchange -> {
            try {
                // Released by teardown, or after 10s at most
                this.release.await(10L, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            reply(exchange, 200, "{}");
        };

        try (HugeClient client = this.client()) {
            long start = System.currentTimeMillis();
            Assert.assertThrows(SocketTimeoutException.class,
                                () -> client.graph().getVertex("x"));
            Assert.assertTrue(System.currentTimeMillis() - start < 8000L);
        }
    }

    @Test
    public void testGraphRequestConnectionDropped() {
        this.others = HttpExchange::close;

        try (HugeClient client = this.client()) {
            Assert.assertThrows(IOException.class,
                                () -> client.graph().getVertex("x"));
        }
    }

    @Test
    public void testLegacyServerRequestsOmitDefaultGraphSpace() {
        this.versions = exchange -> reply(exchange, 200,
                                          "{\"versions\":{\"version\":\"v1\"," +
                                          "\"core\":\"1.5.0\",\"api\":\"0.71\"}}");
        this.others = exchange -> reply(exchange, 200,
                                        "{\"id\":\"1:marko\",\"label\":\"person\"," +
                                        "\"type\":\"vertex\",\"properties\":{}}");

        try (HugeClient client = this.client()) {
            Assert.assertEquals("1:marko", client.graph().getVertex("1:marko").id());
        }
        String path = this.paths.get(this.paths.size() - 1);
        Assert.assertTrue(path, path.startsWith("/graphs/hugegraph/graph/vertices/"));
    }

    @Test
    public void testServerUnreachable() {
        String url = this.url();
        this.server.stop(0);

        Assert.assertThrows(ConnectException.class, () -> {
            HugeClient.builder(url, "DEFAULT", "hugegraph").configTimeout(1).build();
        });
    }

    private HugeClient client() {
        return HugeClient.builder(this.url(), "DEFAULT", "hugegraph")
                         .configTimeout(1)
                         .build();
    }

    private String url() {
        return "http://127.0.0.1:" + this.server.getAddress().getPort();
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

    @FunctionalInterface
    private interface Handler {

        void handle(HttpExchange exchange) throws IOException;
    }
}
