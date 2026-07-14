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
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
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
                Collections.singleton("http://127.0.0.1:10"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsSameAuthorityWithWrongScheme() {
        OperationsHttpClient.validateTarget(
                URI.create("https://store.internal:8520"),
                Collections.singleton("http://store.internal:8520"));
    }

    @Test
    public void testHttpsResolutionPreservesHostnameForTlsVerification()
                     throws IOException {
        URI target = URI.create(
                     "https://store.internal:9443/metrics/system");

        URI resolved = OperationsHttpClient.resolveTarget(
                       target, new InetAddress[]{
                       InetAddress.getByName("10.0.0.8")});

        Assert.assertEquals(target, resolved);
    }

    @Test
    public void testPinnedDnsReturnsOnlyPrevalidatedAddresses()
                     throws IOException {
        InetAddress pinned = InetAddress.getByName("10.0.0.8");

        java.util.List<InetAddress> resolved = OperationsHttpClient.pinnedDns(
                "store.internal", new InetAddress[]{pinned})
                .lookup("store.internal");

        Assert.assertEquals(Collections.singletonList(pinned), resolved);
        Assert.assertThrows(UnknownHostException.class, () ->
                OperationsHttpClient.pinnedDns(
                        "store.internal", new InetAddress[]{pinned})
                        .lookup("other.internal"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsMetadataAddress() {
        OperationsHttpClient.resolveTarget(
                URI.create("http://169.254.169.254/latest/meta-data"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsIpv6LinkLocalAddress() {
        OperationsHttpClient.resolveTarget(URI.create("http://[fe80::1]:8520"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsMixedSafeAndLinkLocalDnsAnswers() throws IOException {
        OperationsHttpClient.validateResolvedAddresses("store.internal",
                new InetAddress[]{
                InetAddress.getByName("127.0.0.1"),
                InetAddress.getByName("169.254.169.254")
        });
    }

    @Test(expected = IllegalArgumentException.class)
    public void testRejectsHostnameResolvingToLoopback() {
        OperationsHttpClient.resolveTarget(
                URI.create("http://localhost:8520/metrics/system"));
    }

    @Test
    public void testAllowsConfiguredPrivateHostnameResolution() throws IOException {
        OperationsHttpClient.validateResolvedAddresses("store.internal",
                new InetAddress[]{InetAddress.getByName("10.0.0.8")});
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
