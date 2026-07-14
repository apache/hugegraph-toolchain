/*
 *
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

package org.apache.hugegraph.service.op;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;

import com.sun.net.httpserver.HttpServer;
import org.junit.Test;

import org.apache.hugegraph.testutil.Assert;

public class OperationsHttpClientTest {

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsNonHttpTarget() {
        OperationsHttpClient.validateTarget(URI.create("file:///etc/passwd"),
                                             Collections.emptySet());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsTargetOutsideDiscoverySet() {
        OperationsHttpClient.validateTarget(URI.create("http://127.0.0.1:9"),
                Collections.singleton("127.0.0.1:10"));
    }

    @Test(expected = UpstreamRequestException.class)
    public void testDoesNotFollowRedirects() throws IOException {
        HttpServer server = server(302, "redirect", "/elsewhere", null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            client.get(uri(server, "/"), null, null);
        } finally {
            server.stop(0);
        }
    }

    @Test(expected = UpstreamResponseTooLargeException.class)
    public void testCapsResponseBody() throws IOException {
        HttpServer server = server(200, "0123456789", null, null);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 8);
        try {
            client.get(uri(server, "/"), null, null);
        } finally {
            server.stop(0);
        }
    }

    @Test
    public void testSendsBasicIdentityWithoutReturningIt() throws IOException {
        AtomicReference<String> authorization = new AtomicReference<>();
        HttpServer server = server(200, "ok", null, authorization);
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        String response;
        try {
            response = client.get(uri(server, "/"), "hubble", "s3cret");
        } finally {
            server.stop(0);
        }

        Assert.assertEquals("ok", response);
        Assert.assertTrue(authorization.get().startsWith("Basic "));
        Assert.assertFalse(response.contains("s3cret"));
    }

    @Test
    public void testSupportsExplicitPrometheusAcceptType() throws IOException {
        AtomicReference<String> accept = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            accept.set(exchange.getRequestHeaders().getFirst("Accept"));
            byte[] bytes = "metric 1".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(1000, 1000, 64);
        try {
            client.get(uri(server, "/"), "hubble", "secret",
                       Collections.emptySet(), "text/plain");
        } finally {
            server.stop(0);
        }

        Assert.assertEquals("text/plain", accept.get());
    }

    @Test
    public void testClassifiesReadTimeout() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            try {
                Thread.sleep(500L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            exchange.close();
        });
        server.start();
        OperationsHttpClient client = new OperationsHttpClient(1000, 50, 64);
        try {
            UpstreamRequestException error = (UpstreamRequestException)
                    Assert.assertThrows(UpstreamRequestException.class, () ->
                            client.get(uri(server, "/"), null, null));
            Assert.assertEquals("upstream_timeout", error.getMessage());
        } finally {
            server.stop(0);
        }
    }

    private static HttpServer server(int status, String body, String location,
                                     AtomicReference<String> authorization)
                                     throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/", exchange -> {
            if (authorization != null) {
                authorization.set(exchange.getRequestHeaders()
                                          .getFirst("Authorization"));
            }
            if (location != null) {
                exchange.getResponseHeaders().set("Location", location);
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        return server;
    }

    private static URI uri(HttpServer server, String path) {
        return URI.create("http://127.0.0.1:" +
                          server.getAddress().getPort() + path);
    }
}
